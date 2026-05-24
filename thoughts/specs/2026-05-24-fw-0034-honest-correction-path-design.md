# FW-0034 — Honest-correction path on the receipt chain: design proposal

**Date:** 2026-05-24
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q5 are open until accepted.
**Row:** [FW-0034 in `PLANNING.md:484`](../../PLANNING.md) (design); paired build row [FW-0038 in `PLANNING.md:522`](../../PLANNING.md).
**Journey:** [J-044 in `JOURNEYS.md:742`](../../JOURNEYS.md) (cooperative correction); composes with [J-016 in `JOURNEYS.md:392`](../../JOURNEYS.md) (adversarial withdraw/dispute).
**Anti-patterns:** [AP-013 in `JOURNEYS.md:125`](../../JOURNEYS.md).
**Feature key (already enumerated):** `recordLifecycle` per [web ADR-0011 §Instance capabilities line 41 + Feature Ownership Table line 140](../adr/0011-runtime-feature-resolution-and-policy-gates.md). FW-0034 codifies the shape.
**Source brief:** [`thoughts/sketches/2026-05-24-fw-0034-honest-correction-research-brief.md`](../sketches/2026-05-24-fw-0034-honest-correction-research-brief.md). Upstream-primitive inventory, threat scenarios, FW interactions, and external prior art live there; this doc decides over them.
**Build row pointer:** [FW-0038 in `PLANNING.md:522`](../../PLANNING.md) consumes this design.
**Coercion-adjacent hook:** [FW-0048 design §3 + §5.1](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion at correction time composes mechanically; no new substrate work required (§7.2 below).
**Safe-address-adjacent hook:** [FW-0049 design §3.3 + §7.2](2026-05-23-fw-0049-safe-address-handling-design.md) — safe-* class inheritance on correction event payloads (§7.3 below).
**Multi-party-adjacent hook:** [FW-0050 design §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) — per-party correction scoping (§7.4 below).

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for honest post-submit lifecycle actions on the receipt chain, distinguishing **cooperative correction** (J-044 — typo, wrong fact, here's the right fact with evidence), **applicant withdrawal** (J-016 cooperative slice — "I changed my mind, end this submission"), and **signer dispute** (J-016 adversarial slice — "I attest a counter-statement to a record I signed; the record remains in the chain"). Deliverables: framing decisions (Q1–Q5), the `recordLifecycle` capability contract under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md), the three-act user-visible taxonomy, the upstream-primitive mapping for each act, the runtime UX composition with FW-0039, the receipt-chain visualization discipline, the failure semantics, the composition with FW-0048 / FW-0049 / FW-0050 / FW-0029, and the cross-stack dependency chain. This is a **design row**; the build is [FW-0038 in `PLANNING.md:522`](../../PLANNING.md).

**Substrate-status disclaimer.** FW-0034 design rests on Phase 1 Trellis substrate that is already specified ([Trellis Core §10.1 linear chain](../../../trellis/specs/trellis-core.md); [ADR 0066 cross-chain supersession + correction-preservation reporting](../../../trellis/specs/trellis-core.md)) plus Formspec [respondent-ledger-spec §11.4 `response.correction-recorded`](../../../formspec/specs/audit/respondent-ledger-spec.md) (specified) plus WOS [Kernel §13.9 amendment taxonomy](../../../work-spec/specs/kernel/spec.md) (specified, closed 5-mode). The withdraw/dispute event types are queued at [EXT-5](2026-05-22-upstream-extension-queue.md) (not yet filed upstream). **No Phase 2+ Trellis substrate is a hard dependency for the basic correction chain** — unlike FW-0049's verifier-grade tier.

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. FW-0038 owns build.
- **Authoring the upstream spec.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web consumes upstream primitives, does not invent them. This doc proposes EXT-5 payload extensions (per-party correction scoping) + a new EXT-35 form-policy `lifecycleActions` declaration shape; does not author the upstream schema changes themselves.
- **WOS governance acceptance/rejection of corrections.** A correction submitted by the respondent is recordable by construction (Formspec §11.4 substrate); whether the issuer ACCEPTS the corrected fact for determination purposes is a WOS governance concern. FW-0034 design owns the respondent's authoring affordance + receipt-chain discipline; WOS owns the issuer-side acceptance flow.
- **Per-jurisdiction amendment-window rules.** 30 days for some federal forms, 3 years for IRS 1040X, "until determination" for many benefits, "no window" for sealed civil filings. **Deployment concern.** The design specifies the *mechanism* (`correctionWindow` / `withdrawalWindow` / `disputeWindow` form-policy declarations); the per-jurisdiction policy lands per deployment.
- **Cross-agency referral notification on correction.** Touched by FW-0029 (pre-submit warning). The post-submit correction case is parallel; the notification mechanism lives in WOS governance + cross-agency referral substrate, not formspec-web. §7.5 names the seam.
- **Deletion / erasure of submissions.** Distinct from withdrawal. **FW-0043's scope, not FW-0034's.** Vocabulary discipline: `delete` / `erase` ≠ `withdraw`. The original submission remains in the chain as withdrawn; deletion would invoke crypto-shredding per Trellis Core §9.3.
- **Adversarial respondent gaming the correction primitive.** A respondent who files repeated corrections trying to find a favorable determination is a governance-layer concern (rate-limiting, suspicious-pattern surfacing to the caseworker). FW-0034 design names but doesn't mitigate.
- **Appeal lifecycle.** WOS Appeal ([`work-spec/specs/api/appeal.md`](../../../work-spec/specs/api/appeal.md)) is a separate post-determination flow with its own `withdrawn` status; appeals are NOT in scope for the respondent's three-act lifecycle taxonomy. Vocabulary discipline.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Coverage classes

| Class | Description | Owned by |
|---|---|---|
| **(a) Vocabulary-confusion attacks** | The respondent intends one act, the affordance produces another — files a withdrawal when they meant a correction; files a dispute when they meant a withdrawal. | **FW-0034 (this row)**. §3.1 three-act taxonomy. |
| **(b) Weaponized "correction"** | A respondent uses the correction primitive to silently rewrite history, claiming a fact was different at submission time. | **Substrate-prevented** by Formspec §11.4 additive discipline. §2.3.1 documents; §3.2 surfaces. |
| **(c) Coercion at correction time** | A coercer forces the respondent to file a "correction" benefiting the coercer. | **FW-0034 × FW-0048 composition**. §7.2 satisfies. |
| **(d) Safe-* leak via correction reason / value** | A correction's `reason` text or `correctedValue` contains protected information visible to a wider audience than the original field. | **FW-0034 × FW-0049 composition**. §7.3 satisfies. |
| **(e) Per-party correction leak in multi-party** | In a multi-party flow, one party's correction silently reveals their per-party-scoped data to other parties. | **FW-0034 × FW-0050 composition**. §7.4 satisfies. |
| **(f) Cross-agency consistency drift** | A submission referred to another agency is corrected; the downstream agency is not notified; the two agencies hold different "truth." | **WOS governance + cross-agency referral substrate**. §7.5 names the seam; out of FW-0034 scope. |
| **(g) Adversarial fraud via correction abuse** | A respondent files repeated corrections trying to find a favorable determination outcome. | **Governance-layer concern**. §2.4 documents; out of FW-0034 reach. |

### 2.2 Attacker model

- **Attacker identity.** Varies per coverage class:
  - For (a): no attacker — the respondent's own confusion creates the wrong outcome.
  - For (b): the respondent themselves is the would-be attacker against the integrity of the public record.
  - For (c): the coercer (per FW-0048 attacker model — abuser, employer, predatory "helper").
  - For (d) (e): the protected-party adversary (per FW-0049 attacker model).
  - For (f): no attacker — coordination drift produces the wrong outcome.
  - For (g): the respondent themselves gaming the system.
- **Attacker goal.** Class-specific:
  - (a) is design failure, not adversarial.
  - (b) is record-rewriting (the substrate prevents it).
  - (c) (d) (e) compose with the cited adversary's goals from FW-0048 / FW-0049 / FW-0050.
  - (f) is coordination-failure exploitation.
  - (g) is governance-layer fraud.
- **What the attacker observes.** Same as FW-0049 attacker — public receipts, status surface, FOIA disclosure, verifier output. Plus: the correction-chain itself, which surfaces the lineage honestly. **The lineage being visible is a feature, not a leak** — the substrate is designed for stranger-verifiable correction chains per Trellis Core §16.
- **What the attacker cannot force.** Rewriting of prior events (substrate-prevented by `prev_hash` chaining + `correctionTargetEventHash` preservation per Formspec §11.4).
- **What the attacker knows.** Kerckhoffs-style — they have read FW-0034 design; they know the three-act taxonomy; they know corrections are additive and preserved.

### 2.3 Three grounded scenarios

**2.3.1 Benefits applicant — household-size typo.** Applicant submits a state-Medi-Cal benefits application; types household-size as `1` (typo); the correct answer is `3`. Discovers the error 2 days post-submit. The household-size value affects eligibility-band determination.
- **Required:** the applicant can correct the household-size field without losing queue position; the original `1` and corrected `3` are both preserved; the caseworker sees the correction-with-evidence (applicant attaches a household-composition statement) as routine, not as fraud suspicion; the form's amendment-window policy permits corrections until determination issuance.
- **Design posture:** §3.1 user-act = `correct`; routes to Formspec [§11.4 `response.correction-recorded`](../../../formspec/specs/audit/respondent-ledger-spec.md) per §3.2; WOS Kernel §13.9 `correction` mode permitted by the form's `governance.amendmentTaxonomy`; the receipt-chain surfaces both events linearly (§4); the verifier renders the correction lineage honestly (§5). **Canonical J-044 scenario; design optimizes for this.**

**2.3.2 Court filing — substantive error in petitioner's address.** Petitioner files a court motion; the address field carries an error (mistyped street number); the address is the legal-service-of-process address. The error is discovered 1 day post-filing.
- **Required:** the petitioner can issue an amendment that supersedes the address field but preserves the original chain; the court's clerk-of-court system sees the amendment as a new filing referencing the original (the SEC 10-K/A pattern per research brief §4.2); the amendment carries an authority reference (e.g., the petitioner's attorney's authorization).
- **Design posture:** the address field is a **substantive change** beyond a narrow factual correction — routes to Formspec [§11.1 `response.amendment-opened`](../../../formspec/specs/audit/respondent-ledger-spec.md) cycle, NOT to §11.4 `response.correction-recorded`. The WOS Kernel §13.9 `amendment` mode applies — a new task is created per the §2180 rule; `supersedesResponseId` references the prior. **Boundary case for the Q1 decision (correction vs. amendment)**: §3.2 specifies the predicate that routes to the right primitive (narrow factual correction subset vs. substantive change). **Distinguishes the user-act**: this is `correct` from the respondent's perspective; the substrate routes to the amendment primitive when the field set exceeds the correction-subset discipline. The user-visible noun stays `correct`; the substrate noun is `amendment`.

**2.3.3 Mortgage signer — discovered misinformation after signing.** Signer completes a mortgage refinance closing; later discovers the loan terms presented were materially misrepresented (e.g., the rate-lock was misstated). The signer does NOT want to "correct" the record (the record accurately captures what they signed); they want to attach a dispute note attesting to the misinformation, preserving the original record and the signer's counter-attestation in the same chain.
- **Required:** the signer files a `dispute` user-act; the original signed record remains valid and visible; the dispute note is itself signed by the signer; the dispute is undeletable by the counterparty (lender); verifiers see both the original signed record AND the signed dispute attestation.
- **Design posture:** §3.1 user-act = `dispute`; routes to EXT-5 [`response.dispute-attached` event type](../specs/2026-05-22-upstream-extension-queue.md) (queued); the event carries the signer's signature, the disputed event hash, the dispute statement text, and a neutral authority reference. The original record's signature MUST remain verifiable; the dispute is an additional event on the chain, not a replacement. **Canonical J-016 adversarial scenario; design provides the signer-side counter-attestation path without invalidating the original.**
- **`dispute` vs `rescissionRequested` decision sits with the signer (not the runtime).** "Materially misrepresented" is the kind of injury that may motivate either path. The user-visible chooser (§3.3 "What you can do" panel) MUST surface both options when both are available with plain-language framing of the difference: `dispute` = "this record is accurate as signed, but I attest to the misrepresentation" (contract remains operative); `withdraw` (which becomes a `rescissionRequested` intent post-determination per §3.1) = "I no longer consent to be bound by this contract" (issuer governance decides acceptance). Adopters MUST NOT auto-classify; ambiguous intent is a respondent-decision boundary, not a runtime predicate. Cross-references the §3.1 act-confusion vocabulary firewall and the §2.3.1 confusion-attack class (a).

**Implication for the design:** FW-0034 covers (a) the canonical cooperative correction (2.3.1), (b) the cooperative amendment-when-subset-exceeded (2.3.2), and (c) the adversarial signer dispute (2.3.3). The three scenarios exercise the three user-acts; the substrate-mapping per §3.2 routes each to the right upstream primitive. Honest gaps are §8.

### 2.4 Out-of-scope adversarial patterns

Named explicitly so the design isn't read as covering them:

- **Adversarial respondent gaming corrections to find a favorable determination.** Rate-limiting + suspicious-pattern surfacing to the caseworker live in WOS governance, not formspec-web. The substrate cannot distinguish honest from dishonest correction; the design rests on the surface being honest-by-default-affordance, the verifier surfacing the correction lineage, and the issuer's governance retaining adjudication authority.
- **Cross-agency consistency drift.** If a submission has been referred under FW-0029, the downstream agency's "truth" may drift from the originating agency's "truth" after a correction. Notification + reconciliation lives in WOS governance + cross-agency substrate. §7.5 names the seam.
- **Cross-jurisdiction correction with conflicting amendment-window rules.** A federal form whose state-side downstream consumer has a different window. Per-jurisdiction governance concern; out of FW-0034 reach.
- **Corrections that touch FW-0058 AI-agent-as-respondent signatures.** When an AI agent filed on behalf of a principal, who is authorized to issue corrections? The AI agent? The principal? Composition with FW-0037 + FW-0058 deferred; not load-bearing for slice 1.

## 3. Framing decisions

The five framing questions seeded in the research brief §5 land here.

### 3.1 Q1: Three-act user-visible taxonomy

**Decision.** Three distinct user-visible primitives with plain-language labels:

| User-visible noun | Plain-language label | Semantic | Substrate event |
|---|---|---|---|
| `correct` | **"Correct a fact"** | Cooperative additive amendment to a narrow field subset. Original preserved; correction reasoned; evidence attachable. | Formspec [§11.4 `response.correction-recorded`](../../../formspec/specs/audit/respondent-ledger-spec.md) when within the narrow-subset discipline; routes to [§11.1 `response.amendment-opened`](../../../formspec/specs/audit/respondent-ledger-spec.md) cycle when the change exceeds the subset. WOS [Kernel §13.9](../../../work-spec/specs/kernel/spec.md) `correction` or `amendment` mode depending on the same predicate. |
| `withdraw` | **"Withdraw this submission"** | Cooperative termination by the applicant (pre-determination) or applicant-initiated rescission request (post-determination). Original preserved in chain as withdrawn / rescission-requested. | **Pre-determination:** EXT-5 (queued) `response.withdrawn` event + WOS `TerminateInstanceRequest { terminationKind: "applicant-withdrawn" }` per [`work-spec/specs/api/instance.md:131`](../../../work-spec/specs/api/instance.md). The applicant is authorized to terminate the case before a determination issues. **Post-determination:** EXT-5 (queued) `response.withdrawn` event carries a `rescissionRequested: true` intent flag; the **issuer's governance** decides whether to accept and emit the WOS Kernel §13.9 `rescission` mode event. The respondent's surface emits the request; the kernel-mode `rescission` event is issuer-authored. This is an **authority-ladder distinction**: the respondent can request rescission but cannot unilaterally rescind an issuer's determination. The respondent-side UX honestly surfaces "Your request has been sent; the agency will review" copy when `requiresIssuerAcceptance: true` is configured. |
| `dispute` | **"Add a dispute note"** | Adversarial counter-attestation by the signer to a record they signed. Original record preserved + remains valid; dispute is itself signed; undeletable by counterparty. | EXT-5 (queued) `response.dispute-attached` event carrying signer's signature, disputed event hash, dispute statement text, neutral authority reference. |

**Vocabulary firewall** ([per CLAUDE.md](../../CLAUDE.md)): the user-visible nouns are `correct` / `withdraw` / `dispute`. Spec-level taxonomy (`response.correction-recorded` / `response.amendment-opened` / `applicant-withdrawn` / `response.dispute-attached` / `prev_hash` / `supersedes-chain-id`) stays behind the developer-view toggle.

**Alternative rejected: single "Manage this submission" entry-point with three-way choice.** Considered. Rejected because: (a) the discovery cost of a single entry-point forces the respondent through an extra UI layer for what should be a direct affordance per AP-013's "errors-typed-and-actionable" discipline; (b) the three acts have different urgency profiles (correct = routine, withdraw = high-stakes, dispute = signer-only and adversarial) — one entry-point treats them as comparable choices; (c) the J-044 framing explicitly distinguishes "cooperative correction" from "adversarial dispute" as separate paths the respondent must reach without conflation. **Three top-level affordances each surfaced when permitted.**

**Alternative rejected: collapse `correct` and `amend` into one user-act.** Considered. The substrate distinguishes narrow-subset correction from substantive amendment (Formspec §11.4 explicit). The user-visible noun stays `correct` because that's the J-044 language; the substrate-side routing per §3.2 picks the right primitive based on the field-set predicate. The form author does NOT see two separate "correct" vs. "amend" buttons; the runtime determines which primitive applies based on which fields the respondent is changing. **Reduces decision burden on the respondent; substrate-side routing handles the distinction.**

### 3.2 Q2: Substrate-mapping predicate (when does `correct` route to `correction` vs. `amendment`?)

**Decision.** The narrow-subset predicate per Formspec [§11.4 line 882](../../../formspec/specs/audit/respondent-ledger-spec.md):

> *"The corrected field set is a declared subset, not an open-ended amendment. If a proposed change affects determination content or fields outside the declared subset, it is an amendment or supersession under the stack amendment contract, not a `ResponseCorrection`."*

**Concrete predicate (FW-0034 codifies):**

The respondent's `correct` user-act resolves to `response.correction-recorded` (Formspec §11.4) IFF all of the following hold:
1. The changed field set is bounded — the form declares `correctableFieldSet[]` listing which fields qualify for narrow correction;
2. The case lifecycle state is not yet `decision-reached` (per [WOS applicant API `ApplicantStatusTimelineEntry.event`](../../../work-spec/specs/api/applicant.md) reserved literals) — when a determination has been issued, the `correct` user-act routes to `amendment` (the determination itself becomes the supersession boundary). This is a **state-machine check, not a determination-graph walk** — the formspec-web runtime queries the case's lifecycle state via the existing `StatusReader` port (FW-0039 surface), it does NOT inspect which fields flow into which determinations;
3. The change does NOT introduce new fields (only updates values within the declared subset).

Otherwise the user-act resolves to `response.amendment-opened` (Formspec §11.1) producing a new task per WOS Kernel §2180 rule.

**Form-author responsibility.** The form declares `correctableFieldSet[]` (the narrow-correction allowlist) under the `recordLifecycle` form-policy block (§3.3 below). Fields not in `correctableFieldSet[]` cannot be corrected via the cooperative path — substantive changes route to amendment.

**Alternative rejected: let the substrate auto-classify.** Considered: have the runtime introspect the field-change set and pick the right primitive without form-author declaration. Rejected because: (a) the "narrow vs. substantive" distinction is form-domain-specific (a name typo correction is narrow on a benefits form, substantive on a sworn-affidavit form); (b) auto-classification couples the formspec-web runtime to determination-graph knowledge it doesn't have; (c) the form-author declaration via `correctableFieldSet[]` is a one-time authoring cost that aligns with the existing form-policy declaration discipline per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md). **Form-author declares; runtime routes deterministically.**

### 3.3 Q3: Runtime UX — extend FW-0039 `/status` route

**Decision.** The post-submit lifecycle action surface lives **on the existing FW-0039 `/status?case={urn}` route**, not on a separate `/lifecycle` route.

Rationale:
- The respondent already arrives at `/status` to see "where is my submission" per FW-0039 slice 1.
- The three lifecycle action affordances are direct extensions of the status surface ("here's where your submission is" → "here are the actions available on this submission").
- A separate route fragments the discovery path; adds a second URL the respondent must learn; doubles the synthesis pattern under [ADR-0011 §"Non-form surface synthesis"](../adr/0011-runtime-feature-resolution-and-policy-gates.md) without payoff.

**Surface composition.** The `/status` route's existing timeline-and-tasks shape extends with a "What you can do" panel rendered when:
- the resolved runtime profile enables `recordLifecycle` (per §4),
- the case's lifecycle state permits the action per the form's `recordLifecycle` form-policy + the WOS governance state.

The panel surfaces up to three buttons per the three user-acts: **"Correct a fact"** / **"Withdraw this submission"** / **"Add a dispute note"** (signer-only, only surfaced when the requesting actor is a signer per the WOS applicant API's actor scope).

**Empty / disabled state copy** per the FW-0039 disabled-cause discipline:
- `optional-no-instance`: "Correction, withdrawal, and dispute are not available on this site."
- `org-forbidden`: "This sender does not allow correction or withdrawal here."
- `window-closed`: "The correction window closed on [date]. To request a change, contact [sender contact]."
- `wrong-actor` (dispute-only): rendered as absent button rather than disabled — non-signers never see the dispute affordance.

**Form-policy declaration shape.** The form's `recordLifecycle` form-policy block per [web ADR-0011 §Form runtime policy](../adr/0011-runtime-feature-resolution-and-policy-gates.md):

```text
recordLifecycle?: {
  correctable?: {
    enabled: boolean
    correctableFieldSet?: Array<string>           // RFC 6901 JSON pointers; required when enabled = true
    window?: { closesAt: "determination" | "issuance+30d" | "submission+Nd" | "never" | string }
    requiresEvidence?: boolean                     // whether the correction must attach an evidence artifact
    requiresReason?: boolean                       // whether the reason field is required (default true)
  }
  withdrawable?: {
    enabled: boolean
    window?: { closesAt: "determination" | "submission+Nd" | "never" | string }
    requiresReason?: boolean                                  // default true
    preDeterminationKernelMode: "applicant-withdrawn"         // formspec-web emits; applicant authority
    postDeterminationIntent?: "rescission-requested"          // formspec-web emits the REQUEST; issuer governance decides whether to emit the kernel `rescission` event (issuer authority — see Finding 1 / §3.1 authority-ladder distinction)
    requiresIssuerAcceptance?: boolean                        // MUST be true when postDeterminationIntent is configured
    partyScope?: "any-party" | "all-parties-must-agree"       // case-level multi-party withdraw composition per §7.4; default all-parties-must-agree. Distinct from FW-0050 §5.2 per-signature withdraw which is per-party always.
  }
  disputable?: {
    enabled: boolean
    signerOnly?: boolean                           // default true — non-signers cannot dispute
    requiresReason?: boolean                       // default true; dispute statement is the reason
  }
}
```

**Alternative rejected: dedicated `/lifecycle?case={urn}` route.** Considered; rejected per the fragmentation argument above. The composition with FW-0039 is cleaner than introducing a new identity-bound surface for actions the respondent will discover from the status surface anyway.

**Alternative rejected: inline-on-form correction at form-load time.** Considered: instead of a post-submit surface, render the correction affordance inline on the form when the respondent re-visits a submitted record. Rejected because: (a) the form may have been a one-time fill (link expires); (b) post-submit affordances belong to the post-submit place (the J-039 / J-043 respondent-place framing); (c) the FW-0039 status surface IS the respondent-place for post-submit case visibility — that's where lifecycle actions belong.

### 3.4 Q4: Receipt-chain visualization — additive timeline, honest reason rendering

**Decision.** The verifier-public-output renders the correction-chain as an **additive timeline**:

```
Original submission       [timestamp]                              [verified ✓]
Correction                [timestamp]  fields: name, household-size [verified ✓]
Correction                [timestamp]  fields: address              [verified ✓]
Dispute attached          [timestamp]  by: signer                   [verified ✓]
```

**Reason text rendering discipline:**
- When the correction's `reason` field carries no `accessControl.class` (default): render the reason text inline beneath the correction row.
- When the correction's `reason` field carries `accessControl.class: "safe-*"`: render "reason withheld" beneath the row (per FW-0049 §3.3 mask discipline; §7.3 composition rule).
- When the form-policy declares `correctable.requiresReason: false`: the reason is absent; render no reason row.

**Original-vs-corrected value rendering:**
- Default: render both `originalValue` and `correctedValue` per the Formspec §11.4 `fieldValues[]` preservation.
- When a field-value carries `accessControl.class: "safe-*"`: render per the FW-0049 §3.3 discipline (masked-by-default; per-act-reveal only to authorized audiences).

**Withdrawal rendering:**
- The original submission's row remains; a "Withdrawn" event row is appended; the original's "verified ✓" stays (the original is still cryptographically verifiable, just no longer operative).
- WOS governance state surfaces as the case lifecycle state ("Withdrawn by applicant on [date]").

**Dispute rendering:**
- The original signed-record row remains with its signature verification intact.
- The dispute row appears with its own signature verification ("Dispute signed by [signer] on [date]").
- The dispute statement text renders per the same reason-class discipline as corrections.

**Posture-uniformity for high-stakes correction-frequency forms.** A form may declare `recordLifecycle.correctable.postureUniform: true` to require that the verifier-public-output render structurally identically for corrected and uncorrected records (analogous to FW-0049 §3.5 verifier-grade posture). This requires Trellis Phase 2+ substrate (OC-26 commitment-slot population per record). **Deferred to a follow-on row** — the FW-0034 base design ships visible chain entries (per the SEC 10-K/A model in the research brief); the posture-uniform tier is FW-0079 (proposed below) when a real form needs it.

**Justification.** Per [Trellis Core §16 stranger-test discipline](../../../trellis/specs/trellis-core.md), the verifier produces a correction-preservation report independent of any authority. The receipt-chain visualization rides on this report: the report carries `CorrectionPreservationOutcome` rows with `correction_event_hash` per Core §27.4. The verifier already knows how to *recognize* the correction; FW-0034 specifies how to *render* the recognition honestly.

**Alternative rejected: hide the correction-chain by default.** Considered: only render the most-recent value, with a "show correction history" disclosure. Rejected because: (a) the correction-chain is the proof-of-honesty per J-044 — hiding it weakens the trust argument; (b) the SEC 10-K/A precedent visibly chains; (c) verifier independence per Core §16 means the chain is verifiable regardless — hiding it on the formspec-web verifier is performance theater. **Additive timeline as default; the form may declare a posture-uniform tier if structural-indistinguishability is required.**

### 3.5 Q5: `recordLifecycle` capability tier — per-act tier axis

**Decision.** Per-act tier axes — `correctable: "supported" | "unsupported"` × `withdrawable: "supported" | "unsupported"` × `disputable: "supported" | "unsupported"`.

Rationale:
- The substrate is uniform (Phase 1 chaining is sufficient for all three).
- Deployment composition is what varies — some deployments don't ship WOS governance (no instance-termination path); some don't yet wire EXT-5 events (no dispute primitive); the correction path can land independently of the others.
- Per-act tiers mirror the per-act framing of FW-0048 (`mechanism` × `routingTier`) and FW-0049 (`receiptPostureTier`), aligning the design vocabulary across the recent capability-key landings.

**Capability shape.**

| Layer | What it carries for `recordLifecycle` |
|---|---|
| Instance capability | Per-act adapter availability: (a) `correctable` requires Respondent Ledger event-emit + Trellis substrate (Phase 1 ready); (b) `withdrawable` adds WOS `TerminateInstanceRequest` port + EXT-5 `response.withdrawn` event (post-MVP); (c) `disputable` adds EXT-5 `response.dispute-attached` event + signer-identity port (post-MVP). Instance declares each act as `supported` or `unsupported`. |
| Org policy | Per-act window declarations + per-form allowlist (e.g., "this issuer permits corrections but not withdrawals"); per-jurisdiction window overrides; cross-agency referral notification policy. |
| Form policy | Per-act `enabled` flag + per-act window + per-act `correctableFieldSet[]` (correction) + per-act required-evidence / required-reason / requires-issuer-acceptance flags per §3.3. |
| Resolved runtime profile | Per-act enabled state + per-act window-state ("open" / "closes-at" / "closed") + per-act configuration (correctableFieldSet, evidence-required, etc.). Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if `correctable.enabled: true` + instance lacks the `correctable` tier. |

**Adopter contract.** Per [web ADR-0009 §"Not in the constitutional inventory"](../adr/0009-hexagonal-architecture-ports-and-adapters.md): the port shape lands with the FW-0038 build, not here. The adopter axes the FW-0038 build must satisfy:

| Adopter axis | What it implies |
|---|---|
| Respondent Ledger event-emit adapter | Per Formspec §11.4 — emits `response.correction-recorded` with required payload shape. **Phase 1 substrate.** |
| WOS `TerminateInstanceRequest` adapter | For the `withdraw` user-act when WOS is the governance layer. Per `work-spec/specs/api/instance.md:131`. **Post-MVP**. |
| EXT-5 `response.withdrawn` / `response.dispute-attached` event-emit adapter | EXT-5 (queued); blocks `withdraw` + `dispute` user-acts. |
| Cross-agency referral notification adapter | For FW-0029 composition (§7.5). Adopter-supplied; deployment concern. |

### 3.6 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a `recordLifecycle` block:

```text
recordLifecycle?: {
  correctable?: {
    enabled: boolean
    correctableFieldSet?: Array<string>
    window?: { state: "open" | "closes-at" | "closed", closesAt?: ISOString }
    requiresEvidence?: boolean
    requiresReason?: boolean
  }
  withdrawable?: {
    enabled: boolean
    window?: { state: "open" | "closes-at" | "closed", closesAt?: ISOString }
    requiresReason?: boolean
    preDeterminationKernelMode: "applicant-withdrawn"
    postDeterminationIntent?: "rescission-requested"
    requiresIssuerAcceptance?: boolean
    partyScope?: "any-party" | "all-parties-must-agree"
  }
  disputable?: {
    enabled: boolean
    signerOnly?: boolean
    requiresReason?: boolean
  }
}
```

The block is the resolver's read-only output. Adapters do not consume it directly; the React shell does, and orchestrates the existing `StatusReader` (FW-0039 surface) + the FW-0038-build lifecycle-action transport adapters against it.

**Per-route synthesis pattern.** The `/status` route synthesizes `form: { features: { status: 'optional', recordLifecycle: 'optional' } }` per the [ADR-0011 §"Non-form surface synthesis" addendum](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `recordLifecycle` STAYS OPTIONAL on the status route (never required) so an unavailable instance falls off as `optional-no-instance` rather than raising `UnsupportedRequiredFeatureError` on a surface that has no form.

## 4. Failure semantics

### 4.1 Form-load failures

| Condition | Error per ADR-0011 |
|---|---|
| Form requires `correctable` (`enabled: true`) but instance lacks Respondent Ledger event-emit | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `withdrawable` (`enabled: true`) but instance lacks `TerminateInstanceRequest` port (no WOS governance layer) | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `disputable` (`enabled: true`) but instance lacks EXT-5 `response.dispute-attached` event-emit | `UnsupportedRequiredFeatureError` at form-load |
| Form declares `correctable.correctableFieldSet[]` referencing fields not present in the form definition | `InvalidRuntimePolicyError` at form-load |
| Form declares `correctable.enabled: true` but `correctableFieldSet[]` is empty | `InvalidRuntimePolicyError` at form-load |
| Form declares `disputable.enabled: true` without a signer in the form (`disputable` requires at least one `AuthoredSignature` per `disputable.signerOnly: true` default) | `InvalidRuntimePolicyError` at form-load |
| Form's `recordLifecycle` declaration conflicts with org policy (org forbids `withdrawable` for the form's jurisdiction) | `FeaturePolicyConflictError` at form-load |

**Silent downgrade is forbidden.** A form requiring `correctable` MUST fail-load on an instance lacking Respondent Ledger event-emit. The honest fallback for a deployment that wants to ship lifecycle-features-when-available is to declare the form-policy as `enabled: false` with a documented "request via support" workflow, not silently disabling the affordance.

### 4.2 Runtime failures

| Condition | Behavior |
|---|---|
| Respondent attempts a correction on a field NOT in `correctableFieldSet[]` | Per-field validation error: "This field can't be corrected on this site. To change this field, [contact support / file an amendment / etc.]" — per-form copy declared in the form policy. |
| Respondent attempts a correction within the `correctableFieldSet[]` but on a field whose value flows into an already-issued determination | Runtime routes to `amendment` per §3.2 predicate. The user sees an honest "this change is substantive enough to require an amendment, which creates a new task" disclosure before the act commits. |
| Window closes mid-session | The action affordance disappears; honest copy: "The correction window closed [N minutes / hours] ago." |
| Respondent attempts `withdraw` on a case in a state that forbids it (per WOS governance) | The withdrawal call returns `WOS-1409` per [`work-spec/specs/api/instance.md:131`](../../../work-spec/specs/api/instance.md); the React shell renders honest copy mapped from the typed error: "This submission can no longer be withdrawn because [decision-issued / case-completed / etc.]." |
| Non-signer attempts `dispute` (UI bug) | Hard error per ADR-0011 surface; honest copy: "Only signers can add a dispute note to a signed record." The button should never have been shown — the runtime-feature resolver gates the affordance per `disputable.signerOnly: true`. |
| Correction submission fails mid-flight | Same discipline as initial submission per [`AP-013`](../../JOURNEYS.md): typed error, problem-JSON-shaped, plain-language guidance, resolvable reference ID. NO "something went wrong." |
| Coercion at correction time | Per §7.2 — FW-0048 dual-credential mechanism fires on the correction-submit ceremony when the form is on the high-risk template set. |

### 4.3 Cross-stack failures

| Condition | Behavior |
|---|---|
| WOS `TerminateInstanceRequest` succeeds but Respondent Ledger `response.withdrawn` emit fails | Compensating action: the withdrawal at WOS is recorded but the Respondent Ledger event is queued for retry per the existing ledger-event retry policy. The respondent sees "Withdrawal recorded. Receipt for your record is being prepared." If retry exhausts, the issuer surfaces the inconsistency for manual reconciliation. |
| Cross-agency referral notification fails (FW-0029 composition; §7.5) | Notification is a derived artifact; the correction event itself succeeds. The notification failure surfaces to the issuer-side ops surface, not the respondent. |
| Trellis chain append fails (substrate down) | Hard error per the existing Trellis Phase 1 append-idempotency contract ([Trellis Core §17](../../../trellis/specs/trellis-core.md)). The respondent sees an honest "Your correction couldn't be recorded right now. Try again in a few minutes." with a retry button + reference ID. |

## 5. Receipt-chain visualization rendering contract

The verifier-public-output renderer per §3.4 must satisfy the following contract. Build-time conformance fixtures (FW-0038) cover each.

**Integrity-vs-operativeness clarification.** The "verified ✓" status on a row is a **cryptographic-integrity claim** (the signature over the event's canonical bytes verifies against the issuer's signing key) — it is **independent of operative status**. A withdrawn submission's original event row carries "verified ✓" because the bytes haven't changed; a separate case-lifecycle-state copy ("Withdrawn by applicant on [date]") carries the operativeness signal. The same holds for disputed records: the original signed-record's "verified ✓" remains true even when the dispute is attached; the dispute is a counter-attestation, not an invalidation. Adopters MUST surface both signals without conflating them.

| Contract | Fixture case |
|---|---|
| **Original submission row** always present, always shows verification ✓ when the original signature verifies, regardless of subsequent lifecycle events | Fixture: original signed submission + 1 correction + 1 dispute; verifier renders all three rows; original row's verification status is ✓. |
| **Correction rows** show changed-fields list (vocabulary-firewalled — field labels from form definition, never spec-level paths like `$.applicant.householdSize`); show reason text honestly when class permits, "reason withheld" when class restricts (per FW-0049 §7.3 composition) | Fixture: 1 correction with no `accessControl.class` on reason; 1 correction with `safe-address` class on reason. Both render correctly. |
| **Field-value renders** show `originalValue` and `correctedValue` honestly; masked-by-default per FW-0049 when class restricts | Fixture: correction touching a `safe-address`-class field; original + corrected values rendered per FW-0049 §3.3 mask discipline. |
| **Withdrawal rows** render the original submission row + a "Withdrawn" event row; case lifecycle state surfaces ("Withdrawn by applicant on [date]") | Fixture: original signed submission + withdrawal; verifier renders original + withdrawal; original's verification ✓ stays. |
| **Dispute rows** render the original signed-record row with signature verification intact + a separate dispute row with its own signature verification | Fixture: original signer A signs record; signer A files dispute; verifier renders both with separate ✓ verifications. |
| **Multi-party dispute** (composes with FW-0050): one signer's dispute does not invalidate other signers' signatures | Fixture: 2-signer joint submission; signer B disputes; verifier renders both signers' signatures verified + signer B's dispute. |
| **Vocabulary firewall**: forbidden DOM substrings in the rendered output include `response.correction-recorded`, `priorEventHash`, `correctionTargetEventHash`, `supersedes-chain-id`, `applicant-withdrawn`, `prev_hash`, `canonical_event_hash` | Fixture asserts none of these strings appear in the rendered verifier output. |

## 6. Cross-stack dependency chain

### 6.1 The chain

```
FW-0034 design (this doc)
    ↓
EXT-5 ratification (formspec — `response.withdrawn`, `response.dispute-attached`, `consent.revoked` event types)
+ EXT-35 (new — proposed below: form-policy `lifecycleActions` declaration shape)
+ web ADR-0011 (Feature Ownership Table for `recordLifecycle` is already present; resolved profile shape lands per §3.6)
    ↓
XS-5 ratification (new cross-stack ADR proposed below; spans formspec + WOS + trellis — confirms the three-act-to-substrate mapping)
    ↓
FW-0038 build (formspec-web)
```

### 6.2 EXT-5 — per-party correction scope extension (sibling to FW-0050 hook)

EXT-5 ([`thoughts/specs/2026-05-22-upstream-extension-queue.md:66`](2026-05-22-upstream-extension-queue.md)) currently queues `response.withdrawn`, `response.dispute-attached`, `consent.revoked`. **FW-0034 design adds:** all three event types MUST accept an optional `partyRef` field (per FW-0050 §7.1 composition) naming which party in a multi-party flow authored the act. The existing `response.correction-recorded` per Formspec §11.4 already accepts the field set; EXT-5 extends the new event types analogously. Single-party flows omit `partyRef`; multi-party flows populate it.

### 6.3 EXT-35 (new) — form-policy `lifecycleActions` declaration

**Proposed for upstream extension queue.** The `wos-workflow.schema.json` Governance block per [`work-spec/specs/kernel/spec.md:2168`](../../../work-spec/specs/kernel/spec.md) already declares `governance.amendmentTaxonomy[]` listing which 5-mode taxonomy modes the workflow permits. **FW-0034 design adds:** a sibling `governance.recordLifecycle` block carrying the per-act configuration per §3.3 (form-policy declaration shape). The block maps respondent-facing user-acts to the kernel amendment taxonomy:

```text
governance.recordLifecycle?: {
  correctable?: {
    enabled: boolean
    correctableFieldSet: Array<string>                    // RFC 6901 pointers
    window?: { closesAt: string }
    requiresEvidence?: boolean
    requiresReason?: boolean
    kernelMode: "correction"                              // routes to amendmentTaxonomy literal
  }
  withdrawable?: {
    enabled: boolean
    window?: { closesAt: string }
    requiresReason?: boolean
    requiresIssuerAcceptance?: boolean
    kernelMode: "rescission" | "applicant-withdrawn"      // rescission when determination exists; applicant-withdrawn when no determination
  }
  disputable?: {
    enabled: boolean
    signerOnly?: boolean
    requiresReason?: boolean
    // No kernelMode binding — dispute is a counter-attestation, not a lifecycle state transition
  }
}
```

**Fixture status:** none. Land with fixtures in `work-spec/tests/fixtures/governance/recordLifecycle/`.

**Status:** not yet filed. Proposed by FW-0034 design 2026-05-24.

### 6.4 XS-5 (new) — Cross-stack ADR for record-lifecycle three-act mapping

**Proposed for stack-root.** Spans formspec (Respondent Ledger event taxonomy + `response.correction-recorded` discipline), WOS (Kernel §13.9 amendment taxonomy + `TerminateInstanceRequest`), and trellis (Phase 1 chain + ADR 0066 correction-preservation reporting). **The cross-stack contract is: the three respondent-facing user-acts (`correct` / `withdraw` / `dispute`) map deterministically to upstream primitives per §3.1 + §3.2; each upstream layer carries the responsibility it already owns; no new substrate is invented.**

**XS-5 proposed content (consumer perspective):**

1. **Boundary:** at `intake-handoff` plus the Respondent Ledger event-emit plus the WOS Instance API termination call. Formspec owns the respondent-ledger event semantics; WOS owns the governance-layer determination/termination flow; Trellis owns the chain integrity + correction-preservation report.
2. **Three-act mapping table** (consolidated from §3.1):
   - `correct` → Formspec `response.correction-recorded` (narrow subset) OR `response.amendment-opened` (substantive) + WOS Kernel §13.9 `correction` OR `amendment` mode.
   - `withdraw` → **Pre-determination:** Formspec EXT-5 `response.withdrawn` + WOS `TerminateInstanceRequest { terminationKind: "applicant-withdrawn" }`. **Post-determination:** Formspec EXT-5 `response.withdrawn` carrying `rescissionRequested: true` intent flag → issuer governance reviews → optionally emits the WOS Kernel §13.9 `rescission` mode event (issuer-authored, not respondent-authored). Authority-ladder: the respondent emits the request; the kernel-mode event is issuer-authored. The cross-stack contract MUST reflect this — the respondent's surface never directly emits a kernel `rescission` event.
   - `dispute` → Formspec EXT-5 `response.dispute-attached` + no WOS lifecycle transition (the determination remains operative; dispute is counter-attestation only).
3. **Trellis discipline.** Every lifecycle event lives on the same response-ledger chain as the original submission, linked via `prev_hash`. Cross-chain supersession (Trellis `trellis.supersedes-chain-id.v1` extension per [Trellis Core §6.7](../../../trellis/specs/trellis-core.md)) is used ONLY when WOS Kernel §13.9 `supersession` mode produces a new case/chain — not for the basic correct/withdraw/dispute path.
4. **Verifier discipline.** Correction-preservation report per Trellis Core §27.4 already specifies `CorrectionPreservationOutcome` rows; the FW-0034 verifier-public-output renders these per §5. The withdrawal + dispute event types (EXT-5) extend the same report shape — the verifier surfaces "withdrawn-by-applicant on [event_hash]" and "disputed-by-signer on [event_hash]" rows analogously.
5. **WOS actor scope (when WOS is the governance layer).** The applicant API + governance projections MUST surface the lifecycle events on the case timeline per [`work-spec/specs/api/applicant.md:74`](../../../work-spec/specs/api/applicant.md) `ApplicantStatusTimelineEntry`. The reserved-literal `lifecycle-changed` covers all three acts; a more-specific stage label distinguishes them ("correction-recorded" / "withdrawn-by-applicant" / "dispute-attached") in the timeline-entry detail.
6. **Multi-party composition (FW-0050 §7.1 binding):** see §7.4 below.
7. **Safe-* composition (FW-0049 §7 binding):** see §7.3 below.
8. **PKAF/Rulespec downstream:** when a corrected/withdrawn/disputed record is referenced by a downstream PKAF assertion, the assertion's lifecycle MUST track via `rkaf:supersedesAssertion` + `rkaf:lifecycleEvent` per [PKAF/spec/rkaf-core.md:56 + 224](../../../PKAF/spec/rkaf-core.md). **Vocabulary tokens are ILLUSTRATIVE pending Rulespec alignment row** — XS-5 establishes the binding contract using whatever PKAF tokens are canonical at that time.

**Subsystem-count honesty.** XS-5 spans formspec + WOS + trellis. Each subsystem already specifies its share; XS-5 confirms the three-act mapping is coherent across the three subsystems and that no new primitive is required. **Lighter cross-stack work than XS-4 (FW-0049)** because the substrate is mature.

**Without XS-5 ratification, FW-0034 design cannot be acted on by FW-0038** — the three-act mapping is the design's load-bearing decision; ratifying it cross-stack is the prerequisite for build.

### 6.5 What FW-0034 ratifies standalone

**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q5 framing decisions, scoped to formspec-web's consumer perspective.
- The `recordLifecycle` capability shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the resolved-profile block in §3.6, the per-act tier axes, the failure-semantics binding.
- The three-act user-visible taxonomy per §3.1.
- The substrate-mapping predicate per §3.2 (the `correctableFieldSet[]` narrow-correction allowlist).
- The runtime UX composition with FW-0039 per §3.3.
- The receipt-chain visualization rendering contract per §5.
- The composition rules with FW-0048 (§7.2), FW-0049 (§7.3), FW-0050 (§7.4), FW-0029 (§7.5).

**Waits on upstream:**

- EXT-5 ratification (`response.withdrawn`, `response.dispute-attached` event types).
- EXT-35 (new — form-policy `lifecycleActions` shape on WOS `governance.recordLifecycle`).
- XS-5 cross-stack ADR (confirms the three-act mapping spanning formspec + WOS + trellis).
- WOS `TerminateInstanceRequest` adapter availability per [`work-spec/specs/api/instance.md:131`](../../../work-spec/specs/api/instance.md) (already specified; reference adapter ships post-MVP).

## 7. Cross-row composition

### 7.1 FW-0038 build constraints (consumed by FW-0038 author directly)

The FW-0038 build is responsible for:

1. **The three-act React shell** (Correct / Withdraw / Add dispute note) per §3.3, surfaced on the FW-0039 `/status` route.
2. **The form-policy resolver extension** for `recordLifecycle` per §3.6 — extends the existing runtime-feature resolver (FW-0065 scaffolding).
3. **The substrate-mapping router per §3.2** — given the user's `correct` act + the changed-field set, routes to `response.correction-recorded` OR `response.amendment-opened` deterministically.
4. **The Respondent Ledger event-emit transport adapter** for `response.correction-recorded` per Formspec §11.4.
5. **EXT-5 event-emit adapters** for `response.withdrawn` and `response.dispute-attached` (gated on EXT-5 ratification).
6. **WOS `TerminateInstanceRequest` transport adapter** for the `withdraw` user-act (gated on WOS reference adapter availability).
7. **The receipt-chain visualization renderer** per §5 — fixture-pinned per the conformance contract.
8. **Per-row composition** with FW-0048 (§7.2), FW-0049 (§7.3), FW-0050 (§7.4).

### 7.2 FW-0048 composition (coercion at correction time)

FW-0048 (coercion-aware signing) and FW-0034 (record lifecycle) compose **mechanically without new substrate**.

**Composition rule.** Any form on the FW-0048 high-risk template set whose `recordLifecycle.correctable.enabled: true` or `recordLifecycle.withdrawable.enabled: true` MUST expose the FW-0048 dual-credential duress mechanism at the correction-submit ceremony AND the withdrawal-submit ceremony. The mechanism is byte-identical to the original signing ceremony per [FW-0048 §3.4](2026-05-23-fw-0048-coercion-aware-signing-design.md); the `submission.duress-signaled` event fires on the lifecycle-action submit; the safety-team routing per FW-0048 §5 fires.

**Justification.** Coercion does not stop at the original submission. A coercer who forced an original submission may force a "correction" to favor their interest, or force a "withdrawal" to nullify the respondent's act. The FW-0048 mechanism MUST cover the full lifecycle, not just the original ceremony.

**No new event type needed.** The existing `submission.duress-signaled` payload per [FW-0048 §5.1](2026-05-23-fw-0048-coercion-aware-signing-design.md) carries `authoredSignatureRef?` and `partyRef?`; FW-0034 design adds: when the duress signal fires on a lifecycle-action submit, the payload's `authoredSignatureRef` references the lifecycle-action's signature (not the original submission's signature). The chain integrity is preserved by the existing Trellis `prev_hash` chaining.

**No new dispute path for duress.** A respondent under duress at dispute-submit time uses the FW-0048 duress mechanism; the dispute fires with the duress signal embedded. The recipient (safety-team) sees the duress signal; the dispute itself remains a counter-attestation on the chain.

**FW-0038 build constraint addition (consumed by FW-0038 author directly):** the FW-0059 build (FW-0048's build row) MUST ship the duress mechanism over the lifecycle-action submit ceremonies, not just the original submission ceremony. Coordinate with FW-0038 build to ensure the lifecycle-action surfaces consume the duress mechanism from the same composition point. **No new XS-* row required** — XS-3 (FW-0048's cross-stack ADR) already specifies the duress mechanism across the formspec + WOS + trellis pipeline; lifecycle-action submits ride on the same pipeline.

### 7.3 FW-0049 composition (safe-* fields in correction reason / values)

FW-0049 (safe-address handling) and FW-0034 (record lifecycle) compose at the per-field accessControl.class layer.

**Composition rule.** When a corrected field carries `accessControl.class: "safe-*"`, the correction event's `fieldValues[].originalValue` + `fieldValues[].correctedValue` inherit the class per the existing [`formspec/specs/audit/respondent-ledger-spec.md:524 + 613`](../../../formspec/specs/audit/respondent-ledger-spec.md) `accessClass` inheritance discipline. The bucketed-Response writer (per [ADR-0074](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)) routes the values to the right per-class audience.

**Reason field discipline.** The correction's `reason` text is itself a respondent-authored field that MAY contain protected information. The form-author declares the reason field's `accessControl.class` in the `recordLifecycle.correctable` block:

```text
correctable.reasonField?: {
  accessControl: { class: "unclassified" | "safe-address" | "safe-contact" | ... }
}
```

Default: `unclassified` (the reason renders openly per §3.4). When declared as a safe-* class, the reason is masked per FW-0049 §3.3 in the verifier-public-output ("reason withheld").

**Renderer discipline.** The receipt-chain visualization per §5 + §3.4 honors the per-class mask. The fixture corpus (§5) covers both the unclassified-reason case and the safe-* reason case.

**Dispute statement discipline.** Analogous to the reason field. The dispute's `statement` text is itself a respondent-authored field; form-author declares its `accessControl.class` in `recordLifecycle.disputable.statementField`. Default unclassified.

**Justification.** The FW-0049 mask discipline exists for shoulder-surfing / receipt-disclosure defense; a correction reason or dispute statement that names protected information would be a leak if rendered openly. The composition is mechanical — the existing class-inheritance discipline applies; no new mechanism is needed beyond the form-author declaration shape.

**FW-0038 build constraint addition (consumed by FW-0038 author directly):** the receipt-chain renderer MUST consume the FW-0049 §3.3 mask discipline for safe-*-class reason / statement fields; conformance fixtures cover the composition.

### 7.4 FW-0050 composition (per-party correction scoping)

FW-0050 (multi-party submission) and FW-0034 (record lifecycle) compose at the per-party event scoping layer.

**Composition rule.** In a multi-party flow declared per [FW-0050 §3](2026-05-23-fw-0050-multi-party-submission-design.md), each lifecycle event carries an optional `partyRef` field (per §6.2 EXT-5 extension) naming which party authored the act. The visibility of the event on each party's view is gated by:
- the FW-0050 `visibleTo[]` policy on the changed field set (corrections);
- the form's `recordLifecycle.disputable.signerOnly: true` policy (disputes — only the specific signer who signed can dispute their signature);
- the WOS governance policy on multi-party termination (withdraw — varies; some multi-party flows require all-party consent to withdraw, others permit any party to withdraw their portion).

**Per-party correction scenarios:**

1. **One party corrects their own per-party fields only.** The correction's `correctableFieldSet[]` is a subset of the party's per-party fields per FW-0050 §3.3. The correction event carries `partyRef: partyA.roleId`; visible to parties whose `visibleTo[]` covers the fields; not visible to parties excluded.
2. **One party corrects a shared field.** Shared fields require either all-party co-signature on the correction OR re-submission of the affected portion. The FW-0034 design declares: **shared-field corrections require all-party co-signature on the correction event** (analogous to the original shared-field signature requirement per FW-0050 §3.4). The runtime UX surfaces "This correction touches a shared field. All parties must approve the correction." with a pending-approval state.
3. **One party withdraws.** Two granularities — distinguished explicitly per [FW-0050 §5.2](2026-05-23-fw-0050-multi-party-submission-design.md) per-signature-withdrawal rule ("a party can withdraw only their **own** signature; no party can revoke another party's signature"):
   - **Per-signature withdraw** — always per-party per FW-0050 §5.2; a party can revoke their own signature unilaterally. This is the FW-0050 substrate-level rule, NOT a FW-0034 configuration axis. The respondent-facing affordance is rendered as **"Withdraw my signature"** when the form has `multiParty.tier > none` AND the requesting actor has an existing AuthoredSignature. No `partyScope` configuration applies — FW-0050 already specifies this.
   - **Case-level withdraw** — per-party-configurable per `recordLifecycle.withdrawable.partyScope: "any-party" | "all-parties-must-agree"`. Default: `all-parties-must-agree` (one party cannot unilaterally end a joint filing). The respondent-facing affordance is rendered as **"Withdraw this submission"** — terminates the case for all parties when `all-parties-must-agree` is satisfied; terminates per-party (case continues for remaining parties) when `any-party` mode is configured AND the form permits per-party termination.

  Form-author MUST declare `recordLifecycle.withdrawable.partyScope` explicitly for multi-party flows; the runtime renders the appropriate affordance based on the form-author's declaration AND the FW-0050 multiParty tier. Single-party flows ignore `partyScope` (no per-party concept).
4. **One signer disputes.** Per `disputable.signerOnly: true`, each signer can dispute their own signature independently. Other signers' signatures remain valid; the dispute is scoped to the specific signer who filed it.

**Justification.** The composition rule falls out of the substrate — `partyRef` on the lifecycle event extends the existing per-party event scoping discipline FW-0050 establishes for original submissions. No new visibility primitive required.

**FW-0038 build constraint addition (consumed by FW-0038 author directly):** the lifecycle-action React shell MUST consume the FW-0050 per-party visibility resolver for shared-field corrections and per-party withdrawals; conformance fixtures cover the four scenarios above.

### 7.5 FW-0029 composition (cross-agency referral notification)

FW-0029 (cross-agency referral warning) and FW-0034 (record lifecycle) compose at the post-submit notification layer.

**Composition rule.** When a submission has been referred to another agency (per FW-0029's referral mechanism) AND the respondent corrects / withdraws / disputes the submission, the originating agency's WOS governance MUST trigger a downstream notification to the referred-to agency. The notification carries the lifecycle event hash + the change set (corrected fields, withdrawal status, dispute statement reference).

**Where this lives.** The notification mechanism is **WOS governance + cross-agency referral substrate territory, not formspec-web**. FW-0034 design names the seam; the actual notification adapter lives in WOS server's cross-agency referral handler. The formspec-web responsibility is purely to emit the lifecycle event correctly; the downstream propagation is governance-layer.

**Honest disclosure.** The form-author may declare `recordLifecycle.correctable.notifiesDownstream: true` to surface honest copy at correction time: "This submission has been shared with [downstream agency]. Your correction will be sent to them too." The disclosure is the FW-0029 warning's symmetric post-submit form.

**No FW-0029 build dependency for FW-0034.** The notification is a derived artifact; the lifecycle event itself succeeds regardless of notification status. FW-0029's build can land independently.

### 7.6 FW-0009 / FW-0054 composition (receipt portal long-life access)

FW-0009 (signed receipt the respondent owns) and FW-0054 (long-life receipt access) compose with FW-0034 at the receipt-portal layer.

**Composition rule.** A long-life receipt for a corrected/withdrawn/disputed submission MUST surface the lifecycle chain when fetched from the receipt portal. The receipt-chain visualization per §5 lives in the verifier-public-output; the long-life portal hands the verifier the full chain.

**Original receipt validity.** The respondent's original kept receipt remains cryptographically valid AS OF its production time per the Trellis substrate immutability discipline. A correction does NOT invalidate the original receipt; a NEW receipt is issued for the correction event. The respondent holds both; the verifier reading either sees the correction-preservation report linking them.

**Withdrawal receipt.** A withdrawn submission's original receipt remains valid; a NEW "withdrawal receipt" is issued. The receipt portal surfaces both. The withdrawal receipt is itself signed by the respondent (per the lifecycle-action submit ceremony per §3.5).

## 8. Open questions / deferrals

Honest list of what FW-0034 design does NOT resolve:

1. **Adversarial respondent gaming the correction primitive (§2.4).** A respondent filing repeated corrections trying to find a favorable determination. **Governance-layer concern; out of FW-0034 reach.** WOS governance owns rate-limiting + suspicious-pattern surfacing.
2. **Cross-jurisdiction conflicting amendment windows (§1.2).** Federal form's state-side downstream consumer has a different window. **Per-jurisdiction governance concern.** FW-0034 ships the mechanism (per-form window declaration); per-jurisdiction policy lands per deployment.
3. **Cross-agency referral notification mechanism (§7.5).** WOS governance + cross-agency referral substrate territory; FW-0029 names the pre-submit warning. **Out of FW-0034 scope.** Named seam.
4. **Posture-uniform receipt-chain visualization (§3.4 alternative).** When a high-stakes correction-frequency form requires structurally-indistinguishable receipts (corrected vs. uncorrected), the discipline requires Trellis Phase 2+ substrate. **Deferred to FW-0079** (proposed below) when a real form needs it. Base FW-0034 ships visible chain entries per the SEC 10-K/A model.
5. **AI-agent-as-respondent correction authority (§2.4).** When an AI agent filed on behalf of a principal per FW-0058, who can correct? Composition with FW-0037 + FW-0058 deferred; not load-bearing for slice 1.
6. **Determination-acceptance flow on the issuer side.** A respondent's correction is recordable by construction (substrate guarantees); whether the issuer accepts the corrected fact for determination purposes is WOS governance. **Out of FW-0034 scope.** Named non-goal.
7. **The "narrow vs. substantive" predicate edge cases.** Some changes within `correctableFieldSet[]` may still be substantive (e.g., correcting a name from "John Smith" to "Jane Smith" — same field, different gender, may trigger different determination logic). **The §3.2 predicate handles by routing to amendment when the changed value flows into an issued determination.** Edge cases where the determination hasn't issued yet but the change is substantive — the runtime predicate cannot detect; the form author's `correctableFieldSet[]` declaration is the discipline. **Acknowledged design gap; mitigated by the form-author declaration discipline.**
8. **Withdrawal of consent vs. withdrawal of submission.** J-016 mentions both ("revoke the revocable consent" and "withdraw the submission"). FW-0034 covers submission withdrawal; consent revocation (e.g., GDPR Article 7 right to withdraw consent) is a distinct primitive — the EXT-5 queued `consent.revoked` event covers it. **Composition story deferred to a follow-on row** because consent-revocation interacts with regulatory clocks (GDPR, HIPAA, BIPA, CCPA) that FW-0034 design doesn't enumerate.
9. **PKAF downstream-assertion lifecycle propagation (§6.4 item 8).** Specific `rkaf:supersedesAssertion` + `rkaf:lifecycleEvent` composition for corrected records. **Follow-on Rulespec alignment row; not FW-0034's scope.**
10. **Appeal-flow integration.** WOS Appeal has its own `withdrawn` status; an appeal can be withdrawn by the appellant. Composition with FW-0034 deferred — appeals are a separate post-determination flow, not the respondent's three-act lifecycle.

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: three-act user-visible taxonomy (`correct` / `withdraw` / `dispute`); plain-language labels; vocabulary firewall | PROPOSAL | owner review |
| Q2: substrate-mapping predicate — `correctableFieldSet[]` narrow-correction allowlist + case lifecycle state-machine check (NOT determination-graph walk); routes to `correction` (Formspec §11.4) or `amendment` (Formspec §11.1) deterministically | PROPOSAL | owner review |
| Q3: runtime UX — extend FW-0039 `/status` route; "What you can do" panel with up to three buttons; form-policy `recordLifecycle` block | PROPOSAL | owner review + FW-0039 composition surface |
| Q4: receipt-chain visualization — additive timeline; honest reason rendering; FW-0049 mask composition; integrity-vs-operativeness distinct signals; posture-uniform tier deferred | PROPOSAL | owner review + FW-0049 composition |
| Q5: per-act tier axis (`correctable` × `withdrawable` × `disputable`) under web ADR-0011 | PROPOSAL | owner review + ADR-0011 evolution |
| Authority-ladder distinction in `withdraw` mapping: pre-determination = applicant authority (`applicant-withdrawn`); post-determination = applicant emits request (`rescissionRequested: true`), issuer authority to emit kernel `rescission` event | PROPOSAL (post-arch-review reshape Finding 1) | owner review |
| FW-0050 §5.2 per-signature-withdraw vs FW-0034 case-level-withdraw distinction (§7.4 case 3) | PROPOSAL (post-arch-review reshape Finding 2) | owner review + FW-0050 vocabulary reconciliation |
| EXT-5 per-party `partyRef` extension on `response.withdrawn` / `response.dispute-attached` + `rescissionRequested` intent flag on `response.withdrawn` | PROPOSAL | upstream extension queue + FW-0050 composition |
| EXT-35 — WOS `governance.recordLifecycle` form-policy block per §6.3 (with `preDeterminationKernelMode` + `postDeterminationIntent` authority-ladder split) | PROPOSAL | upstream extension queue (new — proposed) |
| XS-5 — cross-stack ADR confirming three-act mapping across formspec + WOS + trellis per §6.4 | PROPOSAL | stack-root review (new — proposed) |
| FW-0079 (proposed below) — posture-uniform verifier-grade tier deferred | DEFERRED | follow-on row when a real form needs it |

---

## Appendix B — Architecture review reshape log (2026-05-24)

The design landed 2026-05-24 then immediately ran the [`formspec-specs:semi-formal-architecture-review`](../../../.claude-plugin/) skill **inline** (no fresh subagent — flagged in handoff per the formspec-stack review-discipline rule; owner may elect to re-review with a fresh reviewer). Review surfaced three CONCERN findings (no BLOCKERS), all surgical reshapes resolved in-place:

| Finding | Severity | Resolution |
|---|---|---|
| **F1: Authority-ladder inversion in `withdraw → rescission` mapping** | CONCERN | RESHAPED §3.1 `withdraw` row + §6.4 XS-5 item 2 + EXT-35 `withdrawable` schema. Pre-determination = applicant authority emits `applicant-withdrawn` termination; post-determination = applicant emits `response.withdrawn` carrying `rescissionRequested: true` intent flag; issuer governance reviews and optionally emits the kernel `rescission` event. The respondent's surface never directly emits a kernel `rescission` event. EXT-35 schema split: `preDeterminationKernelMode: "applicant-withdrawn"` + `postDeterminationIntent?: "rescission-requested"` + `requiresIssuerAcceptance: true` (MUST when `postDeterminationIntent` configured). |
| **F2: FW-0050 §5.2 per-signature-withdraw vs FW-0034 case-level-withdraw conflict** | CONCERN | RESHAPED §7.4 case 3. Explicitly distinguishes "Withdraw my signature" (per FW-0050 §5.2 — per-party always, substrate rule, no `partyScope` axis) from "Withdraw this submission" (per FW-0034 §7.4 — configurable per-party-scope, default `all-parties-must-agree`). EXT-35 schema comment cites the distinction. |
| **F3: Internal contradiction in §3.2 predicate item 2 vs same-section alternative-rejected paragraph** | CONCERN | RESHAPED §3.2 predicate item 2. Determination-graph criterion replaced with state-machine check: "the case lifecycle state is not yet `decision-reached`" (queryable via existing `StatusReader` port from FW-0039). No determination-graph knowledge required in the runtime. |
| **F7: "verified ✓" / integrity-vs-operativeness clarity** | OPTIONAL | RESHAPED §5. Added integrity-vs-operativeness clarification paragraph. |

Reviewer findings F4, F5, F6 were OBSERVATION-class with KEEP recommendations (no reshape needed). The verdict moved from RECONSIDER to APPROVE-pending-owner-review after the in-place reshape.

---

## Appendix A — Proposed follow-on rows

| Row | What | Why deferred |
|---|---|---|
| FW-0079 | Posture-uniform receipt-chain visualization (Trellis Phase 2+ OC-26 substrate) | Base FW-0034 ships visible chain entries (SEC 10-K/A model); the posture-uniform tier requires Phase 2+ substrate and a real form demanding structural-indistinguishability. Land when both prerequisites exist. |
| FW-0080 (illustrative) | Consent-revocation flow under GDPR/HIPAA/BIPA/CCPA regulatory clocks | EXT-5 `consent.revoked` event covers the event; the regulatory-clock integration + per-regime notification mechanism is its own design row. |
| FW-0081 (illustrative) | Cross-agency referral notification on lifecycle event (FW-0029 post-submit symmetric) | FW-0029 owns the pre-submit warning; the post-submit notification mechanism is WOS governance + cross-agency referral substrate. Land when WOS reference adapter ships. |
