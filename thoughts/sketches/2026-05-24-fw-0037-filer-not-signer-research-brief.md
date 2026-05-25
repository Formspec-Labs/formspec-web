# FW-0037 Filer-not-signer (human) — Research Brief

**Status:** Sketch / research artifact. Not a design proposal. Seeds the design conversation.
**FW row:** [FW-0037 in `PLANNING.md:505`](../../PLANNING.md) (design).
**Journey:** [J-012 in `JOURNEYS.md:343`](../../JOURNEYS.md) — the human-capacity slice ("filer ≠ signer ≠ subject"; non-AI variants — POA child for parent, executor for estate, paralegal for client, social worker for applicant, family helper, hospice-admitting daughter).
**Anti-patterns:** [AP-014 (coercion) in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-023 (verified ≠ true) in `JOURNEYS.md:185`](../../JOURNEYS.md).
**Feature key (likely):** `reviewerPreparer` — **already enumerated** in [web ADR-0011 Feature Ownership Table line 150](../adr/0011-runtime-feature-resolution-and-policy-gates.md) (instance capability "sharing and role model"; org "allowed reviewer/preparer roles"; form "review/preparer allowed"). FW-0037 shares this key with FW-0042 (reviewer flows); the design must decide whether to split or share.

The headline finding: **most of the substrate FW-0037 needs is already proposed or shipped.** EXT-3 pre-allocates `capacity` enum values (`self | poa | guardian | executor | parent | licensed-professional | corporate-officer | ai-agent`) covering the **signing** side; FW-0037's question is the **filer** side, where the FILER is a separate human acting under the respondent's (or someone with authority's) consent and the RESPONDENT signs in capacity `self`. The signature substrate is unchanged — the respondent's `AuthoredSignature` rides the standard envelope. The new substrate is a tiny carrier on the submission identifying the filer's role + identity + relationship, plus a runtime affordance ("I'm helping someone with this form") that captures the filer's identity and routes the signing ceremony to the respondent at the right moment.

The hardest finding: **the filer-not-signer case is not the POA case.** When an adult child files under POA for a dementia parent, the child is the SIGNER under capacity `poa` (EXT-3 already covers; the principal can't review/sign). FW-0037 is a third shape: a paralegal who fills the form on a competent client's behalf; a clinic intake-coordinator who fills the patient's demographics before the patient arrives; a tax preparer (CPA) who fills the 1040 for a competent taxpayer who reviews and signs. **The respondent has capacity to sign; the filer's role is convenience + skill + access, not legal substitution.** The signature ceremony MUST route back to the respondent and capture an act of review.

The second hardest finding: **FW-0037 is the canonical AP-014 coercion vector across the corpus.** A "helpful preparer" who fills the form, hands the device to the survivor, and stands over them while they tap "sign" is the textbook coercion shape. The design composes with FW-0048 (duress affordance must be reachable from the signer's ceremony — not the filer's session — for the high-coercion-risk template set) and FW-0049 (which fields the filer sees vs. the signer sees).

---

## 1. Upstream Primitive Inventory

### 1.1 Formspec — `capacity` enum covers signing; no filer-identity carrier yet

[`formspec-web/thoughts/specs/2026-05-22-upstream-extension-queue.md:46` EXT-3](../specs/2026-05-22-upstream-extension-queue.md). The `capacity` enum `self | poa | guardian | executor | parent | licensed-professional | corporate-officer | ai-agent` describes **what role the SIGNER occupies**. It does NOT describe a separate FILER acting on behalf of a signer who themselves signs in capacity `self`.

EXT-3 also adds `principalRef` + `authorityArtifact` to `AuthoredSignature`, which carry the relationship between the signer and the principal subject **when the signer is not the subject** (capacity `poa`, `guardian`, etc.). Neither field carries information about a separate filer.

**Gap.** No existing field on `AuthoredSignature` or on the submission envelope identifies a filer-as-distinct-from-signer. FW-0037 needs a sibling carrier — proposed as `filerRef` on the submission audit trail (NOT on `AuthoredSignature`; the filer didn't sign).

**Surface candidates** for `filerRef`:

- **Submission-level metadata** (e.g., `metadata.filer` on the Response, parallel to EXT-2's `metadata.provenance[path]`). Carries one filer per submission. Simplest shape; matches the canonical scenarios.
- **Per-act event in the Respondent Ledger** (e.g., `filer.session-opened` + `filer.handoff-to-signer` event types via EXT-5). More granular; captures the timestamps of filer→signer handoff. Useful for audit but heavier.
- **Per-AuthoredSignature sibling field** (e.g., `AuthoredSignature.filedBy?`). Wrong shape — couples filer identity to a signature event when the filer didn't sign; conflates with the EXT-3 `principalRef` carrier.

**Lean:** submission-level `metadata.filer` carrier per-submission (one filer per submission scoped to the current handoff); ledger events emit per substantive filer→signer transition. The single `filerRef` is the load-bearing primitive; ledger events are optional richness.

### 1.2 Formspec Respondent Ledger — no `filer` event taxonomy yet

[`formspec/specs/audit/respondent-ledger-spec.md`](../../../formspec/specs/audit/respondent-ledger-spec.md). EXT-5 proposes lifecycle event taxonomy expansion (`response.declined` / `response.withdrawn` / `response.dispute-attached` / `submission.duress-signaled` / `data.erased` / `disclosure.presented` / `field.flagged-by-respondent` / `bot-protection-cleared`). **No `filer.*` event family.**

**Gap.** If FW-0037 wants per-act provenance for filer-session opening + handoff to signer, the ledger event taxonomy needs new event types. Options:

- **Add `filer.session-opened` + `filer.handoff-completed` to EXT-5** (extend the queued EXT). Lightweight; rides existing event taxonomy.
- **Defer to FW-0037 build** (the design specifies the carrier shape; the build proposes specific event types when consumers materialize).

**Lean:** defer to build. The substrate shape FW-0037 needs is the `filerRef` carrier and the runtime UX; specific ledger event types fall out at build time.

### 1.3 WOS — no "delegated authorship" primitive distinct from actor authority

[`work-spec/specs/`](../../../work-spec/specs/). WOS [`actorExtension`](../../../work-spec/specs/kernel/spec.md) covers `ActorKind::Agent` (FW-0058) and the `safety-reviewer` actor extension (proposed by FW-0048 §6.5 / XS-3). No `actorExtension` for "human-filer-on-behalf-of-human-signer."

**Question:** does FW-0037 need a WOS actor-extension? Two options:

- **Yes — `human-filer` actor extension.** Adds a WOS-side identity for the filer; lets WOS governance reason about per-actor permissions (e.g., "preparers may not invoke capability X").
- **No — filer is invisible to WOS.** The respondent is the kernel-visible actor; the filer is a UI-layer convenience whose identity is captured on the Formspec submission's audit trail but never flows into WOS governance decisions.

**Lean:** no WOS extension for slice 1. The signer is the WOS-visible actor; the filer identity rides on the Formspec audit surface (`metadata.filer`). If a deployment's governance needs per-filer-actor reasoning (e.g., licensed-preparer auditing rules per CPA Board), that's a WOS-side row, not FW-0037's design substrate. **Composition-friendly: a future WOS extension can read the Formspec submission's `metadata.filer` to populate governance projections without FW-0037 having authored a parallel substrate.**

### 1.4 Trellis — byte-neutral

[`trellis/specs/`](../../../trellis/specs/). No primitive needed. The `filerRef` carrier rides as metadata on the submission's standard Trellis chain envelope; signatures are unchanged. **Trellis substrate work is ZERO.**

### 1.5 PKAF — no `HumanProvenance` carrier; assertion-side scope

[`PKAF/spec/rkaf-core.md:175`](../../../PKAF/spec/rkaf-core.md). `rkaf:AILineage` (§5.3) tracks AI involvement in producing an assertion. There is no analogous `rkaf:HumanProvenance` for assertions produced by a human filer-not-signer; PKAF is **assertion-side**, not filer-side.

**Vocabulary scope:** if a downstream Rulespec assertion cites a value from a filer-completed form, the assertion's provenance carries (at most) the signer's `AuthoredSignature.signerId`; the filer's identity is upstream (on the Formspec submission) and not directly referenced. Distinct scope. **PKAF does NOT need a new primitive for FW-0037.**

### 1.6 web ADR-0011 — `reviewerPreparer` enumerated; shared with FW-0042

[ADR-0011 Feature Ownership Table line 150](../adr/0011-runtime-feature-resolution-and-policy-gates.md):

| Feature | Instance | Org | Form |
|---|---|---|---|
| Reviewer/preparer | sharing and role model | allowed reviewer/preparer roles | review/preparer allowed |

**`reviewerPreparer` is already a capability key.** FW-0042 (share-draft-with-trusted-reviewer; read+comment only) and FW-0037 (filer-not-signer; read+author + handoff-to-signer) share the key. The design must decide:

- **Share the key** — `reviewerPreparer` carries both flows. Composition: one resolved-runtime block enumerates both `reviewerEnabled` (FW-0042) and `preparerEnabled` (FW-0037) sub-flags. Simpler taxonomy; both rows compose under one capability key.
- **Split the key** — propose `preparerFiling` (or similar) as a separate capability key from `reviewerPreparer`. Cleaner separation; matches the architectural distinction (read-only vs author + handoff).

**Lean:** share the key for slice 1. The two are sibling sharing/role-model concerns; both are about "non-signer in a non-signer role within the same submission." The resolver returns separate sub-flags + sub-policies for each flow. **Append-only `RUNTIME_FEATURE_KEYS` tuple stays stable**; the per-flow detail lives in the resolved-profile block's sub-shape.

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0037 |
|---|---|---|
| **FW-0042** Share-draft-with-trusted-reviewer | [`PLANNING.md:546`](../../PLANNING.md) | **Most adjacent row; load-bearing distinction.** FW-0042 = reviewer can READ + COMMENT, cannot AUTHOR or SIGN. FW-0037 = filer can READ + AUTHOR + complete-but-not-sign; signer signs. Same persona vocabulary ("lawyer, advocate, family member") but different write authority. **Composition:** the same submission may have BOTH a filer (paralegal fills) AND a reviewer (supervising attorney reviews) before the respondent signs. The two roles can co-exist; the design must distinguish them at the sharing-link layer (filer-link vs reviewer-link). |
| **FW-0058** AI-agent filer chain | [`PLANNING.md:681`](../../PLANNING.md) | **Vocabulary firewall.** FW-0058 = AI fills + SIGNS in non-human capacity. FW-0037 = human fills, human respondent SIGNS in capacity `self`. The two are the human + AI legs of J-012; they share the journey but split on capacity. **Composition (rare):** a human filer who uses an AI assistant (FW-0051) during filing, then hands off to a human respondent who signs. Out of scope for slice 1; vocabulary stays clean. |
| **FW-0051** Bring-your-own-assistant | [`PLANNING.md:635`](../../PLANNING.md) | **Composition (common).** A human filer may use a BYO AI assistant during their fill session. The filer's session is the respondent-role-equivalent for the assistant; per-field provenance per EXT-2 carries `attestedBy: filer, sourceRef: assistant-suggested`. **Cross-row touch needed** — note that FW-0051's runtime UX already handles "respondent uses assistant"; FW-0037 reuses that surface with the filer as the assistant's user. |
| **FW-0048** Coercion-aware signing | [`PLANNING.md:597`](../../PLANNING.md) | **FW-0037 is the textbook coercion vector for AP-014.** A "helpful preparer" who fills the form and stands over the respondent while they sign is the canonical case. **Composition rule:** the duress affordance must be reachable from the SIGNER's ceremony — not from the filer's session — for the high-coercion-risk template set (FW-0048 §6.4: financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect). When the form is in the high-coercion-risk set, the filer-not-signer flow may be `forbidden` by default; or it may be `allowed` with a mandatory respondent-only duress affordance at the signing ceremony. **Cross-row touch needed.** |
| **FW-0049** Safe-address handling | [`PLANNING.md:610`](../../PLANNING.md) | **Per-field disclosure to filer.** In a safe-address flow, what does the filer see? Two postures: (a) **filer sees plaintext** for fields they're filing (paralegal must enter the safe-address to file the form); (b) **filer sees masked** for safe-* fields (paralegal fills non-protected fields; respondent fills safe-* fields themselves at signing). **Lean: per-field policy.** The form-policy declares which fields are filer-fillable vs respondent-only-fillable; safe-* fields default to respondent-only-fillable unless the form-policy explicitly grants filer-fillable. **Cross-row touch needed.** |
| **FW-0050** Multi-party submission | [`PLANNING.md:623`](../../PLANNING.md) | **Composition (uncommon but real).** A filer may file on behalf of ONE party in a multi-party flow (paralegal fills Party A's section; Party A signs; Party B fills + signs independently). The per-party `partyRole` carrier per FW-0050 §6.3 is on the SIGNATURE; the filer's `filerRef` is on the SUBMISSION (per-party scope). **Lean:** per-party `filerRef` — one filer per party in a multi-party flow. **Cross-row touch (light) needed.** |
| **FW-0034** Honest-correction | [`PLANNING.md:472`](../../PLANNING.md) | **Who can correct?** A respondent who signed a filer-filed form may later correct it solo; OR the same filer may help correct + the respondent re-signs the correction. The substantive question: does the filer's authority survive across the correction event? **Lean:** correction events follow the original submission's filer-not-signer posture — if the form was filer-filed, the correction MAY be filer-filed; the respondent still signs the correction. Per-form-policy `correctableFiler: same | same-or-new | respondent-only` declares the rule. **Cross-row touch (light) needed.** |
| **FW-0030** Federated identity claim handoff | [`PLANNING.md:441`](../../PLANNING.md) | **Filer-identity provenance.** The filer's identity binding rides the same IdP substrate as the signer's (web ADR-0007 + SC-4 + EXT-8a) — no new primitive needed. The filer's `IdentityClaim` is captured on the submission's audit trail; the signer's `IdentityClaim` is captured on the `AuthoredSignature.identityBinding`. Two separate claims, two separate sessions, potentially different IdPs. **Cross-row touch (informational).** |
| **AP-014** Coercion | [`JOURNEYS.md:131`](../../JOURNEYS.md) | **The canonical AP-014 scenario in the corpus.** FW-0037 design's threat model centers this; FW-0048 composition is the mitigation. |
| **AP-023** Verified ≠ true | [`JOURNEYS.md:185`](../../JOURNEYS.md) | **Verifier discipline.** The verifier renders "filed by [filer-name]; signed by [signer-name]"; it never collapses the two into "verified" — capacity vs truth discipline. The verifier attests to **filer-identity** (the filer was named in the submission) and **signer-identity** (the signer was named in the AuthoredSignature) and **temporal ordering** (the signer reviewed after the filer completed) — NOT that the signer was uncoerced. |

---

## 3. Threat Model — Four Grounded Scenarios

Each scenario gives: the setup, what the FW-0037 mechanism must achieve, what this row's posture provides.

### 3.1 Paralegal fills court-filing forms; client (pro se litigant) signs

- **Setting.** A paralegal at a legal-aid clinic fills a small-claims court complaint on behalf of a competent client filing pro se. The paralegal has the client's signed engagement letter authorizing fill-on-behalf; the client is present and reviews + signs at the end of the session.
- **Filer capacity.** Paralegal — role `professional`, identity bound to their bar-association-issued or law-firm-issued credential.
- **Signer capacity.** Client — capacity `self`; their `AuthoredSignature` rides the standard envelope.
- **Required.** The receipt MUST name the paralegal (`metadata.filer: { ref, role: "professional", completedAt }`); MUST name the client as signer (capacity `self`); MUST show a temporal ordering (filer completed at T1, signer signed at T2, T2 > T1). Court audit MUST be able to determine "who typed this" vs "who attested this."
- **Design posture:** §3 framing decisions; §3.1 form-policy `allowed`; §3.2 `filerRef` carrier; §3.3 runtime-UX "you are filing on behalf of [signer]" banner during filer session + "ready for [signer-name] to review" handoff. **Canonical scenario; design optimizes for this.**

### 3.2 Clinic intake coordinator fills patient demographics + history; patient signs on iPad in waiting room

- **Setting.** A clinic's intake coordinator pre-fills the patient's demographics + medical history from the EHR + insurance card before the appointment. When the patient arrives, the iPad shows them the pre-filled form for review + signature.
- **Filer capacity.** Intake coordinator — role `professional` (or `staff` per deployment taxonomy), identity bound to their clinic-employee credential.
- **Signer capacity.** Patient — capacity `self`.
- **Required.** Same shape as §3.1; the temporal ordering is "filer at T1 in admin session; signer at T2 on the iPad after review." Two device handoff is the canonical case (the filer's session ends; a fresh signer session opens via short-link or QR or device-pass).
- **Design posture:** §3.4 staged handoff (filer's session passes the partially-completed form to the signer's session); §5 failure semantics if the signer's session is opened without the filer's completion step having happened. **Canonical scenario for the device-handoff case.**

### 3.3 Adult child helps elderly competent parent with benefits-redetermination form

- **Setting.** An adult daughter visits her mother (competent, but slow with web forms) to help with annual Medicaid redetermination. The daughter fills the form while sitting next to her mother; the mother reviews each section verbally and then signs at the end.
- **Filer capacity.** Daughter — role `family`, identity bound to her IdP (or a lightweight email-bound claim if the form's assurance floor doesn't require IAL2).
- **Signer capacity.** Mother — capacity `self`; the mother's signature is the operative legal act.
- **Required.** Same shape as §3.1; the temporal-ordering may be very tight (filer T1 = signer T2 - 30 seconds; family helper hands the device immediately to the parent). Receipt MUST name the daughter as filer; the mother's signature is the operative act.
- **Design posture:** §3 framing decisions; the filer-not-signer flow's identity assurance MAY be LOWER than the signer's (the daughter doesn't need IAL2 to TYPE; the mother needs IAL2 to SIGN). **Design must allow asymmetric assurance between filer and signer.**

### 3.4 Adversarial — "helpful preparer" coerces respondent into signing

- **Setting.** A predatory "helper" approaches an elder at a senior center, offers to "help with paperwork," fills a benefits-redirect form (redirecting Social Security to the helper's account), then hands the device to the elder with the screen pre-filled and says "just tap here to confirm." The elder doesn't read the pre-filled fields carefully and taps.
- **Required.** Defenses that hold against an adversarial filer at the signature step.
- **Design posture.** **Layered defense.** (a) **Per-template forbidden-list per FW-0048 §6.4** — benefits-redirect, financial POA, advance directive, marriage/divorce, custody, immigration sponsorship default to `filerNotSigner: forbidden` (the signer MUST be the filer; no separate filer session). (b) **Signer-review gate** — the signing ceremony MUST surface a per-section review affordance for filer-pre-filled fields (each pre-filled section requires the signer to acknowledge "I read this" before the signing CTA enables). (c) **Duress affordance reachable from signer's ceremony** — per FW-0048 §3, the dual-credential mechanism is available on the signer's ceremony surface, not the filer's. (d) **Asymmetric assurance** — high-coercion templates MAY require IAL2+ for the signer regardless of the filer's assurance level; substrate per FW-0030. **§4 design posture documents.**

---

## 4. Open Scope Questions for the Design

Prioritized — ask the first 3-4 before the rest.

### Top 4 to ask first

**Q1. Form-policy shape — three-tier `forbidden | allowed | required` (mirroring FW-0058 / FW-0050 / FW-0049) or asymmetric `forbidden | optional` with no `required`?**

A form REQUIRING filer-not-signer is unusual; the canonical cases are (a) the form ALLOWS it (most), or (b) the form FORBIDS it (high-coercion templates). Required is the procurement-automation analog of FW-0058's "required" tier (e.g., a form designed for paralegal-only filing where the client never types; the client is on paper). It exists but is rare.

**→ Lean: three-tier `forbidden | allowed | required`** to maintain symmetry with FW-0058 / FW-0050 / FW-0049. Reading consistency across the post-MVP capability surfaces matters more than the rare `required` use case being slightly forced.

**Q2. `filerRef` shape — submission-level `metadata.filer` carrier or per-act ledger event?**

Both can co-exist; the question is which is load-bearing.

- **Submission-level `metadata.filer`** — one filer per submission. Simple; matches canonical scenarios; verifier renders trivially.
- **Per-act ledger events** — `filer.session-opened` + `filer.handoff-completed` etc. Captures multiple filers (filer A starts; hands to filer B; B hands to respondent). Richer audit; heavier shape.

**→ Lean: submission-level `metadata.filer` as the load-bearing shape**, with ledger events as optional richness deferred to the build row. The receipt and the verifier render from `metadata.filer`; the ledger event taxonomy is an enrichment for deployments that need multi-hop filer audit trails (rare).

**Q3. Signature ceremony handoff — same-device session-switch vs distinct-device transport?**

When the filer's session ends and the signer's session begins:

- **Same-device session-switch.** Filer logs out; signer logs in on the same device. Fast; works in clinical waiting-room scenarios. UX risk: signer skips review because device is "already on the form."
- **Distinct-device transport via short-link / QR / email** — filer completes; system emits a signer-link via email/SMS or shows QR; signer opens on their phone, authenticates, reviews + signs. Slower; provides natural review-gap.
- **In-person handoff via session-pass** — filer hands physical device; signer authenticates inline. Middle ground.

**→ Lean: all three are first-class adapters; design declares the SignerHandoff port shape, defers reference adapter selection to build.** The form-policy declares which handoff methods are acceptable for the form (e.g., high-coercion templates require distinct-device-with-fresh-auth, even if the filer is sitting next to the signer); other forms allow any of the three.

**Q4. Per-field disclosure to filer — form-policy declares per-field filer-fillable, or default-all-fillable with respondent-only opt-out?**

Two postures:

- **Default-all-fillable**: filer can fill any field; form-policy declares per-field `respondentOnly: true` to gate (safe-* fields default to respondent-only via FW-0049 composition).
- **Default-respondent-only**: filer fills NOTHING by default; form-policy explicitly grants per-field `filerFillable: true` to enable.

**→ Lean: default-all-fillable with respondent-only opt-out** — most fields in canonical scenarios are filer-fillable (demographics, history, contact info); only sensitive/identity fields are respondent-only. The respondent-only set composes naturally with FW-0049 safe-* (which is respondent-only by default for the filer view per §7.3 composition).

### Next 4 (ask after the framing 4)

**Q5. Filer-identity assurance — does FW-0037 declare its own assurance floor, or inherit the form's overall assurance requirement?**

A form requiring IAL2 for the signer (per EXT-8) — does the filer also need IAL2? Or can the filer authenticate at a lower assurance (filer just types; they don't legally attest)?

**→ Lean: filer assurance floor is form-policy-declared, MAY be lower than signer assurance.** Asymmetric assurance is the canonical case (clinic-staff filer at IAL1; patient signer at IAL2). Form-policy field `filerAssuranceFloor?: AssuranceLevel` declares; defaults to the signer's level if unset.

**Q6. Receipt rendering — inline "filed by" vs link-out to audit trail?**

Same shape as FW-0058 Q6. **Lean: inline rendering for slice 1** — the receipt shows "filed by [filer-name] · signed by [signer-name]" as ambient pull-not-push copy near the submission timestamp; expansion to full filer-session audit trail is the audit-trail surface (optional).

**Q7. Form-load failure semantics — when `filerNotSigner: required` but instance lacks a SignerHandoff adapter?**

Standard ADR-0011 typed-error pattern: `UnsupportedRequiredFeatureError` at form-load. **Confirms ADR-0011 pattern applies directly.**

**Q8. Anti-Clippy — does the "you are filing on behalf of" surface inherit anti-Clippy?**

YES — ambient, pull-not-push, no persona, no avatar, keyboard-first per [`formspec-web/CLAUDE.md`](../../CLAUDE.md). The disclosure is a banner-style ambient surface; the handoff CTA is keyboard-accessible.

---

## 5. Honesty Note: What This Row Can and Cannot Do

**Can:**

- Specify the form-policy three-tier `forbidden | allowed | required` for filer-not-signer.
- Specify the `filerRef` carrier shape on the submission audit trail.
- Specify the runtime UX for "you are filing on behalf of [signer]" + handoff to signer.
- Specify the signature-ceremony handoff port shape (deferred reference adapters at build row).
- Specify the per-field filer-fillable vs respondent-only-fillable taxonomy.
- Specify the verifier rendering contract (filer + signer named distinctly).
- Compose with FW-0048 (high-coercion template defaults), FW-0049 (safe-* fields respondent-only), FW-0050 (per-party filer), FW-0034 (correction authorship), FW-0030 (filer-identity), FW-0042 (filer ≠ reviewer), FW-0058 (human vs AI), FW-0051 (filer-using-assistant).
- Codify the AP-014 / AP-023 bindings.
- Propose the `reviewerPreparer` capability sub-shape under ADR-0011 (key already enumerated; design defines the resolved-profile sub-block).
- Propose extending EXT-3 with a sibling `filerRef` shape if shared landing makes sense, OR a standalone EXT-N for the submission-level carrier.

**Cannot:**

- **Solve legal-frameworks for filer authority.** Whether a paralegal can legally file a court document on behalf of a pro se client is a jurisdictional legal question; FW-0037 captures the role + identity but does not authoritatively bless the legal authority. Per AP-023 (verified ≠ true), the receipt attests to filer-identity-claim, not to legal authorization. **Deployments bind the legal-authority verification to their own substrate (paralegal-license check, family-member affidavit, etc.).**
- **Detect coerced signing in real-time.** Composition with FW-0048 names the duress affordance; FW-0037 itself does not author the duress detection. The respondent is the only party who knows if they're being coerced; the duress affordance gives them a back-channel.
- **Enforce per-jurisdiction filer-role taxonomies.** Whether "paralegal" or "advocate" or "navigator" is the right role name for a given deployment is a per-jurisdiction concern; FW-0037 declares an extensible role enumeration with seed values (`family | preparer | professional | advocate | guardian-helper`) and defers per-deployment extensions to the deployment.
- **Specify the WOS substrate for filer-actor governance.** WOS has no `human-filer` actor extension today. If a deployment needs per-filer-actor governance (e.g., per-paralegal capability scoping), that's a WOS-side row, not FW-0037's substrate.
- **Build the runtime.** A future FW-0037 build row materializes adapters + UX.
- **Cover the FW-0058 AI-agent variant.** Distinct row; vocabulary firewall holds.

The honest split: FW-0037 covers **(a) form-policy three-tier**, **(b) `filerRef` carrier shape**, **(c) signature-ceremony handoff port shape**, **(d) per-field filer-fillable taxonomy**, **(e) verifier rendering contract**, **(f) cross-row composition seams**, **(g) `reviewerPreparer` capability sub-block under ADR-0011**. It does NOT cover **(h) legal authority frameworks** (deployment), **(i) coercion detection** (FW-0048 composition), **(j) per-jurisdiction filer-role taxonomies** (deployment), **(k) WOS filer-actor governance** (WOS-side future row), **(l) AI-agent filer** (FW-0058).

---

## 6. External Prior Art

Cited so the design is grounded in real prior art, not invented in isolation. **All references load-bearing for design §3; verify before relying.**

### 6.1 Tax preparation — preparer signs separately from taxpayer

- **IRS Form 1040 Paid Preparer Use Only.** [`https://www.irs.gov/forms-pubs/about-form-1040`](https://www.irs.gov/forms-pubs/about-form-1040) — Form 1040 has a "Paid Preparer Use Only" section requiring the preparer's name, PTIN (Preparer Tax Identification Number), firm name + EIN, and a separate preparer signature. **Direct precedent for filer-identity-on-submission distinct from signer.** The IRS treats the preparer as a named party in the audit trail; the taxpayer is the signer.
- **IRS Form 8879 IRS e-file Signature Authorization.** [`https://www.irs.gov/forms-pubs/about-form-8879`](https://www.irs.gov/forms-pubs/about-form-8879) — the taxpayer signs Form 8879 authorizing the preparer to e-file Form 1040 on their behalf; the preparer's e-file submission carries the taxpayer's signed authorization. **Precedent for the handoff: separate signature-authorization captured on a sibling form; preparer files; both identities on the audit trail.** Not what FW-0037 implements directly, but informs the shape.
- **PTIN registration requirement.** All paid preparers must register for a PTIN; IRS publishes the registry. **Precedent for the filer-identity binding** (the preparer is a registered actor with a verifiable identity).

### 6.2 Legal — paralegal / attorney-of-record + pro se assistance

- **ABA Model Rule 5.3 — Responsibilities Regarding Nonlawyer Assistance.** [`https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_5_3_responsibilities_regarding_nonlawyer_assistance/`](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_5_3_responsibilities_regarding_nonlawyer_assistance/) — names the supervising lawyer's responsibility for nonlawyer staff (paralegals). **Precedent for "filer is a recognized role with named authority structure"**, not just an anonymous helper.
- **Court e-filing systems** (PACER, state court e-file portals). Most accept filings from registered attorneys (the attorney-of-record signs; the paralegal who actually files via the portal is captured in the system's user-account audit but not in the public docket). **Negative precedent** — current systems collapse paralegal-filer into "user-who-clicked-submit" without surfacing it; FW-0037's design improves on this by making the filer a first-class field on the submission's audit trail.

### 6.3 Healthcare — clinical-staff intake

- **HIPAA Authorization to Release Information.** [`https://www.hhs.gov/hipaa/for-individuals/medical-records/index.html`](https://www.hhs.gov/hipaa/for-individuals/medical-records/index.html) — patient authorizes staff to access + transfer their PHI; staff's actions in the EHR are audit-trail-logged separately from patient consent. **Direct precedent for "staff is named in the audit trail; patient is the signer."**
- **Pre-visit intake (Phreesia, Klara, etc.).** Patient-portal vendors pre-fill demographics + insurance via integration with the EHR + send the patient a tablet/portal-link to review + sign. **Operational precedent for the staged-handoff UX** (clinic pre-fills; patient reviews + signs on a different device or session).

### 6.4 Power of Attorney — distinct from FW-0037

- **Uniform Power of Attorney Act (UPOAA).** [`https://www.uniformlaws.org/committees/community-home?communitykey=b1975254-8370-4a7c-947f-e5e1d0c80ab5`](https://www.uniformlaws.org/committees/community-home?communitykey=b1975254-8370-4a7c-947f-e5e1d0c80ab5) — POA agent signs AS the principal; FW-0037 is distinct (FW-0037 = filer fills, principal signs; POA = agent signs, principal is incapacitated). **Mentioned for contrast.** EXT-3 `capacity: "poa"` covers POA; FW-0037 covers the non-POA filer-not-signer shape.

### 6.5 Civic / regulatory precedent

- **GOV.UK — "I'm helping someone" patterns.** [`https://www.gov.uk/`](https://www.gov.uk/) services frequently include "Are you applying for yourself or for someone else?" gates. Examples: Universal Credit applications, voter registration, NHS continuing healthcare assessments. **Precedent for the "I'm filling this for someone else" entry-point UX** — government-scale services that surface the filer-or-self decision early and route accordingly.
- **CMS Online Application for Health Insurance — "Application Filer" role.** [`https://www.healthcare.gov/`](https://www.healthcare.gov/) — the Marketplace application captures an "Application Filer" who may be different from the household member applying for coverage; the filer's identity is recorded; the applicant's attestation is captured separately. **Direct precedent for the FW-0037 shape at federal-program scale.**
- **USCIS Form G-28 Notice of Entry of Appearance as Attorney or Accredited Representative.** [`https://www.uscis.gov/g-28`](https://www.uscis.gov/g-28) — attorney/representative files G-28 alongside any USCIS form; both attorney and applicant identities are captured; applicant signs the underlying form. **Direct precedent for the immigration-domain filer-not-signer shape.**

### 6.6 Standards / data-modeling

- **NIST SP 800-63-3 (Digital Identity Guidelines).** [`https://pages.nist.gov/800-63-3/`](https://pages.nist.gov/800-63-3/) — distinguishes identity-proofing (IAL) from authentication assurance (AAL) from federation (FAL). Relevant for the asymmetric-assurance question (Q5) — the filer's authentication assurance can be lower than the signer's identity assurance.
- **W3C Verifiable Credentials Data Model 2.0.** [`https://www.w3.org/TR/vc-data-model-2.0/`](https://www.w3.org/TR/vc-data-model-2.0/) — same precedent FW-0058 cites for delegation chains; useful when the filer presents a credential proving their role (e.g., paralegal-license VC, family-member-affidavit VC). **Optional substrate for production filer-identity binding.**

---

## 7. Quick-Reference Anchor List

For the design pass — open these in order if a question goes deep:

1. [Journey J-012 — `JOURNEYS.md:343`](../../JOURNEYS.md) — the user story (the human-capacity slice)
2. [Anti-patterns AP-014 / AP-023 — `JOURNEYS.md:131` / `:185`](../../JOURNEYS.md) — the prohibitions
3. [FW-0037 row — `PLANNING.md:505`](../../PLANNING.md) — current state
4. [FW-0042 row — `PLANNING.md:546`](../../PLANNING.md) — adjacent (reviewer-only)
5. [FW-0058 design §7.7 — `thoughts/specs/2026-05-24-fw-0058-ai-agent-filer-chain-design.md`](../specs/2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — AI-leg vocabulary
6. [FW-0051 design — `thoughts/specs/2026-05-23-fw-0051-bring-your-own-assistant-design.md`](../specs/2026-05-23-fw-0051-bring-your-own-assistant-design.md) — filer-with-assistant composition
7. [FW-0048 design — `thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md`](../specs/2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion composition
8. [FW-0049 design — `thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md`](../specs/2026-05-23-fw-0049-safe-address-handling-design.md) — safe-* per-field disclosure
9. [FW-0050 design — `thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md`](../specs/2026-05-23-fw-0050-multi-party-submission-design.md) — per-party filer composition
10. [FW-0034 design — `thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md`](../specs/2026-05-24-fw-0034-honest-correction-path-design.md) — correction authorship
11. [EXT-3 — `thoughts/specs/2026-05-22-upstream-extension-queue.md:46`](../specs/2026-05-22-upstream-extension-queue.md) — capacity enum (signer-side)
12. [web ADR-0011 Feature Ownership Table — `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md:131`](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `reviewerPreparer` enumerated
13. [web ADR-0007 IdentityProvider — `thoughts/adr/0007-identity-provider-port.md`](../adr/0007-identity-provider-port.md) — filer-identity-binding
