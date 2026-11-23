/**
 * read_repository: reads the files of a public GitHub repository that an x402 seller check needs,
 * so a check can start from the repository URL alone: lockfiles, hosting / CDN / framework
 * configuration, package manifests, and source files that mention x402 or payments.
 * Contents come back with line numbers so findings can cite file:line.
 */
import { httpRequest } from "../http.js";
import { lockfileKind, SKIP_DIRS } from "./advisories.js";
import { parseGitHubUrl } from "./github-lockfiles.js";

export const MAX_SOURCE_CANDIDATES = 150;
export const MAX_FILE_BYTES = 200_000;
export const MAX_TOTAL_CHARS = 350_000;

const CONFIG_NAMES =
  /^(vercel\.json|netlify\.toml|wrangler\.(toml|jsonc?)|next\.config\.(js|mjs|cjs|ts)|middleware\.(ts|js)|proxy\.(ts|js)|package\.json|go\.mod|pyproject\.toml|requirements[^/]*\.txt|Dockerfile|fly\.toml|render\.yaml|firebase\.json|_headers|_redirects|\.env\.example)$/;
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs|py|go|rs|rb)$/;
const SKIP_SOURCE = /(^|\/)(test|tests|__tests__|spec|e2e|examples?|docs?|scripts?|migrations?|public|static|assets)\//i;
const SKIP_FILE = /\.(test|spec|stories|d)\.[a-z]+$|\.min\.js$/;
const X402_HINT =
  /x402|paymentMiddleware|payment-required|payment-signature|x-payment|payment-response|facilitator|payTo|\bsettle\b|withPayment|requirePayment|exact_evm|exactEvm|USDC/i;
/** Paths likely to hold paid routes or payment setup are read first. */
const PRIORITY = /(api|route|routes|server|handler|middleware|pay|x402|app|src|lib)/i;

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
const skipped = (p: string) => p.split("/").slice(0, -1).some((s) => SKIP_DIRS.has(s));

export function selectPaths(paths: string[]) {
  const configs: string[] = [];
  const lockfiles: string[] = [];
  const sources: string[] = [];
  for (const p of paths) {
    if (skipped(p)) continue;
    const name = p.split("/").pop()!;
    if (lockfileKind(name)) lockfiles.push(p);
    else if (CONFIG_NAMES.test(name)) configs.push(p);
    else if (SOURCE_EXT.test(name) && !SKIP_SOURCE.test(p) && !SKIP_FILE.test(name)) sources.push(p);
  }
  const score = (p: string) => (PRIORITY.test(p) ? 0 : 1) + p.split("/").length / 100;
  sources.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
  return { configs: configs.sort(), lockfiles: lockfiles.sort(), sources };
}

export const numbered = (text: string) =>
  text
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
    .join("\n");

async function raw(owner: string, repo: string, ref: string, path: string, max: number) {
  return httpRequest(`https://raw.githubusercontent.com/${owner}/${repo}/${enc(ref)}/${enc(path)}`, {
    maxBodyBytes: max,
    timeoutMs: 15_000,
  }).catch((e) => ({ status: 0, body: String((e as Error).message), headers: {}, truncated: false }));
}

export async function readRepository(repositoryUrl: string) {
  const r = parseGitHubUrl(repositoryUrl);
  const tree = await httpRequest(`https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${encodeURIComponent(r.ref)}?recursive=1`, {
    headers: { accept: "application/vnd.github+json" },
    maxBodyBytes: 20_000_000,
    timeoutMs: 15_000,
  });
  if (tree.status === 404) throw new Error(`repository or branch not found (or not public): ${r.owner}/${r.repo}@${r.ref}`);
  if (tree.status !== 200) throw new Error(`GitHub did not list the repository (HTTP ${tree.status}); try again later`);
  const t = JSON.parse(tree.body);
  const all: string[] = (t.tree ?? []).filter((x: any) => x.type === "blob" && typeof x.path === "string").map((x: any) => x.path);
  const pick = selectPaths(all);
  const notes: string[] = [];
  if (t.truncated) notes.push("GitHub returned a truncated file list (very large repository); some files may be missing.");

  const files: { path: string; kind: "config" | "lockfile" | "source"; content: string }[] = [];
  const omitted: { path: string; reason: string }[] = [];
  let total = 0;
  const add = (path: string, kind: "config" | "lockfile" | "source", content: string) => {
    const text = kind === "lockfile" ? content : numbered(content);
    if (total + text.length > MAX_TOTAL_CHARS) {
      omitted.push({ path, reason: "size budget reached" });
      return;
    }
    total += text.length;
    files.push({ path, kind, content: text });
  };

  for (const p of pick.configs) {
    const res = await raw(r.owner, r.repo, r.ref, p, MAX_FILE_BYTES);
    if (res.status === 200 && !res.truncated) add(p, "config", res.body);
    else omitted.push({ path: p, reason: res.truncated ? "too large" : `HTTP ${res.status}` });
  }

  // Source files: read the likely ones and keep those that mention x402 or payments.
  const candidates = pick.sources.slice(0, MAX_SOURCE_CANDIDATES);
  if (pick.sources.length > candidates.length)
    notes.push(`${pick.sources.length} source files; the first ${candidates.length} by path (api, routes, server, middleware, ...) were searched for x402 code.`);
  const bodies = await Promise.all(candidates.map((p) => raw(r.owner, r.repo, r.ref, p, MAX_FILE_BYTES).then((res) => ({ p, res }))));
  for (const { p, res } of bodies) {
    if (res.status === 200 && !res.truncated && X402_HINT.test(res.body)) add(p, "source", res.body);
  }

  // Lockfiles last: they are large; only the x402 SDK versions in them matter (check_sdk_advisories).
  const lockfileNames = pick.lockfiles;

  return {
    repository: `https://github.com/${r.owner}/${r.repo}`,
    ref: r.ref,
    files,
    lockfiles: lockfileNames,
    lockfiles_note: lockfileNames.length
      ? "Lockfile contents are not included here; check_sdk_advisories with this repository URL reads them."
      : "No lockfile found in the repository.",
    omitted,
    notes,
  };
}
