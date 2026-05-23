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
| Port conformance | `npm run test:conformance` | Yes | First-party adapters for `DefinitionSource`, `DraftStore`, `SubmitTransport`, `IdentityProvider`, and `NotificationDelivery`. |
| Unit and smoke tests | `npm run test:unit` | Yes | HTTP adapters, identity adapters, respondent flow helpers, runtime config, sample form, composition smoke, idempotency, Problem JSON. |
| Vendor firewall | `npm run check:vendor-leaks` | Yes | Prevents provider-native vocabulary and disallowed vendor names from leaking through portable surfaces. |
| Upstream theme sync | `npm run check:upstream-theme` | Yes | Verifies copied upstream theme assets are byte-for-byte synced and sourced from Apache-2.0 manifests. |
| Browser accessibility | `npm run test:e2e` | Yes | Playwright Chromium smoke with axe checks for demo, load-error, OIDC sign-in, and mobile tap-target surfaces. |
| Production build | `npm run build` | Yes | Vite production bundle and TypeScript build. |
| Full local gate | `npm run ci` | Yes | Runs all automated gates above in release order. |

CI uses the same commands as the local gate. `npm test` remains a convenient
single Vitest command, but CI calls `test:conformance` and `test:unit`
separately so conformance failures are visible as their own class.

## Coverage Matrix

| Surface | Required evidence | Current implementation |
| --- | --- | --- |
| M0-M1 scaffold and build | Typecheck, lint, unit smoke, production build. | `npm run ci`; `.github/workflows/ci.yml`. |
| M1 theme/token consumption | Source license and byte sync check. | `scripts/check-upstream-theme-assets.mjs`; `npm run check:upstream-theme`. |
| M2 profile model | Unit tests for tenant headers, runtime env normalization, brand isolation, and `reference-http` port switching. | `src/profiles/profiles.test.ts`. |
| M3 port contracts | One conformance suite per MVP port, with every first-party adapter registered. | `tests/adapter-conformance/`. |
| M4 HTTP adapters | Adapter unit tests for definition fetch, draft create/update/load/delete behavior, submit idempotency, Problem JSON, tenant headers, and anonymous session handling. | `tests/adapters/http/`. |
| M5 demo composition | Demo definition load, sample form shape, composition root smoke, and Playwright render. | `tests/demo/`, `tests/smoke/`, `tests/e2e/`. |
| M6 respondent runtime | Hydration helpers, intake handoff shape, invalid submit behavior, Problem JSON rendering, mobile smoke, and axe checks. | `tests/app/respondent-flow.test.ts`, `tests/e2e/placeholder-a11y.spec.ts`. |
| M7 identity | Anonymous, HTTP anonymous session, OIDC, and magic-link conformance; OIDC ACR L1-L4 and downgrade failures; runtime fail-closed policy, explicit sign-in, redirect-started handling, and bearer-token bridge for `oidc-required`. | `tests/adapter-conformance/identity-provider/`, `tests/adapters/identity/`, `tests/app/respondent-flow.test.ts`, `tests/app/respondent-runtime.test.tsx`, `tests/smoke/composition.test.ts`. |
| M7a multi-instance demo | Runtime config per container, profile/brand isolation, and submit smoke on ports 8080 and 8081. | `docker compose up --build` plus the manual smoke in `docs/multi-deployment.md`. |
| M8 deployment closeout | Docker build, runtime config emission, compose config, docs for deferred server stack, operations, deployment, and multi-deployment. | `npm run build`, `docker compose config`, `docs/deployment.md`, `docs/operations.md`, `docs/multi-deployment.md`. |

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
| Lighthouse mobile >= 90 and FCP < 1.5 s | `docs/ux/responsive.md` | Open performance work. |
| Production Locale Documents from server | `docs/ux/i18n.md` | Demo-proven only until server emits concrete Locale Documents. |
| Full OIDC server validation | `docs/identity/integration.md` | Blocked by EXT-23. |
| Cross-reload or cross-device draft resume | `docs/adapters/draft-store.md` | Blocked by EXT-26. |
| Session-bound anonymous draft update | `docs/adapters/draft-store.md` | Blocked by EXT-27. |

Do not describe M6, M7b, or the full server-backed reference composition as
release-signed until the relevant rows above are closed.
