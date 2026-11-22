/**
 * Adds x402 SDK advisories from the GitHub Advisory Database to data/advisories.json.
 *
 *   npm run update-advisories            # writes data/advisories.json
 *   npm run update-advisories -- --dry-run
 *   npm run update-advisories -- --dry-run --json out.json   # also write the new entries as JSON
 *
 * Uses the public REST endpoint GET https://api.github.com/advisories?ecosystem=..&affects=..
 * without a key (three requests, one per ecosystem; the unauthenticated limit is 60/hour per IP). GITHUB_TOKEN is
 * used only if it is already set. Entries already in the file (edited by hand) are kept as
 * they are; only advisory IDs not yet in the file are added. Review the diff before committing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AdvisoryData, Advisory, AffectedPackage, Ecosystem } from "../server/src/data.js";

const FILE = resolve(import.meta.dirname, "..", "data", "advisories.json");
/** Overridable for tests only. */
const API = process.env.X402SC_ADVISORIES_API || "https://api.github.com/advisories";

/** GitHub ecosystem names -> ours. */
const ECOSYSTEM: Record<string, Ecosystem> = { npm: "npm", pip: "pip", go: "go" };

export interface GhAdvisory {
  ghsa_id: string;
  cve_id?: string | null;
  summary: string;
  severity?: string;
  html_url: string;
  published_at?: string;
  withdrawn_at?: string | null;
  vulnerabilities?: {
    package?: { ecosystem?: string; name?: string };
    vulnerable_version_range?: string | null;
    first_patched_version?: string | { identifier?: string } | null;
  }[];
}

const patched = (v: GhAdvisory["vulnerabilities"] extends (infer T)[] | undefined ? T : never) => {
  const p = v.first_patched_version;
  return typeof p === "string" ? p : (p?.identifier ?? null);
};

/** ">= 1.2.0, < 2.6.0" -> "1.2.0" */
const introducedFrom = (range?: string | null) => /^>=\s*([^,\s]+)/.exec(range ?? "")?.[1];

export function toAdvisory(g: GhAdvisory, names: AdvisoryData["sdk_packages"]): Advisory | null {
  if (g.withdrawn_at) return null;
  const affected: AffectedPackage[] = [];
  for (const v of g.vulnerabilities ?? []) {
    const eco = ECOSYSTEM[v.package?.ecosystem ?? ""];
    const name = v.package?.name;
    const fixed = patched(v);
    if (!eco || !name || !fixed || !names[eco]?.includes(name)) continue;
    const a: AffectedPackage = { ecosystem: eco, package: name, fixed };
    const intro = introducedFrom(v.vulnerable_version_range);
    if (intro) a.introduced = intro;
    affected.push(a);
  }
  if (!affected.length) return null;
  return {
    id: g.ghsa_id,
    cve: g.cve_id ?? null,
    severity: g.severity,
    summary: g.summary,
    issue: "K3",
    item: 10,
    url: g.html_url,
    published: g.published_at?.slice(0, 10),
    affected,
  };
}

/** Returns the merged data and the IDs that were added. Existing entries are never changed. */
export function mergeAdvisories(
  data: AdvisoryData,
  fetched: GhAdvisory[],
  today: string,
): { data: AdvisoryData; added: string[]; entries: Advisory[] } {
  const have = new Set(data.advisories.map((a) => a.id));
  const added: Advisory[] = [];
  for (const g of fetched) {
    if (have.has(g.ghsa_id)) continue;
    const a = toAdvisory(g, data.sdk_packages);
    if (a) {
      added.push(a);
      have.add(a.id);
    }
  }
  if (!added.length) return { data, added: [], entries: [] };
  return { data: { ...data, updated: today, advisories: [...data.advisories, ...added] }, added: added.map((a) => a.id), entries: added };
}

/** One request per ecosystem: `affects` takes a comma-separated package list. */
async function fetchFor(ecosystem: Ecosystem, pkgs: string[]): Promise<GhAdvisory[]> {
  const url = `${API}?ecosystem=${ecosystem}&affects=${encodeURIComponent(pkgs.join(","))}&per_page=100`;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "x402-security-check" };
  const token = process.env.GITHUB_TOKEN;
  let r = await fetch(url, { headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers });
  // A token this endpoint does not accept: the endpoint is public, so retry without it.
  if (r.status === 401 && token) r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as GhAdvisory[];
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const jsonAt = process.argv.indexOf("--json");
  const jsonOut = jsonAt > 0 ? process.argv[jsonAt + 1] : undefined;
  if (jsonAt > 0 && !jsonOut) throw new Error("--json needs a file path");
  const data = JSON.parse(readFileSync(FILE, "utf8")) as AdvisoryData;
  const fetched: GhAdvisory[] = [];
  for (const [eco, pkgs] of Object.entries(data.sdk_packages) as [Ecosystem, string[]][]) fetched.push(...(await fetchFor(eco, pkgs)));
  const { data: merged, added, entries } = mergeAdvisories(data, fetched, new Date().toISOString().slice(0, 10));
  console.log(`fetched ${fetched.length} advisory records; new: ${added.length ? added.join(", ") : "none"}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ fetched: fetched.length, added: entries }, null, 2) + "\n");
  if (added.length && !dry) {
    writeFileSync(FILE, JSON.stringify(merged, null, 2) + "\n");
    console.log(`wrote ${FILE}; review the diff (summary, issue, item) before committing.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
