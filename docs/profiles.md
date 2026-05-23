# Profiles

M2 ships two reference profiles from `src/profiles/`.

`departmentAppProfile` is the bound department-app archetype. It carries a full
tenant scope in config (`tenant`, `workspace`, `environment`, `cell`), requires
OIDC identity, and uses the stronger reference brand.

`publicPortalProfile` is the public-portal archetype. The product model is
implicit per-form tenancy and anonymous access is acceptable. During MVP, the
reference HTTP adapter still attaches a sentinel full tenant scope because the
current stack-common HTTP contract expects all four Formspec tenant headers.
After EXT-24 lands server-side per-form tenant resolution, this profile can move
to `headerMode: "omit-post-ext24"` and omit tenant headers.

Reference HTTP tenant headers match `HeaderConfig::formspec()`:

| Tenant scope field | Header |
| --- | --- |
| `tenant` | `x-formspec-tenant-id` |
| `workspace` | `x-formspec-workspace-id` |
| `environment` | `x-formspec-environment-id` |
| `cell` | `x-formspec-cell-id` |

Brand config is injected per app instance. The theme helper accepts a
`BrandConfig` and writes CSS variables onto the supplied target element, so two
instances can render distinct brands side-by-side without shared singleton
state.

`docker-compose.yml` demonstrates that isolation with two static web instances:
`publicPortal` on port 8080 and `departmentApp` on port 8081. In M7a both run
without `FORMSPEC_WEB_SERVER_URL`, so they intentionally stay in anonymous demo
mode while proving profile and brand separation.
