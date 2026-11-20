import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFacilitatorSigners, supportedUrl } from "../server/src/tools/facilitator.js";
import { startMock, type Mock } from "./helpers.js";

let fac: Mock;
beforeAll(async () => {
  fac = await startMock((req, _b, res) => {
    if (req.url === "/facilitator/supported") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          kinds: [
            { x402Version: 2, scheme: "exact", network: "eip155:84532" },
            { x402Version: 2, scheme: "exact", network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", extra: { feePayer: "FeePayer111111111111111111111111111111111" } },
          ],
          extensions: [],
          signers: { "eip155:*": ["0x00000000000000000000000000000000000000aa"], "solana:*": ["FeePayer111111111111111111111111111111111"] },
        }),
      );
    }
    if (req.url === "/old/supported") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ kinds: [{ x402Version: 1, scheme: "exact", network: "base-sepolia" }] }));
    }
    res.writeHead(404);
    res.end("nope");
  });
});
afterAll(() => fac.close());

describe("get_facilitator_signers", () => {
  it("builds the /supported URL", () => {
    expect(supportedUrl("https://x402.org/facilitator")).toBe("https://x402.org/facilitator/supported");
    expect(supportedUrl("https://x402.org/facilitator/")).toBe("https://x402.org/facilitator/supported");
    expect(supportedUrl("https://f.test/supported")).toBe("https://f.test/supported");
  });
  it("returns signers, fee payers and kinds", async () => {
    const r: any = await getFacilitatorSigners(`${fac.url}/facilitator`);
    expect(r.ok).toBe(true);
    expect(r.signers["eip155:*"]).toEqual(["0x00000000000000000000000000000000000000aa"]);
    expect(r.fee_payers).toEqual([{ network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", feePayer: "FeePayer111111111111111111111111111111111" }]);
    expect(r.kinds).toHaveLength(2);
  });
  it("notes when no signers are published", async () => {
    const r: any = await getFacilitatorSigners(`${fac.url}/old`);
    expect(r.signers).toBeNull();
    expect(r.note).toMatch(/no signers/);
  });
  it("returns the status when /supported fails", async () => {
    const r: any = await getFacilitatorSigners(`${fac.url}/none`);
    expect(r).toMatchObject({ ok: false, status: 404, body_head: "nope" });
  });
});
