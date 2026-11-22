import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { startMock } from "./helpers.js";
import { readData, type AdvisoryData } from "../server/src/data.js";
import { mergeAdvisories, type GhAdvisory } from "../scripts/update-advisories.js";

const data = readData<AdvisoryData>("advisories.json");

const gh = (over: Partial<GhAdvisory>): GhAdvisory => ({
  ghsa_id: "GHSA-aaaa-bbbb-cccc",
  summary: "test",
  severity: "medium",
  html_url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  published_at: "2026-10-01T00:00:00Z",
  vulnerabilities: [
    { package: { ecosystem: "npm", name: "@x402/evm" }, vulnerable_version_range: ">= 2.0.0, < 2.9.1", first_patched_version: "2.9.1" },
    { package: { ecosystem: "npm", name: "left-pad" }, vulnerable_version_range: "< 1.0.0", first_patched_version: "1.0.0" },
  ],
  ...over,
});

describe("update-advisories merge", () => {
  it("adds new x402 advisories and keeps hand-edited entries", () => {
    const fetched = [gh({}), gh({ ghsa_id: "GHSA-qr2g-p6q7-w82m", summary: "from API" })];
    const { data: merged, added } = mergeAdvisories(data, fetched, "2026-11-21");
    expect(added).toEqual(["GHSA-aaaa-bbbb-cccc"]);
    expect(mergeAdvisories(data, fetched, "2026-11-21").entries.map((e) => e.id)).toEqual(added);
    expect(merged.updated).toBe("2026-11-21");
    expect(merged.advisories.find((a) => a.id === "GHSA-qr2g-p6q7-w82m")).toEqual(data.advisories.find((a) => a.id === "GHSA-qr2g-p6q7-w82m"));
    expect(merged.advisories.at(-1)!.affected).toEqual([{ ecosystem: "npm", package: "@x402/evm", fixed: "2.9.1", introduced: "2.0.0" }]);
  });

  it("skips withdrawn advisories, packages outside the SDK list and the old first_patched_version shape", () => {
    expect(mergeAdvisories(data, [gh({ withdrawn_at: "2026-10-02T00:00:00Z" })], "x").added).toEqual([]);
    expect(
      mergeAdvisories(data, [gh({ vulnerabilities: [{ package: { ecosystem: "npm", name: "left-pad" }, first_patched_version: "1.0.0" }] })], "x").added,
    ).toEqual([]);
    const old = gh({ vulnerabilities: [{ package: { ecosystem: "pip", name: "x402" }, vulnerable_version_range: "< 2.4.0", first_patched_version: { identifier: "2.4.0" } }] });
    expect(mergeAdvisories(data, [old], "x").data.advisories.at(-1)!.affected).toEqual([{ ecosystem: "pip", package: "x402", fixed: "2.4.0" }]);
  });
});

describe("update-advisories --dry-run --json (what the Advisories workflow runs)", () => {
  it("queries one URL per ecosystem, writes only the new entries, and leaves data/advisories.json alone", async () => {
    const before = readFileSync(new URL("../data/advisories.json", import.meta.url), "utf8");
    const api = await startMock((req, _b, res) => {
      const q = new URL(req.url ?? "", "http://x").searchParams;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(q.get("ecosystem") === "npm" ? [gh({}), gh({ ghsa_id: "GHSA-qr2g-p6q7-w82m" })] : []));
    });
    const out = join(mkdtempSync(join(tmpdir(), "x402sc-")), "new.json");
    try {
      const tsx = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
      const script = new URL("../scripts/update-advisories.ts", import.meta.url).pathname;
      const env = { ...process.env, X402SC_ADVISORIES_API: `${api.url}/advisories`, GITHUB_TOKEN: "" };
      const { stdout } = await promisify(execFile)(tsx, [script, "--dry-run", "--json", out], { env });
      expect(stdout).toContain("new: GHSA-aaaa-bbbb-cccc");
      const j = JSON.parse(readFileSync(out, "utf8"));
      expect(j.added.map((a: any) => a.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
      expect(api.requests.map((r) => new URL(r.path, "http://x").searchParams.get("ecosystem"))).toEqual(["npm", "pip", "go"]);
      expect(new URL(api.requests[0].path, "http://x").searchParams.get("affects")).toContain("@x402/svm");
    } finally {
      await api.close();
    }
    expect(readFileSync(new URL("../data/advisories.json", import.meta.url), "utf8")).toBe(before);
  }, 30_000);
});
