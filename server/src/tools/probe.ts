/**
 * lookup_probe: the public Seller Probe data (probe.x402jp.com/data/curated.json) for one host:
 * what was bought, how it ended, and the transaction. Read-only.
 */
import { getJson } from "../http.js";

export const PROBE_DATA_URL = () => process.env.X402SC_PROBE_DATA_URL || "https://probe.x402jp.com/data/curated.json";

/** Which skill item a Probe outcome is evidence for. */
export const CATEGORY_HINTS: Record<string, { items: number[]; issues: string[]; meaning: string }> = {
  paid_then_rejected: { items: [1], issues: ["S1"], meaning: "Paid first, then the request was rejected (4xx): input was checked after settle." },
  paid_not_delivered: { items: [3], issues: ["S2", "K1"], meaning: "Paid with a correct request, but no data came back (5xx / timeout after the transfer)." },
  delivered_without_payment: { items: [3], issues: ["K1"], meaning: "Data came back without a transfer: data is returned before settle succeeds." },
  not_settled: { items: [8], issues: ["F1"], meaning: "Reported as settled (or pending) but no transfer on chain." },
  input_mismatch: { items: [1, 2], issues: ["B6"], meaning: "The Probe's request did not match what the seller accepts (no payment)." },
  input_rejected_unpaid: { items: [1, 2], issues: ["B6"], meaning: "Rejected before payment for missing input: input is checked before settle." },
  no_usage: { items: [2], issues: ["B6"], meaning: "No published usage / input definition." },
  over_price: { items: [2], issues: ["S5"], meaning: "The 402 asked more than the Probe's limit or the listed price." },
  as_described: { items: [], issues: [], meaning: "Delivered and as described." },
  not_as_described: { items: [], issues: ["S4"], meaning: "Delivered but not as described (outside the seller code checks)." },
  not_bought: { items: [], issues: [], meaning: "Not bought (balance, limit or unsupported payment method)." },
};

export function normHost(input: string): string {
  let h = input.trim();
  try {
    if (/^[a-z]+:\/\//i.test(h)) h = new URL(h).hostname;
  } catch {
    // keep as is
  }
  return h.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
}

export function selectHost(data: any, host: string) {
  const h = normHost(host);
  const match = (x: unknown) => typeof x === "string" && normHost(x) === h;
  const items = (data?.items ?? []).filter((i: any) => match(i.host));
  const cards = (data?.cards ?? []).filter((c: any) => match(c.host) || match(c.domain));
  const legacy = (data?.legacy_not_delivered ?? []).flatMap((d: any) =>
    (d.rows ?? []).filter((r: any) => match(r.host)).map((r: any) => ({ date: d.date, ...r })),
  );
  const own = (data?.own_sellers ?? []).filter((o: any) => match(o.host));
  const categoryDefs = Object.fromEntries((data?.categories ?? []).map((c: any) => [c.key, { label: c.label, definition: c.definition }]));

  const purchases = items.map((i: any) => {
    const l = i.last ?? {};
    return {
      url: i.url,
      name: i.name,
      price_usd: i.price_usd,
      date: l.date,
      category: l.category,
      category_label: l.category_label,
      reason: l.reason,
      request: l.request,
      http_status: l.http_status,
      tx: l.tx,
      chain: l.chain,
      network: l.network,
      amount: l.amount,
      onchain_ok: l.onchain_ok,
      checks: l.checks,
      error_body: typeof l.error_body === "string" ? l.error_body.slice(0, 500) : l.error_body,
      hint: CATEGORY_HINTS[l.category],
    };
  });
  const seen = new Set(purchases.map((p: any) => p.category).filter(Boolean));
  return {
    host: h,
    found: purchases.length + cards.length + legacy.length + own.length > 0,
    data_generated_at: data?.generated_at,
    last_run: data?.last_run,
    card: cards[0] ?? null,
    purchases,
    legacy_not_delivered: legacy,
    own_seller: own,
    categories: Object.fromEntries([...seen].map((k) => [k as string, categoryDefs[k as string]])),
    note:
      "Seller Probe records the outcome of real purchases. It does not record whether a PAYMENT-RESPONSE header was returned; a tx with onchain_ok true means the transfer was found on chain.",
  };
}

export async function lookupProbe(host: string, timeoutMs = 15_000) {
  const url = PROBE_DATA_URL();
  const r = await getJson(url, timeoutMs);
  if (r.status !== 200 || !r.json) return { host: normHost(host), found: false, source: url, error: `Seller Probe data unavailable (HTTP ${r.status})` };
  return { source: url, ...selectHost(r.json, host) };
}
