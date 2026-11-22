import { type AdvisoryData, type Ecosystem } from "../data.js";
export interface Found {
    ecosystem: Ecosystem;
    package: string;
    version: string;
    file: string;
    line: number;
    text: string;
}
export declare const SKIP_DIRS: Set<string>;
export declare const MAX_DEPTH = 6;
export declare function lockfileKind(name: string): string | null;
export declare function findLockfiles(root: string): string[];
/** Scans one lockfile. `names` are the SDK package names per ecosystem. */
export declare function scanLockfile(path: string, content: string, names: Record<Ecosystem, string[]>, rel?: string): Found[];
export interface LockfileInput {
    /** Path or file name; the base name decides how it is read (package-lock.json, go.sum, ...). */
    path: string;
    content: string;
}
/** Scans lockfile contents and matches them against the advisories. No file system access. */
export declare function scanLockfileContents(files: LockfileInput[], data: AdvisoryData): {
    lockfiles: string[];
    not_lockfiles: string[];
    packages: Found[];
    vulnerable: {
        advisory: string;
        severity: string | undefined;
        summary: string;
        url: string;
        issue: string | undefined;
        ecosystem: Ecosystem;
        package: string;
        version: string;
        fixed: string;
        file: string;
        line: number;
        text: string;
    }[];
    advisories_checked: string[];
    advisories_updated: string;
};
export declare const NO_LOCKFILE_NOTE = "No lockfile found (package-lock.json, pnpm-lock.yaml, yarn.lock, requirements*.txt, poetry.lock, uv.lock, Pipfile.lock, go.sum). The installed versions cannot be confirmed from manifests alone.";
export declare function checkSdkAdvisories(path: string, data?: AdvisoryData): {
    path: string;
    lockfiles: string[];
    skipped: {
        file: string;
        reason: string;
    }[];
    packages: Found[];
    vulnerable: {
        advisory: string;
        severity: string | undefined;
        summary: string;
        url: string;
        issue: string | undefined;
        ecosystem: Ecosystem;
        package: string;
        version: string;
        fixed: string;
        file: string;
        line: number;
        text: string;
    }[];
    advisories_checked: string[];
    advisories_updated: string;
    note: string | undefined;
};
