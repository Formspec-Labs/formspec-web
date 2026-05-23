# Multi-Deployment

One Formspec backend can support many `formspec-web` deployments. Each web
instance receives its profile, tenant binding, identity policy, and brand
tokens from runtime config.

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

Manual browser smoke:

1. Open `http://localhost:8080`.
2. Confirm the demo form renders and the document brand is `formspec-public`.
3. Open `http://localhost:8081`.
4. Confirm the demo form renders and the document brand is `formspec-department`.
5. Switch language and submit in each tab; state and confirmation references
   must not bleed between instances.

The automated M7a smoke performed this check with Playwright against the built
nginx containers and observed zero console warnings/errors.

## Auth Isolation

M7a compose is anonymous-only. The respondent runtime only auto-authenticates
anonymous identity at boot; OIDC redirects and magic-link sends require an
explicit sign-in surface. Full side-by-side OIDC isolation waits for EXT-23
server validation.
