# Multi-Deployment

One Formspec backend can support many `formspec-web` deployments. Each web
instance receives its profile, scope key, identity policy, and brand
tokens from runtime config.

## Automated Smoke

The release gate is:

```bash
npm run check:compose-config
npm run test:compose-quickstart
npm run test:multi-deployment
```

The compose quickstart gate runs the documented `docker compose up --build`
path on ports 8080/8081. The multi-deployment gate repeats the same profile,
brand, and configuration-refusal checks with Docker-assigned local ports. Both verify
`/formspec-runtime-config.js`, render each instance in Chromium, check the
applied brand token target, require the neutral configuration refusal, and fail on browser
warnings/errors.

## Local Smoke

Start both reference instances:

```bash
docker compose up --build
```

Expected runtime config:

```bash
curl -sf http://localhost:8080/formspec-runtime-config.js
curl -sf http://localhost:8081/formspec-runtime-config.js
```

The first response should name `publicPortal`; the second should name
`departmentApp`.

## Brand Isolation

Optional browser spot-check:

1. Open `http://localhost:8080`.
2. Confirm “This site is not ready.” renders and the document brand is `formspec-public`.
3. Open `http://localhost:8081`.
4. Confirm “This site is not ready.” renders and the document brand is `formspec-department`.
5. Confirm neither unconfigured instance exposes a form or submit action.

The signed respondent browser suite separately checks draft retention,
submission, and receipt navigation using a controlled server fixture. It does
not establish isolation between two backend-connected deployments.

The automated M7a smoke performs the same profile, brand, and configuration-refusal checks
against built nginx containers and observes browser warnings/errors as failures.

## Auth Isolation

Unconfigured compose makes no authentication claim. The respondent runtime only auto-authenticates
anonymous identity at boot; OIDC redirects and magic-link sends require an
explicit sign-in surface. Full side-by-side OIDC isolation waits for EXT-23
server validation.
