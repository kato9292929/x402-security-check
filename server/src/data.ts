/**
 * The JSON files under data/ at the package root. Read on every call so a hand edit
 * of data/advisories.json applies without restarting the server.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** server/src or server/dist -> package root. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = () => process.env.X402SC_DATA_DIR || resolve(PACKAGE_ROOT, "data");

export function readData<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR(), name), "utf8")) as T;
}

export type Ecosystem = "npm" | "pip" | "go";

export interface AffectedPackage {
  ecosystem: Ecosystem;
  package: string;
  /** First patched version; anything older is affected. */
  fixed: string;
  /** Optional lower bound (inclusive). Absent means every version below `fixed`. */
  introduced?: string;
}

export interface Advisory {
  id: string;
  cve?: string | null;
  severity?: string;
  summary: string;
  issue?: string;
  item?: number;
  url: string;
  published?: string;
  affected: AffectedPackage[];
}

export interface AdvisoryData {
  updated: string;
  note?: string;
  sdk_packages: Record<Ecosystem, string[]>;
  advisories: Advisory[];
}

export interface Issue {
  id: string;
  layer: string;
  stage: string;
  summary: string;
  who_loses: string;
  items: number[];
  in_skill_scope: boolean;
}

export interface IssueData {
  source: string;
  title: string;
  stages: string[];
  loser_labels: Record<string, string>;
  items: { number: number; title: string; issues: string[] }[];
  issues: Issue[];
}
