import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeString, readTokenDomain } from "../server/src/rpc.js";
import { abiString, rpcHandler, startMock, type Mock } from "./helpers.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const LEGACY = "0x2222222222222222222222222222222222222222";
let rpc: Mock;

beforeAll(async () => {
  rpc = await startMock(
    rpcHandler({
      [TOKEN]: { name: "JPY Coin", version: "1", decimals: 18, eip5267: true },
      [LEGACY]: { name: "USDC", version: "2", decimals: 6 },
    }),
  );
  process.env.X402SC_RPC_URL_84532 = `${rpc.url}`;
});
afterAll(async () => {
  delete process.env.X402SC_RPC_URL_84532;
  await rpc.close();
});

describe("readTokenDomain", () => {
  it("prefers EIP-5267 eip712Domain()", async () => {
    const d = await readTokenDomain("eip155:84532", TOKEN);
    expect(d).toMatchObject({ name: "JPY Coin", version: "1", decimals: 18, source: "eip712Domain" });
  });
  it("falls back to name() / version()", async () => {
    const d = await readTokenDomain("eip155:84532", LEGACY);
    expect(d).toMatchObject({ name: "USDC", version: "2", decimals: 6, source: "name/version" });
    expect(d.rpc).toMatch(/^127\.0\.0\.1:\d+$/);
  });
  it("decodes ABI strings and bytes32", () => {
    expect(decodeString(abiString("USD Coin"))).toBe("USD Coin");
    expect(decodeString("0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0"))).toBe("MKR");
    expect(decodeString("0x")).toBeNull();
  });
});
