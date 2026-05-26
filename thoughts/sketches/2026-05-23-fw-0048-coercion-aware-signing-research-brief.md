# FW-0048 Coercion-aware signing — Research Brief

**Status:** Sketch / research artifact — **historical only** (parent FW-0048 / stack-root ADR-0156 withdrawn 2026-05-26). Not a design proposal or forward commitment.
**FW row:** [FW-0048 in `PLANNING.md:566`](../../PLANNING.md) (design); paired build row [FW-0059 at `PLANNING.md:673`](../../PLANNING.md).
**Journey:** [J-027 in `JOURNEYS.md:526`](../../JOURNEYS.md).
**Anti-patterns:** [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-021 in `JOURNEYS.md:173`](../../JOURNEYS.md).
**Feature key (proposed):** `duressAware` — see §4 for the alternative-evaluation against the existing `safeAddress` and `identityContinuity` keys per [web ADR-0011 line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md).

The headline finding: **the stack has no native duress primitive at any layer.** Trellis substrate has a *sidecar discipline* (§13 Disclosure Manifest, audience-scoped derived artifact) that the duress signal must ride on, but no `duress` semantics. Formspec has an EXT-5-queued `submission.duress-signaled` event slot in `respondent-ledger-event.schema.json` (already named, not yet shaped). WOS has no duress-aware decision branches. PKAF's `AccessScope` is access-control, not duress signaling. **External prior art is mature** — duress codes in physical security, banking, and personal safety apps — and is the design's grounding for the threat model.

The hardest finding: **the user-visible surface is the load-bearing constraint, not the substrate**. The cryptographic and sidecar mechanics are straightforward once the receiver-side semantics are settled. What's genuinely hard is the affordance: how does a person under coercion signal duress *without the coercer noticing*, *across the same input device the coercer is watching*, *without the absence-of-signal becoming itself a tell*? That is the question FW-0048 design must answer; everything else falls out from it.

---

## 1. Upstream Primitive Inventory

### 1.1 Trellis — no `duress` primitive; sidecar discipline available

| Primitive | File:line | What it does | Duress relevance |
|---|---|---|---|
| §13 Disclosure Manifest | [`trellis/specs/trellis-operational-companion.md:474`](../../../trellis/specs/trellis-operational-companion.md) | Audience-scoped derived artifact: `disclosed_fields`, `committed_only_fields`, `withheld_fields`. `audience` enum includes `foia_public`, `opposing_counsel`, `appellate_court`. | **The vehicle** for a duress signal. A duress-aware sidecar is one more `audience` class — `issuer_safety_team` — withholding the duress fact from the `respondent_facing_receipt` audience but disclosing it to the issuer's intervention pipeline. The substrate already supports the **asymmetric-visibility-by-audience** pattern; the duress sidecar is a configured instance of it. |
| OC-30 (independent auditability) | [`trellis/specs/trellis-operational-companion.md:496`](../../../trellis/specs/trellis-operational-companion.md) | Each redaction in a Disclosure Manifest MUST be independently auditable — auditor verifies commitment slots without needing plaintext. | **Load-bearing for verifier semantics.** A receipt that omits the duress signal must still be cryptographically valid; the duress signal must be a *withheld* field in the receipt's manifest, not absent from the canonical record. Otherwise the absence is observable. |
| OC-26 (slot population) | [`trellis/specs/trellis-operational-companion.md:472`](../../../trellis/specs/trellis-operational-companion.md) | Operators MUST populate redaction-aware commitment slots when admitting a record that may later be selectively disclosed. | **Implies the duress signal needs slot reservation at admit time** — slots cannot be retroactively reserved without envelope reissue (NON-CONFORMANT for Phase 2+). This forces the design: every submission of a high-risk template populates a duress-signal commitment slot whether or not duress was signaled, so the slot's presence is uniform across submissions. |
| Multi-signer events | [`trellis/specs/trellis-operational-companion.md:1340`](../../../trellis/specs/trellis-operational-companion.md) `append/029` fixture | Multi-signer cosignature already supported at byte level. | Not duress-relevant directly. Confirms substrate does not need new cryptographic primitives. |
| No `duress` term anywhere | grep `trellis/specs/` | confirmed absent | The duress concept is **upstream of Trellis** — Trellis carries the sidecar, but the meaning is set by Formspec / WOS layer. |

**Takeaway:** Trellis is the right place for the duress *sidecar* to live (audience-scoped, independently auditable, slot-reserved at admit time). The substrate does not need new cryptographic primitives. Phase 2 OC-26 + OC-27 + OC-30 already cover what's required.

### 1.2 Formspec — `submission.duress-signaled` already queued (named, not yet shaped)

| Primitive | File:line | Duress relevance |
|---|---|---|
| EXT-5 (queued) — ledger event taxonomy expansion | [`thoughts/specs/2026-05-22-upstream-extension-queue.md:73`](../specs/2026-05-22-upstream-extension-queue.md) | Event `submission.duress-signaled` enumerated as a Phase-1 addition to `respondent-ledger-event.schema.json`. Carries explicit annotation: "with private-sidecar discipline per `trellis-operational-companion.md` §13 Disclosure Manifest". |
| `respondent-ledger-spec.md` §6.7 (disclosure tier vs assurance) | [`formspec/specs/audit/respondent-ledger-spec.md:413`](../../../formspec/specs/audit/respondent-ledger-spec.md) | Disclosure tier (`anonymous` / `pseudonymous` / `identified` / `public`) is independent of assurance. Suggests a tier-aware reading of duress signals (an `anonymous` tier event still carries duress) but no duress-specific tier today. |
| `respondent-ledger-spec.md` §6.5 (source) | [`formspec/specs/audit/respondent-ledger-spec.md:339`](../../../formspec/specs/audit/respondent-ledger-spec.md) | `source.kind` enumerates `web | mobile | api | import | system-job | unknown`. **No`coercion-context` channel modifier.** The duress signal cannot ride on the source object today. |
| `respondent-ledger-spec.md` §6.8 (authored signatures vs recorded attestations) | [`formspec/specs/audit/respondent-ledger-spec.md:428`](../../../formspec/specs/audit/respondent-ledger-spec.md) | Ledger records lifecycle history; does NOT replace authored signature semantics. **Implies the duress mark is a ledger event, not a signature modifier.** The signature stays valid (so the receipt is not silently broken); the ledger records that the signature was issued under duress. |
| EXT-3 (queued) — `capacity` on AuthoredSignature | [`thoughts/specs/2026-05-22-upstream-extension-queue.md:47`](../specs/2026-05-22-upstream-extension-queue.md) | `capacity` enum: `self | poa | guardian | executor | parent | licensed-professional | corporate-officer | ai-agent`. **`coerced-self` is NOT in the enum** and should not be added there — capacity is a legal-role declaration the principal owns; duress is a signal *about* the act of signing, not a role-of-signer. Putting duress on the signature surface invites the coercer to read it. |

**Takeaway:** Formspec's queued surface (`submission.duress-signaled` event in EXT-5) is the right naming. The event-as-ledger-fact (rather than signature-modifier) is the architectural decision the upstream queue already encodes. The remaining design work is the **payload shape**, the **invocation surface**, and the **routing semantics** — all of which are FW-0048's scope.

### 1.3 WOS — no duress-aware decision branches

WOS Governance handles multi-actor case orchestration (kernel S10.1 `actorExtension`, applicant API with `actors[]`). The actor model is workflow-internal and has no notion of "submission flagged under duress." Two paths for the duress signal to reach WOS:

1. **Out-of-band routing target.** The issuer's safety team (a non-WOS-actor — often an external service: NCADV hotline, lawyer-on-call, victim-services coordinator) receives a notification keyed off the duress sidecar. WOS never sees the duress fact, just an issuer-configured downstream action. **Preferred for the duress posture** — minimizes the data surface that can leak.
2. **WOS actor extension.** Register a `safety-reviewer` actorExtension; the duress signal enqueues a WOS task for that actor. Adds WOS-side state that can be queried; also adds WOS-side state that can be polled by the coercer if the coercer has caseworker access (J-021 status surface is the existing risk).

The design's Q2 will pick between these (see §5). FW-0048's MVP-feasible routing is path (1) — pure issuer-side webhook / out-of-band; WOS-integrated routing is a follow-on.

| Primitive | File:line | Relevance |
|---|---|---|
| `actorExtension` seam | `work-spec/specs/kernel/spec.md:103` (S10.1) | Path for registering a `safety-reviewer` actor type if WOS-side routing is chosen. **Defer to FW-0059 build.** |
| Applicant status surface | `work-spec/specs/api/applicant.md` | The duress signal **MUST NOT** be observable in the applicant status surface — a coercer with respondent's credentials should not be able to verify whether duress was signaled. Per-party scoping (FW-0050 §7.2) composes here. |

### 1.4 PKAF — `AccessScope` is access-control, not duress

PKAF's `rkaf:AccessScope` ([`PKAF/spec/rkaf-core.md:140`](../../../PKAF/spec/rkaf-core.md)) narrows visibility of evidence-bindings to consumer classes. It is **not** the duress vehicle — `AccessScope` is a static authorization declaration; duress is an event-time signal. There may be a downstream binding (a duress-signaled submission could carry an `AccessScope` restricting the assertion to a `safety-team` consumer class), but the source of the duress mark is the ledger event + Trellis sidecar, not PKAF's authorization model.

**Out of scope for FW-0048 design.**

### 1.5 web ADR-0011 capability table — does an existing key cover duress?

[Feature Ownership Table at line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md):

| Existing key | Does it cover duress? | Why |
|---|---|---|
| `safeAddress` | **No.** | Safe-address is field-level redaction of *known-protectable* values (home address, employer). Duress is an *event-time signal* by the respondent, not a field marking. |
| `identityContinuity` | **No.** | Identity continuity is "the IdP can maintain a session with assurance"; orthogonal to "this signing act was coerced." |
| `recordLifecycle` | **No, but adjacent.** | Lifecycle events cover correction / withdrawal / dispute / revocation — *post-signing* changes. Duress is a *signing-time* signal that, if surfaced to the issuer, *triggers* a lifecycle action. The duress signal is the input to a `response.flagged-for-safety-review` lifecycle event; the lifecycle event itself is a `recordLifecycle` concern. |
| `multiParty` | **No, but composes.** | Per FW-0050 §7.2, the multi-party variant requires per-party duress scoping. `multiParty` doesn't *cover* duress; it *composes* with it. |

**Conclusion:** FW-0048 proposes a new `duressAware` capability key under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Design doc §6 makes the case.

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0048 |
|---|---|---|
| **FW-0008** Signer ceremony | [`PLANNING.md:237`](../../PLANNING.md) | Signing ceremony is the **invocation surface** for the duress signal. Per-field affirmative-action is the existing mental model; the duress affordance must fit beside it without becoming a fourth click the coercer notices. **Hard binding.** |
| **FW-0038** Lifecycle (amend / withdraw / dispute) | [`PLANNING.md:451`](../../PLANNING.md) | **Duress = lifecycle input, not lifecycle action.** A duress-signaled submission triggers issuer-side quarantine + safety routing, which the issuer can convert into a withdrawal / dispute via FW-0038's machinery. FW-0048's duress signal is the *upstream cause*; FW-0038 is *one downstream consumer*. |
| **FW-0049 / FW-0060** Safe-address | [`PLANNING.md:577`](../../PLANNING.md), `:683` | **Adjacent but distinct.** Safe-address protects known-protectable fields from disclosure; duress signals respondent-side coercion at signing time. Both ride Trellis §13 sidecar discipline; both fail-closed under web ADR-0011. **They share the substrate, not the surface.** |
| **FW-0050 / FW-0061** Multi-party | [`PLANNING.md:587`](../../PLANNING.md), `:693` | **FW-0050 §7.2 explicitly delegates per-party duress sidecar shape to FW-0048.** Multi-party composes: Party B's duress signal must not be observable to Party A; per-party-scope on the sidecar (not per-form). **FW-0048 is the canonical owner of the single-party sidecar shape; FW-0050 instantiates it per-party.** |
| **FW-0028** Passkey / WebAuthn | [`PLANNING.md:355`](../../PLANNING.md) | **Strong composition.** A passkey ceremony with `userVerification: required` gives a per-act authentication moment that a coercer cannot trivially replay. Duress affordance can fit inside the WebAuthn flow (e.g., duress PIN at the OS prompt, two-PIN-options affordance the coercer interprets as "first one was wrong"). |
| **FW-0021** Post-submit status | [`PLANNING.md:316`](../../PLANNING.md) | **Risk surface.** If the status surface shows "your submission is under safety review" the coercer sees the trigger. Status copy MUST be identical between duress-signaled and non-signaled paths. FW-0021's existing wording per AP-013 (no "something went wrong") composes — neutral plain-language status is the discipline. |
| **FW-0030** Federated identity | [`PLANNING.md:376`](../../PLANNING.md) | **Cross-IdP composition.** Duress signaling via a passkey is local to the device; duress signaling via federated IdP (Login.gov / ID.me) depends on the IdP exposing a duress channel (most do not). FW-0048's design must work with at least one IdP path; whichever IdPs honor duress signals is the FW-0030 layer's concern. |

---

## 3. Threat-Scenario Walkthrough (3 grounded scenarios)

### 3.1 Domestic abuse — signature on a power-of-attorney

- **Setting.** Survivor at home; abuser present; tablet handed over for signature. Bank or attorney sent a financial POA for the survivor to sign giving abuser control over a joint account. Form is hosted by the bank's intake portal.
- **What the abuser observes.** The full screen, the kept tab order, any modals, network activity (in some cases). Notification on the survivor's phone may also be visible.
- **What the abuser cannot force.** Per-act WebAuthn authentication on the survivor's device (passkey requires user-presence). The survivor's own choice of PIN / biometric. The contents of the *receipt* the survivor receives — *if the receipt is silent about whether duress was signaled*.
- **What the survivor needs.** A signing path that produces a real-looking signed receipt the coercer can verify *appears* successful, while signaling to the issuer's safety team that the submission was coerced. **Activation must be invisible at the surface; verifiable at the issuer's downstream pipeline.**
- **Design implications.** This is the canonical scenario. The duress affordance is some action the survivor takes during the signing ceremony that is indistinguishable from the normal-success path to a shoulder-surfer. Candidate primitives: duress PIN (a second PIN that "succeeds" but flags); long-press affordance on a passkey button; deliberate-misuse-of-a-confirmation-step (e.g., survivor enters their normal PIN twice; second entry is a duress code).

### 3.2 Trafficking / labor coercion — immigration sponsorship signing

- **Setting.** Trafficked person, handler present, immigration form (I-130 beneficiary side). Handler claims to be the sponsor's attorney.
- **What the handler observes.** Full ceremony; may control the device (it is theirs).
- **What the handler cannot force.** Out-of-device authentication if the survivor has a separate phone or a recovery-channel email under their control (often unavailable in trafficking situations).
- **What the survivor needs.** An out-of-band duress channel that does not require the survivor to physically operate the trafficker's device. Could be a recovery flow ("forgot signature device") that routes the user through victim services. Could be a designed "preview the document elsewhere" step that lets the survivor open a side-channel to a safety contact.
- **Design implications.** The scenario reveals that **in-flow duress affordances alone are insufficient**. FW-0048 design must declare what's in-scope (in-flow duress signaling on a controlled device — the canonical case) and what's out-of-scope (recovery-channel signaling on an uncontrolled device — a separate problem class, defer to FW-0030 federated identity recovery).

### 3.3 Elder coercion — benefits redirect by predatory "helper"

- **Setting.** Elder; nephew or "Medicare counselor" present; benefits-redirect form pointed at a fraudulent payee account. The form is a real government form on a real government portal.
- **What the predatory party observes.** Full ceremony; often the elder hands them the device.
- **What the elder cannot force.** A clear understanding of what they are signing, or an awareness that the predatory party is misrepresenting the form's purpose. **Coercion in this scenario is often subtle / informational, not physical.**
- **What the elder needs.** An out-of-band confirmation channel the predatory party is not invited to. A delayed signing path ("take it home, sign privately, cool-off window the sender cannot disable" per J-027). An issuer-side fraud-pattern detector that triggers a follow-up call when payee changes look anomalous.
- **Design implications.** Some elder-coercion scenarios are addressable via the in-flow duress affordance (a "this isn't actually what I want to be signing" signal), but many are addressable only via *out-of-flow controls* (cool-off windows, secondary confirmation, fraud-detection at the issuer). FW-0048 design must distinguish: in-flow duress signal (this row) vs out-of-flow consent friction (cool-off windows, etc. — separate concern, possibly its own FW row).

---

## 4. Open Scope Questions for Brainstorm

Prioritized — ask the first 3-4 before the rest.

### Top 4 to ask first

**Q1. Detection surface — which primitive?**

Five candidates, very different threat-surface properties:

1. **Duress PIN at signing.** Respondent enters a different PIN; ceremony succeeds visibly; duress flag set in ledger sidecar. **Pros:** invisible to coercer; familiar from banking. **Cons:** requires pre-enrollment of a duress PIN (the coercer might be present during enrollment too); a coercer who knows the duress-PIN concept can compel the "non-duress" PIN.
2. **Long-press / hold-to-sign duration.** Different signature-button hold-times signal duress vs normal. **Pros:** no pre-enrollment. **Cons:** coercer with stopwatch awareness; accessibility-hostile (motor-impairment users cannot reliably distinguish hold times); too discoverable in documentation.
3. **Deliberate use of a "wrong" element.** Press a labeled-mundane button (e.g., the "review the document one more time" button at the moment of signing). **Pros:** invisible by camouflage. **Cons:** discoverable in source code; coercer who has read the docs can see which button is the duress signal.
4. **Out-of-band channel during signing.** A recovery flow (forgot PIN, identity verification challenge) routes through victim services. **Pros:** no in-flow tell. **Cons:** requires uncontrolled device or off-device path; doesn't help the canonical "on the coercer's tablet" scenario.
5. **Passkey-bound: WebAuthn `userVerification: required` + duress credential.** Respondent enrolls TWO passkeys; one normal, one duress. WebAuthn ceremony lets the user pick. **Pros:** cryptographically clean; survives passkey-protocol changes; works cross-device. **Cons:** requires advance enrollment of two passkeys (coercer-present-at-enrollment risk); UI must not visibly distinguish the two during selection.

**→ Drives the entire design.** No upstream primitive forces a choice; FW-0048 design has to pick.

**Q2. Activation visibility — same-success-path or differentiated-success-path?**

- **Same-success-path.** The duress flow ends with an identical receipt the coercer sees (down to the byte / display); duress fact lives only in the issuer-side sidecar, never in the public receipt. **The strict invisibility posture.** Required for the canonical domestic-abuse scenario.
- **Differentiated-success-path.** The duress flow looks slightly different — a delayed receipt, a "you'll receive a confirmation by email" copy that wasn't there before. **Detectable by an observant coercer.** Rejected for the canonical scenario but might fit niche cases.

**→ Drives whether the receipt is byte-identical or merely outwardly-identical.** Strong default: **same-success-path** per J-027 ("the system is on the respondent's side when the room isn't"). Receipts must be byte-identical to the non-duress path; the duress fact lives only in the issuer-side sidecar / commitment slot.

**Q3. Routing — issuer-side only, WOS-integrated, or both?**

- **Issuer-side only (MVP-tier).** Duress signal fires an issuer-configured webhook (NCADV hotline, internal safety team, lawyer-on-call). WOS never sees the duress fact. **Smallest data surface; lowest cross-stack lift.**
- **WOS-integrated (asymmetric-tier).** Register a `safety-reviewer` WOS actorExtension; duress enqueues a WOS task. **Adds case-state surface that supports audit but increases observability risk** (a coercer with caseworker access could query).
- **Both, with form-policy axis.** Form declares which routing tier it requires.

**→ Drives the cross-stack dependency chain and the MVP-tier-vs-WOS-tier-split.** Default proposal: **issuer-side only is MVP; WOS-integrated is a follow-on**, mirroring FW-0050 §2.4 Q4.

**Q4. Receipt-side semantics — silent withhold or committed-only with safety-team disclosure?**

Per Trellis OC-26 (slot population) the duress-signal commitment slot must be populated at admit time *whether or not duress was signaled* (uniform slot presence prevents the slot's absence from being observable). The question is: what does the slot encode?

- **Boolean signal (`duress = true | false`).** Simplest. Cryptographically: a commitment to a boolean; the issuer's safety team sees `true` only when applicable.
- **Always-present commitment with optional disclosure.** The slot always carries a commitment to a tuple `(duress_signaled, severity_band, routing_target)`. The Disclosure Manifest withholds it for `respondent_facing_receipt`; reveals it for `issuer_safety_team`. Richer, but more bits exposed in the always-committed payload.
- **Per-routing-target encrypted payload.** The duress signal is HPKE-wrapped to the safety-team recipient; the bytes ride the slot but only the safety-team can decrypt. **Strongest opacity to a coercer with chain access; depends on EXT-18 HPKE-wrapper.**

**→ Drives the cryptographic boundary and EXT-18 dependency.** Default proposal: **HPKE-wrapped payload** for high-risk templates; **boolean signal** for lower-risk variants — form-policy axis under web ADR-0011.

### Next 4 (ask after the framing 4)

**Q5. Recovery semantics — silent invalidate, quarantine for issuer review, or proceed-with-flag?**

Three semantics:

1. **Silent invalidate.** Submission is voided server-side; respondent shown a "your submission was received" message that's actually a lie. **Maximally invisible to coercer; maximally adversarial-to-respondent-who-genuinely-wants-to-sign.** Rejected.
2. **Quarantine for issuer review.** Submission lands but is held; issuer's safety team reviews before processing. **Better; matches J-027 "routes to issuer-defined victim services without halting the form."** Preferred.
3. **Proceed with flag.** Submission processes normally; flag is internal-only for analytics. **Weakest; coercer wins.** Rejected.

**Default: quarantine.**

**Q6. Conflicting evidence — duress signaled but form content does not corroborate?**

If duress is signaled but the form contains pristine signatures and no contradictions, does the issuer treat the duress signal as authoritative (assume coercion) or as one input among several? **Default: authoritative.** A duress signal triggers safety review unconditionally; the issuer does not get to dismiss it based on form content.

**Q7. Per-party scoping (FW-0050 §7.2 binding)**

In a multi-party flow (joint custody, joint financial), the duress sidecar must be **per-party**: Party B's duress signal must not be observable to Party A. The FW-0050 design declares this requirement; FW-0048 must specify the sidecar shape so that per-party scoping composes cleanly. **Hard binding — covered in design §7.**

**Q8. Cross-jurisdictional admissibility**

A duress-signaled submission's legal weight varies: some jurisdictions admit duress-signaled signatures as voidable; others treat them as valid-pending-investigation; others require additional procedural steps. **Out of scope for FW-0048 design; flag for jurisdiction-specific compliance review at FW-0059 build.**

---

## 5. Honesty Note: What This Row Can and Cannot Do

**Can:**

- Specify the duress sidecar shape (the EXT-5 `submission.duress-signaled` payload).
- Specify the activation surface (Q1 — which detection primitive).
- Specify the receipt-side semantics (Q4 — silent withhold vs HPKE wrap).
- Specify the routing semantics (Q3 — issuer-side webhook vs WOS-actor).
- Specify the cross-party visibility model (Q7 — per-party scoping for FW-0050 composition).
- Propose the `duressAware` capability key under web ADR-0011.

**Cannot:**

- Solve the "coercer present during enrollment" attack. **Some coercion scenarios are fundamentally out of reach of any device-bound duress affordance**; the design must say so honestly.
- Address informational coercion (the elder-scenario subset where the survivor doesn't understand what they're signing). **Different problem class — cool-off windows, secondary confirmation; a separate FW row.**
- Resolve jurisdictional admissibility of duress-signaled signatures. **Legal-counsel work; out of scope.**
- Ship the production implementation. **That's FW-0059.**
- Address coercion that happens *after* signing (retroactive repudiation). **Belongs to FW-0038 (amend / withdraw / dispute).**

The honest split: FW-0048 covers **(a) signing-time coercion** (signer under duress) and **(b) pre-signing coercion that the signature is the moment to signal** (form filled under duress; signature is the survivor's first private moment to flag). It does NOT cover **(c) post-signing coercion** (FW-0038) or **(d) informational coercion / consent failure** (separate row).

---

## 6. External Prior Art

Cited so the design is grounded in real prior art, not invented in isolation. **All references load-bearing for design §3; verify before relying.**

### 6.1 Duress codes — physical / banking

- **Duress PIN at ATM.** Long-promised, rarely implemented in production. Cited reference: "ATM Safety PIN," US patent application filings late 1990s through early 2010s; no jurisdiction has mandated it; banks have not voluntarily adopted it. The *reason for non-adoption* is itself a relevant design signal — the affordance is widely known so a sophisticated coercer can compel the non-duress PIN. ([Wikipedia: ATM SafetyPIN software](https://en.wikipedia.org/wiki/ATM_SafetyPIN_software) summarizes the dynamic — verify the page exists and currency before citing.)
- **Bank-teller silent alarm.** Mature; the J-027 metaphor comes from here. The teller's affordance is a foot pedal or a discreet keystroke combination invisible to the customer; the alarm rings at the security desk, not the teller's counter. **The right metaphor for FW-0048.**
- **Alarm-system "duress code."** Major alarm vendors (ADT, Vivint, Brink's) sell duress codes that disarm the alarm normally but silently dispatch police. **Mature; documented in user manuals; well-tested in domestic-violence scenarios.** Industry reports (e.g., NDC duress-code literature) consistently note the same threat model as the FW-0048 scenarios.

### 6.2 Personal safety apps

- **bSafe, Noonlight, ASPire (NCJFCJ).** Personal safety apps with a panic affordance: tap-and-hold a button, double-tap the power button, or a specific gesture. Many use **deceptive UI** — apps that look like calculators or notes, with the panic action triggered by an unusual sequence. Relevant for the elder-coercion scenario (apps disguised as other apps).
- **Aspire News (NCADV).** Phone app for domestic-violence victims with disguised UI (looks like a news app). Documents the disguised-affordance pattern.
- **Apple iOS "Emergency SOS."** Hold side + volume button; iPhone calls emergency services. Has a "stop sharing my location to emergency contacts" toggle for after-the-fact reversal. **The platform-native pattern** that FW-0048 must coexist with — if respondent's iPhone has Emergency SOS configured, a form-level duress affordance is redundant for some scenarios.

### 6.3 Cryptographic protocols — dual-PIN / coercion-resistant signing

- **Voting protocols with coercion resistance.** Civitas, JCJ-style protocols. Academic literature (Juels–Catalano–Jakobsson 2005). Receipt-free voting and coercion-resistant voting are well-studied; the formal definitions are useful but the implementations are voting-specific and don't trivially map to form signing. Relevant for the receipt-side discipline (the receipt must not reveal the duress fact).
- **WebAuthn `userVerification` semantics.** [W3C WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/) defines `userVerification: required`, `preferred`, `discouraged`. A passkey ceremony with `userVerification: required` requires a per-act authentication (biometric / PIN / pattern); per-act authentication is hostile to coercion-replay but does not natively support a duress PIN. There is no standardized WebAuthn "duress credential" today. FW-0048 design's Q1 candidate-5 (dual-passkey enrollment) would be a *convention* on top of WebAuthn, not a protocol extension.
- **Dual-key signing schemes (hidden-revocation tokens).** Cryptographic literature on "designated verifier signatures" and "deniable authentication" provides primitives that produce signatures whose authenticity is verifiable by one party but not by others. **Not directly applicable** to FW-0048 — the issuer is the verifier in both signed-under-duress and signed-freely paths; the asymmetric-verifier model is between issuer and observer. Closer to the right framing is **selective disclosure** (Trellis §13) over a duress-signaled commitment.

### 6.4 Safety-by-design / "trauma-informed UX" literature

- **"Designing for Safety"** by Eva PenzeyMoog (Rosenfeld Media, 2021). Catalog of UX patterns for safety, including duress signaling, exit-now affordances, and disguised UI.
- **NIST SP 800-63B-3 — Digital Identity Guidelines.** Defines authentication assurance levels (AAL). Useful for FW-0048's composition with FW-0028 (passkey) and FW-0030 (federated identity); does NOT define duress.
- **HHS / NCADV technology-safety guidance.** [Safety Net (NNEDV)](https://www.techsafety.org/) project publishes guidance for tech-aware DV organizations. Recurring theme: "absence of normal app behavior is a tell." Reinforces Q2 same-success-path discipline.

---

## 7. Quick-Reference Anchor List

For the brainstorm — open these in order if a question goes deep:

1. [Journey J-027 — `JOURNEYS.md:526`](../../JOURNEYS.md) — the user story
2. [Anti-pattern AP-014 — `JOURNEYS.md:131`](../../JOURNEYS.md) — the prohibition
3. [FW-0048 row — `PLANNING.md:566`](../../PLANNING.md) — current state
4. [FW-0059 build row — `PLANNING.md:673`](../../PLANNING.md) — what this design feeds
5. [FW-0050 §7.2 — `thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md:297`](../specs/2026-05-23-fw-0050-multi-party-submission-design.md) — the multi-party delegation
6. [EXT-5 `submission.duress-signaled` — `thoughts/specs/2026-05-22-upstream-extension-queue.md:67`](../specs/2026-05-22-upstream-extension-queue.md) — queued ledger event
7. [Trellis §13 Disclosure Manifest — `trellis/specs/trellis-operational-companion.md:474`](../../../trellis/specs/trellis-operational-companion.md) — sidecar discipline
8. [web ADR-0011 Feature Ownership Table — `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md:129`](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — capability key home
