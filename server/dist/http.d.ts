/**
 * "local" (the plugin, on the user's own machine): http and https, local hosts allowed.
 * "public" (the remote server): https only, internal addresses refused (see net-guard.ts).
 */
export type NetworkPolicy = "local" | "public";
export declare function setNetworkPolicy(p: NetworkPolicy): void;
export declare const networkPolicy: () => NetworkPolicy;
export declare const DEFAULT_TIMEOUT_MS = 10000;
export declare const MAX_BODY_BYTES = 1000000;
export interface FetchedResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    truncated: boolean;
}
export declare function assertHttpUrl(raw: string): URL;
export declare function readCapped(res: Response, max?: number): Promise<{
    body: string;
    truncated: boolean;
}>;
export declare function httpRequest(url: string, init?: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxBodyBytes?: number;
}): Promise<FetchedResponse>;
export declare function getJson<T = unknown>(url: string, timeoutMs?: number, maxBodyBytes?: number): Promise<{
    status: number;
    json?: T;
    text: string;
}>;
