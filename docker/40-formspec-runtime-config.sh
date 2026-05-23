#!/bin/sh
set -eu

target="/usr/share/nginx/html/formspec-runtime-config.js"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r/\\r/g; s/\t/\\t/g'
}

json_string() {
  printf '"%s"' "$(json_escape "$1")"
}

cat > "$target" <<EOF
window.__FORMSPEC_RUNTIME_CONFIG__ = {
  profileName: $(json_string "${FORMSPEC_WEB_PROFILE:-}"),
  formspecServerUrl: $(json_string "${FORMSPEC_WEB_SERVER_URL:-}"),
  oidcIssuer: $(json_string "${FORMSPEC_WEB_OIDC_ISSUER:-}"),
  oidcClientId: $(json_string "${FORMSPEC_WEB_OIDC_CLIENT_ID:-}"),
  oidcRedirectUri: $(json_string "${FORMSPEC_WEB_OIDC_REDIRECT_URI:-}"),
  magicLinkCallbackPath: $(json_string "${FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH:-}")
};
EOF
