// Prepares what the remote server needs from the rest of the repository, before every build/test:
//  - generated/core: the tool code (../server/dist), so both versions run the same code
//  - generated/data: data/advisories.json and data/issues.json
//  - generated/skill.ts: SKILL.md (the prompt text)
//  - public/x402-security-check.zip: the skill folder at the top of the ZIP
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const remote = resolve(here, "..");
const repo = resolve(remote, "..");
const gen = join(remote, "generated");

rmSync(gen, { recursive: true, force: true });
mkdirSync(join(gen, "data"), { recursive: true });

// 1. tool code (not the stdio entry point or its server)
const dist = join(repo, "server", "dist");
if (!existsSync(join(dist, "tools", "inspect402.js"))) throw new Error("server/dist is missing: run npm run build at the repository root");
cpSync(dist, join(gen, "core"), {
  recursive: true,
  filter: (src) => !/[\\/](index|server)\.(js|d\.ts)$/.test(src),
});

// 2. data
for (const f of ["advisories.json", "issues.json"]) cpSync(join(repo, "data", f), join(gen, "data", f));

// 3. skill text
const skillDir = join(repo, "skills", "x402-security-check");
const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const m = /^---\n([\s\S]*?)\n---\n/.exec(skill);
if (!m) throw new Error("SKILL.md has no frontmatter");
const body = skill.slice(m[0].length).replace(/^\n+/, "");
writeFileSync(join(gen, "skill.ts"), `// Generated from skills/x402-security-check/SKILL.md by scripts/prepare.mjs.\nexport const SKILL_MD = ${JSON.stringify(skill)};\nexport const SKILL_BODY = ${JSON.stringify(body)};\n`);

// 4. ZIP: x402-security-check/ at the top
function listFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}
function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  // Fixed timestamp (1980-01-01) so the same input gives the same ZIP.
  const time = 0;
  const date = (0 << 9) | (1 << 5) | 1;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6); // UTF-8 names
    h.writeUInt16LE(8, 8); // deflate
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    local.push(h, nameBuf, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += h.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
const entries = listFiles(skillDir)
  .sort()
  .map((p) => ({ name: "x402-security-check/" + relative(skillDir, p).split("\\").join("/"), data: readFileSync(p) }));
mkdirSync(join(remote, "public"), { recursive: true });
writeFileSync(join(remote, "public", "x402-security-check.zip"), zip(entries));
console.log(`prepared generated/ and public/x402-security-check.zip (${entries.map((e) => e.name).join(", ")})`);
