import { type LockfileInput } from "./advisories.js";
export declare const MAX_LOCKFILES = 20;
export declare const MAX_LOCKFILE_BYTES = 15000000;
export interface RepoRef {
    owner: string;
    repo: string;
    /** Branch, tag or commit; HEAD (the default branch) when absent. */
    ref: string;
}
/** https://github.com/owner/repo[.git][/tree/<ref>] -> RepoRef */
export declare function parseGitHubUrl(raw: string): RepoRef;
export declare function fetchRepoLockfiles(repoUrl: string): Promise<{
    repository: string;
    ref: string;
    files: LockfileInput[];
    skipped: {
        file: string;
        reason: string;
    }[];
    notes: string[];
}>;
