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

## Runtime Variables

| Variable | Purpose |
| --- | --- |
| `FORMSPEC_WEB_PROFILE` | Reference profile name: `publicPortal` or `departmentApp`. |
| `FORMSPEC_WEB_SERVER_URL` | Enables production mode and points HTTP adapters at a formspec-server base URL. |
| `FORMSPEC_WEB_OIDC_ISSUER` | Overrides the profile OIDC issuer. |
| `FORMSPEC_WEB_OIDC_CLIENT_ID` | Overrides the profile OIDC client id. |
| `FORMSPEC_WEB_OIDC_REDIRECT_URI` | Overrides the profile OIDC redirect URI. |
| `FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH` | Overrides the magic-link callback path. |

## Compose

Run the local multi-instance demo:

```bash
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
from full server-backed OIDC proof until EXT-23 server validation lands.

## Deferred Server Stack

The M8 plan originally calls for one `formspec-server` instance plus its
dependencies in this compose file. That full stack remains deferred because
EXT-23 blocks server-side OIDC validation and EXT-25 tracks a production
server image. The current compose file is the shippable local web demo.
