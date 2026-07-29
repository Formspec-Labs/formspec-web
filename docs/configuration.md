# Configuration

`formspec-web` reads deployment configuration from `formspec.config.ts` at the
repo root. The file default-exports a `FormspecWebConfig` and is included in
`tsconfig.json`, so local adopters get TypeScript checking without a separate
schema-validation step.

The repo-local public integration surface is exported from `src/index.ts`, with
focused subpaths at `src/config/` and `src/profiles/`. `package.json` exposes
that source surface while the package remains `"private": true`; this is for
local stack composition, not npm publication.

The portable config names the profile, tenant binding, identity policy, brand
tokens, and port composition choices. Stack-specific URLs, tenant-header
dialects, OIDC client endpoints, and magic-link callback paths live under
`referenceAdapters.formspecStack` so those details do not leak into the portable
port contracts. The Response Actions Ledger capability URL is also stack
specific: for the reference `formspec-server` deployment, point it at
`/runtime/response-actions/ledger/capability`. That deployable BFF endpoint
verifies the anonymous session and mints only the requested per-command append
capability. Do not point browser config at the trusted-host
`/runtime/forms/{form_id}/response-actions/ledger/capability` route; that route
requires server-side mint-authority material.

Production static bundles load `/formspec-runtime-config.js` before React
bootstraps. The Docker/nginx image writes that file from deploy-time
`FORMSPEC_WEB_*` environment variables. Vite `VITE_*` variables are only
dev/build fallbacks and normalize into the same runtime config shape.

When no server URL is provided, `createDefaultComposition()` selects demo mode:
stub adapters plus `src/demo/sample-form.json`. Setting `FORMSPEC_WEB_SERVER_URL`
or `VITE_FORMSPEC_WEB_SERVER_URL` selects production mode and wires the HTTP
reference adapters to that base URL. Runtime resolution also switches
`definitionSource`, `draftStore`, and `submitTransport` port choices to
`reference-http`; constructing a production composition while those data ports
still say `stub` is a configuration error.

Supported runtime variables:

| Runtime config key | Docker env | Vite fallback |
| --- | --- | --- |
| `profileName` | `FORMSPEC_WEB_PROFILE` | `VITE_FORMSPEC_WEB_PROFILE` |
| `formspecServerUrl` | `FORMSPEC_WEB_SERVER_URL` | `VITE_FORMSPEC_WEB_SERVER_URL` |
| `responseActionLedgerCapabilityUrl` | `FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL` | `VITE_FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL` |
| `oidcIssuer` | `FORMSPEC_WEB_OIDC_ISSUER` | `VITE_FORMSPEC_WEB_OIDC_ISSUER` |
| `oidcClientId` | `FORMSPEC_WEB_OIDC_CLIENT_ID` | `VITE_FORMSPEC_WEB_OIDC_CLIENT_ID` |
| `oidcRedirectUri` | `FORMSPEC_WEB_OIDC_REDIRECT_URI` | `VITE_FORMSPEC_WEB_OIDC_REDIRECT_URI` |
| `magicLinkCallbackPath` | `FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH` | `VITE_FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH` |
| `surfaceBundle` | `FORMSPEC_WEB_SURFACE_BUNDLE_JSON` | None; supply the object through runtime JavaScript. |

## Signed respondent Surface

The signed respondent path requires the `publicPortal` profile with its
anonymous identity adapter, `FORMSPEC_WEB_SERVER_URL`, and a complete
`FORMSPEC_WEB_SURFACE_BUNDLE_JSON` object. A bundle location by itself does not
activate this path. OIDC and department profiles keep their existing runtime;
this prevents the current subject-free browser receipt store from crossing an
authenticated subject boundary.

Store the deployment-owned object as JSON, for example:

```json
{
  "locator": "https://bundles.example.gov/respondent.cose",
  "allowedOrigins": ["https://bundles.example.gov"],
  "maxBytes": 1000000,
  "timeoutMs": 15000,
  "redirectPolicy": "refuse",
  "starterModuleId": "x-respondent",
  "receiptResourceUrl": "https://runtime.example.gov/respondent/receipt",
  "verification": {
    "expectedAppId": "https://example.gov/apps/respondent",
    "methodRegistry": {
      "version": "1.0.0",
      "entries": [
        {
          "id": "urn:formspec:sig-method:ed25519-cose-sign1@1",
          "suite": "Ed25519",
          "wire": "COSE_Sign1",
          "alg": -8,
          "status": "registered"
        }
      ]
    },
    "keys": [
      {
        "kid": "cmVzcG9uZGVudC1rZXk",
        "publicKey": "fx3_yLroLm6rm0sr39ep4fO15R7XxmMZWaJX731JUfY"
      }
    ],
    "authorities": [
      {
        "kid": "cmVzcG9uZGVudC1rZXk",
        "publisherId": "https://publisher.example.gov/",
        "publisherDisplayName": "Example publisher",
        "appIds": ["https://example.gov/apps/respondent"],
        "methods": ["urn:formspec:sig-method:ed25519-cose-sign1@1"],
        "validFrom": "2026-01-01T00:00:00.000Z",
        "validUntil": "2027-01-01T00:00:00.000Z",
        "revoked": false
      }
    ],
    "pinnedReleases": [
      {
        "digest": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "releaseId": "respondent-2026-07-28"
      }
    ]
  }
}
```

Replace every example trust value with the publisher's release data.
`verification.keys[].publicKey` is unpadded base64url for the raw 32-byte
Ed25519 public key. It is not a SubjectPublicKeyInfo (SPKI) value. Keep the
signing private key outside this client configuration. `timeoutMs` is the
deployment-owned deadline for the complete bundle acquisition; expiry aborts
the request and leaves the host in its fixed unavailable state.

The browser checks authority validity against the device clock. Required
release digest pins still prevent an expired key from authorizing different
bytes, but clock-based expiry is not adversary-resistant. Remove expired or
revoked keys and their pins from deployment configuration until the host has a
trusted time source.

This is an accepted limitation of the current anonymous, digest-pinned host.
Claiming adversary-resistant expiry or adding a trusted-time source requires a
new tracker item, an accepted design, and new release evidence.

Save the object as `respondent-surface.json`, then pass its compact form to
Docker or Compose:

```bash
FORMSPEC_WEB_SERVER_URL=https://formspec-server.example.gov \
FORMSPEC_WEB_SURFACE_BUNDLE_JSON="$(jq -c . respondent-surface.json)" \
docker compose up --build
```

The container parses this variable as one JSON object. Invalid JSON, JSON
arrays, and JSON `null` stop container startup. The entrypoint uses a JSON
processor for every scalar and nested value, then atomically replaces
`/formspec-runtime-config.js`; it does not paste environment values into
JavaScript source.
