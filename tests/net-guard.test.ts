import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { httpRequest, setNetworkPolicy } from "../server/src/http.js";
import { blockedReason, checkUrl, guardedRequest, type Resolver } from "../server/src/net-guard.js";
import { getFacilitatorSigners } from "../server/src/tools/facilitator.js";
import { inspect402 } from "../server/src/tools/inspect402.js";

const resolveTo =
  (...ips: string[]): Resolver =>
  async () =>
    ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

describe("blockedReason", () => {
  it.each([
    "127.0.0.1",
    "127.8.9.10",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // AWS / GCP / Azure metadata
    "100.100.100.200", // Alibaba Cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd00:ec2::254", // AWS metadata over IPv6
    "fc00::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe", // 169.254.169.254, hex form
    "64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
    "2002:0a00:0001::1", // 6to4 of 10.0.0.1
  ])("refuses %s", (ip) => expect(blockedReason(ip)).not.toBeNull());

  it.each(["8.8.8.8", "104.16.0.1", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(blockedReason(ip)).toBeNull(),
  );
});

describe("checkUrl", () => {
  it("accepts https only, on port 443, without credentials", async () => {
    await expect(checkUrl("http://example.com/", { resolver: resolveTo("93.184.215.14") })).rejects.toThrow(/only https/);
    await expect(checkUrl("https://example.com:8443/", { resolver: resolveTo("93.184.215.14") })).rejects.toThrow(/port 443/);
    await expect(checkUrl("https://u:p@example.com/", { resolver: resolveTo("93.184.215.14") })).rejects.toThrow(/credentials/);
    await expect(checkUrl("https://example.com/", { resolver: resolveTo("93.184.215.14") })).resolves.toMatchObject({ host: "example.com" });
  });

  it("refuses localhost names and literal internal addresses", async () => {
    await expect(checkUrl("https://localhost/")).rejects.toThrow(/internal/);
    await expect(checkUrl("https://api.localhost/")).rejects.toThrow(/internal/);
    await expect(checkUrl("https://127.0.0.1/")).rejects.toThrow(/internal/);
    await expect(checkUrl("https://[::1]/")).rejects.toThrow(/internal/);
    await expect(checkUrl("https://169.254.169.254/latest/meta-data/")).rejects.toThrow(/169\.254\.169\.254/);
  });

  it("decides on the resolved address, not the name", async () => {
    await expect(checkUrl("https://rebind.example/", { resolver: resolveTo("10.0.0.5") })).rejects.toThrow(/10\.0\.0\.5/);
    await expect(checkUrl("https://meta.example/", { resolver: resolveTo("169.254.169.254") })).rejects.toThrow(/internal/);
    await expect(checkUrl("https://v6.example/", { resolver: resolveTo("::ffff:192.168.0.10") })).rejects.toThrow(/internal/);
    // One bad address among good ones is enough to refuse.
    await expect(checkUrl("https://mixed.example/", { resolver: resolveTo("93.184.215.14", "127.0.0.1") })).rejects.toThrow(/127\.0\.0\.1/);
    await expect(checkUrl("https://nx.example/", { resolver: async () => [] })).rejects.toThrow(/cannot resolve/);
  });
});

// A local https server stands in for a public seller: the test allows its address explicitly.
let server: Server | undefined;
let port = 0;
let ca = "";
let opensslMissing = false;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "x402sc-tls-"));
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=seller.test",
      "-addext", "subjectAltName=DNS:seller.test", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
    ], { stdio: "ignore" });
  } catch {
    opensslMissing = true;
    return;
  }
  ca = readFileSync(join(dir, "cert.pem"), "utf8");
  server = createServer({ key: readFileSync(join(dir, "key.pem")), cert: ca }, (req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "https://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    if (req.url === "/big") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("x".repeat(50_000));
    }
    if (req.url === "/slow") return; // never answers
    res.writeHead(200, { "content-type": "application/json", "x-seen-auth": String(req.headers.authorization ?? "") });
    res.end(JSON.stringify({ ok: true, host: req.headers.host }));
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  port = (server!.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

const local = () => ({ resolver: resolveTo("127.0.0.1"), allowAddresses: ["127.0.0.1"], port, ca, timeoutMs: 2000, maxBodyBytes: 10_000 });

describe("guardedRequest (local https server)", () => {
  it.skipIf(opensslMissing)("connects to the checked address and reads the response", async () => {
    const r = await guardedRequest("https://seller.test/ok", local());
    expect(r).toMatchObject({ status: 200, address: "127.0.0.1", truncated: false });
    expect(JSON.parse(r.body)).toEqual({ ok: true, host: "seller.test" });
  });

  it.skipIf(opensslMissing)("returns a redirect without following it", async () => {
    const r = await guardedRequest("https://seller.test/redirect", local());
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("https://169.254.169.254/latest/meta-data/");
  });

  it.skipIf(opensslMissing)("caps the body", async () => {
    const r = await guardedRequest("https://seller.test/big", local());
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(10_000);
  });

  it.skipIf(opensslMissing)("times out", async () => {
    await expect(guardedRequest("https://seller.test/slow", { ...local(), timeoutMs: 300 })).rejects.toThrow(/timed out/);
  });

  it("without the test allowance, the same address is refused", async () => {
    await expect(guardedRequest("https://seller.test/ok", { ...local(), allowAddresses: [] })).rejects.toThrow(/127\.0\.0\.1/);
  });
});

describe("public network policy (the remote server)", () => {
  afterEach(() => setNetworkPolicy("local"));

  it("tools refuse http, internal hosts and metadata addresses", async () => {
    setNetworkPolicy("public");
    await expect(inspect402({ url: "http://example.com/" })).rejects.toThrow(/only https/);
    await expect(inspect402({ url: "https://127.0.0.1/" })).rejects.toThrow(/internal/);
    await expect(inspect402({ url: "https://169.254.169.254/latest/meta-data/" })).rejects.toThrow(/internal/);
    await expect(getFacilitatorSigners("https://localhost/facilitator")).rejects.toThrow(/internal/);
    await expect(getFacilitatorSigners("https://[fd00:ec2::254]/")).rejects.toThrow(/internal/);
  });

  it("still never sends payment or credential headers", async () => {
    setNetworkPolicy("public");
    await expect(httpRequest("https://example.com/", { headers: { "X-PAYMENT": "x" } })).rejects.toThrow(/not allowed/);
    await expect(httpRequest("https://example.com/", { headers: { Authorization: "Bearer x" } })).rejects.toThrow(/not allowed/);
    await expect(httpRequest("https://example.com/", { headers: { cookie: "a=b" } })).rejects.toThrow(/not allowed/);
  });

  it("the plugin (local policy) still reaches local test servers", async () => {
    setNetworkPolicy("local");
    await expect(httpRequest("http://127.0.0.1:1/")).rejects.not.toThrow(/internal|only https/);
  });
});
