# Multi-Flow Identity

The reference profiles model two deployment shapes:

- `departmentApp`: bound tenant scope, OIDC required, department brand.
- `publicPortal`: implicit public portal scope, anonymous access allowed,
  lighter brand.

During M7a, the MVP-shippable proof is anonymous-only. The runtime can boot
`publicPortal` without starting any external identity side effect, and it keeps
draft keys scoped by the active anonymous `subjectRef`.

Full side-by-side OIDC proof waits for two prerequisites:

- EXT-23 lands in `formspec-server` so the backend can validate per-tenant OIDC
  tokens against JWKS with RS256.
- `formspec-web` wires a bounded access-token provider into the HTTP adapter
  composition so `Authorization: Bearer ...` is available to the reference
  server without putting raw tokens in `IdentityClaim`.

Until both are done, do not treat `departmentApp` as an end-to-end production
OIDC demonstration. It remains a configuration profile and architecture target.
