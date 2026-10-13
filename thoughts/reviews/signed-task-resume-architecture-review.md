# Signed task resume architecture review

**Verdict: APPROVE the implemented narrowed design; RECONSIDER the initial optional recovery/proof-port design.** Reuse the authenticated respondent Source read and the existing `restoreSigned` adoption path. Add one maintained strict signed-task selector assertion at the cohort read, controller restoration, and task completion preparation. Preserve refusal for absent or mismatched selectors. No new service credentials, browser protected evidence reader, signing operation, or proof bridge is justified by this scope.

This certificate reviews the decision at Web commit `cf47fe1` by static inspection. It does not establish runtime qualification, deployed server correspondence, or the cause of an original Submit refusal. Source references below are relative to `/Users/mikewolfd/Work/formspec-stack/formspec-server`; Web references are relative to this checkout.

## Artifact summary and findings

The product outcome is resuming an already signed task response into review and the existing WOS Submit path without Save, Prepare, or Sign. Native host already passes restored signed state into the controller (`src/shared/native-package-signing-host.ts:967-971`), but controller rejects every task restoration (`src/shared/response-action-controller.ts:527-536`). This is a product change with bounded evidence checks, rather than new proof infrastructure.

**Resolved concern at the reviewed base — selector checks were incomplete.** `assertTaskDraftWire` checks association hashes and optional prefill only; it never checks `signedDraft`, including when prefill is absent (`src/shared/task-draft-wire.ts:4-22`). Completion checks draft/version/association/task binding but omits equality between `expectedSignedResponseHash` and the actual maintained response hash (`src/shared/task-response-completion.ts:23-29`). RESHAPE: use a shared strict assertion for signed selector shape and exact draft id, signed version, response hash, association hash and task binding hash. Apply it before signed read adoption, task controller adoption and completion preparation. Compare Source's prefixed `sha256:` digest to Web's bare hexadecimal `handoffHash` deliberately (`src/adapters/http/response-signing.ts:706-708`). Keep malformed or absent selector refusals.

**Concern — browser recordHash is unavailable; keep ownership explicit.** Neither Web's `SignedTaskDraft` nor Source's `TaskDraftSignedView` includes `recordHash` or `recordRef` (`src/ports/task-draft.ts:2-8`; Source `crates/formspec-server/src/services/responses.rs:2594-2603`). Therefore this patch cannot truthfully claim the browser independently compares that record identity. KEEP server-owned record qualification: respondent GET loads the exact retained transition, checks association, full canonical response and signed version, and calls the owning verifier before returning selectors (Source `responses.rs:460-482`). That verifier validates retained linkage and verifies the signature under the admitted public policy (Source `services/responses/task_drafts.rs:778-797`). Retained linkage recomputes the record hash and record reference (Source `crates/formspec-server-ports/src/task_drafts.rs:1299-1308`). A future requirement to expose the record identity in browser state would require a separate Source-owned wire change, not a guessed field or privileged browser reader.

**Observation — the existing trust boundary supports this outcome.** Web's signed result explicitly promises delegated evidence consistency rather than local cryptographic verification (`src/ports/response-signing.ts:76-79`). Both ordinary Sign acceptance and cohort signed restoration use that same digest/content/key consistency helper (`src/adapters/http/response-signing.ts:582-596,660-684`; `src/adapters/http/cohort.ts:174-185`). The proposed restore stays within that boundary. Source respondent read independently checks current session/task authority and rechecks draft/publication and authority before return (Source `responses.rs:418-448,495-512`). Browser review still requires current host admission; WOS remains the final Submit authority (`src/adapters/http/task-completion.ts:20-22,47-66`).

## Lineage and relationships

| Prior artifact | Relation | Evidence |
| --- | --- | --- |
| Commit `3054d2a`, typed completion split | Introduced blanket task restore refusal while keeping production task authority unqualified | Commit message and controller diff |
| Existing intake restoration | Establishes exact signed adoption without writes and fresh review before Submit | `tests/shared/response-action-controller.test.ts:246-257` |
| Authenticated Source task read | Owns current authority, retained record identity and signature qualification | Source `services/responses.rs:418-512`; `services/responses/task_drafts.rs:778-833` |
| Retained mixed browser verifier | Separate protected V2 proof path; not needed for respondent resume | Source `packages/source-mixed-proof-browser/README.md:20-44`; `crates/formspec-server-general-proof-wasm/src/retained.rs:28-33,119-148` |

| Seam | Owner | Input and output | Consumer |
| --- | --- | --- | --- |
| Respondent draft GET | Source | Current respondent/task authority to exact qualified saved response and signed selectors | HTTP cohort |
| Signed adoption | Web controller | Qualified signed result to frozen signed review state | Native host |
| Task completion | WOS plus Web request preparation | Exact frozen response/selectors and stable operation id to validated task outcome | Selected task composition |

No existing Web consumer bridge for `verifyRetainedMixedTaskProof` was found in `src`. The protected Source reader requires independently authorized service purpose before lookup (Source `services/responses/task_drafts.rs:973-980`). Bringing that service capability into a respondent browser would add a distinct boundary without solving the missing local recordHash field economically.

## Invariants and commitments

1. **Preserve signed content — PRESERVED.** Adoption checks exact equality with restored response and maintained handoff hash (`src/shared/response-action-controller.ts:553-567`) and performs no signing write (`527-537`). Keep the persisted `signatureValue` unchanged. This is equality of parsed canonical content and signature value; JSON transport serialization is not proof of original wire-byte preservation.
2. **Owned task identity — RELIED UPON and strengthened.** Cohort pins launch association/task binding/prefill (`src/adapters/http/cohort.ts:120-123`); shared signed selector assertion must also bind the signed revision and response digest.
3. **Locale/content/key — PRESERVED.** Existing signed read resolves authored Locale/content and checks delegated signature metadata/key pin (`src/adapters/http/cohort.ts:162-174`; `response-signing.ts:661-684`). Controller retains its independent content/Locale/provider consistency checks (`response-action-controller.ts:188-193`).
4. **Current authority and WOS acceptance — PRESERVED.** Task composition guards Source reads and WOS session; completion uses lifetime guards and stable operation id (`src/composition/task.ts:57-67,97-110`; `src/shared/task-response-completion.ts:36-45`). Restoration itself creates no accepted task result.
5. **Existing intake restoration — PRESERVED.** Narrow task admission condition; do not require task selectors for intake or loosen pending-sign reconciliation's separate task refusal (`response-action-controller.ts:502,530`).

## User value and counterfactuals

A respondent can resume a persisted signing act and review it before submitting. Reusing one shared selector check reduces duplicate identity checks and avoids another recovery API. Value is falsified if refresh forces a new signing act, changes signature content, or cannot reach existing Submit despite a matching Source read and current review.

Kill criteria: owning respondent read stops qualifying retained records; a mismatched selector is accepted; or restoration invokes Save/Prepare/Sign. Blanket refusal preserves current behavior but prevents this product outcome. Removing new selector qualification would expose the existing omitted response-hash check. The retained mixed verifier only partially overlaps cryptographic checking and does not subsume respondent authority or WOS acceptance.

The likely six-month criticism is overclaiming client proof or deploying against a Source version that does not implement the inspected owning read. Keep the certificate's server-owned qualification distinction and verify actual server correspondence before claiming live qualification.

## Verdict rationale and remaining gaps

Intent matches the narrowed shape; user value is supported; existing trust ownership is honored; conceptual debt decreases through shared checks; sibling subsumption is partial. Confidence is high for static seam ownership, medium for live behavior because this review made no business requests or browser runs. Verify positive resume and negative selector/hash/revision/Locale/key/actor/retirement controls with focused tests; assert zero signing writes and reuse of existing Submit retry behavior. These tests establish the Web boundary only. No cause is assigned to an earlier Submit refusal.

## Final patch rereview

Reviewed the concrete seven-file diff against `cf47fe1`: four implementation files and three test files. The final shape matches the approved narrowed design.

- `src/shared/task-draft-wire.ts:5-16` now owns `assertSignedTaskDraft`: exact five-key selector shape, matching draft id, safe signed version at least two, full prefixed response digest, matching association and task-binding hashes. It reuses the maintained association/prefill validator.
- `src/adapters/http/cohort.ts:176-180` invokes the assertion after the actual signed response handoff hash is computed and after existing authenticated owner/publication/Locale/content/key checks. Current read checks bracket the asynchronous hash. This adds qualification before returning `active.signed`.
- `src/shared/response-action-controller.ts:528-542` removes only the blanket task refusal, retains exact saved-response/hash/actor/content/Locale/provider checks, then requires the strict task selector for task completion before publishing signed state. Missing and mismatched task selectors still fail. Intake takes its unchanged existing path. Pending-sign task refusal remains.
- `src/shared/task-response-completion.ts:25-30` reuses the same assertion, replacing duplicated partial checks and adding response digest correspondence before frozen Submit preparation. No completion transport or operation-id changes occur.

**Current authority:** no new grants are introduced. Source cohort reads remain wrapped by the selected task lifetime and Source guard (`src/composition/task.ts:57-67,97-110`). Native host rechecks admission after restoration and pending delivery (`src/shared/native-package-signing-host.ts:966-971`). Controller epoch invalidation remains checked after asynchronous evidence validation and before adoption (`response-action-controller.ts:139,533`); all new checks after that point are synchronous. Fresh review and owner checking remain required before Submit (`native-package-signing-host.ts:595-601`; `response-action-controller.ts:318-328`). WOS transport still checks its selected current session and dispatch lifetime. This preserves current-owner checks rather than deriving authority from selectors.

**Conservation:** the implementation never rewrites the response or signature. It freezes a clone, checks equality against the original restored response, and passes the same frozen response into task preparation. The helper reads metadata only. No Save, Prepare, Sign, protected proof read, schema change, port change, or recovery callback was added. Original JSON wire-byte conservation remains outside the claim; parsed content and exact signature value are preserved.

**Verification evidence:** inspected added tests cover authenticated GET-only signed read acceptance/refusal for missing, hash, version, draft, association and task-binding mismatches; controller task restoration/refusal and zero new signing writes; and a fresh native host reading, reviewing and submitting through maintained task composition. Native-host signature bytes are a structurally valid mocked fixture and do not constitute cryptographic or live-server proof. The composed host test also retires Source authority during the owned GET and verifies that the original `Selected task owner retired` error refuses the read before signed adoption, with no WOS completion call (`tests/shared/native-package-signing-host.test.ts:168-186`). Existing intake fresh-review, late-retirement and Submit retry tests remain present. The parent reports 419 focused tests passing; this reviewer inspected tests statically and did not independently execute them. No new actionable architecture finding remains.

Remaining limits are unchanged: `recordHash` qualification belongs to the authenticated Source owning read, actual deployed server correspondence is not verified here, and this patch does not diagnose an earlier Submit refusal.
