# Web Planning

Atomic `FW-*` rows for the public reference UI. Reshaped 2026-05-22 per [web ADR-0005](thoughts/adr/0005-mvp-scope-defer-cryptographic-substrate.md) into **MVP** + **Post-MVP** phases.

Format reference: [`CLAUDE.md`](CLAUDE.md). Person-need source: [`JOURNEYS.md`](JOURNEYS.md). Upstream dependencies: [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](thoughts/specs/2026-05-22-upstream-extension-queue.md).

## Phases

- **MVP** — the slice that ships first. Respondent fill + validate + submit + identity + a11y. No cryptographic substrate. See [web ADR-0005](thoughts/adr/0005-mvp-scope-defer-cryptographic-substrate.md).
- **Post-MVP** — every other row. Each carries a `Blocked on:` annotation naming the upstream extension (EXT-*), new sidecar (SC-*), or cross-stack ADR (XS-*) it depends on. Cross-reference target: [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](thoughts/specs/2026-05-22-upstream-extension-queue.md).

**Port-shape framing.** Per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md), every row that touches a backend concern is expressed in terms of the **port** it consumes (`DefinitionSource`, `DraftStore`, `SubmitTransport`, `IdentityProvider`, `NotificationDelivery`, `StatusReader`, `BundleSource`, `Verifier`). Specific backend services appear only as reference adapters in the formspec-stack composition ([web ADR-0008](thoughts/adr/0008-reference-deployment-composition.md)). Adopter compositions wire different adapters.

**Runtime feature framing.** Per [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), post-MVP respondent features resolve from instance capabilities, org runtime policy, and form runtime policy into one read-only runtime profile. A form that requires a feature the instance cannot support, or that the org forbids, fails at load time with a typed configuration error. Optional features resolve off without silently downgrading required behavior.

## User-value sequencing lens

This is a prioritization overlay, not a replacement for the `FW-*` rows. Treat a row as a feature when it changes what a respondent, signer, issuer, or evaluator can actually do or prove. Treat copy polish, explanation-only surfaces, and alternate presentation modes as lower priority unless a specific deployment marks them required through ADR-0011 runtime policy.

| Priority | Feature tier | Rows | Why it is not sugar | Configuration lens |
|---:|---|---|---|---|
| 1 | Production status surface | FW-0039 | Gives the respondent a real answer after submit: received, queued, reviewed, issued, or blocked. | Requires `StatusReader`; form/org may require or forbid status exposure. |
| 2 | Respondent-owned obligations stream | FW-0055 | Turns scattered issuer tasks into "what do I owe next?" across senders. | Requires respondent-place storage, token bag, issuer participation, and org policy. |
| 3 | Respondent document library and selective presentation | FW-0056 | Lets the respondent reuse evidence and choose what to share instead of re-uploading per form. | Requires encrypted wallet/storage and selective-presentation policy. |
| 4 | Cross-issuer respondent history | FW-0057 | Gives durable memory of drafts, submissions, and signed records. | Requires production FW-0055/FW-0056 foundations plus persistence/export policy. |
| 5 | Signed receipt and long-life receipt access | FW-0009, FW-0054 | Gives the respondent durable proof they can keep, print, and verify later. | Requires receipt/export/verifier capability and org retention policy. |
| 6 | Abandon-and-erase with deletion receipt | FW-0043 | Makes deletion a provable user action, not a best-effort privacy claim. | Requires deletion sidecar, erasure hooks, legal-hold policy, and typed failure when unsupported. |
| 7 | Correction, amendment, withdrawal, and dispute lifecycle | FW-0034, FW-0038 | Covers the real life of a submitted record after mistakes, changed intent, or disputes. | Requires ledger lifecycle events and org/form action windows. |
| 8 | Offline-capable fill with deferred submit | FW-0044 | Lets respondents finish despite unreliable connectivity and prevents duplicate submits. | Requires browser queue, idempotent submit transport, and form offline-safety declaration. |
| 9 | Identity continuity and stronger auth/signing paths | FW-0020, FW-0028, FW-0030, FW-0031 | Avoids repeated identity proofing and supports assurance-dependent forms. | Requires identity/session adapters, assurance floors, and org IdP policy. |
| 10 | File upload as a primary act | FW-0033 | Supports evidence-heavy forms where the upload is part of the submission, not decoration. | Requires object storage, attachment binding, file limits, and redaction/capture policy. |
| 11 | Payments with atomic submit | FW-0027 | Makes fee-bearing submissions safe: pay and submit succeed or fail as one transaction. | Requires payment rail, merchant/org policy, and form fee declaration. |
| 12 | Embed and third-party host widget | FW-0040, FW-0053 | Lets trusted hosts collect forms without sending users to an unfamiliar domain. | Requires embed transport, allowed origins, CSP policy, and form embeddability. |
| 13 | Multi-party submission | FW-0050, FW-0061 | Supports joint legal, tax, immigration, custody, and financial workflows. | Requires party/session orchestration, per-party visibility, and party model policy. |
| 14 | Safe-address handling | FW-0049, FW-0060 | Protects survivors and protected parties without breaking verification. | Requires privacy/redaction substrate, jurisdiction policy, and protected-field declarations. |
| 15 | Trusted reviewer and preparer flows | FW-0042, FW-0037 | Lets lawyers, advocates, family, and preparers help without taking over the respondent's identity or signature. | Requires sharing/role sidecar, permissions, and org/form role policy. |

The next coherent post-MVP tier is FW-0039 + FW-0055 + FW-0056 + FW-0057: finish the respondent-place promise before adding adjacent capabilities. Each tier still needs the ADR-0011 resolution surface before production enablement.

## Status vocabulary

*open* | *in design* | *in build* | *live* | *closed*. Same set as JOURNEYS.

## Migration note

FW-0001 / FW-0002 / FW-0003 are renames of `formspec-cloud/PLANNING.md`'s CLD-0001 / CLD-0007 / CLD-0008, carved out during the bootstrap of this repo (web ADR-0001). Numbering after FW-0003 was freshly assigned. The 2026-05-22 reshape adds FW-0063 (identity layer) and reorganizes the existing rows into MVP / Post-MVP phases; no prior FW-* IDs are reused or shifted.

---

## MVP

MVP rows in build-dependency order: gating decisions first (framework, license, tokens, build pipeline), then the thin-slice render, then quality gates and the identity layer.

### FW-0014 — Ratify UI framework choice (ADR-0002)

- **Phase:** MVP
- **Status:** closed (2026-05-22)
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** [web ADR-0002](thoughts/adr/0002-ui-framework-react.md) documents React (with Vite, client-only for MVP) as the UI framework, consuming the existing `@formspec-org/react` package (`<FormspecProvider>` + `<FormspecForm />` + hooks) as the engine consumer. Web Components and Preact considered; tradeoffs explicit. The `<formspec-render>` web component stays as the framework-agnostic conformance surface for non-React adopters.

### FW-0018 — License decision and LICENSE file (ADR-0003)

- **Phase:** MVP
- **Status:** closed (2026-05-22)
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** [web ADR-0003](thoughts/adr/0003-license-apache-2.0.md) selects Apache-2.0 with rationale. LICENSE file added at repo root. Per-file headers are not required for MVP files; files inherit the repository license unless otherwise noted.
- **Flag for review:** `@formspec-org/assist` is BUSL-1.1 (per cross-stack inventory 2026-05-22). It remains post-MVP and requires a separate ADR before consumption. Also verified during M1: the npm registry metadata for `@formspec-org/layout`, `@formspec-org/adapters`, and `@formspec-org/types` currently reports AGPL-3.0-only despite the local sibling source manifests declaring Apache-2.0. formspec-web must not consume those registry artifacts while the repo is Apache-2.0.

### FW-0015 — Design tokens to a structured token file

- **Phase:** MVP
- **Status:** in review (candidate implementation landed; pending owner approval)
- **Persona:** Platform
- **Journey:** (none — platform)
- **Candidate implementation:** Consumes `@formspec-org/layout` default theme + token registry and `@formspec-org/adapters` `tailwind-formspec-core.css` from the local sibling source packages under `../formspec/packages/`, whose manifests and LICENSE files declare Apache-2.0. The copied assets live under `src/theme/upstream/` and are verified with `npm run check:upstream-theme`; formspec-web-specific overrides stay isolated in `src/theme/brand-overrides.json`. The token vocabulary is the upstream-shipped registry; formspec-web does NOT author a new vocabulary. Registry package installation remains avoided while npm metadata reports AGPL-3.0-only for the same package names.
- **Pending:** Owner approval is required to ratify the source-asset strategy as satisfying the M1 token-consumption gate while registry package metadata remains wrong.

### FW-0016 — Build and test pipeline producing a deployable artifact

- **Phase:** MVP
- **Status:** closed (2026-05-22)
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** Local and CI build paths run `npm run ci`: typecheck (`tsc --noEmit`), lint (`eslint .` with `no-restricted-paths` enforcing web ADR-0009 §Discipline boundary), testing-plan integrity, release-docs integrity, port conformance, unit/smoke tests, vendor-leak grep, upstream-theme sync, Playwright + axe, production build, bundle budget, compose config validation, documented compose quickstart smoke, Docker/nginx deployment headers, and Docker/nginx multi-deployment smoke. The Docker image builds static assets into nginx, writes runtime config from `FORMSPEC_WEB_*` environment variables at container start, compresses fingerprinted JS/CSS/WASM assets, serves them immutable, keeps HTML revalidated, and keeps runtime config no-store. The comprehensive gate matrix lives in `docs/testing-plan.md`, is enforced by `npm run check:testing-plan`, and keeps M8 deployment docs plus EXT-19..27 queue migration covered through `npm run check:release-docs`.

### FW-0001 — End-to-end Respondent thin-slice (deployable)

- **Phase:** MVP
- **Status:** live (MVP reference path; release-signoff gaps tracked below)
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-recovers-from-validation-and-never-loses-work)
- **Done:** A real respondent can open a form URL, fill required fields, hit a validation error, recover, submit, and see a confirmation — backed by a real backend wire. Closing the tab and returning later (on the same or a different device) leaves every answer where it was. Errors read in plain English with a reference number the user can quote to support, never "something went wrong."
- **Anti-patterns:** AP-001, AP-013, AP-015.
- **Note:** Leads the backlog deliberately. Forces framework, design tokens, build, and accessibility-baseline decisions to fall out as evidence (FW-0014..0018), not as whiteboard rows. Consumes ports `DefinitionSource` (read), `DraftStore` (read+write), `SubmitTransport` (write). Issuer resolution is engine-owned (`IssuerStore` per web ADR-0006); composition wires a `FetchIssuerFetcher`, not a port. Submit boundary contract: `formspec/schemas/intake-handoff.schema.json` with `initiationMode: "publicIntake"`. Per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md) the row delivers the port-consuming React shell + at least stub adapters that demonstrate the seam is real (typically swapped for HTTP adapters in the formspec-stack reference composition — see [web ADR-0008](thoughts/adr/0008-reference-deployment-composition.md)). Migrated from `formspec-cloud/PLANNING.md` CLD-0001.
- **Progress (M8 closeout 2026-05-22):** React shell mounts (`src/app/main.tsx` → `CompositionProvider` → `App`) and lazy-loads `RespondentRuntime`; the runtime consumes `@formspec-org/react` via `FormspecProvider`, `IssuerChromeSlot`, and `FormspecNode`; demo mode renders the bundled multilingual sample form end-to-end; production mode wires `HttpDefinitionSource`, `HttpDraftStore`, and `HttpSubmitTransport` when `FORMSPEC_WEB_SERVER_URL` selects `reference-http` data ports. Public anonymous production creates a server-issued anonymous session before draft create/submit. Submit handoff carries response data and draft binding, and the production composition smoke covers the two-save runtime path before submit.
- **Remaining release gaps:** cross-reload / cross-device draft resume is not server-backed until EXT-26; in-place anonymous draft update is not session-bound server-side until EXT-27, so web creates a fresh anonymous draft per save; full OIDC production submit waits for EXT-23 server-validation proof.

### FW-0004 — First-paint legitimacy: the sender's brand, what this is, who's asking

- **Phase:** MVP
- **Status:** live
- **Persona:** Respondent
- **Journey:** [J-001](JOURNEYS.md#j-001--first-impression-is-this-legitimate-and-can-i-trust-it-for-the-next-ten-minutes)
- **Done:** First paint shows the sender's brand front and center, the platform's brand subordinate, and a one-line statement of who is asking and why — all above the fold on a phone, with no popup, no consent wall, and no humanity gauntlet between the click and the form. The user can decide "this is legitimate" without scrolling.
- **Anti-patterns:** AP-012.
- **Note:** Substrate ships. `RespondentRuntime` consumes `IssuerChromeSlot` from `@formspec-org/react`; the cascade + chain walk + cycle guard run inside the engine's `IssuerStore`. Demo and compose smoke prove branded first paint for `formspec-public` and `formspec-department`; unbranded fallback remains available when the engine resolves `source === "unbranded"`.

### FW-0005 — Phone-first form-fill, one-handed

- **Phase:** MVP
- **Status:** live
- **Persona:** Respondent
- **Journey:** [J-004](JOURNEYS.md#j-004--filling-it-out-on-a-phone-one-handed-on-the-bus)
- **Done:** The form works on a phone in one hand: tap targets reachable with the thumb, the right keyboard for the right field (numbers, dates, email), no pinch-zoom, primary buttons in reach. The form was designed for the phone first; the desktop layout is a wider variant, not the other way around.
- **Anti-patterns:** —
- **Note:** Phone parity is part of the M6 baseline. `docs/ux/responsive.md` records the current mobile behavior and the Playwright mobile tap-target check gates it. Latest local Docker/nginx Lighthouse evidence passes the mobile >=90 and FCP <1.5 s budget; refresh that measurement before a release tag.

### FW-0013 — Plain-language errors and typed problem detail

- **Phase:** MVP
- **Status:** live
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-recovers-from-validation-and-never-loses-work) (deep cut)
- **Done:** Every error the user sees says what went wrong in plain English, names whether it's something they need to fix or something the system needs to fix, and carries a short reference ID the user can quote. Cross-field contradictions ("your dependent's birthdate makes them 19 but you marked them as a child under 17") are stated in those terms, not as code names.
- **Anti-patterns:** AP-013.
- **Note:** The M6 shell parses Problem JSON, renders support references, catches client-side runtime failures, and blocks invalid submit with plain-language guidance. Deeper cross-field contradiction copy and exhaustive error-class review remain post-MVP polish; the current release gate is documented in `docs/ux/errors.md`.

### FW-0012 — Accessibility: WCAG 2.1 AA across every production surface

- **Phase:** MVP
- **Status:** in build (automated gates live; manual AT release sign-off pending)
- **Persona:** Platform / Respondent
- **Journey:** [J-005](JOURNEYS.md#j-005--i-use-a-screen-reader-i-have-low-vision-my-hands-shake-the-form-needs-to-work)
- **Done:** A blind respondent on a screen reader, a low-vision respondent at 400% zoom, a respondent who navigates by keyboard, an older respondent on a shaky touch — each can finish the form alone, on their own tools. Every surface has an automated a11y check captured in CI; failing surfaces have a tracked fix row.
- **Anti-patterns:** —
- **Note:** Automated axe checks run in Playwright for the current rendered surfaces. Manual VoiceOver and NVDA sweeps are still pending in `docs/ux/accessibility.md`; treat M6 as implementation-ready but not release-signed until those rows are completed.

### FW-0017 — Accessibility automation in CI

- **Phase:** MVP
- **Status:** closed (2026-05-22)
- **Persona:** Platform
- **Journey:** (none — platform; supports FW-0012)
- **Done:** `.github/workflows/ci.yml` runs Node 22, `npm ci`, Playwright Chromium install, typecheck, lint, Vitest, vendor-leak grep, Playwright + axe, and build. `tests/e2e/placeholder-a11y.spec.ts` gates the current placeholder shell with `@axe-core/playwright`; deeper production surfaces add their own cases when they land.
- **Note:** The advisory vendor-name grep lives at `scripts/check-vendor-leaks.sh` and supports web ADR-0009's layered enforcement.

### FW-0019 — Multilingual form: respondent's language with the legally controlling text marked

- **Phase:** MVP
- **Status:** live (demo Locale sidecars; server Locale Documents pending)
- **Persona:** Respondent
- **Journey:** [J-010](JOURNEYS.md#j-010--translate-this-form-into-my-language-without-bending-the-legal-meaning)
- **Done:** The respondent reads the form in their language, sees the legally controlling text marked plainly, and writes narrative fields in their own words. Names in multiple scripts are first-class.
- **Anti-patterns:** —
- **Note:** The respondent runtime loads bundled demo Locale Documents and exposes the English/Spanish toggle. Production server payloads currently expose `locale_refs` only; concrete server-served Locale Documents remain a release gap documented in `docs/ux/i18n.md`. Certified-translator attribution on narrative translations is post-MVP (see queue EXT-2 for the Response per-value provenance dependency).

### FW-0063 — `IdentityProvider` port + conformance suite + ≥1 reference adapter

- **Phase:** MVP
- **Status:** live (M7a; M7b blocked on EXT-23)
- **Persona:** Respondent / Signer
- **Journey:** [J-019](JOURNEYS.md#j-019--im-on-a-public-library-terminal-with-twenty-minutes-and-no-email), [J-032](JOURNEYS.md#j-032--sign-in-with-something-i-already-have-not-yet-another-password), [J-034](JOURNEYS.md#j-034--i-already-proved-who-i-am-to-logingov--idme--nhs--dont-make-me-do-it-again) (basic slices)
- **Done:** Ship the `IdentityProvider` port (`src/ports/identity-provider.ts`) per [web ADR-0007](thoughts/adr/0007-identity-provider-port.md) + its conformance suite (`tests/adapter-conformance/identity-provider/`) + at least one production-grade reference adapter (specific adapter choice for the formspec-stack composition is in [web ADR-0008](thoughts/adr/0008-reference-deployment-composition.md); other compositions wire `FirebaseAuthAdapter` / `SupabaseAuthAdapter` / `ClerkAdapter` / `Auth0Adapter` / etc.). Anonymous fill remains a first-class path. Adapter `authenticate()` output MUST be normalized to `respondent-ledger-spec.md` §6.6 shape before any ledger write — the conformance suite verifies this for any adapter.
- **Progress (M7a/M8 closeout 2026-05-22):** `IdentityProvider` port interface is §6.6-aligned; conformance covers stub, local anonymous, HTTP anonymous session, OIDC, and magic-link adapters. `OidcAdapter` normalizes ACR L1-L4 and fails on weak/unknown assurance instead of leaking provider-native vocabulary. The default composition bridges the concrete `OidcAdapter`'s current access token into `HttpClient.accessToken` without adding raw token fields to `IdentityClaim` or the port. The runtime auto-authenticates only side-effect-free anonymous options, renders an explicit sign-in surface for production `oidc-required` profiles, treats OIDC redirect-started as in-progress rather than a load failure, subscribes to identity changes, invalidates prior subject drafts, and reloads ready state. Full M7b remains blocked by EXT-23 server-validation proof in `formspec-server`.
- **Anti-patterns:** AP-001, AP-006, AP-020, AP-022.
- **Note:** Adopter-side per [web ADR-0004](thoughts/adr/0004-cross-repo-placement-consume-not-invent.md) — no upstream spec. Architecture per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md). Specific adapter choice for the OSS reference deployment is a composition decision (see [web ADR-0008](thoughts/adr/0008-reference-deployment-composition.md)), separate from this row. FW-0028 (multi-IdP picker with assurance filtering) is post-MVP and consumes the same port.

---

## Post-MVP

Each row preserves its original `Done` content; the new `Blocked on:` annotation names the upstream dependency that gates it. References resolve into [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](thoughts/specs/2026-05-22-upstream-extension-queue.md).

### FW-0064 — Adapter-owned draft binding registry

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** `HttpDraftStore` and `HttpSubmitTransport` share draft binding through an adapter-owned registry or composition helper instead of passing a web-runtime draft key through `IntakeHandoff.extensions` and resolving it back through `HttpDraftStore.draftIdFor()`. The port contracts stay unchanged; the cleanup is entirely inside the formspec-stack reference adapter composition.
- **Blocked on:** no upstream block. Internal refactor filed from M8 closeout. The original milestone note called this "localStorage prefix coupling"; the landed implementation uses in-memory draft binding rather than localStorage, but the cleanup target is the same adapter-boundary coupling between draft persistence and submit.

### FW-0065 — Runtime feature resolver scaffold + policy gates

- **Phase:** Post-MVP
- **Status:** in build
- **Persona:** Platform
- **Journey:** (none — platform; backs every post-MVP feature row)
- **What:** Land the `RuntimeFeatureResolver`, typed configuration error classes, the `ResolvedRuntimeProfile` context, both adapter provenance markers (unavailable + demo-stub), the composition coherence assertion, the form-load error boundary that renders a plain-language unavailable page, and **the gating of the two seeded callsites (`respondentPlaceSource.readPlace`, `statusReader.readStatus`) on the resolved profile**. Seeded with `respondentPlace` and `status` capability keys; future feature ADRs extend the taxonomy.
- **Done:** (a) resolver + typed errors + fixture cases + form-load error gate compile and ship green via `npm run ci`; (b) every shipped composition passes `assertCompositionCoherence` (covering BOTH unavailable + demo-stub provenance, mode-aware) at construction; (c) `RespondentRuntime` catches `RuntimePolicyError` and renders the unavailable page with the typed code as the support reference (proved via fault-injection test); (d) locale-recompute discipline wired with tripwire test; (e) the two seeded callsites are gated — production composition with both disabled triggers ZERO adapter calls and renders no respondent-place panel, proved via `tests/app/runtime-feature-gating.test.tsx`; (f) `package.json` `test:unit` includes `src/policy`, `tests/policy-resolution`, and `tests/profiles` so the suite ships to CI; (g) adopter doc at `docs/policy/runtime-feature-resolution.md` covers the extension protocol.
- **User-visible behavior change:** today's demo composition is unchanged (both features enabled, panel renders). Today's production composition (both features `unavailable`) now correctly **hides** the respondent-place panel and never invokes the unavailable adapters — closing the production-bug Codex flagged where the unconditional `loadRespondentPlace` would throw.
- **Consumes ports:** none (pure resolver) — but extends the Composition surface every port consumer ultimately reads.
- **Note:** Closes the ADR-0011 Follow-on Work items (RuntimeFeatureResolver design/impl, typed errors, plain-language rendering, fixtures) AND closes Codex red-team findings on CI inclusion, seeded-callsite gating, and demo-stub provenance. Per ADR-0011 Non-goals, no canonical JSON schema for policy documents is defined here. Per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md) the resolver lives in `src/policy/` (pure core).

### FW-0066 — Promote `getFormRuntimePolicy` to a `FormRuntimePolicyExtractor` port

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform; backs every feature row whose form-policy extractor carries non-trivial logic)
- **Done:** `Composition.getFormRuntimePolicy(definition) => FormRuntimePolicy` is promoted to a named `FormRuntimePolicyExtractor` port with an `adapter-conformance` suite (per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md)). The inline TODO in `src/composition/types.ts` is removed; `docs/policy/runtime-feature-resolution.md` updates to describe the port rather than the function-typed slot. Trigger: the moment the first feature ADR ships a non-trivial extractor — anything more than `() => ({ features: {} })` or a URL-keyed literal switch.
- **Blocked on:** no upstream block. Filed from web ADR-0011 / FW-0065 closeout (scout HIGH-1 + arch HIGH-1, 2026-05-23). The function-typed slot shipped because no extractor today carries logic worth conformance-testing; per ADR-0011 §Non-goals, "this ADR does not add every future feature port now." The first feature ADR with real extractor logic (e.g., a locale-conditional or definition-introspective extractor) trips this row.

### FW-0002 — Trust Center browseable without sign-in

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-006](JOURNEYS.md#j-006--evaluator-procurement-browses-trust-center-pre-purchase)
- **Done:** A procurement reviewer can browse the Trust Center — data flow, capability matrix, subprocessor list, selective-proof artifacts — from an unauthenticated session. Pages are indexable by search engines. No sales gate, no popup, no contact form between the buyer and the answer to their question.
- **Blocked on:** post-MVP architectural call on Trust Center page-by-page allocation between this repo and `formspec-site/` (no ADR slot allocated yet — the previously-reserved web ADR-0002 was reassigned to the framework decision per FW-0014). The verifier widget stays here regardless. Migrated from CLD-0007.
- **Anti-patterns:** AP-023.

### FW-0003 — Verifier validates a receipt and shows the claim graph

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt--without-an-account-without-trusting-us)
- **Done:** Drag-drop, paste, or follow-a-link gets the receipt onto the page. Within seconds the page shows pass or fail, who signed, when, what they signed (verbatim), and whether anything has been changed since. No login, no account, no tracking, no service dependency.
- **Consumes ports:** `BundleSource` (drag-drop / HTTP / file / IPFS — content-addressed) + `Verifier` (hybrid TS+WASM per web ADR-0009 §(d) principle). **Port shapes are post-MVP per web ADR-0009 §"Not in the constitutional inventory" (b) — each will be ratified as its own ADR when this row's consumer code lands.**
- **Blocked on:** the post-MVP verifier needs more than the signature-verification slice. The Phase-1 COSE_Sign1 SIGNATURE step is already TS-shipped (`@formspec/signature-adapter-webcrypto` + `@integrity-stack/cose`). The FULL verifier pipeline also needs: byte-exact primitives WASM-bundled (queue EXT-15: `@integrity-stack/bytes-wasm` = canonical + cbor + bundle); TS verifier orchestrator (EXT-16: `@integrity-stack/verify`); tiny event helper (EXT-17); plus TS mirrors for `ProofReportVerdict` (EXT-11). The hybrid TS+WASM strategy per ADR-0009 §(d) is the chosen path; pure-TS reimplementation of byte-exact primitives is rejected (JS-vs-Rust encoding drift risk). Migrated from CLD-0008. Phase-3 BBS+ / SD-JWT selective-disclosure is post-MVP per stack-root [ADR-0116](thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md) (SD-JWT default, BBS+ profile-gated). Offline-bundle version is FW-0052; plain-paper version is FW-0009.
- **Anti-patterns:** AP-003, AP-006, AP-023.

### FW-0006 — Trail-sign cover page: time, cost, what to bring

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-024](JOURNEYS.md#j-024--tell-me-up-front-how-long-this-will-actually-take-and-what-i-need-ready)
- **Done:** Before any field, the respondent sees a trailhead page: realistic time to complete, what documents to have ready, the total cost itemized — base fee, surcharges, processing — pinned and visible.
- **Blocked on:** queue EXT-7 (`definition.metadata.preparation` + `fees` FEL-calculated). Time-to-complete statistics half is doubly blocked on adoption-time data — no real completions yet.

### FW-0007 — Pre-submit consequences screen with per-action consent

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-015](JOURNEYS.md#j-015--show-me-the-consequences-before-i-submit--including-what-becomes-irreversible)
- **Done:** The step before submit reads like a flight itinerary: who receives the submission, what gets triggered, what deadlines now apply, which fields lock, what cannot be undone. Anything that fires an external action — credit check, cross-agency referral, mandatory report, payment — is its own deliberate consent moment. Each external action produces its own signed authorization the respondent can later cite.
- **Blocked on:** queue EXT-1 (item-metadata `consequences` block on Definition) + EXT-5 (ledger event for per-action signed authorizations).
- **Anti-patterns:** AP-004, AP-009, AP-010.

### FW-0008 — Signer ceremony: per-field affirmative act, scroll-to-end gate

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Signer
- **Journey:** [J-008](JOURNEYS.md#j-008--sign-here-but-first-show-me-exactly-what-im-signing)
- **Done:** Before signing, the signer sees the exact document that will be signed, scrollable, with every value visible — the bytes they sign are the bytes they saw. Each signature and initial field is its own deliberate tap, never a bulk apply. No cursive-font name-stamping.
- **Blocked on:** queue SC-5 (WYSIWYS Ceremony Contract annex to `signature-method-registry.md`) + cryptographic substrate work.
- **Anti-patterns:** AP-002, AP-003, AP-011.

### FW-0009 — Signed receipt the respondent owns, online and on paper

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-009](JOURNEYS.md#j-009--the-receipt-is-an-object-i-own--and-i-can-prove-this-years-later) and [J-038](JOURNEYS.md#j-038--i-need-a-paper-version-the-offline-clerk-will-accept-on-its-face)
- **Done:** At submit, the respondent receives a downloadable receipt with a long-lived public link. The same receipt prints onto a single page that an offline clerk — landlord, court, registrar, DMV — accepts on first glance. Five years from now the link still works and the verifier validates the file.
- **Blocked on:** cryptographic substrate (trellis export ZIP via `trellis-export-writer`).
- **Anti-patterns:** AP-006.

### FW-0010 — Selective-proof viewer

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt--without-an-account-without-trusting-us)
- **Done:** The viewer renders a selective-disclosure proof — "this signer is 18 or older," "this household income exceeds the threshold" — without revealing the underlying facts.
- **Blocked on:** trellis Phase-3 BBS+ / ECDSA-SD selective-disclosure (deferred per `trellis-operational-companion.md` OC-31). Phase-2 commitment-slot-only mode is honest but limited.
- **Anti-patterns:** AP-023.

### FW-0011 — Branched form: "showing because…" and diff on revision

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-003](JOURNEYS.md#j-003--why-is-the-form-asking-me-this-now-oh--because-of-what-i-said-earlier)
- **Done:** When new questions appear because of an earlier answer, a one-line note tells the user why. When an earlier answer is revised and the form re-routes, the user sees what was cleared, what was kept, and what is new — never a silent change underfoot.
- **Blocked on:** queue EXT-4 (engine API `whyRelevant` introspection on `IFormEngine`).

### FW-0020 — Identity continuity within an issuer

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-013](JOURNEYS.md#j-013--dont-make-me-re-prove-who-i-am-every-time)
- **Done:** A respondent who proved their identity in session one does not re-prove it in sessions two and three. A step-up happens only when the next field genuinely needs a higher assurance level than the user already has.
- **Blocked on:** queue EXT-8 (form-side assurance annotation, verification pending). Uses FW-0063's `IdentityProvider` + existing `respondent-ledger-spec.md` §6.6 assurance taxonomy.
- **Anti-patterns:** AP-020, AP-022.

### FW-0021 — Field-level "why are you asking this?"

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-017](JOURNEYS.md#j-017--tell-me-why-youre-asking--for-every-sensitive-field-with-citation)
- **Done:** Every sensitive field carries a one-line, plain-English explanation: what the question is for, who sees the answer, how long it's kept, and — where the question is required by rule — a link to the rule.
- **Blocked on:** queue EXT-1 (item-metadata `purpose` block with `authorityRef` binding to References + PKAF authority chains) + EXT-5 (`disclosure.presented` ledger event for receipt audit).
- **Anti-patterns:** AP-009, AP-016.

### FW-0022 — Prefill with visible provenance

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-020](JOURNEYS.md#j-020--stop-pretending-you-dont-already-know-this--and-show-me-where-every-prefilled-value-came-from)
- **Done:** When the form prefills a value, the user sees where it came from and when. Multi-value prefill is previewed in one screen before any value applies; the user accepts or rejects each one. The receipt distinguishes agency-prefilled from user-attested.
- **Blocked on:** queue EXT-2 (Response metadata envelope: `provenance` block keyed by path).
- **Anti-patterns:** AP-001, AP-008, AP-018.

### FW-0023 — Form-version pin and structured diff on republish

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-022](JOURNEYS.md#j-022--the-form-changed-underneath-me-while-i-was-in-it--show-me-the-diff-or-leave-my-version-alone)
- **Done:** A draft is bound to the form version the user started on. If the issuer publishes a new version, the user sees a clear "what changed" page — fields added, fields removed, wording changed, validation changed. The user chooses to continue on the old version or migrate to the new one. The receipt records which version was submitted.
- **Blocked on:** mostly pure UI over existing `formspec/schemas/changelog.schema.json` (which already carries `changes[]` with `added`/`removed`/`modified`/`moved`/`renamed`, `semverImpact`, `migrationHint`). Post-MVP only because not in the MVP slice per web ADR-0005.
- **Anti-patterns:** AP-005.

### FW-0024 — Show the math: derivation on every calculated field

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-023](JOURNEYS.md#j-023--show-me-the-math--for-every-calculated-field)
- **Done:** Every calculated value — tax owed, premium, eligibility, support amount — has a "show the math" affordance that opens the actual derivation: these inputs, this rule, this version, this result. The derivation is part of the receipt, not just the screen.
- **Blocked on:** queue EXT-4 (engine API `getDerivationTree` on `IFormEngine`, caching the trace from `evalFELWithTrace`) + EXT-2 (Response metadata envelope: `derivations` block for receipt-binding).
- **Note:** The single most defensible respondent-facing thing FEL + Formspec can do that a free-text form-builder cannot.

### FW-0025 — Quiet voice for hardship and bereavement forms

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-025](JOURNEYS.md#j-025--dont-perform-cheerfulness-when-im-doing-the-hardest-paperwork-of-my-life)
- **Done:** When the form's context is hardship — an estate filing, a restraining order, a disability claim — the chrome adjusts: no welcome-back copy, no progress confetti, no "almost done," no emoji, no streaks. The context (estate of, emergency claim, protective order) is named once at the top and carried through to the receipt.
- **Blocked on:** queue EXT-6 (`definition.metadata.register` enum + `metadata.context`). Definition-tier, not Theme.
- **Anti-patterns:** AP-014.

### FW-0026 — Decline path with parity to the accept path

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-026](JOURNEYS.md#j-026--refusing-must-be-as-easy-as-accepting)
- **Done:** Saying no takes no more clicks and no more required fields than saying yes. Declining produces a receipt of the same fidelity as signing. Per-clause strike-with-reason creates a counter-offer the sender must affirmatively answer.
- **Blocked on:** queue EXT-5 (`response.declined` ledger event with `clauseReferences[]` + `reason`).
- **Anti-patterns:** AP-004.

### FW-0027 — Multi-rail payment with atomic submit

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-029](JOURNEYS.md#j-029--let-me-pay-the-way-i-actually-pay--and-through-any-channel-i-actually-use)
- **Done:** Payment offers ACH, card, prepaid, cash-via-retail-partner, and in-person — not card-only. The submit and the payment land or fail together; the user is never charged-but-unsubmitted or submitted-but-unpaid. The receipt names which rail was used.
- **Blocked on:** no upstream block — adopter-side `PaymentRail` port per web ADR-0004 (W3C Payment Request API + Stripe / Plaid / PayNearMe reference adapters). Post-MVP for scope.
- **Anti-patterns:** AP-013, AP-017.

### FW-0028 — Multi-IdP sign-in with no oversharing

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-032](JOURNEYS.md#j-032--sign-in-with-something-i-already-have-not-yet-another-password)
- **Done:** When more than one identity provider can satisfy the form's required assurance, the user picks from the issuer's configured list. The user can decline a provider that asks for more than the form actually needs (contact list, social graph) and pick a different one that still meets the bar.
- **Blocked on:** queue EXT-8 (form-side assurance annotation). FW-0063 ships the `IdentityProvider` port + conformance suite + ≥1 reference adapter; this row adds the multi-IdP picker UX + per-assurance filtering, regardless of which adapters the composition wires.
- **Anti-patterns:** AP-020.

### FW-0029 — Cross-agency referral warning at the moment it fires

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-028](JOURNEYS.md#j-028--warn-me-before-my-answer-triggers-a-referral-to-a-different-agency)
- **Done:** When an answer will, by law, generate a report or referral to another agency, the user sees that fact at the moment of the answer: who gets a copy, what that agency will do, what the user's options are. The consent for the referral is its own signed step.
- **Blocked on:** queue EXT-1 (item-metadata `consequences.externalActions[]` with `kind: "referral"`).
- **Anti-patterns:** AP-010.

### FW-0030 — Federated identity claim handoff

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-034](JOURNEYS.md#j-034--i-already-proved-who-i-am-to-logingov--idme--nhs--dont-make-me-do-it-again)
- **Done:** When the user's existing identity provider already meets the form's assurance level, the form trusts it and doesn't ask them to re-prove. If a step-up is needed, it's targeted to the missing factor only — not a fresh re-proof from zero. The receipt records the actual assurance achieved at signing.
- **Blocked on:** queue EXT-8 (form-side assurance annotation) + FW-0028.
- **Anti-patterns:** AP-020, AP-022.

### FW-0031 — Passkey-first sign-in and signature binding

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-035](JOURNEYS.md#j-035--sign-in-with-my-phones-biometric--and-let-the-same-gesture-cryptographically-sign-the-document)
- **Done:** When the device supports a passkey, the form offers it first — for sign-in and for signing. The fingerprint touch or face match becomes the cryptographic act, bound to the specific document being signed. SMS one-time codes are a fallback, never the default.
- **Blocked on:** queue SC-4 (Identity Binding Profile binding WebAuthn) + cryptographic substrate work.
- **Anti-patterns:** AP-002, AP-011, AP-021.

### FW-0032 — Pre-click trust: help the sender write a verifiable letter

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-036](JOURNEYS.md#j-036--is-this-link-even-for-me)
- **Done:** The platform gives senders the means to write notifications a recipient can verify before clicking — case reference visible in the email body, paper-letter QR resolving to a sender-attested confirmation page on the public verifier, sender domain matching the issuer's published list.
- **Blocked on:** queue SC-1 (Notification Template Sidecar) + cryptographic substrate (the verifier page itself).

### FW-0033 — File upload as a primary act

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
- **Done:** Capture from the phone camera with deskew, edge detection, and a legibility check. The user sees what the receiver will see *before* it sends. The user can redact fields that don't belong to this form. Each upload is labeled with which question it answers and why.
- **Blocked on:** no upstream block — primitives compose cleanly per stack-root ADR-0072 (formspec `attachment` field-type + `stack-common-object-store` + trellis attestation). Post-MVP for scope (substantial client-side capture/deskew/redaction UI). Possibly small optional Definition extension for `capture` hint.
- **Anti-patterns:** AP-001, AP-008, AP-013.

### FW-0034 — Honest-correction path on the receipt chain

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-044](JOURNEYS.md#j-044--i-made-an-honest-mistake--let-me-correct-without-being-treated-as-fraud)
- **Done:** When a user discovers they answered something honestly but wrong, they can correct it on a friendly path — not the adversarial dispute/retract path. The correction is itself signed, attaches evidence, links to the original on the same receipt chain.
- **Blocked on:** existing `response.correction-recorded` event in `respondent-ledger-spec.md` §8.2 + §11.4 covers the contract; build is gated on the signer binder family (post-MVP cryptographic work). Distinct from FW-0038 (adversarial dispute / retract).

### FW-0035 — Professional and pseudonymous signing modes

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Signer
- **Journey:** [J-031](JOURNEYS.md#j-031--sign-with-my-professional-license-not-my-personal-identity--and-let-me-sign-anonymously-when-the-law-allows)
- **Done:** A physician signs as a physician, with license, issuing authority, scope, and current status bound to the signature. Where the law permits anonymous-but-verified signing, the user signs with a verified pseudonym.
- **Blocked on:** queue SC-4 (Identity Binding Profile) + PKAF authority chain + cryptographic substrate. Anonymous mode interim is contractual escrow until Trellis Phase-3 selective-disclosure cryptography (BBS+ / ECDSA-SD per OC-31).

### FW-0036 — Humane bot protection: no puzzles as default

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-033](JOURNEYS.md#j-033--let-me-prove-im-a-person-without-making-me-prove-im-a-robot)
- **Done:** Bot protection is invisible to most humans. When the system genuinely can't tell, the user gets multiple accessible paths — audio, visual, passkey assertion, magic link, voice — and is never trapped on a single inaccessible challenge.
- **Blocked on:** no upstream block — adopter-side `BotProtection` port per web ADR-0004 (Cloudflare Turnstile / Apple Private Access Tokens reference adapters). Possibly EXT-5 (`bot-protection-cleared` ledger event) for audit.
- **Anti-patterns:** AP-019.

### FW-0037 — Filer-not-signer mode (preparer, family, professional, agent)

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-012](JOURNEYS.md#j-012--im-filing-this-for-someone-else--or-as-a-non-human-agent--and-the-receipt-must-say-so) (the human-capacity slice)
- **Done:** A toggle at the start says "I'm filling this for someone else." The user picks their capacity — power of attorney, guardian, executor, licensed professional, corporate officer — and attaches the document that proves it. The signature is recorded against the right party. The receipt names everyone: filer, signer, subject, capacity, authority document.
- **Blocked on:** queue EXT-3 (capacity + party-role on AuthoredSignature). Covers human capacity; AI-agent variant is FW-0058.
- **Anti-patterns:** AP-014.

### FW-0038 — Amend, withdraw, dispute on signed records

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-016](JOURNEYS.md#j-016--let-me-amend-if-i-made-a-mistake--or-withdraw-if-i-changed-my-mind)
- **Done:** Amending a submission is a recognized act on the same receipt chain — not a delete, not a silent overwrite. Withdrawals are first-class within the window the receiving agency permits. A signer can attach a dispute note to a record they signed, undeletable by the counterparty.
- **Blocked on:** queue EXT-5 (`response.withdrawn`, `response.dispute-attached`, `consent.revoked` events).

### FW-0039 — Post-submit status surface with realistic timing

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-021](JOURNEYS.md#j-021--i-hit-submit-where-is-it-now-and-what-do-i-owe-next)
- **Done:** After submit, the user has a real status page: received, queued, in review with which unit, decision drafted, issued — with timing drawn from actual recent throughput, not vendor estimates. Reachable without an account.
- **Consumes ports:** `StatusReader` (returns case-status shape conforming to the `work-spec/schemas/api/applicant.schema.json` contract), ratified by [web ADR-0010](thoughts/adr/0010-respondent-place-trust-model.md) when the FW-0039 consumer slice landed.
- **Progress (stub-backed DI slice 2026-05-23):** `StatusReader` is ratified as a WOS applicant API resource port with a stub adapter and conformance suite. `RespondentRuntime` reads WOS-shaped status feedback for submissions referenced by the Respondent Library sidecar and renders it in the respondent-place panel.
- **Deviations:** The current surface is an in-form status/history panel, not the standalone no-account status page with realistic throughput timing. The full production page remains blocked on a real applicant-API reference adapter.
- **Blocked on:** at least one production `StatusReader` reference adapter implementation. The intended formspec-stack adapter is `ProxiedApplicantStatusAdapter` (proxies through formspec-server to WOS — see [web ADR-0008](thoughts/adr/0008-reference-deployment-composition.md)), but it is not shipped yet; production composition fails closed with an unavailable sentinel until `workspec-server`'s applicant-API implementation and the formspec-server proxy land. Adopters running their own case-management backend wire a different adapter against the same `StatusReader` port.
- **Anti-patterns:** AP-006, AP-013.

### FW-0040 — Embed: form lives in the host's page

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-018](JOURNEYS.md#j-018--im-filling-this-out-on-a-site-i-came-to-for-something-else)
- **Done:** A nonprofit, clinic, or city department can put the form on their own page. The respondent never leaves the host's site, never sees "powered by" chrome, never gets bounced to an unfamiliar domain.
- **Blocked on:** uses existing `<formspec-render>` web component from `formspec/packages/formspec-webcomponent`. Post-MVP for scope.

### FW-0041 — Public-terminal hygiene

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-019](JOURNEYS.md#j-019--im-on-a-public-library-terminal-with-twenty-minutes-and-no-email)
- **Done:** A user on a library or shelter terminal can finish a form, receive a receipt by SMS or print a confirmation with a short verifier code, and sign out leaving no autofill memory and no session for the next user to inherit.
- **Blocked on:** no upstream block — pure UI hygiene + `NotificationDelivery` port for SMS. Post-MVP for scope.
- **Anti-patterns:** AP-001, AP-006, AP-017.

### FW-0042 — Share-draft-with-a-trusted-reviewer

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-014](JOURNEYS.md#j-014--let-me-share-this-draft-with-my-lawyer-mid-flight)
- **Done:** The user can send a link that lets a lawyer, accountant, advocate, or family member see the live draft, leave field-anchored comments, and suggest edits — without that reviewer making an account and without the user handing over their login. The reviewer cannot sign on the user's behalf.
- **Blocked on:** a new "review" sidecar spec (not yet in the queue — TBD); OR fold into Assist spec as a profile + extend Respondent Ledger actor enum with `"reviewer"`. Architectural call needed.

### FW-0043 — Abandon-and-erase with a deletion receipt

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-030](JOURNEYS.md#j-030--let-me-nope-out-without-leaving-a-trail)
- **Done:** A first-class "delete this draft and forget me" action. Deletion is real — not "anonymized analytics," not "preserved for your convenience." The user gets a signed deletion receipt with the same fidelity as a submission receipt.
- **Blocked on:** queue SC-2 (Deletion Receipt Sidecar) + EXT-5 (`data.erased` event).

### FW-0044 — Offline-capable form-fill with deferred submit

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-045](JOURNEYS.md#j-045--i-have-no-signal--let-me-finish-the-form-anyway-and-let-it-submit-itself-when-im-back-online)
- **Done:** A respondent can load the form once with a signal, then complete it entirely offline — every branch, every validation, every help text. Drafts save on the device. Submit queues and fires the moment connectivity returns, with no duplicates.
- **Blocked on:** existing `respondent-ledger-spec.md` §11.5 `offlineAuthoring` profile covers the chain semantics. Post-MVP build is browser-side (Workbox + IndexedDB + `idb` + idempotency via stack-common). **Not** `stack-common-outbox` — that's server-side Postgres, not the browser queue.
- **Anti-patterns:** AP-001, AP-013, AP-015.

### FW-0045 — Platform conversational mode (anti-Clippy)

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-011](JOURNEYS.md#j-011--talk-me-through-it-like-a-person-would)
- **Done:** A respondent who'd rather talk through the form than navigate a field grid can choose a conversational mode: one question at a time, in plain language, producing the same validated, branched, signed submission an expert user would have produced manually. The non-AI path has the same fields, the same fees, the same SLA — no penalty for declining.
- **Blocked on:** existing `formspec/specs/assist/assist-spec.md` covers the contract (Assist Provider role, Tool Catalog, WebMCP transport binding). Post-MVP for scope. Anti-Clippy constraints port verbatim. Distinct from FW-0051 (BYO assistant).
- **Anti-patterns:** AP-007.

### FW-0046 — Pre-flight routing: three questions, not four hundred

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-047](JOURNEYS.md#j-047--three-questions-instead-of-four-hundred--figure-out-which-form-i-actually-need)
- **Done:** A respondent who doesn't know which form applies answers a short, plain-language check — three to ten questions — and gets sent to the right one. The decision is shown to them: these questions, these answers, this reasoning.
- **Blocked on:** nothing upstream — `<FormspecScreener>` + `useScreener()` from `@formspec-org/react` (`packages/formspec-react/src/screener/`) ship the full consumer surface over `formspec/specs/screener/screener-spec.md` + `determination.schema.json`. Post-MVP for scope only; the work is "import + style" not "design + build."
- **Anti-patterns:** AP-006, AP-008, AP-022.

### FW-0047 — Respondent-side place: design investigation

- **Phase:** Post-MVP (design row)
- **Status:** done 2026-05-23 — see [web ADR-0010](thoughts/adr/0010-respondent-place-trust-model.md)
- **Persona:** Respondent / Platform
- **Journey:** [J-039](JOURNEYS.md#j-039--show-me-what-i-owe-whom-across-every-form-ive-ever-filled-out), [J-042](JOURNEYS.md#j-042--my-documents-are-in-my-library--i-share-them-with-each-form-on-my-terms), [J-043](JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
- **Done:** An ADR-grade design output that names how the platform would host a respondent-controlled view across all senders — what's coming (obligations), what I have (documents), what I've done (history). Trust model, data ownership, encryption-at-rest posture, export and deletion guarantees, who-can-read-what defaults.
- **Delivered:** Trust model, data-ownership boundary, encryption posture, status ownership, and DI-consumption rule in web ADR-0010. SC-3 now consumes this output in `formspec/specs/respondent-library/library-spec.md`; XS-2 token-bag ownership is wallet/client-side per ADR-0010.
- **Deviations:** This row was unblocked by resolving the SC-3/FW-0047 circular gate: ADR-0010 is the trust-model output first, then SC-3 sidecar authoring, then web DI consumption.
- **Anti-patterns:** AP-006, AP-024.

### FW-0048 — Coercion-aware signing: research and threat-model row

- **Phase:** Post-MVP (design row)
- **Status:** open
- **Persona:** Signer / Platform
- **Journey:** [J-027](JOURNEYS.md#j-027--when-im-being-coerced-give-me-a-back-channel-that-doesnt-tip-off-the-coercer)
- **Done:** A worked threat-model and design output for coercion-aware signing on the high-risk template set — financial powers of attorney, immigration sponsorship, benefits redirection, advance directives, marriage and divorce filings. Names the discreet duress affordance, the routing target, how activation stays invisible.
- **Blocked on:** queue EXT-5 (`submission.duress-signaled` ledger event with private-sidecar discipline per `trellis-operational-companion.md` §13 Disclosure Manifest) + legal-counsel involvement on evidentiary admissibility.
- **Anti-patterns:** AP-014, AP-021.
- **Note:** The hardest journey in the corpus. The cowardly move is to call it out of scope; the careless move is to ship it without a threat model.

### FW-0049 — Safe-address handling: research and design row

- **Phase:** Post-MVP (design row)
- **Status:** open
- **Persona:** Respondent / Signer / Platform
- **Journey:** [J-037](JOURNEYS.md#j-037--safe-address-handling-for-survivors-and-protected-parties)
- **Done:** Design output naming how protectable fields (home address, phone, employer) are substituted with state Address Confidentiality Program equivalents at the field, receipt, and verifier layer, while keeping the artifact cryptographically verifiable and structurally indistinguishable from a non-redacted one.
- **Blocked on:** queue EXT-1 (item-metadata `privacy` block: `protectable` + `class` enum) + cryptographic substrate (structurally-indistinguishable redaction is a Trellis envelope invariant — needs verification).
- **Anti-patterns:** AP-014.

### FW-0050 — Multi-party submission: research and design row

- **Phase:** Post-MVP (design row)
- **Status:** open
- **Persona:** Respondent / Signer / Platform
- **Journey:** [J-041](JOURNEYS.md#j-041--multi-party-forms-many-respondents-one-submission-load-bearing-for-joint-legal-tax-immigration-custody-and-financial-work)
- **Done:** Design output for joint-submission flows where each party authenticates independently, holds their own draft, sees only the parts the form's privacy model says they should see, signs their own attestations cryptographically separately.
- **Blocked on:** queue XS-1 (multi-party intake cross-stack ADR spanning formspec + WOS + trellis) + EXT-3 (capacity primitive).
- **Anti-patterns:** AP-002, AP-014.

### FW-0051 — Bring-your-own-assistant: structure exposure and consent model

- **Phase:** Post-MVP (design row)
- **Status:** open
- **Persona:** Respondent / Platform
- **Journey:** [J-046](JOURNEYS.md#j-046--let-me-use-the-assistant-i-already-use-not-whatever-this-form-ships)
- **Done:** Design output for letting the respondent's own assistant — whichever one they use — see the form's structure, propose values, and check answers, with every proposal landing as a visible suggestion the respondent must confirm.
- **Blocked on:** existing `formspec/specs/assist/assist-spec.md` covers most of the contract (WebMCP / MCP transport bindings). Possible small extension to assist-spec §6 (Profile Matching) for per-assistant consent / revocation if not already covered. Post-MVP for scope.
- **Anti-patterns:** AP-002, AP-007, AP-024.

### FW-0052 — Offline verifier as a downloadable static bundle

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt--without-an-account-without-trusting-us)
- **Done:** A static verifier — single ZIP, no network — that an auditor downloads, runs locally, and gets the same answers as the public one. Trust-load-bearing for "verify without us, ever, including if we cease to exist."
- **Blocked on:** cryptographic substrate (FW-0003 verifier first). Pulled forward if a government RFP requires offline verifiability.
- **Anti-patterns:** AP-023.

### FW-0053 — Embeddable respondent widget for third-party hosts (CSP-safe)

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-recovers-from-validation-and-never-loses-work) and [J-018](JOURNEYS.md#j-018--im-filling-this-out-on-a-site-i-came-to-for-something-else)
- **Done:** The respondent renderer can be embedded as an iframe or web component on a third-party site, with a CSP-safe handshake.
- **Blocked on:** FW-0040 ships first. CSP-safe iframe transport uses `penpal` / `comlink` for postMessage RPC.

### FW-0054 — Long-life receipt portal (no-account read access)

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent / Signer / Evaluator
- **Journey:** [J-009](JOURNEYS.md#j-009--the-receipt-is-an-object-i-own--and-i-can-prove-this-years-later)
- **Done:** A long-lived public surface where a receipt URL plus one possession factor (the original email, a printable code, a device-bound key) opens the bundle five years later without an account.
- **Blocked on:** cryptographic substrate (FW-0009 ships the receipt first).
- **Anti-patterns:** AP-006.

### FW-0055 — Respondent-side obligations stream

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-039](JOURNEYS.md#j-039--show-me-what-i-owe-whom-across-every-form-ive-ever-filled-out)
- **Done:** A cross-sender view the respondent owns: what's due, to whom, by when, across every issuer using the platform.
- **Progress (stub-backed DI slice 2026-05-23):** `RespondentPlaceSource` now exposes sidecar obligations through a stub/reference interface, adapter conformance, composition wiring, and the visible `RespondentRuntime` respondent-place panel.
- **Deviations:** This slice proves the DI seam and visible obligations stream with demo/stub data. Production cross-issuer fan-out and token-bag aggregation remain post-MVP adapter work.
- **Blocked on:** XS-2 implementation (client-side multi-tenant token bag per ADR-0068 D-1 + D-3), production respondent-place wallet/storage adapters, and issuer-specific authorization handles. SC-3 and FW-0047 are delivered; this row remains open for production fan-out.
- **Anti-patterns:** AP-006, AP-014.

### FW-0056 — Respondent-side document library with selective presentation

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-042](JOURNEYS.md#j-042--my-documents-are-in-my-library--i-share-them-with-each-form-on-my-terms)
- **Done:** The respondent's documents — passport, license, tax forms, medical records, professional credentials — live on their side and are recognized by what they are, not by what each form happens to call them. When a new form asks for one, the user chooses how much to share. Permissions are revocable per presentation.
- **Progress (stub-backed DI slice 2026-05-23):** `RespondentPlaceSource` renders saved document metadata from the Respondent Library sidecar in the respondent-place panel, with document-kind taxonomy guarded by conformance tests.
- **Deviations:** Selective-presentation ceremony, revocation controls, VC/OpenID4VP adapters, and real encrypted wallet storage are not implemented in this slice; the reference interface and stub make those integrations explicit.
- **Blocked on:** production selective-presentation adapters: encrypted wallet storage, W3C Verifiable Credentials Data Model 2.0, OpenID4VP (`@spruceid/didkit-wasm` / `@sphereon/oid4vc` candidate stack), revocation controls, and presentation ceremony UI. SC-3 and FW-0047 are delivered.
- **Anti-patterns:** AP-006, AP-024.

### FW-0057 — Respondent-side history across every issuer

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-043](JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
- **Done:** A searchable, filterable, exportable view of every draft, submission, and signed record the user has on the platform.
- **Progress (stub-backed DI slice 2026-05-23):** `RespondentRuntime` now renders prior submissions from `RespondentPlaceSource`, links each known submission to WOS applicant status through `StatusReader`, and test-covers the visible history/feedback path.
- **Deviations:** Search, filters, export, draft history, signed-record detail, and production persistence remain post-MVP. This slice implements the respondent-history interface and visible stub-backed submission feedback.
- **Blocked on:** production implementations of FW-0055 and FW-0056 plus search/filter/export, draft history, signed-record detail, and durable persistence. SC-3 and FW-0047 are delivered; this row remains open for the full cross-issuer history product surface.
- **Anti-patterns:** AP-006.

### FW-0058 — AI-agent filer chain (non-human capacity)

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Signer / Platform
- **Journey:** [J-012](JOURNEYS.md#j-012--im-filing-this-for-someone-else--or-as-a-non-human-agent--and-the-receipt-must-say-so) (the AI-agent slice)
- **Done:** A submission from an automated agent shows the full chain on the receipt: agent, operator, the accountable human, and the scope of the authority.
- **Blocked on:** queue EXT-3 `agentChain` extension + cryptographic substrate (receipt rendering). Split from FW-0037 to keep the human-capacity row shippable.
- **Anti-patterns:** AP-014, AP-024.

### FW-0059 — Coercion-aware signing build

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Signer
- **Journey:** [J-027](JOURNEYS.md#j-027--when-im-being-coerced-give-me-a-back-channel-that-doesnt-tip-off-the-coercer)
- **Done:** The duress affordance designed in FW-0048 lands on the high-risk template set. Activation is invisible to a shoulder-surfer, routes to issuer-defined victim services without halting the form, and is recorded in the platform's private audit trail but not in the public receipt.
- **Blocked on:** FW-0048 design + queue EXT-5 (`submission.duress-signaled` event) + private-sidecar discipline per `trellis-operational-companion.md` §13.
- **Anti-patterns:** AP-014, AP-021.

### FW-0060 — Safe-address handling build

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-037](JOURNEYS.md#j-037--safe-address-handling-for-survivors-and-protected-parties)
- **Done:** Protectable fields, ACP substitution, structurally-consistent redaction, and per-party visibility (per FW-0050) land across the form, the receipt, and the verifier. The presence of redaction is not itself a tell.
- **Blocked on:** FW-0049 design + queue EXT-1 (privacy block) + cryptographic substrate (structurally-indistinguishable redaction).
- **Anti-patterns:** AP-014.

### FW-0061 — Multi-party submission build

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-041](JOURNEYS.md#j-041--multi-party-forms-many-respondents-one-submission-load-bearing-for-joint-legal-tax-immigration-custody-and-financial-work)
- **Done:** Joint-submission flows per the FW-0050 design: per-party authentication, per-party drafts, per-party visibility, per-party signatures, deterministic merge, and a receipt that names every party.
- **Blocked on:** FW-0050 design + queue XS-1 (cross-stack ADR formspec + WOS + trellis).
- **Anti-patterns:** AP-002, AP-014.

### FW-0062 — Bring-your-own-assistant build

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-046](JOURNEYS.md#j-046--let-me-use-the-assistant-i-already-use-not-whatever-this-form-ships)
- **Done:** Form structure, validation rules, and contextual help are exposed in a stable, documented shape any third-party assistant can read. Proposals from the assistant land as suggestions the respondent confirms; nothing applies silently.
- **Blocked on:** FW-0051 design + existing assist-spec WebMCP binding.
- **Anti-patterns:** AP-002, AP-007, AP-024.

## Closed

*(none yet)*
