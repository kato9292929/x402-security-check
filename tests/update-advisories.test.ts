import { describe, expect, it } from "vitest";
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
