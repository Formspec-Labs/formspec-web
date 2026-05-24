# FW-0057 — Cross-issuer respondent history (slice 1) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship slice 1 of FW-0057 — a new `RespondentHistorySource` port + standalone `/history` route that renders a respondent-owned timeline of drafts, submissions, and signed records across multiple senders. Add `crossIssuerHistory` as the fifth runtime-feature key. Add the fifth narrowed-route descriptor (no new sibling-factory family per FW-0070). Honest copy for every deferred capability (XS-2 production fan-out, draft resume, lifecycle actions, search/filter/export).

**Design:** [`thoughts/specs/2026-05-24-fw-0057-cross-issuer-history-design.md`](../specs/2026-05-24-fw-0057-cross-issuer-history-design.md).

**Architecture:** New `RespondentHistorySource` port → new stub + unavailable adapters → new `respondentHistorySource` slot on `Composition` → new `crossIssuerHistory` feature key + `FEATURE_PORT_MAP` entry → new `HISTORY_ROUTE_NARROWING` descriptor with new `consumesHistory` flag → new `HistoryRuntime.tsx` consuming the port behind `ResolvedRuntimeProfile` resolution → `App.tsx` + `chooseComposition` extended for `/history`. Shared `history-view.tsx` for future in-form composition.

**Tech Stack:** TypeScript 5 strict, React 19, Vitest, Playwright (axe). No new runtime dependencies.

---

## File Structure

**New files:**

- `src/ports/respondent-history-source.ts` — port interface + types.
- `src/adapters/stub/respondent-history-source.ts` — `stubRespondentHistorySource(snapshot)`.
- `src/adapters/unavailable/respondent-history-source.ts` — `unavailableRespondentHistorySource()`.
- `src/demo/respondent-history.ts` — `demoHistorySnapshot()` fixture.
- `src/app/history-route.ts` — `parseHistoryRoute(href)` + `HISTORY_ROUTE_NARROWING`.
- `src/app/HistoryRuntime.tsx` — standalone history dashboard.
- `src/app/history-view.tsx` — shared `HistoryEntryItem` + `groupAndSortHistory` + `uniqueIssuerCount` + `HISTORY_KIND_ORDER`.
- `docs/ports/respondent-history-source.md` — adopter doc.
- `tests/adapter-conformance/respondent-history-source/conformance.test.ts` — conformance harness.
- `tests/adapters/respondent-history-source-stub.test.ts` — stub-specific.
- `tests/adapters/respondent-history-source-unavailable.test.ts` — sentinel-specific.
- `tests/app/history-route.test.ts` — URL parsing fixtures.
- `tests/app/history-view.test.tsx` — shared module.
- `tests/app/history-runtime.test.tsx` — component coverage matrix.
- `tests/policy-resolution/cases/cross-issuer-history-disabled-no-instance.json`
- `tests/policy-resolution/cases/cross-issuer-history-disabled-org-forbidden.json`
- `tests/policy-resolution/cases/cross-issuer-history-demo-stub-satisfies-optional.json`

**Modified files:**

- `src/ports/index.ts` — re-export new types.
- `src/adapter-conformance/conformance.ts` — add `defineRespondentHistorySourceConformance` + subject type.
- `src/adapter-conformance/index.ts` — re-export.
- `src/adapter-conformance/assertions.ts` — add `isHistorySnapshot` type-guard.
- `src/adapter-conformance/fixtures.ts` — add `sampleHistorySnapshot`.
- `tests/adapter-conformance/_framework/conformance.ts` — re-export new define.
- `scripts/check-conformance-coverage.mjs` — add port suite + stub + unavailable sentinel registrations.
- `src/policy/feature-keys.ts` — append `'crossIssuerHistory'`.
- `src/policy/feature-port-map.ts` — add `crossIssuerHistory: 'respondentHistorySource'`.
- `src/composition/types.ts` — add `respondentHistorySource` slot.
- `src/composition/route-narrowing.ts` — add `consumesHistory` flag to `RouteNarrowing`; extend wiring.
- `src/composition/default.ts` — wire `unavailableRespondentHistorySource()` + declare `crossIssuerHistory: 'unavailable'` + add to `org.features`.
- `src/composition/stub.ts` — wire `stubRespondentHistorySource(demoHistorySnapshot())` + declare `crossIssuerHistory: 'demo-stub'` + add to `org.features`.
- `src/app/main-helpers.ts` — extend `chooseComposition` for `/history`.
- `src/app/App.tsx` — add `/history` branch + extend `RuntimeState`.
- `src/policy/feature-keys.test.ts` — append assertion.
- `tests/adapters/unavailable-sentinel.test.ts` — extend with new sentinel.
- `tests/adapters/demo-stub-marker.test.ts` — extend with new stub.
- `tests/app/app-routing.test.tsx` — add `/history` case.
- `tests/app/status-boot-narrowing.test.ts` — add `/history` chooseComposition case.
- `tests/composition/route-narrowing.test.ts` — descriptor coverage + `consumesHistory` flag.
- `tests/profiles/composition-coherence.test.ts` — descriptor matrix picks up the fifth descriptor; new-slot assertion breadth.
- `tests/smoke/composition.test.ts` — same matrix; explicit smoke for the new slot.
- `tests/policy-resolution/cases/*.json` — backfill the new `crossIssuerHistory` key in all 13+ existing cases (instance + org blocks).
- `docs/policy/runtime-feature-resolution.md` — add `crossIssuerHistory` key + `/history` worked example.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` — footer bullet.
- `PLANNING.md` — FW-0057 closes; new FW-0078 follow-on row filed.

**NOT modified:**

- `src/ports/respondent-place-source.ts` — no change to the place port.
- `src/adapters/stub/respondent-place-source.ts` — already returns demo data.
- `src/adapters/unavailable/respondent-place-source.ts` — unchanged.
- `src/adapters/noop-for-narrowed-route/*` — already supports any `routeCite`.

---

### Task 1: Append `crossIssuerHistory` to the closed taxonomy

**Files:**
- Modify: `src/policy/feature-keys.ts`
- Modify: `src/policy/feature-keys.test.ts`

- [ ] **Step 1: Extend the `RUNTIME_FEATURE_KEYS` test** to assert the new fifth key in the append-only ordering.
- [ ] **Step 2: Run test to verify FAIL.**
- [ ] **Step 3: Append `'crossIssuerHistory'`** to the tuple + extend the doc comment to cite FW-0057 as the fifth extension.
- [ ] **Step 4: Run test to verify PASS.**

---

### Task 2: New port + types

**Files:**
- Create: `src/ports/respondent-history-source.ts`
- Modify: `src/ports/index.ts`

- [ ] **Step 1: Create the port file** with `RespondentHistorySource`, `HistoryQuery`, `HistorySnapshot`, `HistoryEntry`, `HistoryEntryKind`, `HistoryIssuerRef` per design §"Port shape." Single-method port `readHistory(query) → Promise<HistorySnapshot>`.
- [ ] **Step 2: Re-export the new types** from `src/ports/index.ts`.
- [ ] **Step 3: Verify `npm run typecheck` green** (no consumers yet, so this is just type compilation).

---

### Task 3: Stub + unavailable adapters

**Files:**
- Create: `src/adapters/stub/respondent-history-source.ts`
- Create: `src/adapters/unavailable/respondent-history-source.ts`
- Create: `tests/adapters/respondent-history-source-stub.test.ts`
- Create: `tests/adapters/respondent-history-source-unavailable.test.ts`
- Modify: `tests/adapters/unavailable-sentinel.test.ts`
- Modify: `tests/adapters/demo-stub-marker.test.ts`

- [ ] **Step 1: Write the failing stub test** — assert factory returns a `RespondentHistorySource`, that the returned adapter carries the `DEMO_STUB_ADAPTER` marker, and round-trips a passed-in snapshot.
- [ ] **Step 2: Write the failing unavailable test** — assert `readHistory` throws with a plain-language adopter-facing message; assert the `UNAVAILABLE_ADAPTER` marker.
- [ ] **Step 3: Run tests to verify FAIL.**
- [ ] **Step 4: Implement** the two adapters per the existing FW-0033 / FW-0056 pattern.
- [ ] **Step 5: Extend `unavailable-sentinel.test.ts`** + `demo-stub-marker.test.ts` with the new adapter registrations.
- [ ] **Step 6: Run tests to verify PASS.**

---

### Task 4: Conformance suite

**Files:**
- Modify: `src/adapter-conformance/conformance.ts`
- Modify: `src/adapter-conformance/index.ts`
- Modify: `src/adapter-conformance/assertions.ts`
- Modify: `src/adapter-conformance/fixtures.ts`
- Modify: `tests/adapter-conformance/_framework/conformance.ts`
- Create: `tests/adapter-conformance/respondent-history-source/conformance.test.ts`
- Modify: `scripts/check-conformance-coverage.mjs`

- [ ] **Step 1: Add `sampleHistorySnapshot`** to `fixtures.ts` — a 3-entry fixture across 2 issuers covering all three kinds.
- [ ] **Step 2: Add `isHistorySnapshot` type-guard** to `assertions.ts` (structural check + closed-set kind + non-array `entries` rejection).
- [ ] **Step 3: Add `RespondentHistorySourceConformanceSubject` + `defineRespondentHistorySourceConformance`** to `conformance.ts`. Cases: round-trip via `roundTripJson`; closed-set `kind`; per-entry `id` + `kind` + `issuer.name` + `timestamp` + `title` present; non-array `entries` rejected; empty `entries[]` returns valid snapshot (no throw); reject `aggregationMode` outside `'client-wallet'`. Mirror the `defineRespondentPlaceSourceConformance` shape.
- [ ] **Step 4: Re-export** the new define + subject type from `index.ts` and the test `_framework`.
- [ ] **Step 5: Write the conformance test file** — calls `defineRespondentHistorySourceConformance` with the stub.
- [ ] **Step 6: Update `scripts/check-conformance-coverage.mjs`** — add `RespondentHistorySource` to `portSuites`, the stub path to `stubPortsByPath`, the unavailable sentinel to `unavailableSentinelFactoriesByPath`, and `defineRespondentHistorySourceConformance` to `requiredHarnessExports`.
- [ ] **Step 7: Run `npm run check:conformance-coverage`** to verify green; run the conformance test to verify PASS.

---

### Task 5: Demo fixture + composition slot

**Files:**
- Create: `src/demo/respondent-history.ts`
- Modify: `src/composition/types.ts`
- Modify: `src/policy/feature-port-map.ts`

- [ ] **Step 1: Create `demoHistorySnapshot()`** in `src/demo/respondent-history.ts` — 4 entries across 2 issuers: 1 draft (Example Tax Office, "Q2 tax filing draft"), 2 submissions (Example Department of Benefits "Benefits intake" with applicantStatusRef matching the demo case URN, Example Housing Office "Housing assistance application"), 1 signed-record (Example Department of Benefits "Benefits intake receipt" with documentRefs pointing to the demo doc ids). ISO-8601 timestamps span ~30 days for sort-order visibility.
- [ ] **Step 2: Extend `Composition`** in `composition/types.ts` — add `respondentHistorySource: RespondentHistorySource` slot with doc comment citing FW-0057.
- [ ] **Step 3: Add `crossIssuerHistory: 'respondentHistorySource'`** to `FEATURE_PORT_MAP` with comment citing FW-0057.
- [ ] **Step 4: Verify `npm run typecheck`** — every Composition consumer will FAIL to compile until the slot is wired. This is the dependency that drives Task 6.

---

### Task 6: Wire the new slot into the three full-app composition factories + route-narrowing

**Files:**
- Modify: `src/composition/default.ts`
- Modify: `src/composition/stub.ts`
- Modify: `src/composition/route-narrowing.ts`

- [ ] **Step 1: `src/composition/default.ts`** — wire `unavailableRespondentHistorySource()` into the production composition slot; add `crossIssuerHistory: 'unavailable'` to `instanceCapabilities`; add `crossIssuerHistory: 'allowed'` to `orgRuntimePolicy.features`.
- [ ] **Step 2: `src/composition/stub.ts`** — wire `stubRespondentHistorySource(demoHistorySnapshot())` into the stub composition slot; add `crossIssuerHistory: 'demo-stub'` to `instanceCapabilities`; add `crossIssuerHistory: 'allowed'` to `orgRuntimePolicy.features`.
- [ ] **Step 3: `src/composition/route-narrowing.ts`** — extend `RouteNarrowing` interface with `consumesHistory: boolean`; extend `buildProductionNarrowedComposition` + `buildDemoNarrowedComposition` to wire the new slot per the flag (production: always sentinel today; demo: stub when `consumesHistory`, sentinel otherwise) + declare `instanceCapabilities.crossIssuerHistory` accordingly + add `crossIssuerHistory: 'allowed'` to `defaultOrgRuntimePolicy()`.
- [ ] **Step 4: Update existing STATUS_/OBLIGATIONS_/DOCUMENTS_ROUTE_NARROWING descriptors** to set `consumesHistory: false` (those routes don't consume history).
- [ ] **Step 5: Verify `npm run typecheck`** green.

---

### Task 7: URL route parser + `HISTORY_ROUTE_NARROWING` descriptor

**Files:**
- Create: `src/app/history-route.ts`
- Create: `tests/app/history-route.test.ts`

- [ ] **Step 1: Write the failing test** mirroring `documents-route.test.ts` — fixtures for `/history`, `/history/foo` (no match), `/history?x=y` (match, ignore params), invalid URL.
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** `parseHistoryRoute(href)` + the `HISTORY_ROUTE_NARROWING` descriptor (`routeCite: '/history'`, `initialDefinitionUrlSentinel: 'about:not-constructed#fw-0057'`, `consumesRespondentPlace: false`, `consumesStatus: false`, `identityBound: true`, `consumesHistory: true`).
- [ ] **Step 4: Run to verify PASS.**

---

### Task 8: Shared `history-view.tsx` helpers

**Files:**
- Create: `src/app/history-view.tsx`
- Create: `tests/app/history-view.test.tsx`

- [ ] **Step 1: Write the failing test** covering `groupAndSortHistory`, `uniqueIssuerCount`, `HISTORY_KIND_ORDER` (drafts → submissions → signed-records), and an isolated `HistoryEntryItem` render. Mirror the `documents-view.test.tsx` shape.
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement `history-view.tsx`** — exports `HistoryEntryItem`, `groupAndSortHistory`, `uniqueIssuerCount`, `HISTORY_KIND_ORDER`, and the `GroupedHistory` type. Group by `kind` in closed-taxonomy order; sort within section by `timestamp` desc, ties broken by `id` asc.
- [ ] **Step 4: Verify tests pass.**

---

### Task 9: `HistoryRuntime` scaffold + route discovery in `App.tsx`

**Files:**
- Create: `src/app/HistoryRuntime.tsx` (scaffold)
- Modify: `src/app/App.tsx`
- Modify: `tests/app/app-routing.test.tsx`

- [ ] **Step 1: Extend the App routing test** to add `/history` case. Mock `window.location.href`; assert `HistoryRuntime` mounts.
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Scaffold `HistoryRuntime`** — accepts `{ composition, config }`; renders `<h1>Your history</h1>` + loading skeleton. Full render lands in Task 10.
- [ ] **Step 4: Wire `App.tsx`** — extend the route switch to add the `/history` branch alongside `/documents` (parse → lazy-load → mount). Update `RuntimeState` discriminated union with a `'history'` route variant.
- [ ] **Step 5: Verify test passes.**

---

### Task 10: `HistoryRuntime` full render (load-bearing task)

**Files:**
- Modify: `src/app/HistoryRuntime.tsx`
- Create: `tests/app/history-runtime.test.tsx`

Use `DocumentsRuntime.tsx` as the structural precedent.

- [ ] **Step 1: Write the failing test matrix** covering every behaviour in design §"Test coverage matrix" — ~25 cases (sections, sort, header, deferred copy, empty, disabled-cause variants, auth-required, cross-route links, suppressed links, consumer discipline x4 ports, vocabulary firewall, adapter-error).
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** — layered as `DocumentsRuntime`:
  - State machine: `loading | auth-required | disabled | policy-error | ready | adapter-error`.
  - Synthesize `form: { features: { crossIssuerHistory: 'optional' } }` at the route boundary per ADR-0011 §"Non-form surface synthesis" addendum.
  - Reuse `resolveRuntimeFeatures` from `src/policy/resolver.ts`.
  - Reuse `signInOptionsForIdentityPolicy` from `respondent-flow.ts` for identity boot.
  - Render: heading "Your history"; cross-sender header `N record(s) across M sender(s)`; deferred-capability paragraph; per-kind sections from `groupAndSortHistory`; each entry uses `HistoryEntryItem` from the shared module.
  - Per-entry cross-route hyperlinks: status link to `/status?case={encodeURIComponent(applicantStatusRef)}` when set; documents link to `/documents` (no deep-link) when `documentRefs.length > 0`.
  - Pinned copy exports for fixture-pinning tests: `DEFERRED_CAPABILITY_COPY`, `EMPTY_STATE_COPY`, `NOT_SHARED_UNAVAILABLE_COPY`, `NOT_SHARED_ORG_FORBIDDEN_COPY`.
- [ ] **Step 4: Verify all tests pass.**

---

### Task 11: `chooseComposition` dispatch + boot-narrowing test

**Files:**
- Modify: `src/app/main-helpers.ts`
- Modify: `tests/app/status-boot-narrowing.test.ts`

- [ ] **Step 1: Extend the boot-narrowing test** with a `chooseComposition picks the history-route factory` case.
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Extend `chooseComposition`** — add the `parseHistoryRoute` branch dispatching to `createRouteNarrowedComposition({ mode: 'default', config, route: HISTORY_ROUTE_NARROWING })`.
- [ ] **Step 4: Run to verify PASS.**

---

### Task 12: Resolver fixtures + backfill existing cases

**Files:**
- Create: 3 new resolver JSON cases (see File Structure).
- Modify: every existing `tests/policy-resolution/cases/*.json` to add `crossIssuerHistory` to `instance` + `org.features` blocks (append-only key contract).
- Verify: `tests/policy-resolution/resolve-cases.test.ts` (auto-discovers cases).

- [ ] **Step 1: List existing case files** to know how many need backfill.
- [ ] **Step 2: Read one existing case** to confirm the JSON shape.
- [ ] **Step 3: Backfill the existing cases** — add the new key to `instance` (matching the case's posture; default `unavailable` for `production`, `demo-stub` for `demo`) + `org.features.crossIssuerHistory: 'allowed'`. Update `expect.disabled` to include `crossIssuerHistory: 'not-requested'` when the key isn't in the form policy.
- [ ] **Step 4: Write the three new cases** — `cross-issuer-history-disabled-no-instance.json`, `cross-issuer-history-disabled-org-forbidden.json`, `cross-issuer-history-demo-stub-satisfies-optional.json`.
- [ ] **Step 5: Run the resolver test to verify all cases pass.**

---

### Task 13: Composition coherence + smoke tests

**Files:**
- Modify: `tests/composition/route-narrowing.test.ts`
- Modify: `tests/profiles/composition-coherence.test.ts`
- Modify: `tests/smoke/composition.test.ts`

- [ ] **Step 1: Extend `route-narrowing.test.ts`** with descriptor coverage for `HISTORY_ROUTE_NARROWING` + `consumesHistory` flag wiring (production wires sentinel + declares `unavailable`; demo wires stub + declares `demo-stub`).
- [ ] **Step 2: Verify `composition-coherence.test.ts`** — the descriptor matrix auto-picks up `HISTORY_ROUTE_NARROWING`; add one new assertion per descriptor pinning the `respondentHistorySource` slot ↔ `crossIssuerHistory` declaration agreement.
- [ ] **Step 3: Verify `smoke/composition.test.ts`** — descriptor matrix auto-picks up the new descriptor; add explicit smoke assertion that full-app stub composition wires `stubRespondentHistorySource` + declares `'demo-stub'`, and full-app default wires `unavailableRespondentHistorySource` + declares `'unavailable'`.
- [ ] **Step 4: Run tests to verify PASS.**

---

### Task 14: Adopter doc + policy doc + ADR cross-link

**Files:**
- Create: `docs/ports/respondent-history-source.md`
- Modify: `docs/policy/runtime-feature-resolution.md`
- Modify: `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md`

- [ ] **Step 1: Author `docs/ports/respondent-history-source.md`** — per the established template (see `docs/ports/respondent-place-source.md` for the precedent): §Contract, §Consumers (`HistoryRuntime` at `/history`), §Reference adapters (stub + unavailable), §Conformance suite (path), §Substrate vs port boundary (cross-issuer fan-out via XS-2 is the adapter's concern, NOT the port's), §What slice 1 does NOT ship.
- [ ] **Step 2: Extend `docs/policy/runtime-feature-resolution.md`** — add `crossIssuerHistory` to the feature-keys list with FW-0057 citation; add a "/history route as an optional non-form surface (FW-0057 slice 1)" worked example with the same instance×org verdict table the `/documents` example uses.
- [ ] **Step 3: ADR-0011 footer** — append one bullet: "Implementation plan: [`thoughts/plans/2026-05-24-fw-0057-cross-issuer-history.md`](../plans/2026-05-24-fw-0057-cross-issuer-history.md) — fifth non-form surface; introduces `crossIssuerHistory` to the closed `RuntimeFeatureKey` taxonomy + new `RespondentHistorySource` port (FW-0057 slice 1: `/history` route)."

---

### Task 15: PLANNING.md updates

**Files:**
- Modify: `PLANNING.md`

- [ ] **Step 1: PLANNING.md FW-0057** — move row to `## Closed` with:
  - `Status: live (slice 1)`
  - `What slice 1 landed:` mirror the FW-0055 / FW-0056 closed entries for shape.
  - `Done (slice 1):` test-coverage list + adapters + doc updates + `npm run ci` green.
  - `Release gaps named:` (a) production cross-issuer adapter — blocked on XS-2 (already filed upstream); (b) draft resume — blocked on EXT-26 + EXT-27; (c) signed-record receipt detail — FW-0009 / FW-0010 territory; (d) lifecycle actions on past records — FW-0034; (e) search / filter / faceted sort — filed as new follow-on row; (f) calendar / iCal export — filed as new follow-on row; (g) deletion semantics (drafts vs submissions) — FW-0043 + FW-0034; (h) cross-deployment history — wallet substrate work; (i) per-kind enriched fields — couples to FW-0034 / FW-0009; (j) descriptor-flag consolidation if a sixth feature key lands.
  - `Note:` Closes web ADR-0011 §Failure Semantics for a fourth OPTIONAL non-form surface + introduces the fifth extension of the closed `RuntimeFeatureKey` taxonomy. Validates the FW-0070 parameterized factory + descriptor flag pattern for the fifth narrowed route. Adds the first new respondent-side port since FW-0033's `AttachmentStore`.
- [ ] **Step 2: Add the new tier-4 entry to FW-0057 row's `Backs:`** if not already set; verify the cross-links to the design + plan are present.
- [ ] **Step 3: File FW-0078 (production cross-issuer history wiring)** in the open Post-MVP section as the post-XS-2 follow-on row.

---

### Task 16: Full-suite verification + commits

- [ ] **Step 1:** `npm run typecheck` green.
- [ ] **Step 2:** `npm run lint` green.
- [ ] **Step 3:** `npm run check:conformance-coverage` green.
- [ ] **Step 4:** `npx vitest run` green (every suite).
- [ ] **Step 5:** `npm run ci` green.
- [ ] **Step 6:** Commit with explicit-paths form per stack-root CLAUDE.md. Incremental commits per logical group (port + adapters; conformance + script; composition wiring; runtime + view; routing + boot-narrowing; resolver fixtures; coherence tests; docs; PLANNING). Verify each commit with `git log --oneline` immediately after.
- [ ] **Step 7:** Stage parent submodule pointer at `formspec-stack` (do NOT push).

---

## Out-of-scope cleanups (file as follow-on rows or leave for craftsman judgment)

- Soft-navigation between five routes — needs router; deferred.
- Demo "fake" XS-2 token bag — explicitly rejected per design §"Non-goals."
- Production cross-issuer adapter — slice 2; blocked on XS-2.
- Descriptor-flag consolidation (per-feature-key registry replacing the `consumes*` boolean ladder) — trigger fires at the sixth feature key; track in the FW-0057 closeout note.

## Design-claim → test mapping

| Design claim | Test |
|---|---|
| Standalone /history route | `history-route.test.ts` + `app-routing.test.tsx` |
| Per-kind section grouping + sort + cross-sender header | `history-view.test.tsx` + `history-runtime.test.tsx#renders kind sections` / `#sort order` / `#cross-sender header` |
| Cross-route status link rendered when applicantStatusRef present | `history-runtime.test.tsx#status link` |
| Cross-route documents link rendered when documentRefs[] present | `history-runtime.test.tsx#documents link` |
| Unresolvable refs suppress hyperlinks | `history-runtime.test.tsx#suppressed link` |
| Deferred-capability copy fixture-pinned | `history-runtime.test.tsx#deferred capability copy` |
| Empty-state copy | `history-runtime.test.tsx#empty state` |
| Disabled-cause copy (instance + org) | `history-runtime.test.tsx#instance-unavailable` / `#org-forbidden` |
| Identity-required + auth fallback | `history-runtime.test.tsx#auth required` |
| Consumer discipline (no StatusReader, no form ports, no PlaceSource) | `history-runtime.test.tsx#no foreign ports` |
| Vocabulary firewall | `history-runtime.test.tsx#vocabulary firewall` |
| `crossIssuerHistory` in feature-key registry | `src/policy/feature-keys.test.ts` (extended) |
| Composition coherence across full-app + narrowed-route descriptors | `tests/profiles/composition-coherence.test.ts` (descriptor matrix) + `tests/smoke/composition.test.ts` (new-slot smoke) |
| Resolver: disabled-no-instance + disabled-org-forbidden + demo-stub-satisfies-optional | `tests/policy-resolution/cases/cross-issuer-history-*.json` |
| Stub adapter conformance (round-trip, kind taxonomy, time-ordering, empty) | `tests/adapter-conformance/respondent-history-source/conformance.test.ts` |
| Stub adapter cross-issuer fixture behavior | `tests/adapters/respondent-history-source-stub.test.ts` |
| Unavailable sentinel throws + marker registered | `tests/adapters/respondent-history-source-unavailable.test.ts` + `tests/adapters/unavailable-sentinel.test.ts` |
| Demo stub marker registered | `tests/adapters/demo-stub-marker.test.ts` |
| `chooseComposition` dispatches to the new descriptor | `tests/app/status-boot-narrowing.test.ts#history-route` |
| `RouteNarrowing.consumesHistory` flag wires the new slot | `tests/composition/route-narrowing.test.ts` |
