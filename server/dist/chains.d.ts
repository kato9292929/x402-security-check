/**
 * Networks (CAIP-2) and tokens the 402 inspection knows. The token table is used to check
 * that `asset` belongs to `network`; the EIP-712 domain itself is always read from the chain.
 */
export interface NetworkInfo {
    caip2: string;
    name: string;
    family: "evm" | "solana";
    testnet: boolean;
    /** Public RPCs, tried in order. Overridable with X402SC_RPC_URL_<chain id>. */
    rpcs: string[];
}
export interface KnownToken {
    network: string;
    address: string;
    symbol: "USDC" | "JPYC";
    decimals: number;
    /** Unit the token is pegged to. */
    peg: "USD" | "JPY";
    /**
     * EIP-712 domain from the issuer's documentation, used only when the contract exposes no
     * way to read it (no version(), eip712Domain() or DOMAIN_SEPARATOR()). JPYC is such a token.
     */
    documentedDomain?: {
        name: string;
        version: string;
    };
}
export declare const NETWORKS: Record<string, NetworkInfo>;
export declare const KNOWN_TOKENS: KnownToken[];
export declare function normalizeNetwork(network: string): string;
export declare function networkInfo(network: string): NetworkInfo | undefined;
export declare function familyOf(network: string): "evm" | "solana" | undefined;
/** Tokens with this address on any network. */
export declare function tokensByAddress(asset: string): KnownToken[];
export declare function knownToken(network: string, asset: string): KnownToken | undefined;
/** RPC URLs for an EVM network: X402SC_RPC_URL_<chainId> first, then the public list. */
export declare function rpcUrls(network: string): string[];
