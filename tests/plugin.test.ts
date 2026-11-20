import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(root + p, "utf8");
const json = (p: string) => JSON.parse(read(p));

describe("plugin layout", () => {
  it(".claude-plugin/plugin.json names the plugin x402-security-check", () => {
    const m = json(".claude-plugin/plugin.json");
    expect(m.name).toBe("x402-security-check");
    expect(m.version).toBe(json("package.json").version);
  });

  it(".mcp.json starts server/dist/index.js from the plugin root with node", () => {
    const s = json(".mcp.json").mcpServers["x402-security-check"];
    expect(s.command).toBe("node");
    expect(s.args).toEqual(["${CLAUDE_PLUGIN_ROOT}/server/dist/index.js"]);
    expect(existsSync(root + "server/dist/index.js")).toBe(true);
    expect(read("server/dist/index.js").startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("the skill is skills/x402-security-check/SKILL.md with name and description", () => {
    const skill = read("skills/x402-security-check/SKILL.md");
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? "";
    expect(fm).toMatch(/^name: "x402-security-check"$/m);
    expect(fm).toMatch(/^description: ".+"$/m);
    // The skill must work without the MCP tools.
    expect(skill).toContain("使えないときは、コードと設定だけで判定する。");
    for (const tool of ["inspect_402", "get_facilitator_signers", "check_sdk_advisories", "lookup_probe", "list_issues"]) expect(skill).toContain(`\`${tool}\``);
  });

  it("the npm package ships the server, the data and the README", () => {
    const files: string[] = json("package.json").files;
    expect(files).toEqual(expect.arrayContaining(["server/dist", "data", "README.md"]));
    expect(json("package.json").bin["x402-security-check-mcp"]).toBe("server/dist/index.js");
  });
});
