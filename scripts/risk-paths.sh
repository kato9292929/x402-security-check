#!/usr/bin/env bash
# Lists changed files that match a glob in ./risk-paths.
#   scripts/risk-paths.sh            # against origin/main (or main), plus uncommitted changes
#   scripts/risk-paths.sh <base>     # against <base>
# Prints nothing when no risk path changed. Never fails the build by itself.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

base="${1:-}"
if [ -z "$base" ]; then
  for b in origin/main main; do
    if git rev-parse --verify -q "$b" >/dev/null; then base="$b"; break; fi
  done
fi

{
  if [ -n "$base" ]; then git diff --name-only "$base"...HEAD 2>/dev/null || true; fi
  git diff --name-only HEAD 2>/dev/null || true
  git ls-files --others --exclude-standard
} | sort -u > "${TMPDIR:-/tmp}/x402sc-changed.$$"

node -e '
  const fs = require("fs");
  const globs = fs.readFileSync("risk-paths", "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const re = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");
  const rules = globs.map((g) => [g, re(g)]);
  const files = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
  for (const f of files) {
    const hit = rules.find(([, r]) => r.test(f));
    if (hit) console.log(`${f}\t(${hit[0]})`);
  }
' "${TMPDIR:-/tmp}/x402sc-changed.$$"
rm -f "${TMPDIR:-/tmp}/x402sc-changed.$$"
