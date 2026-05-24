# FW-0070 — Route-narrowing parameterization (implementation plan)

> **For agentic workers:** Single-session execution by an implementer. TDD throughout — red, green, refactor. Each task ends in an explicit-paths commit with verified SHA.

**Goal:** Collapse the 4 × 3 = 12 sibling factory functions (FW-0068 + FW-0055 + FW-0056 inline-shipped) into one parameterized helper + three per-route descriptors. Pure internal refactor; no behavior change; coherence assertion still funnels through `freezeComposition`. Closes [FW-0070 design](../specs/2026-05-23-fw-0070-route-narrowing-parameterization-design.md).

**Tech stack:** TypeScript 5 strict, React 19, Vitest. No new runtime dependencies.

---

## File structure

**New files:**

- `src/composition/route-narrowing.ts` — `RouteNarrowing` type + `createRouteNarrowedComposition` factory
- `tests/composition/route-narrowing.test.ts` — unit coverage for the parameterized factory

**Modified files:**

- `src/app/status-route.ts` — add `STATUS_ROUTE_NARROWING` descriptor
- `src/app/obligations-route.ts` — add `OBLIGATIONS_ROUTE_NARROWING` descriptor
- `src/app/documents-route.ts` — add `DOCUMENTS_ROUTE_NARROWING` descriptor
- `src/composition/default.ts` — delete 4 narrowed-route factories; keep `createDefaultComposition`; expose factored helpers needed by `route-narrowing.ts`
- `src/composition/stub.ts` — delete 3 narrowed-route factories; keep `createStubComposition`
- `src/composition/demo.ts` — delete 3 narrowed-route factories; keep `createDemoComposition`
- `src/composition/index.ts` — remove deleted exports; add `createRouteNarrowedComposition` + descriptors
- `src/app/main-helpers.ts` — `chooseComposition` calls parameterized factory
- `tests/profiles/composition-coherence.test.ts` — extract programmatic case generator
- `tests/smoke/composition.test.ts` — collapse per-named-factory cases to per-descriptor
- `tests/app/status-boot-narrowing.test.ts` — call parameterized factory
- `PLANNING.md` — move FW-0070 to ## Closed

---

### Task 1: `RouteNarrowing` type + parameterized factory

**Files:**
- Create: `src/composition/route-narrowing.ts`
- Create: `tests/composition/route-narrowing.test.ts`

- [ ] **Step 1 (RED):** Write failing test for `createRouteNarrowedComposition` covering each (mode, route) combo:
  - Returns a `Composition` that passes `assertCompositionCoherence`.
  - On `mode: 'stub'`: form-shaped ports are noop; `respondentPlaceSource` is demo-stub-marked when `consumesRespondentPlace`, demo-stub-marked when `consumesStatus=true`-route too (per FW-0068 Finding 1 reshape); identity provider is demo when `identityBound`, noop otherwise.
  - On `mode: 'default'` without server URL: short-circuits to stub.
  - On `mode: 'default'` with server URL: form-shaped ports are noop; non-form ports unavailable-marked; identity is noop when respondentPlace declares 'unavailable' (today's posture).

- [ ] **Step 2 (GREEN):** Implement `src/composition/route-narrowing.ts`:
  - Export `RouteNarrowing` interface per design §"Decision 3".
  - Export `createRouteNarrowedComposition({ mode, config, route })` that:
    - Maps `route.consumesStatus` + mode to the right `statusReader` (unavailable in production; demo stub in demo).
    - Maps `route.consumesRespondentPlace` + mode to the right `respondentPlaceSource` (unavailable in production; demo stub in demo on either flag; the `/status` route stays demo-stub in demo per FW-0068 Finding 1, so `respondentPlaceSource` is always the demo stub in demo mode).
    - Wires noop for the three form-shaped ports unconditionally.
    - Identity provider: per-mode + `identityBound` flag — production wires real identity ONLY when `respondentPlace === 'available'` (MED-4 gate); demo wires `stubIdentityProvider()` when `identityBound`; both fall to `noopIdentityProvider(routeCite)` otherwise.
    - Notification delivery: production only when identity is real; demo always wires `stubNotificationDelivery()` (it's free).
    - `initialDefinitionUrl` = `route.initialDefinitionUrlSentinel`.
    - `instanceCapabilities` matches today's narrowed-factory rules (status/respondentPlace = 'demo-stub' in demo, 'unavailable' in production; documentPresentation = 'unavailable' everywhere).
    - `orgRuntimePolicy` = `{ features: { respondentPlace: 'allowed', status: 'allowed', documentPresentation: 'allowed' } }`.
    - `getFormRuntimePolicy` returns `{ features: {} }` — route surfaces synthesize their own form policy.
  - Funnels through `freezeComposition`.

- [ ] **Step 3 (REFACTOR):** Factor identity-binding helper out of `default.ts` so `route-narrowing.ts` can call it without duplicating the OIDC / magic-link / anonymous wiring rules. Export `buildRealIdentityBinding` (or similar) from `default.ts`.

**Commit:** `feat(composition): RouteNarrowing descriptor + parameterized factory (FW-0070)`

---

### Task 2: Per-route descriptors

**Files:**
- Modify: `src/app/{status,obligations,documents}-route.ts`

- [ ] **Step 1 (RED):** Extend the route parser tests with assertions that each route file also exports a `*_ROUTE_NARROWING` descriptor matching the design table:
  - `STATUS_ROUTE_NARROWING`: `{ routeCite: '/status', initialDefinitionUrlSentinel: 'about:not-constructed#fw-0068', consumesRespondentPlace: false, consumesStatus: true, identityBound: false }`.
  - `OBLIGATIONS_ROUTE_NARROWING`: `{ routeCite: '/obligations', initialDefinitionUrlSentinel: 'about:not-constructed#fw-0055', consumesRespondentPlace: true, consumesStatus: false, identityBound: true }`.
  - `DOCUMENTS_ROUTE_NARROWING`: `{ routeCite: '/documents', initialDefinitionUrlSentinel: 'about:not-constructed#fw-0056', consumesRespondentPlace: true, consumesStatus: false, identityBound: true }`.

- [ ] **Step 2 (GREEN):** Add the descriptor exports to each route file. Co-located with the parser; the route file is "what this route is."

**Commit:** `feat(routes): per-route narrowing descriptors co-located with parsers (FW-0070)`

---

### Task 3: Migrate `chooseComposition` and `main-helpers.ts`

**Files:**
- Modify: `src/app/main-helpers.ts`

- [ ] **Step 1 (RED):** Update `tests/app/status-boot-narrowing.test.ts` `chooseComposition` cases to expect the parameterized factory call shape (drop named-factory mock interception).

- [ ] **Step 2 (GREEN):** Rewrite `chooseComposition` to dispatch by route → descriptor → `createRouteNarrowedComposition({ mode: 'default', config, route: descriptor })`. Drop named-factory imports.

**Commit:** `refactor(main-helpers): chooseComposition dispatches via parameterized factory (FW-0070)`

---

### Task 4: Delete narrowed-route factories from default/stub/demo

**Files:**
- Modify: `src/composition/{default,stub,demo}.ts`, `src/composition/index.ts`

- [ ] **Step 1:** Delete the 12 narrowed-route factory functions from `default.ts`, `stub.ts`, `demo.ts`. Keep `createDefaultComposition`, `createStubComposition`, `createDemoComposition`.

- [ ] **Step 2:** Update `src/composition/index.ts` — remove the narrowed-factory re-exports; export `createRouteNarrowedComposition` from `route-narrowing.ts` and the three descriptors from `src/app/*-route.ts`.

- [ ] **Step 3:** Verify no remaining import in `src/` references the deleted symbols (grep).

**Commit:** `refactor(composition)!: delete 12 narrowed-route sibling factories — call sites use createRouteNarrowedComposition (FW-0070)`

---

### Task 5: Migrate coherence + smoke + boot-narrowing tests

**Files:**
- Modify: `tests/profiles/composition-coherence.test.ts`, `tests/smoke/composition.test.ts`, `tests/app/status-boot-narrowing.test.ts`

- [ ] **Step 1:** `composition-coherence.test.ts` — extract programmatic generator that yields `{ name, build }` per (mode, route) combo. Replace 9 explicit narrowed-route `it(...)` blocks with `describe.each([...])` over the generator. Keep the 2 full-app cases as separate `it(...)`. Keep the 6 shared-slot tests and the 4 detection tests unchanged.

- [ ] **Step 2:** `smoke/composition.test.ts` — replace the 12 per-named-factory blocks with `describe.each(...)` over the three descriptors × two modes, asserting:
  - The parameterized factory produces a composition with all required slots defined.
  - Form-shaped ports throw with FW-0068 cite.
  - Identity provider behavior per descriptor + mode (real-in-production-when-available-gate / noop / demo).
  - Production-mode keeps `unavailable` declarations on the gated keys.
  - The chooseComposition helper picks the right descriptor.

- [ ] **Step 3:** `status-boot-narrowing.test.ts` — replace direct named-factory calls with `createRouteNarrowedComposition({ mode: 'default', config, route: <DESCRIPTOR> })`. Assertions unchanged.

**Commit:** `test(composition): programmatic case generator + descriptor-driven smoke (FW-0070)`

---

### Task 6: Close PLANNING.md row

**Files:**
- Modify: `PLANNING.md`

- [ ] **Step 1:** Replace the open FW-0070 body (lines 779–789) with the `*(closed; see [## Closed](#closed) — …)*` redirect line, following FW-0068's redirect pattern.

- [ ] **Step 2:** Append the FW-0070 closed row at the bottom of `## Closed`, following FW-0068's structure. Cite design + plan paths; cite the before/after counts (12 → 1 factory, 11 explicit coherence cases → 9 generated + 2 explicit).

**Commit:** `docs(planning): close FW-0070 — parameterized route-narrowed factory shipped`

---

### Task 7: Validators + parent submodule pointer

- [ ] **Step 1:** Run `npm run ci`. Expect green.

- [ ] **Step 2:** Stage the submodule pointer bump in the stack-root parent. Do NOT push.

**Commit (parent):** `chore(formspec-web): bump submodule for FW-0070 route-narrowing parameterization`

---

## Honest scope check

If the descriptor + factory shape does not cleanly capture all four sibling factories' wiring rules — e.g., a route needs something beyond `consumesRespondentPlace` / `consumesStatus` / `identityBound` — STOP and surface as a finding. The compression only delivers value if the parameterization is honest.

## Review-loop discipline

After this plan executes, request `formspec-specs:semi-formal-architecture-review` via subagent dispatch (or flag for the parent agent if Task tool not available). The reviewer is never the implementer.
