# Signed task resume code review

VERDICT: APPROVE

No blocking correctness or security defect found in the seven-file patch against `cf47fe1`. The patch admits an authenticated, exact signed task into the existing controller and completion path. It preserves the signed response and requires a separate reviewed Submit. This is approval of the local code change, not deployment or end-to-end Source/WOS qualification.

Review method: independent static review using `semi-formal-code-review`. All seven changed files and relevant callers, callees, types, and tests were read. No browser, service API, private proof fixture, or test execution was used by this reviewer. The implementer reports 419/419 tests across five files, passing typecheck, and passing path-scoped ESLint after the final authority-retirement case. Those execution results are attributed, not independently rerun.

The implementer also reports a composed base RED at `cf47fe1` (`restoration-unresolved` from controller restoration through the native host) and fixed GREEN for the maintained composition/read/host/completion path. The static base diff supports that causal explanation: the base rejected every task `restoreSigned` before receipt adoption; the patch replaces that gate with exact selector checks. This reviewer did not rerun the RED/GREEN experiment.

## 1. Patch summary

The previous unconditional task refusal in `restoreSigned` is replaced with exact task selector validation (`src/shared/response-action-controller.ts:528-542`). A shared assertion validates draft identity, revision, canonical response hash, association hash, and task binding hash (`src/shared/task-draft-wire.ts:5-15`). The assertion also applies to the authenticated signed read (`src/adapters/http/cohort.ts:176-185`) and task completion capture (`src/shared/task-response-completion.ts:18-34`). This removes duplicated selector checks while adding the response-hash check previously absent from completion capture.

Important callers: `createTaskComposition` builds the task-owned cohort and actual `HttpTaskCompletion` (`src/composition/task.ts:69-112`); the native host calls controller restoration after matching the response and checks admission after the await (`src/shared/native-package-signing-host.ts:966-971`). Submit dispatch calls completion capture and complete through the unchanged controller path (`src/shared/response-action-controller.ts:317-335`).

Exploration notes:

- H1: removing the task refusal could admit crossed signed evidence. CONFIRMED as a risk to check, then resolved by receipt checks plus exact selectors: controller lines 533-538 and shared assertion lines 9-13.
- H2: recovery might repeat Save, Prepare, or Sign. REFUTED: restoration publishes the accepted result and invokes the existing post-commit hook; it never invokes those signing methods (controller lines 528-542). The composed test observes two Source transport calls and a separate completion call.
- H3: completion might accept a stale or mismatched hash. REFINED: capture now compares the selector to the frozen draft hash; the maintained controller separately recomputes that hash from the response during receipt qualification (controller lines 558-572). Current Source and WOS authority remain separate guards.
- H4: ordinary intake restoration or Submit might change. REFUTED for this patch: the additional selector assertion is conditional on task selection/completion; ordinary restoration keeps the existing evidence/content checks and intake transport path (cohort lines 179, 200-202; controller lines 531-540).

## 2. Function trace

| Function | File:line | Inputs | Output | Verified behavior |
| --- | --- | --- | --- | --- |
| `assertSignedTaskDraft` | `src/shared/task-draft-wire.ts:5` | Task association, owned draft ID/version/hash | Exact `SignedTaskDraft` or throw | Validates association wire, exact five selector keys, matching ID, safe integer revision >=2, lowercase SHA-256 hash, matching association/binding. |
| `assertTaskDraftWire` | `src/shared/task-draft-wire.ts:19` | Optional association | Return or throw | Existing association/version and optional prefill validation reused. Missing association passes this generic helper but is refused by the new signed helper. |
| cohort `qualifyReadState` | `src/adapters/http/cohort.ts:118` | Authenticated DraftView and current-scope guard | Editable, pending, signed, or submitted state | Preserves launch association/prefill and publication/owner checks; checks signing content, digests and key metadata; signed active task additionally needs exact selectors. |
| `restoreSigned` | `src/shared/response-action-controller.ts:528` | Signed result plus restored response | Published signed/owned state or refusal | Clones/freezes, qualifies full receipt and response hash, checks epoch, content/actor/provider, then task selectors before publication. |
| `assertSavedResponseDraftEvidence` | `src/shared/response-action-controller.ts:558` | Controller context, result, expected response/actor | Return or refusal | Matches draft key, owner, publication, ID, revision, response/data, and recomputed response hash. |
| `checkRestoredSigned` | `src/shared/response-action-controller.ts:189` | Qualified result and current wording | Return or refusal | Matches owner, content source/locale, exactly one signature, provider, mode, and nonempty key metadata. |
| completion `capture` | `src/shared/task-response-completion.ts:18` | Signed response, authored request, invocation input, lifetime | Opaque frozen preparation | Checks current lifetime, task publication and completed response, validates exact signed selectors, verifies planned body/path, stores detached submission in a private WeakMap. |
| completion `complete` | `src/shared/task-response-completion.ts:36` | Captured preparation, operation ID, lifetime | Actual matching task outcome | Refuses foreign preparation/changed key, invokes selected transport, then validates returned task/process/status. |
| native `configureRuntime` restoration branch | `src/shared/native-package-signing-host.ts:966` | Matching restored response/signing | Configured lease | Calls actual controller and rechecks admission and authority generation after restoration. |
| `createTaskComposition` | `src/composition/task.ts:18` | Current Source/WOS sessions, launch, publication, signing policy | Guarded task cohort and completion | Snapshots selection; Source checks surround credential/fetch and draft operations; actual WOS transport has independent auth guard. |
| `HttpTaskCompletion.complete` | `src/adapters/http/task-completion.ts:47` | Submission, stable key, lifetime | Actual task outcome | Schema/publication/key/size checks; current WOS auth before dispatch and after response; sends the exact response and signed selector. |

## 3. Data flow and invariants

1. The Source read creates `signedDraft` from a retained current Sign transition after authenticating the respondent and current task Read authority, matching transition/candidate/revision, and qualifying the retained record (`/Users/mikewolfd/Work/formspec-stack/formspec-server/crates/formspec-server/src/services/responses.rs:435-482`). The service rereads the draft/publication and rechecks authority before returning (`responses.rs:495-511`). The record qualification calls `validate_links` and cryptographic policy verification (`services/responses/task_drafts.rs:778-817`); link validation checks `record_hash` and `record_ref` against the record digest (`crates/formspec-server-ports/src/task_drafts.rs:1299-1308`). These are inspected dependencies, outside the Web patch.
2. Web compares launch association/binding/prefill to the owned read, then hashes the canonical response and compares the available signed selector (`src/adapters/http/cohort.ts:121-124,168-185`). Web does not receive recordHash/ref in `SignedTaskDraft` (`src/ports/task-draft.ts:2-8`) and does not claim independent cryptographic signature verification: its maintained helper checks content/digests/provider/key metadata (`src/adapters/http/response-signing.ts:660-685`). The authenticated Source endpoint remains the retained-record trust boundary.
3. The controller freezes a detached result, qualifies it against the restored response/context, checks epoch after asynchronous evidence qualification, and validates the selector before assigning `signed`, `saved`, `actor`, and `owned` (`src/shared/response-action-controller.ts:532-541`). A selector mismatch publishes no signed handle. The shared helper returns an existing selector reference; its callers already own detached snapshots (controller line 532; completion line 21; draft store lines 123-126).
4. Completion snapshots input, creates the response-plus-selector submission, checks the exact authored HTTP plan, and stores it in a WeakMap. A preparation only escapes as a frozen opaque object; the response and selector escape through the selected transport (`src/shared/task-response-completion.ts:21-45`). They remain selected across ambiguous retries.
5. Restoring signed evidence grants no review readiness. The unchanged controller checks frozen response and authored role/source, then checks signed review before dispatch (`src/shared/response-action-controller.ts:196-199,317-328,406-425`). Completion preserves selected task and operation identity; the WOS service remains the independent acceptance authority (`src/adapters/http/task-completion.ts:20-22,50-66`).

## 4. Test behavior and edge cases

Predictions below follow the inspected test assertions and implementation trace; they are not independent execution claims.

| Test | File:line | Expected patch behavior and trace |
| --- | --- | --- |
| authenticated signed task selector matrix | `tests/adapters/http/response-signing.test.ts:40` | Exact signed read returns active signed state; missing/hash/revision/draft/association/binding changes throw. Asserts recovery only performs GET and no additional Sign. |
| fresh composed native restoration, current/retired during read | `tests/shared/native-package-signing-host.test.ts:134` | Actual task composition and cohort read feed actual host/controller. Current read restores signed state, resolves review through actual runtime data sources, then uses actual completion/HTTP adapter with only transports mocked. Retired Source guard refuses read and never calls completion (lines 168-186). Current branch requires separate Submit and two Source calls (lines 205-222). |
| task controller restoration matrix | `tests/shared/response-action-controller.test.ts:796` | Exact input restores and completes through task strategy; missing/hash/revision/association/binding changes refuse before signed state. Assertions cover no Save/Prepare/Sign/intake submit calls. |
| existing intake signed restore requires fresh review | `tests/shared/response-action-controller.test.ts:246` | Still restores, refuses unready Submit without transport, then permits ready separate Submit without signing writes. |
| existing signed receipt mismatch/withdrawal | `tests/shared/response-action-controller.test.ts:259,268` | Response/hash/content/provider changes refuse; invalidation during hash qualification refuses late publication. |
| actual task outcome and cached completed act | `tests/shared/response-action-controller.test.ts:781` | Exact full response/selector sent; no intake handoff/confirmation; repeated same delivery returns cached result with one completion call. |
| foreign preparations and operation changes | `tests/shared/response-action-controller.test.ts:841` | WeakMap ownership and stored operation key refuse forged/foreign/changed preparation before repeat transport. |
| ambiguous task completion retry | `tests/shared/response-action-controller.test.ts:856` | Lost reply and same invocation retry retain equal captured submission and operation key. |
| WOS auth retired during credentials | `tests/adapters/http/task-completion.test.ts:82` | Delayed token resolves after auth retirement; adapter refuses before fetch. |

Concrete edge cases: missing selectors, crossed draft/revision/hash/association/binding, and Source authority retirement are covered by the new matrices/composed test. Actor/publication/response/hash consistency and controller retirement retain existing tests. Extra selector fields, revision <2 or fractional/unsafe revision, and malformed hash are explicitly refused by the helper (`src/shared/task-draft-wire.ts:9-13`), but do not have new dedicated direct-helper tests. This bounded omission does not undermine the reviewed recovery path. The new selector validation in `capture` shares the same helper; no separate negative capture matrix is added, while existing capture/preparation/retry tests trace that strategy. None of these tests proves live Source retained-record cryptography or WOS acceptance.

The composed test uses the generic native host with no candidate hydration and a neutral pre-Sign qualification hook (`tests/shared/native-package-signing-host.test.ts:177-180,202-206`). It proves the smallest signed recovery path. It does not by itself prove recovery for a publication requiring external hydration or browser adoption; those remain outside this code certificate. This is not a blocking gap for the narrow generic recovery patch.

## 5. Findings

No BLOCKER, WARNING, or NIT requiring a code change.

FINDING 1:
- Severity: OBSERVATION
- Category: security
- Location: `src/adapters/http/response-signing.ts:660-685`; `tests/shared/native-package-signing-host.test.ts:151-165`
- Description: The composed fixture contains a neutral structurally valid detached signature with zero signature bytes. It intentionally exercises the Web recovery path rather than independent cryptographic verification.
- Evidence chain: the Web helper verifies digest/content/key metadata; Source's inspected endpoint qualifies the retained record cryptographically before producing the selector; WOS completion returns a mocked event. The patch adds no credential, schema, private proof bridge, or Web cryptographic authority.
- Suggestion: Keep delivery claims bounded to code recovery and mocked-transport verification; do not describe this fixture as service integration qualification.

## 6. Conclusion

VERDICT: APPROVE

Justification:
- The patch achieves the stated code-level recovery intent: exact authenticated signed task evidence can reach the existing native host, then a separate reviewed task Submit, without another Save, Prepare, or Sign (`cohort.ts:176-185`; `response-action-controller.ts:528-542`; composed test lines 205-222).
- The concrete maintainability improvement is one maintained selector assertion replacing duplicated checks and adding canonical response hash consistency to completion capture (`task-draft-wire.ts:5-15`; `task-response-completion.ts:25-27`). No speed/resource claim is made.
- Coverage of changed paths: ADEQUATE for this local patch, with neutral HTTP transports and explicit authority retirement; not live service or deployment evidence.
- Confidence: HIGH in the static code finding; reported execution outcomes remain attributed to the implementer.
