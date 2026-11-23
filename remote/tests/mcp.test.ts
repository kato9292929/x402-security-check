import { describe, expect, it } from "vitest";
import { POST } from "../app/api/mcp/route";
import { SKILL_BODY } from "../generated/skill";

let id = 0;
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const res = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }),
  );
  const text = await res.text();
  // The handler may answer as JSON or as one SSE event.
  const json = text.startsWith("{") ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? text);
  return { status: res.status, body: JSON.parse(json) };
}
const call = async (name: string, args: Record<string, unknown>) => (await rpc("tools/call", { name, arguments: args })).body.result;
const json = (r: any) => JSON.parse(r.content[0].text);

describe("remote MCP endpoint", () => {
  it("lists the six tools, each with a title and readOnlyHint", async () => {
    const { status, body } = await rpc("tools/list");
    expect(status).toBe(200);
    const tools = body.result.tools;
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      "check_sdk_advisories",
      "get_facilitator_signers",
      "inspect_402",
      "list_issues",
      "lookup_probe",
      "x402_security_check",
    ]);
    for (const t of tools) {
      expect(t.title).toBeTruthy();
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
    }
  });

  it("serves the check procedure as the prompt x402_security_check, same text as SKILL.md", async () => {
    const list = await rpc("prompts/list");
    expect(list.body.result.prompts.map((p: any) => p.name)).toEqual(["x402_security_check"]);
    const got = await rpc("prompts/get", { name: "x402_security_check" });
    expect(got.body.result.messages[0].content.text).toBe(SKILL_BODY);
    expect(SKILL_BODY).toContain("git が使えないとき");
  });

  it("the tool x402_security_check returns the check procedure (same text as SKILL.md)", async () => {
    const r = await call("x402_security_check", {});
    expect(r.content[0].text).toBe(SKILL_BODY);
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    expect(init.body.result.instructions).toMatch(/x402_security_check returns the check procedure/);
  });

  it("check_sdk_advisories reads lockfile contents", async () => {
    const lock = JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@x402/svm": { version: "2.5.0" } } }, null, 2);
    const r = await call("check_sdk_advisories", { lockfiles: [{ file_name: "package-lock.json", content: lock }, { file_name: "README.md", content: "x" }] });
    const out = json(r);
    expect(out.vulnerable).toMatchObject([{ advisory: "GHSA-qr2g-p6q7-w82m", package: "@x402/svm", version: "2.5.0", line: 5 }]);
    expect(out.not_lockfiles).toEqual(["README.md"]);
  });

  it("check_sdk_advisories needs exactly one of lockfiles or repository_url", async () => {
    expect((await call("check_sdk_advisories", {})).isError).toBe(true);
    const both = await call("check_sdk_advisories", { lockfiles: [{ file_name: "go.sum", content: "" }], repository_url: "https://github.com/a/b" });
    expect(both.isError).toBe(true);
    expect((await call("check_sdk_advisories", { repository_url: "https://gitlab.com/a/b" })).isError).toBe(true);
  });

  it("list_issues returns the 25 issues", async () => {
    expect(json(await call("list_issues", {})).issues).toHaveLength(25);
  });

  it("URLs from the caller: https only, no internal or metadata addresses", async () => {
    for (const url of ["http://example.com/api", "https://127.0.0.1/api", "https://localhost/api", "https://169.254.169.254/latest/meta-data/", "https://[::1]/"]) {
      const r = await call("inspect_402", { url });
      expect(r.isError, url).toBe(true);
    }
    const f = await call("get_facilitator_signers", { url: "https://10.0.0.1/facilitator" });
    expect(f.isError).toBe(true);
    expect(f.content[0].text).toMatch(/internal/);
  });
});
