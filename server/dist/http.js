/**
 * Outbound HTTP for the tools. Reads only: no payment headers, no credentials, no cookies,
 * redirects are reported instead of followed, and bodies are capped.
 */
import { guardedRequest } from "./net-guard.js";
import { USER_AGENT } from "./version.js";
let policy = "local";
export function setNetworkPolicy(p) {
    policy = p;
}
export const networkPolicy = () => policy;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 1_000_000;
/** Headers a caller may never send through these tools. */
const FORBIDDEN_HEADERS = /^(payment-signature|x-payment|authorization|cookie|proxy-authorization)$/i;
export function assertHttpUrl(raw) {
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        throw new Error(`not a URL: ${raw}`);
    }
    if (u.protocol !== "https:" && u.protocol !== "http:")
        throw new Error(`only http and https URLs are allowed: ${raw}`);
    if (u.username || u.password)
        throw new Error("URLs with credentials are not allowed");
    return u;
}
export async function readCapped(res, max = MAX_BODY_BYTES) {
    if (!res.body)
        return { body: "", truncated: false };
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    let truncated = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.byteLength;
        if (size > max) {
            chunks.push(value.subarray(0, value.byteLength - (size - max)));
            truncated = true;
            await reader.cancel().catch(() => { });
            break;
        }
        chunks.push(value);
    }
    return { body: Buffer.concat(chunks).toString("utf8"), truncated };
}
export async function httpRequest(url, init = {}) {
    const u = assertHttpUrl(url);
    const headers = { "user-agent": USER_AGENT, accept: "application/json, */*;q=0.5" };
    for (const [k, v] of Object.entries(init.headers ?? {})) {
        if (FORBIDDEN_HEADERS.test(k))
            throw new Error(`header ${k} is not allowed`);
        headers[k.toLowerCase()] = v;
    }
    if (policy === "public") {
        const r = await guardedRequest(u.toString(), {
            method: init.method ?? "GET",
            body: init.body,
            headers,
            timeoutMs: init.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxBodyBytes: init.maxBodyBytes ?? MAX_BODY_BYTES,
        });
        return { status: r.status, headers: r.headers, body: r.body, truncated: r.truncated };
    }
    const res = await fetch(u, {
        method: init.method ?? "GET",
        body: init.body,
        headers,
        redirect: "manual",
        credentials: "omit",
        signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const { body, truncated } = await readCapped(res, init.maxBodyBytes);
    const out = {};
    res.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
    return { status: res.status, headers: out, body, truncated };
}
export async function getJson(url, timeoutMs, maxBodyBytes) {
    const r = await httpRequest(url, { timeoutMs, maxBodyBytes });
    try {
        return { status: r.status, json: JSON.parse(r.body), text: r.body };
    }
    catch {
        return { status: r.status, text: r.body };
    }
}
