import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listIssues } from "../server/src/tools/issues.js";

const skill = readFileSync(new URL("../skills/x402-security-check/SKILL.md", import.meta.url), "utf8");

describe("list_issues / data/issues.json", () => {
  const d = listIssues();

  it("has the 25 issues B1-B7, S1-S9, F1-F4, K1-K3, C1-C2", () => {
    const want = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `B${n}`),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `S${n}`),
      ...[1, 2, 3, 4].map((n) => `F${n}`),
      ...[1, 2, 3].map((n) => `K${n}`),
      ...[1, 2].map((n) => `C${n}`),
    ];
    expect(d.issues.map((i) => i.id).sort()).toEqual(want.sort());
    for (const i of d.issues) expect(d.stages).toContain(i.stage);
  });

  it("items and issues point at each other consistently", () => {
    expect(d.items.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const it of d.items) for (const id of it.issues) expect(d.issues.find((i) => i.id === id)!.items).toContain(it.number);
    for (const i of d.issues) for (const n of i.items) expect(d.items[n - 1].issues).toContain(i.id);
  });

  it("matches the issue IDs the SKILL.md puts on each item", () => {
    // e.g. "1. **入力の検証を settle より先に行う**（S1）"
    const re = /^\s*(\d+)\. \*\*[^*]+\*\*（([A-Z0-9・]+)）/gm;
    const fromSkill = new Map<number, string[]>();
    for (const m of skill.matchAll(re)) fromSkill.set(Number(m[1]), m[2].split("・"));
    expect(fromSkill.size).toBe(9); // items 7 and 11 carry no issue ID
    for (const [n, ids] of fromSkill) for (const id of ids) expect(d.items[n - 1].issues).toContain(id);
  });
});
