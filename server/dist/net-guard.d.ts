/** Why an address may not be contacted, or null when it is a public address. */
export declare function blockedReason(ip: string): string | null;
export declare class BlockedUrlError extends Error {
    constructor(message: string);
}
export type Resolver = (host: string) => Promise<{
    address: string;
    family: number;
}[]>;
export interface GuardOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs: number;
    maxBodyBytes: number;
    /** Tests only. */
    resolver?: Resolver;
    /** Tests only: extra trusted CA (self-signed test server). */
    ca?: string | Buffer;
    /** Tests only: addresses to allow in spite of the block list. */
    allowAddresses?: string[];
    /** Tests only: connect to this port instead of 443 (the URL itself must still be on 443). */
    port?: number;
}
export interface GuardedResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    truncated: boolean;
    /** The address that was contacted. */
    address: string;
}
/** Checks the URL and resolves its host. Throws BlockedUrlError when it may not be contacted. */
export declare function checkUrl(raw: string, opts?: Pick<GuardOptions, "resolver" | "allowAddresses">): Promise<{
    url: URL;
    host: string;
    address: {
        address: string;
        family: number;
    };
}>;
/** One https request to a checked address. Redirects are returned, not followed. */
export declare function guardedRequest(raw: string, opts: GuardOptions): Promise<GuardedResponse>;
