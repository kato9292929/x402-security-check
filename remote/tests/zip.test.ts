import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/** Minimal reader for the ZIP that scripts/prepare.mjs writes. */
function entries(buf: Buffer) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const size = buf.readUInt32LE(p + 20);
    const lName = buf.readUInt16LE(local + 26);
    const lExtra = buf.readUInt16LE(local + 28);
    const start = local + 30 + lName + lExtra;
    out.push({ name, data: inflateRawSync(buf.subarray(start, start + size)) });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

describe("public/x402-security-check.zip", () => {
  const zip = readFileSync(new URL("../public/x402-security-check.zip", import.meta.url));
  const files = entries(zip);

  it("has the skill folder at the top, with SKILL.md in it", () => {
    expect(files.map((f) => f.name)).toEqual(["x402-security-check/SKILL.md"]);
    for (const f of files) expect(f.name.startsWith("x402-security-check/")).toBe(true);
  });

  it("name matches the folder; description fits 200 both as characters and as bytes", () => {
    const md = files[0].data.toString("utf8");
    expect(md).toBe(readFileSync(new URL("../../skills/x402-security-check/SKILL.md", import.meta.url), "utf8"));
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(md)![1];
    const name = /^name: "(.*)"$/m.exec(fm)![1];
    const description = /^description: "(.*)"$/m.exec(fm)![1];
    expect(name).toBe("x402-security-check");
    expect(name.length).toBeLessThanOrEqual(64);
    expect([...description].length).toBeLessThanOrEqual(200);
    expect(Buffer.byteLength(description, "utf8")).toBeLessThanOrEqual(200);
  });
});
