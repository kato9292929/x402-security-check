export declare const SELECTORS: {
    readonly name: "0x06fdde03";
    readonly version: "0x54fd4d50";
    readonly decimals: "0x313ce567";
    readonly eip712Domain: "0x84b0196e";
    readonly DOMAIN_SEPARATOR: "0x3644e515";
};
/** The EIP-712 domain separator for (name, version, chainId, verifyingContract), as 0x-hex. */
export declare function domainSeparator(name: string, version: string, chainId: bigint | number, verifyingContract: string): string;
/** Host only, so a key embedded in an RPC URL never reaches the output. */
export declare const rpcLabel: (url: string) => string;
export declare function ethCall(network: string, to: string, data: string, timeoutMs?: number): Promise<{
    result: string;
    rpc: string;
}>;
/** Decodes an ABI `string` return value (also tolerates legacy bytes32). */
export declare function decodeString(hex: string): string | null;
export declare function decodeUint(hex: string): bigint | null;
/** Decodes eip712Domain() (EIP-5267): (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, ...). */
export declare function decodeEip712Domain(hex: string): {
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: string;
} | null;
export interface TokenDomain {
    name: string | null;
    version: string | null;
    decimals: number | null;
    /** DOMAIN_SEPARATOR() when the token has it (0x-hex), else null. */
    separator: string | null;
    source: "eip712Domain" | "name/version";
    rpc: string;
}
/** Reads name, version, decimals and DOMAIN_SEPARATOR. Prefers eip712Domain() when the token implements it. */
export declare function readTokenDomain(network: string, token: string): Promise<TokenDomain>;
