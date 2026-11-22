export type Level = "error" | "warn" | "info";
export interface Finding {
    level: Level;
    /** Skill item number. */
    item: number;
    /** Issue ID from data/issues.json. */
    issue?: string;
    code: string;
    message: string;
    accepts_index?: number;
}
/** "0.01", "$0.01", "1 JPYC" -> decimal string, or null. */
export declare function parseListedPrice(v: string): string | null;
/** Atomic integer -> decimal string with `decimals` places, trailing zeros removed. */
export declare function formatUnits(amount: bigint, decimals: number): string;
/** Decimal string -> atomic units, or null when it has more places than `decimals`. */
export declare function toAtomic(value: string, decimals: number): bigint | null;
/** If a/b is an exact power of ten (other than 1), return the exponent (signed). */
export declare function powerOfTenRatio(a: bigint, b: bigint): number | null;
export interface InspectOptions {
    url: string;
    method?: string;
    body?: string;
    content_type?: string;
    listed_price?: string;
    timeoutMs?: number;
}
export declare function inspect402(opts: InspectOptions): Promise<{
    is_402: boolean;
    note: string;
    url: string;
    method: string;
    status: number;
    headers: Record<string, string>;
    body_head: string;
    body_truncated: boolean;
    sent_payment_header: boolean;
} | {
    is_402: boolean;
    payment_required: null;
    accepts: never[];
    input_definition: null;
    findings: Finding[];
    url: string;
    method: string;
    status: number;
    headers: Record<string, string>;
    body_head: string;
    body_truncated: boolean;
    sent_payment_header: boolean;
} | {
    is_402: boolean;
    payment_required: {
        source: "body" | "header" | undefined;
        x402Version: number;
        error: any;
        resource: any;
        extensions: string[];
        raw: Record<string, any>;
    };
    accepts: {
        index: number;
        scheme: any;
        network: string;
        network_caip2: string;
        network_name: string | undefined;
        testnet: boolean | undefined;
        asset: string | undefined;
        asset_check: Record<string, unknown>;
        amount: string | undefined;
        amount_human: string | undefined;
        unit: "USDC" | "JPYC" | undefined;
        payTo: any;
        maxTimeoutSeconds: any;
        extra: any;
        eip712: Record<string, unknown> | undefined;
    }[];
    input_definition: {
        present: boolean;
        where: string[];
        input: any;
    };
    findings: Finding[];
    url: string;
    method: string;
    status: number;
    headers: Record<string, string>;
    body_head: string;
    body_truncated: boolean;
    sent_payment_header: boolean;
}>;
