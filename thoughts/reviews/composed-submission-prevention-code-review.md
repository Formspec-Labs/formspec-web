# Composed signed submission regression code review

VERDICT: APPROVE

No blocking findings. Static review completed October 14, 2026. Reviewed the one-file patch to `tests/shared/native-package-signing-host.test.ts` against `192c3fd14940cd234f70456aee798f231ba5a8cf`. Exact binary diff SHA-256: `8783ef5fe519348e1ff4876039acda81cdddbb6ad20b0bfe001b3f3a4f0e2805`. Review documents are outside that digest. Only the test file differs from the base; the historically substituted vendor file has been restored.

## 1. Patch summary

The patch extends the existing neutral signed-task reopening test with a delayed-transport mode. It composes the real Source HTTP cohort read, task completion adapter, native signing host, controller, respondent host, Surface action bridge and starter signing widget. It checks truthful uncertainty, disabled Submit, unchanged signed data, original-intake status refresh, no navigation and no extra writes.

No production function, framework, public configuration or compiled vendor output changes. The directly changed parameterized test begins at `tests/shared/native-package-signing-host.test.ts:139`; the new rendered branch is at 247. The existing successful completion and retired-owner variants remain in the same test.

## 2. Function trace

| Function / boundary | File:line | Inputs / outputs | Verified role in regression |
| --- | --- | --- | --- |
| Parameterized signed-task test | `tests/shared/native-package-signing-host.test.ts:139` | Neutral persisted signed response | Adds delayed-unknown variant; existing current and retired cases remain. |
| `createTaskComposition` | `src/composition/task.ts:18,71` | Injected Source/WOS fetch implementations | Creates maintained HTTP cohort and `HttpTaskCompletion`; no mocked completion classification. |
| Authenticated owned `readState` | Test:190 | Source fixture record | Actual cohort restores signed state; that state is passed to the fresh native host at 236. |
| `configureRuntime` | Test:236 | Exact restored response/signature | Real host calls existing controller restoration; assertion at 238 requires exact signed state before any WOS request. |
| `NativePackageRespondentHost` | `src/app/NativePackageRespondentHost.tsx:29,100` | Real signing host and neutral bundle | Uses real `SurfaceApp`, widget modules, admitted data loader and visit-bound executor. It is imported directly, not mocked. |
| `HttpTaskCompletion.complete` | `src/adapters/http/task-completion.ts:52,82` | Unresolved injected WOS fetch | Real HTTP lifetime timer produces post-dispatch typed uncertainty after fake time advances ten seconds. |
| Controller failure/fence | `src/shared/response-action-controller.ts:350,411` | Typed uncertainty | Retains signature, publishes unknown state and fences subsequent Submit. |
| Surface result mapping | `vendor/formspec-surface-react/dist/SurfaceSlot.js:742,768` | Actual controller invocation | Real bridge forwards the closed `outcome-unknown` status. |
| Signing widget | `vendor/formspec-surface-react/dist/widgets/signing-ceremony.js:148,174,193` | Real emitted completion | Shows truthful uncertainty and disables Submit through adopted code. |
| Host/controller status refresh | `src/shared/native-package-signing-host.ts:753`; `src/shared/response-action-controller.ts:475` | Neutral lifecycle `load` returns original intake submitted | Actual controller refresh preserves unknown phase/reason; test at 260–265 checks this explicitly. |

## 3. Data flow and invariants

The neutral Source view is returned through an injected fetch at test:174. The WOS fetch at 175–178 never settles only in delayed mode. These replace network boundaries, not the adapters/controller/bridge. The actual adapter is selected through task composition at 179–188. Fake timers begin only after the real Submit button becomes enabled; advancing 10000 ms at 255 drives the maintained timeout mechanism. No test injects `TaskCompletionOutcomeUnknown` or directly publishes a mocked host snapshot.

The test creates a minimally authored neutral registry and canonical response source binding at 211–233. The widget uses the maintained `SIGNING_CEREMONY_WIDGET_SHAPE`, starter module, loaded signed data and real action binding. `requireResponseReview:false` disables only the widget's optional presentation gate; the host's current signed-review readiness is established through its maintained review callback at 240–246. This is not a full response-review UI test.

After timeout, assertions require the actual widget message, disabled control and controller unknown state at 257–259. Real status refresh returns original-intake `submitted`, then rerender retains the correction's unknown state and message at 260–265. No navigation is permitted at 266.

The final assertions at 274–281 require one WOS transport call, an exact signed response and `signedDraft` selector in its body, equal canonical signing payload bytes, equal authored signatures, and exactly the original two Source fetches. The existing baseline Save/Prepare/Sign spies also remain untouched. The real cohort uses different signing functions, so the Source fetch count is the important evidence for zero additional real-cohort writes; the baseline spies alone would be insufficient.

Cleanup restores real timers and disposes the rendered tree, lease, engine and host at 282. The existing completed variant still checks successful output and one completion at 285–291. The retired-read variant still refuses before completion at 191–193.

## 4. Test behavior and evidence

- **Adopted code:** delayed mode should pass through Source signed read → fresh host → actual widget Submit → real adapter timeout → controller uncertainty → real Surface feedback → disabled widget. It then refreshes original intake status without clearing the correction's unknown result.
- **Historical widget:** worker temporarily selected exact prior `07c33c` generated signing widget bytes. The retained RED log fails at test:257 because truthful unknown copy is absent and the DOM displays generic `Submission failed`. This isolates a visible seam regression rather than merely checking controller state.
- **Restored code:** worker restored adopted bytes and retained GREEN. Reviewer read `/private/tmp/composed-signing-green.log`: three related files, **236 passed**. Reviewer also read final focused log: all three parameter variants passed, **101 unrelated cases skipped** by test selection.
- Worker reports typecheck, scoped lint and diff check passed. Reviewer did not execute tests, builds, providers or browser actions.

Concrete edge cases checked: a late unresolved transport; original intake already submitted; ordinary rerender with same signed identity; a click after manually clearing the DOM disabled flag; preservation of signature/selector/body; current success and retired Source owner. All remain neutral and use injected transport.

## 5. Findings and limits

**Observation — forced-click evidence is bounded.** At test:270–273 the test clears the DOM disabled flag, attempts a click, then restores it. React may still suppress events based on its rendered disabled prop. This proves no redispatch through the real mounted UI; it does not uniquely prove that the widget handler guard executed or that a rerender repaired the DOM flag. The adopted widget handler fence is separately visible in reviewed production code. The final test comment correctly states this narrower claim.

**Observation — neutral restoration and mounted lifetime.** The fixture constructs signed bytes and neutral key/owner metadata. It exercises maintained semantic restoration and exact-byte preservation, not live cryptographic verification or provider authority. Same-host rerender/status refresh is covered; full application reload, exact server outcome recovery, actual acceptance and reviewer decisions are outside scope.

**Observation — presentation readiness scope.** The real signing widget and Surface bridge are exercised, but response-review readiness is supplied through the existing host callback, and lifecycle `load` is a neutral stub. No claim is made about the complete review widget or application-status HTTP adapter.

## 6. Conclusion

VERDICT: APPROVE

The test closes the demonstrated adapter/controller/Surface feedback blind spot without adding production code or a parallel framework. Its historical RED is meaningful, and its GREEN assertions retain signed bytes and prevent additional transport. Coverage of the bounded changed path is **ADEQUATE**; confidence is **HIGH** for static composition and supplied execution evidence. Actual runtime qualification remains separate.
