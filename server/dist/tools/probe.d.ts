export declare const PROBE_DATA_URL: () => string;
/** Which skill item a Probe outcome is evidence for. */
export declare const CATEGORY_HINTS: Record<string, {
    items: number[];
    issues: string[];
    meaning: string;
}>;
export declare function normHost(input: string): string;
export declare function selectHost(data: any, host: string): {
    host: string;
    found: boolean;
    data_generated_at: any;
    last_run: any;
    card: any;
    purchases: any;
    legacy_not_delivered: any;
    own_seller: any;
    categories: {
        [k: string]: any;
    };
    note: string;
};
export declare function lookupProbe(host: string, timeoutMs?: number): Promise<{
    host: string;
    found: boolean;
    source: string;
    error: string;
} | {
    host: string;
    found: boolean;
    data_generated_at: any;
    last_run: any;
    card: any;
    purchases: any;
    legacy_not_delivered: any;
    own_seller: any;
    categories: {
        [k: string]: any;
    };
    note: string;
    source: string;
    error?: undefined;
}>;
