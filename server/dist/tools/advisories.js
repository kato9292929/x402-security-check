/**
 * check_sdk_advisories: finds x402 SDK versions in lockfiles and lists those older than a
 * fixed version in data/advisories.json. Reads local files only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { readData } from "../data.js";
import { compareVersions, isBelow, parseVersion } from "../version-compare.js";
export const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "build", ".next", ".venv", "venv", "__pycache__", ".turbo", ".cache", "coverage"]);
export const MAX_DEPTH = 6;
const MAX_FILE_BYTES = 30_000_000;
export function lockfileKind(name) {
    if (name === "package-lock.json" || name === "npm-shrinkwrap.json")
        return "npm";
    if (name === "pnpm-lock.yaml")
        return "pnpm";
    if (name === "yarn.lock")
        return "yarn";
    if (/^requirements.*\.txt$/.test(name) || name === "constraints.txt")
        return "requirements";
    if (name === "poetry.lock" || name === "uv.lock" || name === "pdm.lock")
        return "pylock-toml";
    if (name === "Pipfile.lock")
        return "pipfile";
    if (name === "go.sum")
        return "gosum";
    return null;
}
export function findLockfiles(root) {
    const out = [];
    const walk = (dir, depth) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const p = join(dir, e.name);
            if (e.isDirectory()) {
                if (!SKIP_DIRS.has(e.name) && depth < MAX_DEPTH)
                    walk(p, depth + 1);
            }
            else if (e.isFile() && lockfileKind(e.name))
                out.push(p);
        }
    };
    walk(root, 0);
    return out.sort();
}
const normPy = (s) => s.toLowerCase().replace(/[-_.]+/g, "-");
/** Scans one lockfile. `names` are the SDK package names per ecosystem. */
export function scanLockfile(path, content, names, rel = path) {
    const kind = lockfileKind(basename(path));
    const lines = content.split(/\r?\n/);
    const found = [];
    const npm = new Set(names.npm ?? []);
    const py = new Set((names.pip ?? []).map(normPy));
    const go = names.go ?? [];
    const add = (ecosystem, pkg, version, i) => {
        if (!parseVersion(version))
            return;
        if (found.some((f) => f.ecosystem === ecosystem && f.package === pkg && f.version === version))
            return;
        found.push({ ecosystem, package: pkg, version, file: rel, line: i + 1, text: lines[i].trim() });
    };
    if (kind === "npm") {
        // "node_modules/@x402/svm": {   (v2/v3)   or   "@x402/svm": {   (v1 "dependencies")
        for (let i = 0; i < lines.length; i++) {
            // Whole entry on one line: "node_modules/@x402/svm": { "version": "2.5.0", ... }
            const one = /^\s*"(?:(?:.*\/)?node_modules\/)?((?:@[^/"]+\/)?[^/"]+)":\s*\{.*"version":\s*"([^"]+)"/.exec(lines[i]);
            if (one && npm.has(one[1])) {
                add("npm", one[1], one[2], i);
                continue;
            }
            const m = /^\s*"(?:(?:.*\/)?node_modules\/)?((?:@[^/"]+\/)?[^/"]+)":\s*\{\s*$/.exec(lines[i]);
            if (!m || !npm.has(m[1]))
                continue;
            const indent = lines[i].search(/\S/);
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim() && lines[j].search(/\S/) <= indent)
                    break;
                const v = /^\s*"version":\s*"([^"]+)"/.exec(lines[j]);
                if (v && lines[j].search(/\S/) === indent + 2) {
                    add("npm", m[1], v[1], j);
                    break;
                }
            }
        }
    }
    else if (kind === "pnpm") {
        // /@x402/svm@2.5.0:   '@x402/svm@2.5.0':   /@x402/svm/2.5.0:   @x402/svm@2.5.0(peer@1):
        for (let i = 0; i < lines.length; i++) {
            const m = /^\s{2}'?\/?((?:@[^/@\s']+\/)?[^/@\s'(]+)[@/](\d+\.\d+\.\d+[^:'(\s]*)/.exec(lines[i]);
            if (m && npm.has(m[1]))
                add("npm", m[1], m[2], i);
        }
    }
    else if (kind === "yarn") {
        // "@x402/svm@^2.5.0", "@x402/svm@npm:^2.5.0":   then   version "2.5.0"  /  version: 2.5.0
        for (let i = 0; i < lines.length; i++) {
            if (/^\s/.test(lines[i]) || !lines[i].trim())
                continue;
            const specs = lines[i].replace(/:$/, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
            const pkg = specs.map((s) => /^((?:@[^/@]+\/)?[^@]+)@/.exec(s)?.[1]).find((p) => p && npm.has(p));
            if (!pkg)
                continue;
            for (let j = i + 1; j < Math.min(lines.length, i + 15) && /^\s/.test(lines[j]); j++) {
                const v = /^\s+version:?\s+"?([^"\s]+)"?/.exec(lines[j]);
                if (v) {
                    add("npm", pkg, v[1], j);
                    break;
                }
            }
        }
    }
    else if (kind === "requirements") {
        for (let i = 0; i < lines.length; i++) {
            const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*===?\s*([0-9][^\s;#,]*)/.exec(lines[i]);
            if (m && py.has(normPy(m[1])))
                add("pip", normPy(m[1]), m[2], i);
        }
    }
    else if (kind === "pylock-toml") {
        for (let i = 0; i < lines.length; i++) {
            const m = /^name\s*=\s*"([^"]+)"/.exec(lines[i]);
            if (!m || !py.has(normPy(m[1])))
                continue;
            for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
                if (/^\[/.test(lines[j]))
                    break;
                const v = /^version\s*=\s*"([^"]+)"/.exec(lines[j]);
                if (v) {
                    add("pip", normPy(m[1]), v[1], j);
                    break;
                }
            }
        }
    }
    else if (kind === "pipfile") {
        for (let i = 0; i < lines.length; i++) {
            const m = /^\s*"([^"]+)":\s*\{\s*$/.exec(lines[i]);
            if (!m || !py.has(normPy(m[1])))
                continue;
            for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
                const v = /^\s*"version":\s*"==([^"]+)"/.exec(lines[j]);
                if (v) {
                    add("pip", normPy(m[1]), v[1], j);
                    break;
                }
                if (/^\s*\}/.test(lines[j]))
                    break;
            }
        }
    }
    else if (kind === "gosum") {
        for (let i = 0; i < lines.length; i++) {
            const m = /^(\S+)\s+v(\S+?)(?:\/go\.mod)?\s+h1:/.exec(lines[i]);
            if (!m)
                continue;
            const mod = m[1];
            const base = go.find((g) => mod === g || new RegExp(`^${g.replace(/[.]/g, "\\.")}/v\\d+$`).test(mod));
            if (base)
                add("go", base, m[2].replace(/\+incompatible$/, ""), i);
        }
    }
    return found;
}
/** Scans lockfile contents and matches them against the advisories. No file system access. */
export function scanLockfileContents(files, data) {
    const packages = [];
    const ignored = [];
    for (const f of files) {
        if (!lockfileKind(basename(f.path))) {
            ignored.push(f.path);
            continue;
        }
        packages.push(...scanLockfile(f.path, f.content, data.sdk_packages, f.path));
    }
    const vulnerable = [];
    for (const p of packages) {
        for (const adv of data.advisories) {
            for (const a of adv.affected) {
                if (a.ecosystem !== p.ecosystem || a.package !== p.package)
                    continue;
                if (!isBelow(p.version, a.fixed))
                    continue;
                if (a.introduced && compareVersions(p.version, a.introduced) < 0)
                    continue;
                vulnerable.push({
                    advisory: adv.id,
                    severity: adv.severity,
                    summary: adv.summary,
                    url: adv.url,
                    issue: adv.issue,
                    ecosystem: p.ecosystem,
                    package: p.package,
                    version: p.version,
                    fixed: a.fixed,
                    file: p.file,
                    line: p.line,
                    text: p.text,
                });
            }
        }
    }
    return {
        lockfiles: files.map((f) => f.path).filter((p) => !ignored.includes(p)),
        not_lockfiles: ignored,
        packages,
        vulnerable,
        advisories_checked: data.advisories.map((a) => a.id),
        advisories_updated: data.updated,
    };
}
export const NO_LOCKFILE_NOTE = "No lockfile found (package-lock.json, pnpm-lock.yaml, yarn.lock, requirements*.txt, poetry.lock, uv.lock, Pipfile.lock, go.sum). The installed versions cannot be confirmed from manifests alone.";
export function checkSdkAdvisories(path, data = readData("advisories.json")) {
    const root = resolve(path);
    const st = statSync(root, { throwIfNoEntry: false });
    if (!st)
        throw new Error(`path not found: ${path}`);
    const files = st.isFile() ? [root] : findLockfiles(root);
    const base = st.isFile() ? resolve(root, "..") : root;
    const inputs = [];
    const skipped = [];
    for (const f of files) {
        const rel = relative(base, f) || basename(f);
        if (statSync(f).size > MAX_FILE_BYTES) {
            skipped.push({ file: rel, reason: `larger than ${MAX_FILE_BYTES} bytes` });
            continue;
        }
        inputs.push({ path: rel, content: readFileSync(f, "utf8") });
    }
    const r = scanLockfileContents(inputs, data);
    return {
        path: root,
        lockfiles: files.map((f) => relative(base, f) || basename(f)),
        skipped,
        packages: r.packages,
        vulnerable: r.vulnerable,
        advisories_checked: r.advisories_checked,
        advisories_updated: r.advisories_updated,
        note: files.length ? undefined : NO_LOCKFILE_NOTE,
    };
}
