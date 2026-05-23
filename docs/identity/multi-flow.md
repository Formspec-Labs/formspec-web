# Multi-Flow Identity

The reference profiles model two deployment shapes:

- `departmentApp`: bound tenant scope, OIDC required, department brand.
- `publicPortal`: implicit public portal scope, anonymous access allowed,
  lighter brand.

During M7a, the MVP-shippable proof is anonymous-only. The runtime can boot
`publicPortal` without starting any external identity side effect, and it keeps
draft keys scoped by the active anonymous `subjectRef`.

## Anonymous M7a Compose

`docker-compose.yml` boots two static web containers:

- `formspec-web` on `http://localhost:8080` with `FORMSPEC_WEB_PROFILE=publicPortal`.
- `formspec-web-department` on `http://localhost:8081` with
  `FORMSPEC_WEB_PROFILE=departmentApp`.

Both omit `FORMSPEC_WEB_SERVER_URL`, so the reference app stays in demo mode
and uses the anonymous boot path. This proves profile and brand isolation for
two deployed web instances without asserting server-backed OIDC.

Full side-by-side OIDC proof waits for two prerequisites:

- EXT-23 lands in `formspec-server` so the backend can validate per-tenant OIDC
  tokens against JWKS with RS256.
- The respondent shell grows the explicit OIDC sign-in flow needed to start the
  redirect deliberately.

The bounded access-token provider is already wired into the HTTP adapter
composition, so `Authorization: Bearer ...` is available to the reference server
after an OIDC claim exists without putting raw tokens in `IdentityClaim`.

Until both are done, do not treat `departmentApp` as an end-to-end production
OIDC demonstration. It remains a configuration profile and architecture target.
