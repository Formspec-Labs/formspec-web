# FW-0049 — Safe-address handling: design proposal

**Date:** 2026-05-23
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q4 are open until accepted. **Safety-critical row** — review discipline strict.
**Row:** [FW-0049 in `PLANNING.md:579`](../../PLANNING.md) (design); paired build row [FW-0060 in `PLANNING.md:676`](../../PLANNING.md).
**Journey:** [J-037 in `JOURNEYS.md:651`](../../JOURNEYS.md).
**Anti-patterns:** [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md).
**Feature key (already enumerated):** `safeAddress` per [web ADR-0011 Feature Ownership Table line 147](../adr/0011-runtime-feature-resolution-and-policy-gates.md). FW-0049 codifies the shape.
**Source brief:** [`thoughts/sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md`](../sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md). Upstream-primitive inventory, threat scenarios, FW interactions, and external prior art live there; this doc decides over them.
**Multi-party hook:** [FW-0050 design §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) explicitly cites this row as the safe-address-class-taxonomy source. §7 below satisfies the right half of the FW-0050 composition rule.
**Coercion-adjacent hook:** [FW-0048 design §1.2 + §6.3](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion is event-time, safe-address is field-level; adjacent but distinct substrate paths. Composition pattern noted in §7.3.

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for safe-address handling on forms where protected parties' truthful answers (home address, phone, employer) would endanger them per [FW-0049 Done](../../PLANNING.md). Deliverables: framing decisions (Q1–Q4), the `safeAddress` capability contract under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md), the field-level class taxonomy and substitution-rule shape, the runtime render discipline, the receipt-side audience contract, the verifier discipline, the failure semantics, the multi-party composition with FW-0050, and the cross-stack dependency chain. This is a **design row**; the build is [FW-0060 in `PLANNING.md:676`](../../PLANNING.md).

**Substrate-status disclaimer.** FW-0049 design presumes [stack-root ADR-0074](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)'s Decision shape (`accessControl.class` + Access-Class Registry + Privacy Profile sidecar + bucketed Response + Phase 5 Emission). **ADR-0074 status is currently Proposed, not Accepted.** Promotion to Accepted is upstream work; if ADR-0074 reshapes in flight, FW-0049's substrate references (especially §3.1, §3.2, §6.3, §6.4) follow. The Access-Class Registry companion (`formspec/specs/registry/access-class-registry.md`) and Privacy Profile sidecar (`formspec/specs/privacy/privacy-profile.md`) are proposed in ADR-0074 §"Companion artifacts" but **not yet authored**; EXT-31 + EXT-32 land into files that the ADR-0074 promotion path must author first.

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. FW-0060 owns build.
- **Authoring the upstream spec.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web consumes upstream primitives, does not invent them. This doc proposes Access-Class Registry entries + Privacy Profile defaults + an EXT-1 reconciliation from the consumer perspective, does not author the registry / sidecar / schema changes themselves.
- **Per-jurisdiction substitute-address registries.** 40+ U.S. states with ACP; varying federal and non-U.S. regimes. Per-jurisdiction substitution authority + validation is a **deployment concern** (issuer-side adapter), similar to FW-0048's safety-team recipient registry (EXT-30). The design specifies the *mechanism* (class declaration + substitution rule + receipt-side redaction); the per-regime registry lands per deployment.
- **Document-side redaction for uploaded supporting documents.** J-040 names "addresses on a document where J-037 applies." Document image masking / OCR redaction is a different mechanism than form-field redaction. **FW-0040's scope, not FW-0049's.** Composition seam noted in §5.3.
- **The employer-correlation attack class.** A DV survivor whose employer is known to the abuser cannot fully protect their address via address-substitution if the abuser correlates via employer disclosure. **Out of any field-level mechanism's reach.** §8 documents and bounds.
- **Cryptographic implementation of Phase 2 commitment slots.** Trellis substrate, separate track. This doc specifies the consumer-side dependency surface; Trellis Phase 2 substrate is upstream.
- **Production-grade form-load substitute-address validation.** A form that requires `safeAddress` must validate that an entered substitute address is real (rejecting `123 Fake St`). The validation port lives in FW-0060 build; this doc names the seam.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Coverage classes

| Class | Description | Owned by |
|---|---|---|
| **(a) Field-level known-protectable values** | A field whose truthful value is structurally protectable (home address of DV survivor / witness-protection participant / similar). The form has the field; the value exists; the protected party needs the substitution + redaction surface. | **FW-0049 (this row)**. Canonical case. |
| **(b) Multi-party per-party field protection** | A field in a multi-party flow that is per-party-scoped AND protectable (one parent's address protected from the other parent). | **FW-0049 × FW-0050 (this row + multi-party composition)**. §7 satisfies. |
| **(c) Document-side protected content** | A supporting document upload (utility bill, lease, court order) containing protected addresses or other `protected`-class values that must be redacted from the document image / OCR text before submission. | **FW-0040 (file upload)**. Out of scope here. |
| **(d) Inference attacks on derived fields** | A derived value (city from address, region from ZIP, distance from a landmark) that leaks the protected value via inference. | **FW-0049 (this row)**, partial — see §3.2 + §8 for the cascading-class rule and its limits. |
| **(e) Out-of-band correlation attacks (employer-known-to-abuser)** | The address is protectable on paper but discoverable via correlation with non-protected fields (employer disclosed → address inferred). | **Out of FW-0049's reach** — fundamental threat-model gap. §8 documents. |
| **(f) Metadata-layer leaks** | Response-timing, network-jitter, IP-binding, ACP-registration-window correlation. | **Out of FW-0049's reach** — orthogonal threat model. |

### 2.2 Attacker model

- **Attacker identity.** A party seeking to locate the protected respondent — abuser, stalker, trafficker, hostile family member, opposing party in a custody case, predatory data broker, FOIA-style record-public requester.
- **Attacker goal.** Recover the protected value (most commonly home address) from any artifact the form produces.
- **What the attacker observes.** The public receipt (if obtained — receipts are designed to be portable, so an attacker may obtain via litigation, FOIA, social engineering, or the survivor's own forwarding); the post-submit status surface (if accessed via the survivor's own account that the attacker compels access to); any FOIA disclosure or public-record release; the verifier output (if the attacker verifies the receipt); the screen the survivor is filling on (if shoulder-surfing, screen-sharing accident, or attacker presence per FW-0048's threat model).
- **What the attacker cannot force.** The decryption of fields wrapped to an audience the attacker is not part of (per ADR-0074 bucketed-Response discipline). The opening of a Phase 2 commitment slot when the commitment was made over a value the attacker does not possess.
- **What the attacker knows.** Kerckhoffs-style — the attacker has read the FW-0049 design doc; knows safe-address exists, knows substitute-address regimes exist, knows the receipt redacts safe-address fields. **The defense rests on cryptographic opacity + structural indistinguishability**, not on the affordance being secret.

### 2.3 Three grounded scenarios

Each scenario gives: the setup, what the safe-address mechanism must achieve, what this design's posture provides.

**2.3.1 Domestic-violence survivor — benefits application.** Survivor enrolled in California's Safe at Home program; applying for state Medi-Cal benefits. Form has standard "home address" + "mailing address" + "phone" + "employer" fields. The survivor's truthful home address would endanger them if obtained by the abuser via subpoena, FOIA, or social engineering on the agency.
- **Required:** the form accepts the California SoS-issued substitute address (PO Box per Govt. Code §6206), routes the substitute to the public-receipt + FOIA-disclosable audience, routes the truthful address only to the verification-authorized eligibility audience, ensures the receipt structure is identical to a non-ACP submission's receipt (no inferential tell).
- **Design posture:** §3 framing decisions; class declaration on the field per §3.1; runtime substitute-address acceptance per §3.2 substitution semantics; bucketed-Response wire-shape per §3.4 routes the truthful value to the issuer audience only; receipt-side commitment-with-proof per §3.4 + §4 carries verifier-grade evidence without plaintext. **Canonical scenario; design optimizes for this.**

**2.3.2 Witness-protection participant — state tax filing.** Federal Witness Security Program participant filing a state tax return. State requires residence address for tax-jurisdiction determination; the participant's true residence is structurally protected by the US Marshals Service.
- **Required:** the form mechanism works for a federal protection regime (different substitute-address authority than state ACP); the per-state tax-public-record disclosure rules respect the redaction.
- **Design posture:** **same mechanism**; the substitute-address registry is per-jurisdiction (deployment concern per §1.2; the substitute is supplied by USMS coordination rather than state SoS). The receipt-side audience contract is identical to 2.3.1. **Full coverage at the mechanism level; per-regime registry is deployment work.**

**2.3.3 Child-custody case — multi-party composition with FW-0050.** Joint child-custody filing; Parent A is a DV survivor (ACP-protected); Parent B is the survivor's former abuser. Custody form has shared fields (children's names, custody schedule) and per-party fields (each parent's address).
- **Required:** file jointly without Parent B seeing the survivor's truthful address. Per FW-0050 §7.1: "survivor parent's safe-address-protected home address must not be visible to the co-parent."
- **Design posture:** **composition test for FW-0049 × FW-0050.** Parent A's address field carries `accessControl.class: "protected"` (§3.1; optionally `subjectKind: "address"` for renderer mask-text); the FW-0050 `visibleTo[]` on that field is `[parentA.roleId]` (excludes parentB); the resolver intersects the `protected`-class audience policy (excludes public-receipt) with the multi-party visibility (excludes parentB). The composition falls out of the substrate per §7.1; no new rule needed. **Canonical multi-party scenario; design composes cleanly.**

**Implication for the design:** FW-0049's posture is **optimized for scenarios 2.3.1 + 2.3.2 (single-party safe-address), composes cleanly with FW-0050 for 2.3.3**. Honest gaps are §8.

### 2.4 Out-of-scope coercion patterns

Named explicitly so the design isn't read as covering them:

- **Employer-correlation attack.** The abuser knows the survivor's employer; the employer's location is publicly known; the survivor's commute pattern narrows the search radius. **Out of FW-0049's reach.** Mitigation requires `accessControl.class: "protected"` declarations on BOTH the address field (with `subjectKind: "address"`) AND the employer field (with `subjectKind: "employer"`) AND the survivor's lived-reality permitting employer concealment (often not the case if the form requires verified employment).
- **Metadata-leak via submission timing / network attributes.** A receipt's structural-indistinguishability addresses the bytes; an attacker correlating submission timing with known ACP-program-registration windows could infer protection. **Out of FW-0049's reach.**
- **Compromise of the issuer's audience-key.** If the abuser compels the issuer (subpoena, insider attack), the ciphertext can be opened. **Out of any field-level mechanism's reach.** Mitigation lives in the issuer's operational security; FW-0049 documents the dependency.
- **Document-side leaks** (e.g., the survivor uploads a utility bill image whose address text is OCR-readable). **FW-0040's scope.**

## 3. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 3.1 Q1 — Class taxonomy: single closed class `protected` with renderer-only `subjectKind` discriminator

**PROPOSAL (reshape 2026-05-25 per ADR-0157 §3 + §9 B.2).** Register a single class token in the Access-Class Registry companion ([stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)):

| Class token | Covers | Substitution-rule shape |
|---|---|---|
| `protected` | Any field whose truthful value would endanger or relocate the respondent if disclosed to an unauthorized audience — addresses, contact endpoints, employer identity, and any future subject category requiring the same audience-restriction discipline | Deployment-resolved per `SafeAddressDirectory` (validator port; see §4.2). The per-subject substitution heterogeneity (state-ACP PO Box vs phone-relay vs heterogeneous employer concealment) is the validator's concern, not the registry's. |

**Substrate carries one bit.** The class token is the only access-control surface reaching any chain-observable artifact: the receipt, the verifier output, the Disclosure Manifest, the commitment-slot binding, the export bundle. To an adversary reading public bytes, every protected field is one bit (this field carries the protected class). The earlier shape's 3-way split would have made the class token itself a 2-bit oracle ("this submission carries a `safe-employer` field" narrows the adversary's correlation surface in exactly the population the pipeline exists to protect).

**Renderer-only `subjectKind` discriminator.** Authoring tooling and rendering surfaces that need a finer-grained discriminator (e.g., to pick a mask label like "Protected Address" vs "Protected Employer") read it from **field-level Definition metadata called `subjectKind`**. The taxonomy is **closed**: `address | contact | employer`. The `subjectKind` value MUST NOT appear in the receipt, the verifier output, the Disclosure Manifest, the commitment-slot binding, the export bundle, or any other chain-observable artifact — it is renderer-only. A deployment whose forms can render mask copy from field-name context alone MAY omit `subjectKind`; the pipeline does not require it.

**Substitution rules are per-validator, not per-class.** The validator port (`SafeAddressDirectory`, §4.2) accepts a candidate substitute value plus a jurisdiction + subject context. Per-subject heterogeneity (state-ACP PO Box semantics for an address field; relay-service semantics for a phone field; "decline to disclose" semantics for an employer field) lives inside the validator's per-deployment configuration. The class token does not need to encode that heterogeneity.

**Justification.** J-037 names "home address, phone, employer" as protectable; the canonical scenarios (§2.3) protect addresses primarily. ADR-0157 §3 + §9 establishes the substrate-anti-tell principle: the receipt must not reveal *what kind of protection* is in play. A multi-class taxonomy that the substrate carries would leak the kind of protection on every chain-observable artifact, violating the very rejection the safe-address feature exists to enforce.

**Alternative rejected: three-class taxonomy (`safe-address`, `safe-contact`, `safe-employer`).** Prior shape of this design (pre-2026-05-25 reshape). Rejected because the class token reaches the substrate, and the 3-way split is therefore a 2-bit oracle to any adversary. The per-subject substitution-rule heterogeneity — the earlier justification for splitting — survives intact at the validator tier (see `SafeAddressDirectory`, §4.2) without paying the substrate-leak cost. See ADR-0157 §9 for the cross-stack rejection.

**Alternative rejected: jurisdiction-keyed enumeration (`safe-address-CA-ACP`, `safe-address-WA-ACP`, etc.).** Considered to let the registry encode per-jurisdiction substitution rules at the class level. Rejected because: (a) it would force the registry to track every jurisdiction's program in the class taxonomy (40+ states + federal + non-U.S.); (b) the cross-jurisdiction movement case (survivor relocates from CA to WA) would force a class change for the same field, semantically nonsensical; (c) the per-jurisdiction substitution authority belongs at the **deployment audience policy + the substitute-address validation adapter**, not in the field's class. The class names the *category*; the deployment names the *regime*.

### 3.2 Q2 — Schema property: one `accessControl.class` per ADR-0074; retire EXT-1's separate `privacy` block

**PROPOSAL.** **One schema property — `accessControl.class` per ADR-0074.** EXT-1's proposed `privacy: { protectable: bool, class: "safe-address" | "contact" | ... }` block is **retired in favor of `accessControl.class`**. EXT-1's entry in the upstream queue is updated to point at `accessControl.class` rather than introduce a separate `privacy` block.

**Why.** Two schema properties carrying overlapping semantics drift — the lint regime would need to enforce "if `privacy.protectable: true`, then `accessControl.class` = `protected`" forever. ADR-0074's `accessControl.class` is the canonical runtime authority; the Access-Class Registry resolves class tokens to audience policy and substitution rules. The `protectable: true` adjective is implied by class membership (the field's class IS `protected`) — no separate boolean needed.

**Author-facing UX.** Studio (and any author surface) MAY render a "Protected field" toggle that resolves to `accessControl.class: "protected"` under the hood; a paired `subjectKind` selector (`address | contact | employer`) feeds the renderer-only mask-text affordance. The toggle is author convenience; the substrate-reaching schema property is one. Per [ADR-0074 §"Concept-implied class"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) — runtime never consults concept-implied class; lint resolves at authoring time.

**Substitution rule shape on the registry entry.** The Access-Class Registry companion's single entry for `protected` carries:

```text
class: "protected"
defaultAudience: ["issuer_verification"]              # NOT public_receipt; NOT verifier_public_output
excludedAudiences: ["respondent_public_receipt", "verifier_public_output", "foia_public"]
substitutionRule: {
  kind: "deployment-resolved"                          # the deployment supplies the substitute-address validator
  validatorPortRef: "SafeAddressDirectory"             # FW-0060 will name the port; the registry just declares the seam
}
# Per-subject heterogeneity (address vs contact vs employer substitution semantics) lives inside the validator's
# per-deployment configuration; the validator dispatches on the field-level `subjectKind` Definition metadata.
# subjectKind is renderer-only and never reaches the substrate (see §3.1).
#
# Derived-field handling: relies on ADR-0074 §"Five decisions" line 44 — cross-class FEL is a definition error
# when no Profile is loaded; under a loaded Profile, relaxation requires literal audience-array equality declared
# via flClassCompatibility (ADR-0074 §"Profile-driven relaxation"). No new "cascade" mechanism is invented here.
```

**Audience-name convention.** The audience tokens above (`issuer_verification`, `respondent_public_receipt`, `verifier_public_output`, `foia_public`) follow the **snake_case convention** established by Trellis Operational Companion §13.3 (`foia_public`, `opposing_counsel`, `appellate_court`) and ADR-0074 §1's `medical_caseworker`, `supervisor`. These specific audience tokens are **proposed for the Privacy Profile sidecar's default policy** (per EXT-32 below); they are not yet settled vocabulary. The Privacy Profile sidecar is the canonical home for audience-name registration per ADR-0074 §"Five decisions" line 45 (audience policy in the sidecar, not in Core).

**Derived-field handling re-anchor.** Per ADR-0074 §"Five decisions" line 44 + §"Profile-driven relaxation": cross-class FEL is a definition error (unconditionally when no Profile is loaded); under a loaded Privacy Profile, relaxation requires literal audience-array equality declared via `flClassCompatibility`. **FW-0049 does NOT introduce a new "cascade" mechanism;** the `protected` class declaration on a source field causes any cross-class FEL output to be a definition error unless the Privacy Profile explicitly relaxes with audience-equal `flClassCompatibility`. Derived fields needing the same protection MUST themselves be declared `protected`-class by the author. **This is ADR-0074's discipline, not a FW-0049 invention.**

The shape above is **proposed for the Access-Class Registry companion** (per [ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)). FW-0049 does not author the registry; it specifies the entries needed.

**Justification.** ADR-0074 §"Five decisions" line 41–45 explicitly anticipates this pattern (Core treats class as opaque token; taxonomy + audience policy in the companion). Adding the `protected` class is the registry-tier work the ADR seams for.

**Alternative rejected: separate `privacy` block per EXT-1.** Brief candidate Q2 reasoning. Rejected per the drift argument above.

**Alternative rejected: per-form ad-hoc audience declaration without registry entry.** Considered to let each form author declare its own `protected`-class audience policy inline. Rejected because: (a) cross-form consistency matters for the verifier's "this receipt withholds protected fields" semantics — different per-form audience names would break verifier-side rendering; (b) the registry is the canonical home for cross-form vocabulary per ADR-0074 §"Five decisions" line 45.

### 3.3 Q3 — Render-side default: masked-by-default with explicit per-act reveal

**PROPOSAL.** `protected`-class fields render as **masked** (`••••••` or `"(protected)"` per the locale's accessible-mask convention) by default in every form surface the respondent sees, with an explicit per-act reveal affordance the respondent must invoke (single tap / click; no double-step required; no warning prompt that would itself signal "this is sensitive"). When the renderer needs to vary mask copy by subject ("Protected Address" vs "Protected Employer"), it reads `subjectKind` from field-level Definition metadata; substrate-bound code paths never see `subjectKind` (see §3.1).

| Surface | Render behavior |
|---|---|
| Form-fill page (active editing) | Field renders masked; reveal affordance present; on focus, the input shows the typed value (otherwise a coercion-style shoulder-surf defense becomes a usability blocker). Edit-mode IS reveal. Save / blur returns to masked. |
| "Preview my answers" / review surface | Masked by default; reveal affordance per-field; "reveal all" affordance is **not provided** (forces per-act reveal decisions). |
| "Share screen / screenshot" affordances (if the respondent invokes platform screen-share) | The form's render is masked; reveal is unavailable while screen-share is detected (best-effort — the API surface for screen-share detection is browser-imperfect; this is mitigation, not guarantee). |
| Post-submit status page | `protected`-class fields are **never rendered** on the status surface. Status copy refers to the field by label only ("Mailing address: confirmed") without the value. |
| Public receipt | `protected`-class fields are **never rendered** with plaintext (§3.4 substrate path delivers this). |
| Verifier output | Same as receipt — never plaintext (§4 substrate path). |
| Developer-view toggle (per [`formspec-web/CLAUDE.md`](../../CLAUDE.md) §"Vocabulary firewall") | `protected`-class metadata IS visible in dev view; plaintext values are NOT. `subjectKind` IS visible in dev view (it is renderer-tier metadata, not substrate-bound). |

**Justification.** Shoulder-surfing, screen-sharing accidents (the respondent shares their screen with a benefits navigator and forgets the `protected`-class field is shown), and screenshot-leaks (the respondent screenshots a confirmation, the screenshot goes to cloud-photo backup, the backup is later compromised) are the canonical incidental-leak vectors. Masked-by-default + per-act reveal mirrors the mature banking-app account-number masking pattern — users tolerate it, the discipline is well-understood, and the per-act reveal is a single decision rather than a workflow break.

**Per-act reveal is NOT auditable.** The fact that the respondent tapped reveal is not recorded in the public receipt or any audience-disclosed artifact (otherwise the reveal-event becomes its own metadata leak — "she revealed her address three times during the session"). Per-act reveals MAY be recorded in the respondent-private ledger for the respondent's own session-history view; that ledger is not exported.

**Alternative rejected: always-render-on-respondent's-own-screen.** Brief candidate Q3 first option. Rejected: assumes only the respondent sees their own screen, which is contradicted by all three incidental-leak vectors. Same anti-tell discipline as FW-0048 §3.2 byte-identical-success-path: the safer default is the more defensive default.

**Alternative rejected: masked-by-default with no reveal at all.** Considered for strongest protection. Rejected: makes form-fill nearly impossible (the respondent needs to confirm what they typed; the "(protected)" mask alone is too lossy). The per-act reveal is the necessary affordance.

**Alternative rejected: double-step reveal (confirm dialog before unmask).** Rejected: itself a signal — a shoulder-surfer would observe the confirm dialog. Single-tap is sufficient defense for the in-flow case; the discipline is consistent with bank-app patterns.

### 3.4 Q3.5 — Substitute-address vs truthful-value: form authoring declares both fields

**PROPOSAL.** Forms with safe-address support declare **two fields** for the protected concept: a substitute (publicly-disclosable) field and a truthful (verification-only) field. The substitute is the user-facing entry; the truthful is supplied only when the deployment's verification audience requires it.

| Field | accessControl | subjectKind (renderer-only) | Audience | Render |
|---|---|---|---|---|
| `mailingAddress` | `class: "procedural"` (or `unclassified`) | (n/a) | All audiences | Plaintext rendered |
| `protectedHomeAddress` | `class: "protected"` | `"address"` (optional; lets the renderer choose "Protected Address" mask copy) | `issuer_verification` audience only | Masked + per-act reveal; never rendered to `respondent_public_receipt` / `verifier_public_output` / `foia_public` |

The form's UI presents this as a single conceptual address with a "Protected address" flag — the respondent toggles "I'm in an Address Confidentiality Program" and the substitute-address field appears alongside the truthful-address field. The substitute (e.g., CA SoS PO Box) goes to public audiences; the truthful goes to the issuer-verification audience only.

**The truthful-address field is the substantive one for verification.** The substitute is what the public artifact carries; the truthful is what the eligibility predicate is evaluated against (eligible-because-resides-in-CA). The receipt's commitment-with-proof (Q4 below) is over the truthful value.

**Why two fields, not one.** Collapsing into one field (with the runtime deciding whether the entered value is "substitute" vs "truthful") forces ambiguity into a security-critical surface — a misread would mean either (a) the substitute is sent to verification (eligibility falsely fails or succeeds), or (b) the truthful is sent to public-receipt (the safety failure). **Two fields = no ambiguity.** The form-design discipline is: the substitute is always one field; the truthful is always another field; both are required when the respondent toggles ACP-enrollment.

**Justification.** California Safe at Home (Govt. Code §6206) is explicit: the substitute address is what state agencies enter into records; the truthful is held by the SoS and disclosable only by court order. The two-field model maps directly onto the legal contract.

**Alternative rejected: single field with runtime substitution.** Per the ambiguity argument above.

**Alternative rejected: substitute-only (don't collect truthful in the form).** Rejected because verification of eligibility (resides-in-CA, resides-in-relevant-school-district) requires the truthful value. Some forms might be substitute-only (no verification needed); for those forms the `protected` class is on a single field whose audience is "issuer-verification" but whose substitution-rule lets the substitute be the disclosed value. **The two-field model is the default; single-field substitute-only is a profile-extension.**

### 3.5 Q4 — Receipt-side semantics: withhold-with-commitment-proof via Trellis Phase 2+ OC-26/27/30 (verifier-grade only; no fallback)

**PROPOSAL (reshape 2026-05-25 per ADR-0157 §3 + §9 B.3).** The receipt for `protected`-class fields rides Trellis Phase 2+ selective-disclosure substrate per Trellis Core §13 commitment slots + Operational Companion OC-26/27/30 Disclosure Manifest. There is **no Phase 1 fallback shape**. The receipt carries:

1. A **commitment slot** populated at admit time for every `protected`-class field, whether or not the respondent invoked safe-address handling — **OC-26 uniform slot-population discipline**. This is the structural-indistinguishability anchor: the slot's *presence* is uniform across all submissions of a `safeAddress`-enabled form; the slot's *opening* (revealed plaintext vs. committed-only) carries the protection.
2. A **Disclosure Manifest** (OC-27) per audience: the `respondent_public_receipt` audience entry lists `protected`-class fields in `committed_only_fields[]` (i.e., committed but withheld); the `issuer_verification` audience entry lists them in `disclosed_fields[]`; the `verifier_public_output` audience entry lists them in `committed_only_fields[]`. The manifest carries `commitment_proofs` (OC-27 item 9) tying the disclosed/committed-only fields to the Core §13 commitment slots. The Disclosure Manifest MUST NOT carry the `subjectKind` discriminator (see §3.1).
3. **Independent auditability per OC-30:** an auditor MUST be able to verify that the commitment slots in the canonical record match the commitments in the manifest *without* requiring access to plaintext. The verifier's positive verdict reads: *"This submission contained a protected field that satisfied the form's eligibility predicate; the value is not present in this receipt."* The verdict copy MUST NOT name the subject kind ("address" / "contact" / "employer") of the withheld field — only the abstract "protected field" framing reaches the verifier surface.

**Response-vs-Receipt distinction (foundational).** The Response (what the issuer processes per ADR-0074 bucketed wire shape, §7.2.6) and the Receipt (what the public verifier reads per Trellis envelope) are **distinct artifacts at different layers**. The design's substrate answer differs per artifact: Response → bucketed encryption (per-audience key-bag, plaintext unreachable without audience key); Receipt → commitment-with-proof (audience-scoped Disclosure Manifest, no plaintext at any audience-derivation path). The two mechanisms **compose**, not substitute.

**No fallback shape.** Per Trellis Core §13.3, **Phase 1 producers MUST emit `commitments` as `null` or `[]`.** Phase 1 substrate therefore cannot satisfy the uniform-shape commitment guarantee, and any Phase 1 omission-of-protected-field shape would leak the presence of protection invocation (the value itself does not leak, but the schema-driven absence does). An adversary with auxiliary data (jurisdiction, form type, demographic) could infer respondent enrollment in ACP / witness-protection / equivalent — exactly the leak J-037 exists to prevent. Per ADR-0157 §9 (rejected alternative: dual-tier fallback): the existence-of-redaction tell on an append-only substrate is *permanent* — Phase 2 promotion does not retroactively repair the historical Phase 1 corpus — so a fallback tier pays its cost in survivor safety forever, not in architectural debt that later refactors can clear. Per `DEVELOPMENT-PHILOSOPHY.md` *"no half-implementations"*: the only honest landing is to **hold the safe-address pipeline until Trellis Phase 2 substrate is available** and ship one complete posture. FW-0049 ratifies behind that hold.

**Failure semantics tie-in (§5).** A form declaring `safeAddress` MUST fail-load on any deployment lacking Trellis Phase 2+ substrate per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) `UnsupportedRequiredFeatureError`. There is no honest "structural-tell disclosure copy" path — the substrate either is present or the form refuses to load.

**Justification.** Verifier independence (Trellis Core §16) requires the verifier validate from the receipt's public bytes alone. OC-30 delivers exactly this: commitment proofs let an auditor verify *that* the field was correctly committed without learning *what* the field was. This is the only structurally-correct path for the J-037 "receipt structure is consistent whether or not the respondent is in an ACP" requirement.

**Alternative rejected: full-omit-from-receipt as the primary path.** Rejected per the permanent-tell argument above.

**Alternative rejected: dual-tier (`verifier-grade | phase-1-fallback`).** Rejected per ADR-0157 §9 B.3 and `DEVELOPMENT-PHILOSOPHY.md` "no half-implementations." Prior shape of this section (pre-2026-05-25 reshape) carried both tiers; the fallback tier wrote a permanent existence-of-redaction tell into the append-only chain and was retained on the argument that "honest known-limitation" framing was better than blocking. The cross-stack review (ADR-0157) rejected that argument: survivor safety pays the cost in perpetuity, not architectural debt that later refactors can clear. The honest engineering choice is to hold the feature for Phase 2 substrate, not to ship a known-broken posture as the gateway version.

**Alternative rejected: encrypt-to-named-audience without commitment slot.** Considered: HPKE-wrap the `protected` field plaintext to the verifier audience's public key, same as FW-0048 §5.2 routes the duress payload to the safety-team recipient. Rejected because: (a) the verifier-public-output audience is NOT a holder of a private key — the public verifier is supposed to validate without contacting an authority; (b) the structural-indistinguishability requirement at the *receipt* layer (not the event layer like FW-0048) needs commitment slots, not HPKE wrap; (c) the verifier-grade "satisfied the predicate" claim is a commitment-proof concept, not an opaque-ciphertext concept. **Different substrate path than FW-0048 because the audience model is different.**

**Alternative rejected: rely on the bucketed-Response per ADR-0074 alone, no Trellis-side commitment slots.** Considered: ADR-0074's bucketed-Response with per-class key-bag already routes the `protected` field's plaintext to the issuer-verification audience only. Why also need Trellis commitment slots? Rejected because: (a) the bucketed-Response is an *encryption* mechanism (the plaintext is in the ciphertext but unreachable without the audience key) — it does NOT support an auditor's "verify-without-plaintext" claim per OC-30; (b) the verifier-public-output (the publicly-validable receipt) is a *different* artifact than the Response payload — the receipt is what the verifier reads; the Response payload (bucketed or not) is what the issuer processes. The receipt-layer redaction needs commitment slots; the Response-layer encryption needs bucketed-Response. **They compose**, they don't substitute.

**Composition with ADR-0074 bucketed-Response.** The Response carries the `protected` field's plaintext in a bucket wrapped to the issuer-verification audience. The Receipt carries the same field's commitment + manifest entry without plaintext. The Response and the Receipt are different artifacts at different layers; both protect the plaintext from the public-receipt audience. Both mechanisms are required for the safe-address pipeline to ship; the design has no partial-substrate posture.

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011

`safeAddress` is **already enumerated** in the [Feature Ownership Table at line 147](../adr/0011-runtime-feature-resolution-and-policy-gates.md): instance capability = "privacy/redaction substrate"; org policy = "jurisdictional protection policy"; form policy = "protected fields declared". FW-0049 codifies the carrier for each layer.

| Layer | What it carries for `safeAddress` |
|---|---|
| Instance capability | Adapter-backed: (a) bucketed-Response runtime per ADR-0074 (Response-layer encryption); (b) Trellis Phase 2+ commitment-slot substrate per Core §13 + OC-26/27/30 (Receipt-layer commitment-with-proof); (c) `SafeAddressDirectory` adapter for substitute-address validation (deployment-supplied; per-jurisdiction). All three are required for any `safeAddress` claim — there is no fallback tier (per §3.5 reshape + ADR-0157 §9 B.3). |
| Org policy | (a) Per-jurisdiction substitute-address authority configuration (e.g., this deployment honors CA ACP, WA ACP, USMS witness-protection); (b) audience-policy floor (which deployment-side audiences may receive plaintext); (c) public-receipt audience exclusions; (d) FOIA-disclosure policy (some agencies have FOIA carve-outs for `protected` values; some do not). |
| Form policy | Form declares the `protected` class on the applicable items (per §3.1 + §3.2); MAY declare the renderer-only `subjectKind` (`address | contact | employer`); declares the multi-party `visibleTo[]` per-party scope (composes with FW-0050 §7.1). No tier axis. |
| Resolved runtime profile | `protected`-class enabled flag + substitute-address validator port handle + per-jurisdiction registry handle. Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if any of the three substrate axes is unavailable. |

**No tier axis.** The reshape per §3.5 eliminates the prior `verifier-grade | phase-1-fallback` form-policy tier declaration. A form requiring `safeAddress` either runs on a deployment with full Trellis Phase 2+ substrate or fails to load. Contrast with `multiParty.tier` in FW-0050 §3.1 and `duressAware.mechanism × routingTier` in FW-0048 §4.1, where multiple substrate postures coexist honestly; safe-address has no honest fallback because the substrate cost is paid in perpetual survivor-safety leakage, not in deferrable architectural debt.

### 4.2 Port shape — adopter contract now; port shape deferred to FW-0060 build

Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md): post-MVP ports await consumer code. FW-0049 is a design row; FW-0060 is the build. The honest application is to specify the **adopter contract** here and let the port shape land with the build.

**Adopter contracts (what FW-0060 must satisfy).**

| Adopter axis | What it implies |
|---|---|
| `SafeAddressDirectory` adapter (per-jurisdiction + per-subject substitute-value validation) | Given a candidate substitute value + a jurisdiction key (e.g., `"CA-ACP"`, `"WA-ACP"`, `"USMS-WitSec"`) + the field's `subjectKind` (`address | contact | employer`), returns whether the value is a valid substitute (rejecting `123 Fake St` for an address subject; rejecting a non-relay phone for a contact subject; honoring the heterogeneous employer-concealment regime for an employer subject). Deployment-supplied; the registry of validators per jurisdiction × subject is configured per-deployment. Failure semantics: rejection is a per-field validation error rendered to the respondent ("This is not a recognized California ACP substitute address"). |
| Bucketed-Response writer adapter (per ADR-0074) | Routes `protected`-class field values into a separate bucket wrapped to the issuer-verification audience's public key. Existing per ADR-0074 Phase 5 (Emission); FW-0060 wires the `protected` class through. |
| Trellis commitment-slot writer adapter (Phase 2+; gating) | Populates the OC-26 commitment slot for `protected`-class fields uniformly per submission. Gating for the entire pipeline (no fallback). |
| Disclosure Manifest emitter adapter (Phase 2+; gating) | Emits the per-audience Disclosure Manifest entries per OC-27. Gating for the entire pipeline. The manifest MUST NOT carry `subjectKind` (per §3.1). |
| Receipt-renderer adapter | Renders the verifier-grade receipt without plaintext for `protected`-class fields; renders "verified to satisfy [predicate]" copy from the commitment-proof verdict. Verdict copy MUST NOT name the subject kind of the withheld field. |

**Why not invent a `SafeFieldProtector` port here.** Per ADR-0009 §(b) the bar is consumer code, not predicted-need. The substitute-address validator + bucketed-Response writer + commitment-slot writer + manifest emitter are **separate adopter axes**; collapsing them into one port would be speculation. FW-0060 picks the port shape at build time when the adapters are co-implemented. The substitute-address validator port likely lands first as a standalone seam (matched against the `SafeAddressDirectory` mock for Phase 1 development); the Trellis-side adapters land with Phase 2+ substrate and may reuse Trellis-side existing ports.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a `safeAddress` block:

```text
safeAddress?: {
  // The substrate carries one class token (per §3.1 reshape). Presence of this block in the
  // resolved profile means the deployment has confirmed all three substrate axes (bucketed-Response
  // writer, Trellis Phase 2+ commitment-slot writer + Disclosure Manifest emitter, SafeAddressDirectory
  // validator). Absence means form-load throws UnsupportedRequiredFeatureError. No tier axis (no fallback).
  substituteAddressDirectoryRef: string                    // handle into the per-jurisdiction × per-subject validator
  acpJurisdictionsAccepted: Array<string>                   // e.g., ["CA-ACP", "WA-ACP", "USMS-WitSec"]
  rendererHints?: {
    maskRenderToken?: string                                // locale-aware mask copy ("(protected)" / "••••••")
    revealAffordanceLabel?: string                          // locale-aware reveal-button copy
    // Renderer reads field-level subjectKind from Definition metadata, not from the resolved profile.
    // subjectKind is renderer-tier; the resolved profile carries no per-subject vocabulary.
  }
}
```

The `acpJurisdictionsAccepted[]` token values are deployment-defined identifiers; the examples (`CA-ACP`, `WA-ACP`, `USMS-WitSec`) are proposed conventions, not settled vocabulary. The Privacy Profile sidecar (EXT-32) is the canonical home for the jurisdiction-key registration.

The block is the resolver's read-only output. Adapters do not consume it directly; the shell does, and orchestrates the existing `IdentityProvider` + `SubmitTransport` ports plus the FW-0060-build safe-address adapters against it.

**Sensitive-data discipline:** the `rendererHints` are presentation copy only; no plaintext substitute-address registry data appears in the resolved profile (those live behind the validator port, queried per-field at validation time, never bulk-exposed to the shell).

## 5. Failure semantics

### 5.1 Form-load failures

| Condition | Error per ADR-0011 |
|---|---|
| Form requires `safeAddress` but instance lacks Trellis Phase 2+ substrate (commitment-slot writer or Disclosure Manifest emitter) | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `safeAddress` but instance lacks `SafeAddressDirectory` adapter for the form's `acpJurisdictionsAccepted[]` | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `safeAddress` but instance lacks bucketed-Response writer (ADR-0074 Phase 5 Emission) | `UnsupportedRequiredFeatureError` at form-load |
| Form declares `protected` class on an item but org policy forbids `safeAddress` for the form's jurisdiction | `FeaturePolicyConflictError` at form-load |
| Form's `protected` class declaration conflicts with the form's multi-party `visibleTo[]` (e.g., `visibleTo` includes the public-receipt audience for a `protected` field) | `InvalidRuntimePolicyError` at form-load (per FW-0050 §7.1) |
| Form's bucketed-Response audience policy is incomplete (no audience configured to receive plaintext `protected` values for verification) | `InvalidRuntimePolicyError` at form-load |
| Form declares `subjectKind` outside the closed taxonomy (`address | contact | employer`) | `InvalidRuntimePolicyError` at form-load |

**No downgrade.** A form requiring `safeAddress` MUST fail-load on any deployment lacking the full Phase 2+ substrate. There is no fallback posture, no honest "structural-tell disclosure copy" path, and no opt-in for a lower tier. The deployment either has the substrate or refuses the form. Per §3.5 reshape + ADR-0157 §9 B.3.

### 5.2 Runtime failures

| Condition | Behavior |
|---|---|
| Respondent enters an invalid substitute address | Per-field validation error; field-level error copy ("This is not a recognized California ACP substitute address"). |
| Respondent enters a truthful address but no substitute | Per-form validation error; honest copy ("Forms requiring safe-address protection need both the substitute and the truthful address to be supplied"). |
| `SafeAddressDirectory` adapter is unreachable mid-session | Validation deferred to submit-time; if still unreachable at submit, the draft persists, the respondent is told the verification step is queued; the draft does NOT submit to the issuer until validation succeeds (otherwise the substitute might be invalid). |
| Bucketed-Response writer fails mid-submit | Hard error per ADR-0011 surface; the respondent is told submission failed (consistent with non-safe-address submission failures — no special copy that would tip a watcher off). |

### 5.3 Cross-stack failures

| Condition | Behavior |
|---|---|
| Trellis Phase 2 commitment-slot writer fails mid-admit | The admit step fails; the canonical record is not appended; the receipt is not issued. Honest failure surfaced to the issuer's operator surface. |
| Trellis Phase 2 Disclosure Manifest fails to emit for a non-default audience (e.g., `appellate_court` audience requested post-hoc) | The manifest emission failure does NOT invalidate the original admit; the manifest is a derived artifact per OC-28. The post-hoc manifest request fails per OC-27. |

## 6. Cross-stack dependency chain

### 6.1 The chain

```
FW-0049 design (this doc)
    ↓
EXT-1 update (formspec — `accessControl.class` is the canonical mechanism; retire the proposed `privacy` block)
+ EXT-31 (new — proposed below: Access-Class Registry single `protected` entry)
+ EXT-32 (new — proposed below: Privacy Profile default audience policy for `protected`)
+ web ADR-0011 (Feature Ownership Table for `safeAddress` is already present; resolved profile shape lands per §4.3)
    ↓
stack-root ADR-0157 promotion to `accepted` (landed 2026-05-25 as `held-pending-trellis-phase-2`; promotion blocked on Trellis Phase 2 substrate; spans formspec + WOS + trellis)
    ↓
FW-0060 build (formspec-web)
```

### 6.2 EXT-1 — update direction

EXT-1 ([`thoughts/specs/2026-05-22-upstream-extension-queue.md:26`](2026-05-22-upstream-extension-queue.md)) currently proposes three sibling blocks on items — `consequences`, `purpose`, `privacy` — and names J-037 + FW-0049 in `Closes:`. The `privacy` block proposes `protectable: bool` + `class` enum.

**FW-0049 design recommends:** the `privacy` block is **retired** from EXT-1; the `consequences` and `purpose` blocks remain (they close other journeys). EXT-1's safe-address purpose is satisfied by ADR-0074's `accessControl.class` + the new Access-Class Registry single `protected` entry (EXT-31 below). The EXT-1 entry in the upstream queue is updated to reflect this scope reduction.

### 6.3 EXT-31 (new) — Access-Class Registry entry for `protected`

**Proposed for upstream extension queue.** The Access-Class Registry companion ([stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), **not yet authored**) gains a single new class entry per §3.1 + §3.2 reshape (2026-05-25):

```text
class: "protected"
defaultAudience: ["issuer_verification"]
excludedAudiences: ["respondent_public_receipt", "verifier_public_output", "foia_public"]
substitutionRule: {
  kind: "deployment-resolved-per-subject",
  validatorPortRef: "SafeAddressDirectory"
  # Validator dispatches on field-level subjectKind metadata (address | contact | employer).
  # Per-subject substitution heterogeneity (state-ACP PO Box for addresses; relay services for
  # contact endpoints; heterogeneous employer concealment regimes) lives inside the validator's
  # per-deployment configuration. The registry entry does not enumerate subject categories
  # because subjectKind never reaches the substrate (see §3.1).
}
```

**Derived-field handling** relies on ADR-0074 §"Five decisions" line 44 cross-class FEL definition-error discipline; no new "cascade" mechanism is introduced. Derived fields needing the same protection MUST be declared `protected`-class explicitly by the form author, or rely on Privacy Profile `flClassCompatibility` declarations (only valid when audience arrays are literally equal per ADR-0074 §"Profile-driven relaxation"). **The audience names above are proposed for the Privacy Profile sidecar's default policy (EXT-32);** they are not yet settled vocabulary.

**Parent file dependency:** this entry presumes `formspec/specs/registry/access-class-registry.md` is authored as part of the ADR-0074 promotion path; the file does not yet exist (verified 2026-05-23 — `formspec/specs/registry/` contains only `changelog-spec`, `extension-registry`, `signature-method-registry`).

### 6.4 EXT-32 (new) — Privacy Profile default audience policy for `protected`

**Proposed for upstream extension queue.** The Privacy Profile sidecar ([stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), **not yet authored**) gains a default audience-policy entry for the `protected` class. The default policy (audience tokens snake_case per Trellis OC §13.3 + ADR-0074 §1 convention):

- the `protected` class has `issuer_verification` audience as the only audience receiving plaintext;
- the audience `respondent_public_receipt` is explicitly excluded;
- the audience `verifier_public_output` is explicitly excluded;
- the audience `foia_public` is excluded by default (overridable per-deployment for specific jurisdictions that legally mandate disclosure — e.g., a specific elected-official disclosure rule that overrides ACP; rare but exists);
- per-jurisdiction overrides land as Privacy Profile additions per deployment.

**Audience-name registration is the Privacy Profile sidecar's authority** per ADR-0074 §"Five decisions" line 45; the tokens above are proposed defaults, not settled vocabulary.

**Parent file dependency:** this entry presumes `formspec/specs/privacy/privacy-profile.md` is authored as part of the ADR-0074 promotion path; the file does not yet exist (verified 2026-05-23 — `formspec/specs/privacy/` does not exist).

### 6.5 XS-4 — Cross-stack ADR for safe-address pipeline (landed as stack-root ADR-0157, `held-pending-trellis-phase-2`)

**Status:** XS-4 landed as [stack-root ADR-0157 (Safe-Address Pipeline)](../../../thoughts/adr/0157-safe-address-pipeline.md). Ratification is BLOCKED on Trellis Phase 2 substrate per ADR-0157 §1 + §9 B.3 (reshape 2026-05-25). The ADR is design-stable; the gate is substrate availability, not further design work. Spans formspec (Access-Class Registry `protected` entry + Privacy Profile default audience policy), WOS (per-actor audience policy for `protected` in the applicant API + governance projections), and trellis (Phase 2 OC-26/27/30 commitment-slot + Disclosure Manifest binding for `protected`-class fields).

**ADR-0157 content (consumer perspective):**

1. **Boundary:** at `intake-handoff` plus the Trellis admit step. Formspec owns the field-level class declaration + bucketed-Response shape; Trellis carries the Phase 2 commitment slots + Disclosure Manifest; WOS owns per-actor audience policy when WOS is the deployment's governance layer.
2. **One posture (verifier-grade only; no fallback).** Trellis Phase 2+ delivers OC-26 uniform commitment-slot population for `protected`-class fields whether or not the respondent is in a protection program; OC-27 Disclosure Manifest entries per audience; OC-30 independent auditability for the verifier-grade claim. Bucketed-Response (Phase 5 of ADR-0074) is the Response-layer encryption boundary; the commitment-slot/manifest is the Receipt-layer structural-indistinguishability boundary. Both substrate axes are required; there is no honest fallback (per ADR-0157 §9 B.3 reshape — the existence-of-redaction tell on an append-only substrate is permanent, and Phase 2 promotion does not retroactively repair the historical Phase 1 corpus).
3. **WOS actor scope (when WOS is the governance layer).** The applicant API + governance projections MUST consult the Privacy Profile audience policy before rendering `protected`-class fields to a requesting actor. A caseworker actor with `eligibility-determination` role gets plaintext; a caseworker actor with `intake-only` role gets the substitute value only. **Composition with FW-0050 §7.1 per-party scoping applies:** when the case is multi-party, the per-party `visibleTo[]` further constrains who can see whose `protected`-class fields.
4. **Receipt discipline:** the verifier surface MUST NOT distinguish safe-address-redacted receipts from non-redacted receipts at the structural level — same commitment slots populated, same manifest shape emitted (just different `disclosed_fields`/`committed_only_fields` per the per-form audience config). The substrate carries `accessControl.class: "protected"` — never the field's `subjectKind`. Verifier conformance suite must include fixtures covering (a) submission with no `protected` fields, (b) submission with `protected` fields disclosed to the public audience (rare), (c) submission with `protected` fields committed-only to the public audience (canonical J-037 case) — all three MUST produce structurally-similar receipts modulo the commitment-slot openings.
5. **Multi-party composition (FW-0050 §7.1 binding):** see §7 below.
6. **PKAF/Rulespec downstream:** when a `protected` value is referenced by a downstream PKAF assertion (e.g., a determination citing residence-eligibility), the assertion's access-scope MUST inherit a regulatory-restricted scope reflecting the upstream `accessControl.class`. **Vocabulary tokens (`rkaf:AccessScope`, `dpv:Location`, `dpv:hasPersonalDataCategory`) are ILLUSTRATIVE pending Rulespec alignment row** — PKAF substrate lives at `PKAF/specs/` but no spec-level verification that these specific token names are settled vocabulary; the ADR-0157 ratification establishes the binding contract using whatever PKAF tokens are canonical at that time.

**Subsystem-count honesty.** ADR-0157 spans formspec + WOS + trellis as one ratification unit (no two-wave structure — the prior shape's "Phase 1 wave plus Phase 2 wave" split was unwound when the fallback tier was rejected). Ratification waits for Trellis Phase 2 substrate. The formspec-side and WOS-side work (EXT-1 reduction + EXT-31 + EXT-32 + WOS audience-policy integration) can land before Trellis Phase 2 ships, but the ADR cannot promote to `accepted` until the substrate is online and cross-stack fixtures pass.

**Without ADR-0157 promotion to `accepted`, FW-0049 design cannot be acted on by FW-0060.** The dependency is hard. FW-0060's existing Phase 1 build slice (per the FW-0060 row Progress note 2026-05-25) MUST be re-evaluated against this reshape: the slice's `phase-1-fallback` posture support and its honest-Phase-1-disclosure copy paths are now rejected at the ADR level. The build either gates further work on Phase 2 substrate, or the FW-0060 row is reshaped to scope-down to Phase-2-ready stubs (validator port, runtime resolver, fail-load semantics) without claiming any `safeAddress` capability at runtime until Trellis Phase 2 lands.

### 6.6 What FW-0049 ratifies standalone

**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `safeAddress` capability shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the resolved-profile block in §4.3, the no-tier-axis posture, the failure-semantics binding.
- The runtime render discipline per §3.3 (masked-by-default + per-act reveal).
- The renderer-only `subjectKind` Definition-metadata pattern per §3.1.
- The two-field substitute-vs-truthful authoring discipline per §3.4.
- The per-party composition rule with FW-0050 (§7).
- The adopter-contract pattern over the per-jurisdiction × per-subject `SafeAddressDirectory` adapter (§4.2) — the conformance fixture pattern can be authored now even though the port shape lands with FW-0060 build.

**Waits on upstream:**

- The Access-Class Registry `protected` entry (EXT-31).
- The Privacy Profile default audience policy for `protected` (EXT-32).
- Stack-root ADR-0157 promotion from `held-pending-trellis-phase-2` to `accepted` (spans formspec + WOS + trellis).
- ADR-0074 promotion from Proposed to Accepted (current status: Proposed per [ADR-0074 header](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)). FW-0049 design depends on the ADR-0074 substrate; if ADR-0074 evolves in flight, FW-0049 follows.
- **Trellis Phase 2 substrate (Core §13 commitment slots + OC-26/27/30) — load-bearing for the entire pipeline.** No fallback shape; the design holds for the substrate. Per ADR-0157 §9 B.3 reshape.
- EXT-1 update direction (retire the proposed `privacy` block; the `consequences` and `purpose` blocks remain).

## 7. Multi-party composition (FW-0050 §7.1 satisfaction)

This is the section [FW-0050 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) explicitly cites as the safe-address-class-taxonomy source. FW-0050 names the composition rule; FW-0049 satisfies the safe-address half.

### 7.1 The composition rule

Per FW-0050 §7.1: *"when a form declares both `multiParty` and `safeAddress` features, the resolved runtime profile composes them: a protectable field's `visibleTo[]` is intersected with the safe-address jurisdictional rule. If the intersection is empty (no party can legally see the protected value), the form-load surfaces an `InvalidRuntimePolicyError` per web ADR-0011. Silent leak forbidden."*

FW-0049's contribution: the **safe-address audience policy** (§3.4 + §6.4) supplies the right operand of the intersection. The composition:

- Form declares: field carries `accessControl.class: "protected"` (optionally `subjectKind: "address"` for renderer mask-text); per-form Privacy Profile audience policy lists `[issuer_verification]` as the only plaintext audience.
- FW-0050 declares: field's `visibleTo[]` lists `[parentA.roleId]` (excludes parentB).
- Resolver intersects: parentB-receiving audiences = `{parentB.roleId, respondent_public_receipt}` ∩ `{issuer_verification}` = empty. parentA-receiving audiences = `{parentA.roleId, issuer_verification}` ∩ `{issuer_verification}` = `{issuer_verification}`. **No leak to parentB; verification flows to the `issuer_verification` audience; canonical case works.**
- Failure case: form declares `visibleTo: [respondent_public_receipt]` for a `protected` field (form-author error). Intersection with `protected`-class audience policy = empty for the public-receipt slot. `InvalidRuntimePolicyError` at form-load.

### 7.2 The canonical child-custody case worked example

Per §2.3.3 worked scenario:

- Field `parentA.homeAddress` carries `accessControl.class: "protected"` (renderer-only `subjectKind: "address"` may be present in field-level Definition metadata), FW-0050 `visibleTo: [parentA.roleId]`.
- Field `parentB.homeAddress` carries `accessControl.class: "unclassified"` (or `procedural`), FW-0050 `visibleTo: [parentA.roleId, parentB.roleId]` (mutually disclosed).
- The receipt structure (verifier-grade only; no fallback):
  - Public receipt: parentA's address committed-only (with commitment proof per Phase 2+); parentB's address disclosed in plaintext.
  - parentA-receipt audience: both addresses present in plaintext (parentA owns the protected value).
  - parentB-receipt audience: parentA's address committed-only (without unwrap key); parentB's address present in plaintext.
  - `issuer_verification` audience: both addresses in plaintext (eligibility evaluation).
- Phase 2+ commitment slots: populated for `parentA.homeAddress` in every submission of this form (uniform shape); the slot's opening differs per audience per the Disclosure Manifest. The Disclosure Manifest carries `accessControl.class: "protected"` and never the field's `subjectKind`.
- **Without Trellis Phase 2+ substrate, the form fails-load with `UnsupportedRequiredFeatureError`** per §3.5 + §5.1 reshape — there is no fallback shape. Prior shape of this design specified a Phase 1 omit-from-receipt fallback that would have leaked the presence of protection invocation through structural absence; that fallback is rejected per ADR-0157 §9 B.3 because the tell is permanent on an append-only chain.

### 7.3 FW-0048 composition (coercion-adjacent)

FW-0048 (coercion-aware signing) and FW-0049 (safe-address) are adjacent but distinct: coercion is event-time signal; safe-address is field-level known-protectable value. They compose:

- A form requiring both `duressAware` (FW-0048) and `safeAddress` (FW-0049) declares both capabilities; the resolver returns both blocks in the `ResolvedRuntimeProfile`.
- The duress signal's HPKE-wrapped payload (FW-0048 §5.2) and the safe-address bucketed-Response routing (this design §3.4 + §3.5) are independent substrate paths — both can fire on the same submission.
- The verifier sees: a `submission.duress-signaled` event (with HPKE-wrapped payload per FW-0048 §5.2 — opaque without safety-team key), and a safe-address commitment-with-proof per this design §3.5. **No interaction**; both protect different concerns through different substrate paths.

### 7.3.5 FW-0051 composition (BYO-assistant — `protected`-class mask survives FW-0051 reveal)

FW-0051 (bring-your-own-assistant) and FW-0049 (safe-address) compose at the Assist introspection surface: the Assist Provider's `formspec.field.describe` returns `FieldDescription` (Assist §4.4) including `value`, and FW-0051 §3.2 masks `value` by default with a per-field reveal escalation (FW-0051 §3.3) as the unmask gate. **For `protected`-class fields, the FW-0049 §3.3 mask is a SEPARATE, HIGHER-PRIORITY mask that survives the FW-0051 reveal.** Per [FW-0051 §7.2](2026-05-23-fw-0051-bring-your-own-assistant-design.md): the Assist Provider NEVER unmasks `protected`-class fields regardless of the respondent's Stage 3 per-field reveal grant. The discipline composes via "AND" not "OR": both masks must be lifted for unmask; the `protected` mask cannot be lifted by FW-0051's reveal. The Assist surface MUST NOT receive the field's `subjectKind` value either; subjectKind is renderer-only (per §3.1) and the Assist Provider is not the renderer.

**Justification.** FW-0049's mask exists for shoulder-surfing / screen-share defense; the respondent's own awareness of the value is mediated by their own UI's reveal (FW-0049 §3.3 "edit-mode IS reveal"). For the assistant case, the respondent revealing a `protected` value to the assistant is a separate, stronger consent decision than revealing a normal field's value. Slice 1 chooses the safer default: assistants never see plaintext `protected` values. If a future use case demands `protected`-class fields be revealable to assistants (e.g., legal-aid software helping a survivor fill a benefits form), a follow-on row revisits with a stronger consent surface.

**FW-0060 build constraint addition (consumed by FW-0060 author directly):** the Assist Provider implementation under FW-0062 build MUST mask `protected`-class fields in `FieldDescription.value` unconditionally; the FW-0062 build's per-field reveal grant store MUST exclude `protected`-class fields from the unmaskable set; the Assist surface MUST NOT receive `subjectKind` metadata for any field. Conformance fixtures cover the `protected` + Assist composition case.

### 7.3.6 FW-0058 composition (AI-agent filer — `protected`-class mask survives agent read)

FW-0058 (AI-agent filer chain) and FW-0049 (safe-address) compose at the agent-introspection surface: when an AI agent files on behalf of a protected party (e.g., a property-management agent filing a tenant application on behalf of a survivor; a benefits-AI filing on behalf of a protected elder), **the `protected` mask survives the agent's WOS-governed read identically to the BYO-assistant case (§7.3.5).** Per [FW-0058 §7.3 in the 2026-05-24 design](2026-05-24-fw-0058-ai-agent-filer-chain-design.md): the agent itself does NOT gain visibility into the `protected` field; the agent submits the form WITHOUT seeing the plaintext value; the receipt carries the `protected` class declaration unchanged.

**Operational pattern.** The agent operator may need additional inputs to fill `protected` fields (e.g., the protected party provides their safe-address out-of-band to the operator, who supplies it to the agent through a side channel); this is the operator's substrate concern, NOT FW-0049's. FW-0049's discipline binds the form's introspection surface — what the agent sees through the form's substrate — not what the operator may pre-load into the agent's runtime by other means.

**Verifier rendering.** The verifier renders BOTH the four-party agent chain (per FW-0058 §3.3) AND the `protected` class declaration on the protected field. Both surfaces compose naturally as independent decorations on the receipt; neither suppresses the other. The verifier MUST NOT name the subject kind of the withheld field — only the abstract "protected field" framing reaches the verifier surface (per §3.5).

**FW-0060 build constraint addition:** the `protected` mask discipline applies uniformly across all programmatic readers — Assist Provider (FW-0051), agent introspection (FW-0058), and any future reader. The per-reader-type unmask exception list is intentionally empty for `protected`-class fields.

### 7.3.7 FW-0042 composition (trusted-reviewer — `protected`-class mask survives reviewer-read; suggest forbidden on `protected`)

FW-0042 (share-draft-with-trusted-reviewer) and FW-0049 (safe-address) compose at the reviewer-introspection surface symmetrically with the FW-0051 / FW-0058 composition (§7.3.5 / §7.3.6). Per [FW-0042 §6.3 + §3.4](2026-05-25-fw-0042-trusted-reviewer-design.md): `protected`-class fields auto-mark as `respondentOnly: true` for reviewers, regardless of form-policy `respondentOnlyFieldPointers[]`. The reviewer's session renders the `protected` field as a masked label ("Respondent-only field — value hidden from reviewers"); the reviewer can leave a comment on the masked field (advising about a field they cannot see the value of — "Mom, double-check the SSN field looks right") but the suggest affordance is structurally HIDDEN (the reviewer cannot suggest a value for a field they cannot see, mirroring the FW-0051 + FW-0058 disciplines — a "blind" suggestion would leak information about expected value shapes via the input semantics).

**Composition discipline matches the filer-side per FW-0037 §6.3.** The "comment OK; suggest forbidden" split applies symmetrically across the human-reviewer (FW-0042), AI-assistant (FW-0051), and AI-agent (FW-0058) readers — none can see `protected`-class plaintext, and none can author suggestions / writes against `protected`-class fields. The per-reader-type unmask exception list (§7.3.5 + §7.3.6) stays intentionally empty for `protected`-class fields; FW-0042's reviewer joins the same uniform discipline.

**FW-0060 build constraint addition:** the reviewer-side renderer under FW-0113 (FW-0042 build row) MUST mask `protected`-class fields in the reviewer session; the suggest affordance MUST be structurally absent for `protected`-class fields (per FW-0042 §3.4 + §4.2 substrate refusal `SuggestionForbiddenOnRespondentOnlyFieldError`). Conformance fixtures cover the `protected` + reviewer-share composition case per FW-0042 §10 (fixture 9).

### 7.4 FW-0060 build constraints (consumed by FW-0060 author directly)

The FW-0060 build is responsible for:

1. **Per-jurisdiction × per-subject substitute-value validator adapter.** Reference adapters for at least California Safe at Home, Washington ACP, and USMS Witness Security; additional jurisdictions land per-deployment. The validator dispatches on field-level `subjectKind` Definition metadata to apply the correct per-subject substitution semantics (PO-Box for address, relay endpoint for contact, heterogeneous regime for employer).
2. **Bucketed-Response writer for `protected`-class fields.** Per ADR-0074 Phase 5 (Emission) — already a substrate concern; FW-0060 wires the `protected` class through.
3. **Trellis Phase 2 commitment-slot writer (gating).** Required for the entire pipeline. Until Trellis Phase 2 substrate is online, forms requiring `safeAddress` MUST fail-load with `UnsupportedRequiredFeatureError` (per §5.1 reshape). No fallback path.
4. **Disclosure Manifest emitter for the `protected`-class audience set (gating).** Required for the entire pipeline. The emitter MUST NOT carry `subjectKind` on any manifest entry.
5. **Receipt renderer that respects the per-audience disclosure.** The verifier-public-output renders "verified to satisfy [predicate]" for `protected` fields when commitment-proofs are present. Verdict copy MUST NOT name the subject kind of the withheld field. There is no "field omitted" path because there is no Phase 1 fallback (per §3.5 + ADR-0157 §9 B.3 reshape).
6. **Render-discipline implementation per §3.3.** Masked-by-default per-act-reveal across all respondent-facing surfaces. The renderer MAY consume `subjectKind` Definition metadata to vary mask copy ("Protected Address" vs "Protected Employer"); the substrate-bound code paths MUST NOT see `subjectKind`.
7. **Multi-party composition conformance fixtures per §7.1 + §7.2.**
8. **Reconsider the existing FW-0060 build slice (Progress note 2026-05-25 on the FW-0060 PLANNING row).** The slice's `phase-1-fallback` posture support is now rejected at the ADR level (ADR-0157 §9 B.3). Two options: (a) gate further work on Phase 2 substrate; (b) reshape FW-0060 to scope-down to Phase-2-ready stubs (validator port, runtime resolver, fail-load semantics) without claiming any `safeAddress` capability at runtime until Trellis Phase 2 lands.

## 8. Open questions / deferrals

Honest list of what FW-0049 design does NOT resolve:

1. **The employer-correlation attack class (§2.4).** A survivor whose employer is known cannot fully protect their address via address-substitution. **Out of any field-level mechanism's reach.** Documented; not mitigated by this design.
2. **Per-jurisdiction substitute-address registries (§1.2).** 40+ states with ACP; varying federal regimes. **Deployment concern.** FW-0060 ships reference adapters for the canonical few; per-deployment work for the rest.
3. **Cross-class FEL derivations (research brief Q6).** A FEL-derived value reading a `protected` input — what happens when the derivation flows through a less-restrictive class? Resolved per §3.2 (cross-class FEL = definition-error per ADR-0074 §"Five decisions" line 44 + `flClassCompatibility`); not a residual `cascade`-mechanism question. **FW-0060 build verifies the registry's `flClassCompatibility` declaration matches the lint behavior; no FW-0049 design gap.**
4. **Form-load failure copy when Trellis Phase 2 substrate is unavailable.** The fail-load message must explain to the respondent that the deployment cannot offer this form's safety guarantee — not that the form is broken, not that the respondent should retry. Exact copy + visual treatment is a FW-0060 build concern. (Prior shape's "Phase 1 fallback structural-tell honesty UI" question is obsolete per §3.5 reshape — there is no fallback path.)
5. **Forms requiring substitute-only (no truthful value collected; §3.4 alternative).** Some forms might be substitute-only (no verification predicate to evaluate). For these, the `protected` class on a single field with a substitute-only audience policy is a Privacy Profile extension. **Out of FW-0049 scope; landed as a follow-on if a real form demands it.**
6. **Cross-jurisdiction respondent relocation.** Respondent enrolled in CA ACP moves to WA and re-enrolls in WA ACP. The form's substitute-address validator must accept the WA substitute at the new address; the existing record (under CA substitute) is not retroactively rewritten. **Operational lifecycle concern; out of FW-0049 design scope.**
7. **PKAF/Rulespec downstream binding details (§6.5 item 6).** Specific `rkaf:AccessScope` + `dpv:hasPersonalDataCategory` composition for `protected` values. **Follow-on Rulespec alignment row; not FW-0049's scope.**
8. **Document-side redaction composition with FW-0040.** When a form requiring `safeAddress` also accepts a document upload that may contain the protected value (utility bill, lease), the document-side redaction is FW-0040's mechanism. The two must compose at the issuer-verification audience level (document and form-field values both flow to the issuer audience); composition rule is straightforward but the build-time enforcement lives in FW-0040 design.
9. **The FOIA-disclosure carve-out problem.** Some jurisdictions have specific elected-official disclosure rules that override ACP for certain office-holders. **Per-deployment Privacy Profile override** (§6.4); FW-0049 names the seam but doesn't enumerate the carve-outs.
10. **Narrow known-tell follow-on tier.** Per ADR-0157 §12 open question 4: does any deployment have a concrete use case where the redaction is already publicly known to apply (e.g., judge financial disclosures), warranting a narrow follow-on ADR for a known-tell tier? If such a use case appears, the tier would live behind a separate `protected-public-tell` class token or a Privacy Profile escape hatch, NOT a reactivation of the rejected `phase-1-fallback` shape. **Out of FW-0049 design scope until a real deployment surfaces the use case.**

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: single closed class `protected` with renderer-only `subjectKind` discriminator (closed taxonomy `address | contact | employer`); substrate carries one access-control bit | PROPOSAL (reshape 2026-05-25 per ADR-0157 §3 + §9 B.2) | owner review + Access-Class Registry companion |
| Q2: one schema property (`accessControl.class` per ADR-0074); retire EXT-1's `privacy` block | PROPOSAL | owner review + EXT-1 update direction |
| Q3: masked-by-default + per-act reveal on every respondent-facing surface; never rendered to receipt / status / verifier-public-output | PROPOSAL | owner review |
| Q3.5: two-field substitute-vs-truthful authoring discipline | PROPOSAL | owner review |
| Q4: receipt-side withhold-with-commitment-proof via Trellis Phase 2+ OC-26/27/30; verifier-grade only — no fallback shape | PROPOSAL (reshape 2026-05-25 per ADR-0157 §3 + §9 B.3) | owner review + Trellis Phase 2 dependency surface |
| `safeAddress` capability shape under ADR-0011 (no tier axis; presence in resolved profile means full Phase 2+ substrate is online) | PROPOSAL (reshape 2026-05-25) | owner review + ADR-0011 evolution |
| Per-jurisdiction × per-subject `SafeAddressDirectory` adopter contract; port shape deferred to FW-0060 build per ADR-0009 §(b) | PROPOSAL | owner review |
| EXT-1 retire `privacy` block; consequences/purpose remain | PROPOSAL to formspec | formspec spec-expert review |
| EXT-31 (new) — Access-Class Registry single `protected` entry | PROPOSAL to formspec (reshape 2026-05-25 — collapsed from three entries) | formspec spec-expert review + Access-Class Registry author |
| EXT-32 (new) — Privacy Profile default audience policy for `protected` | PROPOSAL to formspec | formspec spec-expert review + Privacy Profile sidecar author |
| XS-4 — landed as stack-root [ADR-0157](../../../thoughts/adr/0157-safe-address-pipeline.md), `held-pending-trellis-phase-2` | LANDED (held); awaits Trellis Phase 2 substrate | stack-root architecture review + Trellis substrate landing |
| Multi-party composition per FW-0050 §7.1 satisfied (§7 above) | PROPOSAL | owner review + FW-0061 build consumer |

**Row status change:** FW-0049 moves from `open` to `in design`. FW-0049 stays in design until this design is owner-ratified, the upstream chain (EXT-1 update + EXT-31 + EXT-32) has at least proposed shapes, AND ADR-0157 promotes from `held-pending-trellis-phase-2` to `accepted`. The Trellis Phase 2 substrate gate dominates the timeline.

## 10. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`safeAddress` is post-MVP; this design is staging for post-MVP)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §4.2 defers `SafeAddressDirectory` port shape to FW-0060 build per §(b))
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (the `safeAddress` capability the design instantiates; already enumerated at line 147)
- [FW-0048 design 2026-05-23](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-aware signing (adjacent threat-model; different substrate path; composes per §7.3)
- [FW-0050 design 2026-05-23 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party (cites this row as safe-address-class-taxonomy source; §7 above satisfies)
- [stack-root ADR-0074](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) — Class-Aware Response and Bucketed Encryption (the canonical substrate; this design instantiates the `protected` class against it per §3.1 reshape)
- [stack-root ADR-0116](../../../thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md) — SD-JWT default selective-disclosure path (orthogonal substrate path; not load-bearing for FW-0049 MVP)
- [stack-root ADR-0157](../../../thoughts/adr/0157-safe-address-pipeline.md) — Safe-Address Pipeline cross-stack ADR (`held-pending-trellis-phase-2`); landed 2026-05-25; status block, §3 single-class decision, §9 B.3 dual-tier rejection are the gates this design follows.
- [Trellis Core §13](../../../trellis/specs/trellis-core.md) — Commitment Slots Reserved (Phase 2+; load-bearing for the entire pipeline per §3.5 reshape — no fallback)
- [Trellis Operational Companion §13](../../../trellis/specs/trellis-operational-companion.md) — Selective Disclosure Discipline (OC-26/27/30; load-bearing for the receipt-side audience contract per §3.5)
- Source brief: [`thoughts/sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md`](../sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md)
- Journey: [J-037 in `JOURNEYS.md:651`](../../JOURNEYS.md)
- Anti-pattern: [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md)
- External prior art: California Safe at Home (Govt. Code §§6205–6210), Washington ACP (RCW 40.24), Massachusetts ACP (M.G.L. c. 9A), USMS Witness Security Program, NNEDV Safety Net guidance, "Designing for Safety" (PenzeyMoog, Rosenfeld Media 2021)

## Appendix B — Reshape log

### B.1 — 2026-05-25: philosophy-driven collapse + block (per ADR-0157)

Three coordinated decisions applied as one reshape pass after the cross-stack ADR-0157 ratification review found the prior design shape diverged from `DEVELOPMENT-PHILOSOPHY.md` principles in two load-bearing ways. Source: stack-root ADR-0157, finalized 2026-05-25.

**B.2 — Collapse 3-way taxonomy → single `protected` class.** The prior shape registered three sibling classes (`safe-address` / `safe-contact` / `safe-employer`) under a `safe-*` namespace, on the substitution-rule-heterogeneity argument. The substrate-anti-tell principle exposes that as a 2-bit oracle: knowing "this submission carries a `safe-employer` field" narrows the adversary's correlation surface in exactly the population the pipeline exists to protect. The substrate now carries a single class token `protected`. The per-subject discriminator that was previously the class token now lives as field-level Definition metadata called `subjectKind` (closed taxonomy `address | contact | employer`), reachable only by the renderer and forbidden on every chain-observable artifact. The substitution-rule-heterogeneity argument survives intact at the validator tier (see §4.2 — `SafeAddressDirectory` dispatches on `subjectKind`). Drives from philosophy's "single mechanism per concern" and the rejection that the receipt must not reveal what kind of protection is needed.

Sections updated: §3.1 (Q1 framing), §3.2 (registry shape), §3.3 (render-table copy), §3.4 (substitute/truthful field table now carries `subjectKind` column), §4.2 (validator port now per-jurisdiction × per-subject), §4.3 (resolution contract drops `enabledClasses` array; substrate carries single class), §5.1 (form-load failure table now references `protected`), §6.3 (EXT-31 collapsed from three entries to single `protected`), §6.4 (EXT-32 audience policy now scoped to single class), §7.1 / §7.2 (worked examples updated), §7.3.5 / §7.3.6 / §7.3.7 (cross-row composition disciplines updated to `protected` references, with `subjectKind` firewall added).

**B.3 — Block ratification on Trellis Phase 2 substrate.** The prior shape carried two posture tiers: `phase-1-fallback` (omit-protected-fields-from-receipt) and `verifier-grade` (Trellis Phase 2+ commitment slots + Disclosure Manifest). The fallback tier was retained on the "honest known-limitation" framing — explicit copy at form-load disclosing the structural-tell to the respondent. ADR-0157 §9 B.3 rejects that framing: the existence-of-redaction tell on an append-only chain is *permanent*; Phase 2 promotion does not retroactively repair the historical Phase 1 corpus, so the fallback tier pays its cost in survivor safety forever, not in architectural debt later refactors can clear. Per `DEVELOPMENT-PHILOSOPHY.md` *"no half-implementations"* — the honest engineering choice is to hold the pipeline until Trellis Phase 2 substrate is available and ship one complete posture. ADR-0157 status moves to `held-pending-trellis-phase-2`; FW-0049 ratification follows behind that hold.

Sections updated: §3.5 (Q4 framing — verifier-grade only, no fallback; new "Alternative rejected: dual-tier" paragraph names this reshape), §4.1 (capability key — no tier axis; presence of resolved-profile block means full substrate is online), §4.3 (resolution contract drops `receiptPostureTier`), §5.1 (form-load failure table — no "silent downgrade" carve-out, all-or-nothing), §6.5 (XS-4 = ADR-0157, held), §6.6 (standalone-ratifiable list reframes Phase 2 as load-bearing for the entire pipeline), §7.2 (worked example: no Phase 1 fallback row), §7.4 (FW-0060 build constraint #8 — reconsider existing build slice in light of fallback rejection), §8 item 4 (open question rewritten: form-load failure copy, not Phase-1-fallback honesty UI), §8 item 10 added (narrow known-tell follow-on tier deferred until a real deployment surfaces a use case), §9 decision summary (Q4 + capability shape + XS-4 rows updated with reshape markers).

**F4 — Trim §7 Formspec-Web Contract redundancy.** §7 collapsed from a multi-paragraph block (port-shape discipline, anti-precomposition warning, masking-discipline restatement) to two sentences citing FW-0049 §4.2 + web ADR-0009 §(b)'s deferral rule. The port-name guardrail prose was kept (load-bearing for the deferral); the anti-precomposition warning was dropped as redundant with §4.2's own treatment.

Section updated: §7 of stack-root ADR-0157 (this design doc unaffected; the section number §7 here refers to FW-0049's own §7 multi-party composition, untouched by F4).

**What did not change.** The threat model (§2), the masked-by-default render discipline (§3.3 — only the mask-text source reshape is new), the two-field substitute-vs-truthful authoring discipline (§3.4 — column structure preserved), the multi-party composition rule (§7.1 — operands updated but algebra unchanged), and the FW-0048 / FW-0051 / FW-0058 / FW-0042 cross-row composition shapes (§7.3 family — `safe-*` references updated to `protected`, but the AND-not-OR mask discipline is unchanged) all survive verbatim. The reshape changes vocabulary and removes the fallback escape hatch; it does not change the design's threat coverage or composition algebra.
