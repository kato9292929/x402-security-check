import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createServer } from "../server/src/server.js";

const TOOLS = ["check_sdk_advisories", "get_facilitator_signers", "inspect_402", "list_issues", "lookup_probe"];

describe("MCP server", () => {
  it("lists the five read-only tools", async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(a);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(b);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
    const r: any = await client.callTool({ name: "list_issues", arguments: {} });
    expect(JSON.parse(r.content[0].text).issues).toHaveLength(25);
    const bad: any = await client.callTool({ name: "check_sdk_advisories", arguments: { path: "/no/such/dir" } });
    expect(bad.isError).toBe(true);
    await client.close();
  });

  const dist = fileURLToPath(new URL("../server/dist/index.js", import.meta.url));
  it.skipIf(!existsSync(dist))("server/dist/index.js starts over stdio (as the plugin's .mcp.json runs it)", async () => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [dist] }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
    await client.close();
  });
});
