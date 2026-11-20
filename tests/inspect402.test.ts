import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { domainSeparator } from "../server/src/rpc.js";
import { inspect402, powerOfTenRatio } from "../server/src/tools/inspect402.js";
import { b64, rpcHandler, startMock, type Mock } from "./helpers.js";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x000000000000000000000000000000000000dEaD";
const JPYC = "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29";

const accept = (over: Record<string, unknown> = {}) => ({
  scheme: "exact",
  network: "eip155:84532",
  amount: "10000",
  asset: USDC_BASE_SEPOLIA,
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
  ...over,
});

const paymentRequired = (accepts: unknown[], withInput = true) => ({
  x402Version: 2,
  error: "Payment required",
  resource: { url: "http://seller.test/api/quote", description: "quote", mimeType: "application/json" },
  accepts,
  ...(withInput
    ? { extensions: { bazaar: { info: { input: { type: "http", method: "GET", queryParams: { symbol: "AAPL" } } }, schema: {} } } }
    : {}),
});

let rpc: Mock;
let seller: Mock;

beforeAll(async () => {
  rpc = await startMock(
    rpcHandler({
      [USDC_BASE_SEPOLIA.toLowerCase()]: { name: "USDC", version: "2", decimals: 6, separator: domainSeparator("USDC", "2", 84532, USDC_BASE_SEPOLIA) },
      [JPYC.toLowerCase()]: { name: "JPY Coin", version: "", decimals: 18, noVersion: true },
    }),
  );
  process.env.X402SC_RPC_URL_84532 = rpc.url;
  process.env.X402SC_RPC_URL_137 = rpc.url;
  seller = await startMock((req, _body, res) => {
    const path = req.url ?? "";
    if (path.startsWith("/ok")) {
      res.writeHead(402, { "payment-required": b64(paymentRequired([accept()])), "content-type": "application/json" });
      return res.end("{}");
    }
    if (path.startsWith("/shift")) {
      // 0.01 USDC listed, but amount written with 9 decimals in mind
      res.writeHead(402, { "payment-required": b64(paymentRequired([accept({ amount: "10000000" })])) });
      return res.end("{}");
    }
    if (path.startsWith("/eip712")) {
      // Base mainnet USDC's name ("USD Coin") used for Base Sepolia USDC (whose name is "USDC"), and version "1"
      res.writeHead(402, { "payment-required": b64(paymentRequired([accept({ extra: { name: "USD Coin", version: "1" } })], false)) });
      return res.end("{}");
    }
    if (path.startsWith("/free")) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" });
      return res.end(JSON.stringify({ price: 1 }));
    }
    if (path.startsWith("/missing")) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    if (path.startsWith("/v1")) {
      res.writeHead(402, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          x402Version: 1,
          accepts: [
            {
              scheme: "exact",
              network: "base-sepolia",
              maxAmountRequired: "5000",
              resource: "http://seller.test/v1",
              payTo: PAY_TO,
              asset: USDC_BASE_SEPOLIA,
              maxTimeoutSeconds: 60,
              outputSchema: { input: { type: "http", method: "POST", bodyFields: { q: { type: "string" } } } },
              extra: { name: "USDC", version: "2" },
            },
          ],
        }),
      );
    }
    if (path.startsWith("/jpyc")) {
      const v = new URL(path, "http://x").searchParams.get("v") ?? "1";
      const a = accept({ network: "eip155:137", asset: JPYC, amount: "1000000000000000000", extra: { name: "JPY Coin", version: v } });
      res.writeHead(402, { "payment-required": b64(paymentRequired([a])) });
      return res.end("{}");
    }
    if (path.startsWith("/wrongnet")) {
      res.writeHead(402, { "payment-required": b64(paymentRequired([accept({ asset: USDC_BASE })])) });
      return res.end("{}");
    }
    res.writeHead(500);
    res.end();
  });
});

afterAll(async () => {
  delete process.env.X402SC_RPC_URL_84532;
  delete process.env.X402SC_RPC_URL_137;
  await seller.close();
  await rpc.close();
});

const codes = (r: any) => r.findings.map((f: any) => f.code);

describe("inspect_402", () => {
  it("correct 402: decodes the header, converts the amount, EIP-712 domain matches", async () => {
    const r: any = await inspect402({ url: `${seller.url}/ok`, listed_price: "0.01" });
    expect(r.status).toBe(402);
    expect(r.is_402).toBe(true);
    expect(r.payment_required).toMatchObject({ source: "header", x402Version: 2 });
    const a = r.accepts[0];
    expect(a.amount_human).toBe("0.01");
    expect(a.unit).toBe("USDC");
    expect(a.network_name).toBe("Base Sepolia");
    expect(a.testnet).toBe(true);
    expect(a.asset_check.known).toBe(true);
    expect(a.eip712.onchain).toMatchObject({ name: "USDC", version: "2", decimals: 6 });
    expect(a.eip712.match).toEqual({ name: true, version: true, domain_separator: true });
    expect(r.input_definition.present).toBe(true);
    expect(r.findings.filter((f: any) => f.level === "error")).toEqual([]);
    expect(codes(r)).toContain("testnet");
    // no payment header was sent
    const req = seller.requests.at(-1)!;
    expect(req.headers["payment-signature"]).toBeUndefined();
    expect(req.headers["x-payment"]).toBeUndefined();
  });

  it("amount off by powers of ten is reported as a decimals mistake", async () => {
    const r: any = await inspect402({ url: `${seller.url}/shift`, listed_price: "$0.01" });
    expect(r.accepts[0].amount_human).toBe("10");
    const shift = r.findings.find((f: any) => f.code === "amount_decimal_shift");
    expect(shift).toMatchObject({ level: "error", item: 2, issue: "S5" });
    expect(shift.message).toContain("10^3");
    // Without a listed price it is still flagged as unusually high.
    const r2: any = await inspect402({ url: `${seller.url}/shift` });
    expect(codes(r2)).toContain("amount_unusually_high");
  });

  it("EIP-712 name/version that differ from the token contract are reported", async () => {
    const r: any = await inspect402({ url: `${seller.url}/eip712` });
    const a = r.accepts[0];
    expect(a.eip712.declared).toEqual({ name: "USD Coin", version: "1" });
    expect(a.eip712.onchain).toMatchObject({ name: "USDC", version: "2" });
    expect(a.eip712.match).toEqual({ name: false, version: false, domain_separator: false });
    expect(codes(r)).toEqual(expect.arrayContaining(["eip712_name_mismatch", "eip712_version_mismatch", "no_input_definition"]));
  });

  it("non-402 responses are returned as they are", async () => {
    const ok: any = await inspect402({ url: `${seller.url}/free` });
    expect(ok).toMatchObject({ status: 200, is_402: false });
    expect(ok.headers["cache-control"]).toBe("public, max-age=60");
    expect(ok.body_head).toBe('{"price":1}');
    expect(ok.findings).toBeUndefined();
    const nf: any = await inspect402({ url: `${seller.url}/missing` });
    expect(nf).toMatchObject({ status: 404, is_402: false, body_head: "not found" });
  });

  it("reads x402 v1 requirements from the body, including the input schema", async () => {
    const r: any = await inspect402({ url: `${seller.url}/v1`, method: "POST", body: '{"q":"x"}' });
    expect(r.payment_required).toMatchObject({ source: "body", x402Version: 1 });
    expect(r.accepts[0]).toMatchObject({ network_caip2: "eip155:84532", amount: "5000", amount_human: "0.005" });
    expect(r.input_definition.where).toEqual(["accepts[0].outputSchema.input"]);
    expect(seller.requests.at(-1)).toMatchObject({ method: "POST", body: '{"q":"x"}' });
  });

  it("JPYC: no version getter, so the documented domain is used and labeled as such", async () => {
    const ok: any = await inspect402({ url: `${seller.url}/jpyc`, listed_price: "1" });
    const a = ok.accepts[0];
    expect(a).toMatchObject({ unit: "JPYC", amount_human: "1" });
    expect(a.eip712.onchain).toMatchObject({ name: "JPY Coin", version: "1", version_source: expect.stringMatching(/^documented/), domain_separator: null });
    expect(a.eip712.match).toEqual({ name: true, version: true, domain_separator: null });
    expect(ok.findings.filter((f: any) => f.level === "error")).toEqual([]);
    const bad: any = await inspect402({ url: `${seller.url}/jpyc?v=2` });
    expect(codes(bad)).toContain("eip712_version_mismatch");
  });

  it("flags an asset that belongs to another network", async () => {
    const r: any = await inspect402({ url: `${seller.url}/wrongnet` });
    expect(codes(r)).toContain("asset_network_mismatch");
  });

  it("refuses methods other than GET, HEAD and POST", async () => {
    await expect(inspect402({ url: `${seller.url}/ok`, method: "DELETE" })).rejects.toThrow(/not allowed/);
    await expect(inspect402({ url: "file:///etc/passwd" })).rejects.toThrow(/http/);
  });
});

describe("powerOfTenRatio", () => {
  it("returns the exponent only for exact powers of ten", () => {
    expect(powerOfTenRatio(10_000_000n, 10_000n)).toBe(3);
    expect(powerOfTenRatio(100n, 10_000n)).toBe(-2);
    expect(powerOfTenRatio(15_000n, 10_000n)).toBeNull();
    expect(powerOfTenRatio(10_000n, 10_000n)).toBeNull();
  });
});
