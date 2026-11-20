/**
 * inspect_402: requests a URL without any payment header and reports what came back.
 * For a 402 it decodes PAYMENT-REQUIRED (v2) or the JSON body (v1) and, for each entry of
 * `accepts`, converts the amount, checks the network/asset pair and compares the declared
 * EIP-712 domain (extra.name / extra.version) with the one read from the token contract.
 * Any other status is returned as is; judging it is left to the skill.
 */
import { familyOf, knownToken, networkInfo, normalizeNetwork, tokensByAddress } from "../chains.js";
import { httpRequest } from "../http.js";
import { domainSeparator, readTokenDomain, type TokenDomain } from "../rpc.js";

export type Level = "error" | "warn" | "info";

export interface Finding {
  level: Level;
  /** Skill item number. */
  item: number;
  /** Issue ID from data/issues.json. */
  issue?: string;
  code: string;
  message: string;
  accepts_index?: number;
}

const SHOWN_HEADERS = [
  "content-type",
  "cache-control",
  "payment-required",
  "payment-response",
  "x-payment-response",
  "www-authenticate",
  "location",
  "access-control-expose-headers",
  "access-control-allow-origin",
  "vary",
  "age",
  "x-cache",
  "cf-cache-status",
];

const BODY_HEAD = 2000;

function decodeB64Json(v: string): unknown {
  const s = v.trim();
  try {
    return JSON.parse(Buffer.from(s, "base64").toString("utf8"));
  } catch {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  }
}

/** "0.01", "$0.01", "1 JPYC" -> decimal string, or null. */
export function parseListedPrice(v: string): string | null {
  const m = /^\s*[$¥]?\s*(\d+(?:\.\d+)?)\s*(?:usd|usdc|jpy|jpyc|円)?\s*$/i.exec(v);
  return m ? m[1] : null;
}

/** Atomic integer -> decimal string with `decimals` places, trailing zeros removed. */
export function formatUnits(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Decimal string -> atomic units, or null when it has more places than `decimals`. */
export function toAtomic(value: string, decimals: number): bigint | null {
  const [w, f = ""] = value.split(".");
  if (f.length > decimals && /[1-9]/.test(f.slice(decimals))) return null;
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** If a/b is an exact power of ten (other than 1), return the exponent (signed). */
export function powerOfTenRatio(a: bigint, b: bigint): number | null {
  if (a === 0n || b === 0n || a === b) return null;
  const [big, small, sign] = a > b ? [a, b, 1] : [b, a, -1];
  if (big % small !== 0n) return null;
  let q = big / small;
  let n = 0;
  while (q % 10n === 0n) {
    q /= 10n;
    n++;
  }
  return q === 1n ? n * sign : null;
}

function inputDefinition(pr: Record<string, any>, accepts: Record<string, any>[]) {
  const where: string[] = [];
  const bazaar = pr?.extensions?.bazaar;
  if (bazaar?.info?.input !== undefined) where.push("extensions.bazaar.info.input");
  if (bazaar?.schema !== undefined) where.push("extensions.bazaar.schema");
  accepts.forEach((a, i) => {
    if (a?.outputSchema?.input !== undefined) where.push(`accepts[${i}].outputSchema.input`);
    if (a?.extra?.input !== undefined) where.push(`accepts[${i}].extra.input`);
  });
  const sample = bazaar?.info?.input ?? accepts.find((a) => a?.outputSchema?.input)?.outputSchema?.input;
  return { present: where.length > 0, where, input: sample };
}

export interface InspectOptions {
  url: string;
  method?: string;
  body?: string;
  content_type?: string;
  listed_price?: string;
  timeoutMs?: number;
}

export async function inspect402(opts: InspectOptions) {
  const method = (opts.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "POST"].includes(method)) throw new Error(`method ${method} is not allowed (GET, HEAD or POST)`);
  if (opts.body !== undefined && method !== "POST") throw new Error("a body can only be sent with POST");
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = opts.content_type ?? "application/json";

  const res = await httpRequest(opts.url, { method, body: opts.body, headers, timeoutMs: opts.timeoutMs });
  const shown: Record<string, string> = {};
  for (const h of SHOWN_HEADERS) if (res.headers[h] !== undefined) shown[h] = res.headers[h];
  const base = {
    url: opts.url,
    method,
    status: res.status,
    headers: shown,
    body_head: res.body.slice(0, BODY_HEAD),
    body_truncated: res.truncated || res.body.length > BODY_HEAD,
    sent_payment_header: false,
  };

  if (res.status !== 402) {
    return {
      ...base,
      is_402: false,
      note:
        res.status >= 300 && res.status < 400
          ? "Redirect returned as is (not followed)."
          : `HTTP ${res.status} without a payment header. Returned as is; whether this is expected is for the skill to judge.`,
    };
  }

  const findings: Finding[] = [];
  let pr: Record<string, any> | undefined;
  let source: "header" | "body" | undefined;
  const header = res.headers["payment-required"];
  if (header) {
    try {
      const d = decodeB64Json(header);
      if (d && typeof d === "object") {
        pr = d as Record<string, any>;
        source = "header";
      }
    } catch {
      findings.push({ level: "error", item: 2, code: "payment_required_undecodable", message: "PAYMENT-REQUIRED header is not base64 JSON." });
    }
  }
  if (!pr) {
    try {
      const d = JSON.parse(res.body);
      if (d && typeof d === "object" && Array.isArray(d.accepts)) {
        pr = d;
        source = "body";
      }
    } catch {
      // not JSON
    }
  }
  if (!pr || !Array.isArray(pr.accepts)) {
    findings.push({
      level: "error",
      item: 2,
      issue: "S6",
      code: "no_payment_requirements",
      message: "402 without x402 payment requirements (no PAYMENT-REQUIRED header and no JSON body with accepts).",
    });
    return { ...base, is_402: true, payment_required: null, accepts: [], input_definition: null, findings };
  }

  // The decoded object is returned below; keep the header short.
  if (source === "header") base.headers["payment-required"] = `(base64, ${header!.length} chars; decoded in payment_required.raw)`;
  const version = typeof pr.x402Version === "number" ? pr.x402Version : source === "header" ? 2 : 1;
  if (source === "body" && version >= 2)
    findings.push({ level: "warn", item: 2, code: "v2_in_body", message: "x402Version 2 requirements are in the body; v2 clients read the PAYMENT-REQUIRED header." });

  const accepts = pr.accepts as Record<string, any>[];
  if (accepts.length === 0) findings.push({ level: "error", item: 2, code: "empty_accepts", message: "accepts is empty." });

  const listed = opts.listed_price !== undefined ? parseListedPrice(opts.listed_price) : null;
  if (opts.listed_price !== undefined && listed === null)
    findings.push({ level: "info", item: 2, code: "listed_price_unparsed", message: `listed_price "${opts.listed_price}" was not understood; give a number such as 0.01.` });

  const domainCache = new Map<string, Promise<TokenDomain>>();
  const out = [];
  for (let i = 0; i < accepts.length; i++) {
    const a = accepts[i] ?? {};
    const f = (level: Level, code: string, message: string, issue?: string) =>
      findings.push({ level, item: 2, issue, code, message, accepts_index: i });

    const networkRaw = String(a.network ?? "");
    const network = normalizeNetwork(networkRaw);
    const info = networkInfo(network);
    const family = familyOf(network);
    const asset = a.asset === undefined ? undefined : String(a.asset);
    const amountRaw = version === 1 ? (a.maxAmountRequired ?? a.amount) : (a.amount ?? a.maxAmountRequired);
    const amountStr = amountRaw === undefined || amountRaw === null ? undefined : String(amountRaw);
    const extra = a.extra && typeof a.extra === "object" ? a.extra : {};

    if (!info) f("warn", "unknown_network", `network ${networkRaw || "(missing)"} is not one this tool knows.`);
    if (info?.testnet) f("info", "testnet", `network is a testnet (${info.name}). Fine for staging; production should use a mainnet.`);

    // network / asset pair
    let token = asset ? knownToken(network, asset) : undefined;
    const elsewhere = asset && !token ? tokensByAddress(asset) : [];
    const assetCheck: Record<string, unknown> = { known: !!token, symbol: token?.symbol, decimals: token?.decimals };
    if (!asset) f("error", "missing_asset", "asset is missing.", "S6");
    else if (elsewhere.length)
      f(
        "error",
        "asset_network_mismatch",
        `asset ${asset} is ${elsewhere.map((t) => `${t.symbol} on ${networkInfo(t.network)?.name ?? t.network}`).join(", ")}, but network is ${info?.name ?? networkRaw}.`,
        "S6",
      );
    else if (!token) f("info", "unknown_asset", `asset ${asset} is not a token this tool knows (USDC, JPYC). Decimals are read from the chain.`);
    if (asset && family === "evm" && !/^0x[0-9a-fA-F]{40}$/.test(asset)) f("error", "asset_not_evm_address", `asset ${asset} is not an EVM address.`, "S6");
    if (a.payTo === undefined || a.payTo === "") f("error", "missing_payto", "payTo is missing.");
    else if (family === "evm" && !/^0x[0-9a-fA-F]{40}$/.test(String(a.payTo))) f("error", "payto_not_evm_address", `payTo ${a.payTo} is not an EVM address.`);
    else if (family === "solana" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a.payTo))) f("error", "payto_not_solana_address", `payTo ${a.payTo} is not a Solana address.`);

    // EIP-712 domain
    let eip712: Record<string, unknown> | undefined;
    let decimals = token?.decimals;
    if (family === "evm" && asset && /^0x[0-9a-fA-F]{40}$/.test(asset)) {
      const declared = { name: extra.name ?? null, version: extra.version ?? null };
      if (a.scheme === "exact" && (declared.name === null || declared.version === null))
        f("error", "eip712_missing", "extra.name / extra.version are missing; buyers cannot build the EIP-3009 signature without them.", "S6");
      const key = `${network}|${asset.toLowerCase()}`;
      if (!domainCache.has(key)) domainCache.set(key, readTokenDomain(network, asset));
      try {
        const onchain = await domainCache.get(key)!;
        if (onchain.decimals !== null) {
          if (token && token.decimals !== onchain.decimals)
            f("warn", "decimals_differ", `token reports ${onchain.decimals} decimals; expected ${token.decimals}.`);
          decimals = onchain.decimals;
        }
        // Separator check: the value buyers' signatures are verified against.
        const chainId = BigInt(network.slice("eip155:".length));
        const separatorMatch =
          onchain.separator && declared.name !== null && declared.version !== null
            ? domainSeparator(String(declared.name), String(declared.version), chainId, asset) === onchain.separator
            : null;
        let versionSource: string = onchain.version !== null ? onchain.source : "unreadable";
        let onchainVersion = onchain.version;
        if (onchainVersion === null && separatorMatch === true) {
          onchainVersion = String(declared.version);
          versionSource = "DOMAIN_SEPARATOR";
        } else if (onchainVersion === null && token?.documentedDomain) {
          onchainVersion = token.documentedDomain.version;
          versionSource = "documented (the contract exposes no version)";
        }
        const match = {
          name: declared.name === null || onchain.name === null ? null : declared.name === onchain.name,
          version: declared.version === null || onchainVersion === null ? null : String(declared.version) === onchainVersion,
          domain_separator: separatorMatch,
        };
        if (match.name === false)
          f("error", "eip712_name_mismatch", `extra.name is "${declared.name}" but the token's EIP-712 name is "${onchain.name}"; signatures will not verify.`, "S6");
        if (match.version === false)
          f("error", "eip712_version_mismatch", `extra.version is "${declared.version}" but the token's EIP-712 version is "${onchainVersion}" (${versionSource}); signatures will not verify.`, "S6");
        if (separatorMatch === false && match.name !== false && match.version !== false)
          f("error", "eip712_separator_mismatch", "extra.name / extra.version do not reproduce the token's DOMAIN_SEPARATOR; signatures will not verify.", "S6");
        if (onchainVersion === null && declared.version !== null)
          f("warn", "eip712_version_unverified", "The token exposes no version(), eip712Domain() or DOMAIN_SEPARATOR(); extra.version could not be checked on chain.", "S6");
        eip712 = {
          declared,
          onchain: { name: onchain.name, version: onchainVersion, version_source: versionSource, decimals: onchain.decimals, domain_separator: onchain.separator, read_with: onchain.source, rpc: onchain.rpc },
          match,
        };
      } catch (e) {
        f("warn", "eip712_unread", `could not read the token's domain: ${(e as Error).message}`);
        eip712 = { declared, onchain: null, error: (e as Error).message };
      }
    } else if (family === "solana") {
      if (a.scheme === "exact" && !extra.feePayer) f("warn", "svm_fee_payer_missing", "extra.feePayer is missing; exact on Solana needs the facilitator's fee payer.", "S6");
    }

    // amount
    let amountHuman: string | undefined;
    if (amountStr === undefined) f("error", "missing_amount", version === 1 ? "maxAmountRequired is missing." : "amount is missing.", "S5");
    else if (!/^\d+$/.test(amountStr))
      f("error", "amount_not_atomic", `amount "${amountStr}" is not an integer in the token's smallest unit (USDC: 6 decimals, 0.01 USDC = "10000").`, "S5");
    else if (decimals !== undefined) {
      const atomic = BigInt(amountStr);
      amountHuman = formatUnits(atomic, decimals);
      if (atomic === 0n) f("warn", "amount_zero", "amount is 0.", "S5");
      const peg = token?.peg;
      const highUsd = peg === "USD" && atomic >= 10n * 10n ** BigInt(decimals);
      const highJpy = peg === "JPY" && atomic >= 1000n * 10n ** BigInt(decimals);
      if (highUsd || highJpy)
        f("warn", "amount_unusually_high", `amount is ${amountHuman} ${token?.symbol} per call; check the decimals (${token?.symbol} has ${decimals}).`, "S5");
      if (listed !== null) {
        const listedAtomic = toAtomic(listed, decimals);
        if (listedAtomic === null) f("warn", "listed_price_too_precise", `listed price ${listed} has more than ${decimals} decimals.`, "S5");
        else if (listedAtomic !== atomic) {
          const p = powerOfTenRatio(atomic, listedAtomic);
          f(
            "error",
            p !== null ? "amount_decimal_shift" : "amount_differs_from_listed",
            p !== null
              ? `amount ${amountStr} = ${amountHuman} is 10^${p} times the listed price ${listed}: a decimals mistake (${token?.symbol ?? "token"} has ${decimals}).`
              : `amount ${amountStr} = ${amountHuman}, but the listed price is ${listed}.`,
            "S5",
          );
        }
      }
    }

    if (typeof a.maxTimeoutSeconds !== "number") f("info", "no_max_timeout", "maxTimeoutSeconds is not set.");

    out.push({
      index: i,
      scheme: a.scheme,
      network: networkRaw,
      network_caip2: network,
      network_name: info?.name,
      testnet: info?.testnet,
      asset,
      asset_check: assetCheck,
      amount: amountStr,
      amount_human: amountHuman,
      unit: token?.symbol,
      payTo: a.payTo,
      maxTimeoutSeconds: a.maxTimeoutSeconds,
      extra,
      eip712,
    });
  }

  const input = inputDefinition(pr, accepts);
  if (!input.present)
    findings.push({
      level: "warn",
      item: 2,
      issue: "B6",
      code: "no_input_definition",
      message: "No input definition (extensions.bazaar.info.input / schema, or accepts[].outputSchema.input). Buyers cannot tell which parameters to send.",
    });

  return {
    ...base,
    is_402: true,
    payment_required: {
      source,
      x402Version: version,
      error: pr.error,
      resource: pr.resource ?? (version === 1 ? accepts[0]?.resource : undefined),
      extensions: pr.extensions ? Object.keys(pr.extensions) : [],
      raw: pr,
    },
    accepts: out,
    input_definition: input,
    findings,
  };
}
