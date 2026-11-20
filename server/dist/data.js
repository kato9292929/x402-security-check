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
export function readData(name) {
    return JSON.parse(readFileSync(resolve(DATA_DIR(), name), "utf8"));
}
