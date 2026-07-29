#!/bin/sh
set -eu

target="${1:-/usr/share/nginx/html/formspec-runtime-config.js}"
temporary="$(mktemp "${target}.tmp.XXXXXX")"

cleanup() {
  rm -f "$temporary"
}

trap cleanup EXIT HUP INT TERM

surface_bundle_json="${FORMSPEC_WEB_SURFACE_BUNDLE_JSON:-}"
if [ -n "$surface_bundle_json" ]; then
  if ! surface_bundle_json="$(
    printf '%s' "$surface_bundle_json" \
      | jq -c -e 'if type == "object" then . else error("expected object") end' 2>/dev/null
  )"; then
    echo "FORMSPEC_WEB_SURFACE_BUNDLE_JSON must contain one valid JSON object." >&2
    exit 1
  fi
else
  surface_bundle_json="null"
fi

runtime_config="$(
  jq -c -n \
    --arg profile_name "${FORMSPEC_WEB_PROFILE:-}" \
    --arg formspec_server_url "${FORMSPEC_WEB_SERVER_URL:-}" \
    --arg response_action_ledger_capability_url \
      "${FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL:-}" \
    --arg oidc_issuer "${FORMSPEC_WEB_OIDC_ISSUER:-}" \
    --arg oidc_client_id "${FORMSPEC_WEB_OIDC_CLIENT_ID:-}" \
    --arg oidc_redirect_uri "${FORMSPEC_WEB_OIDC_REDIRECT_URI:-}" \
    --arg magic_link_callback_path "${FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH:-}" \
    --argjson surface_bundle "$surface_bundle_json" \
    '{
      profileName: $profile_name,
      formspecServerUrl: $formspec_server_url,
      responseActionLedgerCapabilityUrl: $response_action_ledger_capability_url,
      oidcIssuer: $oidc_issuer,
      oidcClientId: $oidc_client_id,
      oidcRedirectUri: $oidc_redirect_uri,
      magicLinkCallbackPath: $magic_link_callback_path
    } + (
      if $surface_bundle == null
      then {}
      else {surfaceBundle: $surface_bundle}
      end
    )'
)"

runtime_config_string="$(
  printf '%s' "$runtime_config" | jq -R -s -c '.'
)"

{
  printf 'window.__FORMSPEC_RUNTIME_CONFIG__ = JSON.parse(%s);\n' \
    "$runtime_config_string"
} > "$temporary"

chmod 0644 "$temporary"
mv "$temporary" "$target"
trap - EXIT HUP INT TERM
