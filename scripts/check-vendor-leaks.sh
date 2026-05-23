#!/usr/bin/env bash
set -euo pipefail

core_paths=(
  "src/app"
  "src/ports"
  "src/composition/types.ts"
)

pattern='formspec-server|firebase|supabase|clerk|auth0|cognito|login\.gov|id\.me'

if command -v rg >/dev/null 2>&1; then
  matches="$(rg -n -i "$pattern" "${core_paths[@]}" || true)"
else
  matches="$(grep -RInE "$pattern" "${core_paths[@]}" || true)"
fi

if [[ -n "$matches" ]]; then
  printf '%s\n' "$matches"
  cat >&2 <<'MSG'

Vendor or backend-specific vocabulary appeared in the core shell/port surface.
Move deployment-specific language to an adapter, profile, or reference-composition document.
This check is advisory per web ADR-0009; architectural review is the authoritative gate.
MSG
  exit 0
fi

echo "vendor leak check passed"
