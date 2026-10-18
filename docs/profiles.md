# Profiles

M2 ships two reference profiles from `src/profiles/`.

`departmentAppProfile` is the bound department-app archetype. It selects one
deployment scope by its scope key, requires OIDC identity, and uses the stronger
reference brand.

`publicPortalProfile` is the public-portal archetype: anonymous access is
acceptable and it selects no scope by default, because Source serves public
runtime routes from the deployment's public scope. Native packages, task
attachments and qualified drafts require a key, so a deployment that uses them
(the local package preview included) supplies `scopeKey` at runtime.

Every reference adapter, for Source and WOS alike, sends one selector header,
`x-stack-scope-key`: the 64-hex scope key of stack-root ADR 0168 §1.1, held in
`FormspecWebConfig.scopeKey`. `src/shared/scope-key.ts` owns the type, the
header and `deriveScopeKey`, the TypeScript copy of the Rust derivation (pinned
to its golden vectors). A deployment supplies its key at runtime as `scopeKey`,
the value `config-check` prints for its scope (or `deriveScopeKey` computes in a
host or provisioning step from the tenant, workspace and environment names; the
cell is placement and is not part of a scope). The app itself never derives, so
SHA-256 stays out of the first-paint bundle. Adapters that read Source payloads
compare each payload `scope` key with it. With no key, no selector is sent, and
a server serving one scope admits the request.

Brand config is injected per app instance. The theme helper accepts a
`BrandConfig` and writes CSS variables onto the supplied target element, so two
instances can render distinct brands side-by-side without shared singleton
state.

`docker-compose.yml` demonstrates that isolation with two static web instances:
`publicPortal` on port 8080 and `departmentApp` on port 8081. In M7a both run
without `FORMSPEC_WEB_SERVER_URL`, so they intentionally stay in anonymous demo
mode while proving profile and brand separation.
