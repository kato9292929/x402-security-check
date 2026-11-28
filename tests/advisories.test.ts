import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readData, type AdvisoryData } from "../server/src/data.js";
import { checkSdkAdvisories, scanLockfile } from "../server/src/tools/advisories.js";
import { compareVersions } from "../server/src/version-compare.js";

const data = readData<AdvisoryData>("advisories.json");
const names = data.sdk_packages;

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "x402sc-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
}

const npmLock = (svm: string) =>
  JSON.stringify(
    {
      name: "seller",
      lockfileVersion: 3,
      packages: {
        "": { name: "seller", dependencies: { "@x402/next": "^2.5.0", "@x402/svm": "^2.5.0" } },
        "node_modules/@x402/next": { version: "2.5.0", resolved: "https://registry.npmjs.org/@x402/next/-/next-2.5.0.tgz" },
        "node_modules/@x402/svm": { version: svm, resolved: `https://registry.npmjs.org/@x402/svm/-/svm-${svm}.tgz` },
        "node_modules/x402-helper": { version: "0.0.1" },
      },
    },
    null,
    2,
  );

describe("check_sdk_advisories", () => {
  it("npm: reports @x402/svm below 2.6.0 with the lockfile line", () => {
    const dir = repo({ "package-lock.json": npmLock("2.5.1"), "node_modules/@x402/svm/package-lock.json": npmLock("1.0.0") });
    const r = checkSdkAdvisories(dir, data);
    expect(r.lockfiles).toEqual(["package-lock.json"]);
    expect(r.packages.map((p) => `${p.package}@${p.version}`)).toEqual(["@x402/next@2.5.0", "@x402/svm@2.5.1"]);
    expect(r.vulnerable).toHaveLength(1);
    const v = r.vulnerable[0];
    expect(v).toMatchObject({ advisory: "GHSA-qr2g-p6q7-w82m", package: "@x402/svm", version: "2.5.1", fixed: "2.6.0", file: "package-lock.json" });
    expect(v.text).toBe('"version": "2.5.1",');
    expect(npmLock("2.5.1").split("\n")[v.line - 1].trim()).toBe(v.text);
  });

  it("npm: the fixed version and later are not reported", () => {
    expect(checkSdkAdvisories(repo({ "package-lock.json": npmLock("2.6.0") }), data).vulnerable).toEqual([]);
    expect(checkSdkAdvisories(repo({ "package-lock.json": npmLock("2.28.0") }), data).vulnerable).toEqual([]);
  });

  it("npm: entries written on one line", () => {
    const lock = ['{', '  "packages": {', '    "node_modules/@x402/svm": { "version": "2.5.0" },', '    "node_modules/@x402/evm": { "version": "2.5.0" }', "  }", "}"].join("\n");
    const r = checkSdkAdvisories(repo({ "package-lock.json": lock }), data);
    expect(r.packages.map((p) => `${p.line} ${p.package}@${p.version}`)).toEqual(["3 @x402/svm@2.5.0", "4 @x402/evm@2.5.0"]);
    expect(r.vulnerable.map((v) => v.package)).toEqual(["@x402/svm"]);
  });

  it("pnpm and yarn lockfiles", () => {
    const pnpm = ["lockfileVersion: '9.0'", "", "packages:", "", "  '@x402/svm@2.4.0':", "    resolution: {integrity: sha512-x}", "", "snapshots:", "", "  '@x402/svm@2.4.0(typescript@5.9.3)':", "    dependencies: {}"].join("\n");
    const yarn = ['"@x402/svm@^2.3.0", "@x402/svm@^2.3.1":', '  version "2.3.1"', '  resolved "https://registry.yarnpkg.com/@x402/svm/-/svm-2.3.1.tgz"', "", '"@x402/core@npm:^2.7.0":', "  version: 2.7.0", ""].join("\n");
    const r = checkSdkAdvisories(repo({ "web/pnpm-lock.yaml": pnpm, "api/yarn.lock": yarn }), data);
    expect(r.packages.map((p) => `${p.file}:${p.line} ${p.package}@${p.version}`)).toEqual([
      "api/yarn.lock:2 @x402/svm@2.3.1",
      "api/yarn.lock:6 @x402/core@2.7.0",
      "web/pnpm-lock.yaml:5 @x402/svm@2.4.0",
    ]);
    expect(r.vulnerable.map((v) => v.version)).toEqual(["2.3.1", "2.4.0"]);
  });

  it("pip: requirements.txt, poetry.lock, uv.lock and Pipfile.lock", () => {
    const r = checkSdkAdvisories(
      repo({
        "requirements.txt": "fastapi==0.115.0\nx402[fastapi]==2.2.1 ; python_version>='3.10'\n",
        "a/poetry.lock": '[[package]]\nname = "x402"\nversion = "2.3.0"\ndescription = ""\n',
        "b/uv.lock": '[[package]]\nname = "X402"\nversion = "2.0.0"\nsource = { registry = "https://pypi.org/simple" }\n',
        "c/Pipfile.lock": JSON.stringify({ default: { x402: { hashes: [], version: "==1.9.0" } } }, null, 4),
      }),
      data,
    );
    expect(r.packages.map((p) => `${p.file} ${p.version}`)).toEqual(["a/poetry.lock 2.3.0", "b/uv.lock 2.0.0", "c/Pipfile.lock 1.9.0", "requirements.txt 2.2.1"]);
    expect(r.vulnerable.map((v) => `${v.file}:${v.line}`)).toEqual(["b/uv.lock:3", "c/Pipfile.lock:5", "requirements.txt:2"]);
  });

  it("go.sum, including /vN module paths and +incompatible", () => {
    const sum = [
      "github.com/coinbase/x402/go v0.0.0-20250101000000-abcdef123456 h1:aaa=",
      "github.com/coinbase/x402/go/v2 v2.4.0 h1:bbb=",
      "github.com/coinbase/x402/go/v2 v2.4.0/go.mod h1:ccc=",
      "github.com/coinbase/x402/go v2.5.0+incompatible h1:ddd=",
      "github.com/other/x402/go v1.0.0 h1:eee=",
    ].join("\n");
    const r = checkSdkAdvisories(repo({ "go.sum": sum }), data);
    expect(r.packages.map((p) => `${p.line} ${p.version}`)).toEqual(["1 0.0.0-20250101000000-abcdef123456", "2 2.4.0", "4 2.5.0"]);
    expect(r.vulnerable.map((v) => v.version)).toEqual(["0.0.0-20250101000000-abcdef123456", "2.4.0"]);
  });

  it("says so when there is no lockfile", () => {
    const r = checkSdkAdvisories(repo({ "package.json": "{}" }), data);
    expect(r.lockfiles).toEqual([]);
    expect(r.note).toMatch(/No lockfile/);
  });

  it("ignores unrelated packages with similar names", () => {
    expect(scanLockfile("requirements.txt", "x402-tools==0.1\nx4020==1.0\n", names)).toEqual([]);
  });
});

describe("compareVersions", () => {
  it("orders releases, pre-releases and v-prefixes", () => {
    expect(compareVersions("2.5.1", "2.6.0")).toBe(-1);
    expect(compareVersions("v2.6.0", "2.6.0")).toBe(0);
    expect(compareVersions("2.6.0-beta.1", "2.6.0")).toBe(-1);
    expect(compareVersions("2.3.0rc1", "2.3.0")).toBe(-1);
    expect(compareVersions("2.10.0", "2.9.9")).toBe(1);
    expect(compareVersions("2.6", "2.6.0")).toBe(0);
  });
});

describe("data/advisories.json", () => {
  it("has GHSA-qr2g-p6q7-w82m with the fixed versions", () => {
    const a = data.advisories.find((x) => x.id === "GHSA-qr2g-p6q7-w82m")!;
    expect(a.affected).toEqual(
      expect.arrayContaining([
        { ecosystem: "npm", package: "@x402/svm", fixed: "2.6.0" },
        { ecosystem: "pip", package: "x402", fixed: "2.3.0" },
        { ecosystem: "go", package: "github.com/coinbase/x402/go", fixed: "2.5.0" },
      ]),
    );
    for (const adv of data.advisories) for (const p of adv.affected) expect(names[p.ecosystem]).toContain(p.package);
  });
});
