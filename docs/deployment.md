# Deployment

`formspec-web` builds to static assets and serves them with nginx in the
reference image.

## Docker

Build the image:

```bash
docker build -t formspec-web:local .
```

Run the demo image:

```bash
docker run --rm -p 8080:80 formspec-web:local
```

The image writes `/formspec-runtime-config.js` at container start from
`FORMSPEC_WEB_*` environment variables. Without `FORMSPEC_WEB_SERVER_URL`, the
app stays in demo mode and uses the bundled sample form with stub adapters.

The reference nginx image serves fingerprinted `/assets/*` files with gzip and
long immutable cache headers. HTML routes revalidate on every visit, and
`/formspec-runtime-config.js` is marked `no-store` because it is generated from
deploy-time environment variables.

## Runtime Variables

| Variable | Purpose |
| --- | --- |
| `FORMSPEC_WEB_PROFILE` | Reference profile name: `publicPortal` or `departmentApp`. |
| `FORMSPEC_WEB_SERVER_URL` | Enables production mode and points HTTP adapters at a formspec-server base URL. |
| `FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL` | Optional trusted BFF endpoint that returns per-command Response Actions Ledger append capabilities without exposing mint HMAC material to the browser. |
| `FORMSPEC_WEB_OIDC_ISSUER` | Overrides the profile OIDC issuer. |
| `FORMSPEC_WEB_OIDC_CLIENT_ID` | Overrides the profile OIDC client id. |
| `FORMSPEC_WEB_OIDC_REDIRECT_URI` | Overrides the profile OIDC redirect URI. |
| `FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH` | Overrides the magic-link callback path. |

## Compose

Run the local multi-instance demo:

```bash
npm run check:compose-config
npm run test:compose-quickstart
docker compose up --build
```

Open:

- `http://localhost:8080` for `publicPortal`.
- `http://localhost:8081` for `departmentApp`.

Both services leave `FORMSPEC_WEB_SERVER_URL` empty in M7a/M8 local compose, so
they prove static deployment, profile selection, and brand isolation without
claiming server-backed OIDC. When the variable is provided, compose forwards it
to both services: `publicPortal` uses the reference anonymous-session draft and
submit path, while `departmentApp` renders explicit sign-in and remains blocked
from full server-backed OIDC proof until EXT-23 server validation lands. Compose
also forwards `FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL` when set; that
only wires the browser-to-BFF capability seam and does not by itself prove a
live server/Trellis ledger path.

## Hosted Demo Decision

Hosted demo selection is deferred to user action. Local Docker compose is the
release proof for M8, and no internet-reachable URL is claimed until an owner
chooses a hosting target and DNS name.

The static hosting recipes below are ready-to-run deployment paths for that
owner decision. For a public evaluation demo, leave the server URL unset so the
bundled sample form and stub adapters render. For a production-like evaluation,
point the runtime config at a formspec-server base URL and keep the manual and
server-side blockers in `docs/testing-plan.md` visible.

## Vercel Static Export

Use the static output, not a server-rendered app:

```bash
npm ci
npm run build
```

Vercel settings:

| Setting | Value |
| --- | --- |
| Framework preset | Other |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm ci` |

For the demo path, do not set `VITE_FORMSPEC_WEB_SERVER_URL`; the app renders
the bundled sample form. For a production-like evaluation, set
`VITE_FORMSPEC_WEB_SERVER_URL` and the matching `VITE_FORMSPEC_WEB_PROFILE`
before build, or replace `dist/formspec-runtime-config.js` in the deployment
pipeline with a generated `window.__FORMSPEC_RUNTIME_CONFIG__` assignment.

When `departmentApp` uses OIDC, the configured redirect URI must match the
final HTTPS Vercel URL. Full server-validated OIDC remains blocked by EXT-23.

## Cloudflare Pages Static Export

Use the same static artifact:

```bash
npm ci
npm run build
```

Cloudflare Pages settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | repository root |

For a demo, leave `VITE_FORMSPEC_WEB_SERVER_URL` unset. For a production-like
evaluation, set `VITE_FORMSPEC_WEB_SERVER_URL`, `VITE_FORMSPEC_WEB_PROFILE`,
and any OIDC `VITE_FORMSPEC_WEB_*` values as build variables, or generate
`dist/formspec-runtime-config.js` during the Pages build step. Pages Functions
are not required for the static demo path.

## Docker Behind Reverse Proxy

Run the reference image behind the operator's TLS/reverse-proxy layer:

```bash
docker build -t formspec-web:local .
docker run --rm -p 127.0.0.1:8080:80 \
  -e FORMSPEC_WEB_PROFILE=publicPortal \
  -e FORMSPEC_WEB_SERVER_URL=https://formspec-server.example.test \
  formspec-web:local
```

Reverse proxy requirements:

- Terminate TLS before forwarding to container port 80.
- Preserve normal SPA fallback behavior for form routes.
- Do not override the container's `Cache-Control: no-store` policy for
  `/formspec-runtime-config.js`.
- Keep immutable caching for fingerprinted `/assets/*` files.
- Configure OIDC redirect URIs against the public HTTPS origin when using
  `departmentApp`.

This path is the closest shape to the reference runtime because the container
generates `/formspec-runtime-config.js` from `FORMSPEC_WEB_*` variables at
startup rather than baking production values into the JS bundle.

## Deferred Server Stack

The M8 plan originally calls for one `formspec-server` instance plus its
dependencies in this compose file. That full stack remains deferred because
EXT-23 blocks server-side OIDC validation and EXT-25 tracks a production
server image. The current compose file is the shippable local web demo.
