import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lookupProbe, normHost, selectHost } from "../server/src/tools/probe.js";
import { startMock, type Mock } from "./helpers.js";

// A subset of https://probe.x402jp.com/data/curated.json (generated 2026-11-20).
const sample = JSON.parse(readFileSync(new URL("./fixtures/curated.sample.json", import.meta.url), "utf8"));
let probe: Mock;

beforeAll(async () => {
  probe = await startMock((req, _b, res) => {
    if (req.url === "/data/curated.json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(sample));
    }
    res.writeHead(503);
    res.end();
  });
  process.env.X402SC_PROBE_DATA_URL = `${probe.url}/data/curated.json`;
});
afterAll(async () => {
  delete process.env.X402SC_PROBE_DATA_URL;
  await probe.close();
});

describe("lookup_probe", () => {
  it("normalizes hosts and URLs", () => {
    expect(normHost("https://WWW.Claw402.ai:443/api/x?y=1")).toBe("claw402.ai");
    expect(normHost("claw402.ai.")).toBe("claw402.ai");
  });

  it("returns purchases with the skill item each outcome is evidence for", async () => {
    const r: any = await lookupProbe("https://x402.sniperx.fun/api/v1/token/price");
    expect(r.found).toBe(true);
    expect(r.purchases.length).toBeGreaterThan(0);
    const p = r.purchases[0];
    expect(p.category).toBe("paid_then_rejected");
    expect(p.hint).toMatchObject({ items: [1], issues: ["S1"] });
    expect(r.legacy_not_delivered[0]).toMatchObject({ host: "x402.sniperx.fun", http_status: 400 });
    expect(r.categories.paid_then_rejected.label).toBeTruthy();
  });

  it("maps paid-but-not-delivered to item 3 and not-settled to item 8", () => {
    const a: any = selectHost(sample, "api-xpay.com");
    expect(a.purchases.every((p: any) => p.hint.items.includes(3))).toBe(true);
    const b: any = selectHost(sample, "agent.pocket.network");
    expect(b.purchases.find((p: any) => p.category === "not_settled").hint).toMatchObject({ items: [8], issues: ["F1"] });
  });

  it("includes own sellers and delivered records with the tx", () => {
    const r: any = selectHost(sample, "claw402.ai");
    const ok = r.purchases.find((p: any) => p.category === "as_described");
    expect(ok.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ok.onchain_ok).toBe(true);
    expect(r.card.host).toBe("claw402.ai");
    expect(selectHost(sample, "jin.x402jp.com").own_seller).toHaveLength(1);
  });

  it("found is false for a host with no record", async () => {
    const r: any = await lookupProbe("unknown.example.com");
    expect(r).toMatchObject({ found: false, purchases: [] });
  });

  it("reports when the Probe data is unavailable", async () => {
    process.env.X402SC_PROBE_DATA_URL = `${probe.url}/down`;
    const r: any = await lookupProbe("claw402.ai");
    process.env.X402SC_PROBE_DATA_URL = `${probe.url}/data/curated.json`;
    expect(r).toMatchObject({ found: false, error: expect.stringMatching(/HTTP 503/) });
  });
});
