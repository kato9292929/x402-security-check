// Every place that carries the release version must agree with package.json.
import { readFileSync } from "node:fs";

const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const p = json("package.json");
const s = json("server.json");
const m = json(".claude-plugin/plugin.json");
const a = json("plugin.json");
const j = json("mcp.json");
const src = readFileSync(new URL("../server/src/version.ts", import.meta.url), "utf8");
const pin = (j.mcpServers["x402-security-check"].args.find((x) => x.startsWith(`${p.name}@`)) || "").split("@")[1];
const want = process.argv[2] || p.version;

const bad = [];
for (const [k, v] of [
  ["package.json", p.version],
  ["server.json", s.version],
  ["server.json package", s.packages[0].version],
  [".claude-plugin/plugin.json", m.version],
  ["plugin.json", a.version],
  ["mcp.json npx pin", pin],
  ["server/src/version.ts", /VERSION = "([^"]+)"/.exec(src)?.[1]],
])
  if (v !== want) bad.push(`${k} is ${v}, expected ${want}`);
if (p.mcpName !== s.name) bad.push("package.json mcpName != server.json name");
if (s.packages[0].identifier !== p.name) bad.push("server.json identifier != package name");
if (bad.length) {
  console.error(bad.join("\n"));
  process.exit(1);
}
console.log(`versions agree: ${want}`);
