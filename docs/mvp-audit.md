# MVP Audit

This audit maps the prod-MVP plan to current proof. It is not a release
sign-off certificate: it records which M0-M8 requirements are automated,
which are local-deployment complete, and which remain blocked by manual or
upstream server evidence.

## Scope Verdict

Local web MVP proof is implemented and gated by `npm run ci`. Full production
release sign-off remains bounded by the manual and upstream rows in
`docs/testing-plan.md`.

Do not describe M6, M7b, cross-device draft resume, session-bound anonymous
draft update, production Locale Documents, or server-backed OIDC as release
signed until their blocker rows close.

## Milestone Evidence

| Milestone | Verdict | Evidence |
| --- | --- | --- |
| M0 preconditions | Source preconditions satisfied for the implementation lane; refresh local clean-tree and tool-version checks before owner-approved push. | `PLANNING.md`; `package.json`; `npm run typecheck`; `npm run ci`. |
| M1 repo posture | Automated local and CI gates prove the shippable base, Docker/static serving, README posture, Playwright/axe smoke, and upstream-theme sync. | `README.md`; `CONTRIBUTING.md`; `Dockerfile`; `.github/workflows/ci.yml`; `npm run ci`; `npm run check:upstream-theme`. |
| M2 configuration model | Typechecked profiles, runtime config normalization, tenant headers, brand isolation, and profile docs are covered by unit tests and docs. | `src/profiles/profiles.test.ts`; `docs/configuration.md`; `docs/profiles.md`; `npm run test:unit`. |
| M3 port contracts | All five MVP ports have conformance suites, first-party adapter registration coverage, public harness export, and per-port docs. | `npm run test:conformance`; `npm run check:conformance-coverage`; `src/adapter-conformance/index.ts`; `tests/adapter-conformance/`; `docs/ports/definition-source.md`; `docs/ports/draft-store.md`; `docs/ports/submit-transport.md`; `docs/ports/identity-provider.md`; `docs/ports/notification-delivery.md`. |
| M4 reference adapters | HTTP and identity adapters are covered by adapter unit tests, conformance registration, Problem JSON handling, tenant/auth headers, idempotency, and docs. | `tests/adapters/http/definition-source.test.ts`; `tests/adapters/http/draft-store.test.ts`; `tests/adapters/http/submit-transport.test.ts`; `tests/adapters/http/http-client.test.ts`; `tests/adapters/http/anonymous-session.test.ts`; `tests/adapters/identity/anonymous.test.ts`; `tests/adapters/identity/oidc.test.ts`; `tests/adapters/identity/magic-link.test.ts`; `docs/adapters/definition-source.md`; `docs/adapters/draft-store.md`; `docs/adapters/submit-transport.md`; `docs/adapters/identity-provider.md`; `docs/adapters/notification-delivery.md`. |
| M5 default composition | Demo composition, sample form, production composition switch, quickstart docs, and Chromium quickstart smoke are automated. | `tests/demo/sample-form.test.ts`; `tests/smoke/composition.test.ts`; `docs/getting-started.md`; `npm run test:compose-quickstart`; `npm run check:release-docs`. |
| M6 respondent runtime | Runtime helpers, explicit OIDC sign-in state, error/no-JS/mobile/a11y smoke, bundle budget, and deployment headers are automated; manual AT and production Locale Documents remain blockers. | `tests/app/respondent-flow.test.ts`; `tests/app/respondent-runtime.test.tsx`; `tests/e2e/placeholder-a11y.spec.ts`; `npm run check:bundle-budget`; `npm run test:deployment`; `docs/ux/accessibility.md`; `docs/ux/i18n.md`; `docs/testing-plan.md`. |
| M7 identity close | M7a anonymous/multi-flow client proof is automated; M7b server-backed OIDC validation remains blocked by EXT-23. | `tests/adapter-conformance/identity-provider/conformance.test.ts`; `tests/adapters/http/anonymous-session.test.ts`; `tests/adapters/identity/oidc.test.ts`; `tests/smoke/composition.test.ts`; `docs/identity/integration.md`; `docs/identity/multi-flow.md`; `thoughts/specs/2026-05-22-upstream-extension-queue.md`; `npm run check:upstream-blockers`; `scripts/check-upstream-blockers.mjs`. |
| M8 deployment closeout | Local Docker/nginx deployment, runtime config, compression/cache headers, compose config, quickstart, multi-deployment brand isolation, deferred hosted-demo decision, and EXT-19..27 migration are gated. | `npm run build`; `npm run check:compose-config`; `npm run test:compose-quickstart`; `npm run test:deployment`; `npm run test:multi-deployment`; `npm run check:release-docs`; `npm run check:upstream-blockers`; `docker-compose.yml`; `docs/deployment.md`; `docs/operations.md`; `docs/multi-deployment.md`; `thoughts/specs/2026-05-22-upstream-extension-queue.md`; `scripts/check-upstream-blockers.mjs`. |

## Release Sign-Off Boundaries

| Boundary | Status | Evidence |
| --- | --- | --- |
| VoiceOver sweep | Pending manual run. | `docs/ux/accessibility.md`; `docs/testing-plan.md`. |
| NVDA sweep | Pending manual run. | `docs/ux/accessibility.md`; `docs/testing-plan.md`. |
| Lighthouse mobile refresh | Passes on local Docker/nginx evidence; refresh before release tag. | `docs/ux/responsive.md`; `docs/testing-plan.md`. |
| Production Locale Documents from server | Demo-proven only until server emits concrete Locale Documents. | `docs/ux/i18n.md`; `docs/testing-plan.md`. |
| Full OIDC server validation | Blocked by EXT-23. | `docs/identity/integration.md`; `thoughts/specs/2026-05-22-upstream-extension-queue.md`; `docs/testing-plan.md`; `npm run check:upstream-blockers`. |
| Cross-reload or cross-device draft resume | Blocked by EXT-26. | `docs/adapters/draft-store.md`; `thoughts/specs/2026-05-22-upstream-extension-queue.md`; `docs/testing-plan.md`; `npm run check:upstream-blockers`. |
| Session-bound anonymous draft update | Blocked by EXT-27. | `docs/adapters/draft-store.md`; `thoughts/specs/2026-05-22-upstream-extension-queue.md`; `docs/testing-plan.md`; `npm run check:upstream-blockers`. |
| Hosted demo URL | Deferred to user action. | `docs/deployment.md`; `docs/operations.md`; `README.md`. |

## Audit Gate

`npm run check:mvp-audit` verifies this file still names every M0-M8 milestone,
keeps the release sign-off boundaries explicit, and points each cited evidence
path at a real local file or package script. `npm run check:upstream-blockers`
checks the sibling `formspec-server` checkout for the current blocker
indicators and documented alternate landing shapes for EXT-23, EXT-26, and
EXT-27. It is a local stack gate, not a substitute for reviewing new server
architecture after those upstream extensions land.
