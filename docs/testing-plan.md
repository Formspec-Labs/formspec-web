# Testing Plan

This plan is the test contract for the M0-M8 MVP. It maps each risk to an
executable gate or to an explicit manual release gate. A new adapter, port
change, profile change, or runtime path is not complete until this file names
the proof that covers it.

## Command Gates

| Gate | Command | Runs in CI | Covers |
| --- | --- | --- | --- |
| Type contract | `npm run typecheck` | Yes | TypeScript public surface, port shapes, profile config, adapter call sites. |
| Layering and imports | `npm run lint` | Yes | ADR-0009 boundary rules, restricted backend/provider imports, general lint. |
| Testing-plan integrity | `npm run check:testing-plan` | Yes | Ensures this plan stays wired to package scripts, CI workflow steps, and referenced test/script/doc paths. |
| Release docs | `npm run check:release-docs` | Yes | Ensures M8 hosted-demo deferral, static-export recipes, Docker reverse-proxy recipe, and server-stack blockers stay documented. |
| Port conformance | `npm run test:conformance` | Yes | First-party adapters for `DefinitionSource`, `DraftStore`, `SubmitTransport`, `IdentityProvider`, and `NotificationDelivery`. |
| Unit and smoke tests | `npm run test:unit` | Yes | HTTP adapters, identity adapters, respondent flow helpers, runtime config, sample form, composition smoke, idempotency, Problem JSON. |
| Vendor firewall | `npm run check:vendor-leaks` | Yes | Prevents provider-native vocabulary and disallowed vendor names from leaking through portable surfaces. |
| Upstream theme sync | `npm run check:upstream-theme` | Yes | Verifies copied upstream theme assets are byte-for-byte synced and sourced from Apache-2.0 manifests. |
| Browser accessibility | `npm run test:e2e` | Yes | Playwright Chromium smoke with axe checks for demo, load-error, OIDC sign-in, and mobile tap-target surfaces. |
| Production build | `npm run build` | Yes | Vite production bundle and TypeScript build. |
| Bundle budget | `npm run check:bundle-budget` | Yes | Initial JS <=200 KiB gzip and each lazy JS chunk <=200 KiB gzip after production build. |
| Compose config | `npm run check:compose-config` | Yes | Validates the reference `docker-compose.yml` used for local quickstart and multi-instance demo. |
| Compose quickstart | `npm run test:compose-quickstart` | Yes | Runs the documented `docker compose up --build` path on ports 8080/8081, checks isolated runtime profiles and brands, submits both demo forms in Chromium, and fails on browser warnings/errors. |
| Deployment headers | `npm run test:deployment` | Yes | Docker/nginx image serves JS/CSS/WASM with gzip and immutable asset caching, keeps HTML revalidated, and keeps runtime config no-store. |
| Multi-deployment smoke | `npm run test:multi-deployment` | Yes | Two Docker/nginx instances boot with separate runtime profiles, apply isolated brands, submit the demo form, and emit no browser warnings/errors. |
| Full local gate | `npm run ci` | Yes | Runs all automated gates above in release order. |

CI uses the same commands as the local gate. `npm test` remains a convenient
single Vitest command, but CI calls `test:conformance` and `test:unit`
separately so conformance failures are visible as their own class.

## Coverage Matrix

| Surface | Required evidence | Current implementation |
| --- | --- | --- |
| M0-M1 scaffold and build | Typecheck, lint, testing-plan integrity, unit smoke, production build, README, and contributing posture. | `npm run ci`; `.github/workflows/ci.yml`; `README.md`; `CONTRIBUTING.md`; `scripts/check-testing-plan.mjs`; `tests/scripts/check-testing-plan.test.mjs`. |
| M1 theme/token consumption | Source license and byte sync check. | `scripts/check-upstream-theme-assets.mjs`; `npm run check:upstream-theme`. |
| M2 profile model | Unit tests for tenant headers, runtime env normalization, brand isolation, `reference-http` port switching, configuration docs, and profile docs. | `src/profiles/profiles.test.ts`; `docs/configuration.md`; `docs/profiles.md`. |
| M3 port contracts | One conformance suite per MVP port, every first-party adapter registered, architecture docs, and per-port contract docs. | `tests/adapter-conformance/`; `docs/architecture.md`; `docs/ports/definition-source.md`; `docs/ports/draft-store.md`; `docs/ports/submit-transport.md`; `docs/ports/identity-provider.md`; `docs/ports/notification-delivery.md`. |
| M4 HTTP adapters | Adapter unit tests for definition fetch, draft create/update/load/delete behavior, submit idempotency, Problem JSON, tenant headers, anonymous session handling, and per-adapter docs. | `tests/adapters/http/`; `docs/adapters/definition-source.md`; `docs/adapters/draft-store.md`; `docs/adapters/submit-transport.md`; `docs/adapters/identity-provider.md`; `docs/adapters/notification-delivery.md`. |
| M5 demo composition | Demo definition load, sample form shape, composition root smoke, Playwright render, and quickstart docs. | `tests/demo/`, `tests/smoke/`, `tests/e2e/`, `docs/getting-started.md`. |
| M6 respondent runtime | Hydration helpers, intake handoff shape, invalid submit behavior, Problem JSON rendering, mobile smoke, axe checks, static first-paint and no-JavaScript fallback behavior, JS bundle budget, production asset compression, and UX docs. | `tests/app/respondent-flow.test.ts`, `tests/e2e/placeholder-a11y.spec.ts`, `scripts/check-bundle-budget.mjs`, `scripts/check-deployment-headers.mjs`, `docs/ux/branding.md`, `docs/ux/errors.md`, `docs/ux/responsive.md`, `docs/ux/accessibility.md`, `docs/ux/i18n.md`. |
| M7 identity | Anonymous, HTTP anonymous session, OIDC, and magic-link conformance; OIDC ACR L1-L4 and downgrade failures; runtime fail-closed policy, explicit sign-in, redirect-started handling, bearer-token bridge for `oidc-required`, and identity docs. | `tests/adapter-conformance/identity-provider/`, `tests/adapters/identity/`, `tests/app/respondent-flow.test.ts`, `tests/app/respondent-runtime.test.tsx`, `tests/smoke/composition.test.ts`, `docs/identity/integration.md`, `docs/identity/multi-flow.md`. |
| M7a multi-instance demo | Runtime config per container, profile/brand isolation, and submit smoke on two Docker/nginx instances. | `npm run test:compose-quickstart`; `npm run test:multi-deployment`; `scripts/check-compose-quickstart.mjs`; `scripts/check-multi-deployment.mjs`; `docker compose up --build` plus the browser smoke in `docs/multi-deployment.md` for human spot-checks. |
| M8 deployment closeout | Docker build, runtime config emission, nginx compression/cache headers, compose config, docs for deferred server stack, hosted-demo deferral, operations, deployment, multi-deployment, and README final polish. | `npm run build`, `npm run check:release-docs`, `npm run check:compose-config`, `npm run test:compose-quickstart`, `npm run test:deployment`, `npm run test:multi-deployment`, `scripts/check-release-docs.mjs`, `tests/scripts/check-release-docs.test.mjs`, `./docker-compose.yml`, `README.md`, `docs/deployment.md`, `docs/operations.md`, `docs/multi-deployment.md`. |

## Adapter Rules

- Every first-party adapter must be registered in the relevant conformance
  suite before it is used by `createDefaultComposition()`.
- Every production HTTP path needs both an adapter-level unit test and a
  composition smoke test when the path crosses more than one port.
- Same-key idempotency must be tested for sequential and concurrent calls.
- Anonymous server paths must prove the session token and server subject flow
  through every route the current server contract can verify.
- If a server route cannot verify a required invariant, the web adapter must
  avoid that route or document the upstream blocker. Current examples: EXT-26
  for server-backed draft read/resume and EXT-27 for session-bound anonymous
  draft update.

## Review Gates

The automated suite is necessary but not sufficient for load-bearing changes.
Before merging a change to port definitions, adapter contracts, profile model,
composition, brand isolation, or vocabulary-firewall behavior, run independent
semi-formal code and architecture review. BLOCKER and HIGH findings must be
fixed. WARNING findings must be fixed or justified in the relevant source doc.

## Manual Release Gates

These checks are not automated yet and block release sign-off:

| Gate | Evidence location | Status |
| --- | --- | --- |
| VoiceOver sweep | `docs/ux/accessibility.md` | Pending manual run. |
| NVDA sweep | `docs/ux/accessibility.md` | Pending manual run. |
| Lighthouse mobile >= 90 and FCP < 1.5 s | `docs/ux/responsive.md` | Passes on local Docker/nginx evidence; refresh before release tag. |
| Production Locale Documents from server | `docs/ux/i18n.md` | Demo-proven only until server emits concrete Locale Documents. |
| Full OIDC server validation | `docs/identity/integration.md` | Blocked by EXT-23. |
| Cross-reload or cross-device draft resume | `docs/adapters/draft-store.md` | Blocked by EXT-26. |
| Session-bound anonymous draft update | `docs/adapters/draft-store.md` | Blocked by EXT-27. |

Do not describe M6, M7b, or the full server-backed reference composition as
release-signed until the relevant rows above are closed.
