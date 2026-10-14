# Task completion timeout and outcome recovery code review

VERDICT: APPROVE

No blocking findings. This is a static review of the twelve source/test paths against `2b0ed3ae5467ef3c4fbae5587c5a97ee55a03800`. Reviewed `git diff --binary -- src tests` SHA-256: `4d2754ec2035d1b7a960198fd041b8f41246145b55a247ea6158d64b3d62f897`. Review documents and the local dependency symlink are outside that digest. No browser, service, proof execution, or business write was performed by this reviewer.

## 1. Patch summary

The patch permits a trusted caller to select a finite task completion wait, preserves the existing ten-second default, and distinguishes a timeout after dispatch from confirmed refusal. The controller retains the signature and operation and fences further Submit in its mounted lifetime. Native host chrome explains uncertainty and enables the existing explicit application-status refresh without treating that refresh as task acceptance.

Affected entry points are `HttpTaskCompletion` (`src/adapters/http/task-completion.ts:31`), `createTaskComposition` (`src/composition/task.ts:18`), the native loader (`src/composition/native-package-loader.ts:205`), controller failure/admission (`src/shared/response-action-controller.ts:350`), and `NativePackageFrame` (`src/app/NativePackageRuntime.tsx:221`). The public pins and completion exports change at `src/composition/native-package.ts:55` and `src/ports/index.ts:216`.

The explicit local 120000 ms choice remains a caller's waiting policy. The generic source does not claim a server upper bound or change unrelated defaults.

## 2. Function trace

| Function / method | File:line | Inputs | Output | Verified behavior |
| --- | --- | --- | --- | --- |
| Native loader | `src/composition/native-package-loader.ts:205` | Trusted `nativeTask` pins | Task cohort | Passes the scalar timeout into task composition alongside existing owner checks. |
| `createTaskComposition` | `src/composition/task.ts:18` | Selected Source/WOS sessions, task, optional wait | Cohort and completion strategy | Constructs the completion adapter at line 71 before durable launch; no new reader or task query. |
| `HttpTaskCompletion.constructor` | `src/adapters/http/task-completion.ts:31` | Optional wait | Fixed adapter settings | Defaults to 10000; rejects noninteger, nonpositive, nonfinite, and timer-overflow values. |
| `HttpTaskCompletion.complete` | `src/adapters/http/task-completion.ts:52` | Signed submission, operation key, current lifetime | Exact task outcome or error | Keeps schema, signature, byte cap, key, scope and authority checks; converts only dispatched `TimeoutError` into typed uncertainty. |
| `HttpClient.requestJsonPayload` | `src/adapters/http/http-client.ts:131` | Request and bounded options | Validated JSON | Starts timer before credentials, repeats current checks, admits effect immediately before fetch, bounds response bytes and preserves HTTP errors. |
| `createTaskResponseCompletion.capture/complete` | `src/shared/task-response-completion.ts:18` | Signed evidence and owned preparation | Completion result | Retains private WeakMap preparation and original operation ID; transport errors propagate without replacing signed bytes. |
| Controller `perform` | `src/shared/response-action-controller.ts:202` | Admitted invocation | Outputs or failure | Retains completion preparation at 323; only validated successful completion sets `completionResult` at 332. |
| Controller `fail` / invocation admission | `src/shared/response-action-controller.ts:350` | Typed timeout/current epoch | Unknown snapshot / fenced invocation | Sets task-only latch and refuses both definition and widget Submit at 368/411. |
| Controller `refreshApplication` | `src/shared/response-action-controller.ts:475` | Existing case lookup | Refreshed application receipt | Publishes the existing phase/reason at 485; cannot clear the unknown latch or create task completion. |
| Host `refreshApplication` | `src/shared/native-package-signing-host.ts:753` | Explicit user action | Controller refresh | Uses maintained scoped lifecycle access. |
| `NativePackageFrame` | `src/app/NativePackageRuntime.tsx:221` | Published host snapshot | Alert, review/status controls | Uses safe shared copy at 316, permits signed review at 309 and explicit status refresh at 326. |

## 3. Data flow and invariants

`completionTimeoutMs` travels from trusted pins through the loader and composition into a validated primitive adapter field. It does not enter the authored request body or alter currentness, proof, or server acceptance rules (`native-package-loader.ts:206`, `task.ts:72`, `task-completion.ts:32–34,69`).

`dispatched` is local to one completion attempt. It becomes true only after the final synchronous lifetime/authentication checks, immediately before fetch (`task-completion.ts:68`; `http-client.ts:137–153`). Credential timeout remains the original `TimeoutError`; an actual `HttpAdapterError`, including 409, remains the original error (`task-completion.ts:82–83`). Existing 2 MiB request and 64 KiB response caps remain at 64/69.

`completionOutcomeUnknown` is private controller state, initially false and set only for task completion's typed uncertainty in the same epoch (`response-action-controller.ts:107,350–353`). Neither signed state nor the delivery map is replaced. `perform` retains the original captured preparation and operation; further same/new Submit is refused before completion dispatch (`323,368,411`). Existing signed-state branch guards prohibit another Save/Prepare/Sign at 245. Successful completion follows its existing branch and remains cached (`329–337,450–452`).

An application receipt is not task acceptance. Explicit refresh updates that receipt but republishes the existing phase/reason (`475–485`). Only a valid task completion result can set completion state. No automatic POST retry, Save, Prepare, Sign, progression lookup, or reader was added.

## 4. Tests and concrete edge cases

Assertions were read directly. Execution below is worker-supplied evidence, not reviewer execution.

| Test / case | Evidence | Expected behavior under patch |
| --- | --- | --- |
| Selected short finite wait | `tests/adapters/http/task-completion.test.ts:19` | One dispatched request times out as `TaskCompletionOutcomeUnknown`. |
| Invalid wait values | Same file:33 | Zero, negative, infinity and fractional values refuse construction. |
| 25.2-second response with 120000 ms policy | Same file:38 | Returns exact successful outcome after one request; does not infer a server bound. |
| Default wait | Same file:49 | Omission preserves ten seconds and post-dispatch uncertainty. |
| Actual conflict | Same file:61 | Retains `HttpAdapterError` and status 409. |
| Credential timeout | Same file:66 | Original `TimeoutError`, zero POST, no uncertainty classification. |
| Current authority retirement | Same file:140 | Delayed credentials cannot dispatch under retired WOS authority. |
| Composition propagation | `tests/adapters/http/task-draft-launch.test.ts:61` | Invalid trusted timeout reaches adapter validation before any Source launch. |
| Unknown outcome plus original intake refresh | `tests/shared/response-action-controller.test.ts:782` | Real controller refresh to intake submitted preserves signature/unknown phase; same and new invocation IDs produce zero further completion calls. Original key/response remain exact. |
| Actual completed task caching | Same file:805 | Exact completed task result remains submitted and is not dispatched twice. |
| Generic alert and status refresh | `tests/app/native-package-runtime.test.tsx:81,88` | Safe uncertainty message stays visible after original-intake submitted status; signed review remains available and no widget invocation occurs. |

Worker reports five focused files: **242 passed, one existing skip**; typecheck, exact-path ESLint, and diff check passed. UI tests mock the respondent host, so their absence-of-Submit assertion alone is not proof of widget behavior. The real controller test supplies the transport fence evidence.

## 5. Findings

**Observation — mounted-owner lifetime limit.** `completionOutcomeUnknown` is in-memory state (`response-action-controller.ts:107`), and a new controller initializes it false. Reload/navigation that creates a new owner does not restore uncertainty or the original task submission key. This is the explicitly bounded scope of this patch; there is no deployed exact-outcome recovery reader to support a stronger claim. Do not describe this as durable cross-reload reconciliation or use task absence/original intake status as proof of acceptance.

**Observation — runtime qualification remains separate.** The option is publicly exposed and its direct composition propagation is covered, but the generic patch does not configure the external host or establish an actual server worst-case duration. Demo must pass its explicitly selected 120000 ms policy through the trusted pins. No actual acceptance is established by these tests.

## 6. Conclusion

VERDICT: APPROVE

The patch achieves its stated bounded intent: finite caller-selected waiting, truthful post-dispatch uncertainty, preserved signing evidence, and no repeat Submit within the mounted owner. Coverage of changed paths is **ADEQUATE**. Confidence is **HIGH** for the reviewed static behavior and supplied focused evidence; actual deployment, acceptance, and cross-reload recovery remain separate.
