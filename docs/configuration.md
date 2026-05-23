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
port contracts.

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
| `oidcIssuer` | `FORMSPEC_WEB_OIDC_ISSUER` | `VITE_FORMSPEC_WEB_OIDC_ISSUER` |
| `oidcClientId` | `FORMSPEC_WEB_OIDC_CLIENT_ID` | `VITE_FORMSPEC_WEB_OIDC_CLIENT_ID` |
| `oidcRedirectUri` | `FORMSPEC_WEB_OIDC_REDIRECT_URI` | `VITE_FORMSPEC_WEB_OIDC_REDIRECT_URI` |
| `magicLinkCallbackPath` | `FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH` | `VITE_FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH` |
