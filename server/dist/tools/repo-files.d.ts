export declare const MAX_SOURCE_CANDIDATES = 150;
export declare const MAX_FILE_BYTES = 200000;
export declare const MAX_TOTAL_CHARS = 350000;
export declare function selectPaths(paths: string[]): {
    configs: string[];
    lockfiles: string[];
    sources: string[];
};
export declare const numbered: (text: string) => string;
export declare function readRepository(repositoryUrl: string): Promise<{
    repository: string;
    ref: string;
    files: {
        path: string;
        kind: "config" | "lockfile" | "source";
        content: string;
    }[];
    lockfiles: string[];
    lockfiles_note: string;
    omitted: {
        path: string;
        reason: string;
    }[];
    notes: string[];
}>;
