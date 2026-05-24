# RespondentHistorySource

`RespondentHistorySource` reads the respondent's backward-looking history —
drafts, submissions, and signed records — aggregated across multiple senders.
The port models the **shape** of cross-issuer history; the **substrate** that
makes cross-issuer aggregation real (multi-issuer authorization via the client-
side token bag per stack-root ADR-0068 D-1 + D-3, queued upstream as XS-2) is
the adapter's concern.

## Adapter contract

- Return snapshots of shape `HistorySnapshot` per
  [`src/ports/respondent-history-source.ts`](../../src/ports/respondent-history-source.ts):
  - `$formspecRespondentHistory: '1.0'`
  - `aggregationMode: 'client-wallet'` (closed string literal; server-side
    aggregation is structurally forbidden per web ADR-0010 + stack-root ADR-0068)
  - `subjectRef: string`
  - `entries: readonly HistoryEntry[]`
- Each `HistoryEntry` carries:
  - `id`, `kind` (one of `'draft' | 'submission' | 'signed-record'`), `issuer`
    (display string), `timestamp` (ISO-8601 — drafts = last edited; submissions
    = submitted; signed records = signed), `title` (issuer-supplied display
    string).
  - Optional cross-route hints: `applicantStatusRef` (WOS URN, triggers
    `/status?case=…` link); `documentRefs` (triggers `/documents` link);
    `receiptRef` (opaque receipt URI; not rendered in slice 1);
    `definitionRef`.
- Reject `aggregationMode` values outside `'client-wallet'`.
- Reject `kind` values outside the closed taxonomy.
- Empty `entries: []` is valid; do not throw on an empty respondent.

## Substrate vs port boundary

The port is intentionally minimal — single method `readHistory(query) →
Promise<HistorySnapshot>`. Adopters wiring a real production adapter:

- Accept their issuer-credentials (multi-issuer token bag, OAuth client
  registrations, presentation tokens, etc.) through their **own constructor**,
  not through `HistoryQuery`. The port's `issuerUrls` hint is optional and
  exists only as a scoping signal — it does not carry authentication material.
- Implement cross-issuer fan-out (parallel reads across the respondent's
  issuer set, with the respondent's per-issuer authorization handles) at the
  adapter level. The port does not constrain the strategy (parallel vs serial,
  cache vs live fetch, time-windowed vs unbounded).
- Handle per-issuer failure: a production adapter SHOULD return a partial
  snapshot when one issuer is unreachable rather than throwing the whole call.
  This is adopter-shaped behavior (the port does not enforce it because the
  honest-fallback semantics differ by deployment).

The port does NOT:

- Define a wire format for cross-deployment portability (export ceremony is
  a separate concern — see `RespondentExportPackage` on `RespondentPlaceSnapshot`).
- Encode per-kind enriched fields (signed-record `verifiedAt`, draft
  `lastEditedAt`, submission `statusEvent`). Those couple to FW-0034 (record
  lifecycle) and FW-0009 / FW-0010 (verifier surface) work that hasn't shipped;
  adding them now would couple the slice-1 contract to deferred capabilities.
- Distinguish drafts that can be deleted from submissions that cannot. The
  deletion semantics live with FW-0034 (record lifecycle) + FW-0043 (delete-
  draft + erase-receipt).

## Run the conformance suite

```bash
npm test -- tests/adapter-conformance/respondent-history-source
```

The suite covers:

- Round-trip a `HistorySnapshot` through JSON (`isHistorySnapshot` accepts the
  result).
- Empty `entries[]` is valid (no throw).
- Closed-set rejection: `kind` outside the taxonomy; `aggregationMode` outside
  `'client-wallet'`.
- Non-array `entries` rejection.
- Required fields per entry (`id`, `kind`, `issuer.name`, `timestamp`, `title`).
- `documentRefs` must be a string array.

## Reference adapters

- [`src/adapters/stub/respondent-history-source.ts`](../../src/adapters/stub/respondent-history-source.ts)
  — in-memory demo stub (carries the `DEMO_STUB_ADAPTER` marker). The demo
  composition wires it with the `demoHistorySnapshot()` fixture (4 entries
  across 2 senders, all three kinds).
- [`src/adapters/unavailable/respondent-history-source.ts`](../../src/adapters/unavailable/respondent-history-source.ts)
  — unavailable sentinel (carries the `UNAVAILABLE_ADAPTER` marker). `readHistory`
  throws with a plain-language adopter-facing message. Production composition
  + every narrowed-route composition that doesn't consume history wires this
  sentinel + declares `crossIssuerHistory: 'unavailable'`.

## Consumers

One consumer in `formspec-web` today:

- `HistoryRuntime` at `/history` (FW-0057 slice 1) — standalone respondent-
  owned timeline, identity-bound, per-kind grouped + timestamp-desc sorted.
  Renders the snapshot's `entries[]` with cross-route hyperlinks to `/status`
  (per `applicantStatusRef`) and `/documents` (per `documentRefs.length`).
  Reuses this port; calls no other (no `RespondentPlaceSource`, no
  `StatusReader`, no form-shaped MVP ports).

Slice 1 has no in-form consumer. The shared render helpers live in
`src/app/history-view.tsx` (`HistoryEntryItem`, `groupAndSortHistory`,
`uniqueIssuerCount`, `HISTORY_KIND_ORDER`) so any future in-form consumer
(FW-0034 lifecycle actions on past records, for example) reuses one render
contract without parallel-implementation drift.

## What slice 1 does NOT ship

- **Production cross-issuer adapter.** Blocked on XS-2 (multi-issuer client-
  side token bag) — already queued in
  [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](../../thoughts/specs/2026-05-22-upstream-extension-queue.md).
  Until that lands, the production composition declares `crossIssuerHistory:
  'unavailable'` and the `/history` page honestly renders "Your history is not
  available."
- **Draft hydration / resume.** A `draft` entry today shows as a list item
  with a timestamp; clicking it does NOT resume the form. Draft resume requires
  EXT-26 + EXT-27 (cross-deployment draft hydration); both are upstream-queued.
- **Receipt-chain detail view for signed records.** FW-0009 / FW-0010
  (verifier surface) territory. The entry carries `receiptRef` but the surface
  does not render the receipt body or the verifier path.
- **Lifecycle actions on past records.** FW-0034 (correct / withdraw / dispute)
  territory.
- **Search / filter / faceted sort.** Filed as follow-on.
- **Calendar / iCal export.** Filed as follow-on.
- **Deletion semantics.** Drafts can be deleted, submissions cannot — needs
  FW-0034 + FW-0043 lifecycle ports.
- **Cross-deployment history** (across formspec-web instances on different
  domains). Needs the wallet to be the source of truth across deployments;
  out of scope for the OSS reference composition.
