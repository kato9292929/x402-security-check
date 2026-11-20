export function parseVersion(v) {
    const s = v.trim().replace(/^v/i, "").replace(/^=+/, "").split("+")[0];
    const m = /^(\d+(?:\.\d+)*)(.*)$/.exec(s);
    if (!m)
        return null;
    const rest = m[2].replace(/^[-.]/, "");
    return { nums: m[1].split(".").map(Number), pre: rest ? rest : null };
}
/** -1 if a < b, 0 if equal, 1 if a > b. Unparsable versions throw. */
export function compareVersions(a, b) {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb)
        throw new Error(`cannot compare versions ${a} and ${b}`);
    const n = Math.max(pa.nums.length, pb.nums.length);
    for (let i = 0; i < n; i++) {
        const x = pa.nums[i] ?? 0;
        const y = pb.nums[i] ?? 0;
        if (x !== y)
            return x < y ? -1 : 1;
    }
    if (pa.pre === pb.pre)
        return 0;
    if (pa.pre === null)
        return 1;
    if (pb.pre === null)
        return -1;
    return pa.pre < pb.pre ? -1 : 1;
}
export function isBelow(version, fixed) {
    return compareVersions(version, fixed) < 0;
}
