#!/usr/bin/env bash
# The one command that says whether the repository is in a good state: `npm run verify`.
# CI, the Stop hook and people all run this same script.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/..)"

step() { printf '\n== %s\n' "$1"; }

if [ ! -d node_modules ]; then
  echo "node_modules is missing: run npm ci first" >&2
  exit 1
fi

step "typecheck (server, tests, scripts)"
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.test.json --noEmit

step "build and check server/dist is current"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
npx tsc -p tsconfig.json --outDir "$tmp/dist"
if ! diff -r "$tmp/dist" server/dist >/dev/null; then
  diff -r "$tmp/dist" server/dist | head -20 >&2 || true
  echo "server/dist is not the build of server/src: run npm run build and commit server/dist" >&2
  exit 1
fi

step "tests"
npx vitest run

step "versions"
node scripts/check-versions.mjs

step "plugin manifest"
if command -v claude >/dev/null 2>&1; then
  claude plugin validate . >"$tmp/validate.txt" 2>&1 || { cat "$tmp/validate.txt" >&2; exit 1; }
  grep -E "Validation passed" "$tmp/validate.txt"
else
  echo "claude CLI not found: skipped (CI checks the manifests with tests/plugin.test.ts)"
fi

step "remote server (remote/)"
if [ -d remote/node_modules ]; then
  (cd remote && npm test --silent && npx tsc --noEmit && npx next build >"$tmp/next-build.txt" 2>&1) || { cat "$tmp/next-build.txt" >&2 2>/dev/null; exit 1; }
  echo "remote: tests, typecheck and next build passed"
else
  echo "remote/node_modules is missing: skipped (run: cd remote && npm ci). CI runs it."
fi

step "risk paths changed (review needed; not a failure)"
scripts/risk-paths.sh || true

printf '\nverify: OK\n'
