# FW-0034 Honest-correction path on the receipt chain — Research Brief

**Status:** Sketch / research artifact. Not a design proposal. Seeds the design conversation.
**FW row:** [FW-0034 in `PLANNING.md:484`](../../PLANNING.md) (design); paired build row [FW-0038 in `PLANNING.md:522`](../../PLANNING.md).
**Journey:** [J-044 in `JOURNEYS.md:742`](../../JOURNEYS.md) (cooperative correction); composes with [J-016 in `JOURNEYS.md:392`](../../JOURNEYS.md) (adversarial withdraw/dispute).
**Anti-patterns:** [AP-013 in `JOURNEYS.md:125`](../../JOURNEYS.md).
**Feature key:** `recordLifecycle` — already enumerated in [web ADR-0011 §Instance capabilities line 41 + Feature Ownership Table line 140](../adr/0011-runtime-feature-resolution-and-policy-gates.md) ("Ledger events for correction, withdrawal, dispute, and revocation"). FW-0034 codifies the shape.

The headline finding: **the substrate is mature; the consumer-side discipline is not yet specified.** Formspec respondent-ledger-spec §11.4 already specifies `response.correction-recorded` with strict additive semantics (corrected field subset, original-vs-corrected values preserved, neutral authorization reference). WOS Kernel §13.9 already specifies a closed 5-mode amendment taxonomy (`correction | amendment | supersession | rescission | reinstatement`). Trellis Core §10.1 already specifies linear `prev_hash` chaining; ADR 0066 already specifies cross-chain `trellis.supersedes-chain-id.v1` linkage and `correctionAuthorized` / `responseCorrection` correction-preservation reporting. **FW-0034's design work is not inventing lifecycle events — it is mapping the user-visible noun set (`correct` / `withdraw` / `dispute`) onto the upstream taxonomy, defining the runtime UX, and naming the receipt-chain visualization discipline that survives FW-0049 safe-* composition and FW-0050 multi-party composition.**

The hardest finding: **the user-visible vocabulary (cooperative correction vs. adversarial dispute vs. consent withdrawal) collapses three orthogonal upstream taxonomies into one respondent-facing decision.** Per J-044: cooperative correction is "I answered honestly, was wrong about the fact, here's the right fact." Per J-016: adversarial withdrawal is consent revocation; dispute is signer-side counter-attestation. Per AP-013: the surface MUST distinguish the three so the respondent isn't trapped in the wrong path. The upstream taxonomies are: Formspec response-level lifecycle (`amendment-opened` / `amended` / `correction-recorded` / `stopped`); WOS kernel-level governance lifecycle (the 5-mode taxonomy); Trellis substrate-level event chain (linear `prev_hash` + cross-chain supersession). FW-0034 design is the consumer-side seam that picks the right upstream layer per user act.

---

## 1. Upstream Primitive Inventory

### 1.1 Formspec respondent-ledger — `response.correction-recorded` already specified; `response.withdrawn` queued

| Primitive | File:line | FW-0034 relevance |
|---|---|---|
| `response.correction-recorded` event type | [`formspec/specs/audit/respondent-ledger-spec.md:689`](../../../formspec/specs/audit/respondent-ledger-spec.md) (§8.2 optional events) + [§11.4 line 858](../../../formspec/specs/audit/respondent-ledger-spec.md) | **The canonical cooperative-correction primitive.** Per §11.4: additive, MUST NOT rewrite/delete/reinterpret prior event, MUST carry `correctionTargetEventHash` + `correctedFieldSet` (RFC 6901 pointers) + `fieldValues[]` (original + corrected) + `reason` (respondent-visible) + `authorizationRef` (neutral). The corrected field set is a **declared subset, not open-ended amendment** — if a proposed change affects determination content or fields outside the subset, it is amendment/supersession under the stack amendment contract, not `ResponseCorrection`. J-044 maps directly. |
| `response.amendment-opened` / `response.amended` event types | [`formspec/specs/audit/respondent-ledger-spec.md:677`](../../../formspec/specs/audit/respondent-ledger-spec.md) (§8.3 amendment lifecycle) + [§11.1 line 832](../../../formspec/specs/audit/respondent-ledger-spec.md) | **The amendment-cycle primitive for substantive change beyond the narrow subset.** When the user's change exceeds the `correctionTargetEventHash` field subset, FW-0034 must route to amendment, not correction. Per §11.1: opening produces `response.amendment-opened`; subsequent events carry `amendmentRef`; durable completion produces `response.amended`. WOS Kernel §13.9 binds the same primitive at the governance layer: amendment flows MUST create a new task; `supersedesResponseId` references the prior. |
| `response.stopped` event type | [`formspec/specs/audit/respondent-ledger-spec.md:679`](../../../formspec/specs/audit/respondent-ledger-spec.md) (§8.3) | Draft-stage abandonment. **Not the withdrawal primitive** (which is post-submit) — pre-submit "stopped" is `Response.status = stopped`, not `withdrawn`. |
| EXT-5 (queued) — `response.withdrawn`, `response.dispute-attached`, `consent.revoked` | [`thoughts/specs/2026-05-22-upstream-extension-queue.md:66`](../specs/2026-05-22-upstream-extension-queue.md) | **The adversarial-path event types are not yet added to §8.2.** EXT-5 closes J-016 (the J-044 sibling journey). The combined PR adds all three at once. FW-0034 must reference EXT-5 as the formspec-side dependency for the withdraw/dispute paths. |
| `accessClass` inheritance on `ChangeSetEntry` | [`formspec/specs/audit/respondent-ledger-spec.md:524 + 613`](../../../formspec/specs/audit/respondent-ledger-spec.md) | When a corrected field carries `accessControl.class: "safe-*"` (FW-0049), the correction event's field-values MUST inherit the class. **Composition seam with FW-0049** — the correction's `reason` field text MAY contain protected information; the correction's `originalValue` / `correctedValue` are field-values that carry their own class. |

**Takeaway:** Formspec respondent-ledger has the cooperative-correction primitive fully specified and the amendment-cycle primitive fully specified. The adversarial path (`withdrawn`, `dispute-attached`, `consent.revoked`) is queued at EXT-5. FW-0034 maps the consumer-side noun set onto these primitives.

### 1.2 WOS Kernel — 5-mode amendment taxonomy + applicant-withdrawn termination

| Primitive | File:line | FW-0034 relevance |
|---|---|---|
| `governance.amendmentTaxonomy` — 5-mode closed taxonomy | [`work-spec/specs/kernel/spec.md:2168`](../../../work-spec/specs/kernel/spec.md) (§13.9) | **The governance-layer taxonomy that respondent-side lifecycle MUST align with.** Closed literals: `correction` (factual correction alongside preserved determination), `amendment` (substantive change to determination, same chain), `supersession` (replacement by new case/chain), `rescission` (withdrawal of determination to non-operative state, same chain), `reinstatement` (re-activation after rescission). **No vendor extensions.** Workflow-author declares which modes the workflow permits via `governance.amendmentTaxonomy[]`. |
| Amendment flow rule — new task, never reopen | [`work-spec/specs/kernel/spec.md:2180`](../../../work-spec/specs/kernel/spec.md) | "After a Formspec task completes, amendment flows MUST create a new task. A processor MUST NOT reopen a terminal completed task. The amended task or Response SHOULD reference the original through Respondent Ledger `amendmentRef` and WOS provenance fields such as `supersedesResponseId` or `relatedTaskId`." **FW-0034's `correct`/`amend` user act surfaces a "start a new correction/amendment task" affordance, not an "edit-the-existing-submission" affordance.** Architecturally aligned with the WOS amendment rule. |
| `TerminateInstanceRequest` with `terminationKind = "applicant-withdrawn"` | [`work-spec/specs/api/instance.md:131`](../../../work-spec/specs/api/instance.md) | **The applicant-side withdrawal primitive at the WOS governance layer.** Closed-with-vendor-extension reserved literals include `applicant-withdrawn`. Submits to a `completed` or already-`terminated` instance are rejected with `WOS-1409`. Fires an `instanceTerminated` Facts-tier record. **The respondent-side `withdraw` user act resolves to a `terminate` call (when WOS is the governance layer) carrying `terminationKind: "applicant-withdrawn"`, plus a Respondent Ledger `response.withdrawn` event (EXT-5).** |
| Appeal lifecycle `withdrawn` status | [`work-spec/specs/api/appeal.md:22`](../../../work-spec/specs/api/appeal.md) | Distinct from instance-level applicant-withdrawal. An appeal can be withdrawn by the appellant before disposition. **Not the FW-0034 primitive** (appeals are a separate post-determination flow); noted for vocabulary discipline so the design doesn't conflate. |

**Takeaway:** WOS has the governance taxonomy fully specified. The mapping FW-0034 must establish is: respondent's "correct" → WOS `correction` (additive, narrow field subset); respondent's "amend" → WOS `amendment` (substantive, same chain); respondent's "withdraw" → WOS `applicant-withdrawn` termination + WOS `rescission` (if determination already exists); respondent's "dispute" → distinct event class (counter-attestation, not lifecycle state change) — most cleanly mapped to EXT-5's `response.dispute-attached` with WOS governance retaining the original record.

### 1.3 Trellis — Phase 1 chaining ready; correction-preservation reporting ready

| Primitive | File:line | FW-0034 relevance |
|---|---|---|
| Phase 1 linear chain construction | [`trellis/specs/trellis-core.md:894`](../../../trellis/specs/trellis-core.md) (§10.1) | **The receipt-chain mechanism FW-0034 surfaces.** Every event carries `prev_hash`; verifier recomputes each event's `canonical_event_hash` and checks it appears as `prev_hash` in the next. The correction event lives on the same response-ledger chain as the original submission event. **No Phase 2 substrate required** for the basic correction chain — the chain itself is Phase 1. |
| `trellis.supersedes-chain-id.v1` cross-chain extension | [`trellis/specs/trellis-core.md:337`](../../../trellis/specs/trellis-core.md) (§6.7 extensions table) + ADR 0066 | **The cross-chain supersession linkage primitive.** Payload shape `SupersedesChainIdPayload` carries `chain_id` + `checkpoint_hash` for the superseded chain. Used when WOS Kernel §13.9 `supersession` mode produces a new case/chain replacing the prior. **FW-0034's `correct` and `amend` paths stay within the same response-ledger chain (no `supersedes-chain-id` extension); the `withdraw + resubmit` path may produce a new chain superseding the old (`supersedes-chain-id` populated by the new chain's first event).** |
| Correction-preservation report | [`trellis/specs/trellis-core.md:1820`](../../../trellis/specs/trellis-core.md) (verifier §19) + §27.4 reports schema | **The verifier-side artifact that surfaces a correction lineage honestly without granting the verifier mutation authority.** Per the verifier obligations: when a readable payload is an ADR 0066 correction record (`correctionAuthorized` or `responseCorrection`), the verifier produces a `CorrectionPreservationOutcome` row in the verification report carrying `correction_event_hash`. The verifier does NOT itself reinterpret the prior event; it surfaces the correction-lineage as report evidence. **FW-0034's verifier-visualization discipline rides on this primitive — the verifier already knows how to show "this record was corrected by event X"; FW-0034 specifies the user-facing render of that fact.** |
| Respondent History Sidecar amendment-cycle discipline | [`trellis/specs/trellis-operational-companion.md:1035`](../../../trellis/specs/trellis-operational-companion.md) (§23.6) + OC-94 line 998 | **The sidecar discipline for the amendment lifecycle.** Per OC-94 + §23.6: sidecar MUST distinguish amendment initiation / in-progress / submission / completion; MUST define baseline (canonical submission vs. respondent-visible version); MUST distinguish **additive / corrective / superseding / partial** amendment shapes; MUST define whether abandoned amendments remain visible. **FW-0034's status-surface visualization (FW-0039 composition) consumes the sidecar's amendment-cycle distinction so the respondent sees the right state copy.** |

**Takeaway:** Trellis substrate is fully ready for the cooperative-correction path on Phase 1. The receipt chain (`prev_hash`) carries the correction event; the verifier-side correction-preservation report surfaces the lineage; the sidecar's amendment-cycle discipline distinguishes the four amendment shapes. The cross-chain supersession primitive exists for the `withdraw + resubmit-as-new-case` path. **Phase 2+ is NOT a hard dependency for FW-0034's basic correction path** (unlike FW-0049's verifier-grade safe-address tier).

### 1.4 PKAF — `LifecycleEvent` + `supersedesAssertion` for downstream assertion lifecycle

| Primitive | File:line | FW-0034 relevance |
|---|---|---|
| `rkaf:LifecycleEvent` + `rkaf:supersedesAssertion` + `rkaf:lifecycleEvent` closed enum | [`PKAF/spec/rkaf-core.md:56 + 224`](../../../PKAF/spec/rkaf-core.md) | **The downstream-consumer lifecycle vocabulary.** When a PKAF assertion (`rkaf:Assertion`) is anchored to a Formspec submission and the submission is corrected, amended, or superseded, the assertion's lifecycle MUST track the underlying record's lifecycle via `rkaf:supersedesAssertion` + `rkaf:lifecycleEvent`. **Composition: FW-0034 declares the upstream lifecycle events; PKAF's `lifecycleEvent` carries downstream propagation.** |
| `rkaf:RevalidationEvent` + amendment / rescission / supersession / material-revision packets | [`PKAF/spec/rkaf-core.md:224`](../../../PKAF/spec/rkaf-core.md) | **The packet shape for the downstream re-validation cycle.** A determination citing a corrected record may need re-validation when the correction lands. **Out of FW-0034 scope; downstream consumer concern.** Noted for vocabulary discipline. |

**Takeaway:** PKAF is the downstream consumer vocabulary; FW-0034 design names the seam, doesn't bind it. Follow-on Rulespec alignment row.

### 1.5 web ADR-0011 capability table — `recordLifecycle` already enumerated

Per [web ADR-0011 Instance capabilities line 41](../adr/0011-runtime-feature-resolution-and-policy-gates.md) + [Feature Ownership Table line 140](../adr/0011-runtime-feature-resolution-and-policy-gates.md):

| Layer | What ADR-0011 names for `recordLifecycle` |
|---|---|
| Instance capability | "Ledger events for correction, withdrawal, dispute, and revocation" — concretely, the Respondent Ledger event-stream port + Trellis substrate for the receipt chain + WOS governance for the determination-side amendment/rescission flow |
| Org policy | "windows and allowed actions" — per-jurisdiction amendment windows (e.g., 30 days post-issuance), per-form lifecycle-action allowlist, per-form requires-evidence policy |
| Form policy | "lifecycle actions allowed" — `governance.amendmentTaxonomy[]` on the workflow side + per-action time-window declaration |

**Conclusion:** FW-0034 design instantiates an already-named capability key (`recordLifecycle`). The shape work is: (1) define the three respondent-facing user acts (`correct` / `withdraw` / `dispute`) and their upstream mapping; (2) specify the runtime UX (status-surface composition with FW-0039 vs. dedicated `/lifecycle` route); (3) specify the receipt-chain visualization discipline; (4) compose with FW-0048 (coercion-at-correction-time), FW-0049 (safe-* in correction reason/values), FW-0050 (per-party correction semantics), FW-0029 (cross-agency referral notification).

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0034 |
|---|---|---|
| **FW-0038** (Amend, withdraw, dispute on signed records — sibling build row) | [`PLANNING.md:522`](../../PLANNING.md) | **THE build row.** FW-0034 is the design layer; FW-0038 is the build. The two ship as a design-then-build pair. FW-0038's `Blocked on:` currently names EXT-5; the FW-0034 design adds the consumer-side shape FW-0038 builds against. |
| **FW-0039** (Post-submit status surface — slice 1 live) | [`PLANNING.md:531 + 784`](../../PLANNING.md) | **Composition seam.** Correction / withdrawal / dispute events should appear in the FW-0039 status timeline alongside `case-created` / `lifecycle-changed` / `decision-reached`. The WOS applicant API `ApplicantStatusTimelineEntry.event` reserved literals at [`work-spec/specs/api/applicant.md:74`](../../../work-spec/specs/api/applicant.md) already include `lifecycle-changed`; correction-recorded / withdrawal / dispute can ride on `lifecycle-changed` with a more-specific stage label. FW-0034 design specifies the consumer-side timeline integration. |
| **FW-0009** (Signed receipt the respondent owns) | [`PLANNING.md:324`](../../PLANNING.md) | **Composition seam.** A corrected/withdrawn/disputed record's receipt MUST reflect the lifecycle state. The respondent's kept receipt MUST be invalidated or annotated when superseded by a correction. Specifically: the original receipt remains valid AS OF its production time (immutability); a NEW receipt is issued for the correction event; a verifier reading either receipt sees the correction-preservation report linking them. |
| **FW-0048** (Coercion-aware signing — design 2026-05-23) | [`PLANNING.md:611`](../../PLANNING.md) + [`thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md`](../specs/2026-05-23-fw-0048-coercion-aware-signing-design.md) | **Composition seam.** Coercion at correction time: a coercer may force a respondent to "correct" a record to the coercer's benefit. The FW-0048 duress affordance MUST work at correction time too — the correction UI exposes the dual-credential mechanism on the same high-risk template set. **FW-0034 design §threat-model addresses this; FW-0038 build threads the FW-0048 dual-credential mechanism through the correction affordance.** |
| **FW-0049** (Safe-address handling — design 2026-05-23) | [`PLANNING.md:623`](../../PLANNING.md) + [`thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md`](../specs/2026-05-23-fw-0049-safe-address-handling-design.md) | **Composition seam.** A corrected field may carry `accessControl.class: "safe-*"`; the correction's `originalValue` / `correctedValue` / `reason` must inherit the class discipline. The correction `reason` text MAY itself need protection (e.g., "I was hiding from my abuser before, here's my real address" — the reason is itself disclosing). FW-0034 design specifies the per-field-class inheritance + reason-field class declaration. |
| **FW-0050** (Multi-party submission — design 2026-05-23) | [`PLANNING.md:635`](../../PLANNING.md) + [`thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md`](../specs/2026-05-23-fw-0050-multi-party-submission-design.md) | **Composition seam.** In multi-party flows, can ONE party correct without the others? Lean: **per-party correction is a per-party event scoped to per-party fields**; corrections affecting shared fields require either all parties' co-signature OR re-submission of the affected portion. The FW-0050 `parties[*]` per-party visibility carries the per-party correction scope. |
| **FW-0029** (Cross-agency referral warning) | [`PLANNING.md:443`](../../PLANNING.md) | **Composition seam.** When a submission has been referred to another agency, correcting the submission MAY require notifying the downstream agency. FW-0029 already exists for the pre-submit warning; the post-submit correction case is parallel. FW-0034 design names the seam; the actual notification mechanism is WOS governance + cross-agency referral substrate (downstream of formspec-web). |
| **FW-0054** (long-life receipt access) | [`PLANNING.md`] | **Adjacent.** A long-life receipt for a corrected submission must surface the correction lineage when fetched. FW-0034 design's verifier-visualization discipline composes with FW-0054's receipt-portal surface. |
| **FW-0043** (Abandon-and-erase with deletion receipt) | [`PLANNING.md`] | **Distinct, but adjacent.** Deletion is destructive (erasure-receipt); withdrawal is non-destructive (the original remains in the chain as withdrawn). Vocabulary discipline: `delete` / `erase` ≠ `withdraw`. FW-0043 owns deletion; FW-0034 owns withdrawal. |
| **FW-0037** (Filer-not-signer mode) | [`PLANNING.md:512`](../../PLANNING.md) | **Adjacent.** When a filer-not-signer files on behalf of someone, who can issue a correction? Lean: the filer can issue corrections within the same authority window the filing rested on; the signer (subject) can withdraw consent at any time. Composition surface; not load-bearing for slice 1. |

---

## 3. Threat Model Seeds

Adapted from FW-0044 + FW-0049 + FW-0048 templates. The load-bearing classes:

### 3.1 Distinguishing the three user acts

**Risk.** The respondent confuses cooperative correction with consent withdrawal or dispute, files the wrong primitive, suffers a worse outcome than they intended. Per AP-013 + J-044: ambiguity between "I made a typo" and "I withdraw my consent" leaves the respondent unable to act.

**Examples of the confusion.**
- Respondent thinks they're "fixing a typo" but the affordance produces a `response.withdrawn` event terminating the case (per WOS `applicant-withdrawn` rule, `WOS-1409` rejects further submits) — they wanted `response.correction-recorded`.
- Respondent thinks they're "withdrawing" but the affordance produces a `response.dispute-attached` event leaving the original record adversarially flagged — they wanted termination.
- Respondent thinks they're "disputing" but the system produces a substantive `amendment-opened` cycle reopening the record for editing — they wanted to attach a counter-statement without editing.

**Posture for FW-0034 design.** The surface MUST surface three distinct primitives with plain-language labels: **"Correct a fact"** (cooperative, narrow field subset, original preserved), **"Withdraw this submission"** (termination — case ends), **"Add a dispute note"** (signer-side counter-attestation — original preserved, dispute flagged). The vocabulary firewall keeps spec-level taxonomy (`response.correction-recorded` / `applicant-withdrawn` / `dispute-attached`) behind the developer view.

### 3.2 Preventing weaponized "correction" — additive discipline

**Risk.** A respondent uses the correction primitive to silently rewrite history — claiming "I corrected my income answer" when the real intent is to change a determination outcome retroactively.

**Defense.** The `response.correction-recorded` event type per Formspec §11.4 already specifies the additive discipline: the corrected fields are a declared subset, original values preserved alongside corrected values, the prior event is not rewritten/deleted/reinterpreted, the verifier produces a correction-preservation report. **The substrate prevents silent rewrites by construction** — the FW-0034 design must surface this honestly: the corrected record is visible alongside the correction; verifiers see both. No "this was always the answer" affordance.

**Form-policy gate.** A form whose correction-tolerance is narrower (e.g., "no corrections allowed after determination issuance") declares `correctionWindow: { closesAt: "determination" }` or similar. The substrate is permissive (additive corrections are always recordable); the form policy restricts when the correction affordance is shown.

### 3.3 Coercion at correction time (composes with FW-0048)

**Risk.** A coercer forces the respondent to file a "correction" that benefits the coercer (e.g., correcting "I am NOT applying on behalf of this person" to "I AM applying on behalf of this person"). The correction is itself signed by the respondent under duress.

**Defense.** The FW-0048 dual-credential duress affordance MUST be available at correction time on the same high-risk template set. The correction-submit ceremony exposes the dual-credential mechanism; the `submission.duress-signaled` event fires on the correction submission. **Composition is mechanical, not novel** — same substrate, same mechanism, applied to the correction submit instead of the original submit.

### 3.4 Safe-* fields in correction (composes with FW-0049)

**Risk.** A correction's `reason` text or `correctedValue` contains protected information (e.g., correcting "address: 123 Main St" to "address: [California ACP substitute]"). If the correction event is visible to a wider audience than the original field, the protection leaks.

**Defense.** The correction event MUST inherit the field's `accessControl.class` per ADR-0074. The `reason` text field carries its own class declaration (form-author's responsibility — the field-level `accessControl.class` discipline applies to the reason field). The correction-event payload is bucketed per the per-class audience policy.

### 3.5 Per-party correction in multi-party (composes with FW-0050)

**Risk.** In a joint custody filing, Parent A corrects their address; the correction MUST NOT silently reveal Parent A's new address to Parent B if it was protected.

**Defense.** Per-party correction is per-party-scoped; the correction event's `partyRef` declares which party authored the correction; the FW-0050 `visibleTo[]` policy on the corrected field still applies. **Composition falls out of the substrate** — no new rule needed beyond carrying `partyRef` on the correction event (proposed EXT-5 extension).

### 3.6 Out-of-scope adversarial classes

Named explicitly so the design isn't read as covering them:

- **Adversarial respondent gaming the correction primitive to fraud the system.** A respondent files a correction every few hours with slightly different values trying to find the one that triggers a favorable determination. **Mitigation is governance-layer rate-limiting + audit-trail surfacing to the caseworker** (WOS governance concern, not formspec-web). FW-0034 design names but doesn't mitigate.
- **The "honest correction is always honest" assumption.** The substrate cannot distinguish honest from dishonest correction; the design rests on the surface being honest-by-default-affordance, the verifier showing the correction lineage, and the issuer's governance retaining adjudication authority. FW-0034 design does NOT make the correction binding on the issuer — they may accept, partially accept, or reject the correction per their governance policy.
- **Cross-jurisdiction correction with conflicting amendment-window rules.** A federal form whose state-side downstream consumer has a different amendment window. **Per-jurisdiction governance concern; out of FW-0034 reach.**

---

## 4. External Prior Art

### 4.1 IRS Form 1040X — amendment as a separate filing, links to original by tax-year + SSN

The IRS amendment process for Form 1040 is the canonical example of additive correction in a high-stakes system. Form 1040X is filed AFTER the original 1040; it shows the original amount, the correction, and the difference (`Column A | Column B | Column C` shape). The original 1040 remains in the IRS's record; the 1040X is appended. The taxpayer keeps both.

**Reference.** IRS Form 1040-X: <https://www.irs.gov/forms-pubs/about-form-1040-x>. Filing timeline: generally must be filed within 3 years of the original return's due date (the amendment window). Multiple 1040X filings against the same year are permitted.

**Relevance to FW-0034.** The Form 1040X model is exactly the additive-correction-with-original-preserved pattern Formspec §11.4 specifies. The amendment window (3 years for 1040X) is the per-form-policy time-window FW-0034 codifies. The cooperative-amendment vocabulary (the IRS treats 1040X as routine, not as suspicion-triggering) maps to J-044's "without being treated as fraud" framing.

### 4.2 SEC 10-K/A — amendment to a prior filing, separately submitted, links back

SEC public-company filings handle amendments via the `/A` suffix: a 10-K becomes 10-K/A when amended. The amendment is a separate EDGAR filing that explicitly references the prior accession number; the prior filing remains visible in EDGAR; the amendment supersedes specific portions or the entire filing per the amendment's scope.

**Reference.** SEC EDGAR amendment filing convention: <https://www.sec.gov/edgar/about>. The amendment classes include `10-K/A` (Annual report amendment), `10-Q/A` (Quarterly), `8-K/A` (Current report), `DEF 14A/A` (Proxy). Each maintains a chain back to the original via the accession-number reference.

**Relevance to FW-0034.** The SEC model demonstrates the "amendment as separate filing, original preserved, lineage visible" pattern at scale across regulated filings. The WOS Kernel §13.9 `amendment` mode maps directly. The `/A` suffix convention is a UI-surface concern that FW-0034's status-surface composition (with FW-0039) might consider for verifier-visualization.

### 4.3 DocuSign post-signing amendment patterns

DocuSign handles post-signature corrections via the "Correct" action available to envelope senders. The original signed envelope remains in the audit trail; a correction triggers a new envelope or a modification flow depending on the change type. Crucially, DocuSign distinguishes between (a) pre-completion correction (envelope still in flight; sender can modify and re-route), (b) post-completion void (envelope is voided, no longer effective, but remains in record), and (c) post-completion supplement (a NEW envelope is added to the same set, referencing the original).

**Reference.** DocuSign "Correct" documentation: <https://support.docusign.com/s/document-item?bundleId=ulp1643236876813&topicId=tsk1643236831479.html>. DocuSign "Void" documentation: <https://support.docusign.com/s/document-item?bundleId=ulp1643236876813&topicId=krl1643236879440.html>.

**Relevance to FW-0034.** The DocuSign model demonstrates that "correct after signing" is a UX-distinguishable affordance from "void after signing" — exactly the J-044 vs. J-016 distinction. The completed-envelope-is-immutable rule (corrections produce new envelopes) maps to the WOS Kernel §13.9 amendment-creates-new-task rule. **Strongest commercial precedent for the FW-0034 design discipline.**

### 4.4 Birth certificate / vital records — superseding documents with notarized chain

Vital-records corrections (birth certificate, death certificate, marriage license) operate via jurisdiction-specific superseding documents. The original certificate is not destroyed; a new certificate is issued; the chain is documented in the registry's metadata. State law varies on whether the original remains publicly accessible or is sealed (e.g., California Health & Safety Code §103425 governs amendments to vital records).

**Reference.** CDC NCHS guidance on vital-records amendments: <https://www.cdc.gov/nchs/nvss/vsrr.htm>. California Department of Public Health amendment process: <https://www.cdph.ca.gov/Programs/CHSI/Pages/Birth-Adoption-Amendment-Process.aspx>.

**Relevance to FW-0034.** Vital-records demonstrate the "superseding-document-with-notarized-chain" pattern in the highest-stakes civil context. The jurisdiction-specific variation (some states seal the original, some leave it visible) maps to the per-form / per-org policy axis in ADR-0011: the form/org declares which amendment-visibility posture applies. The notarization requirement maps to the FW-0034 design's `authorizationRef` discipline per Formspec §11.4 (the correction carries a neutral reference to the authorizing act).

### 4.5 Academic transcript errata + replacement

Universities handle transcript corrections via a hybrid model: minor corrections (typos in name, course number) issue a corrected transcript that supersedes the prior; substantive corrections (grade changes after grade-appeal) issue an erratum noting the change without destroying the original transcript's record. The pattern varies by institution; AACRAO publishes guidance.

**Reference.** AACRAO Standards for Maintenance of Records: <https://www.aacrao.org/resources/standards-and-guidelines>.

**Relevance to FW-0034.** Lower-stakes than vital records or SEC filings; demonstrates that even in low-coordination contexts the additive-correction-with-original-preserved pattern is the norm. Not a load-bearing precedent for FW-0034 but useful for showing the pattern's ubiquity.

---

## 5. Open Framing Questions (seeds for the design doc)

| Q | What's at stake |
|---|---|
| **Q1: Three-act taxonomy or unified "lifecycle action" affordance?** | Lean: **three distinct user-visible primitives** (`correct` / `withdraw` / `dispute`) with plain-language labels per AP-013. The single "lifecycle action" surface would conflate the three and trap respondents in the wrong path. Alternative: a single "Manage this submission" entry-point with a three-way choice (decision tree). Design doc decides between (a) three separate top-level affordances and (b) one entry-point with the three-way choice. |
| **Q2: Per-act time-window declaration shape?** | Lean: per-form `correctionWindow` / `withdrawalWindow` / `disputeWindow` declarations under `governance.amendmentTaxonomy`. The window can be expressed as relative-to-issuance (e.g., 30 days post-issuance) or relative-to-event (e.g., until determination). Closed token set with deployment-extensible policy. Alternative: free-form FEL expression. **Lean closed enum** — the few canonical windows cover 95% of cases; novel windows are per-deployment policy. |
| **Q3: Dedicated `/lifecycle` route or extend `/status` (FW-0039)?** | Lean: **extend `/status` (FW-0039)**. The respondent already arrives at `/status` to see "where is my submission" — adding the lifecycle actions to the same surface is composition; a new route would fragment the discovery path. Alternative: dedicated `/lifecycle?case={urn}` route for the action surface, `/status` for the read-only timeline. **Q3 is partially-aligned-with-Q1**: if Q1 lands on three top-level affordances, three buttons fit on `/status`; if Q1 lands on one entry-point with three-way choice, the entry-point fits naturally on `/status`. |
| **Q4: Receipt-chain visualization discipline — verifier surface?** | Lean: the verifier-public-output renders the correction lineage as a timeline: "Original submission [timestamp] → Correction [timestamp, fields changed: {list}] → Correction [timestamp]". Renders **reason text honestly when class permits; renders "reason withheld" when class restricts**. Composition with FW-0049 §3.3 mask discipline (safe-* in reason text). The verifier MUST NOT distinguish corrected-record receipts from uncorrected-record receipts at the structural level only if the form requires that posture (high-stakes correction-frequency forms might require posture-uniformity per FW-0049 model); routine corrections render as visible chain entries. |
| **Q5: `recordLifecycle` capability tier axes?** | Lean: per-act tier axis — `correctionTier: "supported" | "unsupported"` × `withdrawalTier: "supported" | "unsupported"` × `disputeTier: "supported" | "unsupported"`. The substrate is uniform (Phase 1 chaining); deployment composition is what varies (some deployments don't ship WOS governance; some don't ship the dispute primitive). Alternative: single `recordLifecycle: "v1" | "unsupported"` flag. **Lean per-act tier** — adopters will ship them at different times; single flag forces all-or-nothing. |

---

## 6. Headline Posture

FW-0034 is a **substrate-mature, composition-heavy design row**. The upstream primitives (Formspec respondent-ledger §11.4 + WOS Kernel §13.9 + Trellis Core §10.1 + ADR 0066 correction-preservation reporting) are fully specified and Phase 1-ready. The design work is consumer-side discipline: the three-act user-visible taxonomy, the runtime UX composition with FW-0039, the receipt-chain visualization discipline, and the composition contracts with FW-0048 / FW-0049 / FW-0050 / FW-0029.

The cross-stack dependency surface is **lighter than FW-0049 (no Phase 2+ substrate hard-dependency)** but **heavier than FW-0048 (multiple upstream taxonomies to align: Formspec respondent-ledger, WOS Kernel §13.9, Trellis ADR 0066)**. The new EXT-* row count is **low (likely 1 new — a form-policy `lifecycleActions` declaration; EXT-5's withdraw/dispute events already cover the event types)**.

The most load-bearing design decision is **Q1 — the user-visible taxonomy** — because it shapes every downstream UX and substrate-mapping choice. The design doc must land Q1 first and let Q2–Q5 follow.
