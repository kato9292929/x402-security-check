#!/usr/bin/env bash
# Stop hook: before Claude ends a turn with changes in this repository, run `npm run verify`.
# Exit 2 sends the failure back to Claude so it keeps working; exit 0 lets it stop.
set -uo pipefail
input="$(cat)"
# Already continuing because of this hook: do not loop.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then exit 0; fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0

# Skip when nothing changed since the last passing run (HEAD + working tree).
state="$( { git rev-parse HEAD 2>/dev/null; git status --porcelain; git diff HEAD 2>/dev/null; } | sha256sum | cut -d' ' -f1)"
stamp="$(git rev-parse --git-dir)/x402sc-verified"
if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$state" ]; then exit 0; fi
# Only the base commit, no work yet: nothing to verify.
if [ -z "$(git status --porcelain)" ] && [ -z "$(git log --oneline origin/main..HEAD 2>/dev/null)" ] && git rev-parse -q --verify origin/main >/dev/null; then exit 0; fi

if [ ! -d node_modules ]; then
  echo "npm run verify cannot run: node_modules is missing. Run npm ci, then npm run verify." >&2
  exit 2
fi

if out="$(npm run --silent verify 2>&1)"; then
  echo "$state" >"$stamp"
  risk="$(printf '%s\n' "$out" | sed -n '/== risk paths changed/,/verify: OK/p' | sed '1d;$d' | sed '/^$/d')"
  if [ -n "$risk" ]; then
    echo "verify passed. Risk paths changed (say so in the report; a person reviews them):" >&2
    echo "$risk" >&2
  fi
  exit 0
fi
echo "npm run verify failed. Fix it before stopping:" >&2
printf '%s\n' "$out" | tail -60 >&2
exit 2
