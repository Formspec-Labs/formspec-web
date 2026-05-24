# FW-0055 — Respondent-side obligations stream (design)

**Date:** 2026-05-23
**Row:** [FW-0055](../../PLANNING.md#fw-0055--respondent-side-obligations-stream)
**Journey:** [J-039](../../JOURNEYS.md#j-039--show-me-what-i-owe-whom-across-every-form-ive-ever-filled-out)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0010 (respondent-place trust model), web ADR-0011 (runtime feature resolution)
**Authority:** consumes the existing `RespondentPlaceSource` port (Respondent Library `obligations[]` shape per SC-3); does not extend it. Reuses the existing `respondentPlace` capability key per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) §"Feature Ownership Table" — "Obligations stream" is named there as a consumer of the respondent-place instance capability, not a new key.

## What FW-0055 actually needs (vs the row prose)

The PLANNING row is in internal contradiction: its **Status: open** while its body claims a "stub-backed DI slice 2026-05-23" already shipped — and the substrate side of that claim is real (port shape, conformance, stub adapter, composition wiring, render code on `RespondentRuntime` `RespondentPlacePanel` → `ObligationItem`). The honest gap between "substrate present" and "row done" is the **product surface** the J-039 journey actually asks for.

J-039's Done criterion is:
> "A cross-sender inbox / timeline the respondent owns. Each entry: form, sender, what's due, when, what action the respondent needs to take. Sender-side notification budgets visible. Subscribe / mute / batch per matter. Calendar export."

Today's `RespondentPlacePanel` renders a column called "Obligations" alongside two unrelated columns ("Files," "Submissions"), visible only while the respondent is filling out a form. Four load-bearing gaps separate that from J-039:

1. **No standalone obligations surface.** The cross-sender promise ("what do I owe whom across every form") is the **forward-looking face of the respondent's place** (J-039 §Note). Today the obligations list is hostage to having an unrelated form open — when the respondent isn't filling out a form, the list is unreachable. Same shape of dishonesty FW-0039 fixed for `/status`: a respondent-owned dashboard needs a respondent-owned URL.
2. **No cross-sender framing.** The current panel says "Obligations" and lists items with their sender names. It does NOT surface "across N senders" framing, sort by due-date, group overdue/due-now/upcoming/satisfied, or make the cross-sender promise legible. The J-039 anti-target is "yet another notification stream from each sender independently" — the surface has to demonstrate the *quieting* effect, not just be technically capable of multi-sender data.
3. **No honest-deferral copy.** J-039 names per-matter mute, batch, escalate, calendar export, notification-budget visibility, sender-circumvention signals. None of which we ship. Today the panel silently omits them — exactly the dishonesty FW-0039 made explicit with "Timing for similar applications is not yet available on this site." Slice 1 needs the obligations-stream equivalent.
4. **Sort order is undefined.** Today the list renders in whatever order the snapshot's `obligations[]` array happened to be in. The fixture happens to put `due` before `upcoming`, but that's coincidence — adapter authors get no contract. A "what do I owe next" view that doesn't sort by due-date is not honest about its own purpose.

Each gap is independently load-bearing; failing on any of them makes the surface dishonest.

## Decision: ship slice 1 (standalone surface + cross-sender framing + sort + honesty copy), defer aggregation to upstream

Slice 1 lands:

- A dedicated **obligations route** (`/obligations`) handled inside `App.tsx`. No router dependency added; the existing `parseStatusRoute` pattern extends to a `parseObligationsRoute(href)` returning `null | {}` (no params; the URL is the request). When the route matches, lazy-load a new `ObligationsRuntime` instead of `RespondentRuntime`. Subsequent navigation back to `/` reloads — same constraints as `/status` (web ADR-0009 §"no router dep for two routes"). When a third route arrives, that row pulls in the router.
- A new **`ObligationsRuntime.tsx`** that resolves the runtime profile, boots identity (the surface IS account-bound — see §"Why identity-required, not URN-keyed" below), calls `RespondentPlaceSource.readPlace({ subjectRef })`, and renders the obligations as a sorted, sender-grouped, gap-honest dashboard. Layered like `StatusRuntime`: render states are an `ObligationsViewState` discriminated union (`loading | auth-required | disabled-unavailable | disabled-org-forbidden | ready`).
- **Cross-sender framing.** The page header reads "What you owe" (plain language, owner-vocabulary). The summary strip shows `N obligation(s) across M sender(s)` derived from the unique-issuer count, lighting the J-039 cross-sender promise the panel buries. Items are grouped under three section headings: "Due now" (state `due` or `overdue`), "Upcoming" (state `upcoming`), and "Done" (state `submitted` / `satisfied` / `closed`). Within each section, items sort by `dueAt` ascending (undefined dueAt sorts last); ties break by sender name, then title — pin a deterministic order in the test fixture so adapter ordering can't bleed through. Items still render via the existing `ObligationItem` shape (with the same vocabulary firewall — `labelFromToken(obligation.state)`), but extracted from `RespondentRuntime` into a shared `src/app/obligations-view.ts` module so both surfaces share one render.
- **Honest gap copy.** Immediately below the header — not a footnote, not in italics — a labelled gap row reads "Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site." The literal copy is fixture-pinned in `obligations-runtime.test.tsx#deferred capability copy` so any future edit must consciously break the assertion. Same pattern FW-0039 used for the "not yet available" timing strip.
- **Disabled-cause copy.** When `respondentPlace` is disabled at the resolved profile:
  - `optional-no-instance` (today's production composition default — adapters unavailable) → "Obligations are not shared. This site does not provide an obligations view."
  - `org-forbidden` → "Obligations are not shared. This sender does not share an obligations view here."
  - `form-forbidden` → not applicable on this route (no form definition); resolver branch unreachable but the typed-disabled handler covers it conservatively with the org-forbidden copy.
  - `not-requested` → unreachable because `ObligationsRuntime` synthesizes `form: { features: { respondentPlace: 'optional' } }` at the route boundary, mirroring the synthesis FW-0039 ratified in `StatusRuntime` for the `status` key (see web ADR-0011 §"Non-form surface synthesis" addendum). Stays OPTIONAL — never required. Without the synthesis the resolver falls off via `not-requested` and the page renders "Obligations are not shared" even when the deployment supports them. With it, the existing instance + org gates carry the disabled-cause through naturally.
- **Empty-state copy.** When the resolved profile enables `respondentPlace` and the adapter returns an empty `obligations[]`, the page renders "You have no obligations from senders using this site." Distinct from disabled-by-policy: this is "available, currently empty," not "not provided."
- **In-form panel keeps existing render.** `RespondentPlacePanel`'s obligations column stays. The dashboard is *additional*, not a replacement — the form-fill page still surfaces obligations for the current-form context where it's directly useful. The shared `obligations-view.ts` module guarantees both surfaces use the same render contract; future copy / sort edits land in one place.

Slice 1 does **not** ship:

- **Cross-issuer / cross-tenant aggregation.** The current `RespondentPlaceSource` contract is a *single* client-side library snapshot — the multi-issuer fan-out (calling per-issuer adapters and merging the obligations into one view) is the XS-2 token-bag architectural commitment (already filed in `thoughts/specs/2026-05-22-upstream-extension-queue.md` as decided by web ADR-0010 §"cross-tenant aggregation is structurally forbidden server-side"). The slice-1 honesty is: the page accurately renders whatever the wallet adapter aggregates. When the wallet adapter is a stub returning two issuers, the page accurately says "across 2 senders." When XS-2 lands a real client-side multi-tenant aggregator, the page changes nothing — the data just gets richer.
- **Mute / batch / escalate per matter.** J-039 names these explicitly. None of them ship in slice 1. The deferred-capability copy says so plainly.
- **Calendar export (.ics).** Same — deferred and named in copy.
- **Notification-budget visibility.** Same — deferred and named in copy.
- **Sender-circumvention signals.** J-039 §What-done "Sender attempts to circumvent the respondent's notification preferences are surfaced to the respondent as a signal." Out of scope — depends on a notification-budget primitive that doesn't exist yet.
- **Push notifications for obligation due-date changes.** `NotificationDelivery` port exists; obligation push is a separate row, dependent on the issuer-side `obligation-changed` event primitive not yet filed.
- **A new port.** The Respondent Library sidecar already carries `obligations[]`. Per web ADR-0010 §"web MUST NOT define a competing taxonomy," formspec-web cannot invent `ObligationsSource` — the sidecar IS the source. Cross-issuer fan-out is the wallet adapter's concern, not the port's.
- **A new capability key.** Per ADR-0011 §"Feature Ownership Table," "Obligations stream" is a consumer of the `respondentPlace` capability (instance: respondent-place storage + token bag; org: issuer participates in client aggregation; form: obligations emitted — the form-side dimension is irrelevant on the standalone route). Adding an `obligations` sibling key would split a single capability across two keys without an instance-capability or policy-shape distinction, the exact taxonomy bloat ADR-0011 §"Closed taxonomy" forbids.

## Why identity-required, not URN-keyed

FW-0039 chose URN-as-possession-factor for `/status` because a single case URN is a high-entropy possession factor naturally produced at submit time. The obligations stream is structurally different:

- **There is no per-obligation URN that's the access token.** The obligations *list* is the respondent's library, keyed by subject. URN-keying would require minting a "subject-list URN" with the same possession-factor strength — synthetic, not a natural artifact of any existing flow.
- **J-039 explicitly frames it as "owned by the respondent."** The "ownership" claim is identity-bound: the respondent's library belongs to the *identified subject*, not the *holder of a link*. URN-keying would weaken that claim.
- **The wallet-side encryption envelope (web ADR-0010 §"client-side encryption with passkey-derived key") only resolves when the respondent's passkey is present.** That's identity-bound by construction.

So `/obligations` requires identity. The boot is the existing `signInOptionsForIdentityPolicy` machinery `RespondentRuntime` already uses — same render component (the `AuthRequiredSurface` extracted into shared scope). The identity ladder is the deployment's choice; the page doesn't pre-empt it.

If a respondent has no identity option (composition.identityProvider has zero discover() results AND runtimeMode does not permit anonymous), the page renders the same `auth-required` no-options state the form-fill route does today — the typed `IdentityNotAvailable` path is reused, not duplicated.

## Runtime feature framing

`respondentPlace` is one of the two seeded keys in [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md)'s closed taxonomy. FW-0055 stays inside the existing gate — `ObligationsRuntime` is a new consumer of the same `respondentPlace` capability, parallel to how `StatusRuntime` is a new consumer of `status`.

- When the resolved profile **enables** `respondentPlace` (instance available + org/form allow), `ObligationsRuntime` calls the adapter and renders.
- When the resolved profile **disables** `respondentPlace` because the instance has only the unavailable sentinel (today's production composition default — `unavailableRespondentPlaceSource()`), the page renders the "Obligations are not shared. This site does not provide an obligations view." plain-language copy.
- When the resolved profile **disables** `respondentPlace` because the org forbids it, the page renders "Obligations are not shared. This sender does not share an obligations view here."

Per the **FW-0066 follow-on row** (already open) the function-typed `getFormRuntimePolicy` slot is consumed via the literal route synthesis pattern FW-0039 established and ADR-0011's "Non-form synthesis" addendum ratified. `ObligationsRuntime` synthesizes `form: { features: { respondentPlace: 'optional' } }` literally; the slot's promotion to a named `FormRuntimePolicyExtractor` port (FW-0066) is unaffected because the route synthesis stays the same shape under either policy carrier. Same caveat FW-0039 carried.

The `status` key is also consumed transitively: each obligation may reference a submission whose `applicantStatus` projection wants live status. Today's `RespondentPlacePanel` already calls `StatusReader.readStatus()` per submission. Slice 1's obligations dashboard does NOT call `StatusReader` — obligations are forward-looking (what you owe), not backward-looking (what's pending review). When an obligation's `submissionRef` points at a submitted form, the link goes to `/status?case={resolvedCaseUrn}` for that case, deferring status rendering to `StatusRuntime`. **Resolution path:** the `submissionRef` value is a `submissions[].id` from the same Respondent Library snapshot; the obligations renderer looks up the submission in the snapshot and reads `submission.applicantStatus.resourceRef` (the WOS case URN). If either lookup misses, the link is suppressed (don't fabricate a URN). This keeps `ObligationsRuntime` honestly scoped to one port (`RespondentPlaceSource`) for the data read; cross-route linkage is by hyperlink, not by transitive port dep.

## Port boundaries — what stays the same

**`RespondentPlaceSource` (no change).** Already returns `RespondentPlaceSnapshot` with `obligations[]`. `ObligationsRuntime` calls `readPlace({ subjectRef })` and renders `snapshot.obligations`. The conformance suite already covers the shape (`defineRespondentPlaceSourceConformance`) including the `obligations` field's array-shape assertion.

**`IdentityProvider` (no change).** Reuses the same discovery + authenticate + subscribe path `RespondentRuntime` uses.

**`StatusReader` (not called from `ObligationsRuntime` directly).** Obligations are forward-looking; the dashboard hyperlinks to `/status?case={urn}` rather than fetching status itself. This is the consumer-discipline decision that keeps `/obligations` honestly narrowed for FW-0068's route-aware composition.

**No new port.** Per web ADR-0009 §"Not in the constitutional inventory" — no port is ratified before it has a consumer. Cross-issuer fan-out is the wallet adapter's responsibility per web ADR-0010; if and when a future row needs a separate `ObligationsAggregator` port, that row's design names it.

## Composition coordination with FW-0068

FW-0068 (route-aware composition narrowing) is in parallel build. The obligations route's narrowed composition needs:

- `respondentPlaceSource` — load-bearing (the obligations data source).
- `identityProvider` — load-bearing (the surface is identity-bound).
- `getFormRuntimePolicy` + `instanceCapabilities` + `orgRuntimePolicy` + `mode` — load-bearing (runtime feature resolution).

It does NOT need:
- `definitionSource` — no form to load.
- `draftStore` — no form to draft.
- `submitTransport` — no form to submit.
- `statusReader` — see §"port boundaries" above; status is reached via hyperlink to `/status`, not via direct call. (If FW-0068's narrowing shape requires every port slot to be present, the obligations composition wires `unavailableStatusReader()` — honest sentinel — for the slot.)
- `notificationDelivery` — no magic-link or notification to send from this route.

If FW-0068 lands first, this row's implementation slot fills `createDefaultObligationsRouteComposition` with the seven needed slots and the unavailable sentinels for the rest. If FW-0055 lands first, the wiring stays at `createDefaultComposition` and FW-0068 inherits the additional route in its narrowing matrix. Either order works; the slot list above is the contract.

## Vocabulary firewall

Every visible string respects the firewall (web `CLAUDE.md` §Vocabulary firewall):

- "What you owe" / "obligation" / "sender" / "due" — owner vocabulary, not spec jargon.
- "Sender" — not "issuer" in body copy. `RespondentIssuerRef.name` is rendered as-is (issuer-supplied display name).
- "Library" / "sidecar" / "snapshot" / "RespondentPlace" — all forbidden in body copy. The page does not say "your library" — it says "what you owe."
- Obligation state pills pass through `labelFromToken(obligation.state)` (already in use), so `'overdue'` → "Overdue", `'submitted'` → "Submitted". Same vocabulary firewall the existing `ObligationItem` uses.
- Due-date formatting via `formatDate` (already in use).
- No case URN, submission URN, or library ID in body copy. The hyperlink target URL contains the URN; the visible link text does not.

## Architectural surface — minimal new code

- `src/app/ObligationsRuntime.tsx` (new) — accepts no URL params, resolves runtime profile, boots identity, calls `RespondentPlaceSource.readPlace`, renders the dashboard. Layered like `StatusRuntime`. ~250 LoC estimated.
- `src/app/obligations-view.ts` (new) — extracts `ObligationItem` render + sort + group helpers from `RespondentRuntime` so both surfaces share. `RespondentPlacePanel.ObligationItem` re-imports.
- `src/app/obligations-route.ts` (new) — `parseObligationsRoute(href)` returning `{} | null`. Mirrors `status-route.ts`.
- `src/app/App.tsx` (modify) — extend the URL-parsing switch: if pathname `/obligations`, load `ObligationsRuntime`; if `/status`, `StatusRuntime`; else `RespondentRuntime`.
- `src/app/respondent-flow.ts` (modify) — if a confirmation panel needs an obligations CTA, add `buildObligationsTrackingUri()` returning `/obligations`. Optional for slice 1; the confirmation panel today doesn't link to obligations, and adding it can ride the same arc or wait until slice 2.
- `tests/app/obligations-runtime.test.tsx` (new) — covers loading, auth-required, ready (sort + section grouping + cross-sender count + deferred-capability copy + empty-state copy), disabled-org-forbidden, disabled-instance-unavailable, vocabulary-firewall (no spec jargon in rendered DOM), and `ObligationsRuntime` does NOT call `StatusReader` / `SubmitTransport` / `DraftStore` / `DefinitionSource`.
- `tests/app/obligations-route.test.ts` (new) — parser cases (path mismatch, valid, query-param ignored).
- `tests/app/app-routing.test.tsx` (modify) — add `/obligations` case alongside the existing `/` and `/status` cases.
- `tests/e2e/placeholder-a11y.spec.ts` (modify) — extend the existing axe-clean smoke test to also visit `/obligations` in the demo composition and assert axe-clean.
- `docs/ports/respondent-place-source.md` (modify) — add a "Consumers" section naming both `RespondentPlacePanel` (in-form) and `ObligationsRuntime` (standalone). Adopter doc context.
- `docs/policy/runtime-feature-resolution.md` (modify) — add the `/obligations` route as a worked example of the optional-falls-off branch on a non-form surface, alongside the existing `/status` example.
- `PLANNING.md` (modify) — FW-0055 closes as `live (slice 1)` with named release gaps; FW-0069 opens as the follow-on row for the deferred capabilities (mute / batch / escalate / calendar export / notification-budget visibility / cross-issuer fan-out consumer slice).
- `thoughts/specs/2026-05-22-upstream-extension-queue.md` (modify) — XS-2 already filed; add a row for the future obligation-change notification primitive (the per-issuer event the slice's deferred push-notification capability depends on). Tentatively `EXT-30: obligation-changed event` — to be filed only if the FW-0069 follow-on row needs it; defer the filing until slice 2's scope is clear.

## Non-goals (explicit, to bound scope)

- **No router dependency.** Three routes is still manual `parseXxxRoute` switching. Router lands when a fourth route arrives or when soft-nav between two of them becomes a respondent need.
- **No client-side soft navigation between `/`, `/status`, `/obligations`.** Browser back/forward triggers a full reload — same as `/status`.
- **No new port.** `RespondentPlaceSource` is sufficient.
- **No new capability key.** `respondentPlace` is the consumer key per ADR-0011.
- **No cross-issuer fan-out implementation.** Wallet-side aggregation is the adapter's job; slice 1 trusts the snapshot.
- **No persistence of viewed obligation IDs.** That's a future preference primitive (mute/batch/escalate) — not slice 1.
- **No locale-conditional obligation copy.** Static labels go through `labelFromToken` for state pills; sender / title / description are issuer-supplied verbatim.
- **No JSON Schema for the URL params.** The URL has none; the obligations route IS the request.
- **No URN-keyed accountless variant.** See §"Why identity-required."
- **No /obligations.ics calendar export endpoint.** Deferred and copy-named.

## Test coverage matrix

| Behaviour | Test |
|---|---|
| `/obligations` renders "Due now" / "Upcoming" / "Done" sections grouped from `state` | `obligations-runtime.test.tsx#renders sections` |
| Sort order within each section: `dueAt` ascending, undefined last, ties broken by sender then title | `obligations-runtime.test.tsx#sort order` |
| "N obligation(s) across M sender(s)" header derived from unique-issuer count | `obligations-runtime.test.tsx#cross-sender header` |
| "Sender mute, batch, escalate, calendar export, and notification-budget visibility are not yet available on this site." copy fixture-pinned | `obligations-runtime.test.tsx#deferred capability copy` |
| Empty obligations renders "You have no obligations from senders using this site." | `obligations-runtime.test.tsx#empty state` |
| `respondentPlace` instance-unavailable → "Obligations are not shared. This site does not provide an obligations view." | `obligations-runtime.test.tsx#instance-unavailable` |
| `respondentPlace` org-forbidden → "Obligations are not shared. This sender does not share an obligations view here." | `obligations-runtime.test.tsx#org-forbidden` |
| Auth required when identity discovers options and no boot claim | `obligations-runtime.test.tsx#auth required` |
| Obligation linking to submission with resolvable `applicantStatus.resourceRef` → `/status?case={urn}` hyperlink rendered; unresolvable → link suppressed (don't fabricate URN) | `obligations-runtime.test.tsx#status link resolution` |
| `ObligationsRuntime` does NOT invoke `StatusReader.readStatus()` | `obligations-runtime.test.tsx#no status fetch` |
| `ObligationsRuntime` does NOT invoke `DraftStore` / `SubmitTransport` / `DefinitionSource` | `obligations-runtime.test.tsx#no form ports` |
| Vocabulary firewall: no `respondent-place` / `library` / `sidecar` / `snapshot` / `subjectRef` in rendered DOM | `obligations-runtime.test.tsx#vocabulary firewall` |
| URL `/obligations` activates `ObligationsRuntime`; `/` keeps `RespondentRuntime`; `/status` keeps `StatusRuntime` | `tests/app/app-routing.test.tsx#App route selection (FW-0055 slice 1)` |
| `/obligations` axe-clean in demo composition | `tests/e2e/placeholder-a11y.spec.ts#obligations axe-clean` |
| Parser: `/obligations` matches; `/obligations/foo` does not; `/obligations?x=y` matches and ignores params | `tests/app/obligations-route.test.ts` |

## Risks and what catches them

- **Risk:** the cross-sender framing reads as honest with two demo issuers but becomes misleading when a production wallet has only one issuer wired. **Catch:** the header is honestly derived — "2 obligations across 2 senders" with two issuers, "5 obligations across 1 sender" with one. The cross-sender promise is *legible*, not *manufactured*; when the wallet contains one issuer's obligations, the page truthfully says so.
- **Risk:** the deferred-capability copy line creates "feature lust" — users wanting capabilities the page advertises as absent. **Catch:** the copy is plain and prospective, not promissory. The pattern is FW-0039's "Timing for similar applications is not yet available on this site" — it doesn't say "coming soon," it says "not yet available."
- **Risk:** `ObligationsRuntime` quietly grows transitive port deps as obligations gain richer affordances (status fetch, document presentation, action triggers). **Catch:** the test `obligations-runtime.test.tsx#no status fetch` and `#no form ports` are fail-closed assertions on every commit. Any new port consumer requires breaking the test deliberately and updating FW-0068's narrowed composition.
- **Risk:** the page renders identity-required even when the deployment is anonymous-only and the obligations adapter happens to return a public stub. **Catch:** the boot follows the same `signInOptionsForIdentityPolicy` machinery `RespondentRuntime` uses — anonymous deployments pass `runtimeMode === 'demo'` or `identity.mode === 'anonymous'` and skip the gate, identically to today's form route.
- **Risk:** the obligations sort/group helpers in `obligations-view.ts` drift from the in-form panel rendering. **Catch:** the in-form panel re-imports the same module; no parallel implementation exists to drift.
- **Risk:** the slice's "trust the wallet adapter to fan out" framing is reasonable today (single-snapshot Respondent Library per ADR-0010) but invites confusion when XS-2 implementation arrives and changes adapter semantics. **Catch:** the §"Cross-issuer / cross-tenant aggregation" section names XS-2 explicitly; FW-0069 (the follow-on consumer-slice row) will re-examine the contract before XS-2 ships.

## What FW-0055 ships and what stays open

**Ships:**
- Standalone `/obligations` route with a respondent-owned dashboard.
- Identity-bound, no URN-keyed accountless variant.
- Sort + section grouping + cross-sender header derived honestly from snapshot.
- Honest gap copy naming the deferred capabilities verbatim.
- Vocabulary-firewall coverage.
- Composition coordination with FW-0068.
- Test coverage spanning policy-gate, identity-boot, sort, vocabulary, route selection, accessibility.

**Stays open (FW-0069, XS-2):**
- Cross-issuer / cross-tenant fan-out implementation (XS-2 already filed; FW-0069 is the consumer slice once XS-2 lands).
- Mute / batch / escalate per matter.
- Calendar export (.ics).
- Notification-budget visibility.
- Sender-circumvention signals.
- Push notifications for obligation due-date / state changes.
- Production wallet/storage adapters (encrypted storage, passkey-derived HPKE per ADR-0010).

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline
- [web ADR-0010](../adr/0010-respondent-place-trust-model.md) — `RespondentPlaceSource` port, trust model, cross-tenant aggregation forbidden server-side
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `respondentPlace` capability key, non-form-surface synthesis addendum
- [FW-0039 design](2026-05-23-fw-0039-post-submit-status-surface-design.md) — standalone-route + honest-deferral-copy precedent
- [FW-0065 plan](../plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md) — gating + plumbing already shipped
- [FW-0055 implementation plan](../plans/2026-05-23-fw-0055-respondent-obligations-stream.md) — task-by-task execution
- [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](2026-05-22-upstream-extension-queue.md) — XS-2 (cross-tenant client aggregation), SC-3 (Respondent Library sidecar)
