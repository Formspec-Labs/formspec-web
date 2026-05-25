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
| 3 | Respondent document library and selective presentation | FW-0056 (slice 1 live; slice 2 open) | Lets the respondent reuse evidence and choose what to share instead of re-uploading per form. Slice 1 ships the standalone `/documents` route + per-kind library + honest selection-action deferral. Slice 2 is the production VP ceremony — blocked on SC-4 + EXT-18 + ADR-0116 substrate. | Requires encrypted wallet/storage and selective-presentation policy. |
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

### FW-0064 — *(closed; see [## Closed](#closed) — cohort helper shipped, web-runtime draft-key extension entry deleted, `draftIdFor()` deleted, plan `thoughts/plans/2026-05-24-fw-0064-adapter-owned-draft-binding.md` complete)*

### FW-0065 — *(closed; see [## Closed](#closed) — scaffold shipped, plan `thoughts/plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md` complete; deferred-row triage produced FW-0066)*

### FW-0066 — *(closed; see [## Closed](#closed) — port promoted, four reference adapters shipped, conformance suite green, plan `thoughts/plans/2026-05-24-fw-0066-form-runtime-policy-extractor-port.md` complete)*

### FW-0067 — Cross-case throughput strip on the /status page

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-021](JOURNEYS.md#j-021--i-hit-submit-where-is-it-now-and-what-do-i-owe-next) (the "actual recent throughput" half)
- **Done:** The `/status?case={urn}` page (FW-0039 slice 1) shows a workflow-scoped throughput strip drawn from the EXT-29 projection — "Most decisions on this workflow have been issued within X days over the last 90 days (N cases)." When the projection is empty or below the minimum-sample threshold, the page continues to render the FW-0039 slice 1 "Timing for similar applications is not yet available" copy honestly. Strip text + threshold behavior is fixture-pinned so future copy edits trip the assertions.
- **Consumes ports:** likely a new `WorkflowThroughputReader` port (or an extension on `StatusReader`) — port-shape ratified per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md) when this row's consumer code lands.
- **Blocked on:** EXT-29 (WOS applicant API recent-throughput projection — see `thoughts/specs/2026-05-22-upstream-extension-queue.md`).
- **Anti-patterns:** AP-006, AP-013.

### FW-0068 — *(closed; see [## Closed](#closed) — route-aware composition narrowing shipped, plan `thoughts/plans/2026-05-23-fw-0068-route-aware-composition.md` complete)*

### FW-0069 — Obligations stream deferred capabilities (mute / batch / escalate / calendar export / notification-budget visibility / cross-issuer fan-out consumer slice)

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-039](JOURNEYS.md#j-039--show-me-what-i-owe-whom-across-every-form-ive-ever-filled-out) (the affordance half — slice 1 shipped the surface + sort + cross-sender header; this row covers the per-matter affordances and the multi-issuer fan-out consumer)
- **Done:** The `/obligations` dashboard (FW-0055 slice 1) gains per-matter mute / batch / escalate controls, calendar export (.ics), notification-budget visibility, sender-circumvention signals, and renders accurately when the wallet adapter aggregates obligations from multiple issuer endpoints. The slice-1 deferred-capability copy line — "Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site." — shrinks accordingly as each capability lands; when all are delivered, the copy is removed in the same commit.
- **Consumes ports:** likely a new `ObligationsPreferencesStore` port (mute / batch / escalate state) and the XS-2 token-bag adapter family for cross-issuer fan-out — port shapes ratified per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md) when this row's consumer code lands.
- **Blocked on:** XS-2 implementation (client-side multi-tenant token bag per stack-root ADR-0068 D-1 + D-3 — see `thoughts/specs/2026-05-22-upstream-extension-queue.md`) for the cross-issuer fan-out half; the affordance half (mute/batch/escalate, calendar export, notification-budget visibility) needs a per-issuer obligation-change event primitive (not yet filed — track here until the FW-0069 consumer slice scope is clear).
- **Anti-patterns:** AP-006, AP-014.

### FW-0073 — File upload slice 2: camera capture + deskew + edge detection + legibility check

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
- **Done:** The `FormspecWebAttachmentControl` (FW-0033 slice 1) gains an in-page camera-capture path — `getUserMedia`-backed live preview, automatic edge detection, corner-drag deskew, and a client-side legibility check (resolution / contrast / glare heuristic) that warns the respondent BEFORE submit. The receiver sees what the respondent saw. Reuses the existing `AttachmentStore` port unchanged — the captured `Blob` flows through the same `upload()` path as a file-picker pick. Honest deferred-capability copy shrinks accordingly when this lands; remove the words "Camera capture, edge detection, ..." from the fixture-pinned literal in the same commit.
- **Blocked on:** no upstream block — slice-1 deferral per FW-0033 design §"Non-goals." Substantial client-side capture / image-processing UI is the scope reason. Possibly small optional Definition extension for `capture` hint per the original FW-0033 row (`capture: 'environment' | 'user' | 'none'`).
- **Anti-patterns:** AP-001, AP-008, AP-013.

### FW-0074 — File upload slice 2: on-device redaction

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
- **Done:** The respondent can redact fields that don't belong to this form BEFORE the bytes leave the device — a draw-to-redact overlay on the captured / picked image, with the redacted bytes being the only payload that reaches `AttachmentStore.upload()`. Redacted regions are irrecoverable (not metadata-flagged; the underlying pixels are overwritten). Honest deferred-capability copy shrinks accordingly when this lands.
- **Blocked on:** no upstream block — slice-1 deferral per FW-0033 design §"Non-goals." Best landed after FW-0073 (the capture path is the natural redaction host); standalone for picked images too.
- **Anti-patterns:** AP-001, AP-008, AP-013.

### FW-0075 — File upload + document library compose: save attachment to library on upload

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work) + [J-042](JOURNEYS.md#j-042--i-own-my-own-documents-and-i-decide-what-to-share) (cross-row compose)
- **Done:** When an upload happens AND a document library is enabled on the instance (FW-0056 production wallet wired, not the slice-1 read-only library), the respondent can opt to save the uploaded attachment into their library at upload time — one checkbox on the upload row, labeled honestly ("Save a copy in your documents"). The saved entry carries the right `RespondentDocumentKind` (defaulting to `form-attachment`; the respondent can pick another). Reuses the wallet `presentationPolicies[]` shape from FW-0056. Cross-row trigger: only the compose lands here; the standalone library lives in FW-0056 and the standalone upload lives in FW-0033.
- **Blocked on:** FW-0056 slice 2 (production VP / wallet write path — blocked on SC-4 + EXT-18 + stack-root ADR-0116 substrate). The compose cannot ship while the library is read-only.
- **Anti-patterns:** AP-013, AP-014.

### FW-0076 — File upload: resumable / chunked uploads for large files

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
- **Done:** The `AttachmentStore` port gains a streaming / chunked variant (or a sibling port `ResumableAttachmentStore` per web ADR-0009 narrow-port discipline) so multi-MB attachments survive flaky networks and tab reloads. Slice 1 `upload(blob)` stays — large-file flow upgrades to the resumable shape when the adopter wires it. Progress indicator on the upload row reports byte-level progress (vs slice 1's binary in-flight/done). Reference adapters (S3 multipart, tus-protocol, browser-streams) land alongside the port shape per the adopter-shaped port pattern.
- **Blocked on:** no upstream block — slice-1 deferral. Port-shape ratification follows web ADR-0009 §"Not in the constitutional inventory" — ratified as its own ADR when this row's consumer code lands. Coordinates with the EXT-34 wire-format ratification (resumable refs may differ).
- **Anti-patterns:** AP-008.

### FW-0077 — Demo form attachment field (gated on refresh-surviving demo store)

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
- **Done:** The OSS reference demo composition's example form gains an `attachment` field so contributors / evaluators can exercise the upload path end-to-end without writing a fixture. Gated on a demo store that survives page refresh — slice 1's `stubAttachmentStore()` is in-memory only, so a demo form with an attachment field would mislead the moment the respondent reloaded. Either (a) the demo stub gains an IndexedDB / localStorage backing (small new adapter — keep the conformance contract intact), or (b) the demo composition wires a refresh-surviving reference adapter when one ships under FW-0073 / FW-0076. Field uses the existing `attachment` dataType through `FormspecWebAttachmentControl` — no new component work.
- **Blocked on:** no upstream block — slice-1 deferral per FW-0033 design §"Demo form posture." Either persistent demo store (small adapter) or alignment with a production reference adapter landing under sibling FW-0073 / FW-0076.
- **Anti-patterns:** AP-008.

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
- **Note:** [FW-0034 design 2026-05-24 §7.6](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md) specifies the lifecycle-composition rule: original receipt remains cryptographically valid AS OF its production time per Trellis immutability; corrections / withdrawals / disputes produce NEW receipts; the respondent holds both; verifiers see the correction-preservation report linking them. No FW-0009 substrate change required.

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
- **Note:** FW-0034 design 2026-05-24 §7.5 names the post-submit symmetric of this row — when a referred submission is corrected / withdrawn / disputed, the downstream agency MUST be notified. The notification mechanism is WOS governance + cross-agency referral substrate (not formspec-web); FW-0034 design names the seam, defers the build. The honest-disclosure copy at correction time ("This submission has been shared with [downstream agency]; your correction will be sent to them too") composes mechanically with this row's pre-submit warning shape.

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

### FW-0033 — *(closed as live (slice 1); see [## Closed](#closed) — slice 2 open as FW-0073..FW-0077; EXT-34 filed for `AttachmentRef` + `IntakeHandoff` wire-format ratification)*

### FW-0034 — Honest-correction path on the receipt chain

- **Phase:** Post-MVP
- **Status:** in design
- **Persona:** Respondent
- **Journey:** [J-044](JOURNEYS.md#j-044--i-made-an-honest-mistake--let-me-correct-without-being-treated-as-fraud)
- **Done:** When a user discovers they answered something honestly but wrong, they can correct it on a friendly path — not the adversarial dispute/retract path. The correction is itself signed, attaches evidence, links to the original on the same receipt chain.
- **Canonical shape:** [FW-0034 design 2026-05-24](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md) — three-act user-visible taxonomy (`correct` / `withdraw` / `dispute`) with §3.1 vocabulary firewall, §3.2 substrate-mapping predicate routing `correct` to Formspec [§11.4 `response.correction-recorded`](../formspec/specs/audit/respondent-ledger-spec.md) (narrow `correctableFieldSet[]`) or [§11.1 `response.amendment-opened`](../formspec/specs/audit/respondent-ledger-spec.md) cycle (substantive), §3.3 runtime UX extending FW-0039 `/status` route with a "What you can do" panel, §3.4 receipt-chain additive-timeline rendering, `recordLifecycle` per-act capability tier (`correctable` × `withdrawable` × `disputable`) under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md). §7 specifies the cross-row composition with FW-0048 (coercion at lifecycle-action submit; §7.2), FW-0049 (safe-* class inheritance on reason / values; §7.3), FW-0050 (per-party correction scoping; §7.4), FW-0029 (cross-agency referral notification seam; §7.5). §6 specifies the cross-stack dependency chain (EXT-5 + new EXT-35 form-policy block + new XS-5 cross-stack ADR spanning formspec + WOS + trellis).
- **Progress (2026-05-24):** Research brief at [`thoughts/sketches/2026-05-24-fw-0034-honest-correction-research-brief.md`](thoughts/sketches/2026-05-24-fw-0034-honest-correction-research-brief.md). Design proposal at [`thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md`](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md). Q1–Q5 framing decisions, `recordLifecycle` capability tier axes under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), the three-act-to-substrate mapping spanning Formspec [§11.4 + §11.1](../formspec/specs/audit/respondent-ledger-spec.md) + WOS [Kernel §13.9](../work-spec/specs/kernel/spec.md) 5-mode amendment taxonomy + WOS [`TerminateInstanceRequest`](../work-spec/specs/api/instance.md) + Trellis Phase 1 chain ([Core §10.1](../trellis/specs/trellis-core.md)) + ADR 0066 correction-preservation reporting, and the cross-stack dependency chain (EXT-5 per-party `partyRef` extension + new EXT-35 WOS `governance.recordLifecycle` form-policy block + new XS-5 cross-stack ADR confirming three-act mapping across formspec + WOS + trellis) are PROPOSAL-status pending owner review. FW-0048 composition (coercion at lifecycle-action submit per FW-0034 §7.2) reuses the existing FW-0048 mechanism — no new substrate. FW-0049 composition (safe-* on reason / values per §7.3) reuses the existing `accessControl.class` inheritance discipline. FW-0050 composition (per-party correction scoping per §7.4) extends EXT-5 with optional `partyRef`. FW-0029 composition (cross-agency referral notification per §7.5) names the seam; substrate lives in WOS governance. FW-0038 build consumes this design as canonical shape.
- **Blocked on:** FW-0034 design (delivered) + EXT-5 ratification (`response.withdrawn`, `response.dispute-attached`, `consent.revoked` event types) + new EXT-35 (WOS `governance.recordLifecycle` form-policy block per FW-0034 §6.3) + XS-5 cross-stack ADR (formspec + WOS + trellis per FW-0034 §6.4) + WOS `TerminateInstanceRequest` reference adapter (already specified at [`work-spec/specs/api/instance.md:131`](../work-spec/specs/api/instance.md); reference adapter ships post-MVP). Build is FW-0038. Distinct from FW-0043 (deletion / erase — destructive; FW-0034 is non-destructive lifecycle).

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
- **Canonical shape:** [FW-0034 design 2026-05-24](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md) — three-act user-visible taxonomy (`correct` / `withdraw` / `dispute`) per FW-0034 §3.1, substrate-mapping per §3.2 (correction-vs-amendment predicate via `correctableFieldSet[]`), runtime UX on the FW-0039 `/status` route per §3.3, additive-timeline receipt-chain rendering per §3.4, `recordLifecycle` per-act capability tier (`correctable` × `withdrawable` × `disputable`) per §3.5. §7.1 specifies the FW-0038 build constraints directly. §5 specifies the receipt-chain visualization rendering contract that FW-0038 conformance fixtures must satisfy.
- **Blocked on:** FW-0034 design (delivered) + queue EXT-5 (`response.withdrawn`, `response.dispute-attached`, `consent.revoked` events; with per-party `partyRef` extension per FW-0034 §6.2 for FW-0050 composition) + new EXT-35 (WOS `governance.recordLifecycle` form-policy block per FW-0034 §6.3) + XS-5 cross-stack ADR (formspec + WOS + trellis per FW-0034 §6.4) + WOS `TerminateInstanceRequest` reference adapter availability (already specified at [`work-spec/specs/api/instance.md:131`](../work-spec/specs/api/instance.md); reference adapter ships post-MVP) + FW-0059 build (FW-0048 duress mechanism covers lifecycle-action submit per FW-0034 §7.2) for high-risk-template lifecycle-action flows + FW-0060 build (FW-0049 safe-* mask composition per FW-0034 §7.3) for safe-*-class reason / value rendering + FW-0061 build (FW-0050 multi-party composition per FW-0034 §7.4) for per-party correction / withdrawal flows.

### FW-0039 — *(closed as live (slice 1); see [## Closed](#closed); follow-on FW-0067 for cross-case throughput)*

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
- **Status:** in design
- **Persona:** Signer / Platform
- **Journey:** [J-027](JOURNEYS.md#j-027--when-im-being-coerced-give-me-a-back-channel-that-doesnt-tip-off-the-coercer)
- **Done:** A worked threat-model and design output for coercion-aware signing on the high-risk template set — financial powers of attorney, immigration sponsorship, benefits redirection, advance directives, marriage and divorce filings. Names the discreet duress affordance, the routing target, how activation stays invisible.
- **Progress (2026-05-23):** Design proposal landed at [`thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md`](thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md). Q1–Q4 framing decisions, `duressAware` capability tier axes under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), per-party sidecar shape satisfying FW-0050 §7.2 delegation (FW-0061 build constraints specified), and the cross-stack dependency chain (EXT-5 payload extension + EXT-18 consumer + new EXT-30 issuer-sidecar `safetyTeamRecipients[]` + new XS-3 cross-stack ADR spanning formspec + WOS + trellis) are PROPOSAL-status pending owner review.
- **Progress (2026-05-24):** [FW-0034 design 2026-05-24 §7.2](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md) extends the FW-0048 mechanism over lifecycle-action submit ceremonies (correction-submit and withdrawal-submit) on the high-risk template set — same dual-credential mechanism, same `submission.duress-signaled` event, same safety-team routing; the FW-0059 build MUST cover lifecycle-action submits, not just original submission. No new substrate; XS-3 already covers the pipeline.
- **Blocked on:** queue EXT-5 payload-shape ratification + EXT-18 HPKE TS wrapper (queued for FW-0056; reused here) + new EXT-30 issuer-sidecar safety-team recipient registry + XS-3 cross-stack ADR + legal-counsel involvement on evidentiary admissibility (jurisdiction-specific; out of design scope).
- **Anti-patterns:** AP-014, AP-021.
- **Note:** The hardest journey in the corpus. The cowardly move is to call it out of scope; the careless move is to ship it without a threat model. Design is honestly scoped: optimized for the canonical DV-on-coercer's-device scenario; partial for trafficking; declines elder-coercion-by-misrepresentation (separate row).

### FW-0049 — Safe-address handling: research and design row

- **Phase:** Post-MVP (design row)
- **Status:** in design
- **Persona:** Respondent / Signer / Platform
- **Journey:** [J-037](JOURNEYS.md#j-037--safe-address-handling-for-survivors-and-protected-parties)
- **Done:** Design output naming how protectable fields (home address, phone, employer) are substituted with state Address Confidentiality Program equivalents at the field, receipt, and verifier layer, while keeping the artifact cryptographically verifiable and structurally indistinguishable from a non-redacted one.
- **Progress (2026-05-23):** Design proposal landed at [`thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md`](thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md). Q1–Q4 framing decisions (multi-class `safe-*` taxonomy / one `accessControl.class` schema property per stack-root ADR-0074 / masked-by-default per-act-reveal render discipline / Phase 2+ commitment-with-proof receipt path with Phase 1 fallback acknowledged as structurally-tell), the `safeAddress` capability tier axis (`verifier-grade | phase-1-fallback`) under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), the two-field substitute-vs-truthful authoring discipline, and the cross-stack dependency chain (EXT-1 scope reduction — `privacy` block retired in favor of `accessControl.class` + new EXT-31 Access-Class Registry entries for `safe-*` + new EXT-32 Privacy Profile default audience policy + new XS-4 cross-stack ADR spanning formspec + WOS + trellis) are PROPOSAL-status pending owner review. FW-0050 §7.1 multi-party composition is satisfied at §7. Research brief at [`thoughts/sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md`](thoughts/sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md).
- **Progress (2026-05-24):** [FW-0034 design 2026-05-24 §7.3](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md) composes the `accessControl.class` discipline over correction event payloads — `fieldValues[].originalValue` + `fieldValues[].correctedValue` inherit class per the existing [`formspec/specs/audit/respondent-ledger-spec.md:524 + 613`](../formspec/specs/audit/respondent-ledger-spec.md) discipline; correction `reason` text and dispute `statement` text carry their own `accessControl.class` declared in the form's `recordLifecycle` block; FW-0060 build (FW-0049's build) MUST consume the mask discipline in the receipt-chain visualization renderer (FW-0034 §5 conformance fixtures cover the composition).
- **Blocked on:** EXT-1 scope reduction (retire `privacy` block) + new EXT-31 (Access-Class Registry safe-* entries) + new EXT-32 (Privacy Profile default audience policy for safe-*) + XS-4 cross-stack ADR + Trellis Phase 2+ substrate availability for the verifier-grade receipt tier (Phase 1 fallback works without; insufficient for J-037 canonical scenarios) + ADR-0074 promotion from Proposed to Accepted.
- **Anti-patterns:** AP-014.
- **Note:** Honest scope: design declines the employer-correlation attack class (a survivor whose employer is known cannot fully protect address via substitution alone) and defers per-jurisdiction substitute-address registries to FW-0060 build + deployments. The hardest move was Phase boundary honesty — Phase 1 fallback is structurally-tell-leaking; only Phase 2+ commitment slots deliver J-037's "existence of redaction is itself not a tell" requirement.

### FW-0050 — Multi-party submission: research and design row

- **Phase:** Post-MVP (design row)
- **Status:** in design
- **Persona:** Respondent / Signer / Platform
- **Journey:** [J-041](JOURNEYS.md#j-041--multi-party-forms-many-respondents-one-submission-load-bearing-for-joint-legal-tax-immigration-custody-and-financial-work)
- **Done:** Design output for joint-submission flows where each party authenticates independently, holds their own draft, sees only the parts the form's privacy model says they should see, signs their own attestations cryptographically separately.
- **Progress (2026-05-23):** Design proposal landed at [`thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md`](thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md). Q1–Q4 framing decisions, the `multiParty` capability tier axis under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), and the cross-stack dependency chain (XS-1 → EXT-3 + EXT-N for `parties` block → FW-0061) are PROPOSAL-status pending owner review. FW-0048 design (per-party duress sidecar shape per §7.2) landed 2026-05-23 at [`thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md`](thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md) — FW-0061 build consumes the FW-0048 §7 per-party shape directly. **FW-0049 design (safe-address-class-taxonomy source per §7.1) landed 2026-05-23** at [`thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md`](thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md) — FW-0061 build consumes the FW-0049 §7 multi-party composition rule (resolver intersects safe-* audience policy with per-party `visibleTo[]`); build is FW-0060.
- **Progress (2026-05-24):** [FW-0034 design 2026-05-24 §7.4](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md) composes per-party correction scoping by extending EXT-5 (queued for FW-0038) with an optional `partyRef` field on `response.withdrawn` and `response.dispute-attached` events. Per-party scenarios per §7.4: (1) per-party-field correction visible only to parties whose `visibleTo[]` covers the changed fields; (2) shared-field correction requires all-party co-signature on the correction event; (3) per-party withdrawal defaults to `all-parties-must-agree` form-policy (safer default); (4) signer-only dispute scoped per signer. FW-0061 build consumes the per-party correction-flow rules from FW-0034 §7.4; conformance fixtures cover the four scenarios.
- **Blocked on:** queue XS-1 (multi-party intake cross-stack ADR spanning formspec + WOS + trellis) + EXT-3 (capacity primitive) + new EXT-N for Definition `parties` block. (FW-0048 + FW-0049 designs no longer block; build-time FW-0048→FW-0059 still must land before FW-0061 ships the per-party duress flow, and FW-0049→FW-0060 build still must land before FW-0061 ships the per-party safe-address visibility scoping.)
- **Anti-patterns:** AP-002, AP-014.

### FW-0051 — Bring-your-own-assistant: structure exposure and consent model

- **Phase:** Post-MVP (design row)
- **Status:** in design
- **Persona:** Respondent / Platform
- **Journey:** [J-046](JOURNEYS.md#j-046--let-me-use-the-assistant-i-already-use-not-whatever-this-form-ships)
- **Done:** Design output for letting the respondent's own assistant — whichever one they use — see the form's structure, propose values, and check answers, with every proposal landing as a visible suggestion the respondent must confirm.
- **Progress (2026-05-23):** Design proposal landed at [`thoughts/specs/2026-05-23-fw-0051-bring-your-own-assistant-design.md`](thoughts/specs/2026-05-23-fw-0051-bring-your-own-assistant-design.md). Consumer-side refactor of formspec-web's posture against the existing [Formspec Assist Specification v1.0.0-draft.1](../formspec/specs/assist/assist-spec.md) (the canonical structure-export contract). Q1–Q4 framing decisions (§3.1 three-tier `required|allowed|forbidden` form-policy + optional `allowedToolCategories[]` per-category restriction / §3.2 default-mask `FieldDescription.value` + per-field reveal as the unmask gate / §3.3 per-act per-session explicit revocable per-field reveal / §3.4 three-stage staged grant: structure-see → propose-values → per-field-value-reveal), proposed addition of `bringYourOwnAssistant` to [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md) Feature Ownership Table (currently NOT enumerated), Assist Provider runtime invariant tightening assist-spec §4.3 (5) SHOULD floor to MUST for the formspec-web Provider's per-act confirm gate, no new XS-N required for slice 1 (assist-spec covers substrate; nothing in Trellis envelope changes; WOS Assist Governance Proxy named as orthogonal composition seam at §7), and the cross-row composition with FW-0050 (per-party scoping on Assist tool catalog), FW-0049 (safe-* mask survives FW-0051 reveal), FW-0048 (high-coercion templates default `forbidden`), FW-0058 (vocabulary distinction: AI-as-respondent vs AI-as-helper-for-respondent), and EXT-2 (per-field assistant-suggested provenance for AP-007 Test rule) are PROPOSAL-status pending owner review. Research brief at [`thoughts/sketches/2026-05-23-fw-0051-bring-your-own-assistant-research-brief.md`](thoughts/sketches/2026-05-23-fw-0051-bring-your-own-assistant-research-brief.md).
- **Blocked on:** owner ratification + small web ADR-0011 amendment to enumerate `bringYourOwnAssistant` in the Feature Ownership Table + (OPTIONAL) EXT-33 assist-spec clarifications + coordination with FW-0033's append-only `RuntimeFeatureKey` extension order. **Distinguished from FW-0058 (AI-agent filer chain):** FW-0058 = AI fills the form (non-human capacity, `actorKind: agent`, `agentChain` on AuthoredSignature); FW-0051 = AI helps a human respondent fill (respondent is signer, capacity `self`, assistant runs in respondent's tools and is untrusted by the form). FW-0058 design landed 2026-05-24 at [`thoughts/specs/2026-05-24-fw-0058-ai-agent-filer-chain-design.md`](thoughts/specs/2026-05-24-fw-0058-ai-agent-filer-chain-design.md); §7.7 reciprocates the vocabulary distinction with the inverted framing. The two-row composition (FW-0058 agent using FW-0051 BYO-assistant during its own fill) remains deferred per FW-0051 §7.6 + FW-0058 §7.7.
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

### FW-0055 — *(closed as live (slice 1); see [## Closed](#closed); follow-on FW-0069 for deferred capabilities; XS-2 still blocks cross-issuer fan-out)*

### FW-0056 — *(closed as live (slice 1); see [## Closed](#closed); follow-on FW-0070 for the sibling-factory parameterization refactor; FW-0066 trigger fired for the FormRuntimePolicyExtractor port promotion; production selective-presentation ceremony still blocked on SC-4 + EXT-18 + stack-root ADR-0116 substrate)*

### FW-0057 — *(closed as live (slice 1); see [## Closed](#closed); follow-on FW-0078 for the post-XS-2 production cross-issuer adapter; follow-on FW-0079 for per-route identity gating (foot-gun blocked on FW-0078); follow-on FW-0080 for `consumes*` ladder consolidation into a `ReadonlySet<RuntimeFeatureKey>`; draft resume blocked on EXT-26 + EXT-27; signed-record detail is FW-0009 / FW-0010 territory; lifecycle actions on past records are FW-0034 territory)*

### FW-0058 — AI-agent filer chain (non-human capacity)

- **Phase:** Post-MVP
- **Status:** in design
- **Persona:** Signer / Platform
- **Journey:** [J-012](JOURNEYS.md#j-012--im-filing-this-for-someone-else--or-as-a-non-human-agent--and-the-receipt-must-say-so) (the AI-agent slice)
- **Done:** A submission from an automated agent shows the full chain on the receipt: agent, operator, the accountable human, and the scope of the authority.
- **Distinguished from FW-0051 (BYO-assistant) per FW-0051 design §7.6 (2026-05-23):** FW-0058 = **AI fills the form** in a non-human capacity (WOS `actorExtension` adds `ActorKind::Agent`; `AgentInvoker` port per WOS ADR-0064; `capacity: "ai-agent"` + `agentChain` block on `AuthoredSignature` per EXT-3; workflow provenance per WOS ai-integration.md §3.3.1 `capabilityInvocation`). FW-0051 = **AI helps a human respondent fill** (respondent is the signer, capacity `self`, assistant runs in respondent's tools and is untrusted by the form, no actor-extension change, no signature shape change; per-field provenance per EXT-2 `attestedBy: respondent, sourceRef: assistant-suggested`). The two can compose (an AI agent filer using a BYO-assistant during its own fill); composition deferred per FW-0051 §7.6.
- **Canonical shape:** [FW-0058 design 2026-05-24](thoughts/specs/2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — Q1-Q4 framing (three-tier `forbidden | allowed | required` form-policy / flat `AgentChainEntry[]` end-to-start authority order / form-side runtime trusts WOS workflow's actor declaration / GDPR Article 22 surfaceability implicit via `agentChain` presence), `aiAgentFiler` capability tier under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), `AgentChainEntry` 10-property schema (`agentId`, `agentClass`, `modelIdentifier?`, `modelVersion?`, `delegatedBy`, `delegatedAt`, `delegationScope`, `delegationArtifact?`, `capabilityInvocationRef?`, `confidenceRef?`) closing the EXT-3 deferral, verifier rendering contract (capacity-not-truth per AP-023), failure semantics (`agentSubmitterUnauthorized` via WOS Kernel §10.5; `MissingAgentChain`/`BrokenAgentChain`/`UngroundedAgentChain`/`InvalidDelegationArtifact`/`WosProvenanceUnavailable` at verifier; symmetric `humanSubmitterUnauthorized` proposed). §7 specifies cross-row composition with FW-0048 (prompt-injection as coercion vector; high-coercion templates default `forbidden`; §7.2), FW-0049 (safe-* mask survives agent read; §7.3), FW-0050 (agent as one party; `agentChain` + `partyRole` compose on same `AuthoredSignature`; §7.4), FW-0034 (agent-issued correction; §7.5), FW-0030 (federated agent identity via SC-4 + EXT-8a; §7.1), FW-0051 (vocabulary distinction reciprocated; §7.7). §6 specifies cross-stack dependency chain (EXT-3 closure + new XS-6 cross-stack ADR confirming formspec + WOS + trellis composition + SC-4 + EXT-8a + WOS reference adapter availability).
- **Progress (2026-05-24):** Research brief at [`thoughts/sketches/2026-05-24-fw-0058-ai-agent-filer-research-brief.md`](thoughts/sketches/2026-05-24-fw-0058-ai-agent-filer-research-brief.md). Design proposal at [`thoughts/specs/2026-05-24-fw-0058-ai-agent-filer-chain-design.md`](thoughts/specs/2026-05-24-fw-0058-ai-agent-filer-chain-design.md). Q1-Q4 framing decisions, `aiAgentFiler` capability tier under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), the `agentChain` 10-property `AgentChainEntry` schema closing the EXT-3 deferral, the WOS substrate composition (already fully specified — `ActorKind::Agent` per ADR-0064, `AgentInvoker` port, `capabilityInvocation` provenance per ai-integration.md §3.3.1, deontic constraints per §4, autonomy caps per §5, agent disclosure per §12 for rights-impacting workflows, Kernel §10.5 `agentSubmitterUnauthorized` submission gate), Trellis byte-neutral composition (no envelope change), PKAF `AILineage` distinct scope (assertion-side, downstream of FW-0058's filer-side substrate), and the cross-stack dependency chain (EXT-3 ratification + new XS-6 cross-stack ADR confirming formspec + WOS + trellis composition + SC-4 + EXT-8a agent-identity substrate already queued for FW-0030 + WOS reference adapter availability) are PROPOSAL-status pending owner review. FW-0048 composition (prompt-injection as coercion vector; agent duress signaling via FW-0048 substrate when `aiAgentFiler: allowed` + `duressAware: required`; high-coercion templates default `forbidden` per §7.2) reuses existing FW-0048 mechanism — no new substrate. FW-0049 composition (safe-* mask survives agent read per §7.3) reuses existing `accessControl.class` discipline. FW-0050 composition (agent as one party; `agentChain` + `partyRole` compose; per-party scoping per §7.4) reuses existing per-party-visibility primitive. FW-0034 composition (agent-issued correction rides `agentChain` naturally per §7.5) — no new substrate. FW-0030 composition (agent-identity via SC-4 + EXT-8a per §7.1) reuses existing identity-binding registry. FW-0051 vocabulary distinction reciprocated per §7.7. Future build row materializes when SC-4 + EXT-3 + XS-6 ratify + WOS reference adapter availability + agent-filing use case drives a deployment.
- **Blocked on:** FW-0058 design (delivered) + queue EXT-3 ratification with §3.2 `agentChain` shape + new XS-6 cross-stack ADR (formspec + WOS + trellis per FW-0058 §6.3) + SC-4 (presentation method registry agent extension) + EXT-8a (`IdentityClaim` alignment with `wos-events::IdentityAttestation` per ADR-0140) + WOS reference adapter availability (`wos-agent-stub` ships; production `wos-agent-{anthropic,claude-sdk,mcp,a2a,http}` are skeletons per WOS ADR-0064) + cryptographic substrate (receipt rendering). Split from FW-0037 to keep the human-capacity row shippable.
- **Anti-patterns:** AP-014, AP-024, AP-023.

### FW-0059 — Coercion-aware signing build

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Signer
- **Journey:** [J-027](JOURNEYS.md#j-027--when-im-being-coerced-give-me-a-back-channel-that-doesnt-tip-off-the-coercer)
- **Done:** The duress affordance designed in FW-0048 lands on the high-risk template set. Activation is invisible to a shoulder-surfer, routes to issuer-defined victim services without halting the form, and is recorded in the platform's private audit trail but not in the public receipt.
- **Canonical shape:** [FW-0048 design 2026-05-23](thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md) — dual-credential mechanism, byte-identical success-path, HPKE-wrapped payload via Trellis Core §6.4 `payload_ref` + §9.4 `key_bag` (Phase 1), safety-routing adapter (port shape deferred to FW-0059 build per FW-0048 §4.2) supporting issuer-webhook vs WOS-task tiers. §5.1 specifies the EXT-5 payload shape; §7 specifies the per-party composition with FW-0050.
- **Blocked on:** FW-0048 design (delivered) + queue EXT-5 payload-shape ratification (`submission.duress-signaled` event per FW-0048 §5.1) + EXT-18 (`@integrity-stack/hpke` TS wrapper; queued for FW-0056; reused here) + new EXT-30 (issuer-sidecar `safetyTeamRecipients[]` block per FW-0048 §6.4) + XS-3 cross-stack ADR (formspec + WOS + trellis per FW-0048 §6.5) + private-sidecar discipline per `trellis-operational-companion.md` §13.
- **Anti-patterns:** AP-014, AP-021.

### FW-0060 — Safe-address handling build

- **Phase:** Post-MVP (build)
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-037](JOURNEYS.md#j-037--safe-address-handling-for-survivors-and-protected-parties)
- **Done:** Protectable fields, ACP substitution, structurally-consistent redaction, and per-party visibility (per FW-0050) land across the form, the receipt, and the verifier. The presence of redaction is not itself a tell.
- **Canonical shape:** [FW-0049 design 2026-05-23](thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md) — multi-class `safe-*` taxonomy on `accessControl.class` (per stack-root ADR-0074), masked-by-default per-act-reveal render discipline (§3.3), two-field substitute-vs-truthful authoring (§3.4), Phase 2+ commitment-with-proof receipt path (Trellis Core §13 + OC-26/27/30) with Phase 1 fallback honestly disclosed as structurally-tell-leaking, `safeAddress` capability tier (`verifier-grade | phase-1-fallback`) per [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md), per-jurisdiction `SafeAddressDirectory` adapter (port shape deferred to FW-0060 build per FW-0049 §4.2). §7 specifies the multi-party composition with FW-0050 §7.1; §7.4 specifies the FW-0060 build constraints directly.
- **Blocked on:** FW-0049 design (delivered) + EXT-1 scope reduction (retire `privacy` block per FW-0049 §6.2) + queue EXT-31 (Access-Class Registry safe-* entries) + EXT-32 (Privacy Profile default audience for safe-*) + XS-4 cross-stack ADR (formspec + WOS + trellis) + Trellis Phase 2+ substrate (Core §13 commitment slots + OC-26/27/30) for the verifier-grade tier + stack-root ADR-0074 promotion + per-jurisdiction substitute-address validator deployments.
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
- **Canonical shape:** [FW-0051 design 2026-05-23](thoughts/specs/2026-05-23-fw-0051-bring-your-own-assistant-design.md) — consumer-side refactor of formspec-web's Assist Provider posture against the existing [Formspec Assist Specification v1.0.0-draft.1](../formspec/specs/assist/assist-spec.md), §3.1 three-tier form-policy (`required|allowed|forbidden`) + optional `allowedToolCategories[]` per-category restriction, §3.2 masked-by-default `FieldDescription.value` + §3.3 per-field reveal (mirrors FW-0049 §3.3), §3.4 three-stage staged grant (structure-see / propose-values / per-field-value-reveal), per-act confirm gate as MUST for the formspec-web Provider (tightens assist-spec §4.3 (5) SHOULD floor), `bringYourOwnAssistant` capability tier under [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md) (proposed addition; not yet enumerated), Assist transport adapters per assist-spec §7 (WebMCP / postMessage default; MCP / HTTP optional) + consent-affordance UI adapter + per-field reveal grant store (port shape deferred to FW-0062 build per FW-0051 §4.2). §7.1 specifies the FW-0050 multi-party composition (per-party scoping); §7.2 specifies the FW-0049 safe-* composition (safe-* mask survives FW-0051 reveal); §7.3 specifies the FW-0048 coercion composition (high-coercion templates default `forbidden`); §7.5 specifies EXT-2 provenance binding for AP-007 Test rule.
- **Blocked on:** FW-0051 design (delivered) + ADR-0011 amendment to enumerate `bringYourOwnAssistant` + coordination with FW-0033 append-only `RuntimeFeatureKey` extension + existing assist-spec WebMCP / postMessage transport bindings (already in spec — no upstream substrate work required) + EXT-2 (per-field assistant-suggested provenance for AP-007 Test rule).
- **Anti-patterns:** AP-002, AP-007, AP-024.

## Closed

### FW-0065 — Runtime feature resolver scaffold + policy gates

- **Phase:** Post-MVP
- **Status:** closed
- **Persona:** Platform
- **Journey:** (none — platform; backs every post-MVP feature row)
- **What:** Land the `RuntimeFeatureResolver`, typed configuration error classes, the `ResolvedRuntimeProfile` context, both adapter provenance markers (unavailable + demo-stub), the composition coherence assertion, the form-load error boundary that renders a plain-language unavailable page, and **the gating of the two seeded callsites (`respondentPlaceSource.readPlace`, `statusReader.readStatus`) on the resolved profile**. Seeded with `respondentPlace` and `status` capability keys; future feature ADRs extend the taxonomy.
- **Done:** (a) resolver + typed errors + fixture cases + form-load error gate compile and ship green via `npm run ci`; (b) every shipped composition passes `assertCompositionCoherence` (covering BOTH unavailable + demo-stub provenance, mode-aware) at construction; (c) `RespondentRuntime` catches `RuntimePolicyError` and renders the unavailable page with the typed code as the support reference (proved via fault-injection test); (d) locale-recompute discipline wired with tripwire test; (e) the two seeded callsites are gated — production composition with both disabled triggers ZERO adapter calls and renders no respondent-place panel, proved via `tests/app/runtime-feature-gating.test.tsx`; (f) `package.json` `test:unit` includes `src/policy`, `tests/policy-resolution`, and `tests/profiles` so the suite ships to CI; (g) adopter doc at `docs/policy/runtime-feature-resolution.md` covers the extension protocol.
- **User-visible behavior change:** today's demo composition is unchanged (both features enabled, panel renders). Today's production composition (both features `unavailable`) now correctly **hides** the respondent-place panel and never invokes the unavailable adapters — closing the production-bug Codex flagged where the unconditional `loadRespondentPlace` would throw.
- **Consumes ports:** none (pure resolver) — but extends the Composition surface every port consumer ultimately reads.
- **Closed:** scaffold shipped in [`thoughts/plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md`](thoughts/plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md) (see plan §Deviations for execution log + deferred-row triage). All 8 deferred rows triaged; one filed as FW-0066 (FormRuntimePolicyExtractor port promotion), seven closed wontfix with trigger-anchored rationale.
- **Note:** Closes the ADR-0011 Follow-on Work items (RuntimeFeatureResolver design/impl, typed errors, plain-language rendering, fixtures) AND closes Codex red-team findings on CI inclusion, seeded-callsite gating, and demo-stub provenance. Per ADR-0011 Non-goals, no canonical JSON schema for policy documents is defined here. Per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md) the resolver lives in `src/policy/` (pure core).

### FW-0066 — `FormRuntimePolicyExtractor` port promotion

- **Phase:** Post-MVP
- **Status:** closed
- **Persona:** Platform
- **Journey:** (none — platform; backs every feature row whose form-policy extractor carries non-trivial logic)
- **What:** Promote the closure-typed `Composition.getFormRuntimePolicy: (definition) => FormRuntimePolicy` slot to a named `FormRuntimePolicyExtractor` port (per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md)) with a conformance suite and four reference adapters (`EmptyFormRuntimePolicyExtractor`, `AttachmentRequirementExtractor`, `DemoFormPolicyExtractor`, `CompositeFormRuntimePolicyExtractor`). Closure-typed slot is GONE, not aliased (per project no-shims discipline); the inline promotion-trigger TODO in `src/composition/types.ts` is removed. Port-promotion trigger fired twice: pulse #1 = FW-0056 `documentPresentation` taxonomy extension (URL-keyed literal-switch); pulse #2 = FW-0033 `extractAttachmentRequirement` walker (first non-literal extractor).
- **Done:** (a) `src/ports/form-runtime-policy-extractor.ts` defines `FormRuntimePolicyExtractor.extract(definition): FormRuntimePolicy` with five conformance invariants (pure/idempotent, closed-set keys, closed-set modes, no-throw-on-empty, definition-only derivation); (b) `defineFormRuntimePolicyExtractorConformance` helper in the public adapter-conformance surface; (c) conformance test at `tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts` registers five adapter setups × five cases = 25 passing assertions; (d) four reference adapters at `src/adapters/composing/form-runtime-policy-extractor.ts` + `src/adapters/stub/form-runtime-policy-extractor.ts`; (e) `Composition.formRuntimePolicyExtractor: FormRuntimePolicyExtractor` replaces the closure slot in all four composition factories (default, stub, route-narrowing × 2); (f) sole consumer `RespondentRuntime.createReadyState` rewritten to `composition.formRuntimePolicyExtractor.extract(definition)`; (g) all 11 test files referencing the old closure slot rewritten to the extractor-instance shape; (h) `scripts/check-conformance-coverage.mjs` extended to recognize the new port + adapters (now reports 9 port suites, 20 adapter registrations); (i) `docs/policy/runtime-feature-resolution.md` + `docs/ports/attachment-store.md` + `tests/adapter-conformance/README.md` updated to describe the port + adopter extension protocol; (j) `npm run typecheck` + `npm run lint` + `npm run test:conformance` (91 tests, 9 suites) + `npm run test:unit` (461 tests) all green.
- **User-visible behavior change:** none. Pure refactor — the port shape is a 1:1 promotion of the existing closure, no resolver semantics change.
- **Consumes ports:** none (port surface itself; reference adapters wrap the existing `extract-form-policy.ts` walker).
- **Closed:** shipped in [`thoughts/plans/2026-05-24-fw-0066-form-runtime-policy-extractor-port.md`](thoughts/plans/2026-05-24-fw-0066-form-runtime-policy-extractor-port.md). Design [`thoughts/specs/2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md`](thoughts/specs/2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md). Six commits: design + plan, port + harness, four reference adapters, composition contract rewrite, docs + script, this close-out.
- **Note:** Closes the HIGH-1 finding from the FW-0065 / 2026-05-23 architecture review (closure-vs-port shape). [Web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md) §"Non-form surface synthesis" addendum's Option B (literal route synthesis at non-form-surface boundaries) holds verbatim — narrowed-route compositions wire `EmptyFormRuntimePolicyExtractor` into the slot so the type contract is satisfied, and `StatusRuntime` / `ObligationsRuntime` / `DocumentsRuntime` continue to synthesize their request literally without consuming the port. The rejected Option (b) per-key extractor + reducer shape is reserved as a future refinement; today's `CompositeFormRuntimePolicyExtractor` is the substrate primitive feature-ADR authors append into when their key needs a definition-introspective extractor.

### FW-0064 — Adapter-owned draft binding registry

- **Phase:** Post-MVP
- **Status:** closed
- **Persona:** Platform
- **Journey:** (none — platform)
- **What:** `createHttpAdapterCohort(config)` is the new construction path for the formspec-stack reference HTTP data ports — it returns `{ draftStore, submitTransport }` with the draft-id binding shared through a private `DraftBindingRegistry` captured in the cohort closure. Replaces the M8 adapter-boundary coupling where `HttpSubmitTransport` reached back into `HttpDraftStore` via a public `draftIdFor()` method to resolve a web-runtime sentinel key that the composition root had smuggled through `IntakeHandoff.extensions['x-formspec-draft-key']`. Submit-side `DraftKey` lookup now derives from `handoff.definitionRef + handoff.subjectRef` — fields `buildIntakeHandoff` already populates from the save-side draft key, making the derivation the structural inverse of the construction. Port contracts (`DraftStore`, `SubmitTransport`) are unchanged; the cleanup is entirely inside the formspec-stack reference adapter composition (web ADR-0008).
- **Done:** (a) `src/adapters/http/cohort.ts` ships with `createHttpAdapterCohort` + `draftKeyFromHandoff` + the `DraftBindingRegistry` interface re-export; (b) `src/adapters/http/draft-binding-registry.ts` ships the registry implementation as a shared internal module; (c) `HttpDraftStore.draftIdFor()` deleted (no shim; per project no-shims discipline) and the store's constructor accepts an optional `bindingRegistry` so the standalone path (conformance suite) keeps working; (d) `IntakeHandoff.extensions['x-formspec-draft-key']` deleted at the producer (`buildIntakeHandoff` in `respondent-flow.ts`); other extension keys (`x-formspec-response-data`, `x-formspec-response`, `x-formspec-validation-report`, `x-formspec-magic-link-url`) preserved — they serve unrelated needs; (e) `draftIdFromHandoff` / `draftKeyFromHandoff` / `isRecord` helpers + the dead `x-formspec-draft-id` read path in `src/composition/default.ts` deleted; the composition body calls `createHttpAdapterCohort` once and spreads the result; (f) `tests/adapters/http/cohort.test.ts` adds 7 new cases (shared binding, derivation contract, fail-fast on missing binding, anonymous session token routing, per-cohort isolation, no-extensions path, idempotency replay); `tests/adapters/http/draft-store.test.ts` drops `draftIdFor` assertions (the load round-trip covers the binding implicitly); `tests/app/respondent-flow.test.ts` adds a regression guard asserting the extension key is absent; `tests/app/status-boot-narrowing.test.ts` drops the vestigial `draftIdFor: () => undefined` from the HTTP draft-store mock; (g) `docs/adapters/draft-store.md` + `docs/adapters/submit-transport.md` describe the cohort pairing and note the standalone constructor path stays viable for adopters; (h) `npm run ci` green at the time of commit — conformance suite (96 tests, 9 suites), full unit suite (468 tests, 58 files), e2e suite (9 tests), bundle / compose / deployment / multi-deployment checks all pass.
- **User-visible behavior change:** none. Pure internal refactor.
- **Consumes ports:** none (composition-helper refactor; `DraftStore` and `SubmitTransport` port shapes unchanged per FW-0064 row-body invariant).
- **Closed:** shipped in [`thoughts/plans/2026-05-24-fw-0064-adapter-owned-draft-binding.md`](thoughts/plans/2026-05-24-fw-0064-adapter-owned-draft-binding.md). Design [`thoughts/specs/2026-05-24-fw-0064-adapter-owned-draft-binding-design.md`](thoughts/specs/2026-05-24-fw-0064-adapter-owned-draft-binding-design.md). Four commits in formspec-web: design + plan, cohort + composition + handoff + tests, docs, this close-out. Stack-root: one pointer-bump commit (per submodule discipline).
- **Note:** Open since M8 closeout. The original milestone note called it "localStorage prefix coupling"; the landed M8 implementation used in-memory binding rather than localStorage, but the cleanup target was always the adapter-boundary coupling between draft persistence and submit. Path (b) (composition helper) chosen over path (a) (DI'd registry object) for three reasons documented in the design: one construction call instead of three, information hiding (the registry stays an implementation detail of the cohort), no DI-ceremony asymmetry between the two adapters. The cohort module sits next to the existing factory-function naming pattern (`stubAttachmentStore()`, `unavailableRespondentPlaceSource()`, `createAnonymousSessionBridge()`). Reviewer is independent per the review-loop discipline.

### FW-0068 — Route-aware composition narrowing (status-only composition)

- **Phase:** Post-MVP
- **Status:** closed
- **Persona:** Platform
- **Journey:** (none — platform; backs FW-0039 + every future post-MVP non-form surface)
- **What:** A sibling factory family — `createDefaultStatusRouteComposition` + `createStubStatusRouteComposition` + `createDemoStatusRouteComposition` — returns a Composition with the production `statusReader` + runtime-profile / policy slots wired and every non-status MVP port filled by a new `noop-for-narrowed-route/` adapter family that throws on call with the FW-0068 cite. `src/app/main.tsx` parses the URL via the existing pure `parseStatusRoute` and dispatches via a small `chooseComposition({ href, config })` helper in `src/app/main-helpers.ts`. When the URL matches `/status?case=urn:wos:...`, no HTTP / OIDC / anonymous-session constructor fires at boot.
- **Done:** (a) `createDefaultStatusRouteComposition` + stub + demo siblings ship and funnel through `freezeComposition`; (b) `noop-for-narrowed-route/` adapter family covers the four MVP ports (`DefinitionSource`, `DraftStore`, `SubmitTransport`, `IdentityProvider`) with fail-fast throws; (c) `tests/app/status-boot-narrowing.test.ts` interposes the HTTP adapter constructors via `vi.mock` and asserts the status-route factory does NOT invoke them in production mode — and the full-app factory DOES (differential proof the test is not a tautology); (d) `tests/profiles/composition-coherence.test.ts` extended to cover all three new factories; (e) `tests/smoke/composition.test.ts` extended; (f) `npm run ci`-gated checks (typecheck, lint, testing-plan, mvp-audit, upstream-blockers, release-docs, conformance-coverage) green; conformance suite green; full unit suite green (297 tests).
- **User-visible behavior change:** none directly. Indirect — the `/status` route boot no longer pays for HTTP / OIDC / anonymous-session machinery the surface never reads, and the FW-0039 §Accountless-access "page renders without an `IdentityProvider` session" claim is now honest at every layer, not just the consumer layer.
- **Consumes ports:** none (refactor of `src/app/main.tsx`, `src/composition/`, and new `src/adapters/noop-for-narrowed-route/`).
- **Closed:** shipped in [`thoughts/plans/2026-05-23-fw-0068-route-aware-composition.md`](thoughts/plans/2026-05-23-fw-0068-route-aware-composition.md). Design [`thoughts/specs/2026-05-23-fw-0068-route-aware-composition-narrowing-design.md`](thoughts/specs/2026-05-23-fw-0068-route-aware-composition-narrowing-design.md). Design incorporates inline architecture-review reshapes (Findings 1, 2, 3, 5 from `formspec-specs:semi-formal-architecture-review`): demo status-route keeps `respondentPlace: 'demo-stub'` rather than narrowing to `unavailable` (no ADR-0011 framing drift); constructor-laziness alternative engaged and rejected with stated reasons; verifier / selective-proof viewer named as future siblings of the pattern; boot-to-mount parser stability pinned.
- **Note:** Closes FW-0039 closeout independent architecture review H-1. The sibling-factory shape is good at N=2 surfaces; when the third non-form surface (verifier or selective-proof viewer) lands, that's the trigger to reconsider whether one composition with route-aware slot resolution subsumes the family (design §"Sibling future consumers"). Per the inline arch-review, this row does NOT introduce per-surface `instanceCapabilities` narrowing — that's a new framing reserved for the trigger where a non-form surface needs it.

### FW-0039 — Post-submit status surface (slice 1) — standalone /status route + accountless URN access

- **Phase:** Post-MVP
- **Status:** live (slice 1; cross-case throughput deferred to FW-0067 + EXT-29)
- **Persona:** Respondent
- **Journey:** [J-021](JOURNEYS.md#j-021--i-hit-submit-where-is-it-now-and-what-do-i-owe-next)
- **What slice 1 landed:** Standalone `/status?case={WosResourceUrn}` route reachable without an account. `StatusRuntime` renders the WOS applicant API `ApplicantCaseDetail` timeline + open tasks + AI-involvement disclosure + per-case timing strip with **prominent** "Timing for similar applications is not yet available on this site." framing (literal copy fixture-pinned). Confirmation panel hands the respondent a "Track this application" link when the submit transport returns a `caseUrn`. Vocabulary firewall preserved — every WOS enum routes through `labelFromToken`, no case URN ever appears in body copy. Identity boot bypassed at runtime on the `/status` route — `StatusRuntime` does NOT USE non-status ports (no `IdentityProvider.authenticate`/`discover` call, no draft store call, no submit transport call, no formspec-engine init), proved by `tests/app/status-runtime.test.tsx#identity discipline`. Boot-time composition narrowing now matches the consumer-level claim: `main.tsx` parses the route before constructing the composition and dispatches to `createDefaultStatusRouteComposition`, so no HTTP / OIDC / anonymous-session constructor fires on the `/status` surface. Proved by `tests/app/status-boot-narrowing.test.ts` — closed by **FW-0068** from the FW-0039 closeout independent architecture review (H-1). Per-route runtime-feature gate reuses the `status` key (no new key, no taxonomy extension); `StatusRuntime` synthesizes `form: { features: { status: 'optional' } }` at the route boundary — stays OPTIONAL, never required (per [web ADR-0011](thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md) §Failure Semantics + §"Non-form surface synthesis" addendum + FW-0039 arch-review F-4). Plain "Status not shared" copy renders for every disabled-cause branch (`org-forbidden`, `form-forbidden`, `optional-no-instance`) per FW-0065's M-3 plumbing extended to a non-form surface. Stage-mapping respects WOS lifecycle semantics — `lifecycle-changed → completed/terminated` correctly lights the `Closed` cell (code-review F-4); `suspended` and `migrating` lifecycle states map to dedicated "Paused" and "Updating" stage labels rather than falling to the default `in-review` (independent arch-review N-2).
- **Done (slice 1):** `tests/app/status-runtime.test.tsx` (17 cases including literal copy pins + stage-mapping correctness + identity discipline + policy-error path + adapter-error path); `tests/app/app-routing.test.tsx` (2 cases); `tests/app/status-route.test.ts` (6 cases including F-1 bare-prefix guard); `tests/app/confirmation-panel.test.tsx` (4 cases); `tests/adapters/stub-submit-transport.test.ts` (3 cases pinning the new `caseUrn` field); `src/app/format.test.ts` (8 cases); extended `tests/e2e/placeholder-a11y.spec.ts` (submit→click-through + direct-status route, both axe-clean); `docs/ports/status-reader.md` (URN-as-bearer-token semantics, disabled-status short-circuit, throughput deferral); `docs/policy/runtime-feature-resolution.md` (`/status` worked example with instance×org verdict table). `npm run ci` green. EXT-29 filed in `thoughts/specs/2026-05-22-upstream-extension-queue.md` as the load-bearing upstream dependency for the throughput half.
- **User-visible behavior change:** post-submit confirmation now offers a bookmarkable "Track this application" link instead of dead-ending at a reference number. Reopening that link in any browser, without signing in, shows the live application status page with the five-stage strip, per-case timing, what-you-owe-next ribbon, and (when present) AI-involvement disclosure.
- **Consumes ports:** `StatusReader` (existing, no extension). `SubmitTransport.SubmitConfirmation` gained an optional `caseUrn?: WosResourceUrn` field — HTTP transport untouched per arch-review F-7.
- **Plan:** [`thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md`](thoughts/plans/2026-05-23-fw-0039-post-submit-status-surface.md).
- **Design:** [`thoughts/specs/2026-05-23-fw-0039-post-submit-status-surface-design.md`](thoughts/specs/2026-05-23-fw-0039-post-submit-status-surface-design.md).
- **Release gaps named:** (a) cross-case recent-throughput projection — see FW-0067 + EXT-29; without it the timing strip honestly shows only per-case data and the "not yet available" framing. (b) Production `ProxiedApplicantStatusAdapter` — the same one FW-0039's original `Blocked on:` named; until it ships, the production composition wires `unavailableStatusReader` and the `/status` route honestly renders "Status not shared. This site does not provide application status." (c) URN-as-possession-factor model — adapter-side rate limiting + uniform not-found copy are load-bearing for the slice's accountless-access honesty contract (documented in `docs/ports/status-reader.md`); URN expiry / magic-link rotation / browser-bound proof remain FW-0054's job.
- **Note:** Closes web ADR-0011 §Failure Semantics for an OPTIONAL non-form surface — the design + resolver permit it cleanly without forcing a `required` form-policy synthesis (arch-review F-4). Consumes web ADR-0010 §DI shape `StatusReader` port without extension. The route-as-request `optional` synthesis is the worked example pattern for any future post-MVP surface that consumes a feature key as OPTIONAL.
- **Forward composition (2026-05-24):** [FW-0034 design 2026-05-24 §3.3](thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md) chooses this route as the surface for the post-submit lifecycle actions ("Correct a fact" / "Withdraw this submission" / "Add a dispute note") — a "What you can do" panel renders on this route when the resolved runtime profile's `recordLifecycle` block enables the act. Per-route synthesis pattern extends to `recordLifecycle: 'optional'` mirroring the `status: 'optional'` synthesis already used; FW-0038 build wires the panel.

### FW-0055 — Respondent-side obligations stream (slice 1) — standalone /obligations route + cross-sender framing + honest deferral copy

- **Phase:** Post-MVP
- **Status:** live (slice 1; deferred capabilities — mute / batch / escalate / calendar export / notification-budget visibility / cross-issuer fan-out consumer — tracked at FW-0069; XS-2 still blocks production cross-issuer fan-out)
- **Persona:** Respondent
- **Journey:** [J-039](JOURNEYS.md#j-039--show-me-what-i-owe-whom-across-every-form-ive-ever-filled-out)
- **What slice 1 landed:** Standalone `/obligations` route — identity-bound (the surface IS the respondent's own list per J-039 "owned by the respondent"; no URN-keyed accountless variant per design §"Why identity-required"). `ObligationsRuntime` calls `composition.respondentPlaceSource.readPlace({ subjectRef })` and renders the snapshot's `obligations[]` as a sorted, sender-grouped dashboard: "Due now" (states `due` / `overdue`), "Upcoming" (`upcoming` / `unknown`), "Done" (`submitted` / `satisfied` / `closed`). Sort contract within section: `dueAt` ascending, undefined last, ties broken by sender name then title — fixture-pinned. Cross-sender header derived honestly from the snapshot: "N obligation(s) across M sender(s)" with correct singular/plural — lights the J-039 cross-sender promise the in-form respondent-place panel buries. Honest deferred-capability copy fixture-pinned: "Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site." Empty-state copy distinct from disabled-by-policy: "You have no obligations from senders using this site." Disabled-cause copy: `optional-no-instance` → "Obligations are not shared. This site does not provide an obligations view."; `org-forbidden` → "Obligations are not shared. This sender does not share an obligations view here." Per-route runtime-feature gate reuses the `respondentPlace` key (no new key, no taxonomy extension); `ObligationsRuntime` synthesizes `form: { features: { respondentPlace: 'optional' } }` at the route boundary mirroring FW-0039's status-route synthesis pattern (web ADR-0011 §"Non-form surface synthesis" addendum). Consumer discipline proved by `tests/app/obligations-runtime.test.tsx` — does NOT call `StatusReader.readStatus`, `DraftStore.load/save`, `SubmitTransport.submit`, or `DefinitionSource.getDefinition`. Cross-route status link resolution: when an obligation's `submissionRef` resolves to a snapshot submission carrying `applicantStatus.resourceRef`, the obligation renders a "Track this application" hyperlink to `/status?case={urn}` (encoded); unresolvable refs suppress the link (never fabricate a URN). Vocabulary firewall: forbidden DOM substrings (`respondent-place`, `library`, `sidecar`, `snapshot`, `subjectRef`, `aggregationMode`) test-pinned. Boot-time composition narrowing matches the consumer-level claim: `chooseComposition` parses the obligations route before construction and dispatches to `createDefaultObligationsRouteComposition` — `definitionSource` / `draftStore` / `submitTransport` are noop on this route; `identityProvider` is real (identity-required surface); `respondentPlaceSource` + `statusReader` carry their normal demo/unavailable wiring. The in-form `RespondentPlacePanel.ObligationItem` extracts to `src/app/obligations-view.tsx` so both surfaces share one render contract — no parallel implementation can drift.
- **Done (slice 1):** `tests/app/obligations-runtime.test.tsx` (19 cases including literal copy pins, sort + section grouping, cross-sender header singular/plural, consumer-discipline assertions, vocabulary firewall, identity boot, adapter-error path); `tests/app/obligations-route.test.ts` (5 cases); `tests/app/obligations-view.test.tsx` (5 cases including sort contract + section taxonomy); `tests/app/app-routing.test.tsx` (extended with `/obligations` case); `tests/app/status-boot-narrowing.test.ts` (extended with `chooseComposition picks the obligations-route factory` differential coverage); `tests/smoke/composition.test.ts` (4 new FW-0055 factory tests). `npm run typecheck` + `npm run lint` + full vitest (370 passes) green. FW-0069 filed in this PLANNING.md as the deferred-capability follow-on row.
- **User-visible behavior change:** the respondent can now visit `/obligations` directly and see every obligation they owe across senders, with overdue/due-now items surfaced first, an honest count of obligations and senders in the header, and a plain-language line naming the capabilities not yet shipped. The in-form respondent-place panel keeps its existing obligations column — the dashboard is additional, not a replacement.
- **Consumes ports:** `RespondentPlaceSource` (existing, no extension — Respondent Library sidecar `obligations[]` field per web ADR-0010 / SC-3), `IdentityProvider` (existing, no extension — identity boot reuses the same `signInOptionsForIdentityPolicy` machinery `RespondentRuntime` uses).
- **Plan:** [`thoughts/plans/2026-05-23-fw-0055-respondent-obligations-stream.md`](thoughts/plans/2026-05-23-fw-0055-respondent-obligations-stream.md).
- **Design:** [`thoughts/specs/2026-05-23-fw-0055-respondent-obligations-stream-design.md`](thoughts/specs/2026-05-23-fw-0055-respondent-obligations-stream-design.md).
- **Release gaps named:** (a) Cross-issuer fan-out implementation — XS-2 (client-side multi-tenant token bag per stack-root ADR-0068 D-1 + D-3) is filed in `thoughts/specs/2026-05-22-upstream-extension-queue.md`; until it lands, the page accurately renders whatever the single-snapshot wallet adapter aggregates. (b) Mute / batch / escalate per matter, calendar export (.ics), notification-budget visibility, sender-circumvention signals, push notifications for obligation due-date / state changes — all named verbatim in the deferred-capability copy and tracked at FW-0069. (c) Production wallet/storage adapters (encrypted client storage with passkey-derived HPKE per web ADR-0010) — the production composition wires `unavailableRespondentPlaceSource` and the `/obligations` route honestly renders "Obligations are not shared. This site does not provide an obligations view." (d) URN-keyed accountless variant — explicitly NOT shipped per design §"Why identity-required, not URN-keyed"; the obligations list is identity-bound by J-039 framing.
- **Note:** Closes web ADR-0011 §Failure Semantics for a second OPTIONAL non-form surface, validating the route-as-request synthesis pattern FW-0039 established. Consumes web ADR-0010 §DI shape `RespondentPlaceSource` port without extension. Stays inside the closed `RuntimeFeatureKey` taxonomy by reusing `respondentPlace` (ADR-0011 §"Feature Ownership Table" already lists "Obligations stream" as a respondent-place consumer). Coordinates with FW-0068's route-aware composition family by adding the `createDefaultObligationsRouteComposition` + `createStubObligationsRouteComposition` + `createDemoObligationsRouteComposition` factories — the obligations route's identity-bound nature means `identityProvider` is REAL (not noop) on that surface, distinguishing it from the status route's noop-identity pattern.

### FW-0056 — Respondent document library + selective presentation (slice 1) — standalone /documents route + per-kind library + honest selection-action deferral

- **Phase:** Post-MVP
- **Status:** live (slice 1; production VP ceremony — SC-4 + EXT-18 + stack-root ADR-0116 substrate — and slice-2 capabilities — actual selective-presentation cryptography, per-presentation revocation, derived-claim disclosure, retention horizons, export ceremony, upload/save-to-library — still open)
- **Persona:** Respondent
- **Journey:** [J-042](JOURNEYS.md#j-042--my-documents-are-in-my-library--i-share-them-with-each-form-on-my-terms)
- **What slice 1 landed:** Standalone `/documents` route — identity-bound (J-042 "I own my own documents" is identity-bound by construction; no URN-keyed accountless variant per design §"Why identity-required"). `DocumentsRuntime` calls `composition.respondentPlaceSource.readPlace({ subjectRef })` and renders the snapshot's `documents[]` as a per-kind grouped library: sections follow the closed `RespondentDocumentKind` taxonomy ordering (identity-proof → income-proof → proof-of-address → proof-of-age → eligibility-evidence → form-attachment → signed-receipt → correspondence → other), with empty kinds omitted. Sort contract within section: `capturedAt` desc, undefined last, ties broken by `displayName` asc — fixture-pinned. Cross-kind header derived honestly: "N document(s) across K kind(s)" with correct singular/plural. Each document carries a `"Use this document…"` disclosure button. Opening it lists matching `presentationPolicies[]` (scope + recipient sender name, vocabulary-firewalled — no protocol vocabulary leaks) AND renders the literal `DEFERRED_PRESENTATION_COPY`: "Selective presentation is not yet available on this site. When it lands, this button will share the document with the chosen scope." No real VP ceremony in slice 1 — the action captures intent in local React state only; no port call, no cryptography, no protocol negotiation. Honest deferred-capability copy fixture-pinned: "Selective presentation, derived-claim disclosure, per-presentation revocation, retention horizons, and client-side encryption are not yet available on this site." Empty-state distinct from disabled-by-policy: "You have not saved any documents to this site yet." Disabled-cause copy: `optional-no-instance` → "Your documents are not available. This site does not provide a document library."; `org-forbidden` → "Your documents are not available. This sender does not provide a document library here." Per-route runtime-feature gate adds `documentPresentation` to the closed `RuntimeFeatureKey` taxonomy — **first feature ADR beyond the seeded {respondentPlace, status} pair**. Transitional port-slot mapping: `documentPresentation` shares the `respondentPlaceSource` slot until SC-4 + EXT-18 land a real VP port (documented in `feature-port-map.ts`); both keys declare matching provenance so the coherence assertion stays satisfied. `DocumentsRuntime` synthesizes `form: { features: { respondentPlace: 'optional', documentPresentation: 'optional' } }` at the route boundary mirroring FW-0039 + FW-0055's synthesis pattern (web ADR-0011 §"Non-form surface synthesis" addendum). Document **listing** is gated on `respondentPlace`; the selection action **always** renders the deferred copy in slice 1 because no real VP ceremony exists in any composition yet (consumer-gated, not declaration-gated). Consumer discipline proved by `tests/app/documents-runtime.test.tsx` — does NOT call `StatusReader.readStatus`, `DraftStore.load/save`, `SubmitTransport.submit`, or `DefinitionSource.getDefinition`. Vocabulary firewall: forbidden DOM substrings (`respondent-place`, `library`, `sidecar`, `snapshot`, `subjectRef`, `aggregationMode`, `presentation-policy`, `openid4vp`, `OpenID4VP`, `w3c-vc`, `W3C`, `vc-data-model`, `hpke`, `HPKE`) test-pinned across the selection disclosure too. Boot-time composition narrowing: `chooseComposition` parses the documents route before construction and dispatches to `createDefaultDocumentsRouteComposition` — `definitionSource` / `draftStore` / `submitTransport` are noop on this route; `identityProvider` is gated on `respondentPlace` availability (MED-4 pattern from FW-0055) so production declares `unavailable` and short-circuits to noop, never constructing OIDC / magic-link / anonymous-session machinery for a surface that will render "not available" copy. The in-form `RespondentPlacePanel.DocumentItem` extracts to `src/app/documents-view.tsx` so both surfaces share one render contract — no parallel implementation can drift.
- **Done (slice 1):** `tests/app/documents-runtime.test.tsx` (32 cases including literal copy pins, per-kind section grouping, cross-kind header singular/plural, sort contract, selection-action disclosure + policy scope rendering + deferred-presentation copy, consumer-discipline assertions, vocabulary firewall, identity boot, adapter-error path, DOM parity); `tests/app/documents-route.test.ts` (5 cases); `tests/app/documents-view.test.tsx` (9 cases including closed-taxonomy ordering + sort contract); `tests/app/app-routing.test.tsx` (extended with `/documents` case); `tests/app/status-boot-narrowing.test.ts` (extended with two new FW-0056 differential cases — boot narrowing + `chooseComposition picks the documents-route factory`); `tests/smoke/composition.test.ts` (4 new FW-0056 factory tests); `tests/profiles/composition-coherence.test.ts` (extended with 6 new coherence tests covering both the FW-0055 and FW-0056 factory families); `tests/policy-resolution/cases/document-presentation-disabled-{no-instance,org-forbidden}.json` (2 new resolver fixture cases); 13 pre-existing resolver fixture cases extended with the new `documentPresentation` key. `src/policy/feature-keys.ts` extends `RUNTIME_FEATURE_KEYS` (append-only) and `src/policy/feature-port-map.ts` adds the transitional mapping. `npm run typecheck` + `npm run lint` + full vitest (451 passes) green. FW-0070 filed in this PLANNING.md as the sibling-factory parameterization follow-on row; FW-0066 row body updated to cite FW-0056 as the trigger that fired the FormRuntimePolicyExtractor port promotion (still scheduled; this row didn't pull it forward because the function-typed slot handles the literal route-synthesis pattern slice 1 needs).
- **User-visible behavior change:** the respondent can now visit `/documents` directly and see every saved document, grouped by kind ("Identity Proof", "Income Proof", "Proof Of Address", etc.) with newest captures first, an honest count of documents and kinds in the header, and a plain-language line naming the cryptographic capabilities not yet shipped. Each document has a "Use this document…" button that opens a disclosure listing matching presentation policies + the deferred-presentation honesty copy. The in-form respondent-place panel keeps its existing "Files" column — the dashboard is additional, not a replacement.
- **Consumes ports:** `RespondentPlaceSource` (existing, no extension — Respondent Library sidecar `documents[]` + `presentationPolicies[]` per web ADR-0010 / SC-3), `IdentityProvider` (existing, no extension — identity boot reuses the same `signInOptionsForIdentityPolicy` machinery `RespondentRuntime` + `ObligationsRuntime` use).
- **Plan:** [`thoughts/plans/2026-05-23-fw-0056-document-library.md`](thoughts/plans/2026-05-23-fw-0056-document-library.md).
- **Design:** [`thoughts/specs/2026-05-23-fw-0056-document-library-design.md`](thoughts/specs/2026-05-23-fw-0056-document-library-design.md).
- **Release gaps named:** (a) Actual selective-presentation cryptography (SD-JWT default per stack-root ADR-0116; BBS+ profile-gated) — blocked on SC-4 (Verifiable Presentation Profile) + EXT-18 (`@integrity-stack/hpke` TS wrapper) + the post-MVP cryptographic substrate work. (b) W3C VC Data Model 2.0 wire shape + OpenID4VP ceremony surface — same blocker. (c) Passkey-derived HPKE wallet encryption — EXT-18. (d) Verifiable-presentation port ratification + adapter conformance — SC-4 + a follow-on web ADR. (e) Per-presentation revocation surface — requires the presentation ceremony first. (f) Derived-claim disclosure ("18+" from birthdate) — SD-JWT-class selective disclosure per ADR-0116. (g) Retention horizon controls. (h) Export ceremony (download an encrypted portable JSON of the wallet). (i) Upload / capture / save-to-library — J-040 / FW-0033 territory. (j) Cross-issuer fan-out — XS-2 sibling concern. (k) Sibling-factory parameterization — FW-0070 (N=4 trigger fired). (l) `FormRuntimePolicyExtractor` port promotion — FW-0066 (this row was the trigger; the port is still scheduled because slice 1's literal route synthesis doesn't need it).
- **Note:** Closes web ADR-0011 §Failure Semantics for a third OPTIONAL non-form surface and introduces the FIRST extension of the closed `RuntimeFeatureKey` taxonomy beyond the seeded pair — `documentPresentation`. The transitional port-slot sharing with `respondentPlace` is documented in `feature-port-map.ts` + `docs/policy/runtime-feature-resolution.md` + the design doc §"Risks"; the first adopter who wires a real wallet but no VP stack will break the coherence assertion, which is the correct trigger for the VP port promotion (don't paper over it; promote the port). Consumes web ADR-0010 §DI shape `RespondentPlaceSource` port without extension. Coordinates with FW-0068's route-aware composition family by adding the `createDefault/Stub/DemoDocumentsRouteComposition` factories — fourth sibling family, parameterization-trigger acknowledged per FW-0070 (not collapsed inline to keep this row's scope tight + the refactor's review surface clean). The documents route's identity-bound nature mirrors FW-0055's pattern — `identityProvider` is real (gated on `respondentPlace` availability via MED-4), distinguishing it from the status route's noop-identity pattern.

### FW-0070 — Parameterize the route-narrowed composition factory family (N=4 trigger)

- **Phase:** Post-MVP
- **Status:** closed
- **Persona:** Platform
- **Journey:** (none — platform; backs every future narrowed-route consumer)
- **What:** A single `createRouteNarrowedComposition({ mode, config, route })` factory in `src/composition/route-narrowing.ts` collapses the 4 × 3 = 12 named sibling-factory functions that landed inline across FW-0068 + FW-0055 + FW-0056. Each narrowed route ships a `RouteNarrowing` descriptor (`STATUS_/OBLIGATIONS_/DOCUMENTS_ROUTE_NARROWING`) co-located with its parser in `src/app/*-route.ts`. The descriptor carries `routeCite`, `initialDefinitionUrlSentinel`, `consumesRespondentPlace`, `consumesStatus`, `identityBound`; the factory body encodes the wiring rules previously duplicated across the four sibling families. Form-shaped MVP ports (`definitionSource`, `draftStore`, `submitTransport`) are unconditionally noop on every narrowed route — that is the definition of "narrowed." Identity provider follows the descriptor's `identityBound` flag plus the MED-4 gate (production wires real identity only when `respondentPlace === 'available'`; today always short-circuits to noop). `chooseComposition` collapses to three dispatch arms calling the one factory.
- **Done:** (a) `src/composition/route-narrowing.ts` ships with the `RouteNarrowing` type + `createRouteNarrowedComposition` factory; (b) `STATUS_ROUTE_NARROWING`, `OBLIGATIONS_ROUTE_NARROWING`, `DOCUMENTS_ROUTE_NARROWING` exported from each route file alongside the parser; (c) the 12 named sibling-factory functions deleted from `src/composition/{default,stub,demo}.ts`; the full-app `createDefaultComposition` / `createStubComposition` / `createDemoComposition` factories stay (they are not narrowed); (d) `src/composition/index.ts` exports the parameterized factory + three descriptors; (e) `src/app/main-helpers.ts:chooseComposition` migrated to the parameterized factory; (f) `tests/composition/route-narrowing.test.ts` adds 33 cases covering descriptor contracts + identity-binding + per-mode posture; (g) `tests/profiles/composition-coherence.test.ts` extracts a programmatic case generator — 9 explicit narrowed-factory cases collapse to a `describe.each` over (mode, descriptor) combos; (h) `tests/smoke/composition.test.ts` 12 per-named-factory blocks collapse to a `describe.each` over the three descriptors; (i) `tests/app/status-boot-narrowing.test.ts` rewritten to call the parameterized factory directly; (j) production identity-binding helper exported from `default.ts` so the parameterized factory can reuse the OIDC / magic-link / anonymous selection rules without duplication; (k) `npm run ci`-gated checks (typecheck, lint, testing-plan, mvp-audit, upstream-blockers, release-docs, conformance-coverage) green; full unit suite green.
- **User-visible behavior change:** none. Pure internal refactor; coherence assertion still funnels through `freezeComposition`; boot-narrowing tests still prove no HTTP / OIDC / anonymous-session adapter constructor fires on a narrowed route.
- **Consumes ports:** none (pure refactor).
- **Closed:** shipped in [`thoughts/plans/2026-05-23-fw-0070-route-narrowing-parameterization.md`](thoughts/plans/2026-05-23-fw-0070-route-narrowing-parameterization.md). Design [`thoughts/specs/2026-05-23-fw-0070-route-narrowing-parameterization-design.md`](thoughts/specs/2026-05-23-fw-0070-route-narrowing-parameterization-design.md). Test-matrix scaling: 12 named factory functions → 1 parameterized factory + 3 descriptors; 11 explicit coherence cases for the factories → 2 full-app explicit + 6 generated narrowed; 12 per-named-factory smoke blocks → 15 generated descriptor smoke cases (5 per descriptor — the matrix grows with assertion breadth per descriptor instead of with descriptor count). Adding a fifth narrowed route adds ONE descriptor + ONE chooseComposition arm and the test matrix expands automatically.
- **Note:** Closes FW-0056 closeout independent architecture review LOW-2 ("pull forward before a fifth narrowed-route consumer lands") and the FW-0068 design §"Sibling future consumers" parameterization recommendation. The descriptor cleanly captured all four sibling factories' wiring rules — no honest-scope-check finding fired. Per the project's no-shims discipline, the 12 named factories were deleted (not aliased over the parameterized factory); the refactor is the migration. Reviewer is independent per the review-loop discipline.

### FW-0033 — File upload as a primary act (slice 1) — AttachmentStore port + in-form upload affordance + runtime gate

- **Phase:** Post-MVP
- **Status:** live (slice 1; slice 2 — camera capture / deskew / on-device redaction / library-save / resumable uploads / production reference object-store adapter — still open as FW-0073..FW-0077)
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
- **What slice 1 landed:** A new `AttachmentStore` port at `src/ports/attachment-store.ts` with one operation: `upload(blob: Blob, metadata: { filename, mimeType }) → AttachmentRef`. `AttachmentRef` discriminator literal `kind: 'attachment-ref'` plus `{ uri, hash (sha256:<hex>), size, mimeType, filename }`. In-memory `stubAttachmentStore()` (DEMO_STUB_ADAPTER-marked; SHA-256 via WebCrypto with fnv fallback; URIs `attachment:demo-<counter>`; exposes test-only `getStoredBytes(uri)`). `unavailableAttachmentStore()` sentinel (UNAVAILABLE_ADAPTER-marked; throws `AttachmentUploadError`). Conformance suite under `tests/adapter-conformance/attachment-store/` covering round-trip, hash determinism / differentiation, ref shape, metadata round-trip, empty-blob, non-empty URI. New `fileUpload` runtime-feature key appended to the closed `RUNTIME_FEATURE_KEYS` taxonomy — **third extension after `documentPresentation`** (FW-0056). 1:1 mapping in `FEATURE_PORT_MAP` to a new `attachmentStore` Composition slot — no transitional slot-sharing. New `extractAttachmentRequirement(definition)` walker in `src/policy/extract-form-policy.ts` recursively walks `definition.items` (including nested in repeating groups) for `dataType === 'attachment'` fields; returns `'required'` when present, `undefined` otherwise. Composition wiring extended: production declares `fileUpload: 'unavailable'` + wires `unavailableAttachmentStore()`; demo declares `fileUpload: 'demo-stub'` + wires `stubAttachmentStore()`; narrowed-route factories (`createRouteNarrowedComposition`) declare `'unavailable'` uniformly + wire the sentinel because no narrowed surface accepts uploads. Default + stub compositions' `getFormRuntimePolicy` now composes the walker — first non-literal extractor. In-form upload affordance: `FormspecWebAttachmentControl` (registered via `componentMap.fields.FileUpload` on `FormspecProvider`) wraps the file-picker UX so picks/drops POST through `composition.attachmentStore` and replace the engine value with `AttachmentRef[]` (multiple) or a single `AttachmentRef` — silently-disappearing `File` objects no longer survive into `JSON.stringify(response)`. Submit handoff carries the ref(s) through `extensions['x-formspec-response-data']` unchanged; no `IntakeHandoff` shape change. `RuntimePolicyErrorPage` renders fileUpload-specific copy when the form requires uploads on an unavailable instance: "This form needs file uploads, but this site is not set up to receive files." Honest deferred-capability copy on every render of the upload affordance: "Camera capture, edge detection, on-device redaction, and saving to your document library are not yet available here." (literal copy fixture-pinned).
- **Done (slice 1):** `tests/adapter-conformance/attachment-store/conformance.test.ts` (5 cases via the shared suite); `tests/adapters/attachment-store-stub.test.ts` (4 cases); `tests/adapters/attachment-store-unavailable.test.ts` (3 cases); `tests/adapters/unavailable-sentinel.test.ts` + `tests/adapters/demo-stub-marker.test.ts` extended with the new adapter; `src/policy/extract-form-policy.test.ts` (5 cases: present / nested-in-group / nested-in-repeat / absent / multiple); `src/policy/feature-keys.test.ts` extended (append-only assertion); `src/policy/freeze-composition.test.ts` extended with new slot; `tests/policy-resolution/cases/file-upload-{required-unavailable-throws,demo-stub-satisfies-required,disabled-no-instance}.json` (3 new resolver cases); 12 pre-existing resolver cases backfilled with the `fileUpload` key. `tests/app/attachment-upload-control.test.tsx` (7 cases: single + multiple uploads, error inline, remove, maxSize rejection, deferred-copy pin, vocabulary firewall). `tests/app/respondent-runtime-attachment.test.tsx` (3 cases including end-to-end form-load + upload via stub + AttachmentRef-in-engine assertion; required-but-unavailable form-load throws and renders fileUpload-specific copy). `tests/profiles/composition-coherence.test.ts` extended with the new slot across every sharedSlot case. `scripts/check-conformance-coverage.mjs` extended (port suite + stub + sentinel registrations). `docs/ports/attachment-store.md` + `docs/policy/runtime-feature-resolution.md` updated. `tests/adapter-conformance/README.md` extended. ADR-0011 cross-reference appended. `npm run typecheck` clean. Full vitest unit suite green (458 passes — 451 pre-slice + 7 new control cases + 3 new e2e cases - 3 trivial helper rollups). `npm run check:conformance-coverage` green (8 ports, 15 adapter registrations, 3 unavailable sentinels).
- **User-visible behavior change:** an attachment-bearing form now actually persists the bytes during form-fill — the upload affordance shows the file name + size + an "Uploading…" indicator while in-flight, an inline error message on failure, and a remove button per file once uploaded. The submit handoff carries the upload references through `response.data` (where the receiver service resolves them against the configured object store) rather than silently dropping `{}`. Forms with attachment fields submitted against the OSS reference deployment now fail-load with a plain-language unavailable page until an adopter wires a real adapter — the prior silent submission of empty payloads is closed.
- **Consumes ports:** `AttachmentStore` (new — port + adapter + conformance + composition slot all in this slice).
- **Plan:** [`thoughts/plans/2026-05-23-fw-0033-file-upload.md`](thoughts/plans/2026-05-23-fw-0033-file-upload.md).
- **Design:** [`thoughts/specs/2026-05-23-fw-0033-file-upload-design.md`](thoughts/specs/2026-05-23-fw-0033-file-upload-design.md).
- **Release gaps named:** (a) Production object-store reference adapter (S3 / R2 / Azure Blob / server-bundled / IPFS) — adopter-side; the OSS reference composition declares `unavailable` honestly. (b) Camera capture, deskew, edge detection, legibility check — filed as FW-0073. (c) On-device redaction — filed as FW-0074. (d) Save-to-library compose with FW-0056 — filed as FW-0075. (e) Resumable / chunked / progressive uploads — filed as FW-0076. (f) Demo form attachment field — filed as FW-0077 (gated on a refresh-surviving demo store). (g) Virus scanning / content moderation pipeline — issuer/operations concern. (h) Attachment-binding to specific audiences (compose with FW-0049 + FW-0056). (i) AttachmentReader port for receipt portals / selective-proof viewers (FW-0009 / FW-0010 territory). (j) Canonical `AttachmentRef` + `IntakeHandoff` binding wire-format ratification — filed as EXT-34 in the upstream extension queue. (k) `FormRuntimePolicyExtractor` port promotion — FW-0066 second trigger pulse (still scheduled — slice 1 ships the extractor inline since the inline closure handles the walker shape without forcing the port).
- **Note:** Closes web ADR-0011 §Failure Semantics for the FIRST IN-FORM (non-route) consumer of the runtime-feature gate and the FIRST key whose form-policy extractor introspects definition content. The substrate-honesty gap (raw `File` objects JSON-roundtripping to `{}` and silently disappearing at submit) is closed — adopters who wire a real `AttachmentStore` get an end-to-end flow; adopters who don't get an honest fail-load at form load. The pattern generalizes for any future feature key whose form policy is derived from definition content (e.g., a `payment` key derived from fee-bearing fields). Anti-patterns AP-001 / AP-008 / AP-013 remain open for slice 2 (capture + redaction); slice 1's substrate honesty does not by itself satisfy them, but it makes them buildable.

### FW-0057 — Cross-issuer respondent history (slice 1) — RespondentHistorySource port + standalone /history route + cross-sender framing + honest deferral copy

- **Phase:** Post-MVP
- **Status:** live (slice 1; production cross-issuer fan-out blocked on XS-2 multi-issuer client-side token bag, tracked at FW-0078; draft resume blocked on EXT-26 + EXT-27; signed-record receipt detail is FW-0009 / FW-0010 territory; lifecycle actions on past records are FW-0034 territory; search / filter / faceted sort / calendar export / deletion semantics still open)
- **Persona:** Respondent
- **Journey:** [J-043](JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
- **What slice 1 landed:** New `RespondentHistorySource` port at `src/ports/respondent-history-source.ts` with one operation: `readHistory(query) → Promise<HistorySnapshot>`. `HistorySnapshot` carries `$formspecRespondentHistory: '1.0'` + `aggregationMode: 'client-wallet'` + `subjectRef` + `entries: readonly HistoryEntry[]`. `HistoryEntry` discriminator over the closed `HistoryEntryKind` taxonomy (`'draft' | 'submission' | 'signed-record'`) plus `id`, `issuer` (display string), `timestamp` (ISO-8601), `title`, optional cross-route hints (`applicantStatusRef` / `documentRefs` / `receiptRef` / `definitionRef`). In-memory `stubRespondentHistorySource()` (DEMO_STUB_ADAPTER-marked) backing the new `demoHistorySnapshot()` fixture — 4 entries across 2 senders (Example Department of Benefits, Example Tax Office) spanning all three kinds. `unavailableRespondentHistorySource()` sentinel (UNAVAILABLE_ADAPTER-marked; throws `Error` with an adopter-facing message). Conformance suite under `tests/adapter-conformance/respondent-history-source/` covering round-trip, empty entries no-throw, closed-set `kind` rejection, closed-set `aggregationMode` rejection, non-array `entries` rejection, required-field rejection, `documentRefs` string-only rejection. New `crossIssuerHistory` runtime-feature key appended to the closed `RUNTIME_FEATURE_KEYS` taxonomy — **fifth extension after `fileUpload`** (FW-0033). 1:1 mapping in `FEATURE_PORT_MAP` to a new `respondentHistorySource` Composition slot — no transitional slot-sharing (port + key ship together). New `consumesHistory: boolean` flag on `RouteNarrowing` drives the wiring: the new `/history` route (descriptor `HISTORY_ROUTE_NARROWING` at `src/app/history-route.ts`) sets `consumesHistory: true` and the demo factory wires the stub + declares `'demo-stub'`; the existing three descriptors (`status` / `obligations` / `documents`) set `consumesHistory: false` and wire the unavailable sentinel + declare `'unavailable'`. **No new sibling-factory family** per the FW-0070 consolidation — the parameterized factory handles the fifth route via one new descriptor + one new `chooseComposition` dispatch arm. Standalone `/history` route — identity-bound (J-043 "my own paperwork" framing); same MED-4 short-circuit pattern (`identityProvider` is real only when `respondentPlace === 'available'` — today always noop in production). `HistoryRuntime` synthesizes `form: { features: { crossIssuerHistory: 'optional' } }` at the route boundary (web ADR-0011 §"Non-form surface synthesis" addendum), boots identity, calls `composition.respondentHistorySource.readHistory({ subjectRef })`, and renders entries grouped by kind in closed-taxonomy order (draft → submission → signed-record). Sort within section: `timestamp` desc, ties broken by `id` asc — fixture-pinned. Cross-sender header: "N record(s) across M sender(s)" with correct singular/plural. Each entry uses the shared `HistoryEntryItem` from `src/app/history-view.tsx` with per-kind timestamp prefix ("Last edited" / "Submitted" / "Signed"). Cross-route hyperlinks: `applicantStatusRef` → `/status?case={encodeURIComponent(urn)}`; `documentRefs.length > 0` → `/documents` link with "N saved document(s)" copy. Unresolvable refs suppress the link (never fabricate a URN). Honest deferred-capability copy fixture-pinned: "Search, filters, calendar export, aggregation across other senders, draft resume, signed-record detail, and deletion are not yet available on this site." Empty-state copy distinct from disabled-by-policy: "You have no records to show yet." Disabled-cause copy: `optional-no-instance` → "Your history is not available. This site does not provide a history view."; `org-forbidden` → "Your history is not available. This sender does not provide a history view here." Consumer discipline proved by `tests/app/history-runtime.test.tsx` — does NOT call `StatusReader.readStatus`, `DraftStore.load/save`, `SubmitTransport.submit`, `DefinitionSource.getDefinition`, or `RespondentPlaceSource.readPlace`. Vocabulary firewall: forbidden DOM substrings (`history-snapshot`, `HistorySnapshot`, `respondentHistory`, `tokenBag`, `XS-2`, `cross-issuer`, `issuer-ref`, `aggregationMode`, `subjectRef`, `respondent-place`, `library`, `sidecar`, `snapshot`, `openid4vp`, `OpenID4VP`, `hpke`, `HPKE`, `w3c-vc`, `W3C`, `VC`) test-pinned. Boot-time composition narrowing: `chooseComposition` parses the history route before construction and dispatches to `createRouteNarrowedComposition({ mode: 'default', config, route: HISTORY_ROUTE_NARROWING })` — `definitionSource` / `draftStore` / `submitTransport` are noop on this route; `identityProvider` gated on `respondentPlace` availability (MED-4 pattern). The shared `history-view.tsx` extracts `HistoryEntryItem`, `groupAndSortHistory`, `uniqueIssuerCount`, and the `HISTORY_KIND_ORDER` taxonomy so any future in-form consumer (FW-0034 lifecycle actions on past records) reuses one render contract without parallel-implementation drift.
- **Done (slice 1):** `tests/app/history-runtime.test.tsx` (23 cases including literal copy pins, per-kind section grouping, sort contract, cross-sender header singular/plural, cross-route status link, cross-route documents link, suppressed-link contract, consumer-discipline assertions on 4+ ports, vocabulary firewall, identity boot, adapter-error path); `tests/app/history-route.test.ts` (7 cases including descriptor-flag contract); `tests/app/history-view.test.tsx` (14 cases including closed-taxonomy ordering + sort contract + per-kind timestamp prefix + cross-route link rendering); `tests/app/app-routing.test.tsx` (extended with `/history` case); `tests/app/status-boot-narrowing.test.ts` (extended with `chooseComposition picks the history-route factory` differential coverage); `tests/composition/route-narrowing.test.ts` (extended with the fourth descriptor in `ALL_DESCRIPTORS` + 3 new `consumesHistory` flag wiring cases — 45 cases total, up from 33); `tests/adapter-conformance/respondent-history-source/conformance.test.ts` (7 cases via the shared `defineRespondentHistorySourceConformance` suite); `tests/adapters/respondent-history-source-stub.test.ts` (6 cases including cross-sender count, kind discriminator, defensive cloning); `tests/adapters/respondent-history-source-unavailable.test.ts` (2 cases); `tests/adapters/unavailable-sentinel.test.ts` + `tests/adapters/demo-stub-marker.test.ts` extended with the new adapters; 3 new `tests/policy-resolution/cases/cross-issuer-history-*.json` resolver fixture cases + 18 pre-existing resolver cases backfilled with the new `crossIssuerHistory` key in `instance` + `org.features` + 10 profile-kind fixtures backfilled with `expect.disabled.crossIssuerHistory: 'not-requested'` for forms that don't request the key (H-1 remediation); `tests/profiles/composition-coherence.test.ts` extended with `HISTORY_ROUTE_NARROWING` in the descriptor matrix (the matrix auto-includes the new descriptor); `tests/scripts/check-conformance-coverage.test.mjs` fixture builder extended with the new port suite + adapter + sentinel + harness export. `src/policy/feature-keys.ts` extends `RUNTIME_FEATURE_KEYS` (append-only) and `src/policy/feature-port-map.ts` adds the 1:1 mapping. `scripts/check-conformance-coverage.mjs` registry extended (port suite + stub + unavailable sentinel + required harness export). `npm run typecheck` + `npm run lint` + full vitest suite green (652 passes / 74 files via `npm test`; `npm run test:unit` 541 / 63 + `npm run test:conformance` 103 / 10). FW-0078 filed in this PLANNING.md as the post-XS-2 production cross-issuer wiring follow-on row.
- **User-visible behavior change:** the respondent can now visit `/history` directly and see every saved record (draft, submission, signed record) across senders, with newest items surfaced first, an honest count of records and senders in the header, cross-route hyperlinks into `/status` (when a case URN is present) and `/documents` (when documents are linked), and a plain-language line naming the cryptographic and aggregation capabilities not yet shipped. Re-visiting the page in any browser, after signing in, shows the snapshot the wallet returns (in demo: 4 entries across 2 senders, 3 kinds; in production today: "Your history is not available." copy because XS-2 has not landed).
- **Consumes ports:** `RespondentHistorySource` (new — port + adapter + conformance + composition slot all in this slice), `IdentityProvider` (existing, no extension — identity boot reuses the same `signInOptionsForIdentityPolicy` machinery `RespondentRuntime` + `ObligationsRuntime` + `DocumentsRuntime` use).
- **Plan:** [`thoughts/plans/2026-05-24-fw-0057-cross-issuer-history.md`](thoughts/plans/2026-05-24-fw-0057-cross-issuer-history.md).
- **Design:** [`thoughts/specs/2026-05-24-fw-0057-cross-issuer-history-design.md`](thoughts/specs/2026-05-24-fw-0057-cross-issuer-history-design.md).
- **Release gaps named:** (a) Production cross-issuer adapter — blocked on XS-2 (multi-issuer client-side token bag per stack-root ADR-0068 D-1 + D-3); already filed upstream in `thoughts/specs/2026-05-22-upstream-extension-queue.md`. Filed as FW-0078 below for the formspec-web-side production wiring once XS-2 lands. (b) Draft resume (clicking a draft entry re-opens the form) — blocked on EXT-26 + EXT-27 (cross-deployment draft hydration). (c) Receipt-chain detail view for signed records — FW-0009 / FW-0010 territory (verifier surface). (d) Lifecycle actions on past records (correct / withdraw / dispute) — FW-0034 territory. (e) Search / filter / faceted sort — filed as follow-on (no row yet; trigger when a respondent surface needs >10 entries). (f) Calendar / iCal export — filed as follow-on. (g) Deletion semantics (drafts deletable, submissions not) — FW-0043 + FW-0034 territory. (h) Cross-deployment history (across formspec-web instances on different domains) — needs wallet-as-source-of-truth substrate work. (i) Per-kind enriched fields (signed-record `verifiedAt`, draft `lastEditedAt`, submission `statusEvent`) — couples to FW-0034 / FW-0009; deferred until consumers exist. (j) Descriptor-flag consolidation trigger if a sixth feature key lands — track in this row's note for the next implementer.
- **Note:** Closes web ADR-0011 §Failure Semantics for a fourth OPTIONAL non-form surface and introduces the fifth extension of the closed `RuntimeFeatureKey` taxonomy — `crossIssuerHistory`. Validates the FW-0070 parameterized factory + adds the first new `consumes*` flag (`consumesHistory`) beyond the seeded `consumesStatus` / `consumesRespondentPlace` / `identityBound` set; the flag pattern matches the existing two so a sixth feature key with its own narrowed surface follows the same shape. Adds the FIRST new respondent-side port since FW-0033's `AttachmentStore`. The substrate-honesty gap (XS-2 not yet shipped) is named in the deferred-capability copy verbatim ("aggregation across other senders") — production adopters who declare `crossIssuerHistory: 'unavailable'` get an honest "Your history is not available." page; adopters who later wire a real adapter swap both the declaration and the wired port atomically. Anti-pattern AP-006 (silent failures, drift) is closed for the read path — the surface displays what the wallet returns, no synthesized data, no hidden filters.

### FW-0078 — Production cross-issuer history wiring (post-XS-2)

- **Phase:** Post-MVP (post-XS-2 substrate)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-043](JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
- **Done:** A production `RespondentHistorySource` adapter wired against XS-2 (multi-issuer client-side token bag per stack-root ADR-0068 D-1 + D-3) that fans out across the respondent's per-issuer authorization handles and aggregates a real cross-issuer timeline into the FW-0057 `HistorySnapshot` shape. Production composition flips `crossIssuerHistory` from `'unavailable'` to `'available'` and `/history` renders live entries instead of the disabled-cause copy.
- **Blocked on:** XS-2 (filed in `thoughts/specs/2026-05-22-upstream-extension-queue.md`). Includes per-issuer failure handling (return partial snapshot when one sender is unreachable, not a whole-call throw), fan-out strategy (parallel vs serial vs windowed), and cache discipline (live fetch vs cached-with-revalidation; adopter-shaped).
- **Anti-patterns:** AP-006 (silent failures). The slice-1 read path is honest; the production adapter must preserve that honesty under partial-failure conditions.

### FW-0079 — Per-route identity gating in `buildProductionNarrowedComposition` (post-FW-0078)

- **Phase:** Post-MVP (post-XS-2 substrate)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-043](JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
- **Done:** `buildProductionNarrowedComposition` in `src/composition/route-narrowing.ts` gates the real identity provider per-route on the capability the route actually consumes, not exclusively on `instanceCapabilities.respondentPlace`. Today's gate (`route.identityBound && instanceCapabilities.respondentPlace === 'available'`) is correct because every identity-bound narrowed route also consumes `respondentPlace` and `crossIssuerHistory` is always `'unavailable'` in production. Post-FW-0078, `/history` is identity-bound AND consumes `crossIssuerHistory` but does NOT consume `respondentPlace`; the current gate would short-circuit to noop identity even when history is `'available'`. Replace with a per-route capability check: when `route.consumesHistory && crossIssuerHistory === 'available'`, wire real identity even if `respondentPlace === 'unavailable'`. Same pattern extends to any future route that decouples its capability from `respondentPlace`. Likely a small refactor to `route-narrowing.ts:170-190`.
- **Blocked on:** FW-0078 (production cross-issuer adapter). The gate's current shape is harmless today because the production posture always declares `crossIssuerHistory: 'unavailable'`; the foot-gun activates only when FW-0078 flips that declaration to `'available'`.
- **Anti-patterns:** AP-002 (incomplete identity gating leaving an authenticated-only surface accessible without identity). Today the page renders a disabled-cause; post-FW-0078 it would render a live cross-issuer view without identity if the gate isn't reshaped.

### FW-0080 — Consolidate `consumes*` boolean ladder on `RouteNarrowing` into a `ReadonlySet<RuntimeFeatureKey>`

- **Phase:** Post-MVP
- **Status:** open
- **Persona:** Maintainer (internal architectural debt)
- **Journey:** N/A (refactor; preserves user-observable behavior)
- **Done:** Replace the three `consumes*` boolean flags on `RouteNarrowing` (`consumesRespondentPlace`, `consumesStatus`, `consumesHistory`) with a single `consumes: ReadonlySet<RuntimeFeatureKey>` field driven by the existing `FEATURE_PORT_MAP`. Existing descriptors translate mechanically: `{consumesRespondentPlace: true, consumesStatus: true, consumesHistory: false, identityBound: true}` → `{consumes: new Set(['respondentPlace', 'status']), identityBound: true}`. `buildProductionNarrowedComposition` and `buildDemoNarrowedComposition` read membership from the set instead of switching on individual flags. The shape naturally accommodates `fileUpload` (already eligible per design line 158-161) and future feature keys without touching `RouteNarrowing`. Conformance and descriptor-matrix tests adapt automatically since the new shape is more uniform; the explicit-flag-per-key audit in `tests/composition/route-narrowing.test.ts` collapses into one set-membership check per key.
- **Blocked on:** No upstream block; deferred until the next feature-key addition makes the consolidation forcing rather than optional. Reviewer of FW-0057 disagrees with the implementer's "trigger fires at flag #6" framing — argues the pattern is already a boolean ladder mirroring `RuntimeFeatureKey`. Track this row as the consolidation owner; pull forward when a sixth `RuntimeFeatureKey` (after `respondentPlace`, `status`, `documentPresentation`, `fileUpload`, `crossIssuerHistory`) lands or when a fourth `consumes*` flag is about to be added — whichever fires first.
- **Anti-patterns:** AP-005 (descriptor-bloat — parallel boolean flag per feature key when the existing closed taxonomy is the natural index).
