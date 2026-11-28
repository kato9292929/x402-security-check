export declare function supportedUrl(facilitator: string): string;
export declare function getFacilitatorSigners(facilitator: string, timeoutMs?: number): Promise<{
    url: string;
    status: number;
    ok: boolean;
    body_head: string;
    signers: null;
    kinds: never[];
    fee_payers?: undefined;
    extensions?: undefined;
    note?: undefined;
} | {
    url: string;
    status: number;
    ok: boolean;
    signers: Record<string, string[]> | null;
    fee_payers: {
        network: any;
        feePayer: any;
    }[];
    kinds: {
        x402Version: any;
        scheme: any;
        network: any;
        extra: any;
    }[];
    extensions: any[];
    note: string | undefined;
    body_head?: undefined;
}>;
