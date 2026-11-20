const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const NETWORKS = {
    "eip155:1": { caip2: "eip155:1", name: "Ethereum", family: "evm", testnet: false, rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"] },
    "eip155:8453": { caip2: "eip155:8453", name: "Base", family: "evm", testnet: false, rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.drpc.org"] },
    "eip155:84532": { caip2: "eip155:84532", name: "Base Sepolia", family: "evm", testnet: true, rpcs: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"] },
    "eip155:137": { caip2: "eip155:137", name: "Polygon", family: "evm", testnet: false, rpcs: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"] },
    "eip155:80002": { caip2: "eip155:80002", name: "Polygon Amoy", family: "evm", testnet: true, rpcs: ["https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com"] },
    "eip155:43114": { caip2: "eip155:43114", name: "Avalanche C-Chain", family: "evm", testnet: false, rpcs: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"] },
    "eip155:43113": { caip2: "eip155:43113", name: "Avalanche Fuji", family: "evm", testnet: true, rpcs: ["https://api.avax-test.network/ext/bc/C/rpc"] },
    "eip155:11155111": { caip2: "eip155:11155111", name: "Ethereum Sepolia", family: "evm", testnet: true, rpcs: ["https://ethereum-sepolia-rpc.publicnode.com"] },
    [SOLANA]: { caip2: SOLANA, name: "Solana", family: "solana", testnet: false, rpcs: [] },
    [SOLANA_DEVNET]: { caip2: SOLANA_DEVNET, name: "Solana Devnet", family: "solana", testnet: true, rpcs: [] },
};
/** x402 v1 network names. */
const V1_NAMES = {
    ethereum: "eip155:1",
    base: "eip155:8453",
    "base-sepolia": "eip155:84532",
    polygon: "eip155:137",
    "polygon-amoy": "eip155:80002",
    avalanche: "eip155:43114",
    "avalanche-fuji": "eip155:43113",
    sepolia: "eip155:11155111",
    solana: SOLANA,
    "solana-devnet": SOLANA_DEVNET,
};
const JPYC_DOMAIN = { name: "JPY Coin", version: "1" };
export const KNOWN_TOKENS = [
    { network: "eip155:1", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: "eip155:8453", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: "eip155:84532", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: "eip155:137", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: "eip155:80002", address: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: "eip155:43114", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: "eip155:43113", address: "0x5425890298aed601595a70AB815c96711a31Bc65", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: "eip155:11155111", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: SOLANA, address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6, peg: "USD" },
    { network: SOLANA_DEVNET, address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", symbol: "USDC", decimals: 6, peg: "USD" },
    // JPYC (same address on each chain it is deployed to).
    { network: "eip155:1", address: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29", symbol: "JPYC", decimals: 18, peg: "JPY", documentedDomain: JPYC_DOMAIN },
    { network: "eip155:137", address: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29", symbol: "JPYC", decimals: 18, peg: "JPY", documentedDomain: JPYC_DOMAIN },
    { network: "eip155:43114", address: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29", symbol: "JPYC", decimals: 18, peg: "JPY", documentedDomain: JPYC_DOMAIN },
];
export function normalizeNetwork(network) {
    return V1_NAMES[network] ?? network;
}
export function networkInfo(network) {
    return NETWORKS[normalizeNetwork(network)];
}
export function familyOf(network) {
    const n = normalizeNetwork(network);
    if (n.startsWith("eip155:"))
        return "evm";
    if (n.startsWith("solana:"))
        return "solana";
    return undefined;
}
const sameAddress = (family, a, b) => family === "evm" ? a.toLowerCase() === b.toLowerCase() : a === b;
/** Tokens with this address on any network. */
export function tokensByAddress(asset) {
    return KNOWN_TOKENS.filter((t) => sameAddress(familyOf(t.network), t.address, asset));
}
export function knownToken(network, asset) {
    const n = normalizeNetwork(network);
    return KNOWN_TOKENS.find((t) => t.network === n && sameAddress(familyOf(n), t.address, asset));
}
/** RPC URLs for an EVM network: X402SC_RPC_URL_<chainId> first, then the public list. */
export function rpcUrls(network) {
    const n = normalizeNetwork(network);
    const id = n.startsWith("eip155:") ? n.slice(7) : "";
    const env = id ? process.env[`X402SC_RPC_URL_${id}`]?.trim() : undefined;
    const list = env ? env.split(",").map((s) => s.trim()).filter(Boolean) : [];
    // An explicit override replaces the public list (tests, private nodes).
    return list.length ? list : (NETWORKS[n]?.rpcs ?? []);
}
