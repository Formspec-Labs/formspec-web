# FW-0056 — Respondent document library + selective presentation (design)

**Date:** 2026-05-23
**Row:** [FW-0056](../../PLANNING.md#fw-0056--respondent-side-document-library-with-selective-presentation)
**Journey:** [J-042](../../JOURNEYS.md#j-042--my-documents-are-in-my-library--i-share-them-with-each-form-on-my-terms)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0010 (respondent-place trust model), web ADR-0011 (runtime feature resolution)
**Precedent:** [FW-0055 slice-1 design](2026-05-23-fw-0055-respondent-obligations-stream-design.md) — same shape (standalone surface + honest-deferral copy + route narrowing)
**Authority:** consumes the existing `RespondentPlaceSource` port (Respondent Library `documents[]` + `presentationPolicies[]` per SC-3); does **not** add a new port. Adds **one** new runtime-feature key — `documentPresentation` — to the closed `RuntimeFeatureKey` taxonomy per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) §"Feature Ownership Table" (separates "Document library" from "Selective presentation"). Triggers [FW-0066](../../PLANNING.md#fw-0066--promote-getformruntimepolicy-to-a-formruntimepolicyextractor-port) port promotion (first feature ADR adding a key after the seeded set) and the N=4 sibling-factory parameterization trigger from [FW-0068 design](2026-05-23-fw-0068-route-aware-composition-narrowing-design.md) §"Sibling future consumers."

## What FW-0056 actually needs (vs the row prose)

The PLANNING row claims a "stub-backed DI slice" already ships — and the substrate half is real: `RespondentPlaceSnapshot.documents[]` is rendered as the in-form "Files" column of `RespondentPlacePanel`, with kind taxonomy conformance-pinned. The product-surface half is missing the same four things FW-0055 needed for obligations:

1. **No standalone documents surface.** The "library across every form" promise (J-042 §What-they-want) is the respondent's own canonical store; today the document list is reachable only while filling out a form. Same dishonesty FW-0039 fixed for `/status` and FW-0055 fixed for `/obligations`.
2. **No selective-presentation handle.** The whole point of J-042 is "I choose what to share." Today the in-form column shows documents as a static read-out — no "use this for a form / share with a sender / scope what I disclose" action. Even a stubbed selection that captures intent is meaningful; a static list is not.
3. **No honest-deferral copy.** J-042 names: per-presentation revocation, derived-claim disclosure ("18+" from a birthdate rather than the birthdate), retention horizons, export/portability, cryptographic encryption (passkey-derived HPKE per ADR-0010 §"client-side encryption"). None of which we ship in slice 1. The current panel silently omits all of it.
4. **No grouping by document kind.** Today's list is rendered in adapter-supplied order. The library promise is "recognized by what they are, not by what each form calls them" (J-042 §What-they-want) — that requires grouping by `kind` (identity-proof / income-proof / proof-of-address / signed-receipt / ...). Otherwise the surface reads as a download list, not a library.

Each gap is independently load-bearing.

## Decision: ship slice 1 (standalone surface + selection action + honest copy + kind grouping); defer cryptography and protocol stack

Slice 1 lands:

- A dedicated **documents route** (`/documents`) handled inside `App.tsx`. Same router-less pattern FW-0055 used. `parseDocumentsRoute(href)` returning `null | {}` (the URL is the request; no params). `App.tsx` adds a third branch alongside `/status` and `/obligations`. Lazy-loads `DocumentsRuntime`.
- A new **`DocumentsRuntime.tsx`** that resolves the runtime profile, boots identity (the surface is identity-bound — see §"Why identity-required" below), calls `RespondentPlaceSource.readPlace({ subjectRef })`, and renders documents grouped by kind. Layered like `ObligationsRuntime` is.
- **Library framing.** Page header reads "Your documents" (owner vocabulary). Summary strip shows `N document(s) across K kind(s)` derived from the unique-kind count. Documents are grouped under per-kind section headings using `labelFromToken(document.kind)` — "Identity proof", "Income proof", "Proof of address", "Signed receipt", etc. Within each section, sort by `capturedAt` descending (newest first); ties break by displayName. Pin a deterministic ordering in the test fixture so adapter ordering cannot bleed through.
- **Selection action — captured intent, not actual presentation.** Each document row carries a "Use this document…" disclosure button. Clicking it opens a `<details>`/dialog block listing what selective-presentation WOULD do (full document / redacted fields / derived claim only) per the document's matching `presentationPolicies[]` entries. **Slice 1 captures the intent in local React state only and immediately renders the deferred-capability copy: "Selective presentation is not yet available on this site. When it lands, this button will share the document with the chosen scope."** No port call; no cryptography; no protocol negotiation. The honesty is: the UI surface exists and the policy connection is visible; the actual VP ceremony is the slice-2 work.
- **Honest gap copy.** Below the page header — not a footnote — a labelled gap row reads: "Selective presentation, derived-claim disclosure, per-presentation revocation, retention horizons, and client-side encryption are not yet available on this site." Literal copy fixture-pinned in `documents-runtime.test.tsx#deferred capability copy`. Same pattern FW-0039 + FW-0055 used.
- **Disabled-cause copy.** When `respondentPlace` is disabled at the resolved profile:
  - `optional-no-instance` (production default — wallet adapters unavailable) → "Your documents are not available. This site does not provide a document library."
  - `org-forbidden` → "Your documents are not available. This sender does not provide a document library here."
  - `form-forbidden` → not applicable on this route (no form); typed-disabled handler covers it conservatively with the org-forbidden copy.
  - `not-requested` → unreachable because `DocumentsRuntime` synthesizes `form: { features: { respondentPlace: 'optional', documentPresentation: 'optional' } }` at the route boundary per ADR-0011 §"Non-form surface synthesis" addendum.
- **Empty-state copy.** When the profile enables `respondentPlace` and the adapter returns an empty `documents[]` (or none) → "You have not saved any documents to this site yet."
- **In-form panel keeps existing render.** `RespondentPlacePanel`'s `DocumentItem` stays; the dashboard is *additional*. Like FW-0055, both surfaces share one render contract — extract a shared `src/app/documents-view.tsx` so the inline `DocumentItem` in `RespondentRuntime` and the new `DocumentsRuntime` use the same item component + sort + group helpers.

Slice 1 does **not** ship:

- **Actual selective-presentation cryptography or protocol.** No W3C VC Data Model 2.0 wire, no OpenID4VP ceremony, no SD-JWT derivation, no HPKE wallet encryption. All deferred to slice 2 + the EXT-18 (HPKE TS wrapper) + SC-4 (Verifiable Presentation Profile) substrate already queued at `thoughts/specs/2026-05-22-upstream-extension-queue.md`.
- **Document upload / capture from the dashboard.** Upload is J-040 (FW-0033 territory). The dashboard reads what the wallet adapter holds; it does not write. When upload lands, the saved document flows into the library through the existing snapshot read path.
- **Per-presentation revocation.** Needs a presentation-history primitive and the actual presentation ceremony (which doesn't ship in slice 1). Deferred and copy-named.
- **Derived-claim disclosure ("18+" from birthdate).** Needs SD-JWT-class selective disclosure per stack-root ADR-0116. Out of scope and copy-named.
- **Retention horizons / expiry surfacing UI controls.** The snapshot's `documents[].expiresAt` is rendered as a small "Expires …" line under each document (consistent with today's `DocumentItem`), but there are no controls to set / extend / waive retention.
- **Export / portability ceremony.** `RespondentPlaceSnapshot.export` field exists in the sidecar shape; surfacing an export action requires a real adapter behavior and a download path. Out of scope; named in the deferred copy as part of "client-side encryption" gap (export integrity is a downstream of the encryption envelope).
- **Cross-issuer / cross-tenant aggregation.** Same XS-2 architectural commitment as FW-0055. Slice 1 honestly renders whatever the wallet adapter aggregates.
- **A new port.** The Respondent Library sidecar already carries `documents[]` + `presentationPolicies[]`; per ADR-0010 §"web MUST NOT define a competing taxonomy," formspec-web does not invent `DocumentLibrarySource`. Wallet-side document aggregation is the adapter's concern.
- **A different shape of selective-presentation viewer** (separate from FW-0010, the verifier-side selective-proof viewer). FW-0010 is the evaluator-side viewer for a *received* proof; FW-0056 slice 1 is the respondent-side surface that *requests* a presentation. They are distinct journeys (J-042 vs J-007) and distinct surfaces.

## Decision on runtime feature key: add `documentPresentation` — first taxonomy extension since the seeded pair

ADR-0011 §"Feature Ownership Table" lists **both** "Document library" (`respondentPlace` instance capability: wallet storage + document metadata adapter) **and** "Selective presentation" (separate row, instance capability: VC/OpenID4VP stack). They are deliberately separate because their adapters are independently absent or present in adopter compositions: a deployment can have wallet storage but not the VP protocol stack (and vice-versa is exotic but legal).

Slice 1's surface gates two distinct concerns:

| Concern | Gated by | Slice 1 wiring |
|---|---|---|
| Listing what's saved | `respondentPlace` | Existing key. Production: `unavailable`. Demo: `demo-stub`. |
| Selecting + presenting a document with scope | `documentPresentation` | **New key.** Production: `unavailable`. Demo: `unavailable` (no VP stack stub) — the page shows the deferred copy on the action button even in demo mode, because the cryptographic substrate honestly does not exist anywhere yet. |

**Decision: add `documentPresentation` to the closed `RuntimeFeatureKey` taxonomy.** Implications:

1. `src/policy/feature-keys.ts`: extend `RUNTIME_FEATURE_KEYS = ['respondentPlace', 'status', 'documentPresentation'] as const` (append-only ordering per the existing comment).
2. `src/policy/feature-port-map.ts`: needs a port slot to gate against. Slice 1 has no port for the VP stack yet (per "No new port" above, and per web ADR-0009 §"Not in the constitutional inventory" — no port ratified before a consumer). Resolve by **mapping `documentPresentation` to the SAME `respondentPlaceSource` slot** as a transitional step, declared explicitly in code as "the wallet adapter is the substrate; the VP stack is post-MVP." When SC-4 / EXT-18 land and the VP port is ratified (likely `PresentationCeremony` or `VerifiablePresentationProvider`), the map switches. This keeps the coherence assertion meaningful in slice 1 without forcing a port that has no consumer.
   - **Honesty caveat:** the coherence assertion will fire if the adopter declares `documentPresentation: 'available'` while wiring an unavailable place source. That is the **correct** behavior: slice 1's whole point is that you cannot honestly enable selective presentation just because you wired a wallet. Adopters who land a real wallet but no VP stack must declare `documentPresentation: 'unavailable'` (paired with the same `unavailableRespondentPlaceSource` sentinel — or, more cleanly post-FW-0066, a port-specific unavailable sentinel for the VP slot).
3. **Default compositions:** `documentPresentation: 'unavailable'` in production (no VP stack); `documentPresentation: 'unavailable'` in demo / stub (no demo VP stack either — the WHOLE POINT is that we don't ship a fake selective-presentation ceremony that misleads). The demo composition can change to `demo-stub` if and when a fake-but-honestly-labeled VP ceremony lands; today no such thing exists.
4. **The map is closed.** `documentLibrary` is **not** a separate key — the snapshot's `documents[]` is part of the respondent place, gated by `respondentPlace`. Per the comparison table above and ADR-0011 §Closed taxonomy ("no string-typed feature keys outside this set"), splitting list-vs-present into three keys (`respondentPlace` + `documentLibrary` + `documentPresentation`) is taxonomy bloat. Two keys cover the load-bearing distinction (substrate present vs presentation protocol present).

**Trigger fires for FW-0066.** This is the first feature row to extend the seeded `RuntimeFeatureKey` taxonomy. Per the FW-0066 row body, that promotes `getFormRuntimePolicy` to a named `FormRuntimePolicyExtractor` port. Slice 1 does NOT pull FW-0066 forward — the function-typed slot still works for the literal route synthesis pattern (`form: { features: { respondentPlace: 'optional', documentPresentation: 'optional' } }`), which is the only extractor logic slice 1 needs. Filing the FW-0066 trigger explicitly in this design + updating the FW-0066 row body in PLANNING with the FW-0056 cross-reference is the load-bearing honesty step; the port promotion can land in its own row.

## Why identity-required, not URN-keyed

J-042 frames the library as "my own documents," identity-bound by construction. Same reasoning as FW-0055 §"Why identity-required":

- No per-document URN is the natural access token. The library is keyed by subject.
- The wallet-side passkey-derived encryption envelope (ADR-0010 §"client-side encryption") resolves only when the respondent's identity is present.
- "Own your documents" means identity-bound; URN-keying would weaken the claim.

So `/documents` requires identity. Same `signInOptionsForIdentityPolicy` boot machinery `RespondentRuntime` + `ObligationsRuntime` already use. If a respondent has no identity option (zero `discover()` results AND `runtimeMode` does not permit anonymous), the page renders the same auth-required no-options state.

## Sibling-factory parameterization decision: file FW-0070, ship N=4 inline

FW-0056 lands a `/documents` route → N=4 sibling factories (`createDefault/Stub/Demo` × `App | StatusRoute | ObligationsRoute | DocumentsRoute`). FW-0068's design §"Sibling future consumers" reviewer recommended N=4 as the parameterization trigger.

**Decision: ship the four siblings now; file FW-0070 (parameterization refactor) as its own row.** Justification:

1. Conflating the FW-0056 product slice with the FW-0070 refactor doubles the review surface and tangles two distinct review lenses (product surface + cryptographic honesty vs internal composition shape).
2. The FW-0070 refactor will benefit from having all four sibling families landed and stable — the refactor's contract is "compress this concrete N=4 pattern into one parameterized factory," and that compression is cleanest when the pattern is observable in code, not interpolated from N=3.
3. The marginal cost of the fourth sibling is ~80 LoC of factory boilerplate; the refactor cost amortizes across all four at once instead of three-then-one.
4. The reviewer recommendation was "trigger to reconsider," not "must consolidate before N=4 ships."

What FW-0070 will look like (out of scope, named here for the future implementer):

```ts
// Post-FW-0070 shape (illustrative):
export function createDefaultRouteNarrowedComposition(args: {
  config: FormspecWebConfig;
  wires: { [K in 'respondentPlaceSource' | 'identityProvider' | ...]?: PortWiringPolicy };
  noop: Array<'definitionSource' | 'draftStore' | 'submitTransport' | 'identityProvider'>;
  routeCite: '/status' | '/obligations' | '/documents';
}): Composition;
```

The four siblings collapse to three callers of one parameterized helper; the parameterization sits behind the same `chooseComposition` dispatch.

**Filed as FW-0070** in this design (added to PLANNING in the FW-0056 closeout). Blocked on: nothing — pure internal refactor, freely schedulable after FW-0056 lands.

## Composition coordination — slot table for `/documents`

| Slot | Production (default) | Demo (stub) | Notes |
|---|---|---|---|
| `respondentPlaceSource` | `unavailableRespondentPlaceSource()` | `stubRespondentPlaceSource(demoSnapshot)` | Load-bearing — documents come from the snapshot. |
| `identityProvider` | real (OIDC / magic-link / anon ladder; gated on `respondentPlace = 'available'`, same pattern FW-0055 uses) | `stubIdentityProvider()` | Surface is identity-bound. |
| `statusReader` | `unavailableStatusReader()` | `stubStatusReader([...])` | Not called by `DocumentsRuntime`. Wired to demo stub so the coherence assertion stays satisfied; the surface does NOT call it (proved by `documents-runtime.test.tsx#no status fetch`). |
| `definitionSource` | `noopDefinitionSource('/documents')` | `noopDefinitionSource('/documents')` | No form to load. |
| `draftStore` | `noopDraftStore('/documents')` | `noopDraftStore('/documents')` | No form to draft. |
| `submitTransport` | `noopSubmitTransport('/documents')` | `noopSubmitTransport('/documents')` | No form to submit. |
| `notificationDelivery` | `stubNotificationDelivery()` | `stubNotificationDelivery()` | Used by the magic-link identity adapter when the production composition wires it; otherwise inert. |
| `instanceCapabilities.respondentPlace` | `'unavailable'` | `'demo-stub'` | Same as FW-0055 stance. |
| `instanceCapabilities.status` | `'unavailable'` | `'demo-stub'` | Same as today. |
| `instanceCapabilities.documentPresentation` | `'unavailable'` | `'unavailable'` | **No demo VP stack** — the substrate honestly does not exist anywhere. |
| `orgRuntimePolicy.features.documentPresentation` | `'allowed'` | `'allowed'` | The org doesn't forbid it; the instance simply cannot do it. |

## Port boundaries — what stays the same

**`RespondentPlaceSource` (no change).** Already returns `RespondentPlaceSnapshot` with `documents[]` + `presentationPolicies[]`. `DocumentsRuntime` calls `readPlace({ subjectRef })` and renders `snapshot.documents`. The conformance suite already covers `documents` shape + `presentationPolicies` shape.

**`IdentityProvider` (no change).** Reuses the same discovery + authenticate + subscribe path.

**No new port.** Per ADR-0009 §"Not in the constitutional inventory" — no port ratified before a consumer. Slice 1's "Use this document…" button is local-state intent only; when the actual VP ceremony lands (slice 2, EXT-18 + SC-4 + ADR-0116 substrate), THAT is the consumer that justifies a new `PresentationCeremony` / `VerifiablePresentationProvider` port. Filing the port today would create a competing taxonomy ahead of its time.

## Vocabulary firewall

Every visible string respects `formspec-web/CLAUDE.md` §Vocabulary firewall:

- "Your documents" / "Use this document…" / "Share with a form" — owner vocabulary, not spec jargon.
- "Sender" — not "issuer" in body copy. `RespondentIssuerRef.name` is rendered as-is (issuer-supplied display name).
- "Library" / "sidecar" / "snapshot" / "presentation policy" / "VC" / "OpenID4VP" / "HPKE" — all forbidden in body copy.
- Document-kind labels pass through `labelFromToken(document.kind)` (already in use), so `'proof-of-address'` → "Proof of address", `'signed-receipt'` → "Signed receipt".
- Date formatting via `formatDate` (already in use).
- No document URN, content URI, blob hash, or library ID in body copy. The hyperlink target may carry an identifier; visible link text does not.

## Architectural surface — minimal new code

- `src/app/DocumentsRuntime.tsx` (new) — accepts no URL params, resolves runtime profile, boots identity, calls `RespondentPlaceSource.readPlace`, renders the dashboard. Layered like `ObligationsRuntime`. ~280 LoC.
- `src/app/documents-view.tsx` (new) — shared `DocumentItem` render + group-by-kind + sort helpers extracted from `RespondentRuntime`. `RespondentPlacePanel.DocumentItem` re-imports.
- `src/app/documents-route.ts` (new) — `parseDocumentsRoute(href)` returning `{} | null`. Mirrors `obligations-route.ts`.
- `src/app/App.tsx` (modify) — extend the URL-parsing switch: if pathname `/documents`, load `DocumentsRuntime`; if `/obligations`, `ObligationsRuntime`; if `/status`, `StatusRuntime`; else `RespondentRuntime`.
- `src/app/main-helpers.ts` (modify) — extend `chooseComposition` to dispatch to `createDefaultDocumentsRouteComposition` for `/documents`.
- `src/composition/{default,stub,demo}.ts` (modify) — add `createDefault/Stub/DemoDocumentsRouteComposition` siblings.
- `src/policy/feature-keys.ts` (modify) — append `'documentPresentation'` to `RUNTIME_FEATURE_KEYS`.
- `src/policy/feature-port-map.ts` (modify) — add `documentPresentation: 'respondentPlaceSource'` entry with a code comment naming the transitional substrate + future VP port slot.
- `src/composition/types.ts` (modify) — extend `InstanceCapabilities` consumers if needed (the type comes from `policy-shapes.ts` automatically once the key is added; no per-composition type change needed beyond declaring the key in each factory).
- `tests/app/documents-runtime.test.tsx` (new) — coverage matrix mirroring FW-0055's obligations-runtime suite.
- `tests/app/documents-route.test.ts` (new) — URL parsing fixtures.
- `tests/app/documents-view.test.tsx` (new) — shared component + helpers (group + sort + parity).
- `tests/app/app-routing.test.tsx` (modify) — add `/documents` case.
- `tests/app/status-boot-narrowing.test.ts` (modify) — extend with `chooseComposition picks the documents-route factory` differential case.
- `tests/smoke/composition.test.ts` (modify) — extend the smoke matrix with the four new FW-0056 factory tests.
- `tests/policy-resolution/cases/` — add `documentPresentation` resolver cases (instance-unavailable + org-allowed + form-optional → disabled-no-instance; org-forbidden → disabled-org-forbidden).
- `tests/e2e/placeholder-a11y.spec.ts` (modify) — extend with `/documents` axe-clean visit.
- `docs/ports/respondent-place-source.md` (modify) — add `DocumentsRuntime` to §Consumers.
- `docs/policy/runtime-feature-resolution.md` (modify) — add `documentPresentation` to the worked-key examples; document that it currently maps to the same port as `respondentPlace` as a transitional substrate.
- `PLANNING.md` (modify) — FW-0056 closes as `live (slice 1)` with named release gaps; FW-0070 opens (parameterized route-narrowed composition factory); update FW-0066 row to cite FW-0056 as its trigger; FW-0069 row body unchanged but conceptually FW-0070 is the sibling refactor row.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` (footer append, one bullet) — `/documents` route consumes the `respondentPlace` + new `documentPresentation` keys via synthetic optional form policy.

## Non-goals (explicit, to bound scope)

- **No router dependency.** Four routes is still manual `parseXxxRoute` switching. Router lands when soft-nav becomes a respondent need.
- **No client-side soft navigation between `/`, `/status`, `/obligations`, `/documents`.** Browser back/forward = full reload.
- **No new port.** Existing `RespondentPlaceSource` carries the document data; the VP port is post-MVP.
- **No demo VP-ceremony stub.** Faking selective presentation would be the exact kind of dishonest stub ADR-0011 §Rationale #1 forbids. The selection action shows the deferred copy in every mode until real VP ships.
- **No JSON Schema for `/documents` URL params.** The URL has none; the route IS the request.
- **No URN-keyed accountless variant.** See §"Why identity-required."
- **No write surface in slice 1.** No upload, no delete, no edit. Reads only.
- **No FW-0070 parameterization in this slice.** Filed as its own row.

## Test coverage matrix

| Behaviour | Test |
|---|---|
| `/documents` renders one section per document kind in the snapshot | `documents-runtime.test.tsx#renders kind sections` |
| Sort within section: `capturedAt` desc; undefined last; ties broken by displayName | `documents-runtime.test.tsx#sort order` |
| "N document(s) across K kind(s)" header derived from unique-kind count | `documents-runtime.test.tsx#cross-kind header` |
| Deferred-capability copy fixture-pinned | `documents-runtime.test.tsx#deferred capability copy` |
| Empty documents renders "You have not saved any documents to this site yet." | `documents-runtime.test.tsx#empty state` |
| `respondentPlace` instance-unavailable → "Your documents are not available. This site does not provide a document library." | `documents-runtime.test.tsx#instance-unavailable` |
| `respondentPlace` org-forbidden → "Your documents are not available. This sender does not provide a document library here." | `documents-runtime.test.tsx#org-forbidden` |
| Auth required when identity discovers options and no boot claim | `documents-runtime.test.tsx#auth required` |
| "Use this document…" action opens a disclosure showing the deferred-presentation copy; no port call fires | `documents-runtime.test.tsx#selection action` |
| Document with matching `presentationPolicies[]` entry: disclosure lists scope (selected-documents / metadata-only / all-documents) and recipient sender name (vocabulary-firewalled) | `documents-runtime.test.tsx#selection lists policy scope` |
| Document with NO matching policy: disclosure renders "Selective presentation is not yet available on this site." copy only | `documents-runtime.test.tsx#selection without policy` |
| `DocumentsRuntime` does NOT invoke `StatusReader.readStatus()` | `documents-runtime.test.tsx#no status fetch` |
| `DocumentsRuntime` does NOT invoke `DraftStore` / `SubmitTransport` / `DefinitionSource` | `documents-runtime.test.tsx#no form ports` |
| Vocabulary firewall: no `respondent-place` / `library` / `sidecar` / `snapshot` / `subjectRef` / `presentationPolicy` / `openid4vp` / `vc` / `hpke` in rendered DOM | `documents-runtime.test.tsx#vocabulary firewall` |
| DOM parity: shared `DocumentItem` produces the same `<li>` outerHTML in both `DocumentsRuntime` and isolated render | `documents-runtime.test.tsx#DOM parity` |
| URL `/documents` activates `DocumentsRuntime`; `/obligations` keeps `ObligationsRuntime`; `/status` keeps `StatusRuntime`; `/` keeps `RespondentRuntime` | `tests/app/app-routing.test.tsx#documents case` |
| `chooseComposition` picks the documents-route factory for `/documents` | `tests/app/status-boot-narrowing.test.ts#documents-route` |
| `/documents` axe-clean in demo composition | `tests/e2e/placeholder-a11y.spec.ts#documents axe-clean` |
| Parser: `/documents` matches; `/documents/foo` does not; `/documents?x=y` matches and ignores params | `tests/app/documents-route.test.ts` |
| Feature-key registry: `documentPresentation` is in `RUNTIME_FEATURE_KEYS` (append-only) | `src/policy/feature-keys.test.ts` |
| Composition coherence: all four FW-0056 factories pass `assertCompositionCoherence` | `tests/smoke/composition.test.ts#FW-0056 factory tests` |
| Resolver: `documentPresentation` disabled-no-instance + disabled-org-forbidden cases | `tests/policy-resolution/cases/document-presentation-*.ts` |

## Risks and what catches them

- **Risk:** the "Use this document…" button reads as a working share action even with the deferred copy, and a respondent expects something to happen. **Catch:** the disclosure block's first sentence is the literal "Selective presentation is not yet available on this site. When it lands, this button will share the document with the chosen scope." The button text itself includes the trailing ellipsis as the "this opens information, doesn't do the action" convention; the disclosure is closed by default; the copy is fixture-pinned to prevent edits that drop the "not yet" honesty.
- **Risk:** the new `documentPresentation` key + transitional port-slot reuse (`'respondentPlaceSource'`) confuses the coherence assertion. **Catch:** the production composition declares `documentPresentation: 'unavailable'` paired with the same `unavailableRespondentPlaceSource()` sentinel — the assertion sees the unavailable marker + the unavailable declaration and passes. Adopters who wire a real wallet but no VP stack must declare `documentPresentation: 'unavailable'` (with a place adapter that is unmarked-available); the assertion currently REQUIRES the slot to carry an unavailable marker if the declaration is unavailable, which is wrong for this transitional case. **Mitigation:** the slot mapping is documented as transitional in `feature-port-map.ts` with a code comment naming FW-0066/SC-4 as the cleanup; the demo + production compositions both keep `documentPresentation: 'unavailable'` paired with whatever sentinel they hold for `respondentPlace` (matching), so the assertion stays happy. The first real adopter who hits the wallet-but-no-VP scenario WILL break the assertion — and that breakage is the correct trigger for promoting the VP port and decoupling the slot map. Track explicitly in the FW-0056 closeout note.
- **Risk:** the per-kind sectioning reads as cleaner than it is when the snapshot has many `'other'`-kind documents. **Catch:** `'other'` renders as its own section labelled "Other"; the sort order within `'other'` follows the same `capturedAt` desc rule. Not pretty, but honest.
- **Risk:** the shared `DocumentItem` extraction breaks the in-form `RespondentPlacePanel` "Files" column rendering. **Catch:** the DOM-parity test (`documents-runtime.test.tsx#DOM parity`) mirrors FW-0055's pattern — both consumers must render identical `<li>` HTML; the in-form panel's existing tests stay green.
- **Risk:** identity boot fires on `/documents` even when the deployment has no wallet adapter, wasting OIDC/anonymous-session machinery on a page that will render "Your documents are not available." **Catch:** the same MED-4 gating FW-0055 uses — the production factory checks `instanceCapabilities.respondentPlace === 'available'` before constructing the real identity provider; otherwise wires `noopIdentityProvider('/documents')`. The page reaches the disabled-cause branch before any identity port is touched.

## What FW-0056 ships and what stays open

**Ships:**
- Standalone `/documents` route with a respondent-owned dashboard.
- Identity-bound, no URN-keyed variant.
- Per-kind section grouping + capturedAt-desc sort + cross-kind header.
- Selection action that captures intent + lists matching policy scope + renders deferred-presentation copy honestly.
- Honest gap copy naming every deferred capability verbatim.
- New `documentPresentation` runtime-feature key (first extension of the closed taxonomy).
- Composition coordination with FW-0068's narrowed-route family (fourth sibling factory).
- Test coverage spanning policy-gate, identity-boot, sort, vocabulary, selection-action, route selection, accessibility, DOM parity.
- FW-0066 trigger explicitly fired (cross-referenced in PLANNING row + design doc).
- FW-0070 parameterization row filed.

**Stays open (slice 2 / EXT-18 / SC-4 / FW-0070):**
- Actual selective-presentation cryptography (SD-JWT, BBS+ if profile-gated per ADR-0116).
- W3C VC Data Model 2.0 wire shape.
- OpenID4VP ceremony surface.
- Passkey-derived HPKE wallet encryption (EXT-18).
- Verifiable-presentation port ratification + adapter conformance (SC-4 + a follow-on web ADR).
- Per-presentation revocation surface.
- Derived-claim disclosure ("18+" from birthdate).
- Retention horizon controls.
- Export ceremony (download an encrypted portable JSON of the wallet).
- Upload / capture / save-to-library (J-040 → FW-0033).
- Cross-issuer fan-out (XS-2 sibling concern).
- Sibling-factory parameterization (FW-0070).
- `FormRuntimePolicyExtractor` port promotion (FW-0066 — triggered by this row).

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline
- [web ADR-0010](../adr/0010-respondent-place-trust-model.md) — `RespondentPlaceSource` port, trust model
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `respondentPlace` + new `documentPresentation` capability keys, non-form-surface synthesis addendum
- [FW-0039 design](2026-05-23-fw-0039-post-submit-status-surface-design.md) — standalone-route + honest-deferral-copy precedent
- [FW-0055 design](2026-05-23-fw-0055-respondent-obligations-stream-design.md) — direct precedent (same shape, sibling concern)
- [FW-0068 design](2026-05-23-fw-0068-route-aware-composition-narrowing-design.md) — composition narrowing pattern + N=4 trigger
- [FW-0056 implementation plan](../plans/2026-05-23-fw-0056-document-library.md) — task-by-task execution
- [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](2026-05-22-upstream-extension-queue.md) — EXT-18 (HPKE wrapper), SC-3 (Respondent Library sidecar, landed), SC-4 (Verifiable Presentation Profile)
- stack-root [ADR-0116](../../../thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md) — selective-disclosure substrate
