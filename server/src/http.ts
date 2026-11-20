/**
 * Outbound HTTP for the tools. Reads only: no payment headers, no credentials, no cookies,
 * redirects are reported instead of followed, and bodies are capped.
 */
import { USER_AGENT } from "./version.js";

export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 1_000_000;

/** Headers a caller may never send through these tools. */
const FORBIDDEN_HEADERS = /^(payment-signature|x-payment|authorization|cookie|proxy-authorization)$/i;

export interface FetchedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
}

export function assertHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`not a URL: ${raw}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`only http and https URLs are allowed: ${raw}`);
  if (u.username || u.password) throw new Error("URLs with credentials are not allowed");
  return u;
}

export async function readCapped(res: Response, max = MAX_BODY_BYTES): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      chunks.push(value.subarray(0, value.byteLength - (size - max)));
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks).toString("utf8"), truncated };
}

export async function httpRequest(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<FetchedResponse> {
  const u = assertHttpUrl(url);
  const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "application/json, */*;q=0.5" };
  for (const [k, v] of Object.entries(init.headers ?? {})) {
    if (FORBIDDEN_HEADERS.test(k)) throw new Error(`header ${k} is not allowed`);
    headers[k.toLowerCase()] = v;
  }
  const res = await fetch(u, {
    method: init.method ?? "GET",
    body: init.body,
    headers,
    redirect: "manual",
    credentials: "omit",
    signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const { body, truncated } = await readCapped(res);
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
  return { status: res.status, headers: out, body, truncated };
}

export async function getJson<T = unknown>(url: string, timeoutMs?: number): Promise<{ status: number; json?: T; text: string }> {
  const r = await httpRequest(url, { timeoutMs });
  try {
    return { status: r.status, json: JSON.parse(r.body) as T, text: r.body };
  } catch {
    return { status: r.status, text: r.body };
  }
}
