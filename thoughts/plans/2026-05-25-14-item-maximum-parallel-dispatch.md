---
title: 14-item maximum-parallel dispatch
date: 2026-05-25
status: in progress
scope: cross-stack — formspec-web + formspec + work-spec + trellis + formspec-stack root
rows: FW-0015 / FW-0019 / FW-0028 slice 2 / FW-0038 / FW-0041 / FW-0060 / FW-0061 / FW-0073 / FW-0074 / FW-0076 / FW-0077 / FW-0113 + ADR-0011 amendment + EXT-5/EXT-1/EXT-2/EXT-4/EXT-7/EXT-8 + XS-1/XS-3/XS-4/XS-5 + SC-1/SC-2/SC-4/SC-5/SC-6
---

# Plan — 14-item maximum-parallel dispatch

## §0 Reality check

"All in parallel" has real dependency edges. The honest shape:

- **Wave 1** (pure spec/ADR/doc authoring + formspec-web-local builds): genuinely independent; can fan out without coordination.
- **Wave 2** (builds for landed designs): logically depend on Wave 1 outputs, but **can dispatch speculatively in parallel** — design port shapes + draft code + write tests against the *proposed-but-not-yet-landed* upstream shapes (the designs already pin those shapes), then validate-and-adjust when Wave 1 ratifies. Worst-case rework is small because the design proposals are already PROPOSAL-status and the shapes are locked.
- **Single coordination chokepoint** that *cannot* race: the `RUNTIME_FEATURE_KEYS` append-only tuple in `feature-keys.ts`. Pre-allocate positions before dispatch.

Orchestrator context cost is the only real ceiling. The plan bundles related work to keep agent count ~20 not ~87.

## §1 Pre-flight namespace allocation (do FIRST, before any dispatch)

Done inline; costs ~5 minutes, prevents 14 hours of collision.

**RuntimeFeatureKey positions (append-only):**

- Position 10: `trustedReviewer` (FW-0113)
- Position 11: `bringYourOwnAssistant` (FW-0062 future; not in this batch but reserved)
- Position 12: `safeAddress` (FW-0060)
- Position 13: `duressAware` (FW-0059 future; not in this batch)
- Position 14: `multiParty` (FW-0061)
- Position 15: `recordLifecycle` (FW-0038; normative FW-0034 key — not `correctableSubmission`)

**FEATURE_PORT_MAP** entries pinned to match (verified before Wave A dispatch):

| Position | RuntimeFeatureKey | FEATURE_PORT_MAP binding |
|---:|---|---|
| 10 | `trustedReviewer` | `["reviewerSession", "reviewThreadStore"]` |
| 11 | `bringYourOwnAssistant` | `[]` — unavailable-only reservation until FW-0062 chooses the Assist Provider port shape |
| 12 | `safeAddress` | `"safeAddressDirectory"` |
| 13 | `duressAware` | `[]` — unavailable-only reservation until FW-0059 chooses the safety-routing port shape |
| 14 | `multiParty` | `[]` — unavailable-only reservation until FW-0061 materializes the existing-port extension proof |
| 15 | `recordLifecycle` | `"lifecycleActionClient"` |

Implementation note: `FEATURE_PORT_MAP` now accepts one-to-many port bindings so FW-0113 can require both `ReviewerSession` and `ReviewThreadStore`. Empty bindings are unavailable-only; `assertCompositionCoherence` rejects any composition that declares those reserved keys as available/demo-stub before a concrete backing port is landed.

**PLANNING.md row reservations** (each agent updates its own row only; explicit-paths commits):

- FW-0073 / FW-0074 / FW-0076 / FW-0077 rows already exist
- FW-0113 exists
- FW-0038 exists
- FW-0060 exists
- FW-0061 exists
- FW-0019 exists
- FW-0028 row (slice 2 update to existing)
- FW-0015 owner-action — different mechanism (see §3)

**Sidecar / ADR / EXT numbers**: all already allocated in the various design docs. No new numbers minted.

**Port name allocations** (each Wave-2 build owns these ports exclusively):

- FW-0113: `ReviewerSession`, `ReviewThreadStore`
- FW-0038: `LifecycleActionClient` (per FW-0034 §3)
- FW-0060: `SafeAddressDirectory` (FW-0049 §4.2; masking is render discipline, not the port)
- FW-0061: no new `PartyAuthority` preallocation. FW-0050 §3.2 extends `DraftStore`, `IdentityProvider`, and `SubmitTransport`; FW-0061 may ratify a new port only if consumer code proves one is forced.

**Verification (pre-Wave A):** `npm run typecheck` and `npm run test:unit` pass after the namespace patch. Architecture scout returned BLOCKER/HIGH findings on stale names and one-slot reviewer mapping; all are remediated or justified in §9.

## §2 Wave 1 dispatch (12 parallel subagents)

All in isolated worktrees; explicit-paths commits; no push; no parent-pointer bump.

| # | Agent | Scope | Repo |
|---|---|---|---|
| W1.1 | **ADR-amendments-batch** | web ADR-0011 amendment to enumerate `trustedReviewer` (rides FW-0037 amendment per split-keys discipline; small) + EXT-5 payload ratification for `bot-protection-cleared` (per FW-0036 §4.4) | formspec-web + formspec |
| W1.2 | **XS-ADR-1** | XS-1 cross-stack ADR (multi-party intake spanning formspec + WOS + trellis per FW-0050 design §7) | formspec-stack root |
| W1.3 | **XS-ADR-3** | XS-3 cross-stack ADR (coercion-aware signing per FW-0048 §6.5) | formspec-stack root |
| W1.4 | **XS-ADR-4-5** | XS-4 (safe-address per FW-0049 §6) + XS-5 (correction-path per FW-0034 §6.4) — both touch formspec + WOS + trellis | formspec-stack root |
| W1.5 | **SC-1-2-5-batch** | SC-1 (Notification Template) + SC-2 (Deletion Receipt) + SC-5 (WYSIWYS Ceremony) sidecar specs — all small, all formspec-side | formspec |
| W1.6 | **SC-4** | SC-4 (Identity Binding Profile with WebAuthn binding) — load-bearing for FW-0031; standalone agent because it's substantive | formspec |
| W1.7 | **SC-6** | SC-6 (Review Thread Sidecar per FW-0042 §3.2) — load-bearing for FW-0113; standalone | formspec |
| W1.8 | **EXT-ratifications-batch** | EXT-1 reduction + EXT-2 + EXT-4 + EXT-7 + EXT-8 — all formspec spec ratifications | formspec |
| W1.9 | **FW-0041** | Public-terminal hygiene build (`NotificationDelivery` port + UI cleanup) | formspec-web |
| W1.10 | **FW-0019** | Server Locale Documents migration | formspec-web |
| W1.11 | **FW-0028-slice-2** | Form-driven assurance step-up (requires EXT-8 from W1.8 — speculative against the proposed shape; W1.8 + W1.11 coordinate via the EXT-8 design proposal) | formspec-web |
| W1.12 | **file-upload-slice-2** | FW-0073 + FW-0074 + FW-0076 + FW-0077 bundled — same domain (camera capture / on-device redaction / resumable / demo attachment) shares helpers and tests | formspec-web |

**FW-0015** (owner sign-off on design tokens) is **NOT a subagent task** — it requires owner action. Owner prompt at end of plan dispatch.

## §3 Wave 2 dispatch (4 parallel subagents — speculative)

Dispatched **simultaneously with Wave 1**, NOT after. Each Wave 2 agent reads its design's PROPOSAL shape + Wave 1 in-flight outputs (worst case: each Wave 2 agent waits 0 minutes; the speculative shape comes from the design doc, not from Wave 1's commits).

| # | Agent | Scope | Depends on (speculative) |
|---|---|---|---|
| W2.1 | **FW-0113 build** | Trusted-reviewer build slice 1 — `ReviewerSession` + `ReviewThreadStore` ports + adapters + reviewer-UI shell + respondent share/revoke + verifier render | W1.1 (ADR-0011 amendment) + W1.7 (SC-6) |
| W2.2 | **FW-0038 build** | Correction-path build — `LifecycleActionClient` port + UI for amend/withdraw/dispute + EXT-5 event consumers | W1.8 (EXT-5) + W1.4 (XS-5) |
| W2.3 | **FW-0060 build** | Safe-address handling build — `safeAddress` runtime gate + mask discipline + verifier render | W1.8 (EXT-1 reduction) + W1.4 (XS-4) |
| W2.4 | **FW-0061 build** | Multi-party submission build — `multiParty` runtime gate + existing `DraftStore` / `IdentityProvider` / `SubmitTransport` extensions + per-party signer flow; do not mint `PartyAuthority` unless the build proves FW-0050 §3.2's conditional clause fires | W1.2 (XS-1) + W1.8 (EXT-3) |

## §4 Review / remediate / verify cadence

The orchestrator batches the review cycle to control context cost:

1. **Implementer wave** (Wave 1 + Wave 2 dispatched simultaneously) — 16 agents in flight at once.
2. **As each agent completes**, do NOT immediately dispatch reviewer. Instead, accumulate completions into review batches.
3. **Review batches** (dispatched in groups of 4 reviewers in parallel) — each reviewer covers one completed work product. Established pattern: independent reviewer, never the implementer.
4. **Remediator** dispatched per finding cluster (one per work product needing it).
5. **Verifier** dispatched per remediator.

Worst case: 16 implementer + 16 reviewer + ~10 remediator + ~10 verifier = ~52 total agents. Mitigation: skip reviewer entirely for **truly trivial** items (W1.10 FW-0019 if it's pure data migration; W1.1 EXT-5 payload if it's a single-line schema add) — but **never** skip reviewer for builds (Wave 2 all need full cycle) or for any spec authoring.

## §5 Risk callouts + mitigations

**R1 — `feature-keys.ts` contention.** Four Wave-2 builds consume preallocated keys (FW-0113 `trustedReviewer`, FW-0038 `recordLifecycle`, FW-0060 `safeAddress`, FW-0061 `multiParty`). Mitigation: the tuple is preallocated before Wave A, and each agent prompt pins its exact key. The agents commit in deterministic order during the review phase, not the implementation phase, so race risk is on the order of merge-text-conflict (resolvable, not corruption).

**R2 — Speculative Wave 2 against shifting Wave 1 shapes.** If a Wave 1 reviewer pushes back on (e.g.) SC-6's port shape, FW-0113 has to adjust. Mitigation: every Wave 2 agent's prompt names "speculative against PROPOSAL shape in design doc X §Y; if PROPOSAL shifts during Wave 1 review, expect remediation in your verifier cycle." Cost is bounded because design shapes are PROPOSAL-status — owner-reviewed at design time.

**R3 — PLANNING.md write contention.** Mitigation: each agent owns ONE row; explicit-paths commits per parallel-craftsman safety memory rule. Cherry-pick if branch divergence happens (proven workable from this session).

**R4 — Cross-repo commit ordering.** Wave 1 + Wave 2 touch formspec-web + formspec + work-spec + trellis + formspec-stack root. The "N+1 commits" submodule discipline (one per affected submodule + parent pointer bump) holds. Each agent commits inside its own submodule; orchestrator restages parent pointer at end of each session pass.

**R5 — XS-N cross-stack ADRs touch ratified subsystems.** XS-1 / XS-3 / XS-4 / XS-5 modify the seam contracts of formspec + WOS + trellis. Mitigation: XS agents (W1.2 / W1.3 / W1.4) authoring is doc-only; the implementing rows (W2.1 / W2.2 / W2.3 / W2.4) carry the actual binding code. No subsystem invariant breaks in Wave 1.

**R6 — Token / context budget.** This dispatch is bigger than any single prior session. Mitigation: dispatch in two waves of 8 agents each (not all 16 at once). Wave A: W1.1, W1.2, W1.5, W1.8, W1.9, W1.10, W2.1, W2.2. Wave B (dispatched ~30 min later): W1.3, W1.4, W1.6, W1.7, W1.11, W1.12, W2.3, W2.4. This stretches orchestrator load.

**R7 — FW-0015 owner-action gate.** Owner prompt mid-plan: "FW-0015 design-tokens candidate sign-off — approve, revise, or reject?"

## §6 Concrete dispatch script

1. **Verify pre-allocation** of the 6 feature-key positions in PLANNING.md (one quick commit; explicit paths).
2. **Dispatch Wave A (8 agents)** in a single message: W1.1, W1.2, W1.5, W1.8, W1.9, W1.10, W2.1, W2.2 — each with isolated worktree, run_in_background, scoped prompt naming the design citation + commit discipline + speculative-shape callout.
3. **Dispatch Wave B (8 agents)** in a single message ~30 min later: W1.3, W1.4, W1.6, W1.7, W1.11, W1.12, W2.3, W2.4.
4. **As completions arrive**, batch into reviewer dispatches (4 reviewers at a time).
5. **As reviews arrive**, dispatch remediators per finding cluster.
6. **As remediators land**, dispatch verifiers per work product.
7. **At end of session**: single parent-pointer bump commit + summary report. Do NOT push.
8. **Prompt owner**: FW-0015 sign-off needed.

## §7 Honest projection

- **Wave A end-to-end (implementer → verifier)**: ~6–10 orchestrator turns.
- **Wave B end-to-end**: ~6–10 turns.
- **Total session**: 16 implementer agents + ~16 reviewers + ~8 remediators + ~8 verifiers = **~48 agent dispatches** producing **~50–80 commits** across **5 submodules**.
- **Real PR landed**: roughly 14 closed/ratifiable rows + the implicit ratification of 1 ADR amendment + 1 EXT payload + 5 EXT ratifications + 6 XS ADRs + 5 SC sidecars.
- **Risk of incomplete close-out**: HIGH — some work will land in "verified-ratifiable" status pending owner sign-off (per the FW-0042 pattern); some Wave 2 builds may need a second remediation pass after Wave 1 shapes harden.

## §8 Confirmation gates (before kickoff)

1. Is this scope shape right, or trim/expand any rows?
2. Wave A / Wave B split (~30 min stretch), or all 16 dispatched in one shot?
3. Skip-reviewer for trivial items (W1.10, W1.1 EXT-5 payload): OK, or full-cycle every row?
4. FW-0015 owner sign-off: now (before dispatch) or end-of-session?

On "go", start at §6 step 1.

## §9 Deviations

### 2026-05-25 — Pre-Wave A namespace architecture scout remediation

Independent scout `019e5e39-e16a-7431-b450-24d761bdd075` returned a BLOCK Wave A verdict on the original §1 shape. Remediation applied before dispatch:

- BLOCKER F1: `correctableSubmission` replaced with `recordLifecycle` at position 15. Evidence: FW-0034/FW-0038 canonical shape names `recordLifecycle`; `correctableSubmission` was plan drift.
- BLOCKER F2: `FEATURE_PORT_MAP` now supports one-feature-to-many-port bindings; `trustedReviewer` maps to both `reviewerSession` and `reviewThreadStore`.
- HIGH F3: FW-0060 port allocation corrected from `SafeAddressMaskingPolicy` to `SafeAddressDirectory`.
- HIGH F4: FW-0061 `PartyAuthority` preallocation removed. `multiParty` is reserved unavailable-only until FW-0061 proves whether a new port is forced; the normative design extends `DraftStore`, `IdentityProvider`, and `SubmitTransport`.
- MED F5: `bringYourOwnAssistant`, `duressAware`, and `multiParty` have empty `FEATURE_PORT_MAP` bindings. This keeps the RuntimeFeatureKey positions reserved while `assertCompositionCoherence` rejects any non-`unavailable` declaration until the deferred build rows land a concrete port/capability-proof shape.

### 2026-05-25 — Wave-B formspec-web build hardening and review-loop closure

The W2.3/W2.4 formspec-web build rows needed review-driven rework after the first integration pass. These are not new rows; they are the remediator/verifier cycles required by §4.

| Row | Cycle status | Current evidence |
|---|---|---|
| W2.3 / FW-0060 safe-address build | closed after reviewer findings from Meitner, Tesla, Fermat, and final clean review by Nietzsche | commits `6e02690`, `8e5a163`, `338ebd1`, `b53cbe3`; `PLANNING.md` FW-0060 progress note updated; final gates green before root pointer `2effdc3` |
| W2.4 / FW-0061 multi-party build | closed after reviewer findings from Banach, Plato, Hubble, and final clean review by Turing/Volta | commits `fb142c4`, `c41a151`, `0700b2e`, `634ac02`, `d38a66a`; `PLANNING.md` FW-0061 progress note updated; final gates green before root pointer `2effdc3` |

Remediation details:

- FW-0060 safe-address: protected safe-* fields now force required mode even if the extension says `false` or `optional`; form-empty arrays no longer override org jurisdiction/audience limits; form-level and field-level audiences are intersected with org safe-address policy; verifier-grade requests over a fallback-only deployment throw `UnsupportedRequiredFeatureError`; `SafeAddressDirectory` validation runs before intake handoff construction.
- FW-0061 multi-party: signer progress persists through `DraftStore`; aggregate handoff/HTTP `response_data` is built from all party responses; same-session replay is blocked while awaiting the next signer; persisted-reload replay validates signer eligibility before any party-draft write; the regression now checks the subject-scoped `multiPartyDraftKey`.
- Ad-hoc gate fixes: `9cd3f55` registered `MultiPartyPolicyExtractor` and `SafeAddressPolicyExtractor` in the conformance suite after `check:conformance-coverage` exposed the gap; `9070ec2` made `npm run lint` ignore generated agent worktrees and `21bc7d2` narrowed that ignore to `.claude/worktrees/**` after reviewer feedback.

Verification run before root pointer `2effdc3`:

- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:conformance-coverage`
- `npm run build`
- `git diff --check`

### 2026-05-25 — W1.9 / FW-0041 public-terminal review-loop closure

Independent generic reviewer `019e5ef6-70c3-7a03-a5be-e003dc148ab8` reviewed the FW-0041 public-terminal hygiene slice and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal code review over the current implementation.

Findings remediated:

- BLOCKER F1: "Clear this computer" deleted only the current `draftKey`, leaving multi-party progress and party-scoped draft slices outside the clear path. Remediation: `clearPublicTerminalDraftState()` now deletes the base draft, multi-party progress draft, all required party-scoped draft keys, and explicitly invalidates the current subject before identity revocation.
- BLOCKER F2: SMS/print proof text could expose a WOS/spec-shaped URL because `caseUrn` was encoded into a `/status?case=...` URL. Remediation: SMS and print-only text now use only explicit `trackingUri`; the case-URN-backed screen tracking link remains for FW-0039 screen navigation but is hidden from print.
- WARNING F3: print CSS did not hide trusted-reviewer controls on the confirmation page. Remediation: print CSS hides `.trusted-reviewer` and the direct confirmation tracking anchor.

Reviewer re-check returned CLEAN. W1.9 / FW-0041 is cycle-closed for the recorded build slice; the release gap about real SMS adapters remains an adopter wiring gap, not a review blocker.

Verification run after remediation:

- `npm test -- tests/app/public-terminal-hygiene.test.tsx tests/app/confirmation-panel.test.tsx src/policy/feature-keys.test.ts`
- `npm test -- tests/adapter-conformance/notification-delivery/conformance.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:testing-plan`
- `npm run check:mvp-audit`
- `git diff --check`

### 2026-05-25 — W1.10 / FW-0019 Locale Documents review-loop closure

Independent generic reviewer `019e5f05-b3e0-7663-9993-3b2f543fcfbd` reviewed the FW-0019 server Locale Documents migration and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal code review over the current implementation.

Findings remediated:

- BLOCKER F1: `RespondentRuntime` loaded the Definition from `composition.initialDefinitionUrl` but asked for Locale Documents with the returned canonical `definition.version`, causing `HttpDefinitionSource` to fetch the same runtime endpoint under a different cache key and potentially mix Definition A with Locale Documents from payload B. Remediation: runtime now calls `getLocaleDocuments(composition.initialDefinitionUrl)` with the same source URL / no version shape as `getDefinition`, and a real-HTTP runtime test proves one `/runtime/forms/{form_id}` request supplies both the Definition and Locale Documents.
- WARNING F2: `HttpDefinitionSource` still parsed `locale_refs` as a possible Locale Document container. Remediation: locale extraction is limited to `locales`, `locale_documents`, and `localeDocuments`; a negative regression includes a valid Locale Document-shaped value in `locale_refs` and expects it to be ignored.

Reviewer re-check returned APPROVE with no remaining blockers or warnings for W1.10 closure.

Verification run after remediation:

- `npm test -- tests/adapters/http/definition-source.test.ts tests/app/respondent-runtime.test.tsx tests/adapter-conformance/definition-source/conformance.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:testing-plan`
- `npm run check:mvp-audit`
- `npm run check:conformance-coverage`
- `npm run build`
- `git diff --check`

### 2026-05-25 — W1.11 / FW-0028 assurance step-up review-loop closure

Independent generic reviewer `019e5f10-5205-7390-8b8a-c0ffacaaf00f` reviewed the FW-0028 slice 2 assurance step-up work and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal code review over the current implementation.

Findings remediated:

- BLOCKER F1: targeted step-up trusted `discover(formAssuranceFloor)` to return only satisfying options, so a mixed/misbehaving adapter could expose under-assurance choices. Remediation: `RespondentRuntime` filters step-up options through `idpOptionMeetsAssurance()` before rendering; IdentityProvider conformance now rejects under-assurance results for a requested floor; runtime coverage includes a misbehaving adapter that returns L1/L2/L3 while the L3 step-up surface only renders the L3 IdP.
- WARNING F2: runtime coverage exercised anonymous-to-OIDC as a subject-change branch, not the same-subject assurance restart branch. Remediation: a same-subject L1→L3 runtime regression now proves no draft load while under-assured, no subject invalidation, and draft hydration only after the stronger same-subject claim arrives.
- WARNING F3: composite same-subject evidence refresh handling only considered `nistAssurance`. Remediation: `CompositeIdentityProvider` claim equivalence now includes credential/session/evidence fields (`credentialType`, `credentialRef`, `evidenceRef`, `expiresAt`, DID / verification / personhood / binding / privacy / selective-disclosure fields) in addition to assurance and NIST evidence; coverage verifies same-subject credential evidence refresh emissions.

Reviewer re-check returned APPROVE with no remaining blockers or warnings for W1.11 closure.

Verification run after remediation:

- `npm test -- tests/app/respondent-flow.test.ts tests/app/respondent-runtime.test.tsx tests/adapters/identity/composite.test.ts tests/adapter-conformance/identity-provider/conformance.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:testing-plan`
- `npm run check:mvp-audit`
- `npm run check:conformance-coverage`
- `npm run build`
- `git diff --check`

### 2026-05-25 — W1.12 / FW-0073-FW-0077 file-upload review-loop closure

Independent generic reviewer `019e5f1d-3f24-7801-90dc-e473f5c860cb` reviewed the FW-0073 / FW-0074 / FW-0076 / FW-0077 bundled file-upload slice and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal code review over the current implementation.

Findings remediated:

- BLOCKER F1: redaction boxes survived page-edge detection in the wrong coordinate space. Remediation: `Detect page edges` now clears existing redaction boxes when `cropToDetectedPageEdges()` returns a changed `File`, preventing stale normalized rectangles from being burned into the cropped image.
- WARNING F2: picked-image legibility warnings used only the small-file heuristic, while camera captures used the actual resolution / contrast / glare canvas analysis. Remediation: picked images now decode through `analyzeImageFileLegibility()` and use the same canvas heuristic as camera captures, with the small-file heuristic only as a fallback.
- WARNING F3: `persistentDemoAttachmentStore().getStoredBytes()` trusted localStorage JSON/base64. Remediation: persisted entries are shape-validated, malformed JSON/bad shape/bad base64 returns `undefined`, and storage access falls back defensively when browser storage throws.
- WARNING F4: tests did not prove successful camera/redacted upload payloads. Remediation: runtime tests now assert the exact bytes passed to the store for successful redacted uploads and successful camera captures; an additional regression proves redact → detect page edges → upload does not burn stale redaction rectangles.

Adopter-shape clarification added while closing the row: `AttachmentStore` is explicitly a dependency-injected boundary. Production adapters may implement direct pre-signed URL uploads, adopter file-proxy services, S3/R2/Azure Blob/server-bundled/vendor-managed/IPFS storage, and optional client-side / zero-trust encryption behind the injected adapter. The respondent renderer does not branch on storage topology, keys, encryption metadata, or proxy policy.

Reviewer re-check returned APPROVE with no remaining blockers or warnings for W1.12 closure.

Verification run after remediation:

- `npm test -- tests/app/attachment-upload-control.test.tsx tests/adapters/persistent-attachment-store.test.ts tests/demo/sample-form.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:testing-plan`
- `npm run check:mvp-audit`
- `npm run check:conformance-coverage`
- `npm run build`
- `git diff --check`

### 2026-05-25 — W2.1 / FW-0113 trusted-reviewer review-loop closure

Independent generic reviewer `019e5f2a-f948-7952-b51e-910560b0748e` reviewed the FW-0113 trusted-reviewer build and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal code review over the current implementation.

Findings remediated:

- BLOCKER F1: `ReviewThreadStore.read` accepted only a deterministic `threadId`, allowing a revoked reviewer who retained the ID to read the thread. Remediation: the port now requires `sessionToken`; the stub authorizes respondent tokens or active non-revoked/non-expired reviewer capabilities scoped to the thread; the HTTP adapter forwards `x-formspec-review-session`; `ReviewerRuntime` passes the capability grant token for initial reads and refreshes.
- BLOCKER F2: safe-address fields were not automatically masked from reviewers. Remediation: `trustedReviewerPolicySnapshot()` unions `profile.safeAddress.fields` into the respondent-only pointer set, reviewer snapshots omit those values, reviewer UI suppresses suggestion controls for respondent-only fields, and the store rejects respondent-only suggestions.
- HIGH F3: multi-party reviewer shares were not party-scoped. Remediation: reviewer thread IDs and draft refs include `partyRef`; `RespondentRuntime` passes the active party-scoped draft key and `partyRef` into `mintShare`.
- HIGH F4: reviewer assurance floors parsed but did not enforce anything. Remediation: the stub `ReviewerSession` fails closed with `human-reviewer-unauthorized` when `reviewerAssuranceFloor` is present, because this slice has no Tier-2 reviewer IdP ceremony.
- MEDIUM F5: `trustedReviewer.allowedRoles` used shallow merge semantics. Remediation: org/form role arrays now intersect, and empty intersections raise `trusted-reviewer-role-intersection-empty`.
- MEDIUM F6: `/r/:threadId/:capability` rendered reviewer runtime but was not boot-narrowed. Remediation: a reviewer route descriptor consumes only `trustedReviewer`; `chooseComposition()` dispatches reviewer URLs into route narrowing; narrowed demo/production compositions wire only the reviewer ports for this surface.

Reviewer re-check returned APPROVE with no remaining blockers. Residual risk is explicit: Tier-2 behavior is fail-closed until a reviewer-facing IdP upgrade ceremony exists, and HTTP reviewer adapters remain reference seeds whose server-side enforcement is an adopter/server contract.

Verification run after remediation:

- `npm test -- tests/app/trusted-reviewer-runtime.test.tsx tests/adapter-conformance/reviewer-session/conformance.test.ts tests/adapter-conformance/review-thread-store/conformance.test.ts tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts tests/profiles/composition-coherence.test.ts tests/composition/route-narrowing.test.ts tests/app/status-boot-narrowing.test.ts src/policy/resolver.test.ts tests/adapters/unavailable-sentinel.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:testing-plan`
- `npm run check:mvp-audit`
- `npm run check:conformance-coverage`
- `npm run build`
- `git diff --check`

### 2026-05-25 — W2.2 / FW-0038 record-lifecycle review-loop closure

Independent generic reviewer `019e5f41-39c1-7592-ada5-70aeff950207` reviewed the FW-0038 record-lifecycle build and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal code review over the current implementation.

Finding remediated:

- BLOCKER F1: withdrawal could submit a post-determination rescission request without policy authorization. `RecordLifecycleWithdrawablePolicy` and the resolver preserved `postDeterminationIntent` / `requiresIssuerAcceptance`, but `effectiveLifecycleAction()` dropped those fields, `WithdrawActionForm` always rendered the review checkbox, and the stub accepted `rescissionRequested` even when action availability did not authorize it. Remediation: `LifecycleActionAvailability` now carries `postDeterminationIntent` + `requiresIssuerAcceptance`; `effectiveLifecycleAction()` preserves them from resolved withdrawable policy; `WithdrawActionForm` renders and submits the review request only when policy declares `postDeterminationIntent: 'rescission-requested'` and issuer acceptance; the stub rejects unauthorized `rescissionRequested: true` before appending a withdrawal event. Runtime, conformance, and stub tests cover unauthorized rejection plus authorized success.

Reviewer re-check returned APPROVE with no remaining blockers. Residual risk is explicit: submitted correction/dispute reason classification remains adapter/event-supplied, and FW-0060 reveal plus FW-0061 multi-party approval flows remain named deferred compositions.

Verification run after remediation:

- `npm test -- tests/app/status-runtime.test.tsx tests/adapter-conformance/lifecycle-action-client/conformance.test.ts tests/adapters/lifecycle-action-client-stub.test.ts`
- `npm test -- tests/app/status-runtime.test.tsx tests/adapter-conformance/lifecycle-action-client/conformance.test.ts tests/adapters/lifecycle-action-client-stub.test.ts tests/adapters/lifecycle-action-client-unavailable.test.ts src/policy/extract-form-policy.test.ts src/policy/resolver.test.ts tests/composition/route-narrowing.test.ts tests/profiles/composition-coherence.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:testing-plan`
- `npm run check:mvp-audit`
- `npm run check:conformance-coverage`
- `npm run build`
- `git diff --check`

### 2026-05-25 — W1.1 / ADR-0011 + EXT-5 review-loop closure

Independent generic reviewer `019e5f4e-10a0-77e3-91ba-70aeb42473ab` reviewed the W1.1 ADR-0011 amendment plus EXT-5 `bot-protection-cleared` payload ratification and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal review over the current artifacts.

Finding remediated:

- BLOCKER F1: ADR-0011 claimed the old reviewer/preparer umbrella was split into sibling `preparerFiling` + `trustedReviewer` keys, but only `trustedReviewer` was actually enumerated in ADR-0011 and `RUNTIME_FEATURE_KEYS`. Remediation: ADR-0011 now lists both sibling rows and explicitly distinguishes human preparer authorship/handoff from trusted reviewer read/comment/suggest behavior; `RUNTIME_FEATURE_KEYS` now includes `preparerFiling` immediately before `trustedReviewer`; `FEATURE_PORT_MAP.preparerFiling` is an empty unavailable-only binding until FW-0037 lands concrete filer-session / signer-handoff ports; compositions and policy fixtures declare it unavailable; composition coherence now proves declaring it available fails while no backing port exists.

Reviewer re-check returned APPROVE. EXT-5 `bot-protection-cleared` remained clean in the review: spec text covers required `data`, allowed/required/forbidden presence semantics, closed tier/outcome values, and non-fingerprinting opaque `evidenceRef`; schema and fixtures validate positive human, registered-agent, denied, missing-data, extra-field, and wrong-event cases.

Verification run after remediation:

- `npm test -- src/policy/feature-keys.test.ts tests/profiles/composition-coherence.test.ts tests/profiles/composition-policy-wiring.test.ts tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts src/policy/resolver.test.ts tests/policy-resolution/resolve-cases.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:conformance`
- `npm run check:testing-plan`
- `npm run check:mvp-audit`
- `npm run check:conformance-coverage`
- `npm run build`
- `git diff --check`
- In `../formspec`: `.venv/bin/python -m pytest tests/conformance/schemas/test_respondent_ledger_schema.py`

### 2026-05-25 — W1.2 / XS-1 multi-party intake ADR review-loop closure

Independent generic reviewer `019e5f5c-3303-7e02-a9dc-afaa16739bb4` reviewed ADR 0155 for W1.2 / XS-1 and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal review over the current cross-stack ADR and cited FW-0050 / FW-0061 boundaries.

Finding remediated:

- WARNING F1: ADR 0155 used "authorizes" language while the ADR was still `proposed`, overclaiming its authority relative to the FW-0050 proposal status and FW-0061 upstream-ratification boundary. Remediation: ADR 0155 now says it proposes the contract and does not authorize implementation until ratified; the follow-on blocker now keeps FW-0061's cross-stack product row blocked on ratification of ADR 0155 plus EXT-3 / EXT-28.

Reviewer re-check returned APPROVE with no remaining findings. ADR 0155 remains proposed; this closes the review loop for the recorded XS-1 ADR slice, not the owner ratification or downstream schema/WOS/Trellis work.

Verification run after remediation:

- `git diff --check -- thoughts/adr/0155-multi-party-intake.md`

### 2026-05-25 — W1.3 / XS-3 coercion-aware signing ADR review-loop closure

Independent generic reviewer `019e5f60-ce17-77e3-ac67-9cd8ba08da9e` reviewed ADR 0156 for W1.3 / XS-3 and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal review over the cross-stack ADR, FW-0048 / FW-0059 boundaries, and the upstream extension queue.

Findings remediated:

- HIGH F1: ADR 0156 used "authorizes" language while still `proposed`, overclaiming authority relative to FW-0048's proposal status and FW-0059's blocked state. Remediation: ADR 0156 now proposes the contract and does not authorize implementation until ratified.
- MEDIUM F2: ADR 0156's FW-0059 blocker line preserved only broad Formspec/Trellis ratifications, dropping EXT-18 and private-sidecar discipline from the explicit gate. Remediation: the blocker now names ADR ratification, EXT-5 payload, EXT-18 HPKE wrapper availability, EXT-30 recipient registry, Trellis event-type registration, and private-sidecar discipline.
- MEDIUM F3: cleartext `key_bag` recipient handles could leak role-specific safety-team routing. Remediation: ADR 0156 now requires a uniform opaque profile handle whenever role-specific routing would reveal sensitive party information, with role-to-recipient fan-out only after authorized safety-service decrypt; the upstream extension queue's EXT-5, EXT-30, and XS-3 entries now carry the same side-channel guard.

Reviewer re-check returned APPROVE on both the ADR remediation and the extension-queue sync. ADR 0156 remains proposed; this closes the review loop for the recorded XS-3 ADR / queue-alignment slice, not owner ratification or downstream EXT/WOS/Trellis implementation.

Verification run after remediation:

- `git diff --check -- thoughts/adr/0156-coercion-aware-signing-pipeline.md`
- `git diff --check -- thoughts/specs/2026-05-22-upstream-extension-queue.md`

### 2026-05-25 — W1.4 / XS-4 safe-address + XS-5 record-lifecycle ADR review-loop closure

Independent generic reviewer `019e5f68-d3c7-7383-8b91-1bdc912b765b` reviewed ADR 0157 and ADR 0158 for W1.4 and returned REQUEST CHANGES. Specialized `formspec-specs:*` reviewer roles were still not exposed, so this was a generic semi-formal review over the current cross-stack ADRs and cited FW-0049 / FW-0060 and FW-0034 / FW-0038 boundaries.

Finding remediated:

- MEDIUM F1: ADR 0158 preserved EXT-5 and EXT-35 gates but omitted WOS `TerminateInstanceRequest` adapter availability plus deferred FW-0059 / FW-0060 / FW-0061 composition gates from the FW-0038 blocker boundary. Remediation: ADR 0158 now keeps FW-0038 blocked on the ADR, EXT-5, EXT-35, WOS `TerminateInstanceRequest` reference-adapter availability, and the deferred high-risk lifecycle-submit, safe-* reason/value rendering, and per-party lifecycle compositions.

ADR 0157 was approved without changes: it remains proposed and preserves ADR-0074, EXT-1, EXT-31, EXT-32, and Trellis Phase 2+ as gates where applicable. Reviewer re-check returned APPROVE for ADR 0158 with no introduced issue. ADRs 0157/0158 remain proposed; this closes the review loop for the recorded XS-4 / XS-5 ADR slice, not owner ratification or downstream EXT/WOS/Trellis implementation.

Verification run after remediation:

- `git diff --check -- thoughts/adr/0158-record-lifecycle-three-act-mapping.md`

### 2026-05-25 — W1.5-W1.8 formspec sidecar / extension review-loop closure

Independent generic reviewers closed the W1.5-W1.8 formspec-side loop after current-disk remediation. Specialized `formspec-specs:*` reviewer roles were still not exposed, so these were generic semi-formal reviews over the current schema/spec/test artifacts.

Cycle status:

| Row | Reviewer evidence | Closure |
|---|---|---|
| W1.5 / SC-1, SC-2, SC-5 sidecars | Hegel `019e5f86-325c-7632-b61c-437e290256d9` returned APPROVE on the closed deletion-receipt and WYSIWYS sidecar hardening | cycle-closed in `formspec` `e95a8a21` |
| W1.6 / SC-4 identity binding profile | Sagan `019e5f86-8e09-71b3-b491-979f3d307099` returned APPROVE on the closed identity-binding profile hardening | cycle-closed in `formspec` `e95a8a21` |
| W1.7 / SC-6 review-thread sidecar | Beauvoir `019e5f86-8e75-7dd1-be0e-f7dded774e8e` returned REQUEST CHANGES, then APPROVE after re-check | cycle-closed in `formspec` `e95a8a21` |
| W1.8 / EXT ratifications batch | Zeno `019e5f86-8eda-7ff2-881b-ab0ae297f54c` returned REQUEST CHANGES across response metadata path-key edge cases, then APPROVE after re-check | cycle-closed in `formspec` `e95a8a21` |

Findings remediated:

- W1.7: Review Thread examples no longer store live `capabilityUrl` bearer URLs; share records use `capabilityUrlDigest`. The schema is closed to arbitrary `extensions` at the document, share, author, anchor, event, payload, snapshot, policy, draft-ref, and hash-chain levels, preventing bearer URL, privacy, or authority smuggling.
- W1.8: Response metadata path keys now align to Definition item-key syntax. Dot-path segments require `^[a-zA-Z][a-zA-Z0-9_]*$`; JSON Pointer form must start with a Definition item key, with numeric indices or `*` wildcards allowed only after that root item segment. Negative coverage includes label-like, pointer-label-like, leading-underscore, hyphenated, `/0`, and `/*` keys.
- Cross-row sidecar hardening: Deletion Receipt, WYSIWYS Ceremony, and Identity Binding Profile sidecars are closed against extension payloads that would smuggle erased values, preimage forks, raw evidence, unrelated origins, or other authority-changing data.

Deviation / steering note:

- A stale W1.8 review pass read an older disk state during the remediation loop. Current worktree state was treated as authoritative, fresh current-disk reviewers were used, and closure was recorded only after W1.7 and W1.8 returned explicit APPROVE on the final disk state.
- The formspec commit hook required regenerated `docs/spec.html` for the core spec metadata-key text. Full `make docs` attempted to install docs extras into system Python and failed under PEP 668; the HTML-docs hook output was inspected and included because it exactly reflects the source Markdown change.

Verification run after final remediation:

- `.venv/bin/python -m pytest -p no:cacheprovider tests/conformance/schemas/test_review_thread_schema.py tests/conformance/schemas/test_response_schema.py -q` — 132 passed
- `node scripts/generate-spec-artifacts.mjs --check --only=specs/audit/deletion-receipt-spec.md`
- `node scripts/generate-spec-artifacts.mjs --check --only=specs/registry/wysiwys-ceremony-spec.md`
- `node scripts/generate-spec-artifacts.mjs --check --only=specs/identity-binding/identity-binding-profile-spec.md`
- `node scripts/generate-spec-artifacts.mjs --check --only=specs/review-thread/review-thread-spec.md`
- `node scripts/generate-spec-artifacts.mjs --check --only=specs/core/spec.md`
- `npm run test:contract-surfaces`
- `npm run --workspace @formspec-org/types test`
- `npm run --workspace @formspec-org/engine test:unit`
- `git diff --check`

### 2026-05-25 — Conservative W1/W2 cycle ledger

Independent generic scout `019e5eed-d058-7961-ae40-deae8592e266` audited the dispatch table against current committed artifacts. Specialized `formspec-specs:*` scout/reviewer roles were not exposed in this runtime, so the check was a generic read-only scout pass. Disposition rule: implementation, ratification, or remediation commits are **not** enough to check off a row as closed unless the implementer→reviewer→remediator→verifier loop is explicit in the plan or commit evidence.

| Row | Current evidence | Cycle disposition |
|---|---|---|
| W1.1 / ADR-0011 + EXT-5 bot-protection | `formspec-web` `a85ed7a`; `formspec` `92295d48`; review-loop closure recorded above | cycle-closed for the recorded ADR/spec slice; `preparerFiling` remains unavailable-only until FW-0037 build |
| W1.2 / XS-1 multi-party intake ADR | stack root `b8c0814`, `83f33d1`; ADR 0155 remains proposed; review-loop closure recorded above | cycle-closed for the recorded ADR slice; owner ratification and downstream schema/WOS/Trellis work remain open |
| W1.3 / XS-3 coercion-aware signing ADR | stack root `61cd59b`, `86f2f4a`; `formspec-web` `93cea73`; ADR 0156 remains proposed; review-loop closure recorded above | cycle-closed for the recorded ADR / queue-alignment slice; owner ratification and downstream EXT/WOS/Trellis work remain open |
| W1.4 / XS-4 safe-address + XS-5 record-lifecycle ADRs | stack root `1800448`, `c001309`, `522f858`, `e7a4d01`; ADRs 0157/0158 remain proposed; review-loop closure recorded above | cycle-closed for the recorded ADR slice; owner ratification and downstream EXT/WOS/Trellis work remain open |
| W1.5 / SC-1, SC-2, SC-5 sidecars | `formspec` `0533fb9f`, `1dcce96d`, `f11f82be`, `e95a8a21`; review-loop closure recorded above | cycle-closed for the recorded sidecar hardening slice |
| W1.6 / SC-4 identity binding profile | `formspec` `be21eb2b`, `5d34f058`, `e95a8a21`; review-loop closure recorded above | cycle-closed for the recorded identity-binding hardening slice |
| W1.7 / SC-6 review-thread sidecar | `formspec` `7c162c8a`, `e95a8a21`; review-loop closure recorded above | cycle-closed for the recorded review-thread sidecar slice |
| W1.8 / EXT ratifications batch | `formspec` `425d9933`, `042dec3e`, `e95a8a21`; review-loop closure recorded above | cycle-closed for the recorded EXT/response-metadata ratification slice |
| W1.9 / FW-0041 public-terminal hygiene | `formspec-web` `ddff89a`, `8cff5eb`; review-loop closure recorded above | cycle-closed for the recorded build slice |
| W1.10 / FW-0019 server Locale Documents | `formspec-web` `58522ad`, `7d2cc63`; review-loop closure recorded above | cycle-closed for the recorded build slice |
| W1.11 / FW-0028 slice 2 assurance step-up | `formspec-web` `2f85951`, `986af74`; review-loop closure recorded above; EXT-8 remains external | cycle-closed for the recorded build slice |
| W1.12 / FW-0073/0074/0076/0077 file-upload slice 2 | `formspec-web` `4e0a8d3`, `854040d`; review-loop closure recorded above | cycle-closed for the recorded build slice |
| W2.1 / FW-0113 trusted reviewer build | `formspec-web` `5fc4d96`, `751d9a0`; review-loop closure recorded above; FW-0113 row remains open/blocked on upstream ratifications and EXT-37 | cycle-closed for the recorded build slice; product row remains open for upstream/verifier-grade gates |
| W2.2 / FW-0038 record lifecycle build | `formspec-web` `d5f6a9b`, `01bb024`; review-loop closure recorded above; FW-0038 row remains open/gated on upstream ratifications and WOS adapter availability | cycle-closed for the recorded build slice; product row remains open for upstream/verifier-grade gates |
| W2.3 / FW-0060 safe-address build | `formspec-web` `6e02690`, `8e5a163`, `338ebd1`, `b53cbe3`; reviewer findings, remediation details, final clean review, and verification gate list above | cycle-closed for the recorded build slice; product row remains open for upstream/verifier-grade gates |
| W2.4 / FW-0061 multi-party build | `formspec-web` `fb142c4`, `c41a151`, `0700b2e`, `634ac02`, `d38a66a`; reviewer findings, remediation details, final clean review, and verification gate list above | cycle-closed for the recorded build slice; product row remains open for XS-1/upstream ratification |

Closeout consequence: W1.1-W1.12 and W2.1-W2.4 are checked off as cycle-closed in this plan for the recorded slices. Owner ratification, downstream upstream-extension implementation, and explicitly deferred product gates remain outside this dispatch closeout where the row text names them.
