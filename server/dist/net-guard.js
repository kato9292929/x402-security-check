/**
 * Outbound requests to user-supplied URLs from a server on the public internet.
 *
 * - https only.
 * - The host name is resolved first and every address is checked: loopback, private,
 *   link-local (cloud metadata lives here), carrier-grade NAT, multicast, reserved and the
 *   IPv6 equivalents (including IPv4-mapped / NAT64 / 6to4 forms) are refused.
 * - The connection is made to the address that was checked (no second lookup), so a DNS
 *   answer that changes between the check and the connection cannot reach an internal host.
 * - Redirects are not followed, the body is capped and the whole request has a timeout.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
const blocked = new BlockList();
// IPv4
for (const [net, bits] of [
    ["0.0.0.0", 8], // "this network"
    ["10.0.0.0", 8], // private
    ["100.64.0.0", 10], // carrier-grade NAT (also Alibaba Cloud metadata 100.100.100.200)
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local (AWS/GCP/Azure metadata 169.254.169.254)
    ["172.16.0.0", 12], // private
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // documentation
    ["192.88.99.0", 24], // 6to4 relay anycast
    ["192.168.0.0", 16], // private
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // documentation
    ["203.0.113.0", 24], // documentation
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved, broadcast
])
    blocked.addSubnet(net, bits, "ipv4");
// IPv6
for (const [net, bits] of [
    ["::", 128], // unspecified
    ["::1", 128], // loopback
    ["100::", 64], // discard
    ["2001:db8::", 32], // documentation
    ["fc00::", 7], // unique local (AWS metadata fd00:ec2::254)
    ["fe80::", 10], // link-local
    ["fec0::", 10], // site-local (deprecated)
    ["ff00::", 8], // multicast
])
    blocked.addSubnet(net, bits, "ipv6");
/** IPv4 address embedded in an IPv6 form that routes to it (mapped, compatible, NAT64, 6to4). */
function embeddedIPv4(ip) {
    const lower = ip.toLowerCase();
    const dotted = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (dotted)
        return dotted[1];
    const groups = expandIPv6(lower);
    if (!groups)
        return null;
    const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    const zero = (from, to) => groups.slice(from, to).every((g) => g === 0);
    if (zero(0, 5) && groups[5] === 0xffff)
        return v4(groups[6], groups[7]); // ::ffff:a.b.c.d
    if (zero(0, 6) && (groups[6] !== 0 || groups[7] > 1))
        return v4(groups[6], groups[7]); // ::a.b.c.d
    if (groups[0] === 0x64 && groups[1] === 0xff9b && zero(2, 6))
        return v4(groups[6], groups[7]); // NAT64
    if (groups[0] === 0x2002)
        return v4(groups[1], groups[2]); // 6to4
    return null;
}
function expandIPv6(ip) {
    if (isIP(ip) !== 6)
        return null;
    let s = ip.split("%")[0];
    const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (v4) {
        const p = v4[1].split(".").map(Number);
        s = s.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
    }
    const [head, tail] = s.split("::");
    const h = head ? head.split(":") : [];
    const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
    const fill = tail !== undefined ? 8 - h.length - t.length : 0;
    const all = [...h, ...Array(fill).fill("0"), ...t].map((g) => parseInt(g, 16));
    return all.length === 8 && all.every((n) => n >= 0 && n <= 0xffff) ? all : null;
}
/** Why an address may not be contacted, or null when it is a public address. */
export function blockedReason(ip) {
    const family = isIP(ip);
    if (family === 0)
        return "not an IP address";
    if (family === 4)
        return blocked.check(ip, "ipv4") ? "internal or reserved IPv4 address" : null;
    const inner = embeddedIPv4(ip);
    if (inner && blocked.check(inner, "ipv4"))
        return "IPv6 form of an internal IPv4 address";
    return blocked.check(ip, "ipv6") ? "internal or reserved IPv6 address" : null;
}
export class BlockedUrlError extends Error {
    constructor(message) {
        super(message);
        this.name = "BlockedUrlError";
    }
}
const defaultResolver = (host) => dnsLookup(host, { all: true, verbatim: true });
/** Checks the URL and resolves its host. Throws BlockedUrlError when it may not be contacted. */
export async function checkUrl(raw, opts = {}) {
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        throw new BlockedUrlError(`not a URL: ${raw}`);
    }
    if (u.protocol !== "https:")
        throw new BlockedUrlError("only https URLs are allowed");
    if (u.username || u.password)
        throw new BlockedUrlError("URLs with credentials are not allowed");
    if (u.port && u.port !== "443")
        throw new BlockedUrlError("only port 443 is allowed");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host))
        throw new BlockedUrlError(`host ${host} is internal`);
    const allow = new Set(opts.allowAddresses ?? []);
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await (opts.resolver ?? defaultResolver)(host).catch(() => []);
    if (!addresses.length)
        throw new BlockedUrlError(`cannot resolve ${host}`);
    for (const a of addresses) {
        const why = allow.has(a.address) ? null : blockedReason(a.address);
        if (why)
            throw new BlockedUrlError(`${host} resolves to ${a.address} (${why})`);
    }
    return { url: u, host, address: addresses[0] };
}
/** One https request to a checked address. Redirects are returned, not followed. */
export async function guardedRequest(raw, opts) {
    const { url, host, address } = await checkUrl(raw, opts);
    // Connect to the checked address only.
    const pinned = (_h, o, cb) => {
        if (o?.all)
            cb(null, [address]);
        else
            cb(null, address.address, address.family);
    };
    return new Promise((resolve, reject) => {
        const req = httpsRequest({
            protocol: "https:",
            hostname: host,
            port: opts.port ?? 443,
            path: url.pathname + url.search,
            method: opts.method ?? "GET",
            headers: { ...(opts.headers ?? {}), host: url.host },
            lookup: pinned,
            servername: isIP(host) ? undefined : host,
            ca: opts.ca,
            timeout: opts.timeoutMs,
        }, (res) => {
            const chunks = [];
            let size = 0;
            let truncated = false;
            res.on("data", (c) => {
                if (truncated)
                    return;
                size += c.length;
                if (size > opts.maxBodyBytes) {
                    chunks.push(c.subarray(0, c.length - (size - opts.maxBodyBytes)));
                    truncated = true;
                    res.destroy();
                    finish();
                    return;
                }
                chunks.push(c);
            });
            let done = false;
            const finish = () => {
                if (done)
                    return;
                done = true;
                const headers = {};
                for (const [k, v] of Object.entries(res.headers))
                    if (v !== undefined)
                        headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
                resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8"), truncated, address: address.address });
            };
            res.on("end", finish);
            res.on("error", (e) => (done ? undefined : reject(e)));
        });
        const timer = setTimeout(() => req.destroy(new Error(`timed out after ${opts.timeoutMs} ms`)), opts.timeoutMs);
        req.on("timeout", () => req.destroy(new Error(`timed out after ${opts.timeoutMs} ms`)));
        req.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
        });
        req.on("close", () => clearTimeout(timer));
        if (opts.body !== undefined)
            req.write(opts.body);
        req.end();
    });
}
