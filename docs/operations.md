# Operations

`formspec-web` is a static client. Runtime behavior is split between browser
logs, nginx access/error logs, and any backend service selected by the active
composition.

## Health

The nginx image exposes:

```text
GET /healthz
```

The Docker healthcheck also requests `/` locally inside the container.

## Logs

- nginx access/error logs go to container stdout/stderr.
- Browser runtime errors are rendered as plain-language Problem JSON surfaces
  when the upstream adapter provides a Problem JSON envelope.
- Uncaught React runtime errors fall through the app error boundary and log to
  the browser console.

## Exposed Surfaces

Public:

- Static assets.
- `/formspec-runtime-config.js`.
- `/healthz`.
- The respondent form route handled by the SPA fallback.

Not exposed by this image:

- Tenant admin APIs.
- Form authoring APIs.
- Credential secrets or raw OIDC tokens.
- Server-side draft storage.

## Static Asset Policy

- Fingerprinted `/assets/*` files are gzip-compressed when the client sends
  `Accept-Encoding: gzip` and are served with
  `Cache-Control: public, max-age=31536000, immutable`.
- `/` and SPA fallback routes serve `index.html` with `Cache-Control: no-cache`
  so rollouts can replace the fingerprinted asset graph safely.
- `/formspec-runtime-config.js` is generated at container start and served with
  `Cache-Control: no-store`.

## Current Operational Gaps

- No hosted demo URL is selected. Local Docker compose is the release proof for
  now.
- No production error-reporting sink is wired.
- No analytics or SLO dashboards are wired.
- Full server-backed OIDC operations wait for EXT-23 server validation.
