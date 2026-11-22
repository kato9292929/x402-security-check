/** server/src or server/dist -> package root. */
export declare const PACKAGE_ROOT: string;
export declare const DATA_DIR: () => string;
export declare function readData<T>(name: string): T;
export type Ecosystem = "npm" | "pip" | "go";
export interface AffectedPackage {
    ecosystem: Ecosystem;
    package: string;
    /** First patched version; anything older is affected. */
    fixed: string;
    /** Optional lower bound (inclusive). Absent means every version below `fixed`. */
    introduced?: string;
}
export interface Advisory {
    id: string;
    cve?: string | null;
    severity?: string;
    summary: string;
    issue?: string;
    item?: number;
    url: string;
    published?: string;
    affected: AffectedPackage[];
}
export interface AdvisoryData {
    updated: string;
    note?: string;
    sdk_packages: Record<Ecosystem, string[]>;
    advisories: Advisory[];
}
export interface Issue {
    id: string;
    layer: string;
    stage: string;
    summary: string;
    who_loses: string;
    items: number[];
    in_skill_scope: boolean;
}
export interface IssueData {
    source: string;
    title: string;
    stages: string[];
    loser_labels: Record<string, string>;
    items: {
        number: number;
        title: string;
        issues: string[];
    }[];
    issues: Issue[];
}
