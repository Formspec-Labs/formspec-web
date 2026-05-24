# FW-0039 — Post-submit status surface (design)

**Date:** 2026-05-23
**Row:** [FW-0039](../../PLANNING.md#fw-0039--post-submit-status-surface-with-realistic-timing)
**Journey:** [J-021](../../JOURNEYS.md#j-021--i-hit-submit-where-is-it-now-and-what-do-i-owe-next)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0010 (respondent-place trust model), web ADR-0011 (runtime feature resolution)
**Authority:** consumes the existing `StatusReader` port (WOS applicant API shapes); does not extend it.

## What FW-0039 actually needs (vs the row prose)

The row's Done criterion is "a real status page: received, queued, in review with which unit, decision drafted, issued — with timing drawn from actual recent throughput, not vendor estimates. Reachable without an account."

The current code already covers most of the WOS-shape rendering. Three load-bearing gaps remain:

1. **No standalone status surface.** Today the status feedback is a row inside the respondent-place panel rendered alongside the form-fill view (`RespondentRuntime.tsx` §`RespondentPlacePanel` → §`SubmissionItem`). There is no URL the respondent can revisit that opens directly on the status of one case.
2. **No timing realism layer.** WOS `ApplicantStatusTimelineEntry[]` carries the per-case event history but says nothing about what "received → queued → in review" usually takes for *other applicants on the same workflow*. The "actual recent throughput" promise needs a cross-case aggregate; the WOS applicant projection does not expose it today.
3. **No accountless path.** J-021 calls for "re-checkable without account creation (magic link or OTP)." Today the only way back is to re-load the form URL while signed in.

Each of these is independently load-bearing; failing on any one of them makes the surface dishonest.

## Decision: ship slice 1 (surface + accountless path), defer realism to upstream

Slice 1 lands:

- A dedicated **status route** (`/status?case={WosResourceUrn}`) handled inside `App.tsx`. No router dependency added; `App.tsx` reads `window.location.pathname + search` once at mount and selects either `RespondentRuntime` or a new `StatusRuntime` view. Subsequent navigation back to `/` reloads — accountable + simple. (The earlier draft also promised `/status?ref={confirmationRef}` short-code resolution; that is **deferred** — see §"Deferred from Slice 1" below.)
- A new **`StatusRuntime.tsx`** that renders the WOS applicant-case detail (`ApplicantCaseDetail` / `ApplicantStatusTimelineEntry[]` / `ApplicantTaskSummary[]` / `ApplicantNotificationListItem[]` / `ApplicantAiInvolvementSummary`) as a respondent-facing page — five-stage progress strip drawn from `statusTimeline` events, what-comes-next ribbon from `openTasks`, AI-involvement disclosure when present, link back to the form.
- **Accountless access** by treating the case URN as the access token for the slice. The form's confirmation panel emits a `/status?case={caseUrn}` link the respondent can bookmark, save offline, or paste into a different device. The `StatusReader` port already accepts an opaque request — the page just hands the URN through. Authorization is the adapter's concern (per ADR-0009); for the stub composition the URN is the key; for production the `ProxiedApplicantStatusAdapter` will gate as the adopter's deployment dictates. **No new identity work**; the slice is honest on this seam because the port already permits unauthenticated reads.
- **Confirmation panel rework.** `RespondentRuntime`'s `ConfirmationPanel` already renders a `referenceNumber` and optional `trackingUri`. Slice 1 sets `trackingUri = '/status?case={caseUrn}'` when the submit transport returns a case URN in the confirmation, and renames the call-to-action to "Track this application." If no case URN is returned (today's stub transport returns only a STUB-* reference number), the panel keeps the existing copy and does not invent a tracking link.
- **A timing context strip** that renders strictly what the `statusTimeline` carries — per-stage durations between adjacent events on *this* case, labelled as "your application's timing so far." No vendor-estimate copy, no "average wait" claim, no synthetic throughput. The strip explicitly says "Timing for similar applications is not yet available" when only this-case data is on hand — the deferral copy honesty (per AP-013).

Slice 1 does **not** ship:

- **Cross-case recent-throughput data.** The WOS applicant API does not expose it today, the formspec-stack composition wires `unavailableStatusReader`, and synthesizing it client-side from one applicant's history is exactly the vendor-estimate dishonesty J-021 names. This is filed as `EXT-29: WOS applicant API recent-throughput projection` in the upstream extension queue. FW-0039 ships as `live (slice 1)` with that gap named, and a follow-on row (`FW-0067`) is filed for the consumer slice once EXT-29 lands.
- **Magic-link / OTP re-auth.** The accountless path is URN-knowledge today (the URN behaves like a possession factor — the respondent has the link or they don't). Magic-link replay is FW-0041 / FW-0054's job (both post-MVP for cryptographic substrate reasons). Slice 1 does not pre-empt them.
- **Push notifications.** Out of scope for this row; `task-deadline-approaching` notification kind is rendered when the adapter returns it, but no delivery path is added.

## Runtime feature framing

`status` is already one of the two seeded keys in [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md)'s closed taxonomy. FW-0039 stays inside the existing gate — the standalone `StatusRuntime` is a new consumer of the same `status` capability:

- When the resolved profile **enables** `status` (instance available + org/form allow), `StatusRuntime` renders the WOS-backed page.
- When the resolved profile **disables** `status` because the instance has only the unavailable sentinel (today's production composition default), `StatusRuntime` renders the "Status not shared. This site does not provide application status." plain-language page using the same copy shape the SubmissionItem `M-3` plumbing established.
- When the resolved profile **disables** `status` because the org or form forbids it, `StatusRuntime` says so explicitly with the same "Status not shared. This issuer does not share application status here." copy.

No new feature key. No expansion of the closed taxonomy. **Crucially**, `StatusRuntime` does NOT synthesize a `form: { status: 'required' }` policy at the route boundary — that would manufacture a typed `UnsupportedRequiredFeatureError` on every unavailable-instance load and abuse the form-load error boundary semantics for a non-form surface (arch-review F-4). The status route IS the user's opt-in to view status, so `StatusRuntime` synthesizes `form: { features: { status: 'optional' } }` to register the request with the resolver. Stays OPTIONAL — never required. When the deployment can serve it, the page renders; when it cannot, the page falls off through the `optional-no-instance | org-forbidden | form-forbidden` branches and the not-shared copy renders. Without the synthetic `optional`, the resolver would fall off via `not-requested`, and the page would render "Status not shared" even when the deployment fully supports status — confusing both adopters and respondents. The honesty seam is the same M-3 plumbing FW-0065 shipped, plus this single deliberate route-as-request synthesis.

The `respondentPlace` key is **not** consumed by `StatusRuntime` — status pages don't carry the wallet/obligations/library context that the respondent-place panel renders. The two seeded keys keep their independent gates.

## Port boundaries — what stays the same, what gets minimally extended

**`StatusReader` (no change).** Already returns `ApplicantCaseDetail` / `ApplicantStatusTimelineEntry` / etc. `StatusRuntime` calls `readStatus({ resourceRef: caseUrn })` and expects the adapter to return an `ApplicantCaseDetail` (or undefined). The conformance suite already covers this shape; no new conformance test for the port itself.

**Submit transport (minimal extension).** `SubmitConfirmation` carries `referenceNumber` and optional `trackingUri`. The stub `submitTransport` already constructs the confirmation. Slice 1 widens the stub's confirmation with an optional `caseUrn: WosResourceUrn` field — informational only, the trackingUri is still the load-bearing field for the chrome. The HTTP transport does not gain a field until the production adapter lands (EXT-29 era).

**No new ports.** Per web ADR-0009 §"Not in the constitutional inventory" — no port is ratified before it has a consumer. The throughput aggregation is post-MVP and the consumer ADR will name the port shape; FW-0039 doesn't pre-empt it.

## Vocabulary firewall

Every visible string respects the firewall (web ADR-0009 §discipline, CLAUDE.md §Vocabulary firewall):

- "Application" not "case" in default copy. (`Case` is WOS-internal terminology; users say "my application.")
- "Stage" not "lifecycleState." Status pills use the WOS event labels stripped of dashes and title-cased through the existing `labelFromToken` helper.
- The case URN appears in the URL bar only — never in body copy. If a support reference is needed, the existing `RuntimePolicyError` typed code is the reference, not the URN.
- No `task-deadline-approaching`, `applicant-task-submitted`, `lifecycleState`, `aiInvolvement` raw tokens in user-visible strings — every WOS enum value passes through `labelFromToken` before render.
- AI involvement disclosure uses the existing `ApplicantAgentSummary` projection field labels (already sanitized per the applicant.schema.json description: "no model identifiers"); the rendered copy says "Eligibility Assistant (advisory)" not "claude-sonnet-4-20250514 (advisory)" because the WOS schema already enforces this at the projection layer.
- Per FW-0065's M-3 plumbing: when `status` is org-forbidden or form-forbidden, the page renders "Status not shared. This issuer does not share application status here." — no leak of policy mechanism.

## Accountless access — why the URN-as-token is honest enough for slice 1

The respondent gets the case URN at submit time via the confirmation panel's tracking link. The link is theirs; the URN follows the stack-common-typeid grammar (UUIDv7 tail, ~74 bits of randomness — see EXT-13 in the queue). For the stub composition this is the access model directly. For production composition, the `ProxiedApplicantStatusAdapter` is expected to validate the URN against tenant scope and reject unknown URNs with the same `Status not shared` plain-language surface.

**The slice's accountless honesty depends on adapter-side rate limiting + uniform not-found copy.** ~74 bits is too low to defend against a determined attacker bulk-enumerating URNs at any meaningful rate; rate-limiting unknown-URN probes is the adapter's responsibility, named in `docs/ports/status-reader.md`. The page itself defends only against accidental disclosure: every unknown URN returns the *same* "We don't have status for this reference" copy as every adapter-error case, so the page is never an enumeration oracle (arch-review F-1). A production adapter that does not rate-limit fails this slice's honesty contract.

The page does NOT claim "anyone with the link can see this forever." It claims "you can re-check this from any browser without re-signing in." Future hardening (URN expiry, magic-link rotation, browser-bound proof) is the FW-0054 long-life-receipt row's job and depends on cryptographic substrate work that is firmly post-MVP per ADR-0005.

What is honest today:

- The URL is plain `text/plain` — bookmarkable, paste-able, printable.
- The page renders without an `IdentityProvider` session and without invoking `composition.identityProvider.authenticate()` or `discover()`. `StatusRuntime` does not USE non-status ports at runtime (no `IdentityProvider.authenticate`/`discover`, no draft store, no submit transport, no formspec-engine call); the slice-1 honesty stops at the consumer. **The composition itself still wires all adapters at boot** because `src/app/main.tsx` calls `createDefaultComposition(activeConfig)` BEFORE the route is read — route-aware composition narrowing (parse route first; emit a status-only composition that wires only `statusReader` + policy resolver) is filed as **FW-0068** from the FW-0039 closeout independent architecture review (H-1). The arch-review F-9 closure tracked the consumer-level discipline; the wiring-level narrowing is FW-0068's scope.
- The runtime profile resolution still runs (instance + org + form-layer-empty) to honour ADR-0011 gating.
- The page shows nothing speculative — when the adapter returns `undefined` for an unknown URN, the page says "We don't have status for this reference. Check the link, or contact the sender." It does not say "the system is down" (it might not be) and it does not say "wait and try later" (that's a vendor-estimate dishonesty).

## Timing realism — what slice 1 displays, what it refuses to display

What the WOS `statusTimeline[]` shape carries, drawn from `ApplicantStatusTimelineEntry`:
- `event`: closed enum (case-created → applicant-task-assigned → applicant-task-submitted → decision-reached → ...)
- `occurredAt`: RFC 3339 timestamp
- `summary`: optional prose
- `newLifecycleState`: present when `event == lifecycle-changed`
- `taskId`: present for task-* events

What slice 1 derives from that shape **honestly**:
- **Per-stage duration on this case.** Time between consecutive timeline entries. Rendered as "X day(s)" / "X hour(s)" / "minutes" with the same `formatDate` helper extended to a `formatDuration`. Labelled "Your application's timing so far."
- **Current stage.** The most recent `event` from the timeline; the five-stage strip ("Received / In review / Decision drafted / Issued / Closed") highlights the cell that maps to the most recent event class, with the upcoming cells dimmed.
- **What's next.** Drawn from `openTasks[].title` and `openTasks[].deadline` when present. "You owe: X by Y." The deadline is a server-supplied date, not a synthetic SLA.
- **AI involvement disclosure.** When `ApplicantCaseDetail.aiInvolvement` is present, render "AI participated in this case" with the agent count, the role classifier (advisory / primary / fallback per the WOS schema), and the human-reviewed-all flag — copying the schema's plain-language framing verbatim. Required by the EU AI Act Article 13 / OMB M-24-10 obligation already encoded in the projection.

What slice 1 **refuses to display** in the absence of EXT-29:
- "Average wait for similar applications."
- "Decisions typically take N days."
- Any number derived from anything other than the timestamps on *this* case's own timeline.
- Any progress bar whose progress claims to project beyond the current stage.

In place of those, the timing strip shows a **prominent** labelled gap immediately above the per-case timing list — not as a footnote, not in italics. The literal copy is "Timing for similar applications is not yet available on this site." This is the honest framing the J-021 journey explicitly distinguishes from "your call is important to us" — the page says what it knows and is plain about what it doesn't (arch-review F-6).

The per-case label is also reshaped from the design's earlier "Your application's timing so far" (which subtly implies progress-toward-typical) to the more literal "Time since each step on your application." Both literal copy strings are fixture-pinned in `status-runtime.test.tsx#no aggregate copy` so any future edit must consciously break the assertion and re-justify the change.

## Architectural surface — minimal new code

- `src/app/StatusRuntime.tsx` (new) — accepts the parsed URL params, resolves the runtime profile, calls `StatusReader.readStatus`, renders the WOS-backed page. Layered like `RespondentRuntime`: render states are a `StatusViewState` discriminated union (`loading | unavailable | not-found | ready`).
- `src/app/App.tsx` (modify) — read `window.location` once; if pathname matches `/status`, load `StatusRuntime` instead of `RespondentRuntime`. Same lazy-import shape; same `CompositionProvider` wrapping; same shell chrome.
- `src/app/respondent-flow.ts` (modify) — `buildConfirmationTrackingUri(caseUrn)` helper that returns `/status?case={encoded caseUrn}` when the case URN is present, undefined otherwise. Used by the submit handler before constructing the confirmation prop.
- `src/adapters/stub/submit-transport.ts` (modify) — confirmation includes a deterministic `caseUrn` derived from the submission's reference number (e.g., `urn:wos:case_demo_{ref}`) so the stub composition can demonstrate the end-to-end flow in the smoke tests + demo Playwright spec.
- `src/composition/stub.ts` (modify) — register the stub `statusReader` with the deterministic case URN so the stub status route is reachable.
- `tests/app/status-runtime.test.tsx` (new) — covers loading, ready (5-stage strip + AI disclosure + open-task ribbon + timing strip + "no aggregate" copy), not-found, policy-disabled (org-forbidden / instance-unavailable), URN-based access without identity claim, and a runtime-error fall-through.
- `tests/adapters/stub-submit-transport.test.ts` (modify) — covers the new `caseUrn` field.
- `tests/e2e/placeholder-a11y.spec.ts` (modify) — end-to-end smoke that submits the demo form, clicks the "Track this application" link, and asserts axe-clean on the rendered status page.
- `docs/ports/status-reader.md` (new) — port-level adopter doc following the existing `docs/ports/*.md` pattern (already required for every port per M3 in the MVP audit).
- `docs/policy/runtime-feature-resolution.md` (modify) — add the `/status` route as a worked example of the optional-falls-off branch on a non-form surface.
- `thoughts/specs/2026-05-22-upstream-extension-queue.md` (modify) — file `EXT-29: WOS applicant API recent-throughput projection`.
- `PLANNING.md` (modify) — FW-0039 closes as `live (slice 1)`; FW-0067 opens for the throughput consumer slice.

## Non-goals (explicit, to bound scope)

- **No router dependency.** `window.location` parsing inside `App.tsx` is fine for two routes; add a router only when a third arrives.
- **No client-side soft navigation between `/` and `/status`.** Back/forward triggers a full reload; this is deliberate — soft nav between two unrelated runtimes adds router dep with no respondent value today (arch-review F-3).
- **No new port.** `StatusReader` is sufficient.
- **No `SubmitConfirmation.caseUrn` propagation to the production HTTP transport.** The new field is optional on the type and only the stub transport populates it; HTTP transport stays unchanged until the production status adapter lands (arch-review F-7).
- **No notification delivery for status changes.** `NotificationDelivery` port exists; status push is a separate row.
- **No persistence of viewed case URNs.** The respondent-place wallet (FW-0055/56/57) is the right place for that; FW-0039 is the surface, not the storage.
- **No status-vocabulary translation in the page.** Locale support inherits from the engine; the static labels go through the shell's existing label tooling. A locale-conditional status copy is a future row.
- **No JSON Schema for the URL params.** The URL is web vocabulary; the URN inside it is the cross-stack vocabulary.
- **No `tests/e2e/placeholder-a11y.spec.ts` rename.** Adding one test to the existing file is the smallest change; renaming the file is a separate cleanup belonging to a different row (arch-review F-5).

## Test coverage matrix

| Behaviour | Test |
|---|---|
| `/status?case=URN` renders five-stage strip from `statusTimeline` | `status-runtime.test.tsx#renders timeline` |
| Per-stage timing derived from adjacent timeline entries | `status-runtime.test.tsx#renders timing strip` |
| "Timing for similar applications is not yet available" rendered when no aggregate primitive available | `status-runtime.test.tsx#no aggregate copy` |
| AI involvement disclosure rendered when `aiInvolvement` present | `status-runtime.test.tsx#renders ai disclosure` |
| Open tasks rendered as what-comes-next | `status-runtime.test.tsx#renders open tasks` |
| Unknown URN → "We don't have status for this reference" plain-language page | `status-runtime.test.tsx#unknown urn` |
| `status` org-forbidden → "Status not shared" plain-language page | `status-runtime.test.tsx#org-forbidden` |
| `status` instance-unavailable → same "Status not shared. This site does not provide application status." plain-language page (NO typed error, NO RuntimePolicyErrorPage — see §Runtime feature framing per arch-review F-4) | `status-runtime.test.tsx#instance-unavailable` |
| `StatusRuntime` does NOT invoke `composition.identityProvider.authenticate()` | `status-runtime.test.tsx#no identity authenticate` |
| Submit flow surfaces a "Track this application" link when stub composition returns a case URN | `respondent-runtime.test.tsx#tracking link rendered` |
| Submit flow does NOT invent a tracking link when no case URN is returned | `respondent-runtime.test.tsx#no tracking link without caseUrn` |
| URL `/status` activates `StatusRuntime`, `/` keeps `RespondentRuntime` | `tests/app/app-routing.test.tsx#App route selection (FW-0039 slice 1)` |
| End-to-end submit + click-through to status page passes axe | `tests/e2e/placeholder-a11y.spec.ts#track this application` |

The fixture-driven `policy-resolution` case keeps the status-route gate honest at boot, parallel to the existing FW-0065 fixture set.

## Risks and what catches them

- **Risk:** the URN-as-token model leaks beyond the slice's honesty claim ("re-check from any browser" → "anyone with this link forever"). **Catch:** the design doc names the future hardening rows (FW-0054 long-life receipt; FW-0041 public-terminal hygiene) and the slice does not claim more than it delivers; the docs/policy file states the URN-as-possession-factor model so adopters whose threat model rejects it can wire a different adapter.
- **Risk:** the timing strip drifts into vendor-estimate territory under future copy edits. **Catch:** `status-runtime.test.tsx#no aggregate copy` pins the no-aggregate copy literally; copy edits trip the assertion.
- **Risk:** the `/status` route becomes a vector for status-data exfiltration via brute-force URN guessing. **Catch:** out of scope for this slice — the URN's UUIDv7 tail is high-entropy by construction, and rate-limiting is the adapter's job (production `ProxiedApplicantStatusAdapter` will gate). Slice 1 ships with this caveat documented in `docs/ports/status-reader.md`.
- **Risk:** the form-load error boundary semantics don't naturally cover the no-definition status route. **Catch:** `StatusRuntime` resolves the runtime profile by passing an empty form-policy to the resolver and treats `status` as an **optional** surface; the natural `optional-no-instance | org-forbidden | form-forbidden` branches drive the "Status not shared" copy. No typed `RuntimePolicyError` path on this route (arch-review F-4).

## What FW-0039 ships and what stays open

**Ships:**
- Standalone `/status?case={urn}` route with a real WOS-backed page.
- Accountless access via URN-as-possession-factor.
- Per-case timing from `statusTimeline` events.
- AI-involvement disclosure when present.
- Confirmation panel that hands the respondent the tracking link.
- Honest "no aggregate" framing in place of vendor estimates.
- Test coverage spanning policy-gate, port-mock, route selection, vocabulary firewall, accessibility, and the end-to-end submit→track click-through.

**Stays open (FW-0067, EXT-29):**
- Cross-case recent-throughput data ("most decisions issue within X days for this workflow").
- Production `ProxiedApplicantStatusAdapter` (the `Blocked on:` already named on FW-0039).
- URN expiry / magic-link rotation / browser-bound proof (FW-0054).
- Push notifications for status changes.
- Locale-conditional status copy.

## Deferred from Slice 1

- **`/status?ref={confirmationRef}` short-code resolution.** The §Decision bullet earlier promised both `?case={WosResourceUrn}` and `?ref={confirmationRef}` query forms. Slice 1 shipped only `?case=` (`src/app/status-route.ts:19`); `?ref=` was silently dropped. Strike the promise here per FW-0039 closeout independent arch-review L-2 — leaving the silent drift in is exactly the dishonesty FW-0039 is meant to avoid.
  - **Slice-2 follow-on path:** confirmation refs (today: `STUB-…` reference numbers from the stub submit transport) need a deterministic resolution to a `WosResourceUrn` before the `?ref=` parser can hand a URN to `StatusReader.readStatus`. For the stub composition this is trivial (the stub already binds `caseUrn = urn:wos:case_demo_{ref}` to the same reference number). For production this is an adapter-level concern — the `ProxiedApplicantStatusAdapter` named in FW-0039's release-gaps will need a `resolveRefToUrn(ref) => Promise<WosResourceUrn | undefined>` operation, or the production transport's `SubmitConfirmation` must carry both `referenceNumber` and `caseUrn` so the client never has to resolve. Pick when the production adapter lands; until then `?ref=` stays unimplemented and `parseStatusRoute` only honours `?case=`. Filed inline rather than as a new FW row because the slice-1 implementation gap is trivial (a one-line literal-to-URN map for the stub) and the production design call rides on the same FW-0039 release-gap (production `ProxiedApplicantStatusAdapter`).

- **Route-aware composition narrowing.** The §Accountless-access "the page renders without an `IdentityProvider` session" bullet was honest at the consumer level (`StatusRuntime` does not USE non-status ports) but overstated at the wiring level (`main.tsx` still calls `createDefaultComposition(activeConfig)` BEFORE the route is read, so every adapter — including formspec-engine init — boots regardless). Wiring-level narrowing is filed as **FW-0068** from the FW-0039 closeout independent arch-review H-1.

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline
- [web ADR-0010](../adr/0010-respondent-place-trust-model.md) — `StatusReader` port consumption
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `status` capability key
- [FW-0065 plan](../plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md) — gating + plumbing already shipped
- [FW-0039 implementation plan](../plans/2026-05-23-fw-0039-post-submit-status-surface.md) — task-by-task execution
- [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](2026-05-22-upstream-extension-queue.md) — EXT-29 throughput projection filed here
