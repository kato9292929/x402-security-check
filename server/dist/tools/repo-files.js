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
/** Total characters of file contents in one result (keeps it within a chat's context). */
export const MAX_TOTAL_CHARS = 45_000;
/** Characters of one file in a result; longer files are cut and say so. */
export const MAX_FILE_CHARS = 15_000;
export const MAX_PATHS_PER_CALL = 8;
const CONFIG_NAMES = /^(vercel\.json|netlify\.toml|wrangler\.(toml|jsonc?)|next\.config\.(js|mjs|cjs|ts)|middleware\.(ts|js)|proxy\.(ts|js)|package\.json|go\.mod|pyproject\.toml|requirements[^/]*\.txt|Dockerfile|fly\.toml|render\.yaml|firebase\.json|_headers|_redirects|\.env\.example)$/;
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs|py|go|rs|rb)$/;
const SKIP_SOURCE = /(^|\/)(test|tests|__tests__|spec|e2e|examples?|docs?|scripts?|migrations?|public|static|assets)\//i;
const SKIP_FILE = /\.(test|spec|stories|d)\.[a-z]+$|\.min\.js$/;
const X402_HINT = /x402|paymentMiddleware|payment-required|payment-signature|x-payment|payment-response|facilitator|payTo|\bsettle\b|withPayment|requirePayment|exact_evm|exactEvm|USDC/i;
/** Paths likely to hold paid routes or payment setup are read first. */
const PRIORITY = /(api|route|routes|server|handler|middleware|pay|x402|app|src|lib)/i;
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const skipped = (p) => p.split("/").slice(0, -1).some((s) => SKIP_DIRS.has(s));
export function selectPaths(paths) {
    const configs = [];
    const lockfiles = [];
    const sources = [];
    for (const p of paths) {
        if (skipped(p))
            continue;
        const name = p.split("/").pop();
        if (lockfileKind(name))
            lockfiles.push(p);
        else if (CONFIG_NAMES.test(name))
            configs.push(p);
        else if (SOURCE_EXT.test(name) && !SKIP_SOURCE.test(p) && !SKIP_FILE.test(name))
            sources.push(p);
    }
    const score = (p) => (PRIORITY.test(p) ? 0 : 1) + p.split("/").length / 100;
    sources.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
    return { configs: configs.sort(), lockfiles: lockfiles.sort(), sources };
}
export const numbered = (text) => text
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
    .join("\n");
/** File content for a result: numbered, cut at MAX_FILE_CHARS with a note. */
export function excerpt(text, max = MAX_FILE_CHARS) {
    const n = numbered(text);
    if (n.length <= max)
        return { content: n, cut: false };
    const cut = n.slice(0, max);
    const lines = cut.split("\n").length;
    return { content: cut.slice(0, cut.lastIndexOf("\n")) + `\n…(cut after line ${lines - 1}; read the rest with paths)`, cut: true };
}
const TS_EXT = ["", ".ts", ".tsx", ".js", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js"];
/** Repository paths a source file imports (relative, "@/" and "~/" aliases, Python modules). Only paths in `all`. */
export function localImports(path, text, all) {
    const out = new Set();
    const dir = path.split("/").slice(0, -1);
    const norm = (parts) => {
        const st = [];
        for (const p of parts) {
            if (p === "" || p === ".")
                continue;
            if (p === "..")
                st.pop();
            else
                st.push(p);
        }
        return st.join("/");
    };
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(path)) {
        const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;
        for (const m of text.matchAll(re)) {
            const spec = m[1];
            let bases = [];
            if (spec.startsWith("."))
                bases = [norm([...dir, ...spec.split("/")])];
            else if (/^[@~]\//.test(spec))
                bases = [norm(["src", ...spec.slice(2).split("/")]), norm(spec.slice(2).split("/"))];
            for (const b of bases) {
                const hit = TS_EXT.map((e) => (b + e).replace(/\.js$/, ".js")).find((c) => all.has(c)) ??
                    (b.endsWith(".js") ? [b.replace(/\.js$/, ".ts"), b.replace(/\.js$/, ".tsx")].find((c) => all.has(c)) : undefined);
                if (hit && hit !== path) {
                    out.add(hit);
                    break;
                }
            }
        }
    }
    else if (path.endsWith(".py")) {
        for (const m of text.matchAll(/^\s*(?:from\s+(\.*[\w.]*)\s+import|import\s+([\w.]+))/gm)) {
            const mod = m[1] ?? m[2];
            const dots = /^\.*/.exec(mod)[0].length;
            const rest = mod.slice(dots).split(".").filter(Boolean);
            const base = dots ? norm([...dir, ...Array(dots - 1).fill(".."), ...rest]) : rest.join("/");
            const hit = [`${base}.py`, `${base}/__init__.py`].find((c) => all.has(c));
            if (hit && hit !== path)
                out.add(hit);
        }
    }
    return [...out].sort();
}
async function raw(owner, repo, ref, path, max) {
    return httpRequest(`https://raw.githubusercontent.com/${owner}/${repo}/${enc(ref)}/${enc(path)}`, {
        maxBodyBytes: max,
        timeoutMs: 15_000,
    }).catch((e) => ({ status: 0, body: String(e.message), headers: {}, truncated: false }));
}
export async function readRepository(repositoryUrl, paths) {
    const r = parseGitHubUrl(repositoryUrl);
    const repository = `https://github.com/${r.owner}/${r.repo}`;
    // Specific files asked for by path.
    if (paths?.length) {
        if (paths.length > MAX_PATHS_PER_CALL)
            throw new Error(`give at most ${MAX_PATHS_PER_CALL} paths per call`);
        const files = [];
        const missing = [];
        let total = 0;
        for (const p of paths) {
            if (!/^[^\0]{1,300}$/.test(p) || p.split("/").includes("..")) {
                missing.push({ path: p, reason: "not a valid path" });
                continue;
            }
            const res = await raw(r.owner, r.repo, r.ref, p.replace(/^\/+/, ""), MAX_FILE_BYTES);
            if (res.status !== 200) {
                missing.push({ path: p, reason: `HTTP ${res.status}` });
                continue;
            }
            const e = excerpt(res.body, Math.min(MAX_FILE_CHARS * 2, MAX_TOTAL_CHARS - total));
            if (e.content.length < 50) {
                missing.push({ path: p, reason: "size budget reached; ask for it in another call" });
                continue;
            }
            total += e.content.length;
            files.push({ path: p, content: e.content, cut: e.cut || res.truncated });
        }
        return { repository, ref: r.ref, files, missing };
    }
    const tree = await httpRequest(`https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${encodeURIComponent(r.ref)}?recursive=1`, {
        headers: { accept: "application/vnd.github+json" },
        maxBodyBytes: 20_000_000,
        timeoutMs: 15_000,
    });
    if (tree.status === 404)
        throw new Error(`repository or branch not found (or not public): ${r.owner}/${r.repo}@${r.ref}`);
    if (tree.status !== 200)
        throw new Error(`GitHub did not list the repository (HTTP ${tree.status}); try again later`);
    const t = JSON.parse(tree.body);
    const all = (t.tree ?? []).filter((x) => x.type === "blob" && typeof x.path === "string").map((x) => x.path);
    const allSet = new Set(all);
    const pick = selectPaths(all);
    const notes = [];
    if (t.truncated)
        notes.push("GitHub returned a truncated file list (very large repository); some files may be missing.");
    // Which source files have x402 / payment code.
    const candidates = pick.sources.slice(0, MAX_SOURCE_CANDIDATES);
    if (pick.sources.length > candidates.length)
        notes.push(`${pick.sources.length} source files; the first ${candidates.length} by path were searched for x402 code.`);
    const bodies = await Promise.all(candidates.map((p) => raw(r.owner, r.repo, r.ref, p, MAX_FILE_BYTES).then((res) => ({ p, res }))));
    const x402 = bodies.filter(({ res }) => res.status === 200 && X402_HINT.test(res.body));
    // Paid routes and payment setup first, then the rest of the x402 files.
    const rank = (p) => (/(route|handler|x402|pay|middleware|server)/i.test(p) ? 0 : 1);
    x402.sort((a, b) => rank(a.p) - rank(b.p) || a.p.localeCompare(b.p));
    const included = [];
    const listedOnly = [];
    let total = 0;
    const add = (path, kind, text, max = MAX_FILE_CHARS) => {
        const e = excerpt(text, max);
        if (total + e.content.length > MAX_TOTAL_CHARS) {
            listedOnly.push(path);
            return;
        }
        total += e.content.length;
        included.push({ path, kind, content: e.content, cut: e.cut });
    };
    for (const { p, res } of x402)
        add(p, "source", res.body);
    const configBodies = await Promise.all(pick.configs.map((p) => raw(r.owner, r.repo, r.ref, p, MAX_FILE_BYTES).then((res) => ({ p, res }))));
    for (const { p, res } of configBodies)
        if (res.status === 200)
            add(p, "config", res.body, 6_000);
    // Files the x402 code imports (data access, stores, helpers) that do not mention x402 themselves.
    const x402Paths = new Set(x402.map((x) => x.p));
    const related = new Map();
    for (const { p, res } of x402) {
        for (const imp of localImports(p, res.body, allSet)) {
            if (x402Paths.has(imp))
                continue;
            related.set(imp, [...(related.get(imp) ?? []), p]);
        }
    }
    return {
        repository,
        ref: r.ref,
        files: included,
        not_included: listedOnly,
        related_files: [...related.entries()].map(([path, imported_by]) => ({ path, imported_by })),
        lockfiles: pick.lockfiles,
        other_source_files: pick.sources.filter((p) => !x402Paths.has(p) && !related.has(p)).length,
        how_to_read_more: `Call read_repository again with paths (up to ${MAX_PATHS_PER_CALL}) to read files listed in not_included or related_files. Lockfiles are read by check_sdk_advisories with the repository URL.`,
        notes,
    };
}
