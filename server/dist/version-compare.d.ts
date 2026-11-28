/**
 * Version comparison good enough for npm semver, PEP 440 release versions and Go module
 * versions: numeric dot parts, then a pre-release (anything after "-", "a", "b", "rc", ".dev")
 * sorts before the release. Build metadata ("+...") is ignored.
 */
interface Parsed {
    nums: number[];
    pre: string | null;
}
export declare function parseVersion(v: string): Parsed | null;
/** -1 if a < b, 0 if equal, 1 if a > b. Unparsable versions throw. */
export declare function compareVersions(a: string, b: string): number;
export declare function isBelow(version: string, fixed: string): boolean;
export {};
