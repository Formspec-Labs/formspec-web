# FW-0057 — Cross-issuer respondent history (design)

**Date:** 2026-05-24
**Row:** [FW-0057](../../PLANNING.md#fw-0057--respondent-side-history-across-every-issuer)
**Journey:** [J-043](../../JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0010 (respondent-place trust model), web ADR-0011 (runtime feature resolution)
**Precedent (surface shape):** [FW-0056 slice-1 design](2026-05-23-fw-0056-document-library-design.md) — fourth standalone-surface + honest-deferral-copy pattern. [FW-0055 slice-1 design](2026-05-23-fw-0055-respondent-obligations-stream-design.md) — first cross-sender header pattern. [FW-0033 slice-1 design](2026-05-23-fw-0033-file-upload-design.md) — new-port + conformance + composition slot pattern.
**Authority:** Introduces a **new** `RespondentHistorySource` port per web ADR-0009 (port what's adopter-shaped — cross-issuer aggregation is fundamentally different from single-deployment respondent-place storage; multi-issuer auth via XS-2 token bag is the adopter concern, not formspec-web's). Adds **one** new runtime-feature key — `crossIssuerHistory` — to the closed `RuntimeFeatureKey` taxonomy per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) §"Feature Ownership Table" ("Cross-issuer history" already enumerated; this row materializes it). Adds a fifth `*_ROUTE_NARROWING` descriptor for `/history` per FW-0070 parameterized factory (no new sibling-factory family).

## What FW-0057 actually needs (vs the row prose)

The PLANNING row's "Progress" claim is misleading: today `RespondentRuntime` renders prior submissions from `RespondentPlaceSource` inside the form-fill flow, which proves the substrate is plumbed for the **single-issuer single-deployment** case — but J-043 is explicitly the **cross-issuer backward-looking** view ("every form I've ever submitted, started, or signed" across senders). The same four gaps FW-0055 / FW-0056 fixed for forward obligations and documents apply here:

1. **No standalone history surface.** The "my paperwork life is mine to see" promise (J-043 §Feel) requires a respondent-owned dashboard reachable without filling out a form. Today the submissions list is reachable only mid-form-fill via `RespondentPlacePanel`. Same dishonesty FW-0039 fixed for `/status`, FW-0055 for `/obligations`, FW-0056 for `/documents`.
2. **No discriminator across draft / submission / signed-record.** J-043 names three entry kinds — drafts, submissions, signed records — with distinct lifecycle semantics ("drafts can be deleted, submissions cannot, and the surface is precise about which is which"). Today's snapshot has only `submissions[]`. Drafts live in `DraftStore` per-deployment; signed records require receipt-chain integration (FW-0034 territory). The history shape needs to model the union, not just pull from one source.
3. **No cross-issuer aggregation shape.** `RespondentPlaceSource.readPlace` returns a **single** snapshot from a **single** wallet/storage adapter. J-043's load-bearing claim is cross-issuer — multiple senders' history aggregated into one timeline. Per web ADR-0010 + stack-root ADR-0068 D-1 + D-3, cross-issuer is structurally client-side (server-side aggregation is forbidden); the wallet adapter is where issuer fan-out happens, but the **port shape** that models multi-issuer aggregation is missing. Bolting it onto `RespondentPlaceSource` would conflate single-deployment storage with multi-issuer auth (XS-2 token bag — a strictly larger surface that gates the production adapter, not the substrate).
4. **No honest-deferral copy for the cross-issuer half.** Slice 1 cannot ship real cross-issuer aggregation — XS-2 is unfiled-upstream and the production wallet adapter is post-MVP. The surface must honestly name what's deferred: cross-issuer fan-out, draft inclusion, signed-record detail, search/filter, export ceremony, deletion semantics.

Each gap is independently load-bearing.

## Decision: ship slice 1 (new port + standalone surface + unified history shape + honest copy); defer XS-2 + production adapters + advanced features

Slice 1 lands:

- A new **`RespondentHistorySource` port** with one operation: `readHistory(query) → Promise<HistorySnapshot>` where `HistorySnapshot` carries `entries: HistoryEntry[]` and `HistoryEntry` is a discriminated union over `{ kind: 'draft' | 'submission' | 'signed-record' }`. Each entry carries the issuer it came from (so the surface can show "from N senders"), a timestamp (so the timeline is sortable), a display title, and an optional cross-route ref (status URN, receipt URI, document refs). See §"Port shape" below for the full TS shape.
- A new **conformance suite** (`defineRespondentHistorySourceConformance`) covering: round-trip a sample snapshot through `roundTripJson`; closed-set kind taxonomy enforcement; per-entry shape minimums; timestamp present per entry; issuer-ref shape; non-array `entries` rejection; empty-snapshot no-throw.
- A new **stub adapter** (`stubRespondentHistorySource`) carrying the `DEMO_STUB_ADAPTER` marker; returns a fixture snapshot with 4 entries across 2 fake issuers (1 draft, 2 submissions, 1 signed-record) so the demo surface shows the cross-issuer cross-kind story honestly.
- A new **unavailable sentinel** (`unavailableRespondentHistorySource`) carrying the `UNAVAILABLE_ADAPTER` marker; `readHistory` throws with a plain-language adopter-facing message.
- A new **`crossIssuerHistory` runtime-feature key** appended to the closed `RUNTIME_FEATURE_KEYS` tuple — fifth extension after `respondentPlace`, `status`, `documentPresentation`, `fileUpload`. Mapped 1:1 to a new `respondentHistorySource` Composition slot in `FEATURE_PORT_MAP` — no transitional slot-sharing (the port IS the substrate; XS-2 lives at the adapter level, not the port).
- A new **`/history` route** parsed by `parseHistoryRoute(href)` returning `{} | null`. Identity-bound (J-043 "my own history" is identity-bound by construction; same reasoning as FW-0055 / FW-0056). Wired into `App.tsx` and `chooseComposition` via a new `HISTORY_ROUTE_NARROWING` descriptor — fifth narrowed route, **no new sibling-factory family** (FW-0070 parameterized factory handles it via one new dispatch arm).
- A new **`HistoryRuntime.tsx`** that resolves the runtime profile, boots identity, calls `RespondentHistorySource.readHistory({ subjectRef })`, and renders entries grouped by kind in a chronological timeline. Mirrors `DocumentsRuntime` / `ObligationsRuntime` layering.
- A new **`history-view.tsx`** shared module exporting `HistoryEntryItem`, `groupAndSortHistory`, `uniqueIssuerCount`, and the closed `HISTORY_KIND_ORDER` taxonomy — extracted as a sibling of `documents-view.tsx` / `obligations-view.tsx`. Slice 1 has no in-form consumer, but the extraction discipline matches the precedent and gives FW-0034 (lifecycle actions on past records) a stable surface.
- **History framing.** Page header reads "Your history" (owner vocabulary). Summary strip shows `N record(s) across M sender(s)` derived from the unique-issuer count. Records are grouped under per-kind section headings using `labelFromToken(entry.kind)` — "Drafts", "Submissions", "Signed records". Within each section, sort by `timestamp` descending (newest first); ties break by entry id. Pin the deterministic ordering in the test fixture.
- **Honest gap copy.** Below the page header — not a footnote — a labelled gap row reads: "Search, filters, calendar export, cross-issuer aggregation, draft inclusion, signed-record detail, and deletion are not yet available on this site." Literal copy fixture-pinned. Same pattern FW-0039 + FW-0055 + FW-0056 + FW-0033 used.
- **Disabled-cause copy.** When `crossIssuerHistory` is disabled at the resolved profile:
  - `optional-no-instance` (production default — no wallet/history adapter wired) → "Your history is not available. This site does not provide a history view."
  - `org-forbidden` → "Your history is not available. This sender does not provide a history view here."
  - `form-forbidden` → not applicable on this route (no form); typed-disabled handler covers it conservatively with the org-forbidden copy.
  - `not-requested` → unreachable because `HistoryRuntime` synthesizes `form: { features: { crossIssuerHistory: 'optional' } }` at the route boundary per ADR-0011 §"Non-form surface synthesis" addendum.
- **Empty-state copy.** When the profile enables `crossIssuerHistory` and the adapter returns an empty `entries[]` → "You have no records to show yet."
- **Cross-route hyperlinks.** When a `submission` or `signed-record` entry carries `applicantStatusRef` resolving to a WOS URN, the entry renders a "Track this application" hyperlink to `/status?case={urn}` (encoded). When an entry carries `documentRefs[]`, the entry shows a small "Documents (N)" line that links to `/documents` (no per-document deep-link in slice 1 — `/documents` doesn't support filter URLs). Unresolvable refs suppress the link (never fabricate a URN).

Slice 1 does **not** ship:

- **Cross-issuer aggregation (the load-bearing half of J-043).** The slice-1 adapter aggregates from whatever the wallet returns — which today is a single issuer's view. The PRODUCTION cross-issuer adapter requires the XS-2 token bag (multi-issuer authorization handle storage per stack-root ADR-0068 D-1 + D-3) to drive parallel fan-out across N issuer endpoints. XS-2 is filed upstream (`thoughts/specs/2026-05-22-upstream-extension-queue.md`); slice 1 ships the port shape, conformance suite, and stub data that aggregates across two fake issuers so the cross-sender framing is honest in demo and the production wiring is post-MVP-clean.
- **Search / filter / faceted sort.** The dashboard renders a chronological grouped-by-kind list. Search by sender, filter by status, faceted date ranges are filed as follow-on rows.
- **Calendar / iCal export.** Deferred — adopter-side preference.
- **Receipt-chain detail view.** Clicking a `signed-record` entry opens a disclosure with the timestamp + issuer + the receipt URI, but does NOT render the receipt body or the verifier path — that's FW-0009 / FW-0010 territory (the verifier surface). The deferred copy names this gap.
- **Draft hydration (resume editing).** A `draft` entry today shows up as a list item with a "Last edited …" timestamp; clicking it does NOT resume the form. Draft resume requires the cross-deployment draft hydration substrate (EXT-26 / EXT-27 — upstream-queued). The deferred copy names this gap.
- **Deletion semantics.** J-043's "drafts can be deleted, submissions cannot" promise needs the lifecycle ports (FW-0034 record-lifecycle, FW-0043 delete-draft + erase-receipt). Out of slice 1; the deferred copy names "deletion."
- **Export ceremony.** A "download my entire history as a portable JSON" surface needs the wallet export envelope (ADR-0010 §"export ceremony"); slice 1 shows the cross-sender count but does not export.
- **A different shape of `HistoryEntry` for each kind.** Slice 1's discriminator carries the minimum fields every kind needs (`id`, `kind`, `issuer`, `timestamp`, `title`, optional cross-refs). Per-kind enriched fields (signed-record's `verifiedAt` / `signerIdentityRef`, draft's `lastEditedAt` / `definitionVersion`, submission's `statusEvent`) are deferred — adding them now would couple slice 1 to FW-0034 / FW-0009 lifecycle work that hasn't shipped.
- **Cross-deployment history (across formspec-web instances on different domains).** That requires the wallet to be the source of truth across deployments — slice 1's stub stays within one demo composition.

## Decision on port shape: NEW `RespondentHistorySource` port, NOT extending `RespondentPlaceSource`

Alternatives considered:

| Option | Shape | Why rejected/accepted |
|---|---|---|
| **(a) New `RespondentHistorySource` port** | One method: `readHistory(query) → HistorySnapshot { entries[] }`. | **ACCEPTED.** Single-responsibility port (web ADR-0009 §"port what's adopter-shaped"). Cross-issuer aggregation has fundamentally different adopter requirements (multi-issuer auth via XS-2 token bag) than single-deployment respondent-place storage. Lets the production adapter ship a different concurrency / caching / fan-out strategy than the wallet read; lets the demo stub return synthesized cross-issuer data without inventing a "fake multi-issuer place." Matches the FW-0033 precedent of one port per adopter-shaped concern. |
| **(b) Extend `RespondentPlaceSource` with `readCrossIssuerHistory`** | Two methods on one port: `readPlace` for the single-issuer wallet, `readCrossIssuerHistory` for the fan-out. | Rejected — couples two adopter concerns (wallet substrate + multi-issuer auth + history schema). An adopter wiring a real production wallet but no cross-issuer story (XS-2 not yet shipped) would need to implement the cross-issuer method as a no-op or sentinel anyway, defeating the consolidation. Per project no-shims discipline, the right shape is the smaller port with a separate slot. |
| **(c) Reuse `RespondentPlaceSnapshot.submissions[]`** | No new port; `HistoryRuntime` reads `respondentPlaceSource.readPlace().submissions`. | Rejected — fails the J-043 cross-issuer + cross-kind framing. The snapshot is single-issuer by ADR-0010; adding drafts / signed-records to the existing snapshot bloats the sidecar schema; the surface would inherit `respondentPlace`'s capability key instead of getting its own. |

**Decision: (a).** Justified above; matches existing port discipline.

## Decision on runtime feature key: add `crossIssuerHistory` — fifth taxonomy extension

ADR-0011 §"Feature Ownership Table" already enumerates "Cross-issuer history" (instance capability: "durable respondent-place storage"; org policy: "retention/export rules"; form policy: "submission contributes records"). The decision materializes the taxonomy entry.

| Concern | Gated by | Slice 1 wiring |
|---|---|---|
| Reading prior records across issuers | `crossIssuerHistory` | New key. Production: `unavailable` (no production adapter; XS-2 not shipped). Demo: `demo-stub` (in-memory cross-issuer fixture). |

Implications:

1. `src/policy/feature-keys.ts`: extend `RUNTIME_FEATURE_KEYS = ['respondentPlace', 'status', 'documentPresentation', 'fileUpload', 'crossIssuerHistory'] as const` (append-only ordering per the comment).
2. `src/policy/feature-port-map.ts`: add `crossIssuerHistory: 'respondentHistorySource'` — 1:1 mapping, no transitional slot-sharing (the FW-0056 transitional pattern is appropriate when a feature's substrate predates its dedicated port; here the port IS the substrate and ships in the same slice as the key).
3. `src/composition/types.ts`: add `respondentHistorySource: RespondentHistorySource` to `Composition`.
4. **Default compositions:** `crossIssuerHistory: 'unavailable'` in production (no production adapter wired); `crossIssuerHistory: 'demo-stub'` in demo/stub (in-memory cross-issuer fixture). Coherence assertion handles the new key/port pair automatically through the existing `RUNTIME_FEATURE_KEYS` loop.
5. **Narrowed-route compositions:** uniformly wire `unavailableRespondentHistorySource()` + declare `crossIssuerHistory: 'unavailable'` on the **status / obligations / documents** routes (none of those surfaces reads history). The new `/history` route is the one consumer; it declares `crossIssuerHistory: 'demo-stub'` in demo mode and reads the stub adapter; in production mode it declares `'unavailable'` and the page renders the disabled-cause copy honestly.

## Decision on composition coordination: fifth `RouteNarrowing` descriptor, no new sibling family

FW-0057 lands a `/history` route → fifth narrowed route. Per FW-0070's parameterized factory, the addition is:

- One new `HISTORY_ROUTE_NARROWING` descriptor in `src/app/history-route.ts` (`routeCite: '/history'`, `consumesRespondentPlace: false`, `consumesStatus: false`, `identityBound: true`, plus a NEW flag `consumesHistory: true` to drive the `/history` route's narrowing — see §"Route descriptor extension" below).
- One new dispatch arm in `chooseComposition` calling `createRouteNarrowedComposition({ mode, config, route: HISTORY_ROUTE_NARROWING })`.

NO new `createDefault/Stub/DemoHistoryRouteComposition` siblings — that's the deliberate consolidation FW-0070 just landed (test-matrix grows automatically with assertion breadth per descriptor instead of with descriptor count).

### Route descriptor extension: `consumesHistory` flag

Today's `RouteNarrowing` carries `consumesRespondentPlace` / `consumesStatus` / `identityBound`. The history-route's port wiring needs to be opt-in (just like the status / place adapters): on `/history`, the production factory wires `unavailableRespondentHistorySource()` + declares `crossIssuerHistory: 'unavailable'`; in demo mode, wires `stubRespondentHistorySource(demoHistorySnapshot)` + declares `'demo-stub'`. Every OTHER narrowed route (`/status`, `/obligations`, `/documents`) keeps `crossIssuerHistory: 'unavailable'` + wires the sentinel — they don't consume history.

Adding a `consumesHistory: boolean` flag to `RouteNarrowing` (analogous to `consumesStatus`) drives this cleanly:

- Production factory: if `consumesHistory && history capability is 'available'`, wire real adapter (today: never; the production wallet has no history adapter yet); else wire the sentinel.
- Demo factory: if `consumesHistory`, wire the stub + declare `'demo-stub'`; else wire the sentinel + declare `'unavailable'`.

Same shape as `consumesStatus` / `consumesRespondentPlace` flags. No new sibling-factory family; the descriptor's flags carry the wiring decision.

## Why identity-required, not URN-keyed

J-043 frames history as "my own paperwork," identity-bound by construction. Same reasoning as FW-0055 §"Why identity-required" and FW-0056 §"Why identity-required":

- No per-record URN is the natural access token. The history is keyed by subject.
- The cross-issuer fan-out (post-XS-2) requires the respondent's multi-issuer token bag, which resolves only when the respondent's identity is present.
- "Own your history" means identity-bound; URN-keying would weaken the claim.

So `/history` requires identity. Same `signInOptionsForIdentityPolicy` boot machinery `RespondentRuntime` + `ObligationsRuntime` + `DocumentsRuntime` already use. MED-4 short-circuit applies: production factory wires `noopIdentityProvider('/history')` until the `crossIssuerHistory` capability moves to `'available'`, mirroring the FW-0055 / FW-0056 gating pattern (today's posture is always `'unavailable'` in production, so identity-bound routes short-circuit to noop and never construct OIDC / magic-link / anonymous-session machinery for a surface that will render "not available" copy).

## Composition coordination — slot table for `/history`

| Slot | Production (default) | Demo (stub) | Notes |
|---|---|---|---|
| `respondentHistorySource` | `unavailableRespondentHistorySource()` | `stubRespondentHistorySource(demoHistorySnapshot)` | Load-bearing — entries come from this adapter. |
| `respondentPlaceSource` | `unavailableRespondentPlaceSource()` | `stubRespondentPlaceSource(demoRespondentPlaceSnapshot())` | Not called by `HistoryRuntime`. Wired to demo stub so the coherence assertion stays satisfied. |
| `statusReader` | `unavailableStatusReader()` | `stubStatusReader([...])` | Not called by `HistoryRuntime`. Same wiring posture as the other narrowed routes. |
| `attachmentStore` | `unavailableAttachmentStore()` | `unavailableAttachmentStore()` | Narrowed routes do not accept uploads. |
| `identityProvider` | `noopIdentityProvider('/history')` until `crossIssuerHistory === 'available'` (MED-4 pattern) | `stubIdentityProvider()` | Surface is identity-bound. |
| `definitionSource` | `noopDefinitionSource('/history')` | `noopDefinitionSource('/history')` | No form to load. |
| `draftStore` | `noopDraftStore('/history')` | `noopDraftStore('/history')` | No form to draft. |
| `submitTransport` | `noopSubmitTransport('/history')` | `noopSubmitTransport('/history')` | No form to submit. |
| `notificationDelivery` | `stubNotificationDelivery()` | `stubNotificationDelivery()` | Used by the magic-link identity adapter when wired; otherwise inert. |
| `formRuntimePolicyExtractor` | `new EmptyFormRuntimePolicyExtractor()` | `new EmptyFormRuntimePolicyExtractor()` | Narrowed routes synthesize their request literally at the boundary per FW-0066. |
| `instanceCapabilities.crossIssuerHistory` | `'unavailable'` | `'demo-stub'` | The load-bearing toggle. |
| `instanceCapabilities.{respondentPlace,status,documentPresentation,fileUpload}` | matches the FW-0070 default-narrowed posture | matches FW-0070 demo posture | Unchanged. |
| `orgRuntimePolicy.features.crossIssuerHistory` | `'allowed'` | `'allowed'` | The org doesn't forbid it; the instance simply cannot do it in production today. |

## Port boundaries — `RespondentHistorySource` shape

```ts
// src/ports/respondent-history-source.ts
export type HistoryEntryKind = 'draft' | 'submission' | 'signed-record';

export interface HistoryIssuerRef {
  name: string;
  url?: string;
  identifier?: string;
}

export interface HistoryEntry {
  id: string;
  kind: HistoryEntryKind;
  issuer: HistoryIssuerRef;
  /** ISO-8601 timestamp. For drafts, last edited; for submissions, submitted; for signed-records, signed. */
  timestamp: string;
  /** Short display title (e.g., "Benefits intake", "Q2 tax filing draft"). Issuer-supplied display string. */
  title: string;
  /** Optional applicant-status URN (only set when the entry's case is reachable from the WOS applicant API). */
  applicantStatusRef?: string;
  /** Optional opaque receipt URI (only set for signed-record entries with a published receipt). */
  receiptRef?: string;
  /** Optional doc refs from the respondent's document library. */
  documentRefs?: readonly string[];
  /** Optional form definition reference. */
  definitionRef?: { url: string; version?: string };
}

export interface HistorySnapshot {
  $formspecRespondentHistory: '1.0';
  /** Always 'client-wallet' in slice 1; mirrors the RespondentPlaceSnapshot aggregation-mode constraint. */
  aggregationMode: 'client-wallet';
  /** The respondent's subject ref the snapshot was assembled for. */
  subjectRef: string;
  entries: readonly HistoryEntry[];
}

export interface HistoryQuery {
  subjectRef?: string;
  /** Optional list of issuer URLs to scope the fan-out (post-XS-2). Slice 1 stubs ignore this. */
  issuerUrls?: readonly string[];
}

export interface RespondentHistorySource {
  readHistory(query: HistoryQuery): Promise<HistorySnapshot>;
}
```

Single-method port; matches the established pattern for `RespondentPlaceSource.readPlace` and `StatusReader.readStatus`. Sync-iter contract via `readonly` for `entries` and `documentRefs` ensures the consumer can't mutate the snapshot.

## Vocabulary firewall

Every visible string respects `formspec-web/CLAUDE.md` §Vocabulary firewall:

- "Your history" / "Your records" / "Your past submissions" — owner vocabulary, not spec jargon.
- "Sender" — not "issuer" in body copy. `HistoryIssuerRef.name` is rendered as-is.
- "Draft" / "Submission" / "Signed record" — owner taxonomy, not internal kind enums (rendered via `labelFromToken(entry.kind)` which gives "Draft" / "Submission" / "Signed Record").
- Forbidden in body copy: `history-snapshot`, `respondentHistory`, `RespondentHistory`, `HistorySnapshot`, `tokenBag`, `issuer-ref`, `aggregationMode`, `subjectRef`, `cross-issuer`, `crossIssuer`, `XS-2`, `OpenID4VP`, `HPKE`, `W3C`, `VC`, `presentationPolicy`, `respondent-place`, `respondentPlace`, `library`, `sidecar`, `snapshot`.
- Date formatting via `formatDate` (already in use).
- No record URN, receipt URI, applicant-status URN, or document URN in body copy. Hyperlink targets carry identifiers; visible link text does not.

## Architectural surface — minimal new code

- `src/ports/respondent-history-source.ts` (new) — port interface + `HistorySnapshot` / `HistoryEntry` / `HistoryIssuerRef` / `HistoryEntryKind` / `HistoryQuery` types.
- `src/ports/index.ts` (modify) — re-export the new port + types.
- `src/adapters/stub/respondent-history-source.ts` (new) — `stubRespondentHistorySource(snapshot)` factory; carries `DEMO_STUB_ADAPTER` marker.
- `src/adapters/unavailable/respondent-history-source.ts` (new) — `unavailableRespondentHistorySource()` factory; carries `UNAVAILABLE_ADAPTER` marker; throws.
- `src/adapter-conformance/conformance.ts` (modify) — add `defineRespondentHistorySourceConformance` + `RespondentHistorySourceConformanceSubject` type.
- `src/adapter-conformance/index.ts` (modify) — re-export.
- `src/adapter-conformance/assertions.ts` (modify) — add `isHistorySnapshot` type-guard.
- `src/adapter-conformance/fixtures.ts` (modify) — add `sampleHistorySnapshot`.
- `tests/adapter-conformance/_framework/conformance.ts` (modify) — re-export the new define.
- `tests/adapter-conformance/respondent-history-source/conformance.test.ts` (new) — invokes the conformance suite against the stub adapter.
- `scripts/check-conformance-coverage.mjs` (modify) — add the new port suite + stub + unavailable sentinel registrations.
- `src/demo/respondent-history.ts` (new) — `demoHistorySnapshot()` returning a 4-entry cross-issuer fixture.
- `src/policy/feature-keys.ts` (modify) — append `'crossIssuerHistory'`.
- `src/policy/feature-port-map.ts` (modify) — add `crossIssuerHistory: 'respondentHistorySource'`.
- `src/composition/types.ts` (modify) — add `respondentHistorySource: RespondentHistorySource` slot.
- `src/composition/route-narrowing.ts` (modify) — add `consumesHistory: boolean` to `RouteNarrowing`; extend production + demo factories to wire the slot per the flag + capability; extend `instanceCapabilities` / `orgRuntimePolicy.features` declarations.
- `src/composition/default.ts` (modify) — declare `crossIssuerHistory: 'unavailable'` + wire `unavailableRespondentHistorySource()` in the full-app production composition; update org-policy features.
- `src/composition/stub.ts` (modify) — declare `crossIssuerHistory: 'demo-stub'` + wire `stubRespondentHistorySource(demoHistorySnapshot())` in the full-app stub composition; update org-policy features.
- `src/composition/demo.ts` (no change beyond the delegation to stub — demo delegates one-line).
- `src/app/history-route.ts` (new) — `parseHistoryRoute(href)` + `HISTORY_ROUTE_NARROWING` descriptor.
- `src/app/HistoryRuntime.tsx` (new) — standalone history dashboard.
- `src/app/history-view.tsx` (new) — shared `HistoryEntryItem` + `groupAndSortHistory` + `uniqueIssuerCount` + `HISTORY_KIND_ORDER`.
- `src/app/main-helpers.ts` (modify) — extend `chooseComposition` for `/history`.
- `src/app/App.tsx` (modify) — add `/history` branch + extend `RuntimeState`.
- `tests/adapters/respondent-history-source-stub.test.ts` (new) — stub-specific behavior (cross-issuer count, kind discriminator).
- `tests/adapters/respondent-history-source-unavailable.test.ts` (new) — sentinel-specific behavior.
- `tests/adapters/unavailable-sentinel.test.ts` (modify) — extend with the new sentinel.
- `tests/adapters/demo-stub-marker.test.ts` (modify) — extend with the new stub.
- `tests/app/history-route.test.ts` (new) — URL parsing fixtures.
- `tests/app/history-view.test.tsx` (new) — shared module coverage.
- `tests/app/history-runtime.test.tsx` (new) — component coverage matrix.
- `tests/app/app-routing.test.tsx` (modify) — add `/history` case.
- `tests/app/status-boot-narrowing.test.ts` (modify) — extend with `chooseComposition` case for `/history`.
- `tests/policy-resolution/cases/cross-issuer-history-disabled-no-instance.json` (new) — resolver fixture.
- `tests/policy-resolution/cases/cross-issuer-history-disabled-org-forbidden.json` (new) — resolver fixture.
- `tests/policy-resolution/cases/cross-issuer-history-demo-stub-satisfies-optional.json` (new) — resolver fixture for the happy demo path.
- `tests/policy-resolution/cases/*.json` (modify all 13+ pre-existing cases) — backfill the new `crossIssuerHistory` key in `instance` / `org` blocks per the append-only key contract.
- `tests/profiles/composition-coherence.test.ts` (modify) — descriptor matrix automatically covers the new descriptor; assertion-breadth additions for the new slot.
- `tests/composition/route-narrowing.test.ts` (modify) — descriptor coverage for `HISTORY_ROUTE_NARROWING` + the new `consumesHistory` flag.
- `tests/smoke/composition.test.ts` (modify) — descriptor matrix picks up the fifth descriptor automatically; one explicit smoke assertion for the new slot in the full-app factories.
- `docs/ports/respondent-history-source.md` (new) — adopter doc per the other-port template.
- `docs/policy/runtime-feature-resolution.md` (modify) — add `crossIssuerHistory` to the worked-key examples + `/history` route worked example.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` (footer append, one bullet) — `/history` route consumes the new `crossIssuerHistory` key via synthetic optional form policy.
- `PLANNING.md` (modify) — FW-0057 closes as `live (slice 1)` with named release gaps; new follow-on FW row for production wallet integration filed.

## Non-goals (explicit, to bound scope)

- **No router dependency.** Five routes is still manual `parseXxxRoute` switching. Router lands when soft-nav becomes a respondent need.
- **No client-side soft navigation between `/`, `/status`, `/obligations`, `/documents`, `/history`.** Browser back/forward = full reload.
- **No real cross-issuer fan-out.** Per §"Slice 1 does not ship" — XS-2 + production wallet adapter are post-MVP.
- **No demo "fake" XS-2 token bag.** Faking multi-issuer auth would be the exact kind of dishonest stub ADR-0011 §Rationale #1 forbids. The stub demo data presents pre-aggregated entries from two fake issuers; there is no multi-issuer auth ceremony in the demo flow.
- **No JSON Schema for `/history` URL params.** The URL has none; the route IS the request.
- **No URN-keyed accountless variant.** See §"Why identity-required."
- **No write surface in slice 1.** No delete, no export, no edit. Reads only.
- **No new sibling-factory family.** FW-0070 parameterized factory handles the fifth route via one descriptor + one dispatch arm.

## Test coverage matrix

| Behaviour | Test |
|---|---|
| `/history` renders one section per entry kind in the snapshot | `history-runtime.test.tsx#renders kind sections` |
| Sections in closed-taxonomy order (drafts → submissions → signed-records) | `history-runtime.test.tsx#section order` |
| Sort within section: `timestamp` desc; ties broken by id asc | `history-runtime.test.tsx#sort order` |
| "N record(s) across M sender(s)" header derived from unique-issuer count | `history-runtime.test.tsx#cross-sender header` |
| Deferred-capability copy fixture-pinned | `history-runtime.test.tsx#deferred capability copy` |
| Empty entries renders "You have no records to show yet." | `history-runtime.test.tsx#empty state` |
| `crossIssuerHistory` instance-unavailable → "Your history is not available. This site does not provide a history view." | `history-runtime.test.tsx#instance-unavailable` |
| `crossIssuerHistory` org-forbidden → "Your history is not available. This sender does not provide a history view here." | `history-runtime.test.tsx#org-forbidden` |
| Auth required when identity discovers options and no boot claim | `history-runtime.test.tsx#auth required` |
| Cross-route link to `/status?case={urn}` when entry carries `applicantStatusRef` | `history-runtime.test.tsx#status link` |
| Cross-route link to `/documents` when entry carries `documentRefs[]` | `history-runtime.test.tsx#documents link` |
| Unresolvable refs suppress the link (no fabricated URN) | `history-runtime.test.tsx#suppressed link` |
| `HistoryRuntime` does NOT invoke `StatusReader.readStatus()` | `history-runtime.test.tsx#no status fetch` |
| `HistoryRuntime` does NOT invoke `DraftStore` / `SubmitTransport` / `DefinitionSource` / `RespondentPlaceSource` | `history-runtime.test.tsx#no foreign ports` |
| Vocabulary firewall: no `history-snapshot` / `respondentHistory` / `tokenBag` / `cross-issuer` / `XS-2` / `subjectRef` / `aggregationMode` / `respondent-place` / `OpenID4VP` / `HPKE` / `W3C` / `VC` in rendered DOM | `history-runtime.test.tsx#vocabulary firewall` |
| URL `/history` activates `HistoryRuntime` | `tests/app/app-routing.test.tsx#history case` |
| `chooseComposition` picks the history-route descriptor for `/history` | `tests/app/status-boot-narrowing.test.ts#history-route` |
| `/history` axe-clean in demo composition | `tests/e2e/placeholder-a11y.spec.ts#history axe-clean` |
| Parser: `/history` matches; `/history/foo` does not; `/history?x=y` matches and ignores params | `tests/app/history-route.test.ts` |
| Feature-key registry: `crossIssuerHistory` is in `RUNTIME_FEATURE_KEYS` (append-only) | `src/policy/feature-keys.test.ts` |
| Composition coherence: every existing factory + the new history-route descriptor pass `assertCompositionCoherence` | `tests/profiles/composition-coherence.test.ts` (descriptor matrix auto-includes the new descriptor) |
| Resolver: `crossIssuerHistory` disabled-no-instance + disabled-org-forbidden + demo-stub-satisfies-optional cases | `tests/policy-resolution/cases/cross-issuer-history-*.json` |
| Stub adapter conformance: round-trip, kind discriminator, issuer-ref shape, time-ordering, empty-snapshot | `tests/adapter-conformance/respondent-history-source/conformance.test.ts` |
| Stub adapter behavior: cross-issuer count, kind-mix | `tests/adapters/respondent-history-source-stub.test.ts` |
| Unavailable sentinel throws with adopter-facing message | `tests/adapters/respondent-history-source-unavailable.test.ts` |
| Sentinel marker registry extended | `tests/adapters/unavailable-sentinel.test.ts` + `tests/adapters/demo-stub-marker.test.ts` |

## Risks and what catches them

- **Risk:** the new `consumesHistory` flag on `RouteNarrowing` becomes the next descriptor-bloat trigger (a new flag per new feature key). **Catch:** the flag is the same shape `consumesStatus` / `consumesRespondentPlace` already use; adding a third matches the existing pattern, not a new pattern. The trigger to consolidate descriptor flags into a per-feature-key opt-in registry fires at flag #4 (next feature key after this one); track in the closeout note.
- **Risk:** entries with both `applicantStatusRef` and `documentRefs[]` render two side-by-side links that crowd the row. **Catch:** the test matrix pins one entry with both set and asserts the layout reads cleanly (status link in a dedicated metadata line; documents count + link in a separate line below).
- **Risk:** demo fixture data leaks issuer-ref vocabulary into the DOM. **Catch:** vocabulary firewall test includes `issuer-ref` / `issuerUrls` / `HistoryIssuerRef` in the forbidden-substrings list; demo issuer names use display-friendly strings ("Example Department of Benefits", "Example Tax Office").
- **Risk:** the production composition's `unavailableRespondentHistorySource()` is wired but the page never asks for it because the resolver short-circuits — leaving an orphan adapter that drifts. **Catch:** the production factory's `unavailableRespondentHistorySource()` is the same sentinel pattern every other port uses; the coherence assertion forces the declaration ↔ adapter pairing.
- **Risk:** future adopters confuse cross-issuer fan-out (XS-2 token bag) with the history port itself and try to bolt token-bag logic onto `readHistory`. **Catch:** the port doc explicitly names the boundary: the port is the **shape** of cross-issuer history; the **substrate** (multi-issuer auth) is the adapter's concern. Adopters wiring a real adapter accept tokens through their own constructor, not through `HistoryQuery`.
- **Risk:** the descriptor matrix in `tests/profiles/composition-coherence.test.ts` auto-includes the new descriptor and the fifth descriptor's cross-product with existing modes creates a test-matrix explosion. **Catch:** the FW-0070 closeout proved the matrix scales with assertion breadth per descriptor, not descriptor count; the fifth descriptor adds the same number of cases as the fourth did (5 per descriptor in smoke).

## What FW-0057 ships and what stays open

**Ships:**
- New `RespondentHistorySource` port + `HistorySnapshot` / `HistoryEntry` / `HistoryEntryKind` types.
- Conformance suite + stub adapter + unavailable sentinel.
- Standalone `/history` route with a respondent-owned dashboard.
- Identity-bound, no URN-keyed variant.
- Per-kind section grouping + timestamp-desc sort + cross-sender header.
- Honest gap copy naming every deferred capability verbatim.
- Cross-route links to `/status` (per entry status URN) + `/documents` (per entry doc refs).
- New `crossIssuerHistory` runtime-feature key (fifth extension of the closed taxonomy).
- New `consumesHistory` flag on `RouteNarrowing`; fifth descriptor (`HISTORY_ROUTE_NARROWING`) + one new dispatch arm in `chooseComposition`.
- Demo cross-issuer fixture (4 entries across 2 fake issuers, 3 kinds).
- Adopter docs + ADR-0011 cross-reference + runtime-feature-resolution.md updates.

**Stays open (named follow-on rows + EXT-* upstream rows):**
- **Production cross-issuer adapter (the load-bearing half).** Blocked on **XS-2** (multi-issuer token bag) — already filed in `thoughts/specs/2026-05-22-upstream-extension-queue.md`. Filed as **FW-0078** (post-XS-2 production wiring).
- **Draft inclusion (resume editing).** Blocked on **EXT-26** + **EXT-27** (cross-deployment draft hydration). The slice-1 fixture shows a draft entry visually but clicking it does not resume the form.
- **Signed-record receipt detail view.** FW-0009 / FW-0010 territory — verifier-side selective-proof viewer.
- **Lifecycle actions on past records (correct / withdraw / dispute).** FW-0034 territory.
- **Search / filter / faceted sort.** Filed as follow-on.
- **Calendar / iCal export.** Filed as follow-on.
- **Deletion semantics (drafts vs submissions).** FW-0043 + FW-0034 territory.
- **Cross-deployment history (across formspec-web instances on different domains).** Needs the wallet to be the source of truth across deployments.
- **Per-kind enriched fields** (signed-record `verifiedAt`, draft `lastEditedAt`, submission `statusEvent`) — couples to FW-0034 / FW-0009; deferred.
- **Descriptor-flag consolidation** if a fourth `consumes*` flag lands.

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline
- [web ADR-0010](../adr/0010-respondent-place-trust-model.md) — respondent-place trust model (sibling port; this port consumes the same client-wallet aggregation model)
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — new `crossIssuerHistory` capability key, non-form-surface synthesis addendum
- [FW-0039 design](2026-05-23-fw-0039-post-submit-status-surface-design.md) — standalone-route + honest-deferral-copy precedent
- [FW-0055 design](2026-05-23-fw-0055-respondent-obligations-stream-design.md) — cross-sender framing precedent
- [FW-0056 design](2026-05-23-fw-0056-document-library-design.md) — fourth standalone surface precedent + first taxonomy extension
- [FW-0033 design](2026-05-23-fw-0033-file-upload-design.md) — new-port + conformance + composition slot precedent
- [FW-0066 design](2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md) — non-form surfaces synthesize literally at the route boundary (Option B)
- [FW-0070 design](2026-05-23-fw-0070-route-narrowing-parameterization-design.md) — parameterized factory; this row adds the fifth descriptor through one dispatch arm
- [FW-0057 implementation plan](../plans/2026-05-24-fw-0057-cross-issuer-history.md) — task-by-task execution
- [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](2026-05-22-upstream-extension-queue.md) — XS-2 (multi-issuer token bag, load-bearing for production adapter), EXT-26 + EXT-27 (cross-deployment draft hydration)
- stack-root [ADR-0068](../../../thoughts/adr/0068-tenant-and-scope-composition.md) — tenant boundary; cross-issuer must be client-side
