# Submit failure diagnostics — independent static code review

VERDICT: APPROVE, with one nonblocking test-coverage warning.

No correctness or privacy blocker found. The patch emits fixed diagnostic metadata while preserving the existing admission checks, completion preparation, operation keys, refusal mapping, and original HTTP/host exceptions. This is a static review of the working tree against `0fe66162a4d415a72cda75a59643e78de0c2c87b`; no tests, browser, or runtime were executed by this reviewer. The new untracked helper and its tests are included in scope. Confidence: HIGH for the inspected implementation; execution results remain outside this certificate.

## Findings

FINDING 1:
- Severity: WARNING
- Category: test-coverage
- Location: `src/shared/native-package-signing-host.ts:861-872`
- Description: The visit-bound Submit wrapper's result fence has no direct diagnostic assertion.
- Evidence chain: The wrapper awaits the controller, changes stage to `host-result-fence`, then calls `assertVisit` at line 868. `assertVisit` rejects a retired visit at lines 790-791. The new host test at `tests/shared/native-package-signing-host.test.ts:1236-1244` verifies disposed direct-host admission and a throwing observer. Existing scoped wrapper tests at lines 432-461 exercise foreign Sign admission, not Submit's post-await fence. Those tests do not verify the new result-fence stage or preserved rejection after a visit retires while the controller settles.
- Suggestion: Add a focused visit-bound Submit test that retires the visit during awaited controller work and asserts the fixed `host-result-fence` record and original rejection. The existing fence is unchanged, so this gap does not block this bounded observational patch.

## Patch summary

The new helper centralizes a 32-record limit and fixed metadata serialization (`src/shared/submit-diagnostic.ts:8-17`). The controller reports admission, frozen validation, review, preparation, and effect failures (`src/shared/response-action-controller.ts:389-451`, `200-201`, `217-219`, `316-327`). The native host reports failures before controller access or at the post-result visit fence (`src/shared/native-package-signing-host.ts:861-872`, `889-895`). The HTTP task adapter reports preflight, transport, or outcome-validation failures with an optional numeric status (`src/adapters/http/task-completion.ts:47-76`).

Important callers: `NativePackageRespondentHost` creates the visit and binds its ports (`src/app/NativePackageRespondentHost.tsx:35-43`); the visit wrapper and direct host call the controller (`src/shared/native-package-signing-host.ts:868`, `891`). The controller calls `perform` from the engine effect dispatcher (`src/shared/response-action-controller.ts:429-436`). Task composition supplies `HttpTaskCompletion` to the task completion strategy (`src/composition/task.ts:69-70`); that strategy invokes transport completion (`src/shared/task-response-completion.ts:37-46`).

## Function trace

| Function | Location | Inputs | Output | Verified behavior |
| --- | --- | --- | --- | --- |
| `createSubmitFailureReporter` and returned reporter | `src/shared/submit-diagnostic.ts:8-17` | Fixed stage/kind, optional number | `void` | Own counter, at most 32 attempts; status is integer 100–599 and only emitted for HTTP kind; console/serialization exceptions are swallowed. |
| `createResponseActionController` | `src/shared/response-action-controller.ts:98-118` | Existing config | Existing controller API | Adds one reporter per controller; no config or state authority added. |
| `perform` | `src/shared/response-action-controller.ts:200-346` | Existing action/evidence/operation data, optional local stage object | Transition bindings | Keeps existing review, preparation and completion ordering; updates only stage metadata. |
| `widgetExecutor` | `src/shared/response-action-controller.ts:389-451` | Surface widget action | Invocation result | Recognizes Submit by retained configured action reference; logs at existing catch/refusal points; still delegates refusal mapping to `fail`. |
| `review` / `fail` | `src/shared/response-action-controller.ts:195-198`, `348-352` | Evidence / caught failure | Guard / existing reason | Existing signed review rejection and closed controller reason remain unchanged. |
| `createNativePackageSigningHost` | `src/shared/native-package-signing-host.ts:91`, `325` | Existing host policy | Existing host API | Creates one reporter per host. |
| Visit `widgetActionExecutor` | `src/shared/native-package-signing-host.ts:861-872` | Widget action | Controller result or original rejection | Visit and signing-scope checks precede controller; visit fence remains after awaited result; catch reports stage and rethrows. |
| Direct host `widgetExecutor` | `src/shared/native-package-signing-host.ts:889-895` | Widget action | Controller promise or original synchronous exception | Existing unavailable guard remains; no new asynchronous catch around controller promise. Controller owns its own failure records. |
| `HttpTaskCompletion.complete` | `src/adapters/http/task-completion.ts:47-76` | Submission, operation key, lifetime | Actual task outcome or original error | Same schema/size/key/authority checks; fixed stage and status classification; exact caught object rethrown. |
| `HttpClient.postJson` and request implementation | `src/adapters/http/http-client.ts:82-84`, `131-175` | Body/path/options | Parsed result or failure | Resolves credentials, checks lifetime, invokes synchronous dispatch guard, then fetches; errors still originate here. |
| Task strategy `capture` / `complete` | `src/shared/task-response-completion.ts:17-46` | Signed candidate / retained preparation and key | Prepared task / task result | WeakMap preparation and retained operation key are unchanged. |
| Intake strategy `capture` / `complete` | `src/shared/intake-response-completion.ts:25-53` | Signed candidate / retained preparation and key | Prepared intake / confirmation | Retained handoff/options and key remain unchanged; generic controller instrumentation also applies here. |

## Data flow and invariants

- `count` is created inside each helper instance and only increments at a reporting attempt; it never enters controller, host, or HTTP business state (`submit-diagnostic.ts:9-11`). This replaces duplicated Submit reporting logic with one small maintained helper. No speed/resource improvement is claimed; console attempts are concretely bounded.
- `diagnostic.stage` is created per widget invocation, updated around existing review/preparation/completion steps, and passed only to internal `perform` for Submit (`response-action-controller.ts:391-393`, `217-219`, `316-327`, `433`). It never enters a request body, operation identity, output binding, or snapshot.
- The adapter's local stage changes only after preflight and transport complete (`task-completion.ts:48`, `59`, `63`). Caught errors are used only for class/status classification, never serialized (`71-75`). The classification itself has a protective catch, so a failing status/name access cannot replace the original failure.
- Diagnostics contain only literal stage/kind strings and admitted numeric status (`submit-diagnostic.ts:13-15`). Inspected call sites supply literal values or the local fixed-stage union. No message, exception, payload, URL, response/task ID, signature, claim, credential, validation finding, or business reference reaches the reporter.
- Original HTTP errors retain identity through `throw error` (`task-completion.ts:75`); host failures retain identity through the same pattern (`native-package-signing-host.ts:871`, `894`). Controller failures retain the existing closed reason mapping through `fail` (`response-action-controller.ts:435-436`, `450-451`, `348-352`).
- Authority checks remain synchronous and in the same effect order (`task-completion.ts:50-62`; `synchronous-guard.ts:2-7`; `http-client.ts:137-153`). Snapshot/schema/key checks remain before credentials/dispatch.
- Existing delivery identity, pending joins, completed replay, preparation retention and operation ID creation are unchanged (`response-action-controller.ts:230-245`, `318-327`, `344-346`, `398-403`). Diagnostic reporting does not create a retry or change a key.
- Observer failures are contained by the helper's catch (`submit-diagnostic.ts:12-16`). Static reasoning assumes ordinary typed action inputs and standard synchronous console behavior; no runtime qualification is inferred.
- The engine awaits effect dispatch and preserves its status flow (`vendor/formspec-engine/dist/response-actions.js:802-829`, `831-883`, `903-904`). The controller logs the no-effect refusal only when dispatch was never entered (`response-action-controller.ts:429-439`), avoiding an extra no-effect record after a normal effect failure. Layered host/controller/adapter records are intentionally possible; this patch supplies no private correlation ID.

## Test behavior and edge cases

Expected outcomes below come from reading tests and implementation, not execution.

| Test / scenario | Evidence | Expected behavior and trace |
| --- | --- | --- |
| Reporter bound and invalid status | `tests/shared/submit-diagnostic.test.ts:4-15` | Pass: NaN omits status; 101 calls on one reporter yield 32 records; new reporter has independent budget. |
| Throwing observer | `tests/shared/submit-diagnostic.test.ts:18-21` | Pass: helper catches console exception. |
| Controller admission/validation/review/preflight/effect/blocked | `tests/shared/response-action-controller.test.ts:930-957` | Pass: each fault reaches the matching stage, including `controller-completion-preflight` for capture-option refusal; blocked validation never dispatches; only effect case submits; signed evidence remains. Exact warn argument equality excludes private values. |
| Controller failure then success with throwing console | `tests/shared/response-action-controller.test.ts:958-969` | Pass: review refusal maps to existing `review-unready`; a later admitted attempt completes; only failure logs. |
| HTTP preflight/status/timeout/outcome | `tests/adapters/http/task-completion.test.ts:123-140` | Pass: preflight prevents fetch; transport error yields bounded 403 or timeout kind; outcome mismatch logs outcome stage; exact metadata excludes private data. Timeout assertion retains object identity. The status fixture lacks required Problem JSON fields, so its existing error is the fallback HTTP message (`src/shared/problem-json.ts:11-26`; `http-client.ts:162-166`). |
| HTTP success and throwing observer | `tests/adapters/http/task-completion.test.ts:142-153` | Pass: success is silent; later transport failure retains exact original object despite console throwing. |
| Native direct admission and observer | `tests/shared/native-package-signing-host.test.ts:1236-1244` | Pass: disposed host rejects before controller and emits only fixed admission metadata; helper contains observer throw. |
| Malformed submission/key | `tests/adapters/http/task-completion.test.ts:29-52` | Existing assertions remain applicable: no credential/fetch call before schema/key admission. |
| Cancellation and delayed credentials | `tests/adapters/http/task-completion.test.ts:70-90` | Existing checks still reject body cancellation and prevent stale-authority fetch. Catch adds metadata then rethrows. |
| Same-attempt task retry | `tests/shared/response-action-controller.test.ts:820-827` | Existing test still expects identical captured candidate and operation key across lost-reply retry; added stage has no authority use. |
| Retirement during preparation | `tests/shared/response-action-controller.test.ts:829-840` | Existing test still expects no intake dispatch and no completion after retirement. |
| Signed selector retry | `tests/shared/native-package-signing-host.test.ts:1258-1278` | Existing test still expects unchanged signed bytes, captured selector and Sign call count across Submit retry. |
| Visit retires after awaited controller result | `native-package-signing-host.ts:868`, `790-791` | Existing fence still rejects and logs result-fence stage; low regression risk, no focused diagnostic test (Finding 1). |

Success paths do not call the reporter. Non-Submit failures do not meet Submit action-reference gating. The helper's status bounds cover NaN/out-of-range/nonintegral values by inspection; the focused test asserts NaN specifically.

## Implementer-reported execution

The implementing agent reported final typecheck, changed-file ESLint, and 225 tests passing on the final patch. This reviewer did not execute or independently verify those commands; the verdict rests on the static evidence above.

## Conclusion

VERDICT: APPROVE

- The patch achieves fixed-metadata failure diagnostics through one bounded helper and retains existing effects, guards, keys, evidence, and error/refusal handling.
- Coverage of changed paths: ADEQUATE for this narrow observational change, with the explicit visit-result-fence diagnostic gap above.
- Confidence: HIGH in static implementation review. Tests were read, not run. No browser, runtime, deployment, commit, or service qualification is asserted.
