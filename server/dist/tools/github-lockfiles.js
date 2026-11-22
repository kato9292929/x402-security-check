/**
 * Reads the lockfiles of a public GitHub repository for check_sdk_advisories (remote server).
 * Lists the tree with the public REST API (no key), then reads each lockfile from
 * raw.githubusercontent.com. When the listing is unavailable (e.g. the unauthenticated rate
 * limit), it falls back to the lockfile names at the repository root.
 */
import { httpRequest } from "../http.js";
import { lockfileKind, MAX_DEPTH, SKIP_DIRS } from "./advisories.js";
export const MAX_LOCKFILES = 20;
export const MAX_LOCKFILE_BYTES = 15_000_000;
const ROOT_NAMES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "requirements.txt", "poetry.lock", "uv.lock", "Pipfile.lock", "go.sum"];
/** https://github.com/owner/repo[.git][/tree/<ref>] -> RepoRef */
export function parseGitHubUrl(raw) {
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        throw new Error(`not a URL: ${raw}`);
    }
    if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "github.com")
        throw new Error("give a https://github.com/<owner>/<repo> URL");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2)
        throw new Error("give a https://github.com/<owner>/<repo> URL");
    const name = /^[A-Za-z0-9_.-]+$/;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    if (!name.test(owner) || !name.test(repo))
        throw new Error("owner or repository name is not valid");
    let ref = "HEAD";
    if (parts[2] === "tree" && parts[3])
        ref = decodeURIComponent(parts.slice(3).join("/"));
    if (!/^[A-Za-z0-9_./-]{1,200}$/.test(ref) || ref.includes(".."))
        throw new Error("branch name is not valid");
    return { owner, repo, ref };
}
const skipPath = (p) => {
    const segs = p.split("/");
    return segs.length - 1 > MAX_DEPTH || segs.slice(0, -1).some((s) => SKIP_DIRS.has(s));
};
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
export async function fetchRepoLockfiles(repoUrl) {
    const r = parseGitHubUrl(repoUrl);
    const notes = [];
    let paths = null;
    const tree = await httpRequest(`https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${encodeURIComponent(r.ref)}?recursive=1`, { headers: { accept: "application/vnd.github+json" }, maxBodyBytes: 20_000_000, timeoutMs: 15_000 }).catch((e) => ({ status: 0, body: String(e.message), headers: {}, truncated: false }));
    if (tree.status === 200) {
        try {
            const j = JSON.parse(tree.body);
            paths = (j.tree ?? [])
                .filter((t) => t.type === "blob" && typeof t.path === "string" && lockfileKind(t.path.split("/").pop()) && !skipPath(t.path))
                .map((t) => t.path)
                .sort();
            if (j.truncated)
                notes.push("GitHub returned a truncated file list; lockfiles deep in a very large repository may be missing.");
        }
        catch {
            paths = null;
        }
    }
    else if (tree.status === 404) {
        throw new Error(`repository or branch not found (or not public): ${r.owner}/${r.repo}@${r.ref}`);
    }
    if (paths === null) {
        notes.push(`Could not list the repository (HTTP ${tree.status}); only lockfiles at the repository root were looked for.`);
        paths = ROOT_NAMES;
    }
    if (paths.length > MAX_LOCKFILES) {
        notes.push(`${paths.length} lockfiles found; only the first ${MAX_LOCKFILES} were read.`);
        paths = paths.slice(0, MAX_LOCKFILES);
    }
    const files = [];
    const skipped = [];
    for (const p of paths) {
        const res = await httpRequest(`https://raw.githubusercontent.com/${r.owner}/${r.repo}/${enc(r.ref)}/${enc(p)}`, {
            maxBodyBytes: MAX_LOCKFILE_BYTES,
            timeoutMs: 15_000,
        }).catch((e) => ({ status: 0, body: String(e.message), headers: {}, truncated: false }));
        if (res.status === 404 && paths === ROOT_NAMES)
            continue;
        if (res.status !== 200)
            skipped.push({ file: p, reason: `HTTP ${res.status}` });
        else if (res.truncated)
            skipped.push({ file: p, reason: `larger than ${MAX_LOCKFILE_BYTES} bytes` });
        else
            files.push({ path: p, content: res.body });
    }
    return { repository: `${r.owner}/${r.repo}`, ref: r.ref, files, skipped, notes };
}
