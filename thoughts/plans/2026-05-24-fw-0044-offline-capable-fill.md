# FW-0044 — Offline-capable form-fill with deferred submit (implementation plan, slice 1)

**Design:** [`thoughts/specs/2026-05-24-fw-0044-offline-capable-fill-design.md`](../specs/2026-05-24-fw-0044-offline-capable-fill-design.md)
**Row:** [FW-0044](../../PLANNING.md#fw-0044--offline-capable-form-fill-with-deferred-submit)

Tasks ordered for TDD red/green; each landing point is a passing slice.

## Phase A — Port + types

1. **A1.** `src/ports/offline-submit-queue.ts` — define `OfflineSubmitQueue`, `QueuedSubmit`, `ReplayOutcome`.
2. **A2.** `src/ports/index.ts` — re-export the new types.

## Phase B — Conformance suite + fixtures

3. **B1.** `src/adapter-conformance/conformance.ts` — `defineOfflineSubmitQueueConformance(name, setup)` + `OfflineSubmitQueueConformanceSubject`. Subject carries `adapter` + an injected `recordingTransport` whose call log the suite asserts against.
4. **B2.** `src/adapter-conformance/index.ts` — re-export.
5. **B3.** `tests/adapter-conformance/_framework/conformance.ts` — re-export through the public surface.

## Phase C — Adapters

6. **C1.** `src/adapters/stub/offline-submit-queue.ts` — `stubOfflineSubmitQueue({ transport })` in-memory; FIFO array; idempotency via key-map; replay drains by calling `transport.submit(handoff, idempotencyKey)`; failed entries stay pending; marker `DEMO_STUB_ADAPTER` with `featureKey: 'offlineSubmit'`.
7. **C2.** `src/adapters/unavailable/offline-submit-queue.ts` — `unavailableOfflineSubmitQueue()`; `enqueue` / `replay` / `pending` throw with plain-language adopter-facing message; marker `UNAVAILABLE_ADAPTER`.
8. **C3.** `tests/adapter-conformance/offline-submit-queue/conformance.test.ts` — runs the suite against `stubOfflineSubmitQueue`.
9. **C4.** `tests/adapters/offline-submit-queue-stub.test.ts` — stub-specific behavior + marker + FIFO + injected-transport drain.
10. **C5.** `tests/adapters/offline-submit-queue-unavailable.test.ts` — sentinel-specific behavior + marker.
11. **C6.** `tests/adapters/unavailable-sentinel.test.ts` (modify) — add the new sentinel case.
12. **C7.** `tests/adapters/demo-stub-marker.test.ts` (modify) — add the new stub case.

**Land point #1:** ports + adapters + conformance green.

## Phase D — Policy wiring

13. **D1.** `src/policy/feature-keys.ts` — append `'offlineSubmit'`.
14. **D2.** `src/policy/feature-keys.test.ts` — extend `RUNTIME_FEATURE_KEYS.toEqual(...)` to include `'offlineSubmit'`; add the `isRuntimeFeatureKey('offlineSubmit')` + locale-conditional assertion.
15. **D3.** `src/policy/feature-port-map.ts` — add `offlineSubmit: 'offlineSubmitQueue'`.
16. **D4.** `src/policy/extract-form-policy.ts` — add `extractOfflineSubmitOptIn(definition)` walker; returns `'optional' | undefined` based on `definition.extensions?.['x-formspec-offline-submit'] === true`.
17. **D5.** `src/policy/extract-form-policy.test.ts` — add cases: absent, present-true, present-false, present-non-boolean, present-as-string.
18. **D6.** `src/adapters/composing/form-runtime-policy-extractor.ts` — add `OfflineSubmitRequirementExtractor` wrapper class.

## Phase E — Composition wiring

19. **E1.** `src/composition/types.ts` — add `offlineSubmitQueue: OfflineSubmitQueue`.
20. **E2.** `src/composition/stub.ts` — wire `stubOfflineSubmitQueue({ transport: composition.submitTransport })`, declare `offlineSubmit: 'demo-stub'`, append `new OfflineSubmitRequirementExtractor()` to the composite array, update `orgRuntimePolicy.features`.
21. **E3.** `src/composition/default.ts` — wire `unavailableOfflineSubmitQueue()`, declare `offlineSubmit: 'unavailable'`, append `new OfflineSubmitRequirementExtractor()` to the composite, update org-policy features.
22. **E4.** `src/composition/route-narrowing.ts` — extend BOTH branches: `offlineSubmitQueue: unavailableOfflineSubmitQueue()`, declare `offlineSubmit: 'unavailable'`. Update both `defaultOrgRuntimePolicy()` and `instanceCapabilities` blocks. **No** `consumesOfflineSubmit` flag added.
23. **E5.** `tests/composition/freeze-offline-submit-queue.test.ts` — coherence cases analogous to FW-0033's `freeze-attachment-store.test.ts`.

**Land point #2:** composition coherent + policy resolver loop iterates over the new key cleanly.

## Phase F — Resolver test cases

24. **F1.** `tests/policy-resolution/cases/offline-submit-disabled-no-instance.json` — production + form optional + instance unavailable → enabled empty + disabled `optional-no-instance`.
25. **F2.** `tests/policy-resolution/cases/offline-submit-disabled-org-forbidden.json` — demo + form optional + org forbidden → disabled `org-forbidden`.
26. **F3.** `tests/policy-resolution/cases/offline-submit-demo-stub-satisfies-optional.json` — demo + form optional + demo-stub instance → enabled.
27. **F4.** Backfill all 21 existing `tests/policy-resolution/cases/*.json` with `offlineSubmit` in `instance` / `org.features` / `expect.disabled` per the append-only key contract. Verify via `npm run test:unit -- policy-resolution`.

## Phase G — Runtime offline path

28. **G1.** `src/app/respondent-flow.ts` — add `submitOrQueue({ navigatorOnLine, runtimeProfile, composition, handoff, idempotencyKey })` pure helper returning a discriminated outcome `{kind: 'submitted', confirmation}` or `{kind: 'queued', queuedSubmit}` or `{kind: 'failed', error}`. Tests register a fake `Navigator` to control `onLine` in the test harness.
29. **G2.** `tests/app/respondent-flow.test.ts` (extend if exists; else create) — unit-test the four-cell decision matrix.
30. **G3.** `src/app/RespondentRuntime.tsx` — extend `SubmitState` with `'queued'` discriminator carrying the `QueuedSubmit`; refactor `handleSubmit` to call `submitOrQueue`; on `'queued'` outcome, set state + register a `'online'` window listener via `useEffect` that calls `composition.offlineSubmitQueue.replay()` and transitions to `'confirmed'` on the first `'sent'` outcome (or `'error'` on `'failed'`).
31. **G4.** `src/app/RespondentRuntime.tsx` — extend `SubmitNotice` with a `'queued'` panel: "Saved for later. We'll send it when you reconnect." + the deferred-capability sub-line.

## Phase H — End-to-end runtime tests

32. **H1.** `tests/app/respondent-runtime-offline.test.tsx` (new) — render `RespondentRuntime` with the stub composition + a synthetic definition declaring `extensions['x-formspec-offline-submit']: true`; stub `navigator.onLine` to `false`; click submit; assert state transitions to `'queued'` AND `composition.offlineSubmitQueue.pending()` length is 1 AND rendered DOM carries the "Saved for later" copy. Then flip `navigator.onLine` to `true` + dispatch `new Event('online')`; assert state transitions to `'confirmed'` AND `pending()` length is 0.
33. **H2.** Same file: render with form NOT declaring offline + `navigator.onLine === false`; assert submit goes through the existing transport path; the stub raises (`stubSubmitTransport` accepts when online; need a transport stub that throws when offline OR use the existing path and accept that the stub still accepts — the assertion is "queue's `pending()` is still 0 AND we did NOT take the queue route").
34. **H3.** Same file: render with form declaring offline + composition wired with `unavailableOfflineSubmitQueue()` (manually rewire) + `navigator.onLine === false`; assert submit falls through to the transport (no queue route) and the rendered "saved for later" copy is absent.
35. **H4.** Same file: vocabulary firewall — rendered DOM does not contain `queue`, `enqueue`, `replay`, `idempotency`, `IndexedDB`, `service worker`, `OfflineSubmitQueue`, `offlineSubmit` as substrings.

## Phase I — Docs + scripts

36. **I1.** `docs/ports/offline-submit-queue.md` — adopter doc analogous to `docs/ports/attachment-store.md` / `docs/ports/respondent-history-source.md`.
37. **I2.** `docs/policy/runtime-feature-resolution.md` — add `offlineSubmit` to the worked-key examples + a new "Worked example: the in-form offline-aware submit (FW-0044 slice 1)" section.
38. **I3.** `scripts/check-conformance-coverage.mjs` — add `OfflineSubmitQueue` to `portSuites`, `stubPortsByPath`, `unavailableSentinelFactoriesByPath`, `requiredHarnessExports`.
39. **I4.** `tests/adapter-conformance/README.md` — append the new port suite line.
40. **I5.** `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` — append a bullet at the end: "`offlineSubmit` (FW-0044 slice 1; new `OfflineSubmitQueue` port; sixth key in the closed taxonomy; explicit FW-0080 consolidation trigger fired)."

## Phase J — Planning closeout

41. **J1.** `PLANNING.md` — FW-0044 row → `live (slice 1)` with named release gaps + follow-on rows FW-0081 / FW-0082 / FW-0083 / FW-0084 / FW-0085 / FW-0086 / FW-0087. Mark FW-0080 as `imminent (trigger fired by FW-0044)` in PLANNING.md.
42. **J2.** Run the full `npm run ci` gate; iterate until green.

## Phase K — Independent review hand-off

43. **K1.** Invoke `formspec-specs:semi-formal-architecture-review` inline; flag for the main-agent dispatch of any deeper review.

## Phase L — Commit + parent pointer

44. **L1.** Incremental commits aligned to land points #1 / #2 / Phase G / Phase H / Phase J. Use `git commit <path> [<path>...] -m "..."` form per parallel-craftsman commit safety. Heredoc commit messages.
45. **L2.** Stage the submodule pointer at the stack parent; DO NOT push.

## Decision audit trail (delta against the design doc)

- **No new context** added to `CompositionProvider.tsx`; the queue is reached through the existing prop drilling via `composition.offlineSubmitQueue`.
- **`submitOrQueue` lives in `respondent-flow.ts`** next to `buildIntakeHandoff` rather than as a hook because it's a pure decision function — no React state, no DI binding via context.
- **The `'online'` event listener is in `RespondentRuntime`**, not in the port adapter, because the port should not depend on `window`; that coupling stays at the React shell layer.
- **The stub queue's drained-entries semantics**: on a successful `'sent'` outcome the entry is removed from `pending()`; on `'failed'`, it remains. The conformance suite enforces this.
- **`navigator.onLine` indirection**: `submitOrQueue` accepts `navigatorOnLine: boolean` as a parameter so the helper is testable without monkey-patching the global; the caller in `RespondentRuntime` reads `typeof navigator !== 'undefined' && navigator.onLine` and passes the boolean.
