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
| **(c) Document-side protected content** | A supporting document upload (utility bill, lease, court order) containing protected addresses or other safe-* values that must be redacted from the document image / OCR text before submission. | **FW-0040 (file upload)**. Out of scope here. |
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
- **Design posture:** **composition test for FW-0049 × FW-0050.** Parent A's address field carries `accessControl.class: "safe-address"` (§3.1); the FW-0050 `visibleTo[]` on that field is `[parentA.roleId]` (excludes parentB); the resolver intersects the safe-address audience policy (excludes public-receipt) with the multi-party visibility (excludes parentB). The composition falls out of the substrate per §7.1; no new rule needed. **Canonical multi-party scenario; design composes cleanly.**

**Implication for the design:** FW-0049's posture is **optimized for scenarios 2.3.1 + 2.3.2 (single-party safe-address), composes cleanly with FW-0050 for 2.3.3**. Honest gaps are §8.

### 2.4 Out-of-scope coercion patterns

Named explicitly so the design isn't read as covering them:

- **Employer-correlation attack.** The abuser knows the survivor's employer; the employer's location is publicly known; the survivor's commute pattern narrows the search radius. **Out of FW-0049's reach.** Mitigation requires both `safe-address` AND `safe-employer` declarations on the form AND the survivor's lived-reality permitting employer concealment (often not the case if the form requires verified employment).
- **Metadata-leak via submission timing / network attributes.** A receipt's structural-indistinguishability addresses the bytes; an attacker correlating submission timing with known ACP-program-registration windows could infer protection. **Out of FW-0049's reach.**
- **Compromise of the issuer's audience-key.** If the abuser compels the issuer (subpoena, insider attack), the ciphertext can be opened. **Out of any field-level mechanism's reach.** Mitigation lives in the issuer's operational security; FW-0049 documents the dependency.
- **Document-side leaks** (e.g., the survivor uploads a utility bill image whose address text is OCR-readable). **FW-0040's scope.**

## 3. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 3.1 Q1 — Class taxonomy: multi-class (`safe-address`, `safe-contact`, `safe-employer`) under one `safe-*` namespace

**PROPOSAL.** Register three classes in the Access-Class Registry companion ([stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)):

| Class token | Covers | Substitution-rule shape |
|---|---|---|
| `safe-address` | Home address, mailing address, work address when the work address is residence-revealing | State-ACP substitute address (PO Box at SoS), federal-protection substitute (USMS-coordinated), deployment-jurisdiction-keyed |
| `safe-contact` | Phone number, email when the contact endpoint is residence-revealing or otherwise discoverable | Substitute phone (forwarding service registered by the protection authority), substitute email (relay address) |
| `safe-employer` | Employer name, work address when the employer is the residence-locator | **Substitution heterogeneous** — sometimes employer-cooperative; sometimes "decline to disclose"; sometimes substitute-employer (rare) |

**Namespace discipline.** All three under the `safe-*` prefix so deployments can introspect "is this a safe-* class?" by prefix rather than enumerating each. The Privacy Profile's audience-policy default treats all `safe-*` classes uniformly (excludes public-receipt audience; includes issuer-verification audience) unless an override applies.

**Justification.** J-037 names "home address, phone, employer" as protectable. The three have **different substitution rules** — substitute-address (state PO Box) is operationally distinct from substitute-phone (relay service) is operationally distinct from substitute-employer (which often has no substitute). Collapsing them into one class would force every deployment's substitution-rule adapter to handle the heterogeneous cases at one switch; sibling classes let each class's substitution adapter live independently and let the form author declare which classes are in play per item.

**Alternative rejected: single class `safe-protected`.** Brief candidate from §4 Q1 in the research brief. Rejected because the substitution-rule heterogeneity is the load-bearing operational concern — collapsing the classes pushes that complexity into runtime conditional code rather than typed class boundaries.

**Alternative rejected: jurisdiction-keyed enumeration (`safe-address-CA-ACP`, `safe-address-WA-ACP`, etc.).** Considered to let the registry encode per-jurisdiction substitution rules at the class level. Rejected because: (a) it would force the registry to track every jurisdiction's program in the class taxonomy (40+ states + federal + non-U.S.); (b) the cross-jurisdiction movement case (survivor relocates from CA to WA) would force a class change for the same field, semantically nonsensical; (c) the per-jurisdiction substitution authority belongs at the **deployment audience policy + the substitute-address validation adapter**, not in the field's class. The class names the *category*; the deployment names the *regime*.

### 3.2 Q2 — Schema property: one `accessControl.class` per ADR-0074; retire EXT-1's separate `privacy` block

**PROPOSAL.** **One schema property — `accessControl.class` per ADR-0074.** EXT-1's proposed `privacy: { protectable: bool, class: "safe-address" | "contact" | ... }` block is **retired in favor of `accessControl.class`**. EXT-1's entry in the upstream queue is updated to point at `accessControl.class` rather than introduce a separate `privacy` block.

**Why.** Two schema properties carrying overlapping semantics drift — the lint regime would need to enforce "if `privacy.protectable: true`, then `accessControl.class` ∈ `safe-*`" forever. ADR-0074's `accessControl.class` is the canonical runtime authority; the Access-Class Registry resolves class tokens to audience policy and substitution rules. The `protectable: true` adjective is implied by class membership in the `safe-*` namespace (per §3.1 namespace discipline) — no separate boolean needed.

**Author-facing UX.** Studio (and any author surface) MAY render a "Protected field" toggle that resolves to `accessControl.class: "safe-address"` (or sibling) under the hood. The toggle is author convenience; the schema property is one. Per [ADR-0074 §"Concept-implied class"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) — runtime never consults concept-implied class; lint resolves at authoring time.

**Substitution rule shape on the registry entry.** The Access-Class Registry companion's entry for `safe-address` (and siblings) carries:

```text
class: "safe-address"
namespace: "safe"
defaultAudience: ["issuer_verification"]              # NOT public_receipt; NOT verifier_public_output
excludedAudiences: ["respondent_public_receipt", "verifier_public_output", "foia_public"]
substitutionRule: {
  kind: "deployment-resolved"                          # the deployment supplies the substitute-address validator
  validatorPortRef: "SafeAddressDirectory"             # FW-0060 will name the port; the registry just declares the seam
}
# Derived-field handling: relies on ADR-0074 §"Five decisions" line 44 — cross-class FEL is a definition error
# when no Profile is loaded; under a loaded Profile, relaxation requires literal audience-array equality declared
# via flClassCompatibility (ADR-0074 §"Profile-driven relaxation"). No new "cascade" mechanism is invented here.
```

**Audience-name convention.** The audience tokens above (`issuer_verification`, `respondent_public_receipt`, `verifier_public_output`, `foia_public`) follow the **snake_case convention** established by Trellis Operational Companion §13.3 (`foia_public`, `opposing_counsel`, `appellate_court`) and ADR-0074 §1's `medical_caseworker`, `supervisor`. These specific audience tokens are **proposed for the Privacy Profile sidecar's default policy** (per EXT-32 below); they are not yet settled vocabulary. The Privacy Profile sidecar is the canonical home for audience-name registration per ADR-0074 §"Five decisions" line 45 (audience policy in the sidecar, not in Core).

**Derived-field handling re-anchor.** Per ADR-0074 §"Five decisions" line 44 + §"Profile-driven relaxation": cross-class FEL is a definition error (unconditionally when no Profile is loaded); under a loaded Privacy Profile, relaxation requires literal audience-array equality declared via `flClassCompatibility`. **FW-0049 does NOT introduce a new "cascade" mechanism;** the safe-* class declaration on a source field causes any cross-class FEL output to be a definition error unless the Privacy Profile explicitly relaxes with audience-equal `flClassCompatibility`. Derived fields needing the same protection MUST themselves be declared `safe-*`-class by the author. **This is ADR-0074's discipline, not a FW-0049 invention.**

The shape above is **proposed for the Access-Class Registry companion** (per [ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)). FW-0049 does not author the registry; it specifies the entries needed.

**Justification.** ADR-0074 §"Five decisions" line 41–45 explicitly anticipates this pattern (Core treats class as opaque token; taxonomy + audience policy in the companion). Adding `safe-*` classes is the registry-tier work the ADR seams for.

**Alternative rejected: separate `privacy` block per EXT-1.** Brief candidate Q2 reasoning. Rejected per the drift argument above.

**Alternative rejected: per-form ad-hoc audience declaration without registry entry.** Considered to let each form author declare its own safe-* audience policy inline. Rejected because: (a) cross-form consistency matters for the verifier's "this receipt withholds safe-address fields" semantics — different per-form audience names would break verifier-side rendering; (b) the registry is the canonical home for cross-form vocabulary per ADR-0074 §"Five decisions" line 45.

### 3.3 Q3 — Render-side default: masked-by-default with explicit per-act reveal

**PROPOSAL.** Safe-*-class fields render as **masked** (`••••••` or `"(protected)"` per the locale's accessible-mask convention) by default in every form surface the respondent sees, with an explicit per-act reveal affordance the respondent must invoke (single tap / click; no double-step required; no warning prompt that would itself signal "this is sensitive").

| Surface | Render behavior |
|---|---|
| Form-fill page (active editing) | Field renders masked; reveal affordance present; on focus, the input shows the typed value (otherwise a coercion-style shoulder-surf defense becomes a usability blocker). Edit-mode IS reveal. Save / blur returns to masked. |
| "Preview my answers" / review surface | Masked by default; reveal affordance per-field; "reveal all" affordance is **not provided** (forces per-act reveal decisions). |
| "Share screen / screenshot" affordances (if the respondent invokes platform screen-share) | The form's render is masked; reveal is unavailable while screen-share is detected (best-effort — the API surface for screen-share detection is browser-imperfect; this is mitigation, not guarantee). |
| Post-submit status page | Safe-* fields are **never rendered** on the status surface. Status copy refers to the field by label only ("Mailing address: confirmed") without the value. |
| Public receipt | Safe-* fields are **never rendered** with plaintext (§3.4 substrate path delivers this). |
| Verifier output | Same as receipt — never plaintext (§4 substrate path). |
| Developer-view toggle (per [`formspec-web/CLAUDE.md`](../../CLAUDE.md) §"Vocabulary firewall") | Safe-* class metadata IS visible in dev view; plaintext values are NOT. |

**Justification.** Shoulder-surfing, screen-sharing accidents (the respondent shares their screen with a benefits navigator and forgets the safe-* field is shown), and screenshot-leaks (the respondent screenshots a confirmation, the screenshot goes to cloud-photo backup, the backup is later compromised) are the canonical incidental-leak vectors. Masked-by-default + per-act reveal mirrors the mature banking-app account-number masking pattern — users tolerate it, the discipline is well-understood, and the per-act reveal is a single decision rather than a workflow break.

**Per-act reveal is NOT auditable.** The fact that the respondent tapped reveal is not recorded in the public receipt or any audience-disclosed artifact (otherwise the reveal-event becomes its own metadata leak — "she revealed her address three times during the session"). Per-act reveals MAY be recorded in the respondent-private ledger for the respondent's own session-history view; that ledger is not exported.

**Alternative rejected: always-render-on-respondent's-own-screen.** Brief candidate Q3 first option. Rejected: assumes only the respondent sees their own screen, which is contradicted by all three incidental-leak vectors. Same anti-tell discipline as FW-0048 §3.2 byte-identical-success-path: the safer default is the more defensive default.

**Alternative rejected: masked-by-default with no reveal at all.** Considered for strongest protection. Rejected: makes form-fill nearly impossible (the respondent needs to confirm what they typed; the "(protected)" mask alone is too lossy). The per-act reveal is the necessary affordance.

**Alternative rejected: double-step reveal (confirm dialog before unmask).** Rejected: itself a signal — a shoulder-surfer would observe the confirm dialog. Single-tap is sufficient defense for the in-flow case; the discipline is consistent with bank-app patterns.

### 3.4 Q3.5 — Substitute-address vs truthful-value: form authoring declares both fields

**PROPOSAL.** Forms with safe-address support declare **two fields** for the protected concept: a substitute (publicly-disclosable) field and a truthful (verification-only) field. The substitute is the user-facing entry; the truthful is supplied only when the deployment's verification audience requires it.

| Field | accessControl | Audience | Render |
|---|---|---|---|
| `mailingAddress` | `class: "procedural"` (or `unclassified`) | All audiences | Plaintext rendered |
| `protectedHomeAddress` | `class: "safe-address"` | `issuer_verification` audience only | Masked + per-act reveal; never rendered to `respondent_public_receipt` / `verifier_public_output` / `foia_public` |

The form's UI presents this as a single conceptual address with a "Protected address" flag — the respondent toggles "I'm in an Address Confidentiality Program" and the substitute-address field appears alongside the truthful-address field. The substitute (e.g., CA SoS PO Box) goes to public audiences; the truthful goes to the issuer-verification audience only.

**The truthful-address field is the substantive one for verification.** The substitute is what the public artifact carries; the truthful is what the eligibility predicate is evaluated against (eligible-because-resides-in-CA). The receipt's commitment-with-proof (Q4 below) is over the truthful value.

**Why two fields, not one.** Collapsing into one field (with the runtime deciding whether the entered value is "substitute" vs "truthful") forces ambiguity into a security-critical surface — a misread would mean either (a) the substitute is sent to verification (eligibility falsely fails or succeeds), or (b) the truthful is sent to public-receipt (the safety failure). **Two fields = no ambiguity.** The form-design discipline is: the substitute is always one field; the truthful is always another field; both are required when the respondent toggles ACP-enrollment.

**Justification.** California Safe at Home (Govt. Code §6206) is explicit: the substitute address is what state agencies enter into records; the truthful is held by the SoS and disclosable only by court order. The two-field model maps directly onto the legal contract.

**Alternative rejected: single field with runtime substitution.** Per the ambiguity argument above.

**Alternative rejected: substitute-only (don't collect truthful in the form).** Rejected because verification of eligibility (resides-in-CA, resides-in-relevant-school-district) requires the truthful value. Some forms might be substitute-only (no verification needed); for those forms the safe-address class is on a single field whose audience is "issuer-verification" but whose substitution-rule lets the substitute be the disclosed value. **The two-field model is the default; single-field substitute-only is a profile-extension.**

### 3.5 Q4 — Receipt-side semantics: withhold-with-commitment-proof via Trellis Phase 2+ OC-26/27/30; Phase 1 fallback is full-omit with honest insufficient-coverage acknowledgement

**PROPOSAL.** The verifier-grade receipt for safe-*-class fields rides Trellis Phase 2+ selective-disclosure substrate per Trellis Core §13 commitment slots + Operational Companion OC-26/27/30 Disclosure Manifest. The receipt carries:

1. A **commitment slot** populated at admit time for every safe-*-class field, whether or not the respondent invoked safe-address handling — **OC-26 uniform slot-population discipline**. This is the structural-indistinguishability anchor: the slot's *presence* is uniform across all submissions of a `safeAddress`-enabled form; the slot's *opening* (revealed plaintext vs. committed-only) carries the protection.
2. A **Disclosure Manifest** (OC-27) per audience: the `respondent_public_receipt` audience entry lists safe-* fields in `committed_only_fields[]` (i.e., committed but withheld); the `issuer_verification` audience entry lists them in `disclosed_fields[]`; the `verifier_public_output` audience entry lists them in `committed_only_fields[]`. The manifest carries `commitment_proofs` (OC-27 item 9) tying the disclosed/committed-only fields to the Core §13 commitment slots.
3. **Independent auditability per OC-30:** an auditor MUST be able to verify that the commitment slots in the canonical record match the commitments in the manifest *without* requiring access to plaintext. The verifier's positive verdict reads: *"This submission contained a protected address field that satisfied the form's eligibility predicate; the address value is not present in this receipt."*

**Response-vs-Receipt distinction (foundational).** The Response (what the issuer processes per ADR-0074 bucketed wire shape, §7.2.6) and the Receipt (what the public verifier reads per Trellis envelope) are **distinct artifacts at different layers**. The design's substrate answer differs per artifact: Response → bucketed encryption (per-audience key-bag, plaintext unreachable without audience key); Receipt → commitment-with-proof (audience-scoped Disclosure Manifest, no plaintext at any audience-derivation path). The two mechanisms **compose**, not substitute.

**Phase boundary.** Per Trellis Core §13.3, **Phase 1 producers MUST emit `commitments` as `null` or `[]`.** This means:

- **Phase 1 fallback (honest insufficient-coverage):** the receipt omits the safe-* fields entirely (no commitment slot, no manifest entry). **This is a structural tell** — the value itself does not leak (omission is total), but the PRESENCE OF the protection invocation leaks: a public-receipt observer who knows the form's schema sees that the address field is absent where it would normally appear, and infers "this respondent invoked safe-address protection." With auxiliary data (jurisdiction, form type, demographic), the respondent may be inferable as ACP-enrolled (or witness-protection / etc.) — which is itself sensitive in adversarial threat models (employer-correlation attack class §2.4). Useable for low-risk forms where the tell is acceptable; **NOT acceptable** for J-037's canonical scenarios.
- **Phase 2+ verifier-grade:** the receipt populates the commitment slot uniformly + emits the Disclosure Manifest. **Structurally indistinguishable**; satisfies J-037 Done.

**Failure semantics tie-in (§5).** A form declaring `safeAddress` REQUIRED MUST fail-load on a Phase 1-only deployment per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) `UnsupportedRequiredFeatureError`. Silent fall-through to the Phase 1 fallback is forbidden for `required` form policy — the deployment must declare Phase 2+ substrate availability or refuse the form.

**Justification.** Verifier independence (Trellis Core §16) requires the verifier validate from the receipt's public bytes alone. OC-30 delivers exactly this: commitment proofs let an auditor verify *that* the field was correctly committed without learning *what* the field was. This is the only structurally-correct path for the J-037 "receipt structure is consistent whether or not the respondent is in an ACP" requirement.

**Alternative rejected: full-omit-from-receipt as the primary path.** Rejected per the structural-tell argument above; documented as Phase 1 fallback only.

**Alternative rejected: encrypt-to-named-audience without commitment slot.** Considered: HPKE-wrap the safe-* field plaintext to the verifier audience's public key, same as FW-0048 §5.2 routes the duress payload to the safety-team recipient. Rejected because: (a) the verifier-public-output audience is NOT a holder of a private key — the public verifier is supposed to validate without contacting an authority; (b) the structural-indistinguishability requirement at the *receipt* layer (not the event layer like FW-0048) needs commitment slots, not HPKE wrap; (c) the verifier-grade "satisfied the predicate" claim is a commitment-proof concept, not an opaque-ciphertext concept. **Different substrate path than FW-0048 because the audience model is different.**

**Alternative rejected: rely on the bucketed-Response per ADR-0074 alone, no Trellis-side commitment slots.** Considered: ADR-0074's bucketed-Response with per-class key-bag already routes the safe-* field's plaintext to the issuer-verification audience only. Why also need Trellis commitment slots? Rejected because: (a) the bucketed-Response is an *encryption* mechanism (the plaintext is in the ciphertext but unreachable without the audience key) — it does NOT support an auditor's "verify-without-plaintext" claim per OC-30; (b) the verifier-public-output (the publicly-validable receipt) is a *different* artifact than the Response payload — the receipt is what the verifier reads; the Response payload (bucketed or not) is what the issuer processes. The receipt-layer redaction needs commitment slots; the Response-layer encryption needs bucketed-Response. **They compose**, they don't substitute.

**Composition with ADR-0074 bucketed-Response.** The Response carries the safe-* field's plaintext in a bucket wrapped to the issuer-verification audience. The Receipt carries the same field's commitment + manifest entry (Phase 2+) without plaintext. The Response and the Receipt are different artifacts at different layers; both protect the plaintext from the public-receipt audience. The bucketed-Response mechanism is required even Phase 1 (it's the at-rest / in-transit confidentiality boundary). The commitment-slot mechanism is required Phase 2+ (it's the structural-indistinguishability + verifier-grade-redaction boundary).

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011

`safeAddress` is **already enumerated** in the [Feature Ownership Table at line 147](../adr/0011-runtime-feature-resolution-and-policy-gates.md): instance capability = "privacy/redaction substrate"; org policy = "jurisdictional protection policy"; form policy = "protected fields declared". FW-0049 codifies the carrier for each layer.

| Layer | What it carries for `safeAddress` |
|---|---|
| Instance capability | Adapter-backed: (a) bucketed-Response runtime per ADR-0074 (Phase 1, required for any `safeAddress` claim); (b) Trellis Phase 2+ commitment-slot substrate per Core §13 (required for the verifier-grade `committed-with-proof` posture); (c) `SafeAddressDirectory` adapter for substitute-address validation (deployment-supplied; per-jurisdiction). Instance declares the highest tier it can serve (Phase 1 fallback vs. Phase 2 verifier-grade). |
| Org policy | (a) Per-jurisdiction substitute-address authority configuration (e.g., this deployment honors CA ACP, WA ACP, USMS witness-protection); (b) audience-policy floor (which deployment-side audiences may receive plaintext); (c) public-receipt audience exclusions; (d) FOIA-disclosure policy (some agencies have FOIA carve-outs for safe-* values; some do not). |
| Form policy | Form declares the safe-* class on the applicable items (per §3.1 + §3.2); declares the receipt-side posture required (`verifier-grade` requires Phase 2 substrate; `phase-1-fallback` accepts the structural-tell); declares the multi-party `visibleTo[]` per-party scope (composes with FW-0050 §7.1). |
| Resolved runtime profile | Enabled safe-* class set + receipt posture tier + substitute-address validator port handle + per-jurisdiction registry handle. Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if `verifier-grade` is required but only Phase 1 substrate is available. |

**Tier is a first-class form-policy declaration, not a runtime-derived value** — same discipline as `multiParty.tier` in FW-0050 §3.1 and `duressAware.mechanism × routingTier` in FW-0048 §4.1. The form author declares the required posture explicitly; the resolver does not infer.

### 4.2 Port shape — adopter contract now; port shape deferred to FW-0060 build

Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md): post-MVP ports await consumer code. FW-0049 is a design row; FW-0060 is the build. The honest application is to specify the **adopter contract** here and let the port shape land with the build.

**Adopter contracts (what FW-0060 must satisfy).**

| Adopter axis | What it implies |
|---|---|
| `SafeAddressDirectory` adapter (per-jurisdiction substitute-address validation) | Given a candidate substitute address + a jurisdiction key (e.g., `"CA-ACP"`, `"WA-ACP"`, `"USMS-WitSec"`), returns whether the address is a valid substitute (rejecting `123 Fake St`). Deployment-supplied; the registry of validators per jurisdiction is configured per-deployment. Failure semantics: rejection is a per-field validation error rendered to the respondent ("This is not a recognized California ACP substitute address"). |
| Bucketed-Response writer adapter (per ADR-0074) | Routes safe-*-class field values into a separate bucket wrapped to the issuer-verification audience's public key. Existing per ADR-0074 Phase 5 (Emission); FW-0060 wires the safe-* class through. |
| Trellis commitment-slot writer adapter (Phase 2+) | Populates the OC-26 commitment slot for safe-*-class fields uniformly per submission. Phase 2+ substrate; deferred. |
| Disclosure Manifest emitter adapter (Phase 2+) | Emits the per-audience Disclosure Manifest entries per OC-27. Phase 2+ substrate; deferred. |
| Receipt-renderer adapter | Renders the verifier-grade receipt without plaintext for safe-* fields; renders "verified to satisfy [predicate]" copy from the commitment-proof verdict. |

**Why not invent a `SafeFieldProtector` port here.** Per ADR-0009 §(b) the bar is consumer code, not predicted-need. The substitute-address validator + bucketed-Response writer + commitment-slot writer + manifest emitter are **separate adopter axes**; collapsing them into one port would be speculation. FW-0060 picks the port shape at build time when the adapters are co-implemented. The substitute-address validator port likely lands first (Phase 1) and stays standalone; the Trellis-side adapters land Phase 2+ and may reuse Trellis-side existing ports.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a `safeAddress` block:

```text
safeAddress?: {
  enabledClasses: Array<"safe-address" | "safe-contact" | "safe-employer">
  receiptPostureTier: "verifier-grade" | "phase-1-fallback"
  substituteAddressDirectoryRef: string                    // handle into the per-jurisdiction validator
  acpJurisdictionsAccepted: Array<string>                   // e.g., ["CA-ACP", "WA-ACP", "USMS-WitSec"]
  rendererHints?: {
    maskRenderToken?: string                                // locale-aware mask copy ("(protected)" / "••••••")
    revealAffordanceLabel?: string                          // locale-aware reveal-button copy
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
| Form requires `safeAddress` (`receiptPostureTier: "verifier-grade"`) but instance lacks Trellis Phase 2+ substrate | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `safeAddress` but instance lacks `SafeAddressDirectory` adapter for the form's `acpJurisdictionsAccepted[]` | `UnsupportedRequiredFeatureError` at form-load |
| Form declares `safe-*` class on an item but org policy forbids `safeAddress` for the form's jurisdiction | `FeaturePolicyConflictError` at form-load |
| Form's safe-* class declaration conflicts with the form's multi-party `visibleTo[]` (e.g., `visibleTo` includes the public-receipt audience for a safe-* field) | `InvalidRuntimePolicyError` at form-load (per FW-0050 §7.1) |
| Form's bucketed-Response audience policy is incomplete (no audience configured to receive plaintext safe-* values for verification) | `InvalidRuntimePolicyError` at form-load |

**Silent downgrade is forbidden.** A form requiring `safeAddress` MUST fail-load on a Phase 1-only deployment when the form declares `receiptPostureTier: "verifier-grade"`. Deployments may serve forms declaring `phase-1-fallback` posture, but the respondent-facing form-load surface MUST render an honest "protection-level: structural-tell" disclosure copy so the respondent can make an informed choice about whether to submit on that deployment.

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
+ EXT-31 (new — proposed below: Access-Class Registry entries for safe-*)
+ EXT-32 (new — proposed below: Privacy Profile default audience policy for safe-*)
+ web ADR-0011 (Feature Ownership Table for `safeAddress` is already present; resolved profile shape lands per §4.3)
    ↓
XS-4 ratification (new cross-stack ADR proposed below; spans formspec + WOS + trellis)
    ↓
FW-0060 build (formspec-web)
```

### 6.2 EXT-1 — update direction

EXT-1 ([`thoughts/specs/2026-05-22-upstream-extension-queue.md:26`](2026-05-22-upstream-extension-queue.md)) currently proposes three sibling blocks on items — `consequences`, `purpose`, `privacy` — and names J-037 + FW-0049 in `Closes:`. The `privacy` block proposes `protectable: bool` + `class` enum.

**FW-0049 design recommends:** the `privacy` block is **retired** from EXT-1; the `consequences` and `purpose` blocks remain (they close other journeys). EXT-1's safe-address purpose is satisfied by ADR-0074's `accessControl.class` + the new Access-Class Registry entries (EXT-31 below). The EXT-1 entry in the upstream queue is updated to reflect this scope reduction.

### 6.3 EXT-31 (new) — Access-Class Registry entries for safe-*

**Proposed for upstream extension queue.** The Access-Class Registry companion ([stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), **not yet authored**) gains three new class entries per §3.1 + §3.2:

```text
class: "safe-address"
namespace: "safe"
defaultAudience: ["issuer_verification"]
excludedAudiences: ["respondent_public_receipt", "verifier_public_output", "foia_public"]
substitutionRule: { kind: "deployment-resolved", validatorPortRef: "SafeAddressDirectory" }

class: "safe-contact"
namespace: "safe"
defaultAudience: ["issuer_verification"]
excludedAudiences: ["respondent_public_receipt", "verifier_public_output", "foia_public"]
substitutionRule: { kind: "deployment-resolved", validatorPortRef: "SafeContactDirectory" }

class: "safe-employer"
namespace: "safe"
defaultAudience: ["issuer_verification"]
excludedAudiences: ["respondent_public_receipt", "verifier_public_output", "foia_public"]
substitutionRule: { kind: "heterogeneous-deployment-resolved" }
```

`safe-employer`'s substitution-rule is `heterogeneous-deployment-resolved` because employer concealment varies widely; deployment-specific.

**Derived-field handling** for all three classes relies on ADR-0074 §"Five decisions" line 44 cross-class FEL definition-error discipline; no new "cascade" mechanism is introduced. Derived fields needing the same protection MUST be declared `safe-*`-class explicitly by the form author, or rely on Privacy Profile `flClassCompatibility` declarations (only valid when audience arrays are literally equal per ADR-0074 §"Profile-driven relaxation"). **The audience names above are proposed for the Privacy Profile sidecar's default policy (EXT-32);** they are not yet settled vocabulary.

**Parent file dependency:** this entry presumes `formspec/specs/registry/access-class-registry.md` is authored as part of the ADR-0074 promotion path; the file does not yet exist (verified 2026-05-23 — `formspec/specs/registry/` contains only `changelog-spec`, `extension-registry`, `signature-method-registry`).

### 6.4 EXT-32 (new) — Privacy Profile default audience policy for safe-*

**Proposed for upstream extension queue.** The Privacy Profile sidecar ([stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), **not yet authored**) gains a default audience-policy entry for the `safe-*` namespace. The default policy (audience tokens snake_case per Trellis OC §13.3 + ADR-0074 §1 convention):

- `safe-*` classes have `issuer_verification` audience as the only audience receiving plaintext;
- the audience `respondent_public_receipt` is explicitly excluded;
- the audience `verifier_public_output` is explicitly excluded;
- the audience `foia_public` is excluded by default (overridable per-deployment for specific jurisdictions that legally mandate disclosure — e.g., a specific elected-official disclosure rule that overrides ACP; rare but exists);
- per-jurisdiction overrides land as Privacy Profile additions per deployment.

**Audience-name registration is the Privacy Profile sidecar's authority** per ADR-0074 §"Five decisions" line 45; the tokens above are proposed defaults, not settled vocabulary.

**Parent file dependency:** this entry presumes `formspec/specs/privacy/privacy-profile.md` is authored as part of the ADR-0074 promotion path; the file does not yet exist (verified 2026-05-23 — `formspec/specs/privacy/` does not exist).

### 6.5 XS-4 (new) — Cross-stack ADR for safe-address pipeline

**Proposed for stack-root.** Spans formspec (Access-Class Registry safe-* entries + Privacy Profile default audience policy), WOS (per-actor audience policy for safe-* in the applicant API + governance projections), and trellis (Phase 2 OC-26/27/30 commitment-slot + Disclosure Manifest binding for safe-* fields).

**XS-4 proposed content (consumer perspective):**

1. **Boundary:** at `intake-handoff` plus the Trellis admit step. Formspec owns the field-level class declaration + bucketed-Response shape; Trellis carries the Phase 2 commitment slots + Disclosure Manifest; WOS owns per-actor audience policy when WOS is the deployment's governance layer.
2. **Trellis discipline (Phase 1 fallback + Phase 2 verifier-grade).** Phase 1: bucketed-Response delivers at-rest / in-transit confidentiality (ADR-0074); receipt-side semantics are full-omit-with-structural-tell. Phase 2: OC-26 uniform commitment-slot population for safe-* fields whether or not the respondent is in a protection program; OC-27 Disclosure Manifest entries per audience; OC-30 independent auditability for the verifier-grade claim. **Phase 2 is required for the verifier-grade tier**; Phase 1 fallback is honest but structurally insufficient for J-037 canonical scenarios.
3. **WOS actor scope (when WOS is the governance layer).** The applicant API + governance projections MUST consult the Privacy Profile audience policy before rendering safe-* fields to a requesting actor. A caseworker actor with `eligibility-determination` role gets plaintext; a caseworker actor with `intake-only` role gets the substitute address only. **Composition with FW-0050 §7.1 per-party scoping applies:** when the case is multi-party, the per-party `visibleTo[]` further constrains who can see whose safe-* fields.
4. **Receipt discipline:** the verifier surface MUST NOT distinguish safe-address-redacted receipts from non-redacted receipts at the structural level — same commitment slots populated, same manifest shape emitted (just different `disclosed_fields`/`committed_only_fields` per the per-form audience config). Verifier conformance suite must include fixtures covering (a) submission with no safe-* fields, (b) submission with safe-* fields disclosed to the public audience (rare), (c) submission with safe-* fields committed-only to the public audience (canonical J-037 case) — all three MUST produce structurally-similar receipts modulo the commitment-slot openings.
5. **Multi-party composition (FW-0050 §7.1 binding):** see §7 below.
6. **PKAF/Rulespec downstream:** when a safe-*-protected value is referenced by a downstream PKAF assertion (e.g., a determination citing residence-eligibility), the assertion's access-scope MUST inherit a regulatory-restricted scope reflecting the upstream `accessControl.class`. **Vocabulary tokens (`rkaf:AccessScope`, `dpv:Location`, `dpv:hasPersonalDataCategory`) are ILLUSTRATIVE pending Rulespec alignment row** — PKAF substrate lives at `PKAF/specs/` but no spec-level verification that these specific token names are settled vocabulary; the XS-4 ratification establishes the binding contract using whatever PKAF tokens are canonical at that time.

**Subsystem-count honesty.** XS-4 spans formspec + WOS + trellis only for the **verifier-grade tier**. The Phase 1 fallback (bucketed-Response + EXT-31/32 registry) is formspec-only + WOS-conditional ("when WOS is the governance layer" per item 3 above). The Trellis dependency is Phase-2-conditional. XS-4 could ratify in two waves: a Phase-1 wave (formspec + WOS-conditional) earlier, and a Phase-2 verifier-grade wave when Trellis Phase 2 substrate lands.

**Without XS-4 ratification, FW-0049 design cannot be acted on by FW-0060.** The dependency is hard. XS-4 itself is partially achievable on Trellis Phase 1 (the EXT-31/32 registry work + the bucketed-Response binding are Phase 1); the verifier-grade receipt path waits on Trellis Phase 2.

### 6.6 What FW-0049 ratifies standalone

**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `safeAddress` capability shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the resolved-profile block in §4.3, the tier axes (`verifier-grade | phase-1-fallback`), the failure-semantics binding.
- The runtime render discipline per §3.3 (masked-by-default + per-act reveal).
- The two-field substitute-vs-truthful authoring discipline per §3.4.
- The per-party composition rule with FW-0050 (§7).
- The adopter-contract pattern over the per-jurisdiction `SafeAddressDirectory` adapter (§4.2) — the conformance fixture pattern can be authored now even though the port shape lands with FW-0060 build.

**Waits on upstream:**

- The Access-Class Registry safe-* entries (EXT-31).
- The Privacy Profile default audience policy for safe-* (EXT-32).
- The XS-4 cross-stack ADR (spans formspec + WOS + trellis).
- ADR-0074 promotion from Proposed to Accepted (current status: Proposed per [ADR-0074 header](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md)). FW-0049 design depends on the ADR-0074 substrate; if ADR-0074 evolves in flight, FW-0049 follows.
- Trellis Phase 2 substrate (Core §13 commitment slots + OC-26/27/30) for the verifier-grade tier. The Phase 1 fallback works without it but is structurally insufficient for J-037 canonical scenarios.
- EXT-1 update direction (retire the proposed `privacy` block; the `consequences` and `purpose` blocks remain).

## 7. Multi-party composition (FW-0050 §7.1 satisfaction)

This is the section [FW-0050 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) explicitly cites as the safe-address-class-taxonomy source. FW-0050 names the composition rule; FW-0049 satisfies the safe-address half.

### 7.1 The composition rule

Per FW-0050 §7.1: *"when a form declares both `multiParty` and `safeAddress` features, the resolved runtime profile composes them: a protectable field's `visibleTo[]` is intersected with the safe-address jurisdictional rule. If the intersection is empty (no party can legally see the protected value), the form-load surfaces an `InvalidRuntimePolicyError` per web ADR-0011. Silent leak forbidden."*

FW-0049's contribution: the **safe-address audience policy** (§3.4 + §6.4) supplies the right operand of the intersection. The composition:

- Form declares: field carries `accessControl.class: "safe-address"`; per-form Privacy Profile audience policy lists `[issuer_verification]` as the only plaintext audience.
- FW-0050 declares: field's `visibleTo[]` lists `[parentA.roleId]` (excludes parentB).
- Resolver intersects: parentB-receiving audiences = `{parentB.roleId, respondent_public_receipt}` ∩ `{issuer_verification}` = empty. parentA-receiving audiences = `{parentA.roleId, issuer_verification}` ∩ `{issuer_verification}` = `{issuer_verification}`. **No leak to parentB; verification flows to the `issuer_verification` audience; canonical case works.**
- Failure case: form declares `visibleTo: [respondent_public_receipt]` for a `safe-address` field (form-author error). Intersection with safe-address audience policy = empty for the public-receipt slot. `InvalidRuntimePolicyError` at form-load.

### 7.2 The canonical child-custody case worked example

Per §2.3.3 worked scenario:

- Field `parentA.homeAddress` carries `accessControl.class: "safe-address"`, FW-0050 `visibleTo: [parentA.roleId]`.
- Field `parentB.homeAddress` carries `accessControl.class: "unclassified"` (or `procedural`), FW-0050 `visibleTo: [parentA.roleId, parentB.roleId]` (mutually disclosed).
- The receipt structure:
  - Public receipt: parentA's address committed-only (with commitment proof per Phase 2+); parentB's address disclosed in plaintext.
  - parentA-receipt audience: both addresses present in plaintext (parentA owns the safe-address value).
  - parentB-receipt audience: parentA's address committed-only (without unwrap key); parentB's address present in plaintext.
  - `issuer_verification` audience: both addresses in plaintext (eligibility evaluation).
- Phase 2+ commitment slots: populated for `parentA.homeAddress` in every submission of this form (uniform shape); the slot's opening differs per audience per the Disclosure Manifest.
- Phase 1 fallback: `parentA.homeAddress` is OMITTED from the public-receipt entirely; the receipt structure differs from a same-form submission where neither parent is ACP-protected. **The Phase 1 fallback is structurally insufficient for this scenario; Phase 2+ substrate is required.**

### 7.3 FW-0048 composition (coercion-adjacent)

FW-0048 (coercion-aware signing) and FW-0049 (safe-address) are adjacent but distinct: coercion is event-time signal; safe-address is field-level known-protectable value. They compose:

- A form requiring both `duressAware` (FW-0048) and `safeAddress` (FW-0049) declares both capabilities; the resolver returns both blocks in the `ResolvedRuntimeProfile`.
- The duress signal's HPKE-wrapped payload (FW-0048 §5.2) and the safe-address bucketed-Response routing (this design §3.4 + §3.5) are independent substrate paths — both can fire on the same submission.
- The verifier sees: a `submission.duress-signaled` event (with HPKE-wrapped payload per FW-0048 §5.2 — opaque without safety-team key), and a safe-address commitment-with-proof per this design §3.5. **No interaction**; both protect different concerns through different substrate paths.

### 7.3.5 FW-0051 composition (BYO-assistant — safe-* mask survives FW-0051 reveal)

FW-0051 (bring-your-own-assistant) and FW-0049 (safe-address) compose at the Assist introspection surface: the Assist Provider's `formspec.field.describe` returns `FieldDescription` (Assist §4.4) including `value`, and FW-0051 §3.2 masks `value` by default with a per-field reveal escalation (FW-0051 §3.3) as the unmask gate. **For safe-*-class fields, the FW-0049 §3.3 mask is a SEPARATE, HIGHER-PRIORITY mask that survives the FW-0051 reveal.** Per [FW-0051 §7.2](2026-05-23-fw-0051-bring-your-own-assistant-design.md): the Assist Provider NEVER unmasks safe-*-class fields regardless of the respondent's Stage 3 per-field reveal grant. The discipline composes via "AND" not "OR": both masks must be lifted for unmask; the safe-* mask cannot be lifted by FW-0051's reveal.

**Justification.** FW-0049's mask exists for shoulder-surfing / screen-share defense; the respondent's own awareness of the value is mediated by their own UI's reveal (FW-0049 §3.3 "edit-mode IS reveal"). For the assistant case, the respondent revealing a safe-* value to the assistant is a separate, stronger consent decision than revealing a normal field's value. Slice 1 chooses the safer default: assistants never see plaintext safe-* values. If a future use case demands safe-*-class fields be revealable to assistants (e.g., legal-aid software helping a survivor fill a benefits form), a follow-on row revisits with a stronger consent surface.

**FW-0060 build constraint addition (consumed by FW-0060 author directly):** the Assist Provider implementation under FW-0062 build MUST mask safe-*-class fields in `FieldDescription.value` unconditionally; the FW-0062 build's per-field reveal grant store MUST exclude safe-*-class fields from the unmaskable set. Conformance fixtures cover the safe-* + Assist composition case.

### 7.3.6 FW-0058 composition (AI-agent filer — safe-* mask survives agent read)

FW-0058 (AI-agent filer chain) and FW-0049 (safe-address) compose at the agent-introspection surface: when an AI agent files on behalf of a protected party (e.g., a property-management agent filing a tenant application on behalf of a survivor; a benefits-AI filing on behalf of a protected elder), **the safe-* mask survives the agent's WOS-governed read identically to the BYO-assistant case (§7.3.5).** Per [FW-0058 §7.3 in the 2026-05-24 design](2026-05-24-fw-0058-ai-agent-filer-chain-design.md): the agent itself does NOT gain visibility into the safe-* field; the agent submits the form WITHOUT seeing the plaintext value; the receipt carries the safe-* class declaration unchanged.

**Operational pattern.** The agent operator may need additional inputs to fill safe-* fields (e.g., the protected party provides their safe-address out-of-band to the operator, who supplies it to the agent through a side channel); this is the operator's substrate concern, NOT FW-0049's. FW-0049's discipline binds the form's introspection surface — what the agent sees through the form's substrate — not what the operator may pre-load into the agent's runtime by other means.

**Verifier rendering.** The verifier renders BOTH the four-party agent chain (per FW-0058 §3.3) AND the safe-* class declaration on the protected field. Both surfaces compose naturally as independent decorations on the receipt; neither suppresses the other.

**FW-0060 build constraint addition:** the safe-* mask discipline applies uniformly across all programmatic readers — Assist Provider (FW-0051), agent introspection (FW-0058), and any future reader. The per-reader-type unmask exception list is intentionally empty for safe-*-class fields.

### 7.3.7 FW-0042 composition (trusted-reviewer — safe-* mask survives reviewer-read; suggest forbidden on safe-*)

FW-0042 (share-draft-with-trusted-reviewer) and FW-0049 (safe-address) compose at the reviewer-introspection surface symmetrically with the FW-0051 / FW-0058 composition (§7.3.5 / §7.3.6). Per [FW-0042 §6.3 + §3.4](2026-05-25-fw-0042-trusted-reviewer-design.md): safe-*-class fields auto-mark as `respondentOnly: true` for reviewers, regardless of form-policy `respondentOnlyFieldPointers[]`. The reviewer's session renders the safe-* field as a masked label ("Respondent-only field — value hidden from reviewers"); the reviewer can leave a comment on the masked field (advising about a field they cannot see the value of — "Mom, double-check the SSN field looks right") but the suggest affordance is structurally HIDDEN (the reviewer cannot suggest a value for a field they cannot see, mirroring the FW-0051 + FW-0058 disciplines — a "blind" suggestion would leak information about expected value shapes via the input semantics).

**Composition discipline matches the filer-side per FW-0037 §6.3.** The "comment OK; suggest forbidden" split applies symmetrically across the human-reviewer (FW-0042), AI-assistant (FW-0051), and AI-agent (FW-0058) readers — none can see safe-*-class plaintext, and none can author suggestions / writes against safe-*-class fields. The per-reader-type unmask exception list (§7.3.5 + §7.3.6) stays intentionally empty for safe-*-class fields; FW-0042's reviewer joins the same uniform discipline.

**FW-0060 build constraint addition:** the reviewer-side renderer under FW-0113 (FW-0042 build row) MUST mask safe-*-class fields in the reviewer session; the suggest affordance MUST be structurally absent for safe-*-class fields (per FW-0042 §3.4 + §4.2 substrate refusal `SuggestionForbiddenOnRespondentOnlyFieldError`). Conformance fixtures cover the safe-* + reviewer-share composition case per FW-0042 §10 (fixture 9).

### 7.4 FW-0060 build constraints (consumed by FW-0060 author directly)

The FW-0060 build is responsible for:

1. **Per-jurisdiction substitute-address validator adapter.** Reference adapters for at least California Safe at Home, Washington ACP, and USMS Witness Security; additional jurisdictions land per-deployment.
2. **Bucketed-Response writer for safe-* class fields.** Per ADR-0074 Phase 5 (Emission) — already a substrate concern; FW-0060 wires the safe-* class through.
3. **Trellis Phase 2 commitment-slot writer (deferred until Trellis Phase 2 ratifies).** Phase 1 fallback is the omit-from-public-receipt path with honest insufficient-coverage copy.
4. **Disclosure Manifest emitter for the safe-address audience set (deferred Phase 2+).**
5. **Receipt renderer that respects the per-audience disclosure.** The verifier-public-output renders "verified to satisfy [predicate]" for safe-* fields when commitment-proofs are present; renders "(field omitted)" with the honest structural-tell disclosure when only Phase 1 substrate.
6. **Render-discipline implementation per §3.3.** Masked-by-default per-act-reveal across all respondent-facing surfaces.
7. **Multi-party composition conformance fixtures per §7.1 + §7.2.**

## 8. Open questions / deferrals

Honest list of what FW-0049 design does NOT resolve:

1. **The employer-correlation attack class (§2.4).** A survivor whose employer is known cannot fully protect their address via address-substitution. **Out of any field-level mechanism's reach.** Documented; not mitigated by this design.
2. **Per-jurisdiction substitute-address registries (§1.2).** 40+ states with ACP; varying federal regimes. **Deployment concern.** FW-0060 ships reference adapters for the canonical few; per-deployment work for the rest.
3. **Cross-class FEL derivations (research brief Q6).** A FEL-derived value reading a `safe-address` input — what happens when the derivation flows through a less-restrictive class? Resolved per §3.2 (cross-class FEL = definition-error per ADR-0074 §"Five decisions" line 44 + `flClassCompatibility`); not a residual `cascade`-mechanism question. **FW-0060 build verifies the registry's `flClassCompatibility` declaration matches the lint behavior; no FW-0049 design gap.**
4. **Phase 1 fallback structural-tell honesty UI (§3.5 + §5).** When the deployment is Phase 1-only and the form declares `phase-1-fallback` posture, the respondent must be honestly informed that the receipt structure differs from a non-protected submission. The exact copy + visual treatment is a FW-0060 build concern.
5. **Forms requiring substitute-only (no truthful value collected; §3.4 alternative).** Some forms might be substitute-only (no verification predicate to evaluate). For these, the safe-* class on a single field with a substitute-only audience policy is a Privacy Profile extension. **Out of FW-0049 scope; landed as a follow-on if a real form demands it.**
6. **Cross-jurisdiction respondent relocation.** Respondent enrolled in CA ACP moves to WA and re-enrolls in WA ACP. The form's substitute-address validator must accept the WA substitute at the new address; the existing record (under CA substitute) is not retroactively rewritten. **Operational lifecycle concern; out of FW-0049 design scope.**
7. **PKAF/Rulespec downstream binding details (§6.5 item 6).** Specific `rkaf:AccessScope` + `dpv:hasPersonalDataCategory` composition for safe-* values. **Follow-on Rulespec alignment row; not FW-0049's scope.**
8. **Document-side redaction composition with FW-0040.** When a form requiring `safeAddress` also accepts a document upload that may contain the protected value (utility bill, lease), the document-side redaction is FW-0040's mechanism. The two must compose at the issuer-verification audience level (document and form-field values both flow to the issuer audience); composition rule is straightforward but the build-time enforcement lives in FW-0040 design.
9. **The FOIA-disclosure carve-out problem.** Some jurisdictions have specific elected-official disclosure rules that override ACP for certain office-holders. **Per-deployment Privacy Profile override** (§6.4); FW-0049 names the seam but doesn't enumerate the carve-outs.

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: multi-class taxonomy (`safe-address`, `safe-contact`, `safe-employer`) under `safe-*` namespace | PROPOSAL | owner review + Access-Class Registry companion |
| Q2: one schema property (`accessControl.class` per ADR-0074); retire EXT-1's `privacy` block | PROPOSAL | owner review + EXT-1 update direction |
| Q3: masked-by-default + per-act reveal on every respondent-facing surface; never rendered to receipt / status / verifier-public-output | PROPOSAL | owner review |
| Q3.5: two-field substitute-vs-truthful authoring discipline | PROPOSAL | owner review |
| Q4: receipt-side withhold-with-commitment-proof via Trellis Phase 2+ OC-26/27/30; Phase 1 fallback is full-omit with structural-tell honest disclosure | PROPOSAL | owner review + Trellis Phase 2 dependency surface |
| `safeAddress` capability tier under ADR-0011 (`verifier-grade | phase-1-fallback`) | PROPOSAL | owner review + ADR-0011 evolution |
| Per-jurisdiction `SafeAddressDirectory` adopter contract; port shape deferred to FW-0060 build per ADR-0009 §(b) | PROPOSAL | owner review |
| EXT-1 retire `privacy` block; consequences/purpose remain | PROPOSAL to formspec | formspec spec-expert review |
| EXT-31 (new) — Access-Class Registry safe-* entries | PROPOSAL to formspec | formspec spec-expert review + Access-Class Registry author |
| EXT-32 (new) — Privacy Profile default audience policy for safe-* | PROPOSAL to formspec | formspec spec-expert review + Privacy Profile sidecar author |
| XS-4 (new) — cross-stack ADR for safe-address pipeline | PROPOSAL to stack-root | stack-root architecture review |
| Multi-party composition per FW-0050 §7.1 satisfied (§7 above) | PROPOSAL | owner review + FW-0061 build consumer |

**Row status change:** FW-0049 moves from `open` to `in design`. FW-0049 stays open until this design is owner-ratified and the upstream chain (EXT-1 update + EXT-31 + EXT-32 + XS-4) has at least proposed shapes.

## 10. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`safeAddress` is post-MVP; this design is staging for post-MVP)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §4.2 defers `SafeAddressDirectory` port shape to FW-0060 build per §(b))
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (the `safeAddress` capability the design instantiates; already enumerated at line 147)
- [FW-0048 design 2026-05-23](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-aware signing (adjacent threat-model; different substrate path; composes per §7.3)
- [FW-0050 design 2026-05-23 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party (cites this row as safe-address-class-taxonomy source; §7 above satisfies)
- [stack-root ADR-0074](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) — Class-Aware Response and Bucketed Encryption (the canonical substrate; this design instantiates `safe-*` class set against it)
- [stack-root ADR-0116](../../../thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md) — SD-JWT default selective-disclosure path (orthogonal substrate path; not load-bearing for FW-0049 MVP)
- [Trellis Core §13](../../../trellis/specs/trellis-core.md) — Commitment Slots Reserved (Phase 2+; load-bearing for verifier-grade tier per §3.5)
- [Trellis Operational Companion §13](../../../trellis/specs/trellis-operational-companion.md) — Selective Disclosure Discipline (OC-26/27/30; load-bearing for the receipt-side audience contract per §3.5)
- Source brief: [`thoughts/sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md`](../sketches/2026-05-23-fw-0049-safe-address-handling-research-brief.md)
- Journey: [J-037 in `JOURNEYS.md:651`](../../JOURNEYS.md)
- Anti-pattern: [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md)
- External prior art: California Safe at Home (Govt. Code §§6205–6210), Washington ACP (RCW 40.24), Massachusetts ACP (M.G.L. c. 9A), USMS Witness Security Program, NNEDV Safety Net guidance, "Designing for Safety" (PenzeyMoog, Rosenfeld Media 2021)
