# formspec-web Prod-MVP Plan

> Capability-shaped. Code-free. Implementers fill in TypeScript by reading the ADRs, the port interfaces, and the conformance harness as oracle. Where this plan and existing code diverge, the conformance harness wins.

---

## 1. Goal

formspec-web reaches **prod-MVP**: a fully functional dependency-injected respondent-facing shell, deployable as a configurable Docker image, with every architectural port surfaced and a conformance harness gating all adapters.

Cryptographic substrate (verifier, signer ceremony, signed receipts, selective-proof viewer) remains out of scope per [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md). The verifier is the long-term positioning bet per [web ADR-0001](../adr/0001-public-reference-ui-separation.md); this MVP delivers the intake half and the architecture the verifier will plug into.

**Prod-MVP ≠ thin slice.** The DI system is complete: all five ports defined, conformance harness in place, reference adapter set wired for the formspec-stack composition, brand isolation enforced, multi-deployment proven. What's missing post-MVP is *more adapters* (other identity providers, other backends, the verifier surface) — not architectural completeness.

---

## 2. Posture (Palantir-like)

One platform — [`formspec-server`](../../../formspec-server/) — many configurable formspec-web deployments. Per-org or per-department instances, each tenant-bound or tenant-implicit per its DI profile, all converging on the platform via a versioned protocol. The shell is the deployable product; the platform owns the heavy lifting (form authoring, tenancy, governance, identity issuance).

A buyer running formspec for benefits, permits, and HR can deploy three branded formspec-web instances at three URLs against one formspec-server, with three different auth flows. The DI architecture makes the backend itself swappable for orgs that bring their own infrastructure — formspec-server is the *reference* backend, not the *required* one.

`formspec-server` is the admin / SaaS plane (form authoring, governance, tenancy). `formspec-web` is the respondent plane (the public-facing shell). They are deliberately separate codebases with separate audiences and separate deploy artifacts.

---

## 3. Buyer

A technical evaluator on the path from *curious* to *committed*:

- **The dev playing around.** Needs `docker-compose up` to render something in five minutes.
- **The integration evaluator.** Needs to see the adapter-swap story end-to-end before adopting.
- **The client-demo operator.** Needs a polished demo path and a stable URL to point at.
- **The departmental operator.** Needs to deploy formspec-web bound to their tenant with their auth provider and their brand.

Unifying property: **time-to-first-success matters more than feature breadth**. Documentation is product, not polish. Each milestone has a documentation exit gate; docs ship with the work, not after it.

---

## 4. Architectural decisions locked

| # | Decision | Implication |
|---|---|---|
| A | **Tenant resolution: configurable via DI profile.** Both per-instance bound (department-app archetype) and per-form implicit (public-portal archetype) supported; profile selects which. | Two reference profiles ship in M2: `departmentApp` (bound, OIDC, branded) and `publicPortal` (implicit, anonymous-OK). Because `stack-common-http` currently requires a full four-part `TenantScope`, MVP `publicPortal` attaches a sentinel full scope (`tenant`, `workspace`, `environment`, `cell`) until **EXT-24** (server-side per-form tenant resolution) lets it drop tenant headers. Profile architecture supports both modes. |
| B | **Authentication: direct token trust.** formspec-web obtains OIDC tokens via its `IdentityProvider` port; formspec-server validates the token directly against the issuer's JWKS. | No federation, no token exchange. **EXT-23** (server-side per-tenant trusted-issuer config + JWKS client + RS256 verifier) is **verified fully absent in `formspec-server`** as of 2026-05-22 (`formspec-server-auth-jwt` is HS256-only; `jwks_url` field declared but never consumed). EXT-23 is filed as a peer milestone in `formspec-server`; **M7 acceptance gates on its delivery**. |
| C | **Deployment surface: Docker + docker-compose for MVP.** | Static export, Vercel template, Cloudflare bundle deferred. The MVP test is `docker-compose up`. Note: `formspec-server` has no production Dockerfile today — the existing compose pattern (`ops/managed-single-cell/docker-compose.yml`) runs the server as `cargo run` against bind-mounted source. MVP accepts this footprint; **EXT-25** (formspec-server production Dockerfile) is the future-state hardening item. |

---

## 4.5 Tactical decisions locked (for autonomous execution)

These were open in earlier drafts and are now locked so an autonomous agent doesn't stall. Any can be revised by the user mid-execution; absent that, the agent treats them as final.

| Topic | Choice | Notes |
|---|---|---|
| Profile file format | `formspec.config.ts` at repo root — TypeScript module, default export typed against `FormspecWebConfig`. | Type-safe at build time; supports computed values; matches sibling-repo TS-strict style. |
| Runtime config delivery | Static bundles read a generated `/formspec-runtime-config.js` before app bootstrap; Docker/nginx emits it from runtime env at container start. Vite `VITE_*` values are dev/build fallbacks only and are normalized into the same runtime-config shape. | Prevents the static `dist/` artifact from pretending build-time `import.meta.env` values can change after image build. |
| Public config surface | `src/index.ts` re-exports `src/config/` and `src/profiles/`; `package.json` exposes that source-level surface for local adopter configs even while the package remains `"private": true`. `formspec.config.ts` is included in `tsconfig.json` so it is typechecked. | "Public" means the repo-local typed integration surface for M2, not npm publication. |
| Sample form (M5) | Authored fresh at `src/demo/sample-form.json`. Minimum coverage: text input, choice input, repeat group, conditional group, multilingual label (English + one other), Issuer document with name + logo URL. | Agent MAY adopt an existing fixture from `formspec/tests/fixtures/` if one covers all five surface types verbatim; default is fresh authoring focused on UX, not engine semantics. |
| Hosted demo URL (M8) | **Deferred to user action.** Agent does NOT attempt domain registration or DNS. Agent ships `docs/deployment.md` with three deploy-path recipes (static-export → Vercel, static-export → Cloudflare Pages, self-host → Docker behind reverse proxy). User picks and runs. | Surfaces in M8 acceptance as "documented + ready, not deployed." |
| Test framework | Vitest 4 (unit + smoke + conformance suites). | Matches sibling packages. |
| E2E + a11y framework | Playwright with `@axe-core/playwright`. | Per the original plan; CI gate in M1. |
| Linter | ESLint 9 flat config + `eslint-plugin-import`'s `import/no-restricted-paths` rule for boundary discipline. | Per ADR-0009 §Discipline. Earlier drafts named `eslint-plugin-no-restricted-paths`; no maintained npm package exists under that name, so the ADR-aligned import rule is used directly. |
| Bundler | Vite 7. | Per ADR-0002. |
| Package manager | npm (matches sibling `file:` linking convention). | |
| Node version | 22 LTS. | Matches sibling `engines` fields. |
| OIDC client library | `oidc-client-ts` v3. | Per ADR-0007 reference impl. |
| UUID library | `uuid` v9+ (for `v7` generation). | Per EXT-14 inline. |
| Initial state | Begin from current `formspec-web` HEAD on `main`. FW-0014 + FW-0016 scaffold work assumed closed (verify in M0 precondition check below). If scaffold missing, agent halts and reports. | M2 MUST NOT start until FW-0015 owner approval is recorded and the stack-root dirt is either clean, committed as the cohort-1 gitlink bump, or explicitly waived. |

**M2 start waiver (2026-05-22):** Owner instructed the agent to proceed to M2 without resolving the FW-0015 licensing question now ("don't worry about licensing, i'll come back to it later") and to ignore unrelated `formspec-studio` dirt. This waiver allows M2 implementation to start; it does not close FW-0015 or ratify npm registry package consumption.

---

## 5. ADR coverage

Every ADR in [`../adr/`](../adr/) traces to a role in this plan:

| ADR | Role |
|---|---|
| [0001 — Public reference UI separation](../adr/0001-public-reference-ui-separation.md) | Structural authority. This plan IS the formspec-web work. |
| [0002 — UI framework React](../adr/0002-ui-framework-react.md) | Tech-stack authority. Vite 7 + React 19 + TS strict. |
| [0003 — License Apache-2.0](../adr/0003-license-apache-2.0.md) | **Authored by this plan in M1.** |
| [0004 — Consume primitives, do not invent them](../adr/0004-cross-repo-placement-consume-not-invent.md) | Discipline. Upstream specs and stack-common shapes are consumed verbatim. |
| [0005 — MVP scope defers cryptographic substrate](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) | Scope authority. Defines the out-of-scope cut. |
| [0006 — Issuer Sidecar Spec request](../adr/0006-issuer-sidecar-spec-request.md) | Backs FW-0004. Consumed (not implemented) in M6 with draft-stability caveat — upstream spec is `v1.0.0-draft.1`. |
| [0007 — IdentityProvider port (§6.6)](../adr/0007-identity-provider-port.md) | Backs FW-0063. Consumed in M3 (conformance) + M4 (adapters) + M7 (production close). |
| [0008 — Reference deployment composition](../adr/0008-reference-deployment-composition.md) | Backs FW-0001. Consumed in M4 + M5. |
| [0009 — Hexagonal architecture](../adr/0009-hexagonal-architecture-ports-and-adapters.md) | Architectural authority. Applied throughout. |

---

## 6. Source-of-truth pointers

- [`../specs/2026-05-22-upstream-extension-queue.md`](../specs/2026-05-22-upstream-extension-queue.md) — governs upstream dependencies; EXT-IDs cited here resolve there. New EXT-19..25 (this plan) migrated into the queue at M8.
- [`formspec-server/crates/formspec-server/src/routes.rs`](../../../formspec-server/crates/formspec-server/src/routes.rs) — runtime route reality (`GET /runtime/forms/{form_id}`, `POST /runtime/forms/{form_id}/drafts`, `GET/PATCH /drafts/{draft_id}`, `POST /drafts/{draft_id}/submit`); HTTP adapters MUST mirror this.
- [`stack-common/schemas/error.schema.json`](../../../stack-common/schemas/error.schema.json) — canonical Problem JSON shape. Required fields: `type`, `title`, `status`, `error_code` (snake_case).
- `stack-common-http` (`stack-common/crates/stack-common-http/`) — canonical HTTP middleware conventions. Cited by name by adapters:
  - `IDEMPOTENCY_KEY_HEADER = "idempotency-key"` — SubmitTransport uses this header verbatim; server-side `idempotency_middleware` honors it.
  - `extract_tenant` + `HeaderConfig::formspec()` — tenant context header convention. Current Formspec scope is four headers: `x-formspec-tenant-id`, `x-formspec-workspace-id`, `x-formspec-environment-id`, and `x-formspec-cell-id`; `departmentApp` profile attaches configured values, `publicPortal` profile attaches a sentinel full scope until EXT-24 lands.
  - `MiddlewareBuilder::with_request_id` — request-id propagation; adapter should echo back `x-request-id` from Problem JSON responses for the `ProblemDisplay` "reference" field.
- `respondent-ledger-spec §6.6 / §6.6.1 / §6.6A / §6.7` — `IdentityProvider` normalization invariants. §6.6 names the adapter-boundary as **SHOULD**; this plan elevates it to a project-local MUST at the port boundary because the port IS the adapter §6.6 describes (no provider-native leakage is enforceable here). §6.6.1 (MUST NOT silently downgrade) and §6.7 (`privacyTier` ⊥ `assuranceLevel` independence) are quoted verbatim as MUST.

The 2026-05-21 placement-and-reframe spec is **superseded** by ADRs 0004–0009 + the upstream queue. Preserved as historical context.

---

## 7. Discipline

- **Consume primitives, do not invent them** per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md). Upstream spec types (`FormDefinition`, `FormResponse`, `IntakeHandoff`, `IssuerDocument`) and stack-common shapes (Problem JSON, UUIDv7 idempotency) are consumed verbatim. The five MVP ports are adopter-side seams (deployment-shaped, not portable primitives) and are explicitly excepted by ADR-0004.
- **Hexagonal** per [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md). Every backend concern is a port; every reference adapter is one of many possible. Stub adapters are first-class deliverables, not test-only — they back the demo composition.
- **Conformance harness as oracle.** The per-port conformance suite IS the contract. Implementer-side TDD discipline (red/green/refactor) is the implementer's choice; what the plan gates is conformance, not process.
- **Documentation lives with the work.** Each milestone has a documentation exit gate. No "docs pass at the end" — that always slips.
- **Cohort submodule pointer bumps** keep cross-stack agents synced (see §9).

---

## 8. Capability milestones

Eight milestones. Each: capability statement, observable acceptance criteria, verification command, FW rows closed (where applicable), upstream dependencies, documentation exit gate.

### Dependency graph

```
M0 (precondition) → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8
                          │           │
                          └─ stubs back M5 demo composition
                                      │
                                      └─ M6 builds on M5's wired engine
```

Strict linear order. Within a milestone, tasks may fan out to parallel craftsmen (with worktree isolation per stack-root CLAUDE.md "Parallel-craftsman commit safety"). Across milestones, no skipping or reordering — a later milestone's acceptance depends on the prior one's deliverables.

EXT-23 gates M7 acceptance only. If it slips, M7 splits to M7a (anonymous-only multi-instance, MVP-shippable) + M7b (OIDC flow, deferred); the rest of the plan proceeds.

### M0 — Precondition checks

**Capability:** Verify the starting state before any milestone work begins.

**Acceptance:**
- Working tree clean (`git status` empty on `formspec-web` and stack root).
- Scaffold rows FW-0014 (TypeScript strict baseline) and FW-0016 (skeleton package + entry point) are closed in `formspec-web/PLANNING.md`; the corresponding files exist on disk (verify with `ls src/app/main.tsx src/ports/ src/adapters/stub/`).
- Sibling packages are buildable: `ls ../formspec/packages/formspec-types/dist/index.d.ts ../formspec/packages/formspec-react/dist/index.js`. If missing, run `cd .. && make build` and retry.
- `node --version` reports ≥22. `npm --version` reports ≥10.

**Verify:**
```bash
cd formspec-web
git status                                                # clean
rg -n -A4 "FW-0014" PLANNING.md | grep -i closed && rg -n -A4 "FW-0016" PLANNING.md | grep -i closed
ls src/app/main.tsx src/ports/ src/adapters/stub/         # all exist
ls ../formspec/packages/formspec-types/dist/index.d.ts    # sibling built
node --version && npm --version                           # ≥22, ≥10
```

**Halt criterion:** If any precondition fails, the agent reports the specific failure and stops. Do not proceed to M1.

---

### M1 — Repo posture for many-deployments

**Capability:** A shippable, branded, accessible, license-clean base. Container-deployable.

**Acceptance:**
- ADR-0003 (Apache-2.0) authored; LICENSE at repo root; `package.json` license matches.
- Tokens from `@formspec-org/layout` consumed (default theme + Tailwind base via `@formspec-org/adapters`); per-deployment brand override path declared (`src/theme/brand-overrides.json` or equivalent) — isolated, not woven into the core.
- CI gates on every PR: typecheck (TS strict), lint (with `no-restricted-paths` boundary per ADR-0009), unit tests (Vitest), Playwright + `@axe-core/playwright` a11y on the placeholder shell. CI also runs the vendor-leak grep as an advisory report; it does not block merge on its own per ADR-0009.
- Dockerfile produces a static-served build artifact; image runs and serves the placeholder shell over HTTP.
- README explains positioning (what is formspec-web, who is it for), the Palantir-like posture, and where to start.

**Verify:**
```bash
test -f LICENSE && grep -i "apache" LICENSE              # license file present and correct
grep '"license"' package.json | grep -i apache           # package.json matches
test -f Dockerfile                                       # Dockerfile present
docker build -t formspec-web:test . && docker run --rm -d -p 8080:80 --name formspec-web-test formspec-web:test && sleep 3 && curl -sf http://localhost:8080/ > /dev/null && docker stop formspec-web-test
npm run typecheck && npm run lint && npm test            # CI gates green
npm run test:e2e                                         # Playwright a11y passes
scripts/check-vendor-leaks.sh                            # advisory passes
test -f README.md && grep -i "respondent" README.md      # README explains positioning
test -f CONTRIBUTING.md                                  # contributing exists
```

**FW rows closed:** FW-0014, FW-0016, FW-0017, FW-0018.

**FW rows pending owner approval:** FW-0015 has a candidate source-asset implementation that consumes the local Apache-2.0 sibling source package assets and verifies manifest licenses, LICENSE files, and byte-for-byte sync via `npm run check:upstream-theme`. Owner approval is still required before this strategy can close FW-0015 because registry metadata for the package names remains AGPL-3.0-only.

**Upstream dependencies:** none.

**M1 steering note (2026-05-22):** License, Docker, CI, vendor-leak, Playwright/axe, README, and CONTRIBUTING work can land. A candidate token-consumption path uses traced static assets copied from the local Apache-2.0 sibling source packages (`@formspec-org/layout` default theme + token registry and `@formspec-org/adapters` Tailwind core CSS) with `npm run check:upstream-theme` verifying manifests, LICENSE files, and byte-for-byte sync. Do not install the npm registry artifacts for these package names until their metadata stops reporting AGPL-3.0-only.

**Documentation exit gate:** `README.md` (positioning, buyer profile, quickstart-pointer); `CONTRIBUTING.md` (license posture, boundary rules per ADR-0009).

---

### M2 — Configuration model + DI profiles

**Capability:** A configurable deployment shape. Profiles select tenant model + auth + composition shape; runtime overrides handle deploy-time values. The integration story is "pick a profile, override what you need."

**Acceptance:**
- `FormspecWebConfig` schema declared in TS, exported from the repo-local public package surface (`src/index.ts` re-exporting `src/config/` and `src/profiles/`) so adopter configs can typecheck against it; `package.json` exposes this surface even though the package remains private for MVP.
- Per-deployment config consumed from `formspec.config.ts` at repo root (typescript module included in `tsconfig.json`; type-safe, no schema-validation step needed for the common case). Static production builds read runtime overrides from `/formspec-runtime-config.js`, emitted by the Docker/nginx entrypoint from deploy-time env (`FORMSPEC_WEB_*`). Vite `VITE_*` values are dev/build fallbacks only and normalize into the same runtime config shape.
- ≥2 reference profiles ship:
  - **`departmentAppProfile`** — per-instance tenant binding (full `TenantScope` baked into config: `tenant`, `workspace`, `environment`, `cell`; reference HTTP adapters attach the four `HeaderConfig::formspec()` headers to every stack-composition request); OIDC identity required; branded.
  - **`publicPortalProfile`** — per-form implicit tenancy in the product model, but MVP reference HTTP adapters attach a sentinel full `TenantScope` until EXT-24 lets the server resolve tenancy from `form_id`; Anonymous identity acceptable; lighter brand defaults.
- Brand override path proven isolated: two instances of formspec-web with different brand configs can run side-by-side (M2 unit test; M8 multi-instance demo confirms at runtime). Implementation MUST refactor the M1 singleton theme helper into pure/injected brand config before claiming this acceptance item.
- Tenant binding option drives the reference HTTP adapter layer: bound instance attaches configured full-scope tenant headers matching `stack-common-http`'s `extract_tenant` convention; MVP implicit instance attaches sentinel full-scope tenant headers; post-EXT-24 implicit instance attaches no tenant headers and lets the upstream service resolve from `form_id`.
- `FormspecWebConfig` stays adopter-agnostic at the core contract: top-level config names profiles, tenant binding, identity policy, brand tokens, and port composition choices. Service-specific URLs, header dialects, and auth endpoints live under reference-adapter config (for the formspec-stack composition) and MUST NOT leak into `src/ports/`, `src/composition/types.ts`, or the portable profile contract.
- Until M3 lands executable per-port conformance suites, M2 profile unit tests are the interim oracle for config loading, tenant-header attachment, env overrides, and brand isolation.

**Verify:**
```bash
test -f formspec.config.ts                               # profile config file at root
grep -E "FormspecWebConfig" src/config/                  # schema exported
grep -E "departmentApp|publicPortal" src/profiles/       # both reference profiles present
grep -E "formspec.config.ts" tsconfig.json               # root config participates in typecheck
npm run typecheck                                        # config + profiles typecheck
npm test -- src/profiles                                 # profile unit tests pass
test -f docs/configuration.md && test -f docs/profiles.md
```

**FW rows closed:** none (architectural — backs every adopter-side row).

**Upstream dependencies:** server-side tenant-context header convention from `stack-common-http` (verified to exist as full `TenantScope`). Server-side per-tenant trusted-issuer config for OIDC tokens — see §10 "Known gaps" (EXT-23 if absent). EXT-24 is required before `publicPortalProfile` can truly omit tenant headers.

**Documentation exit gate:** `docs/configuration.md` (full `FormspecWebConfig` schema, env overrides, profile selection); `docs/profiles.md` (each reference profile documented; "how to author your own profile" recipe).

---

### M3 — Port surface + conformance harness

**Capability:** The five named ports are typed against real upstream spec types; the conformance suite per port is the public integration contract. Third-party adapters can run the suite against themselves.

**Acceptance:**
- Five ports declared: `DefinitionSource`, `DraftStore`, `SubmitTransport`, `IdentityProvider`, `NotificationDelivery`.
- Port types consume upstream spec types verbatim: `FormDefinition`, `FormResponse`, `IntakeHandoff` from `@formspec-org/types` (no shadow types).
- Conformance suite per port: schema-validity round-trip + one negative case per invariant per ADR-0009.
- `IdentityProvider` conformance enforces:
  - **Project-local MUST (from §6.6 SHOULD at the adapter boundary):** no provider-native key (`acr`, `amr`, `aud`, `iss`, `sub`, `iat`, `exp`, `nbf`, `vc`, `vp`, `proofType`, `issuanceDate`) at top level of `IdentityClaim`. The spec names §6.6 as SHOULD; this port is the adapter §6.6 describes, so leakage is enforceable as MUST here.
  - **§6.6.1 (spec MUST):** adapter receiving L3-equivalent evidence MUST surface `assuranceLevel: "L3"` (no silent downgrade).
  - **§6.7 (spec MUST):** `privacyTier` and `assuranceLevel` are independently representable (high-assurance + pseudonymous is valid).
- `SubmitTransport` conformance enforces UUIDv7 idempotency-key contract (same key → same confirmation; distinct keys → distinct confirmations); idempotency key sent via `stack-common-http::IDEMPOTENCY_KEY_HEADER` (`"idempotency-key"`).
- Shared utilities exist, each independently tested:
  - Problem JSON mirror matching `stack-common/schemas/error.schema.json` byte-for-byte (`error_code` is the required field, NOT `code`).
  - UUIDv7 generator (consumes `uuid` v9+).
- Conformance harness is exported from a public package surface so third-party adapter authors can install it and run it against their adapter.
- Stub adapters land for every port; each passes its own conformance suite. Stubs are first-class — they back the demo composition in M5, not just tests.

**Verify:**
```bash
ls src/ports/{definition-source,draft-store,submit-transport,identity-provider,notification-delivery}.ts
ls src/adapters/stub/{definition-source,draft-store,submit-transport,identity-provider,notification-delivery}.ts
ls tests/adapter-conformance/_framework/conformance.ts
ls tests/adapter-conformance/{definition-source,draft-store,submit-transport,identity-provider,notification-delivery}/conformance.test.ts
npm run typecheck                                        # ports + stubs typecheck against real FormDefinition / FormResponse / IntakeHandoff
npm test -- tests/adapter-conformance                    # all five port conformance suites pass against stubs
npm test -- tests/shared/problem-json                    # Problem JSON shape matches stack-common
npm test -- tests/shared/idempotency-key                 # UUIDv7 generator
test -f docs/architecture.md
ls docs/ports/{definition-source,draft-store,submit-transport,identity-provider,notification-delivery}.md
```

**Upstream dependencies:** none new — consumes existing `@formspec-org/types`.

**Documentation exit gate:** `docs/architecture.md` (DI overview, hexagonal map, the five ports, how the conformance contract works); `docs/ports/<port>.md` per port (the integration contract: what an adapter must do, what invariants it must honor, how to run the conformance suite).

---

### M4 — Reference adapter set

**Capability:** First-party adapters for the formspec-stack composition. The HTTP adapters target the real `formspec-server` routes; the identity adapters honor §6.6.

**Acceptance:**
- HTTP adapters mirror `formspec-server/src/routes.rs` exactly:
  - `DefinitionSource` → `GET /runtime/forms/{form_id}`.
  - `DraftStore` → `POST /runtime/forms/{form_id}/drafts` (create), `GET /drafts/{draft_id}` (load), `PATCH /drafts/{draft_id}` (save). Local mapping from port key (`{formUrl, subjectRef}`) to server-issued `draft_id` is encapsulated in the adapter (not leaked into the port).
  - `SubmitTransport` → `POST /drafts/{draft_id}/submit` (server-side idempotency middleware enforced).
- Identity adapters:
  - `AnonymousAdapter` — `crypto.randomUUID`-keyed claim; `provider: "anonymous"`, `assuranceLevel: "L1"`, `privacyTier: "anonymous"`.
  - `OidcAdapter` — `oidc-client-ts` driver; ACR → `assuranceLevel` mapping per §6.6.1 (no silent downgrade); adopter-overridable mapping table.
  - `MagicLinkAdapter` — consumes `NotificationDelivery` for send + an exchange callback for claim mint; cross-port composition per ADR-0007.
- Every reference adapter passes its port's conformance suite (verified by the conformance test runner, not by hand).
- The HTTP client passes the OIDC token (when present) via the Authorization header for `formspec-server` direct validation per decision B; missing/invalid token surfaces as Problem JSON.
- `NotificationDelivery` adapter set: stub-only for MVP — no HTTP adapter ships because `formspec-server` has no `/notifications` route (EXT-19 deferred). Magic-link delivery in MVP uses the stub locally and surfaces the magic-link URL inline for development.

**Verify:**
```bash
ls src/adapters/http/{http-client,definition-source,draft-store,submit-transport}.ts
ls src/adapters/identity/{anonymous,oidc,magic-link}.ts
npm test -- tests/adapter-conformance                    # all reference adapters pass their port's conformance suite
npm test -- tests/adapters/http                          # HTTP adapters' own unit tests (mocked fetch)
npm test -- tests/adapters/identity                      # identity adapters (mocked oidc-client)
grep -E "/runtime/forms/.*/drafts|/drafts/.*/submit" src/adapters/http/ -r   # routes mirror server reality
ls docs/adapters/{definition-source,draft-store,submit-transport,identity-provider,notification-delivery}.md
```

**FW rows closed:** FW-0001 (backend wire half), FW-0063 (production identity).

**Upstream dependencies:**
- EXT-19 (server `/notifications` endpoint) — blocks magic-link HTTP adapter; surfaced, not gated.
- EXT-20 (URL → form_id resolver) — blocks canonical URL pattern; surfaced, not gated for MVP (URL convention is "the full runtime endpoint URL").
- EXT-21 (server `DELETE /drafts/{draft_id}`) — blocks true draft deletion; adapter soft-deletes locally for MVP.
- EXT-23 (per-tenant trusted-issuer config + JWKS + RS256) — **filed, peer milestone, gates M7.** OidcAdapter ships at M4 against a stub server-side validator; real validation lands at M7.
- EXT-24 (server-side per-form tenant resolution) — soft; `publicPortalProfile` uses sentinel header until this lands.

**Documentation exit gate:** `docs/adapters/<port>.md` per port — what ships, what the swap recipe looks like, what conformance it verifies.

---

### M5 — Default composition + zero-config quickstart

**Capability:** Two boot modes. Production composition: env-driven, real formspec-server backend. Demo composition: stubs + sample form fixture, no backend required, renders in `npm run dev` and in the default Docker image.

**Acceptance:**
- `createDefaultComposition(config)` produces a Composition from the active profile + config + env.
- `createDemoComposition()` wires stubs + the sample-form fixture; falls back to demo mode automatically when `VITE_FORMSPEC_SERVER_URL` is unset.
- App boots, awaits `initFormspecEngine()` per `formspec/CLAUDE.md` (top-level await acceptable on Vite 7; post-MVP WASM additions must remain compatible).
- Sample form fixture ships at `src/demo/sample-form.json` — branded (uses a demo Issuer document), multilingual (English + one other), covers required + optional + repeat-group + conditional fields.
- `npm run dev` from a fresh clone renders the sample form in under 5 minutes (clock starts at `git clone`).
- Docker image's default `CMD` runs demo mode; production mode is selected by env.

**FW rows closed:** FW-0001 (composition cut).

**Upstream dependencies:** none new.

**Documentation exit gate:** `docs/getting-started.md` — five-minute quickstart from clone to rendered form via `docker-compose up`. The buyer-facing payoff for evaluators.

---

### M6 — Respondent UX baseline

**Capability:** Production-grade respondent flow against the active composition. Demo-quality polish; brand isolation guaranteed; bundle and performance under budget.

**Acceptance:**
- Engine init + draft hydration + submit + confirmation flow works end-to-end.
  - Draft hydration uses `<FormspecProvider initialData={draft?.values} definition={...} />` for the optimized path, OR per-field `engine.setValue()` loop if the external engine handle is required for `engine.getResponse()` (caveat: flat hydration only — repeat-group + conditional-group nested-path restore is post-MVP per EXT-22).
- `IssuerChromeSlot` renders branded chrome when issuer is declared (component is consumed from `@formspec-org/react`; receives `engine` prop directly per its signature; not context-derived).
- `UnbrandedCover` supplies title/description when `engine.getResolvedIssuer()` returns `source === 'unbranded'`; mutual exclusion enforced.
- Plain-language errors via Problem JSON parsing (`error_code` displayed for support reference); React error boundary catches client-side faults.
- Phone-first responsive: tap targets ≥44 px; mobile keyboard hints (`inputmode` per field type); no pinch-zoom required; viewport meta verified.
- WCAG 2.1 AA: axe-clean across every rendered surface (cover, form, error, confirmation); manual NVDA + VoiceOver sweep logged with criteria pass/fail recorded.
- Locale toggle works against the form's Locale sidecar; FEL interpolation reactive on locale change.
- Performance budget: Lighthouse mobile ≥90 on the sample form; initial bundle ≤200 KB gz; first contentful paint <1.5 s on simulated 3G.

**FW rows closed:** FW-0001 (visible flow), FW-0004, FW-0005, FW-0012, FW-0013, FW-0019.

**Upstream dependencies:** ADR-0006 Issuer Sidecar Spec is `v1.0.0-draft.1`. MVP ships the consumer surface; production-grade stability for FW-0004 depends on the spec exiting draft.

**Documentation exit gate:** `docs/ux/branding.md`, `docs/ux/errors.md`, `docs/ux/responsive.md`, `docs/ux/accessibility.md` (with the manual-sweep methodology + acceptance criteria), `docs/ux/i18n.md`.

**Gate note (2026-05-22):** implementation and automated axe/mobile smoke
checks are in place, but M6 is not release-signed. Manual VoiceOver and NVDA
sweeps remain pending in `docs/ux/accessibility.md`. Lighthouse mobile also
misses the default budget: latest local production-preview run scored about 74
with FCP about 1.7 s and LCP about 12.3 s on simulated 3G, despite initial JS
chunks staying under 200 KB gzip after lazy splitting. Production Locale
Document loading is demo-proven only until the reference server serves concrete
Locale Documents instead of only `locale_refs`.

---

### M7 — Identity production close + multi-flow demonstration

**Capability:** §6.6-conformant identity end-to-end; auth pass-through verified against the real `formspec-server`; two reference auth flows proved side-by-side.

**Acceptance:**
- `AnonymousAdapter`, `OidcAdapter`, `MagicLinkAdapter` all pass the `IdentityProvider` conformance suite from M3 — verified in CI.
- Identity change clears drafts for the prior subject (no cross-identity bleed via `DraftStore.invalidateSubject`).
- §6.6.1 silent-downgrade test runs against `OidcAdapter` with fixture tokens (ACR L1/L2/L3/L4 each produce the matching `assuranceLevel`); test fails loudly on regression.
- `formspec-server` validates OIDC tokens directly per decision B — verified by booting both web + server in docker-compose, completing an OIDC flow, and observing the server's auth middleware accept the token. **Pre-req: EXT-23 (per-tenant trusted-issuer config + JWKS client + RS256 verifier) LANDED in formspec-server.** M7 does not sign off until EXT-23 is shipped upstream; if EXT-23 slips, M7 splits into M7a (anonymous-only multi-instance proof, MVP-shippable) + M7b (OIDC flow, deferred until EXT-23).
- Two reference deployment profiles boot side-by-side in `docker-compose.yml`:
  - `departmentApp` instance: per-tenant bound, OIDC required, branded.
  - `publicPortal` instance: per-form implicit, anonymous-OK, lighter brand.
  - Both render their sample form; brand and auth isolation verified at runtime (no bleed).

**FW rows closed:** FW-0063 (production close).

**Upstream dependencies:** **EXT-23 (server-side per-tenant trusted-issuer config + JWKS + RS256). Filed; verified absent; substantive new formspec-server work. Gates M7 sign-off.**

**Documentation exit gate:** `docs/identity/integration.md` — "swap in your OIDC provider" recipe (configuration, ACR mapping, assurance gate, JWKS distribution to formspec-server); `docs/identity/multi-flow.md` — running multiple identity flows against one backend.

**Gate note (2026-05-22):** M7 is split. M7a may close anonymous-only client
identity lifecycle and multi-instance proof. Full M7 / M7b remains blocked by
EXT-23 in `formspec-server`, and the web composition still needs a bounded
access-token provider bridge for `HttpClient.accessToken` before OIDC bearer
tokens can reach the reference server without leaking into `IdentityClaim`.

---

### M8 — Deployment ergonomics + multi-instance demo + closeout

**Capability:** The deployable artifact + the multi-instance proof + dependency surface cleanup.

**Acceptance:**
- `Dockerfile` builds a static-served image (nginx or similar base); image runs demo mode by default and production mode with env-driven config.
- `docker-compose.yml` at the formspec-web root wires:
  - One `formspec-server` instance + its dependencies (postgres, object store).
  - ≥2 formspec-web instances (`departmentApp` profile, `publicPortal` profile) each on a distinct port + with distinct brand config.
- The compose stack boots cleanly (`docker-compose up` from a fresh clone); both web instances render their sample form within 60 s of start.
- Brand and auth isolation verified across the two instances by a documented manual smoke test (run from `docs/multi-deployment.md`).
- EXT-19, EXT-20, EXT-21, EXT-22, EXT-23, EXT-24, EXT-25 migrated into [`2026-05-22-upstream-extension-queue.md`](../specs/2026-05-22-upstream-extension-queue.md) with owning repo, FW rows blocked, fixture status, status (`not yet filed` / `filed` / `landed` / `gates M7` for EXT-23). Owners named where known.
- Internal-refactor debt (localStorage prefix coupling between `HttpDraftStore` and `HttpSubmitTransport`) filed as an `FW-NNNN` row in `formspec-web/PLANNING.md` for post-MVP cleanup.
- Stack-root submodule pointer bumps verified at each cohort boundary (Cohort 1 = M1; Cohort 2 = M5; Cohort 3 = M7; Cohort 4 = M8).
- All gates green: typecheck + lint + vendor-leak + unit + Playwright a11y + build under bundle budget.
- A stable internet-reachable demo URL is named and live, OR the hosting decision is recorded as a deferred follow-up (see §10).

**FW rows closed:** plan itself; MVP closeout.

**Upstream dependencies:** none new. Surfaces and schedules EXT-19..25; EXT-23 is the hard gate.

**Documentation exit gate:** `docs/deployment.md` (Docker, docker-compose, env config); `docs/multi-deployment.md` (running N instances against one backend, brand/auth isolation guarantees); `docs/operations.md` (logs, error surfaces, what's externally vs internally exposed); top-level `README.md` final polish.

**Gate note (2026-05-22):** M8 closes as a local web deployment proof, not a
full server-backed OIDC stack. `docker-compose.yml` boots two static web
instances with distinct profiles/brands and no `FORMSPEC_WEB_SERVER_URL`.
`docs/deployment.md` records the deferred server stack: EXT-23 blocks OIDC
validation, and EXT-25 tracks the production server image. Hosted demo URL
selection is also deferred.

---

## 9. Cohort cadence + cross-stack visibility

Stack-root submodule pointer bumps after each cohort cut keep cross-stack agents synced. Each cohort produces an independently shippable artifact:

| Cohort | Milestone | What's shippable | Pointer bump |
|---|---|---|---|
| 1 | M1 | First deployable container (placeholder shell, brand-clean, a11y-clean). | After M1. |
| 2a | M2 + M3 | Configuration model + port surface + conformance harness public. **First cross-stack contract visibility moment** — server-side reviewers should review the conformance harness before adapters consume it in M4. | After M3. |
| 2b | M4 + M5 | Demo composition deployable. `docker-compose up` renders the sample form. | After M5. |
| 3 | M6 + M7 | Production composition deployable. §6.6-conformant identity end-to-end against real `formspec-server` (requires EXT-23 landed). | After M7. |
| 4 | M8 | Multi-instance demo, EXT migration, MVP closeout. | After M8. |

Pointer-bump commit shape (run from stack root):

```sh
cd /Users/mikewolfd/Work/formspec-stack
git add formspec-web
git commit -m "chore(submodules): bump formspec-web — Cohort <N> (<short description>)"
```

When parallel craftsmen work on the same submodule, commit with explicit paths (`git commit <paths> -m "..."`) or use worktree isolation per stack-root CLAUDE.md "Parallel-craftsman commit safety."

---

## 10. Known gaps the MVP does not close

The plan is honest about what it does not deliver. These are P0 follow-ups when the MVP exits:

- **No named first pilot.** Buyer profile is articulated (technical evaluator on a curiosity → commitment journey); no specific adopter is committed. Without a pilot, the deployment ergonomics test is self-validated.
- **Hosted demo URL target unchosen.** docker-compose covers the local quickstart; an internet-reachable demo URL needs a hosting decision (Vercel? Cloudflare Pages? Self-hosted?). Surfaced in M8 acceptance.
- **Published layout/adapters license metadata drift blocks registry installation, not M1 source-asset consumption.** Local sibling source manifests for `@formspec-org/layout` and `@formspec-org/adapters` declare Apache-2.0, but the npm registry artifacts currently report AGPL-3.0-only (and `@formspec-org/types` transitively does the same). With web ADR-0003 selecting Apache-2.0 for formspec-web, the registry packages cannot be installed until the metadata is corrected or a new license decision is made. M1 consumes copied static assets from the local Apache-2.0 sibling source packages and verifies them with `npm run check:upstream-theme`.
- **EXT-23 (server-side per-tenant trusted-issuer config) is filed as a peer milestone.** Verified 2026-05-22: fully absent in `formspec-server` (no JWKS, no RS256, no multi-issuer registry; `jwks_url` field is config-shaped vapor). Decision B locked; EXT-23 is substantive new server-side work (issuer registry per-tenant + JWKS client + RS256 verifier path in `stack-common-auth` or `formspec-server-auth-jwt`). **Gates M7 acceptance.** Owner: formspec-server. Schedule: TBD (see §12).
- **Performance budget targets are defaults, not buyer-derived.** Lighthouse mobile ≥90, initial bundle ≤200 KB gz, FCP <1.5 s on simulated 3G — reasonable for an MVP, may need tuning against real-world conditions.
- **Sample form ownership.** A canonical sample form ships in `src/demo/sample-form.json` at M5. Source: reuse an existing fixture from `formspec/tests/fixtures/`, or design fresh, or import from `formspec-server`'s seed data. Decide before M5.
- **Profile file format.** Locked for MVP: `formspec.config.ts` (TypeScript module) typed against `FormspecWebConfig` and included in `tsconfig.json`. YAML or JSON alternatives remain future-compatible but are not part of M2.
- **EXT-19..22 scheduling.** Surfaced as queue items, not gated for MVP closeout. But they are *visible* defects in real use:
  - EXT-19 (no `/notifications`) — magic-link delivery broken; stub-only is the workaround.
  - EXT-20 (no URL → form_id resolver) — users must paste runtime endpoint URLs; not a published API.
  - EXT-21 (no `DELETE /drafts`) — "delete" only clears local pointer; server keeps the row.
  - EXT-22 (nested-path hydration) — repeat-group and conditional-group fields don't restore on draft reload.
  Move these from "queued" to "scheduled with owner and date" before the MVP is consumed by a pilot.
- **Observability and ops story is thin.** No error reporting (Sentry equivalent), no analytics, no SLO definitions. Acceptable for an evaluation MVP; not acceptable for a production deployment that handles real respondents. Post-MVP work.
- **Browser support matrix unwritten.** Modern evergreen browsers presumed. Mobile Safari quirks, older Android WebView, etc. — post-MVP.

---

## 11. Out of scope (deferred to post-crypto plan)

Everything cryptographic-substrate-dependent per web ADR-0005:

| Row | Depends on |
|---|---|
| FW-0003 verifier | EXT-15 (`@integrity-stack/bytes-wasm`) + EXT-16 (`@integrity-stack/verify`) + EXT-17 (`event`) + EXT-11 (`ProofReportVerdict` TS) |
| FW-0008 signer ceremony | SC-5 (WYSIWYS Ceremony Contract) + stack-root ADR-0083/0136/0141 |
| FW-0009 signed receipts | `trellis-export-writer` + ceremony |
| FW-0010 selective-proof viewer | trellis Phase-3 selective disclosure (SD-JWT per stack-root ADR-0116) |
| FW-0031 passkey signing | SC-4 (Identity Binding Profile) + WebAuthn binding |
| FW-0034 honest-correction | `respondent-ledger-spec` `response.correction-recorded` event + signer binder |
| FW-0035 professional signing | SC-4 + PKAF authority chain |
| FW-0038 amend/withdraw/dispute | EXT-5 (ledger event taxonomy expansion) |
| FW-0042 share-draft reviewer | New review sidecar TBD |
| FW-0043 deletion receipt | SC-2 (Deletion Receipt Sidecar) + EXT-5 (`data.erased`) |
| FW-0044 offline | Workbox + IndexedDB + idempotency; `respondent-ledger-spec` §11.5 (already specced) |
| Trust Center | Awaits Trust-Center placement decision (no ADR slot allocated yet — FW-0002 note) |

Next sub-plan: `formspec-web/thoughts/plans/2026-MM-DD-mvp-cryptographic-substrate.md` once the integrity-stack TS coverage gap (EXT-15..17) closes upstream.

---

## 12. Open EXT items surfaced by this plan

Migrated into the upstream queue at M8. Until then, IDs cited in this plan resolve here.

| ID | Class | Owning repo | Description | Gating |
|---|---|---|---|---|
| EXT-19 | Server route | `formspec-server` | `POST /notifications` endpoint — blocks magic-link delivery via HTTP adapter. | Soft (stub workaround). |
| EXT-20 | Server route + registry | `formspec-server` | URL → `form_id` resolution — blocks canonical URL pattern for end users. Today: paste runtime endpoint URL into `?form=`. | Soft (workaround docs). |
| EXT-21 | Server route | `formspec-server` | `DELETE /drafts/{draft_id}` — drafts can't be truly deleted server-side. | Soft (local soft-delete). |
| EXT-22 | Engine API or spec | `formspec` (engine) | Nested-path draft hydration — repeat-group and conditional-group fields don't restore on draft reload. | Soft per current owner direction (visible defect but not MVP-gating). |
| **EXT-23** | Server config + auth | `formspec-server` | **Per-tenant trusted-issuer config + JWKS client + RS256 verifier.** Verified 2026-05-22: fully absent (`formspec-server-auth-jwt` is HS256-only; `jwks_url` field declared but never consumed; no JwksClient, no multi-issuer registry, no per-tenant config). Filed as peer milestone in formspec-server. | **Hard: gates M7.** |
| **EXT-24** | Server route + tenant resolution | `formspec-server` | Server-side per-form tenant resolution from `form_id`. Lets `publicPortalProfile` drop the sentinel tenant header in favor of server-resolved tenancy. MVP uses the sentinel header pattern; EXT-24 is the future-flexible state. | Soft (sentinel workaround). |
| **EXT-25** | Production image | `formspec-server` | Production Dockerfile. Today: `ops/managed-single-cell/docker-compose.yml` runs the server as `cargo run` against bind-mounted source (developer compose, not a release image). MVP accepts this footprint for the local demo; EXT-25 is the hardening step for a stable hosted demo. | Soft (bind-mount works for M8 local demo; gates "stable hosted URL" follow-up). |

**Not upstream extensions (internal refactors, file as `FW-NNNN` rows):**

- localStorage key prefix duplication between `HttpDraftStore` and `HttpSubmitTransport` — refactor to a single adapter-owned resolver method.

---

## 13. Execution handoff

Plan complete and saved to `formspec-web/thoughts/plans/2026-05-22-formspec-web-prod-mvp.md`.

**Implementation guidance:**

- Read this plan, the cited ADRs (especially 0004, 0007, 0008, 0009), and the conformance harness as oracle. Where this plan and existing code diverge, the conformance harness is authoritative; ask before the plan.
- The plan is code-free deliberately. Implementer choices (TDD cadence, test framework specifics, file layout within a milestone's surface) are at the implementer's discretion. The plan gates capability + conformance + documentation, not process.
- Dispatch per cohort. Cohort 1 (M1) is a single implementer's work; Cohort 2 (M2–M5) is the natural place to fan out to parallel craftsmen (with worktree isolation per the stack-root CLAUDE.md commit-safety rule).
- Run [`formspec-specs:semi-formal-code-review`](../../../.claude-plugin/skills/formspec-specs/) per task closure. Run [`formspec-specs:semi-formal-architecture-review`](../../../.claude-plugin/skills/formspec-specs/) before and after multi-file or seam-touching work — `M2`, `M3`, `M4`, and `M8` are the natural triggers.

**Two execution options:**

1. **Subagent-driven** (recommended) — dispatch a fresh subagent per task within a milestone, review between tasks, fast iteration. Use [`superpowers:subagent-driven-development`](../../../.claude-plugin/skills/superpowers/) as the meta-skill.
2. **Inline execution** — execute tasks in this session using [`superpowers:executing-plans`](../../../.claude-plugin/skills/superpowers/), batched with checkpoints. Acceptable for Cohort 1 (M1); not recommended past that.

Pick the path that fits the work-in-flight.
