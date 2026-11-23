/**
 * The remote server's tools and prompt. The tool code is the same as the Claude Code plugin's
 * (generated/core is server/dist); only check_sdk_advisories takes lockfile contents or a public
 * GitHub URL instead of a local path.
 */
import { z } from "zod";
import advisories from "../generated/data/advisories.json";
import issues from "../generated/data/issues.json";
import { setNetworkPolicy } from "../generated/core/http.js";
import { NO_LOCKFILE_NOTE, scanLockfileContents } from "../generated/core/tools/advisories.js";
import { getFacilitatorSigners } from "../generated/core/tools/facilitator.js";
import { fetchRepoLockfiles } from "../generated/core/tools/github-lockfiles.js";
import { inspect402 } from "../generated/core/tools/inspect402.js";
import { lookupProbe } from "../generated/core/tools/probe.js";
import { readRepository } from "../generated/core/tools/repo-files.js";
import type { AdvisoryData } from "../generated/core/data.js";
import { SKILL_BODY } from "../generated/skill";

// Public server: https only, no internal addresses (server/src/net-guard.ts).
setNetworkPolicy("public");

export const MAX_INLINE_LOCKFILE_CHARS = 15_000_000;

type Server = {
  registerTool: (name: string, config: any, cb: (args: any) => Promise<any>) => unknown;
  registerPrompt: (name: string, config: any, cb: () => any) => unknown;
};

async function run(fn: () => Promise<unknown> | unknown) {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
  }
}

const readOnly = (openWorld: boolean) => ({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: openWorld });

export async function checkSdkAdvisoriesRemote(args: { lockfiles?: { file_name: string; content: string }[]; repository_url?: string }) {
  const data = advisories as unknown as AdvisoryData;
  const given = (args.lockfiles?.length ? 1 : 0) + (args.repository_url ? 1 : 0);
  if (given !== 1) throw new Error("give either lockfiles or repository_url");
  if (args.lockfiles?.length) {
    for (const f of args.lockfiles) if (f.content.length > MAX_INLINE_LOCKFILE_CHARS) throw new Error(`${f.file_name} is too large`);
    const r = scanLockfileContents(args.lockfiles.map((f) => ({ path: f.file_name, content: f.content })), data);
    return { source: "lockfile contents", ...r, note: r.lockfiles.length ? undefined : NO_LOCKFILE_NOTE };
  }
  const repo = await fetchRepoLockfiles(args.repository_url!);
  const r = scanLockfileContents(repo.files, data);
  return {
    source: `https://github.com/${repo.repository}`,
    ref: repo.ref,
    ...r,
    skipped: repo.skipped,
    notes: repo.notes,
    note: r.lockfiles.length ? undefined : NO_LOCKFILE_NOTE,
  };
}

export const INSTRUCTIONS =
  "x402 Security Check: checks the code of an x402 seller's API server (the side that returns 402 and settles payments) on 11 items. " +
  "x402_security_check returns the check procedure and read_repository reads a public GitHub repository's relevant files. The other tools are read-only checks used as evidence: SDK advisories in lockfiles, " +
  "a live 402, facilitator signers, Seller Probe purchase records and the list of 25 x402 issues. No tool pays, signs or holds keys.";

export function registerAll(server: Server) {
  server.registerTool(
    "x402_security_check",
    {
      title: "x402 security check procedure",
      description:
        "Returns the procedure for an x402 security check (x402 セキュリティチェック・点検) of a seller's API server code: scope, the 11 items " +
        "(input checks before settle, 402 contents, payment order, replays, payment/resource match, caching, expiry, facilitator results, " +
        "payment response header, SDK advisories, secrets), severity levels and the report format. Same text as the x402-security-check skill.",
      inputSchema: z.object({}),
      annotations: { title: "x402 security check procedure", ...readOnly(false) },
    },
    async () => ({ content: [{ type: "text" as const, text: SKILL_BODY }] }),
  );

  server.registerTool(
    "read_repository",
    {
      title: "Read a repository for the check",
      description:
        "Reads the files of a public GitHub repository that an x402 seller check needs: hosting / CDN / framework configuration " +
        "(vercel.json, next.config.*, middleware, wrangler.toml, ...), package manifests, and source files that mention x402 or payments " +
        "(paymentMiddleware, settle, facilitator, payTo, PAYMENT-* headers). Contents are returned with line numbers. Lists the lockfiles.",
      inputSchema: z.object({
        repository_url: z.string().describe("https://github.com/<owner>/<repo>, optionally /tree/<branch>. Public repositories only."),
      }),
      annotations: { title: "Read a repository for the check", ...readOnly(true) },
    },
    async ({ repository_url }) => run(() => readRepository(repository_url)),
  );

  server.registerTool(
    "check_sdk_advisories",
    {
      title: "Check x402 SDK advisories",
      description:
        "Finds x402 SDK package versions in lockfiles (package-lock.json, pnpm-lock.yaml, yarn.lock, requirements*.txt, poetry.lock, uv.lock, " +
        "Pipfile.lock, go.sum) and lists those older than the fixed version of a published advisory (e.g. GHSA-qr2g-p6q7-w82m), with file, line " +
        "and the matching text. Takes either the lockfile contents with their file names, or the URL of a public GitHub repository, whose " +
        "lockfiles it reads from GitHub.",
      inputSchema: z.object({
        lockfiles: z
          .array(z.object({ file_name: z.string().describe("e.g. package-lock.json or api/go.sum"), content: z.string().describe("The whole lockfile.") }))
          .optional()
          .describe("Lockfile contents and file names."),
        repository_url: z.string().optional().describe("https://github.com/<owner>/<repo>, optionally /tree/<branch>. Public repositories only."),
      }),
      annotations: { title: "Check x402 SDK advisories", ...readOnly(true) },
    },
    async (args) => run(() => checkSdkAdvisoriesRemote(args)),
  );

  server.registerTool(
    "inspect_402",
    {
      title: "Inspect a live 402",
      description:
        "Requests an https URL without any payment header and returns the status. For a 402 it decodes PAYMENT-REQUIRED (v2 header) or the " +
        "JSON body (v1) and, for each accepts entry, returns the amount in token units, whether the asset belongs to the network, the EIP-712 " +
        "name/version read from the token contract compared with extra.name/extra.version, and whether an input definition is published. " +
        "Other statuses are returned as they are. Redirects are not followed. Never pays.",
      inputSchema: z.object({
        url: z.string().describe("https URL of the paid endpoint."),
        method: z.enum(["GET", "HEAD", "POST"]).optional().describe("Default GET."),
        body: z.string().optional().describe("Request body for POST."),
        content_type: z.string().optional().describe("Content-Type for the body. Default application/json."),
        listed_price: z.string().optional().describe("Price shown on the site or catalog, in token units (e.g. 0.01), compared with the 402 amount."),
      }),
      annotations: { title: "Inspect a live 402", ...readOnly(true) },
    },
    async (args) => run(() => inspect402(args)),
  );

  server.registerTool(
    "get_facilitator_signers",
    {
      title: "Get facilitator signers",
      description:
        "Reads <facilitator>/supported and returns the signer addresses the facilitator publishes per network family, the Solana fee payers " +
        "and the supported kinds.",
      inputSchema: z.object({ url: z.string().describe("Facilitator base URL (https), e.g. https://x402.org/facilitator.") }),
      annotations: { title: "Get facilitator signers", ...readOnly(true) },
    },
    async ({ url }) => run(() => getFacilitatorSigners(url)),
  );

  server.registerTool(
    "lookup_probe",
    {
      title: "Look up Seller Probe",
      description:
        "Returns Seller Probe's public purchase records for a host (https://probe.x402jp.com/data/curated.json): each endpoint bought, the " +
        "request sent, the HTTP status, the transaction and whether it was found on chain, the outcome category, and which check item the " +
        "outcome relates to. found is false when there is no record of the host.",
      inputSchema: z.object({ host: z.string().describe("Host name (api.example.com) or a URL on it.") }),
      annotations: { title: "Look up Seller Probe", ...readOnly(true) },
    },
    async ({ host }) => run(() => lookupProbe(host)),
  );

  server.registerTool(
    "list_issues",
    {
      title: "List x402 issues",
      description:
        "Returns the 25 x402 per-call issues (B1-B7, S1-S9, F1-F4, K1-K3, C1-C2) with ID, summary, payment stage, layer, who loses, and the " +
        "check items (1-11) each maps to.",
      inputSchema: z.object({}),
      annotations: { title: "List x402 issues", ...readOnly(false) },
    },
    async () => run(() => issues),
  );

  server.registerPrompt(
    "x402_security_check",
    {
      title: "x402 security check",
      description: "The 11-item check procedure for an x402 seller's API server code (same text as the x402-security-check skill).",
    },
    () => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: SKILL_BODY } }],
    }),
  );
}
