/**
 * get_facilitator_signers: GET <facilitator>/supported and return the signer addresses it
 * publishes (x402 v2 "signers", keyed by CAIP-2 family pattern such as eip155:*), plus the
 * supported kinds. Read-only.
 */
import { getJson } from "../http.js";

export function supportedUrl(facilitator: string): string {
  const u = new URL(facilitator);
  if (!/\/supported\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/$/, "") + "/supported";
  return u.toString();
}

export async function getFacilitatorSigners(facilitator: string, timeoutMs?: number) {
  const url = supportedUrl(facilitator);
  const r = await getJson<Record<string, any>>(url, timeoutMs);
  if (r.status !== 200 || !r.json || typeof r.json !== "object") {
    return { url, status: r.status, ok: false, body_head: r.text.slice(0, 1000), signers: null, kinds: [] };
  }
  const j = r.json;
  const kinds = Array.isArray(j.kinds)
    ? j.kinds.map((k: any) => ({ x402Version: k?.x402Version, scheme: k?.scheme, network: k?.network, extra: k?.extra }))
    : [];
  const signers: Record<string, string[]> | null = j.signers && typeof j.signers === "object" ? j.signers : null;
  // Solana kinds carry the fee payer, which is the transaction sender.
  const feePayers = kinds
    .filter((k: any) => k.extra && typeof k.extra.feePayer === "string")
    .map((k: any) => ({ network: k.network, feePayer: k.extra.feePayer }));
  return {
    url,
    status: r.status,
    ok: true,
    signers,
    fee_payers: feePayers,
    kinds,
    extensions: Array.isArray(j.extensions) ? j.extensions : [],
    note: signers
      ? undefined
      : "This facilitator's /supported has no signers list, so the transaction sender cannot be matched against published signers.",
  };
}
