import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface Mock {
  url: string;
  close: () => Promise<void>;
  requests: { method: string; path: string; headers: IncomingMessage["headers"]; body: string }[];
}

export async function startMock(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void): Promise<Mock> {
  const requests: Mock["requests"] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method ?? "", path: req.url ?? "", headers: req.headers, body });
      handler(req, body, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const strBytes = (s: string) => {
  const hex = Buffer.from(s, "utf8").toString("hex");
  return word(s.length ? Buffer.byteLength(s) : 0) + hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
};
export const abiString = (s: string) => "0x" + word(32) + strBytes(s);
export const abiUint = (n: number) => "0x" + word(n);

export interface MockToken {
  name: string;
  version: string;
  decimals: number;
  /** Implements EIP-5267 eip712Domain(). */
  eip5267?: boolean;
  /** Has no version() getter (like JPYC). */
  noVersion?: boolean;
  /** DOMAIN_SEPARATOR() return value (0x-hex); absent = the function does not exist. */
  separator?: string;
}

/** JSON-RPC mock answering eth_call for name(), version(), decimals(), eip712Domain(). */
export function rpcHandler(tokens: Record<string, MockToken>) {
  return (_req: IncomingMessage, body: string, res: ServerResponse) => {
    const j = JSON.parse(body);
    const [{ to, data }] = j.params;
    const t = tokens[String(to).toLowerCase()];
    const reply = (o: object) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: j.id, ...o }));
    };
    if (!t) return reply({ result: "0x" });
    switch (data) {
      case "0x06fdde03":
        return reply({ result: abiString(t.name) });
      case "0x54fd4d50":
        if (t.noVersion) return reply({ error: { code: 3, message: "execution reverted" } });
        return reply({ result: abiString(t.version) });
      case "0x3644e515":
        if (!t.separator) return reply({ error: { code: 3, message: "execution reverted" } });
        return reply({ result: t.separator });
      case "0x313ce567":
        return reply({ result: abiUint(t.decimals) });
      case "0x84b0196e": {
        if (!t.eip5267) return reply({ error: { code: 3, message: "execution reverted" } });
        // (bytes1, string, string, uint256, address, bytes32, uint256[])
        const head = 7 * 32;
        const nameEnc = strBytes(t.name);
        const verEnc = strBytes(t.version);
        const nameOff = head;
        const verOff = head + nameEnc.length / 2;
        const extOff = verOff + verEnc.length / 2;
        const out =
          "0x" +
          "0f".padEnd(64, "0") +
          word(nameOff) +
          word(verOff) +
          word(84532) +
          String(to).slice(2).toLowerCase().padStart(64, "0") +
          word(0) +
          word(extOff) +
          nameEnc +
          verEnc +
          word(0);
        return reply({ result: out });
      }
      default:
        return reply({ error: { code: 3, message: "execution reverted" } });
    }
  };
}
