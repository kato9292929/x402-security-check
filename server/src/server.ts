import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkSdkAdvisories } from "./tools/advisories.js";
import { getFacilitatorSigners } from "./tools/facilitator.js";
import { inspect402 } from "./tools/inspect402.js";
import { listIssues } from "./tools/issues.js";
import { lookupProbe } from "./tools/probe.js";
import { VERSION } from "./version.js";

export { VERSION };

async function run(fn: () => Promise<unknown> | unknown) {
  try {
    const result = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
  }
}

export const INSTRUCTIONS =
  "Read-only tools for the x402-security-check skill (checking an x402 seller's API server). " +
  "None of them pays, signs or holds keys. They add evidence to the skill's 11 items: " +
  "check_sdk_advisories (item 10), inspect_402 (item 2), get_facilitator_signers (item 8), lookup_probe (items 1, 3, 9), list_issues (issue IDs).";

export function createServer(): McpServer {
  const server = new McpServer({ name: "x402-security-check", version: VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "check_sdk_advisories",
    {
      title: "Check x402 SDK advisories",
      description:
        "Item 10 (K3). Scans the lockfiles under a repository path (package-lock.json, pnpm-lock.yaml, yarn.lock, requirements*.txt, poetry.lock, " +
        "uv.lock, Pipfile.lock, go.sum; node_modules and vendor are skipped) for x402 SDK packages and returns every version found with its file and " +
        "line, and the ones older than the fixed version of a known advisory (data/advisories.json, e.g. GHSA-qr2g-p6q7-w82m). Reads local files only.",
      inputSchema: { path: z.string().describe("Repository root (or a single lockfile).") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) => run(() => checkSdkAdvisories(path)),
  );

  server.registerTool(
    "inspect_402",
    {
      title: "Inspect a live 402",
      description:
        "Item 2 (B6, S5, S6). Requests the URL WITHOUT any payment header and returns the status. For a 402 it decodes PAYMENT-REQUIRED " +
        "(v2 header) or the JSON body (v1) and, per accepts entry: the amount in token units, whether the asset belongs to the network, " +
        "the EIP-712 name/version read from the token contract over a public RPC compared with extra.name/extra.version, and whether an input " +
        "definition is published. Any other status (200, 401, 404, ...) is returned as is. Redirects are not followed. Never pays.",
      inputSchema: {
        url: z.string().describe("Production or staging URL of the paid endpoint."),
        method: z.enum(["GET", "HEAD", "POST"]).optional().describe("Default GET."),
        body: z.string().optional().describe("Request body for POST (sent as is)."),
        content_type: z.string().optional().describe("Content-Type for the body. Default application/json."),
        listed_price: z
          .string()
          .optional()
          .describe("Optional price shown on the site/docs/catalog, in token units (e.g. 0.01 for 0.01 USDC). Compared with the 402 amount."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => run(() => inspect402(args)),
  );

  server.registerTool(
    "get_facilitator_signers",
    {
      title: "Get facilitator signers",
      description:
        "Item 8 (F1, F3). GET <facilitator>/supported and return the signer addresses it publishes (per network family), the Solana fee payers " +
        "and the supported kinds, so the sender of a settle transaction can be matched against them. Read-only.",
      inputSchema: { url: z.string().describe("Facilitator base URL, e.g. https://x402.org/facilitator.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => run(() => getFacilitatorSigners(url)),
  );

  server.registerTool(
    "lookup_probe",
    {
      title: "Look up Seller Probe",
      description:
        "Items 1, 3, 9 (S1, S2, K1, F1). Returns Seller Probe's public purchase records for a host (https://probe.x402jp.com/data/curated.json): " +
        "each bought endpoint, the request sent, the HTTP status, the tx and whether it was found on chain, the outcome category, and which " +
        "skill item that outcome is evidence for. found is false when the Probe has no record of the host.",
      inputSchema: { host: z.string().describe("Host name (api.example.com) or a URL on it.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ host }) => run(() => lookupProbe(host)),
  );

  server.registerTool(
    "list_issues",
    {
      title: "List x402 issues",
      description:
        "Returns the 25 x402 per-call issues (B1-B7, S1-S9, F1-F4, K1-K3, C1-C2): ID, summary, payment stage, layer, who loses, and the skill " +
        "items (1-11) each maps to. Use it to label findings with issue IDs.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => run(() => listIssues()),
  );

  return server;
}
