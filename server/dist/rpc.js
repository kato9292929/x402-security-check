/**
 * Read-only EVM JSON-RPC: eth_call against token contracts to read the EIP-712 domain.
 * Never signs or sends a transaction.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { rpcUrls } from "./chains.js";
export const SELECTORS = {
    name: "0x06fdde03",
    version: "0x54fd4d50",
    decimals: "0x313ce567",
    eip712Domain: "0x84b0196e",
    DOMAIN_SEPARATOR: "0x3644e515",
};
const keccak = (b) => Buffer.from(keccak_256(typeof b === "string" ? Buffer.from(b, "utf8") : b));
const EIP712_DOMAIN_TYPEHASH = keccak("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
/** The EIP-712 domain separator for (name, version, chainId, verifyingContract), as 0x-hex. */
export function domainSeparator(name, version, chainId, verifyingContract) {
    const enc = Buffer.concat([
        EIP712_DOMAIN_TYPEHASH,
        keccak(name),
        keccak(version),
        Buffer.from(BigInt(chainId).toString(16).padStart(64, "0"), "hex"),
        Buffer.from(verifyingContract.replace(/^0x/, "").toLowerCase().padStart(64, "0"), "hex"),
    ]);
    return "0x" + keccak(enc).toString("hex");
}
/** Host only, so a key embedded in an RPC URL never reaches the output. */
export const rpcLabel = (url) => {
    try {
        return new URL(url).host;
    }
    catch {
        return "?";
    }
};
export async function ethCall(network, to, data, timeoutMs = 8000) {
    const urls = rpcUrls(network);
    if (!urls.length)
        throw new Error(`no RPC known for ${network} (set X402SC_RPC_URL_<chain id>)`);
    const errors = [];
    for (const url of urls) {
        try {
            const r = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            const j = await r.json().catch(() => null);
            if (j?.error) {
                // A revert is an answer (the function does not exist), not an RPC failure.
                if (/revert|execution/i.test(String(j.error.message ?? "")))
                    return { result: "0x", rpc: rpcLabel(url) };
                errors.push(`${rpcLabel(url)}: ${j.error.message ?? "error"}`);
                continue;
            }
            if (!r.ok || typeof j?.result !== "string") {
                errors.push(`${rpcLabel(url)}: HTTP ${r.status}`);
                continue;
            }
            return { result: j.result, rpc: rpcLabel(url) };
        }
        catch (e) {
            errors.push(`${rpcLabel(url)}: ${e.message}`);
        }
    }
    throw new Error(`all RPCs failed: ${errors.join("; ")}`);
}
const hexBytes = (hex) => Buffer.from(hex.replace(/^0x/, ""), "hex");
/** Decodes an ABI `string` return value (also tolerates legacy bytes32). */
export function decodeString(hex) {
    const b = hexBytes(hex);
    if (b.length === 0)
        return null;
    if (b.length === 32)
        return b.toString("utf8").replace(/\0+$/, "");
    if (b.length < 64)
        return null;
    const offset = Number(BigInt("0x" + b.subarray(0, 32).toString("hex")));
    if (offset + 32 > b.length)
        return null;
    const len = Number(BigInt("0x" + b.subarray(offset, offset + 32).toString("hex")));
    if (offset + 32 + len > b.length)
        return null;
    return b.subarray(offset + 32, offset + 32 + len).toString("utf8");
}
export function decodeUint(hex) {
    const b = hexBytes(hex);
    if (b.length < 32)
        return null;
    return BigInt("0x" + b.subarray(0, 32).toString("hex"));
}
/** Decodes eip712Domain() (EIP-5267): (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, ...). */
export function decodeEip712Domain(hex) {
    const b = hexBytes(hex);
    if (b.length < 32 * 5)
        return null;
    const word = (i) => b.subarray(i * 32, (i + 1) * 32);
    const strAt = (offset) => {
        const len = Number(BigInt("0x" + b.subarray(offset, offset + 32).toString("hex")));
        return b.subarray(offset + 32, offset + 32 + len).toString("utf8");
    };
    try {
        const name = strAt(Number(BigInt("0x" + word(1).toString("hex"))));
        const version = strAt(Number(BigInt("0x" + word(2).toString("hex"))));
        const chainId = BigInt("0x" + word(3).toString("hex"));
        const verifyingContract = "0x" + word(4).subarray(12).toString("hex");
        return { name, version, chainId, verifyingContract };
    }
    catch {
        return null;
    }
}
/** Reads name, version, decimals and DOMAIN_SEPARATOR. Prefers eip712Domain() when the token implements it. */
export async function readTokenDomain(network, token) {
    const [dom, dec, sep] = await Promise.all([
        ethCall(network, token, SELECTORS.eip712Domain).catch(() => null),
        ethCall(network, token, SELECTORS.decimals),
        ethCall(network, token, SELECTORS.DOMAIN_SEPARATOR).catch(() => null),
    ]);
    const decimalsRaw = decodeUint(dec.result);
    const decimals = decimalsRaw === null ? null : Number(decimalsRaw);
    const separator = sep && /^0x[0-9a-f]{64}$/i.test(sep.result) ? sep.result.toLowerCase() : null;
    const d = dom && dom.result !== "0x" ? decodeEip712Domain(dom.result) : null;
    if (d)
        return { name: d.name, version: d.version, decimals, separator, source: "eip712Domain", rpc: dom.rpc };
    const [n, v] = await Promise.all([
        ethCall(network, token, SELECTORS.name),
        ethCall(network, token, SELECTORS.version).catch(() => ({ result: "0x", rpc: dec.rpc })),
    ]);
    return { name: decodeString(n.result), version: decodeString(v.result), decimals, separator, source: "name/version", rpc: n.rpc };
}
