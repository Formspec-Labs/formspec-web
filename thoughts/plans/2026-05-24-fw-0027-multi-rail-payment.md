# FW-0027 — Multi-rail payment with atomic submit (implementation plan, slice 1)

**Design:** [`thoughts/specs/2026-05-24-fw-0027-multi-rail-payment-design.md`](../specs/2026-05-24-fw-0027-multi-rail-payment-design.md)
**Row:** [FW-0027](../../PLANNING.md#fw-0027--multi-rail-payment-with-atomic-submit)

Tasks ordered for TDD red/green; each landing point is a passing slice.

## Phase A — Port + types

1. **A1.** `src/ports/payment-rail-adapter.ts` — define `Money`, `Authorization`, `CaptureReceipt`, `PaymentRailAdapter`.
2. **A2.** `src/ports/index.ts` — re-export the new types.

## Phase B — Conformance suite + fixtures

3. **B1.** `src/adapter-conformance/conformance.ts` — `definePaymentRailAdapterConformance(name, setup)` + `PaymentRailAdapterConformanceSubject`.
4. **B2.** `src/adapter-conformance/fixtures.ts` — add `samplePaymentAmount` (Money) + `samplePaymentMethodToken` (`'demo-method-stub'`).
5. **B3.** `src/adapter-conformance/index.ts` — re-export.
6. **B4.** `tests/adapter-conformance/_framework/conformance.ts` — re-export through the public surface.

## Phase C — Adapters

7. **C1.** `src/adapters/stub/payment-rail-adapter.ts` — `stubPaymentRailAdapter()` in-memory; authorization-state map keyed by id; idempotency via key-map; `_internalAuthorizationStates()` / `failNextAuthorize(error)` / `failNextCapture(error)` test helpers; marker `DEMO_STUB_ADAPTER` with `featureKey: 'payment'`.
8. **C2.** `src/adapters/unavailable/payment-rail-adapter.ts` — `unavailablePaymentRailAdapter()`; `authorize` / `capture` / `voidAuthorization` throw with plain-language adopter-facing message; marker `UNAVAILABLE_ADAPTER`.
9. **C3.** `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts` — runs the suite against `stubPaymentRailAdapter`.
10. **C4.** `tests/adapters/payment-rail-adapter-stub.test.ts` — stub-specific behavior + marker + state-transitions + failure-injection knobs.
11. **C5.** `tests/adapters/payment-rail-adapter-unavailable.test.ts` — sentinel-specific behavior + marker.
12. **C6.** `tests/adapters/unavailable-sentinel.test.ts` (modify) — add the new sentinel case.
13. **C7.** `tests/adapters/demo-stub-marker.test.ts` (modify) — add the new stub case.

**Land point #1:** ports + adapters + conformance green.

## Phase D — Policy wiring

14. **D1.** `src/policy/feature-keys.ts` — append `'payment'`.
15. **D2.** `src/policy/feature-keys.test.ts` — extend `RUNTIME_FEATURE_KEYS.toEqual(...)` to include `'payment'`; update the `isRuntimeFeatureKey('payment')` assertion to true; add a new sentinel `'fictional'`-style assertion.
16. **D3.** `src/policy/feature-port-map.ts` — add `payment: 'paymentRailAdapter'`.
17. **D4.** `src/policy/extract-form-policy.ts` — add `extractPaymentRequirement(definition)` and `extractPaymentAmount(definition)`.
18. **D5.** `src/policy/extract-form-policy.test.ts` — add cases.
19. **D6.** `src/adapters/composing/form-runtime-policy-extractor.ts` — add `PaymentRequirementExtractor`.

## Phase E — Composition wiring

20. **E1.** `src/composition/types.ts` — add `paymentRailAdapter: PaymentRailAdapter`.
21. **E2.** `src/composition/stub.ts` — wire `stubPaymentRailAdapter()`, declare `payment: 'demo-stub'`, append `new PaymentRequirementExtractor()` to the composite array, update `orgRuntimePolicy.features`.
22. **E3.** `src/composition/default.ts` — wire `unavailablePaymentRailAdapter()`, declare `payment: 'unavailable'`, append `new PaymentRequirementExtractor()` to the composite, update org-policy features.
23. **E4.** `src/composition/route-narrowing.ts` — extend BOTH branches: `paymentRailAdapter: unavailablePaymentRailAdapter()`, declare `payment: 'unavailable'`. Update `defaultOrgRuntimePolicy()`.
24. **E5.** `src/policy/freeze-composition.test.ts` (modify) — extend the coherent + incoherent cases with the new slot.

**Land point #2:** composition coherent + policy resolver loop iterates over the new key cleanly.

## Phase F — Resolver test cases

25. **F1.** `tests/policy-resolution/cases/payment-required-unavailable-throws.json` — production + form required + instance unavailable → throws.
26. **F2.** `tests/policy-resolution/cases/payment-demo-stub-satisfies-required.json` — demo + form required + demo-stub instance → enabled.
27. **F3.** `tests/policy-resolution/cases/payment-disabled-no-instance.json` — production + form silent + instance unavailable → not-requested.
28. **F4.** Backfill all 24 existing `tests/policy-resolution/cases/*.json` with `payment` in `instance` / `org.features` / `expect.disabled` per the append-only key contract.

## Phase G — Runtime payment path

29. **G1.** `src/app/respondent-flow.ts` — add `submitWithPayment(...)` pure helper returning a discriminated outcome.
30. **G2.** `tests/app/respondent-flow.test.ts` (extend) — unit-test the decision matrix.
31. **G3.** `src/app/RespondentRuntime.tsx` — extend `SubmitState` with payment cases; refactor `handleSubmit` to call `submitWithPayment`; extend `SubmitNotice` with payment panels; extend `ConfirmationPanel` with payment sub-card; extend `runtimePolicyErrorCopy` with the `payment` row.

## Phase H — End-to-end runtime tests

32. **H1.** `tests/app/respondent-runtime-payment.test.tsx` (new) — render with stub composition + synthetic payment-required definition; submit; assert state progression; assert capture receipt.
33. **H2.** Same file: render with submit-failing transport + payment-required form; assert void path; assert error copy.
34. **H3.** Same file: render with production unavailable + payment-required form; assert form-load error page.
35. **H4.** Same file: assert idempotency-key derivation determinism (authorize / capture / void share a derived family of the submit key).
36. **H5.** Same file: vocabulary firewall — rendered DOM does not contain the forbidden substrings.

## Phase I — Docs + scripts

37. **I1.** `docs/ports/payment-rail-adapter.md` — adopter doc.
38. **I2.** `docs/policy/runtime-feature-resolution.md` — add `payment` to worked-key examples + new "Worked example: the in-form atomic pay-and-submit (FW-0027 slice 1)" section.
39. **I3.** `scripts/check-conformance-coverage.mjs` — add `PaymentRailAdapter` to `portSuites`, `stubPortsByPath`, `unavailableSentinelFactoriesByPath`, `requiredHarnessExports`.
40. **I4.** `tests/adapter-conformance/README.md` — append the new port suite line.
41. **I5.** `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` — append a bullet at the end: "`payment` (FW-0027 slice 1; new `PaymentRailAdapter` port; seventh key in the closed taxonomy)."

## Phase J — Composition follow-up + route-narrowing tests

42. **J1.** `tests/composition/route-narrowing.test.ts` (modify) — descriptor matrix coverage for the new slot; add `'payment'` to the "no descriptor consumes today" invariant.

## Phase K — Planning closeout

43. **K1.** `PLANNING.md` — FW-0027 row → `live (slice 1)` with named release gaps + follow-on rows FW-0089 / FW-0090 / FW-0091 / FW-0092 / FW-0093 / FW-0094 / FW-0095 / FW-0096 / FW-0097 / FW-0098 / FW-0099 / FW-0100 / FW-0101.
44. **K2.** Run the full `npm run ci` gate; iterate until green.

## Phase L — Independent review hand-off

45. **L1.** Flag for the main-agent dispatch of an independent review.

## Phase M — Commit + parent pointer

46. **M1.** Incremental commits aligned to land points #1 / #2 / Phase G / Phase H / Phase K. Use `git commit <path> [<path>...] -m "..."` form per parallel-craftsman commit safety. Heredoc commit messages.
47. **M2.** Stage the submodule pointer at the stack parent; DO NOT push.

## Decision audit trail (delta against the design doc)

- **No new context** added to `CompositionProvider.tsx`; the rail is reached through prop drilling via `composition.paymentRailAdapter`.
- **`submitWithPayment` lives in `respondent-flow.ts`** next to `submitOrQueue` rather than as a hook — pure decision function.
- **Stub adapter exposes failure-injection knobs** (`failNextAuthorize` / `failNextCapture`) so the runtime test can drive the submit-fails-voids and capture-fails paths deterministically without standing up a fake transport.
- **Idempotency-key derivation is deterministic** from the submit key (`${key}:authorize`, `${key}:capture`, `${key}:void`) so a runtime retry against the same submit key re-uses the triple. Adapters' same-key contracts handle the rest.
- **Slice-1 amount is fixed** per form via `x-formspec-payment-amount`; FEL-evaluated amounts defer to FW-0097.
- **Offline + payment is hard-rejected** when both keys are enabled by form policy on the same form; FW-0101 lifts the restriction post-substrate.
