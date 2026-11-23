export declare const MAX_SOURCE_CANDIDATES = 150;
export declare const MAX_FILE_BYTES = 200000;
/** Total characters of file contents in one result (keeps it within a chat's context). */
export declare const MAX_TOTAL_CHARS = 35000;
/** Characters of one file in a result; longer files are cut and say so. */
export declare const MAX_FILE_CHARS = 15000;
export declare const MAX_PATHS_PER_CALL = 8;
/** How strongly a file is about x402: mentions per KB, with paid-route paths first. Higher is earlier. */
export declare function x402Score(path: string, text: string): number;
export declare function selectPaths(paths: string[]): {
    configs: string[];
    lockfiles: string[];
    sources: string[];
};
export declare const numbered: (text: string) => string;
/** File content for a result: numbered, cut at MAX_FILE_CHARS with a note. */
export declare function excerpt(text: string, max?: number): {
    content: string;
    cut: boolean;
};
/** Repository paths a source file imports (relative, "@/" and "~/" aliases, Python modules). Only paths in `all`. */
export declare function localImports(path: string, text: string, all: Set<string>): string[];
export declare function readRepository(repositoryUrl: string, paths?: string[]): Promise<{
    repository: string;
    ref: string;
    files: {
        path: string;
        content: string;
        cut: boolean;
    }[];
    missing: {
        path: string;
        reason: string;
    }[];
    not_included?: undefined;
    related_files?: undefined;
    lockfiles?: undefined;
    other_source_files?: undefined;
    how_to_read_more?: undefined;
    notes?: undefined;
} | {
    repository: string;
    ref: string;
    files: {
        path: string;
        kind: "config" | "source";
        content: string;
        cut: boolean;
    }[];
    not_included: string[];
    related_files: {
        path: string;
        imported_by: string[];
    }[];
    lockfiles: string[];
    other_source_files: number;
    how_to_read_more: string;
    notes: string[];
    missing?: undefined;
}>;
