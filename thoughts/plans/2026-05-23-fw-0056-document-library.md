# FW-0056 — Respondent document library + selective presentation (slice 1) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship slice 1 of FW-0056 — a standalone `/documents` route that renders `RespondentPlaceSource.readPlace().documents` as a per-kind-grouped library with a selection action that captures intent + honestly defers selective presentation. Add `documentPresentation` as the first extension to the closed `RuntimeFeatureKey` taxonomy. Add the fourth sibling-factory family (`createDefault/Stub/DemoDocumentsRouteComposition`) following the FW-0068 + FW-0055 pattern.

**Design:** [`thoughts/specs/2026-05-23-fw-0056-document-library-design.md`](../specs/2026-05-23-fw-0056-document-library-design.md).

**Architecture:** New `DocumentsRuntime` consumes `composition.respondentPlaceSource` + `composition.identityProvider` + `ResolvedRuntimeProfile`; does NOT call StatusReader / DraftStore / SubmitTransport / DefinitionSource. `App.tsx` parses the URL and selects between `RespondentRuntime`, `StatusRuntime`, `ObligationsRuntime`, `DocumentsRuntime`. `chooseComposition` dispatches to the fourth sibling factory. The in-form `DocumentItem` extracts to a shared `src/app/documents-view.tsx` so both surfaces share one render.

**Tech Stack:** TypeScript 5 strict, React 19, Vitest, Playwright (axe). No new runtime dependencies.

---

## File Structure

**New files:**

- `src/app/DocumentsRuntime.tsx` — standalone documents dashboard.
- `src/app/documents-route.ts` — pure URL parser.
- `src/app/documents-view.tsx` — shared `DocumentItem` + group-by-kind + sort helpers.
- `tests/app/documents-route.test.ts` — URL parsing fixtures.
- `tests/app/documents-view.test.tsx` — shared component coverage.
- `tests/app/documents-runtime.test.tsx` — component coverage matrix.
- `tests/policy-resolution/cases/document-presentation-disabled-no-instance.ts` — resolver fixture.
- `tests/policy-resolution/cases/document-presentation-disabled-org-forbidden.ts` — resolver fixture.

**Modified files:**

- `src/policy/feature-keys.ts` — append `'documentPresentation'`.
- `src/policy/feature-port-map.ts` — add `documentPresentation: 'respondentPlaceSource'` (transitional).
- `src/composition/default.ts` — add `createDefaultDocumentsRouteComposition`.
- `src/composition/stub.ts` — add `createStubDocumentsRouteComposition`.
- `src/composition/demo.ts` — add `createDemoDocumentsRouteComposition`.
- `src/app/main-helpers.ts` — extend `chooseComposition` for `/documents`.
- `src/app/App.tsx` — add `/documents` branch.
- `src/app/RespondentRuntime.tsx` — re-import `DocumentItem` from `documents-view.tsx`; remove local definition.
- `tests/app/app-routing.test.tsx` — add `/documents` case.
- `tests/app/status-boot-narrowing.test.ts` — extend with `/documents` chooseComposition case.
- `tests/smoke/composition.test.ts` — extend with FW-0056 factory tests.
- `tests/e2e/placeholder-a11y.spec.ts` — extend with `/documents` axe-clean visit.
- `docs/ports/respondent-place-source.md` — add `DocumentsRuntime` to §Consumers.
- `docs/policy/runtime-feature-resolution.md` — document `documentPresentation` key.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` — footer bullet.
- `PLANNING.md` — FW-0056 closes; FW-0070 opens; FW-0066 row cites FW-0056 trigger.

**NOT modified:**

- `src/ports/respondent-place-source.ts` — no port change.
- `src/adapter-conformance/conformance.ts` — already covers `documents` + `presentationPolicies` shape.
- `src/adapters/stub/respondent-place-source.ts` — already returns demo documents.
- `src/adapters/unavailable/respondent-place-source.ts` — already throws via the sentinel.
- `src/adapters/noop-for-narrowed-route/*` — already supports `/documents` cite via the `routeCite` arg.

---

### Task 1: Append `documentPresentation` to the closed `RuntimeFeatureKey` taxonomy

**Files:**
- Modify: `src/policy/feature-keys.ts`
- Modify: `src/policy/feature-port-map.ts`
- Verify: `src/policy/feature-keys.test.ts` (existing — extend its assertion)

- [ ] **Step 1: Extend the `RUNTIME_FEATURE_KEYS` test** to assert the new key.
- [ ] **Step 2: Run test to verify FAIL.**
- [ ] **Step 3: Append `'documentPresentation'`** to the tuple (per the append-only ordering comment).
- [ ] **Step 4: Add `documentPresentation: 'respondentPlaceSource'`** to `FEATURE_PORT_MAP` with a code comment naming the transitional substrate + future VP port slot ratification (SC-4 / FW-0066).
- [ ] **Step 5: Run test to verify PASS.**

---

### Task 2: URL route parser

**Files:**
- Create: `src/app/documents-route.ts`
- Create: `tests/app/documents-route.test.ts`

- [ ] **Step 1: Write the failing test** mirroring `obligations-route.test.ts` structure.
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** — `parseDocumentsRoute(href)` returns `{} | null`; matches pathname `/documents` exactly.
- [ ] **Step 4: Run to verify PASS.**

---

### Task 3: Extract shared documents view helpers

**Files:**
- Create: `src/app/documents-view.tsx`
- Create: `tests/app/documents-view.test.tsx`
- Modify: `src/app/RespondentRuntime.tsx`

- [ ] **Step 1: Write failing test** for `groupAndSortDocuments` + `uniqueKindCount` + `DocumentItem` render parity (mirrors `obligations-view.test.tsx` shape).
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement `documents-view.tsx`** — exports `DocumentItem`, `groupAndSortDocuments`, `uniqueKindCount`, `GroupedDocuments`. Group by `kind`; sort within section by `capturedAt` desc, undefined last, ties broken by `displayName`.
- [ ] **Step 4: Update `RespondentRuntime.tsx`** to import `DocumentItem` from `./documents-view.tsx`; remove the local definition. Verify in-form panel render is unchanged via existing `respondent-runtime.test.tsx`.
- [ ] **Step 5: Verify all tests pass.**

---

### Task 4: `DocumentsRuntime` scaffold + route discovery in `App.tsx`

**Files:**
- Create: `src/app/DocumentsRuntime.tsx` (scaffold)
- Modify: `src/app/App.tsx`
- Modify: `tests/app/app-routing.test.tsx`

- [ ] **Step 1: Extend the App routing test** to add `/documents` case. Mock `window.location.href`; assert `DocumentsRuntime` mounts.
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Scaffold `DocumentsRuntime`** — accepts `{ composition, config }` props, renders `<h1>Your documents</h1>` + loading skeleton. Full render lands in Task 5.
- [ ] **Step 4: Wire `App.tsx`** — extend the route switch to add the `/documents` branch alongside `/obligations`. Update `RuntimeState` discriminated union.
- [ ] **Step 5: Verify test passes.**

---

### Task 5: `DocumentsRuntime` full render

**Files:**
- Modify: `src/app/DocumentsRuntime.tsx`
- Create: `tests/app/documents-runtime.test.tsx`

This is the load-bearing task. Use `ObligationsRuntime.tsx` as the structural precedent.

- [ ] **Step 1: Write the failing test matrix** covering every behaviour in design §"Test coverage matrix".
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** — layered as `ObligationsRuntime`:
  - State machine: `loading | auth-required | disabled | policy-error | ready | adapter-error`.
  - Synthesize `form: { features: { respondentPlace: 'optional', documentPresentation: 'optional' } }` at the route boundary.
  - Reuse `resolveRuntimeFeatures` from `src/policy/resolver.ts`.
  - "Use this document…" selection action: local `useState<Record<documentId, boolean>>` for disclosure-open state; clicking opens a `<details>`/disclosure block that lists matching `presentationPolicies[]` scope (if any) + the literal deferred-presentation copy.
  - Pinned copy exports for fixture-pinning tests: `DEFERRED_CAPABILITY_COPY`, `EMPTY_STATE_COPY`, `NOT_SHARED_UNAVAILABLE_COPY`, `NOT_SHARED_ORG_FORBIDDEN_COPY`, `DEFERRED_PRESENTATION_COPY`.
- [ ] **Step 4: Verify all tests pass.**

---

### Task 6: Sibling-factory family (production / stub / demo)

**Files:**
- Modify: `src/composition/default.ts`
- Modify: `src/composition/stub.ts`
- Modify: `src/composition/demo.ts`
- Modify: `src/app/main-helpers.ts`
- Modify: `tests/smoke/composition.test.ts`
- Modify: `tests/app/status-boot-narrowing.test.ts`

- [ ] **Step 1: Extend `tests/smoke/composition.test.ts`** with FW-0056 factory tests mirroring the FW-0055 + FW-0068 pattern (production + stub + demo variants; verify wired ports + noop ports + capability declarations).
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Add the three factories** — mirror the existing obligations-route family:
  - `createDefaultDocumentsRouteComposition` in `default.ts` (with the same MED-4 identity gating pattern FW-0055 uses).
  - `createStubDocumentsRouteComposition` in `stub.ts`.
  - `createDemoDocumentsRouteComposition` in `demo.ts` (delegates to stub).
- [ ] **Step 4: Extend `chooseComposition`** in `main-helpers.ts` to dispatch to `createDefaultDocumentsRouteComposition` for `/documents`.
- [ ] **Step 5: Extend `status-boot-narrowing.test.ts`** with the `chooseComposition` case for `/documents`.
- [ ] **Step 6: Verify all tests pass.**

---

### Task 7: Resolver fixtures for the new key

**Files:**
- Create: `tests/policy-resolution/cases/document-presentation-disabled-no-instance.ts`
- Create: `tests/policy-resolution/cases/document-presentation-disabled-org-forbidden.ts`
- Verify: `tests/policy-resolution/resolve-cases.test.ts` (auto-discovers cases)

- [ ] **Step 1: Inspect** the existing cases dir to understand the case-file shape.
- [ ] **Step 2: Write the two fixture cases.**
- [ ] **Step 3: Run resolver test to verify they pass.**

---

### Task 8: e2e axe-clean coverage

**Files:**
- Modify: `tests/e2e/placeholder-a11y.spec.ts`

- [ ] **Step 1: Add navigation to `/documents`** in the existing demo-composition spec.
- [ ] **Step 2: Run e2e.** (Optional — may skip if Playwright is slow in CI; verified via the existing axe-clean smoke + the unit-test render coverage.)

---

### Task 9: Port + policy doc updates

**Files:**
- Modify: `docs/ports/respondent-place-source.md`
- Modify: `docs/policy/runtime-feature-resolution.md`

- [ ] **Step 1: `respondent-place-source.md`** — add `DocumentsRuntime` to the §Consumers list landed by FW-0055.
- [ ] **Step 2: `runtime-feature-resolution.md`** — add a `documentPresentation` worked example; document the transitional port-map slot reuse.

---

### Task 10: PLANNING + ADR cross-link

**Files:**
- Modify: `PLANNING.md`
- Modify: `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md`

- [ ] **Step 1: PLANNING.md FW-0056** — move row to `## Closed` with:
  - `Status: live (slice 1)`
  - `Done (slice 1):` bullet describing what shipped.
  - `Release gaps named:` bullet listing the deferrals (selective-presentation cryptography; W3C VC Data Model 2.0; OpenID4VP; HPKE wallet encryption via EXT-18; presentation port + adapter conformance via SC-4; per-presentation revocation; derived-claim disclosure; retention horizons; export ceremony; upload via FW-0033; XS-2 cross-issuer fan-out; FW-0070 parameterization; FW-0066 port promotion).
  - Cross-link to design + plan + new FW-0070 row.
- [ ] **Step 2: Open FW-0070** in Post-MVP — sibling-factory parameterization refactor. Blocked on: none (pure internal refactor).
- [ ] **Step 3: Update FW-0066** row body — cite FW-0056 as the trigger that fired the taxonomy extension (first feature ADR beyond the seeded set).
- [ ] **Step 4: ADR-0011 footer** — one-bullet append: "`/documents` route consumes the `respondentPlace` + new `documentPresentation` keys via synthetic optional form policy (FW-0056 slice 1)."

---

### Task 11: Full-suite verification

- [ ] **Step 1:** `npm run typecheck` green.
- [ ] **Step 2:** `npm run lint` green.
- [ ] **Step 3:** `npx vitest run` green (every suite).
- [ ] **Step 4:** `npm run ci` green.
- [ ] **Step 5:** Architecture review (inline `formspec-specs:semi-formal-architecture-review` invocation — flag for independent review in return message).
- [ ] **Step 6:** Commit with explicit-paths form per stack-root CLAUDE.md.

---

## Out-of-scope cleanups (file as follow-on rows or leave for craftsman judgment)

- Soft-navigation between four routes — needs router; FW-0070 is the precursor refactor.
- Demo "fake" VP ceremony — explicitly rejected per design §"No demo VP-ceremony stub."
- Production VP adapter — slice 2; blocked on EXT-18 + SC-4 + ADR-0116 substrate.

## Design-claim → test mapping

| Design claim | Test |
|---|---|
| Standalone /documents route | `documents-route.test.ts` + `app-routing.test.tsx` |
| Per-kind section grouping + sort + cross-kind header | `documents-view.test.tsx` + `documents-runtime.test.tsx#renders kind sections` / `#sort order` / `#cross-kind header` |
| Selection action captures intent without port call | `documents-runtime.test.tsx#selection action` |
| Selection lists matching policy scope | `documents-runtime.test.tsx#selection lists policy scope` |
| Selection without matching policy | `documents-runtime.test.tsx#selection without policy` |
| Deferred-capability copy fixture-pinned | `documents-runtime.test.tsx#deferred capability copy` |
| Empty-state copy | `documents-runtime.test.tsx#empty state` |
| Disabled-cause copy (instance + org) | `documents-runtime.test.tsx#instance-unavailable` / `#org-forbidden` |
| Identity-required + auth fallback | `documents-runtime.test.tsx#auth required` |
| Consumer discipline (no StatusReader, no form ports) | `documents-runtime.test.tsx#no status fetch` + `#no form ports` |
| Vocabulary firewall | `documents-runtime.test.tsx#vocabulary firewall` |
| `documentPresentation` in feature-key registry | `src/policy/feature-keys.test.ts` (extended) |
| Composition coherence across four factories | `tests/smoke/composition.test.ts#FW-0056 factory tests` |
| Resolver disabled-no-instance + disabled-org-forbidden | `tests/policy-resolution/cases/document-presentation-*.ts` |
| Axe-clean in demo | `tests/e2e/placeholder-a11y.spec.ts` (extended) |
