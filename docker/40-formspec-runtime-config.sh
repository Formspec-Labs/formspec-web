#!/bin/sh
set -eu

target="${1:-/usr/share/nginx/html/formspec-runtime-config.js}"
temporary="$(mktemp "${target}.tmp.XXXXXX")"

cleanup() {
  rm -f "$temporary"
}

trap cleanup EXIT HUP INT TERM

scope_key="${FORMSPEC_WEB_SCOPE_KEY:-}"
if [ -n "$scope_key" ]; then
  if ! printf '%s' "$scope_key" | jq -R -s -e 'length == 64 and test("^[0-9a-f]+$")' >/dev/null; then
    echo "FORMSPEC_WEB_SCOPE_KEY must be 64 lowercase hex digits." >&2
    exit 1
  fi
elif [ -n "${FORMSPEC_WEB_SERVER_URL:-}" ]; then
  echo "FORMSPEC_WEB_SCOPE_KEY is required when FORMSPEC_WEB_SERVER_URL is set; use the deployment's config-check output." >&2
  exit 1
fi

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

attachment_max_upload_bytes="${FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES:-}"
if [ -n "$attachment_max_upload_bytes" ]; then
  if ! attachment_max_upload_bytes="$(
    printf '%s' "$attachment_max_upload_bytes" | jq -R -c -e '
      tonumber | if . > 0 and . <= 9007199254740991 and . == floor
      then . else error("expected positive safe integer") end' 2>/dev/null
  )"; then
    echo "FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES must be a positive safe integer number of bytes." >&2
    exit 1
  fi
else
  attachment_max_upload_bytes="null"
fi

mapping_path="$(dirname "$0")/runtime-env-map.json"
# The image ships the same scalar mapping that the browser uses.
if [ ! -f "$mapping_path" ]; then
  mapping_path="$(dirname "$0")/../src/config/runtime-env-map.json"
fi
runtime_config="$(
  jq -c -n \
    --slurpfile scalar_mapping "$mapping_path" \
    --arg scope_key "$scope_key" \
    --argjson attachment_max_upload_bytes "$attachment_max_upload_bytes" \
    --argjson surface_bundle "$surface_bundle_json" \
    '(reduce ($scalar_mapping[0] | to_entries[]) as $entry ({};
      .[$entry.key] = ([ $entry.value[] | env[.] | select(. != null and . != "") ][0] // ""))) + (
      if $scope_key == ""
      then {}
      else {scopeKey: $scope_key}
      end
    ) + (
      if $surface_bundle == null
      then {}
      else {surfaceBundle: $surface_bundle}
      end
    ) + (
      if $attachment_max_upload_bytes == null
      then {}
      else {attachmentMaxUploadBytes: $attachment_max_upload_bytes}
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
