# FW-0049 Safe-address handling — Research Brief

**Status:** Sketch / research artifact. Not a design proposal. Seeds the design conversation.
**FW row:** [FW-0049 in `PLANNING.md:579`](../../PLANNING.md) (design); paired build row [FW-0060 in `PLANNING.md:676`](../../PLANNING.md).
**Journey:** [J-037 in `JOURNEYS.md:651`](../../JOURNEYS.md).
**Anti-patterns:** [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md).
**Feature key (proposed):** `safeAddress` — already enumerated in [web ADR-0011 Feature Ownership Table line 147](../adr/0011-runtime-feature-resolution-and-policy-gates.md). FW-0049 codifies the shape.

The headline finding: **the substrate exists; the wiring does not.** Stack-root [ADR-0074](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) already specifies field-level `accessControl.class` + bucketed Response + per-class key-bag wrapping; Trellis Core §13 + Operational Companion §13 (Disclosure Manifest, OC-26/27/30) already specify audience-scoped derived artifacts with cryptographic auditability. **FW-0049's design work is not inventing the privacy substrate — it is naming the field-level class for safe-address, the substitute-address substitution rule, and the receipt-side render discipline that survives the verifier without leaking location.** External prior art is mature: 40+ U.S. states run Address Confidentiality Programs (ACP) with substitute mailing addresses; the technical and operational patterns are well-documented.

The hardest finding: **structural-indistinguishability is the load-bearing constraint, not field-level encryption.** Per J-037 "Done": *the receipt structure is consistent whether or not the respondent is in an ACP, so an attacker can't infer 'she's hiding' from receipt shape alone*. This means redaction-aware commitment slots (Trellis OC-26) must be **populated for every submission**, not only for safe-address-affected ones — a posture-uniformity discipline analogous to FW-0048 §3.4's event-level uniform shape. Per Trellis Core §13.3 this is **Phase 2+** work; Phase 1 producers MUST emit `commitments` as `null` or `[]`. FW-0049 design therefore lands as **Phase 2+-dependent at the verifier-grade slot-population layer**, but the Formspec-side declarations + the runtime render discipline land Phase-1.

---

## 1. Upstream Primitive Inventory

### 1.1 Formspec — `accessControl.class` already specified (ADR-0074); safe-address class not yet registered

| Primitive | File:line | Safe-address relevance |
|---|---|---|
| `accessControl.class` on `field` / `group` items | [stack-root ADR-0074 §1](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), [`formspec/specs/audit/respondent-ledger-spec.md:613`](../../../formspec/specs/audit/respondent-ledger-spec.md) | **The canonical primitive.** Per ADR-0074 "Five decisions" (line 39): `accessControl` is a normative Core item property; class tokens are opaque to Core; taxonomy lives in the Access-Class Registry companion. **Safe-address is a class token — `safe-address` — that the Access-Class Registry must register.** No new schema property; one new class token + one new audience-policy default. |
| Access-Class Registry companion (proposed in ADR-0074) | [stack-root ADR-0074 §"Companion artifacts" line 8](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) | The registry that resolves `class` tokens. Lists today: `procedural | pii_identifier | financial | medical | demographic | sensitive_history | attachment | staff_internal | respondent_self | unclassified`. **`safe-address` would be a new entry** in the registry. Distinct from `pii_identifier` because it carries a *substitution rule* (an ACP substitute address may be displayed in lieu of the protected value) that other PII classes do not. |
| Privacy Profile sidecar (proposed in ADR-0074) | [stack-root ADR-0074 §"Companion artifacts" line 9](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) | The deployment-level audience policy. For safe-address, the audience policy declares: respondent renderer (their own screen), issuer receives the plaintext (for verification), public-receipt audience is *excluded*, verifier sees a commitment proof not a plaintext. Per-jurisdiction overrides live here. |
| Bucketed Response wire shape | [stack-root ADR-0074 §"Five decisions" line 42 + §"Specifics" §3](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) | The wire-level mechanism. Safe-address fields land in a separate bucket; the issuer's audience entry in `keyBag` unwraps the bucket DEK; the respondent's public-receipt audience does NOT have a `keyBag` entry for the safe-address bucket, so the plaintext is structurally unreachable. |
| EXT-1 (queued) — item-metadata `privacy` sibling block | [`thoughts/specs/2026-05-22-upstream-extension-queue.md:26`](../specs/2026-05-22-upstream-extension-queue.md) | Already names J-037 + FW-0049 in `Closes:`. Proposes `privacy: { protectable: bool, class: "safe-address" | "contact" | "employer" | ... }`. **Naming collision review:** EXT-1's `protectable` adjective + `class` enum sits alongside ADR-0074's `accessControl.class`. **The relationship needs disambiguation in the design doc** — either (a) EXT-1's `privacy.class` *is* `accessControl.class` (one mechanism, one schema property), or (b) EXT-1 carries author-facing taxonomy that the registry resolves down to `accessControl.class` tokens. **Lean: (a)** — one schema property; the EXT-1 entry is updated to point at `accessControl.class` per ADR-0074. The design doc must call this out. |
| `disabledDisplay: "protected"` enum value | [`formspec/specs/core/spec.md:2928`](../../../formspec/specs/core/spec.md) | Existing presentation hint for *non-relevant* items — renders disabled/greyed-out. **Not the safe-address mechanism** (different concern: visibility-when-irrelevant vs. visibility-when-protected). Vocabulary collision worth noting but no naming conflict — `protectable` adjective vs. existing `protected` enum value cohabit per EXT-1 §"No name collision" line 33. |
| Respondent-ledger `accessClass` inheritance | [`formspec/specs/audit/respondent-ledger-spec.md:524 + 613`](../../../formspec/specs/audit/respondent-ledger-spec.md) | Each `ChangeSetEntry` inherits the field's `accessControl.class` as `accessClass` when a Privacy Profile is loaded. Raw `before`/`after` MUST NOT be exposed to readers lacking class authority. **The audit-trail half of safe-address is already specified.** What's missing is the Phase 5 (Emission) wiring + the verifier-side render discipline. |

**Takeaway:** Formspec has the substrate. FW-0049 design's Formspec-side work is: (1) register `safe-address` as a class token in the Access-Class Registry companion; (2) specify the substitute-address substitution semantics (the ACP substitute is a *display value*, not a *substitute fact* — the truthful answer remains the underlying value the issuer receives); (3) reconcile EXT-1's `privacy` block with ADR-0074's `accessControl` (lean: collapse to one property). The respondent-ledger discipline already applies via existing `accessClass` inheritance.

### 1.2 Trellis — Phase 2+ §13 commitment slots; Phase 1 producers emit `null`/`[]`

| Primitive | File:line | Safe-address relevance |
|---|---|---|
| §13 Commitment Slots Reserved | [`trellis/specs/trellis-core.md`](../../../trellis/specs/trellis-core.md) §13 | **The cryptographic substrate** for selective disclosure. Per Core §13.3: scheme-specific commitments (Pedersen / Merkle / BBS+) reserved for **Phase 2+**. Phase 1 producers MUST emit `commitments` as `null` or `[]`. |
| OC-26 (slot population at admit time) | [`trellis/specs/trellis-operational-companion.md:472`](../../../trellis/specs/trellis-operational-companion.md) | **The structural-indistinguishability anchor.** Operators MUST populate redaction-aware commitment slots when admitting a record subject to later selective disclosure. Per OC-26: slots cannot be retroactively reserved without envelope reissue (NON-CONFORMANT Phase 2+). **For safe-address, this means every submission of a safe-address-aware form must populate the protected-field commitment slot whether or not the respondent is in an ACP** — the slot's *presence* is uniform; the slot's *opening* (revealed plaintext vs. committed-only) is what carries the protection. Same uniform-shape posture as FW-0048 §3.4 at the event level, but at the slot level for selective disclosure. |
| OC-27 (Disclosure Manifest structure) | [`trellis/specs/trellis-operational-companion.md:476`](../../../trellis/specs/trellis-operational-companion.md) | The artifact that names disclosed vs. committed-only vs. withheld fields per audience. **The vehicle for safe-address redaction.** Audiences enumerated include `foia_public`, `opposing_counsel`, `appellate_court`. **The public-receipt audience is a new audience class — `respondent_public_receipt` — that withholds safe-address-class fields by default.** Per ADR-0074 §"Specifics" the audience policy lives in the Privacy Profile sidecar, not in Core. |
| OC-30 (independent auditability) | [`trellis/specs/trellis-operational-companion.md:496`](../../../trellis/specs/trellis-operational-companion.md) | **Load-bearing for the verifier positioning bet.** An auditor MUST be able to verify that commitment slots in the canonical record match the commitments in the manifest *without* requiring access to plaintext. This is exactly the "this submission contained a protected address that satisfied the form's eligibility predicate, WITHOUT learning the address itself" claim from FW-0049's Done. |
| OC-31 (Phase 3+ deferral for advanced crypto) | [`trellis/specs/trellis-operational-companion.md:500`](../../../trellis/specs/trellis-operational-companion.md) | Phase 2 requires population discipline + manifest structure over Core-reserved slots; BBS+ / group signatures DEFERRED to Phase 3+. **FW-0049's verifier-grade redaction depends on Phase 2 substrate, not Phase 3+**. FOIA-style redaction with cryptographic non-revealability is achievable with Phase 2 commitments (Pedersen or Merkle); the BBS+ unlinkability story (one signature, many derivable presentations) is Phase 3+ and orthogonal. |
| Phase 1 producer rule | [`trellis/specs/trellis-core.md`](../../../trellis/specs/trellis-core.md) §13.3 | Phase 1 producers MUST emit `commitments: null` or `[]`. **This is the hard substrate gap for FW-0049's verifier story.** The runtime-side render discipline + Definition-side class declaration + bucketed-Response routing are all Phase 1; the receipt-side cryptographic redaction with structural-indistinguishability is Phase 2+. FW-0049 design must surface this Phase boundary explicitly. |

**Takeaway:** Trellis substrate is the right home for the receipt-side cryptographic redaction. The base discipline (audience-scoped Disclosure Manifest, OC-26/27/30) is documented and reachable on Phase 2. The structural-indistinguishability claim from J-037 requires Phase 2 OC-26 slot-population discipline — without it, the *presence* of a Disclosure Manifest entry for safe-address fields would itself be observable. FW-0049 design ratifies the seam; FW-0060 build waits on Trellis Phase 2 for the verifier-grade slot work.

### 1.3 WOS — Per-actor scope + applicant API tier; no safe-address-specific primitive

| Primitive | File:line | Safe-address relevance |
|---|---|---|
| Per-tenant scope (ADR-0068) | [stack-root ADR-0068](../../../thoughts/adr/0068-stack-tenant-and-scope-composition.md) | Existing tenant/organization/workspace/environment hierarchy. **Not safe-address-specific** but composes — a safe-address-marked field's audience policy may scope by tenant. |
| Applicant status surface | `work-spec/specs/api/applicant.md` | **Risk surface.** If the applicant status surface renders the respondent's address (even truncated), the safe-address discipline is broken. WOS-side rendering MUST honor the Privacy Profile audience for the requesting actor. Same per-party-scoping principle as FW-0050 §7.2 / FW-0048 §3.2. |
| Multi-party `parties` block (EXT-28, FW-0050) | [`thoughts/specs/2026-05-22-upstream-extension-queue.md:194`](../specs/2026-05-22-upstream-extension-queue.md) | **The composition seam with FW-0050.** Per FW-0050 §7.1 the composition rule fires `InvalidRuntimePolicyError` when a protectable field's `visibleTo[]` intersected with the safe-address jurisdictional rule is empty. FW-0049 design specifies the right half of that composition: the safe-address class declaration on the field. |

### 1.4 PKAF — `AccessScope` is the right adjacent vocabulary, not the FW-0049 primitive

`rkaf:AccessScope` ([`PKAF/spec/rkaf-core.md:140`](../../../PKAF/spec/rkaf-core.md)) carries a closed `accessScopeKind` enum: `rkaf:public | partnerVisible | organizationVisible | roleRestricted | personalRestricted | regulatoryRestricted | embargoUntil`. For `regulatoryRestricted` it composes `dpv:hasPersonalDataCategory` from DPV.

| Question | Answer |
|---|---|
| Could `AccessScope` BE the safe-address mechanism? | **No, not directly.** `AccessScope` attaches to PKAF Assertions/EvidenceBindings/SourceFragments — assertion-graph artifacts upstream of Formspec field values. Safe-address is a **field-level** classification on Formspec items, carried by `accessControl.class` per ADR-0074. |
| Could `AccessScope` BE composed with safe-address downstream? | **Yes, and the design should name this.** When a safe-address-protected value is reused as evidence for a downstream PKAF assertion (e.g., a determination citing the respondent's residence-eligibility), the assertion's `AccessScope` should reflect the upstream `accessControl.class`. The `regulatoryRestricted` + `dpv:hasPersonalDataCategory` composition pattern fits — DPV has `dpv:Location` and personal-data subclasses that could name "protected home address." |
| What's the mapping? | **Open question for the design doc.** Lean: `accessControl.class: "safe-address"` is the Formspec authoritative source; downstream PKAF/Rulespec consumers annotate with `rkaf:AccessScope { accessScopeKind: rkaf:regulatoryRestricted, regulatoryClass: rkaf:partner-defined }` + `dpv:hasPersonalDataCategory` per jurisdiction. **Out of scope for the FW-0049 build; flag for future Rulespec alignment.** |

**Takeaway:** PKAF/Rulespec is the **downstream consumer vocabulary**, not the Formspec field-level mechanism. The design doc names the seam, doesn't bind it. Rulespec alignment is a follow-on row.

### 1.5 web ADR-0011 capability table — `safeAddress` already enumerated

[Feature Ownership Table at line 147](../adr/0011-runtime-feature-resolution-and-policy-gates.md):

| Layer | What ADR-0011 names for `safeAddress` |
|---|---|
| Instance capability | "privacy/redaction substrate" — concretely, the Trellis Phase 2 OC-26/27/30 substrate (post-MVP per [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md)) + ADR-0074 bucketed-Response runtime |
| Org policy | "jurisdictional protection policy" — per-jurisdiction ACP rules; Privacy Profile sidecar carries the deployment policy |
| Form policy | "protected fields declared" — `accessControl.class: "safe-address"` on the relevant items per ADR-0074 |

**Conclusion:** FW-0049 design instantiates an already-named capability key. The shape work is: (1) the field-level class registration; (2) the runtime render discipline; (3) the receipt-side audience contract; (4) the verifier-side commitment-proof discipline (Phase 2+ dependent); (5) the composition with multiParty per FW-0050 §7.1.

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0049 |
|---|---|---|
| **FW-0060** Safe-address build | [`PLANNING.md:676`](../../PLANNING.md) | **Direct downstream.** FW-0049 design output is the canonical shape FW-0060 wires. FW-0060 is blocked on FW-0049 design + EXT-1 (privacy block) + Phase 2 cryptographic substrate. |
| **FW-0048 / FW-0059** Coercion-aware signing | [`PLANNING.md:566`](../../PLANNING.md), [`PLANNING.md:665`](../../PLANNING.md) | **Adjacent but distinct** (per FW-0048 research brief §2). Coercion = event-time signal by the respondent; safe-address = field-level *known-protectable* values. Both ride privacy substrate (FW-0048 rides Trellis Core §6.4 + §9.4 HPKE wrap; FW-0049 rides ADR-0074 bucketed Response + Trellis §13 commitment slots for verifier-grade redaction). Both fail-closed under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md). **Different surfaces, different substrate paths, both load-bearing for the high-risk template set.** |
| **FW-0050 / FW-0061** Multi-party | [`PLANNING.md:589`](../../PLANNING.md), [`PLANNING.md:686`](../../PLANNING.md) | **Hard composition seam.** FW-0050 §7.1 names this row as the privacy-class-taxonomy source. Composition rule: a protectable field's `visibleTo[]` is intersected with the safe-address jurisdictional rule; empty intersection → `InvalidRuntimePolicyError`. FW-0049 design names the right half. **Canonical scenario: child-custody case where parent A's address must not be visible to parent B.** |
| **FW-0040** File upload | [`PLANNING.md:475`](../../PLANNING.md) (J-040 line 690 in JOURNEYS) | **Adjacent.** J-040 names "redact what shouldn't be shared: ... addresses on a document where J-037 applies." Document-side redaction (image masking, OCR redaction) is a different mechanism than form-field redaction; both serve J-037. FW-0040 is the document-redaction surface; FW-0049 is the form-field surface. Should compose: a form with a `safe-address` field that also accepts a document upload (e.g., utility-bill proof) needs the document's address blurred. **Out of FW-0049 scope; flag for FW-0040 design.** |
| **FW-0009 / FW-0003** Verifier + receipt | [`PLANNING.md:?`](../../PLANNING.md) | **Verifier-side discipline.** The public receipt MUST NOT contain plaintext safe-address values; the verifier MUST be able to assert the form's eligibility predicate was satisfied (e.g., "the respondent's state of residence is California") without revealing the underlying address. This is OC-30 (independent auditability) territory. Phase 2+ dependent. |
| **FW-0034** Issuer sidecar audit trail | [`PLANNING.md:?`](../../PLANNING.md) | The issuer-side audit-trail per `trellis-operational-companion.md` §13 may contain plaintext safe-address values gated by the issuer's audience policy. Not safe-address-specific; existing audit-trail discipline applies. |

---

## 3. Threat Model — Three Grounded Scenarios

Each scenario gives: the setup, what the safe-address mechanism must achieve, what FW-0049's posture provides.

### 3.1 Domestic-violence survivor — benefits application

- **Setting.** Survivor enrolled in California's Safe at Home program (ACP); applying for state Medi-Cal benefits. The application form has standard "home address" + "mailing address" + "phone number" + "employer" fields. The survivor's truthful home address would endanger them if the abuser obtained the application file via subpoena, public-records request, or social-engineering attack on the agency.
- **What the survivor needs.** Provide the ACP substitute address (PO Box maintained by the California Secretary of State per Govt. Code §6206) as the mailing address; provide the truthful home address only to the verification-authorized audience (the eligibility-determination caseworker); the public-facing artifacts (receipt, status page, any FOIA-disclosable record) MUST NOT contain the truthful address.
- **What the attacker observes.** The receipt (if obtained), the status surface (if accessed), any FOIA disclosure (if requested), the verifier output (if validated).
- **Design implications.** This is the canonical scenario. The form must (a) declare the address field as `accessControl.class: "safe-address"`, (b) accept ACP-substitute-address values without rejection (the form's validation must know about ACP substitute address formats per jurisdiction), (c) emit a bucketed Response per ADR-0074 with the safe-address bucket wrapped to the eligibility audience only, (d) emit a Disclosure Manifest for the public-receipt audience that withholds the safe-address fields with cryptographic commitment proof.

### 3.2 Witness-protection participant — tax filing

- **Setting.** Federal Witness Security Program participant filing a state tax return. The state requires a residence address for tax-jurisdiction determination; the participant's true residence is structurally protected by the US Marshals Service.
- **What the participant needs.** A way to file the tax return without the truthful residence address appearing on the form's downstream artifacts. The tax authority needs the address (to determine tax jurisdiction) but the address MUST NOT appear in any record subject to discovery, FOIA, or third-party data-broker harvesting.
- **What the attacker observes.** The state-tax public records (some states publish tax-return-derived data), any third-party data-broker harvest of public records, any FOIA-disclosed file.
- **Design implications.** Same mechanism as 3.1; the substitute address authority is different (US Marshals coordinates with the state tax authority directly rather than the state Secretary of State's ACP). **Honest scope:** the substitute-address coordination is per-jurisdiction and per-protection-regime — Formspec/formspec-web cannot enumerate every regime. The design names the *mechanism* (class declaration + substitution rule + receipt-side redaction); the **per-regime substitute-address registry is a deployment concern**, similar to FW-0048's safety-team recipient registry (EXT-30).

### 3.3 Child-custody case — multi-party composition with FW-0050

- **Setting.** Joint child-custody filing between two parents. Parent A is a DV survivor whose address is ACP-protected; parent B is the survivor's former abuser. The custody form has shared fields (children's names, custody schedule) and per-party fields (each parent's address).
- **What the survivor parent needs.** File jointly without parent B seeing the survivor's truthful address. Per FW-0050 §7.1: "survivor parent's safe-address-protected home address must not be visible to the co-parent."
- **What the abuser observes.** Their own per-party view (their own address, the shared fields, possibly an indication that the other parent's address exists but is withheld); the public receipt naming both parties; the verifier output validating the joint signature.
- **Design implications.** **Composition test for FW-0049 × FW-0050.** Parent A's address field is declared `accessControl.class: "safe-address"`; the FW-0050 `visibleTo[]` on that field is `[parentA.roleId]` (excluding parentB); the form-load resolver intersects the safe-address audience policy (excludes-public-receipt) with the multi-party visibility (excludes-parentB) — empty intersection only if the form authors a contradiction; the well-formed case yields `visibleTo = parentA + issuer-audience` and the receipt-side withholding applies to both the public-receipt audience and the parentB-receipt audience. **The design's hardest moment is making this composition fall out of the substrate, not invent a new rule.**

**Implication for the design:** FW-0049's posture is **optimized for scenarios 3.1 and 3.2 (single-party safe-address); composes cleanly with FW-0050 for 3.3**. Honest gaps surfaced in §5.

---

## 4. Open Scope Questions for the Design

Prioritized — ask the first 3-4 before the rest.

### Top 4 to ask first

**Q1. Class taxonomy granularity — one `safe-address` class, or multi-class (`safe-address`, `safe-contact`, `safe-employer`)?**

J-037 names "home address, phone, employer" all as protectable. Two options:

1. **Single class `safe-address` covering the cluster.** Author marks each protectable item with the same class; one Privacy Profile audience rule applies. Simple; collapses to one substitution-authority registration per jurisdiction.
2. **Sibling classes `safe-address`, `safe-contact`, `safe-employer`.** Distinct substitution rules (an ACP substitute address is not an ACP substitute phone number — phone substitution is typically a forwarding service; employer substitution typically requires the employer's HR cooperation, not a state registry).

**→ Drives the registry shape.** Lean: **multi-class** to honor the substitution-rule heterogeneity, with a shared `safe-*` namespace prefix. EXT-1's `class` enum already proposes `"safe-address" | "contact" | "employer"`; the design doc reconciles these names (lean: `safe-address`, `safe-contact`, `safe-employer` for namespace discipline).

**Q2. EXT-1 vs ADR-0074 — one schema property or two?**

EXT-1 proposes a `privacy` sibling block (with `protectable: bool` + `class` enum). ADR-0074 specifies `accessControl.class`. **One or two?**

- **One:** `accessControl.class: "safe-address"` is the only mechanism. EXT-1 is updated to *retire* the new `privacy` block in favor of pointing at `accessControl`. **Cleaner.** No new schema property; one registry entry per safe-* class.
- **Two:** `privacy` carries authoring intent (boolean `protectable` adjective); `accessControl.class` carries runtime classification token. The registry resolves `privacy.protectable: true` to `accessControl.class: "safe-address"`. **Author convenience at cost of two-property drift risk.**

**→ Drives the EXT-1 update direction.** Lean: **one** per ADR-0074 §"Concept-implied class" pattern (line 104) — the registry resolves author-facing concepts to canonical class tokens; the `accessControl.class` is the runtime authority; redundant author-side properties drift. The design doc must surface this and propose updating EXT-1 to drop the `privacy` block.

**Q3. Render-side default — masked-by-default with reveal, or always-render-on-respondent's-own-screen?**

When the form is open in the respondent's own browser tab, does the safe-address field render the plaintext value (the respondent typed it; they're looking at it) or render as masked (`••••••`) with a "reveal" affordance?

- **Always-render.** Assumes only the respondent sees their own screen. Surface complexity is minimal.
- **Masked-by-default + explicit reveal.** Defends against shoulder-surfing, screen-sharing accidents ("preview my answers" surface, screenshot for support, screen-share with a benefits navigator). The reveal affordance is a small per-act decision.

**→ Drives the render-discipline section.** Lean: **masked-by-default + per-act reveal** for safe-address-class fields. Same reasoning as bank-app account-number masking (mature pattern; users tolerate it). The form's "preview my answers" surface must respect masking unless the respondent explicitly toggles "show protected values." Receipt-rendering MUST never reveal.

**Q4. Receipt-side semantics — withhold-with-commitment-proof, or full-omit-from-receipt?**

The public receipt (FW-0009) needs to be valid (cryptographically verifiable) and not leak safe-address plaintext. Two ways:

1. **Withhold-with-commitment-proof (Trellis OC-26/27/30, Phase 2+).** The receipt names the safe-address field, carries a commitment to its value, and proves cryptographically that the field's value satisfied the form's eligibility predicate — without revealing the value. The verifier renders: "Address: (protected; verified to satisfy California residence requirement)." **Strongest verifier story; load-bearing for J-037 Done.** Phase 2+ dependent.
2. **Full-omit-from-receipt.** The receipt omits the safe-address field entirely. The verifier renders: "Address: (not present in this receipt)." **Weaker;** the absence becomes a tell (a receipt without an address is structurally different from a receipt with one); fails J-037's "the existence of redaction is itself not a tell" requirement.

**→ Drives the substrate-Phase dependency surfacing.** Lean: **withhold-with-commitment-proof**, Phase 2+ dependent. The Phase-1 fallback is `full-omit-from-receipt` with the honest acknowledgement that it's a tell — useable for low-risk forms but NOT acceptable for J-037's canonical scenarios. The form's `safeAddress` policy declaration MUST require the Phase 2 substrate or fail-closed under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md).

### Next 4 (ask after the framing 4)

**Q5. Substitute-address authority registry — where does the per-jurisdiction substitute-address registry live?**

For California ACP: the Secretary of State manages PO Box assignment. For Washington ACP: same. For witness protection: the US Marshals coordinates directly. The form must validate that the entered substitute address is real (rejecting `123 Fake St` as a substitute). Two options:

1. **Out-of-band (issuer-side).** The issuer's deployment owns the registry. Validation happens server-side. **Default;** lower coupling.
2. **In-band (formspec-web port).** A `SafeAddressDirectory` port whose adapter consults the registry at form-load. **Higher coupling; testable.**

**→ Defer to FW-0060 build.** Default: out-of-band per-issuer.

**Q6. Per-class FEL — can a `safe-address` field be referenced in a FEL expression that targets a non-protected output?**

Per ADR-0074 §"Five decisions" line 44: cross-class FEL is a definition error at Core, unconditionally when no Profile is loaded. With a Privacy Profile, cross-class FEL is permitted only when the two classes' audience arrays are literally equal.

For safe-address: a derived field like `cityFromAddress(address)` would itself need to be `safe-address`-classed unless the city alone does not endanger (depends on context — a small town might endanger by inference even though the city is "less" than the street address). **Open question:** does derivation cascade automatically (every FEL output reading a `safe-address` input becomes `safe-address`), or does the author declare per-output? Lean: cascade by default, author override per Privacy Profile.

**Q7. Verifier independence — can the public-receipt verifier validate the proof without the issuer's audience key?**

Per Trellis Core §16 (verification independence): verifiers MUST NOT depend on derived artifacts, workflow runtime, or mutable DBs. Per OC-30: the auditor verifies commitments without plaintext. **The verifier's positive verdict MUST be reachable from the receipt's public bytes alone, given the public commitments + the Phase 2+ proof material.** The issuer's audience key is NOT in the verifier's hand. **Confirms Phase 2 substrate is sufficient** — Phase 3+ (BBS+, unlinkability) is orthogonal.

**Q8. Failure semantics — what if a form declares `safeAddress` required but the deployment/instance lacks the Phase 2 substrate?**

Per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) §Failure Semantics: `UnsupportedRequiredFeatureError` at form-load. **Strict fail-closed.** A form requiring safe-address MUST fail-load on a Phase 1-only deployment — silent degradation to plaintext is forbidden because it would endanger the respondent.

---

## 5. Honesty Note: What This Row Can and Cannot Do

**Can:**

- Specify the field-level class (`safe-address` and siblings) for the Access-Class Registry companion.
- Specify the runtime render discipline (masked-by-default + per-act reveal; respondent's own screen vs. preview / share-screen surfaces).
- Specify the receipt-side audience contract (public-receipt audience excludes safe-address fields; verifier-grade commitment proofs).
- Specify the multi-party composition with FW-0050 (per-party visibility intersected with safe-address audience).
- Specify the substrate dependency surface (Phase 2+ OC-26/27/30 for verifier-grade redaction; Phase 1 fallback noted as honest insufficient-coverage).
- Reconcile EXT-1's `privacy` block with ADR-0074's `accessControl.class`.

**Cannot:**

- **Solve the "address is also the employer's known location" attack.** A DV survivor whose employer is known to the abuser cannot protect their address via address-substitution if the abuser correlates via employer disclosure. **Out of any field-level mechanism's reach; flag honestly.** Mitigation requires both `safe-address` AND `safe-employer` declarations and the form must permit both substitutions, but the survivor's lived-reality may not allow employer concealment (e.g., if the form requires verified employment).
- **Enumerate every jurisdiction's substitute-address regime.** 40+ U.S. states with ACP; varying federal regimes; non-US protected-address programs. **Per-jurisdiction policy is a deployment concern**, similar to FW-0048's safety-team recipient registry.
- **Solve the metadata-leak via response-time, network-jitter, or IP attack.** A receipt's structural-indistinguishability addresses the *bytes*; an attacker correlating submission timing with known ACP-program registration windows could infer protection. **Out of FW-0049's reach; orthogonal threat-model.**
- **Ship the production implementation.** FW-0060 owns build.
- **Ratify the substrate.** Trellis Phase 2 OC-26/27/30 substrate is upstream; FW-0049 names the dependency.

The honest split: FW-0049 covers **(a) field-level class declaration**, **(b) runtime render discipline**, **(c) receipt-side audience contract**, **(d) multi-party composition seam**. It does NOT cover **(e) per-jurisdiction substitute-address registries** (deployment concern), **(f) document-side redaction for uploaded supporting documents** (FW-0040), **(g) the employer-correlation attack class** (fundamental to the threat-model, not the substrate), or **(h) cryptographic implementation of Phase 2 commitment slots** (Trellis substrate, separate track).

---

## 6. External Prior Art

Cited so the design is grounded in real prior art, not invented in isolation. **All references load-bearing for design §3; verify before relying.**

### 6.1 U.S. state Address Confidentiality Programs (ACP)

- **National Network to End Domestic Violence (NNEDV) Safety Net ACP Map.** [`https://www.techsafety.org/resources-survivors/address-confidentiality-programs`](https://www.techsafety.org/resources-survivors/address-confidentiality-programs) — overview of which states operate an ACP and which protected classes they serve (typically DV survivors, sexual-assault survivors, stalking victims, trafficking survivors, in some states reproductive-health workers and law-enforcement personnel). Confirms 40+ states with ACP; programs are heterogeneous.
- **California Safe at Home (Govt. Code §§6205–6210).** [`https://www.sos.ca.gov/registries/safe-home`](https://www.sos.ca.gov/registries/safe-home) — California's ACP. Participants receive a PO Box maintained by the Secretary of State; mail is forwarded daily; the substitute address is recognized by California state agencies and (per §6206) "shall be accepted as a person's address by any state or local agency when creating a public record." This is the legal authority the form's substitute-address acceptance derives from.
- **Washington Address Confidentiality Program (RCW 40.24).** [`https://www.sos.wa.gov/acp`](https://www.sos.wa.gov/acp) — Washington's parallel program. Same substitute-address pattern; per-state administrative variation.
- **Massachusetts ACP (M.G.L. c. 9A).** [`https://www.sec.state.ma.us/cis/cisacp/acpidx.htm`](https://www.sec.state.ma.us/cis/cisacp/acpidx.htm) — Massachusetts's program; participants get a PO Box at the Secretary of State's office; receive substitute address card.
- **The substitution authority pattern is consistent across states:** the state Secretary of State (or analogous office) issues a substitute address; the substitute is legally equivalent to the participant's actual address for any state/local-agency record-creation purpose; the participant's actual address is sealed by the SoS office and disclosable only by court order. **This pattern is the reference design for FW-0049's substitution semantics.**

### 6.2 Federal protected-address regimes

- **US Marshals Service Witness Security Program.** [`https://www.usmarshals.gov/witsec`](https://www.usmarshals.gov/witsec) — federal protected-witness program. Participants receive new identities + relocation; address-protection is integral. Coordination with state/federal agencies is direct rather than via substitute-address registry; out-of-band per-case.
- **DoD overseas address conventions.** [`https://about.usps.com/handbooks/dmm/700.htm`](https://about.usps.com/handbooks/dmm/700.htm) (USPS Domestic Mail Manual §703 covers APO/FPO/DPO addressing). Military Post Office addresses (APO/FPO/DPO) function as substitute addresses for overseas service members; same address-of-record pattern but operationally distinct. **Adjacent but not safe-address-class** — APO/FPO is operational, not threat-driven; included for completeness.
- **Voter-registration protected-address rules.** [`https://www.eac.gov/voters/election-day-voting-information`](https://www.eac.gov/voters/election-day-voting-information) — federal EAC + state-level rules permitting ACP-enrolled voters to register at the substitute address. Reinforces the legal-equivalence pattern across state vote-administration systems.

### 6.3 Civic-tech / form-platform precedent

- **Code for America "GetCalFresh" (now BenefitsCal / GetYourRefund).** [`https://www.codeforamerica.org/programs/social-safety-net/`](https://www.codeforamerica.org/programs/social-safety-net/) — Code for America's benefits-application tooling. Honors California ACP per California state benefits law; the ACP-aware path is operational, not a research artifact. Confirms civic-tech precedent.
- **United States Digital Service (USDS) / 18F equity practices.** [`https://digital.gov/`](https://digital.gov/) + [`https://18f.gsa.gov/`](https://18f.gsa.gov/) — federal civic-tech orgs publishing equity / safety / privacy practices; safe-address handling is recurring guidance for benefits / housing / health forms but no published normative spec for *cross-program* substitute-address handling exists. **Confirms the gap FW-0049 fills.**
- **"Designing for Safety" (Eva PenzeyMoog, Rosenfeld Media 2021).** Catalog of UX patterns for safety; chapter on protected addresses; reinforces the masked-by-default + per-act-reveal render discipline.
- **NNEDV Safety Net "Technology Safety" guidance.** [`https://www.techsafety.org/`](https://www.techsafety.org/) — recurring theme: "absence of normal app behavior is a tell." Same anti-tell discipline FW-0048 §3.4 invokes; reinforces J-037's "existence of redaction is itself not a tell" requirement.

### 6.4 Cryptographic prior art — selective disclosure for verifier-grade redaction

- **Trellis Core §13 (Phase 2+) + Operational Companion §13.3 (OC-27 Disclosure Manifest).** In-stack — see §1.2 above.
- **W3C Verifiable Credentials Data Model 2.0 + SD-JWT.** [stack-root ADR-0116](../../../thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md) — SD-JWT is the stack's default selective-disclosure path. Conceptually compatible with field-level safe-address redaction; SD-JWT's per-claim disclosure model is one substrate path for Phase 2. **Note:** SD-JWT is a presentation-layer mechanism; the Trellis §13 commitment-slot mechanism is the record-layer. They compose, not substitute.
- **Pedersen commitments (Pedersen 1991).** Classical cryptographic commitment scheme: commit to a value, reveal selectively, prove equality without revealing. The reference scheme for Phase 2 commitment slots per Trellis Core §13.3.
- **BBS+ / ECDSA-SD.** Stack ADR-0116 declines BBS+ for the default path; useable as profile-gated Phase 3+ path for unlinkable presentations. **Not load-bearing for FW-0049's MVP design.**

---

## 7. Quick-Reference Anchor List

For the design pass — open these in order if a question goes deep:

1. [Journey J-037 — `JOURNEYS.md:651`](../../JOURNEYS.md) — the user story
2. [Anti-pattern AP-014 — `JOURNEYS.md:131`](../../JOURNEYS.md) — the prohibition (coercion-aware; bound to J-037 by §"Note" disambiguation)
3. [FW-0049 row — `PLANNING.md:579`](../../PLANNING.md) — current state
4. [FW-0060 build row — `PLANNING.md:676`](../../PLANNING.md) — what this design feeds
5. [FW-0050 §7.1 — `thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md:286`](../specs/2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party composition
6. [FW-0048 design §5.2 — `thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md:241`](../specs/2026-05-23-fw-0048-coercion-aware-signing-design.md) — adjacent HPKE-wrap pattern (different substrate path)
7. [EXT-1 — `thoughts/specs/2026-05-22-upstream-extension-queue.md:26`](../specs/2026-05-22-upstream-extension-queue.md) — item-metadata `privacy` block (proposed; needs reconciliation with ADR-0074)
8. [stack-root ADR-0074 — `thoughts/adr/0074-formspec-native-field-level-transparency.md`](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) — Class-Aware Response + bucketed encryption (the canonical substrate)
9. [Trellis Core §13 — `trellis/specs/trellis-core.md`](../../../trellis/specs/trellis-core.md) — Commitment Slots Reserved (Phase 2+)
10. [Trellis Operational Companion §13 — `trellis/specs/trellis-operational-companion.md:462`](../../../trellis/specs/trellis-operational-companion.md) — Selective Disclosure Discipline (OC-26/27/30)
11. [web ADR-0011 Feature Ownership Table — `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md:147`](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `safeAddress` capability key home
12. [stack-root ADR-0116 — `thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md`](../../../thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md) — SD-JWT default selective-disclosure path
