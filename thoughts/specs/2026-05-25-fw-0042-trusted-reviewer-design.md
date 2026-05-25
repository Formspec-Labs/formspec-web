# FW-0042 — Share-draft-with-a-trusted-reviewer: design proposal

**Date:** 2026-05-25
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q4 are open until accepted.
**Row:** [FW-0042 in `PLANNING.md:545`](../../PLANNING.md) (design).
**Journey:** [J-014 in `JOURNEYS.md:368`](../../JOURNEYS.md) — "Let me share this draft with my lawyer mid-flight" (lawyer / accountant / advocate / family member sees live draft, leaves field-anchored comments, suggests edits, never signs on the user's behalf, never makes an account).
**Anti-patterns:** [AP-014 (coercion) in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-023 (verified ≠ true) in `JOURNEYS.md:185`](../../JOURNEYS.md), [AP-024 (training/aggregation consent) in `JOURNEYS.md:191`](../../JOURNEYS.md).
**Feature key:** `trustedReviewer` — proposed as the sibling split-key of `preparerFiling` (FW-0037) under [web ADR-0011 Feature Ownership Table line 150](../adr/0011-runtime-feature-resolution-and-policy-gates.md) per [FW-0037 design §4.1 (code-review HIGH F6)](2026-05-24-fw-0037-filer-not-signer-design.md). FW-0042 owns the `trustedReviewer` shape independently; no shared sub-block with `preparerFiling`.
**Source brief:** none. The Done state in PLANNING.md plus the FW-0037 §8.1 split is the framing input; no separate research brief was authored — FW-0042 piggybacks on the prior-art pass FW-0037 did for the human-helper class.
**Substrate sources (load-bearing):**
- [web ADR-0011 line 150](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `reviewerPreparer` umbrella key (split per FW-0037 §4.1 into `preparerFiling` + `trustedReviewer`; this row claims the second half).
- [web ADR-0007](../adr/0007-identity-provider-port.md) — `IdentityProvider` port (reviewer-identity, when claimed, rides the SAME port as filer/signer; see §3.3 for the no-account default).
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — port discipline; `ReviewerSession` + `ReviewThreadStore` ports follow §(b) "deferred till consumer code" with one exception (§4.2).
- [FW-0037 design 2026-05-24](2026-05-24-fw-0037-filer-not-signer-design.md) — split-keys sibling; FW-0042 mirrors §8.1 + §6 composition rules verbatim where applicable.
- [Formspec Assist Specification — `formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md) — Option B candidate substrate (§7 below rejects).
- [Respondent Ledger Spec §6.4 actor enum + §8 event taxonomy — `formspec/specs/audit/respondent-ledger-spec.md`](../../../formspec/specs/audit/respondent-ledger-spec.md) — companion candidate for reviewer-side events; §7 names which events the new SC-6 sidecar emits via the ledger taxonomy and which it owns natively.

Per [web ADR-0004 consume-not-invent](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web does not author a parallel collaboration substrate. FW-0042 proposes a **new sidecar (SC-6)** for the review-thread carrier because no existing substrate fits (§7 defends Option A over Option B). The consumer-side surface — runtime feature key, port shape, reviewer UI, vocabulary firewall — is decided here.

**Slice-1 honesty disclaimer (precedent: [FW-0037 §6.4](2026-05-24-fw-0037-filer-not-signer-design.md), corrected per code-review F2 in commit c48dbab).** Everything below is **slice-1-honest, not architecture-final**. If a future adopter needs reviewer-identity governance under a professional-licensing regime (lawyer-as-reviewer under ABA Model Rule 1.6 confidentiality audit; accountant-as-reviewer under IRS Circular 230; medical-advocate-as-reviewer under HIPAA-business-associate scoping), a follow-on WOS-side row will file an `actorExtension` for `reviewer` and a sibling XS-N to confirm the formspec-side `reviewers[]` carrier ↔ WOS-side actor mapping. The current scope is what a household, a pro se litigant, and a small-business owner need.

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for letting a respondent share a live draft with a **human reviewer** (lawyer / accountant / advocate / family member) such that:

- The reviewer opens a **capability URL** the respondent sent them; no account creation, no IdP step-up, no tenant onboarding.
- The reviewer **sees the live draft** in a renderer-class mode that is structurally read-only — the substrate refuses reviewer-originated value writes against the response.
- The reviewer leaves **field-anchored comments** and (when the form permits) **field-anchored suggestions** the respondent can accept / reject / amend.
- Reviewer comments + suggestions ride a **separate review-thread sidecar (SC-6)** that lives alongside the draft, NEVER inside the signed Response. The signed Formspec Signed Response Payload is byte-identical to a no-reviewer submission.
- The reviewer **cannot sign**: the signature ceremony is structurally unreachable from the reviewer session; no token the reviewer holds satisfies the signer's `IdentityProvider` binding.
- The form-policy can **forbid** sharing for templates where reviewer involvement is itself a coercion or confidentiality vector (high-coercion templates per FW-0048 §6.4 default `trustedReviewer: forbidden`; safe-* templates default to a tighter posture, §6.4).
- The verifier renders ambient "reviewed by N · signed by [signer]" capacity-discipline copy per AP-023 **only when the respondent chooses to attach reviewer attestations to the receipt** — the default is no reviewer-trace on the receipt (§5).

**The substrate does NOT mostly exist** (unlike FW-0037, which sat on EXT-3 capacity + ADR-0007 IdP + a tiny new EXT-36 metadata.filer carrier owned by [FW-0037 §3.2](2026-05-24-fw-0037-filer-not-signer-design.md)). Three substrate pieces are needed: (a) a sidecar spec + schema for the review thread (SC-6); (b) one runtime-feature-key addition (`trustedReviewer` per the FW-0037 §4.1 split); (c) a small Response-envelope hook (EXT-37; owned by this row, FW-0042) carrying the optional reviewer-attestation pointer when the respondent OPTS-IN to including reviewer trace on the signed receipt.

FW-0042 deliverables: framing decisions (Q1–Q4); the `trustedReviewer` capability key + resolved-profile shape (flat, per FW-0037 §4.1 split discipline); the `ReviewerSession` port shape and `ReviewThreadStore` port shape (the two load-bearing ports per ADR-0009 §(b) exception); the SC-6 review-thread sidecar shape; the EXT-37 opt-in receipt-hook shape; the runtime UX contract for the respondent's share-with-reviewer affordance + reviewer-session UI + suggestion accept/reject flow; the verifier rendering contract; the failure semantics; the composition seams with FW-0037 / FW-0048 / FW-0049 / FW-0050 / FW-0051 / FW-0058 / FW-0034.

This is a **design row**. The deliverable is a doc plus follow-on EXT and spec items, not code. The build row is reserved as **FW-0109** (the next free integer above [FW-0108 in `PLANNING.md:1203`](../../PLANNING.md)).

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. FW-0109 build row owns the materialization.
- **Authoring reviewer-professional-conduct frameworks.** Whether a lawyer reading a client's draft over a capability URL satisfies ABA Model Rule 1.6 (confidentiality) or 1.18 (prospective-client duty) is a jurisdictional + practice-rules question. Per AP-023, FW-0042 captures the reviewer-comment material as evidence-of-review; deployments / reviewers bind their own professional-conduct compliance.
- **Inventing a parallel commentary substrate.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), if an upstream substrate covered this, FW-0042 would consume. §7 defends that none does today and that SC-6 is the smallest honest addition.
- **Reviewer-as-signer.** Hard-forbidden by construction. The reviewer's capability URL DOES NOT carry signer-class authority; the signer ceremony refuses any session whose identity claim is not the respondent's (or the filer's, when FW-0037 composes).
- **Reviewer-as-filer.** The reviewer cannot write into the response. Distinct from FW-0037 (filer reads + writes + hands off). See §6.1 + §8.1 vocabulary firewall.
- **AI-agent-as-reviewer.** That's FW-0058 territory at the *signing* axis or FW-0051 at the *helper* axis; FW-0042 is human-reviewer-only. §6.7 vocabulary firewall.
- **Specifying tenant-side reviewer-discovery (e.g., "reviewers I've previously shared with").** Cross-share reviewer-identity portability is wallet-substrate concern per [web ADR-0010 trust model](../adr/0010-respondent-place-trust-model.md), not FW-0042. The respondent re-sends a fresh capability URL per share-act in slice 1.
- **Multi-reviewer concurrency conflict resolution.** Two reviewers commenting on the same field at the same time: the thread substrate appends both; the respondent reads both. No CRDT, no operational-transform; this is comment-on-draft, not co-edit. §3.4.
- **Live cursors / "X is typing" presence.** Out of slice-1 scope. Adopters MAY layer presence on top via their own transport; the SC-6 substrate is presence-agnostic.
- **Reviewer-side undo of the respondent's edit.** The respondent edits between review rounds; the reviewer sees the current draft; old comments may become stale (anchored to a field whose value changed). FW-0042 marks stale comments with a `staleSince` tag (§3.2 + §3.5); does not roll back the respondent's edit.
- **Per-reviewer differential visibility (reviewer A sees fields 1–5, reviewer B sees fields 6–10).** Not in canonical scenarios. Slice-1 reviewer-share is whole-form-or-nothing within the safe-* + multi-party masking rules (§6.3 + §6.4).
- **Replacing FW-0037 (filer-not-signer).** Per FW-0037 §8.1 (split sibling keys per code-review F6): FW-0037 = READ + AUTHOR + HANDOFF (cannot SIGN). FW-0042 = READ + COMMENT (+ SUGGEST when allowed) (cannot AUTHOR, cannot HANDOFF, cannot SIGN). Different capabilities; sibling capability keys.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Trust boundary

**The respondent is the trust anchor.** The reviewer is OUTSIDE the trust boundary for any value-attestation and OUTSIDE the trust boundary for any signing act; the reviewer is INSIDE the trust boundary for advisory commentary within the scope the respondent + the form-policy permit.

- The **form** trusts the **respondent's signing identity** unchanged (web ADR-0007 IdentityProvider port). The signer's `AuthoredSignature` is unchanged from non-reviewer flows; reviewer involvement does NOT alter the signed Response bytes.
- The **form** trusts the **reviewer's possession of the capability URL** as evidence-of-respondent-intent ("the respondent shared this draft with whoever holds this URL"). Reviewer-identity is OPTIONAL per Q3 (§3.3) — the reviewer MAY self-name (free-text) or MAY rideshare an external IdP (`IdentityProvider` port) for higher-assurance professional contexts.
- The **form** does NOT trust the reviewer to authorize anything that affects the signed Response. The reviewer's comments + suggestions ride the SC-6 sidecar; suggestion-acceptance is a respondent-only act that produces a normal respondent-authored value mutation.
- The **respondent** is the only party who can attest to their answers being accurate. Per AP-023, the receipt attests to reviewer-presence (only when the respondent opts in via EXT-37) + reviewer-comment material (verifiable bytes-as-attached, NOT verifiable truth) — never to whether the reviewer's advice was correct.

**What the reviewer SEES (when the form-policy declares `trustedReviewer: comment-allowed | suggest-allowed`):** the Formspec Definition (the form's structure); the per-field help context (References + Ontology sidecars); the per-field values typed in the respondent's session (subject to the safe-* + per-field masking rules below); the existing SC-6 review thread (previous reviewers' comments + the respondent's responses). **The reviewer DOES NOT see** safe-* class fields' plaintext when the form-policy declares them `respondentOnly: true` for the reviewer (Q4 default for safe-* — same discipline as filer-side per FW-0049 §3.3 + FW-0037 §6.3); cryptographic material (signing keys, HPKE recipients); the issuer's deployment-internal config (`safetyTeamRecipients[]` per EXT-30, owned by [FW-0048 §6.4](2026-05-23-fw-0048-coercion-aware-signing-design.md)); other-party drafts in multi-party flows (per FW-0050 §7.1 per-party-scoping discipline — reviewer-share is per-party in multi-party flows, §6.4).

**What the reviewer DOES NOT see:** the signer's signing-ceremony session state (the signer authenticates separately; reviewer-capability URLs do not route to signer surfaces); the duress affordance (per FW-0048 §3, signer-ceremony-only); the respondent's IdP-bound credential material; any field the form-policy marks `respondentOnly: true` for reviewers (composition-rule with safe-* class auto-marks per §6.3).

### 2.2 Attacker model

- **Attacker identity.** (a) A predatory "reviewer" the respondent invited under social pressure (predatory legal-aid scammer; pseudo-advocate who steers toward harmful advice; predatory family member offering "help"). (b) A reviewer who is also the coercer (abusive partner who is also "helping review" the protective-order form — this is the canonical FW-0042 AP-014 vector). (c) An adversary who intercepts the capability URL en route (compromised email, shoulder-surf, screenshot leak). (d) A reviewer-credential-replay attacker (a reviewer who shared their access URL further; the URL leaks to N parties).
- **Attacker goal.** Cause the respondent to (i) accept harmful suggestions, (ii) abandon the form mid-flight, (iii) submit a manipulated form, (iv) reveal protected values (safe-*, multi-party scoped values), (v) sign under coerced advice ("your lawyer says you must sign" when the "lawyer" is the coercer or their proxy).
- **What the attacker observes.** The form's Definition + sidecars are public; the reviewer-capability URL grants access to the draft contents within the form-policy's reviewer-visibility set; the SC-6 thread is visible to all sharers of the URL.
- **What the attacker cannot force.** (a) A signature without the respondent's authenticated session — the signing ceremony MUST run under the respondent's IdentityProvider session; no path lets a reviewer-capability URL produce a signature event. (b) A bypass of the form-load gate when `trustedReviewer: forbidden` (the high-coercion-template set per FW-0048 §6.4 defaults to `forbidden`; safe-* templates default to a tighter posture per §6.4). (c) A bypass of the per-field reviewer-visibility gate — the reviewer cannot read a `respondentOnly` field's plaintext. (d) A bypass of the comment-vs-write boundary — `ReviewerSession.applySuggestion()` does NOT exist; the reviewer's suggestion is a **proposal record on the sidecar**, NEVER a write against the response; only the respondent's session can apply (and the apply produces a normal respondent-authored mutation in the response). (e) A bypass of capability-URL revocation — the respondent can revoke a URL; subsequent accesses fail.
- **What the attacker knows.** Kerckhoffs-style — the attacker has read this design and the form's Definition. **The defense rests on structural mechanisms** (capability-URL-as-bearer with HMAC binding + scope-bound JWT-style claims + revocation list; substrate-level forbid of reviewer-originated writes; signer-ceremony refusal of reviewer credentials; respondent-only suggestion-apply; per-field visibility masks; form-policy forbidden-list for high-coercion templates) **rather than on any single secret.**

### 2.3 Four grounded scenarios

Each scenario gives the setup, what the FW-0042 mechanism must achieve, what this design's posture provides.

**2.3.1 Respondent + their lawyer review an asylum-support letter mid-flight (canonical scenario).** A pro bono attorney is helping with an asylum case. The respondent fills the I-589-companion letter draft, shares the live draft URL with the attorney via secure email or a vetted client portal. The attorney reads, leaves field-anchored comments ("rephrase to track the persecution criterion in §10(b)") and field-anchored suggestions (proposed alternative wording in the narrative-affidavit field). The respondent reviews each suggestion, accepts some, edits others, declines the rest, signs themselves.
- **Required:** the attorney never has an account in the respondent's tenant; the attorney's comments anchor to specific fields and survive subsequent respondent edits with a stale-marker when the anchored field changes; the attorney's suggestion-mode produces proposal records that the respondent applies (or declines) without the attorney's name appearing on the signed Response; the receipt OPTIONALLY records that "this submission was reviewed by N parties before signing" via EXT-37 when the respondent chooses to attach reviewer-trace.
- **Design posture:** §3 framing decisions; §3.1 form-policy `comment-allowed` or `suggest-allowed`; §3.2 SC-6 review-thread sidecar holds the field-anchored comments + suggestions + stale-markers; §3.3 capability URL is the reviewer's access token (no account); §3.4 suggestion-apply is a respondent-only act that produces a normal value mutation. **Canonical scenario; design optimizes for this.**

**2.3.2 Adult child reviews their parent's Medicare-Advantage enrollment draft.** Elderly parent fills the form on their own device; emails the share-URL to their adult child; child opens on their laptop, comments on confusing fields ("Mom, this is asking which plan tier — you said gold to me on the phone, but this says you ticked silver"). Parent fixes the answer, signs themselves.
- **Required:** the adult child does NOT create an account in the insurer's tenant; the comments are field-anchored so "this" is unambiguous; the child cannot accidentally submit the form by clicking the wrong button (reviewer UI has no submit affordance — structural, not UX-cosmetic); the parent retains authority throughout.
- **Design posture:** §3.3 capability URL + no-account default; §3.5 reviewer-UI structurally omits submit/sign affordances (renderer-class enforcement; substrate-class enforcement is the signer-ceremony refusal in §3.6); SC-6 thread is the comment carrier per §3.2. **Canonical family-helper case.**

**2.3.3 Small-business owner shares a tax-credit application with their CPA for a quick sanity check.** Owner fills the R&D-credit application; shares the draft URL with the CPA via the CPA's vetted intake portal; CPA opens, asks two clarifying questions in the comment thread, suggests one corrected calculation, signs off ("looks good"). Owner accepts the calculation suggestion, signs themselves.
- **Required:** the CPA's professional identity is OPTIONALLY claimable (via the firm's IdP) for the higher-assurance "I, [CPA name with PTIN], reviewed this" attestation that the owner MAY attach to the receipt via EXT-37; the substrate carries the reviewer-identity binding when the reviewer self-asserts via the standard IdentityProvider port (web ADR-0007).
- **Design posture:** §3.3 Tier 2 reviewer-identity-claim path (optional self-IdP); §3.7 receipt opt-in via EXT-37 carries `reviewers[]` with the CPA's identity binding + a signed reviewer-attestation per the SC-6 sidecar's attestation-event shape. **Canonical professional-reviewer scenario.**

**2.3.4 Adversarial — "helpful reviewer" is the abuser.** A DV survivor is filling a custody declaration; the abuser insists on "helping review" and demands the share-URL; the survivor under coercion sends it; the abuser opens the draft, reads the survivor's narrative + the survivor's safe-* address + the children's school location, and leaves comments that steer the survivor toward weaker testimony.
- **Required:** structural defenses that hold against an adversarial reviewer at the visibility + advisory step (no per-field-rewrite required since reviewer cannot write).
- **Design posture.** **Layered defense (substrate-class layers AND-composed; renderer-class affordance separately noted).** (a) **Per-template forbidden-list per FW-0048 §6.4 + §6.4 here** — custody, marriage/divorce, immigration sponsorship, advance directive, benefits-redirect, financial POA default to `trustedReviewer: forbidden` (the survivor cannot share the draft with anyone via the platform; the URL refuses to mint). (b) **Safe-* fields auto-mark `respondentOnly` for reviewers per §6.3** — the survivor's safe-* address never renders in the reviewer's session, regardless of any other policy. (c) **Capability URL is revocable** — survivor can revoke immediately the URL granted under duress; subsequent reviewer accesses fail with `CapabilityRevokedError`. (d) **Form-load enforcement** — when `trustedReviewer: forbidden`, the share-affordance is structurally absent from the respondent UI; no path exists. (e) **Renderer-class affordance: a "panic-revoke" gesture** — the formspec-web reference renderer SHOULD expose a top-level "stop sharing with everyone" button visible in the respondent's session whenever ANY reviewer-share is active. **Renderer-class only; non-reference renderers can skip; substrate-class layers (a)+(b)+(c)+(d) carry the defense.** Substrate-class promotion (e.g., a default-revoke-on-X-minutes timer; auto-revoke-on-safe-template detection) is filed as future row FW-0110 (§9), blocked on a real coercion incident OR adopter request — same precedent as FW-0107 for FW-0037. **Composition rule (explicit; substrate-honest): the AP-014 vector on FW-0042 is closed by (a)+(b)+(c)+(d) AND-composed; (e) is a renderer-class enhancement on top. The substrate refuses to surface the share-affordance for high-coercion templates regardless of UI choice; safe-* values are structurally invisible to reviewers regardless of UI choice.**

### 2.4 Out-of-scope threat patterns

Named explicitly so the design isn't read as covering them:

- **Compromised reviewer device.** Once an attacker controls the reviewer's device, the reviewer's session can be manipulated. Mitigation = the reviewer's device hygiene. FW-0042 does not author endpoint security.
- **Out-of-band reviewer advice.** A reviewer who reads the draft and then calls the respondent on the phone and gives bad advice is outside any platform mechanism's reach. The platform records what was said in the SC-6 thread; advice given off-platform is invisible.
- **Reviewer-credential-redistribution.** A reviewer who shares the capability URL further does so against the respondent's intent. Defenses: capability URLs are revocable (§3.3); reviewer-identity-claim (Tier 2) helps the respondent see who actually opened; rate-limiting on capability-URL access can be added per-deployment. Cannot be fully prevented (any URL can be copy-pasted) — substrate-layer concern.
- **Coerced-respondent-shares-URL-under-threat.** Same shape as FW-0048's coerced-signing case but at the share-act. Mitigation: form-policy can forbid `trustedReviewer` entirely on high-coercion templates per §6.4. Beyond that, a coerced respondent who shares the URL is in the same regrettable place as a coerced respondent who signs.
- **Per-jurisdiction professional-conduct verification.** Whether the "lawyer" reviewing is actually licensed, whether the "CPA" actually holds a PTIN, whether the "advocate" is recognized by the relevant agency — all per-deployment legal-authority questions. FW-0042 captures the IDENTITY claim (Tier 2); deployments verify professional license out-of-band.
- **Cross-deployment reviewer-reputation.** A reviewer's behavior at deployment A doesn't bind their behavior at deployment B. Cross-deployment reputation is out of scope.
- **Civil-discovery exposure of the SC-6 thread.** A comment thread on a draft may itself become discoverable in subsequent litigation (e.g., the abuser subpoenas the survivor's tenant for "all reviewer comments on every draft"). Per §1.2 non-goal on professional-conduct frameworks, FW-0042 captures the substrate; deployments + reviewers must consider discovery implications per their jurisdiction (privileged-communication doctrines vary). The substrate enables encryption-at-rest per [web ADR-0010 trust model](../adr/0010-respondent-place-trust-model.md) so the issuer cannot read the thread in clear; subpoena resistance is a deployment-operational concern, not a substrate guarantee.

## 3. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 3.1 Q1 — Form-policy shape: three-tier `forbidden | comment-allowed | suggest-allowed`

**PROPOSAL.** Form-policy carries a **three-tier** shape, matching the sibling-row split discipline (FW-0037 / FW-0049 / FW-0050 / FW-0058) on the substrate-class refusal point + the agency-preserving omission of `required`:

| Tier | Semantics |
|---|---|
| `forbidden` | Form REJECTS reviewer-share. Share-affordance is structurally absent from the respondent UI; capability-URL minting endpoints refuse. Default for high-coercion / rights-impacting templates (FW-0048 §6.4: financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect). Form-load with a reviewer-capability URL on a `forbidden` form triggers typed `FeaturePolicyConflictError` and routes the visitor to a plain-language unavailable page. |
| `comment-allowed` | DEFAULT for most forms when the form opts into reviewer-share. Reviewers can view + leave **comments**; suggestions are NOT permitted. The SC-6 sidecar carries comment records only; no `suggestion` records may be authored. Reviewer UI omits the suggest affordance. Use case: forms where any wording change should be hand-typed by the respondent to preserve voice / authorship attribution. |
| `suggest-allowed` | Reviewers can view + comment + author **suggestion records** (proposed field-value changes the respondent reviews and apply/declines). The SC-6 sidecar carries comment + suggestion records. Reviewer UI surfaces a "suggest a change to this field" affordance per field. **Suggestion records are NEVER auto-applied; the respondent's apply act is the only path from suggestion → response value.** Use case: most professional-reviewer scenarios (lawyer, CPA, advocate) where the reviewer's value-add includes proposed wording. |

**Why three tiers (collapsed from a prior four-tier proposal).** The earlier four-tier shape carried `read-only` AND `comment-allowed` as distinct, with the honest admission that the two behave identically in slice 1. Per the slice-1-honesty discipline (FW-0037 §6.4 precedent), the speculative `read-only` tier was dropped — the suggest gradient is real (suggestion records carry a candidate VALUE and require a respondent-apply step; comments do not), so the form-policy distinction `comment-allowed` vs `suggest-allowed` earns its place; a parallel `read-only` vs `comment-allowed` distinction did not. Three tiers preserves sibling symmetry on `forbidden`, encodes the real operational gradient, and avoids reserving vocabulary for a differentiation that may never land. **The `forbidden` tier matches the sibling pattern exactly (no drift on the substrate-class refusal point).**

**Why NOT a `required` tier.** Reviewer-share is structurally an *opt-in*; a form that REQUIRED reviewer-share would refuse to load unless the respondent shared with at least one reviewer first, which inverts the agency model (the respondent is in control of who sees their draft, not the form). Forbidding `required` is a substrate-class guarantee that the respondent's autonomy to NOT share is preserved.

**Alternative rejected: two-tier `forbidden | allowed` (full sibling symmetry).** Considered for maximum vocabulary consistency with FW-0037 / FW-0058 / FW-0049 / FW-0050. Rejected: comment vs suggest is operationally distinct (suggestion carries a value; suggestion requires a respondent-apply step; suggestion has structural per-field refusals on safe-* per §3.4). Compressing them into one `allowed` tier would force the SC-6 schema to be permissive everywhere and rely on per-field policy for differentiation. The minor `comment-allowed` / `suggest-allowed` asymmetry with the siblings is the smaller cost than substrate-class compression.

**Alternative rejected: four-tier `forbidden | read-only | comment-allowed | suggest-allowed` (prior proposal).** Rejected per slice-1-honesty: `read-only` and `comment-allowed` behaved identically in slice 1; reserving a tier whose differentiation is purely future-revision is the kind of speculative shape this design discipline rejects. If a future revision genuinely needs the `read-only` (no-commentary) vs `comment-allowed` (commentary-OK) split, that's an additive tier-insertion at the time of the real need, with the real semantics named.

**Alternative rejected: per-reviewer-role granular gating (`allowedRoles: { lawyer: "suggest", family: "comment", advocate: "read-only" }`).** Considered for finer control. Rejected: same logic as FW-0037 §3.1 — per-role gating is an *org-policy* concern (org-policy enforces what roles the platform recognizes), not a *form-policy* concern (form-policy gates the FLOW shape). The three-tier above is the form-policy axis; the org-policy layer adds `allowedRoles[]` orthogonally (§4.3).

### 3.2 Q2 — Comment carrier: separate sidecar (SC-6), NOT part of signed Response

**PROPOSAL.** Author a new sidecar specification `formspec/specs/review-thread/review-thread-spec.md` + schema `formspec/schemas/review-thread.schema.json` — referred to as **SC-6** in the upstream extension queue. The signed Formspec Response **does NOT include the review thread**; the thread lives in a parallel sidecar artifact bound to the draft id, NOT the Response id.

**Substrate justification (load-bearing — defends the Option A call over Option B; see §7 for the architectural call).** The reviewer-thread artifact has FOUR substrate-shaping properties that none of the existing carriers absorb cleanly:

1. **It must NOT corrupt the signed Response bytes.** The "reviewer cannot sign on the respondent's behalf" invariant is cryptographically real ONLY IF the signed Response is byte-identical to a no-reviewer submission. Embedding reviewer comments in the Response (or in any sibling block on the Response envelope that participates in the canonical-signed-bytes preimage) means the bytes the respondent signs include reviewer-authored material — opening litigation theories about whose intent the signature represents. **Sidecar-not-envelope is the only honest shape.**
2. **It carries multi-author event history.** A thread is a sequence of comments + replies + suggestions + accept/decline records authored by multiple parties (respondent + N reviewers). Existing carriers (metadata.provenance per EXT-2; metadata.derivations; metadata.filer per EXT-36; AuthoredSignature.agentChain per EXT-3) are point-records, not threads. The thread needs append-only ordering, anchor stability, stale-tracking, reply-nesting.
3. **It needs different lifetime than the Response.** The respondent may delete the thread without invalidating the signed Response. The Response signature must hold even when the thread is rotated, archived, or revoked. Linking them via *reference* (the optional EXT-37 receipt hook carries a hash-pointer to the thread artifact) keeps the lifetimes independent.
4. **It carries optional reviewer-identity bindings.** The thread's per-comment author may be a free-text-named-reviewer (Tier 1 per §3.3) OR a credentialed IdP-bound reviewer (Tier 2). The substrate must accommodate both without forcing identity at every record. Existing carriers force identity (`AuthoredSignature.identityBinding` is non-optional; `metadata.filer.identityBinding` is non-optional).

**SC-6 shape (sketch):**

```text
// formspec/schemas/review-thread.schema.json — new sidecar
ReviewThread {
  threadId: string                    // URN; bound to the draft id (1:1 thread per draft for slice 1)
  draftRef: string                    // URN of the draft this thread comments on
  definitionUrl: string               // pinned form-definition URL at thread creation
  definitionVersion: string           // pinned form-definition version at thread creation
  createdAt: string                   // RFC 3339
  policySnapshot: {                   // copied from resolved-runtime-profile.trustedReviewer at creation
    posture: "comment-allowed" | "suggest-allowed"
    respondentOnlyFieldPointers: ReadonlyArray<string>  // safe-* + per-field auto-marks, pinned at creation
  }
  shares: Array<ReviewerShare>        // capability URLs ever minted for this thread; revocation tracked on each entry
  events: Array<ReviewThreadEvent>    // append-only event log; never rewritten
  // Optional integrity-stack tie-in (renderer-class for slice 1; SC-6 spec proposes the hooks):
  hashChain?: Array<{eventIndex: number; eventHash: string; priorEventHash: string | null}>  // analogous to respondent-ledger §6.3 hashChain
}

ReviewerShare {
  shareId: string                     // URN
  mintedAt: string                    // RFC 3339
  mintedBy: "respondent"              // slice-1 limit: only the respondent mints shares; no reviewer-re-shares
  capabilityClaim: {                  // the bearer-bound claim; HMAC verified at redemption
    scope: "view" | "view+comment" | "view+comment+suggest"   // bounded by the thread's policySnapshot.posture
    expiresAt?: string                // RFC 3339; optional time bound
    audienceHint?: string             // free-text or registered identity claim; not authoritative
  }
  revokedAt?: string                  // RFC 3339; absence means active
  revokedReason?: "respondent-revoked" | "expired" | "form-policy-changed" | string  // adopter-extensible
}

ReviewThreadEvent {
  eventId: string                     // URN
  eventIndex: number                  // monotonic in the thread
  occurredAt: string                  // RFC 3339
  author: {
    kind: "respondent" | "reviewer"
    shareId?: string                  // when kind == "reviewer"; pins which capability URL the comment came from
    displayName?: string              // free-text Tier 1 self-name OR display from IdP
    identityBinding?: IdentityBinding // Tier 2; same shape as AuthoredSignature.identityBinding per web ADR-0007
  }
  payload:
    | { kind: "comment"; anchor: FieldAnchor; body: string; replyTo?: string /* eventId */ }
    | { kind: "suggestion"; anchor: FieldAnchor; proposedValue: unknown; rationale?: string }
    | { kind: "suggestion-accepted"; suggestionEventId: string; appliedValue: unknown }  // respondent-authored only
    | { kind: "suggestion-declined"; suggestionEventId: string; declineReason?: string }  // respondent-authored only
    | { kind: "comment-resolved"; commentEventId: string; resolution?: string }  // respondent or original commenter
    | { kind: "share-minted"; shareId: string }   // respondent-authored mirror of ReviewerShare append; redundant carrier for verifier-walk convenience
    | { kind: "share-revoked"; shareId: string; reason?: string }
}

FieldAnchor {
  fieldPath: string                   // RFC 6901 pointer into the Response
  definitionVersionAtAnchor: string   // pinned; used for stale detection on definition migration
  valueHashAtAnchor?: string          // SHA-256 of the field's value at anchor time; absent for unfilled fields
  // staleSince is computed at read time by comparing the current field state to (valueHashAtAnchor, definitionVersionAtAnchor)
}
```

**Single-thread-per-draft for slice 1.** One thread per draft. Multiple reviewers share the thread via per-reviewer `ReviewerShare` capability URLs all referencing the same `threadId`. Multi-thread-per-draft (parallel review streams) is deferred to a future revision — additive change.

**Per-comment optional identity.** Per §3.3 Tier 1 (free-text self-name) is the default; Tier 2 (IdP-bound) is OPTIONAL. The `author.identityBinding` block is omitted in Tier 1 — the substrate accommodates anonymous-by-default with respondent-meaningful self-naming.

**Append-only event log.** Like the Respondent Ledger Spec §6 chain discipline, the thread's `events[]` is append-only. Comments don't get deleted; they get `comment-resolved`. Suggestions don't get rewritten; they get `suggestion-accepted` or `suggestion-declined`. The trail is the value.

**Optional hash-chain for verifier-grade threads.** The `hashChain` block mirrors the respondent-ledger §6.3 `priorEventHash` / `eventHash` pattern. Renderer-class affordance for slice 1 (the reference renderer SHOULD emit the chain when EXT-37 receipt-attestation opts in); substrate-grade enforcement is a future revision.

**Slice-1 honesty: posture-drift mid-thread is out of scope.** If the form-policy `trustedReviewer` posture changes (e.g., `suggest-allowed` → `comment-allowed`, or either tier → `forbidden`) after thread creation, the respondent MUST explicitly revoke + remint the capability URL to apply the new posture. The thread-pinned `policySnapshot` (captured at thread creation per the SC-6 shape above) carries until revoke; existing shares continue under the pinned posture; new shares require a fresh mint that captures the current resolved policy. A live-resolver path that walks every active share on a policy change is deferred (slice 2 if an adopter needs it; the operational footprint of every form-policy edit triggering N share-state mutations is itself a substrate concern).

**Alternative rejected: embed reviewer comments inside the signed Response.** Considered as a "single artifact" simplification. Rejected for substrate-honesty reason (1) above — the signed bytes would include reviewer-authored material; the cryptographic claim "the respondent signed this" weakens. **Hard-rejected.**

**Alternative rejected: piggyback on Respondent Ledger event taxonomy (`reviewer.commented` / `reviewer.suggested` events per EXT-5).** Considered for substrate reuse. Rejected: the ledger's actor enum (§6.4) does NOT include `reviewer`; adding it is an additive extension; BUT the ledger's event-record shape (one event = one ChangeSetEntry / one ValidationSnapshot / one IdentityAttestation) doesn't model threads — it models a flat sequence. A thread's anchor + reply + accept-decline relationships need cross-event references the ledger schema doesn't carry. The ledger can host CERTAIN reviewer-related events (`reviewer.invited`, `reviewer.access-revoked`) per §7.2 below — but the comment body + thread structure needs its own carrier. SC-6 owns the thread; the ledger optionally records share-lifecycle events for cross-event audit.

**Alternative rejected: extend Assist Spec with a reviewer profile.** Considered (Option B in the upstream queue framing). Rejected — see §7 architectural call.

### 3.3 Q3 — Reviewer access token: capability URL with HMAC-bound scope; reviewer-identity is optional (Tier 1 free-text or Tier 2 IdP-bound)

**PROPOSAL.** The reviewer's access is a **capability URL** — a shareable URL whose path or query carries an HMAC-signed claim binding the scope (`view | view+comment | view+comment+suggest`), the `threadId`, and optional expiration. The reviewer needs no account; the URL IS the credential.

```text
https://<deployment-host>/r/{threadId}/{capabilityClaim}
where capabilityClaim is a compact, HMAC-bound JWT-like structure (alg: HS256 or similar adopter choice;
key bound per-tenant, rotated per deployment policy)
```

**Substrate justification.**

- **No account creation.** J-014's "without that reviewer making an account" is load-bearing — accounts impose a tenant-onboarding cost that defeats the impromptu-helper scenario (an adult child opening their parent's draft from an email link should not have to register).
- **Capability URLs are bearer-tokens (intentional design choice).** Per W3C Web Annotation Protocol + standard capability-URL practice, anyone holding the URL acts under it. The URL leaking is a known risk; mitigation is revocation + expiration + opt-in identity-claim escalation.
- **HMAC-bound scope** prevents URL-substitution attacks — a reviewer holding a `view+comment` URL cannot mutate the URL to claim `view+comment+suggest`; the HMAC fails.
- **Per-tenant key binding** prevents cross-tenant capability-URL reuse — a URL minted under tenant A's key does not redeem under tenant B.

**Tier 1 — free-text self-name (default).** The reviewer's first action upon opening the URL is to type a display name ("Mom", "My lawyer Sarah", "CPA at the firm"). The display name is metadata for the respondent's benefit; the substrate makes no truth claim about it. Stored on the comment event's `author.displayName`.

**Tier 2 — IdP-bound identity (optional escalation).** The reviewer MAY claim a credentialed identity via the standard [web ADR-0007 IdentityProvider port](../adr/0007-identity-provider-port.md) — the same port the respondent + filer use. The CPA scenario (§2.3.3) is the canonical use case: the firm's IdP issues credentials with assurance level L2 (corroborated) or L3 (verified); the reviewer authenticates via the firm's existing IdP session; the comment event's `author.identityBinding` carries the standard binding. **No new IdP integration; the existing port serves.**

**Per-form-policy assurance floor.** The form-policy MAY require Tier 2 reviewer-identity for `suggest-allowed` posture (a deployment may decide that suggestion-authority requires named-and-bound identity; the respondent can still receive untrusted-display-name comments for `comment-allowed`). The policy-resolved `trustedReviewer.reviewerAssuranceFloor?: AssuranceLevel` field (§4.3) drives the gate.

**Capability URL revocation.** The respondent's session has a "revoke this share" affordance per `ReviewerShare`; revocation appends a `share-revoked` event to the SC-6 thread + sets `revokedAt` on the share entry; subsequent capability-URL redemptions fail with `CapabilityRevokedError`. Revocation MAY be propagated via revocation-list pull on each capability-URL access (slice 1) OR via pub-sub for active reviewer sessions (deferred).

**Slice-1 honesty: revocation consistency model.** Revocation is **eventually consistent** with a TTL-bounded staleness window (default ≤ 60s; adopter-configurable). The reviewer's open browser tab may continue to render thread state until the cache TTL elapses; the next capability-URL hit (cache-miss, refresh, navigate, mint-comment) consults the revocation list and fails. Strong-consistency revocation (each redeem hits the revocation backend with no cache) is deferred to slice 2 if an adopter needs it (e.g., a survivor-services deployment where 60s of residual visibility is itself harmful). The adopter can shrink the TTL toward zero at the cost of revocation-backend load; the substrate carries the configuration knob.

**Alternative rejected: reviewer must create an account.** Rejected explicitly — directly violates J-014 "without that reviewer making an account."

**Alternative rejected: reviewer authenticates via the respondent's IdP (delegated grant).** Considered for cleaner identity continuity. Rejected: this puts the respondent's IdP in the loop on a third party who is structurally NOT the respondent, conflating identity boundaries and creating a tenant-onboarding step. The capability-URL pattern preserves the no-account property; Tier 2 self-IdP for the reviewer is the higher-assurance path for those who want it.

**Alternative rejected: per-reviewer one-time-code + magic-link auth (no persistent URL).** Considered as a tighter share model. Rejected for slice 1: the magic-link-per-act pattern adds a notification round-trip on every reopen by the reviewer, which is operationally painful in the canonical scenarios (reviewer reads, sets it down, comes back 20 minutes later — having to redo a magic-link every time defeats the experience). The capability URL with revocation + expiration is the better-balanced default; magic-link-per-act is a deployment-side hardening MAY for high-sensitivity deployments.

### 3.4 Q4 — Per-field comment-vs-suggest taxonomy: comments open by default on all fields; suggestions structurally forbidden on safe-* + respondent-only fields

**PROPOSAL.** Reviewers may comment on ANY field by default; comments anchor to the field path. Suggestions (when the form-policy permits) are **structurally forbidden** on safe-* class fields (per §6.3 composition with FW-0049) and on any field the form-policy marks `respondentOnly: true` for reviewers.

**Field rendering in reviewer session.**

| Field type | In reviewer session |
|---|---|
| Default (reviewer-visible) | Renders with current respondent value visible; comment affordance attached; suggestion affordance attached when posture == `suggest-allowed`. |
| Form-policy `respondentOnly: true` (for reviewers) | Renders as masked label ("Respondent-only field — value hidden from reviewers"); comment affordance attached (reviewer can advise about a field they cannot see the value of — e.g., "Mom, double-check the SSN field looks right; I can't see it"); suggestion affordance HIDDEN (reviewer cannot suggest a value for a field they cannot see). |
| Safe-* class (per FW-0049, auto-marks `respondentOnly: true` for reviewers per §6.3) | Same as `respondentOnly: true` — masked, commentable, NOT suggestable. |

**Field rendering in respondent session (with active reviewers).**

| Field type | In respondent session |
|---|---|
| Has open comments | Renders with a comment indicator (count + ambient marker); expansion shows thread; "resolve" affordance appends `comment-resolved` event. |
| Has open suggestions | Renders with a suggestion indicator + inline preview of proposed value; "accept" applies the suggestion (produces a respondent-authored mutation on the response + appends `suggestion-accepted` event); "decline" appends `suggestion-declined` event with optional reason; "edit and accept" applies an edited variant (produces respondent-authored mutation + appends `suggestion-accepted` with `appliedValue` differing from `proposedValue`). |
| Has stale comments | Comment indicator carries a stale-marker badge ("This comment was made when this field had a different value"); expanding shows the prior-value hash for context. |

**Suggestion-apply is structurally respondent-only.** The `suggestion-accepted` event MUST have `author.kind == "respondent"`; enforcement is two-layered. **Schema layer:** the SC-6 schema's conditional rule rejects `suggestion-accepted` / `suggestion-declined` / `share-minted` / `share-revoked` events whose `author.kind != "respondent"`. **Adapter layer:** the `ReviewThreadStore.appendEvent` port signature (§4.2) carries a `sessionToken: CapabilityToken | RespondentSessionToken` argument, and the adapter MUST cross-check the token's resolved role against `author.kind` before append — a reviewer-bound `CapabilityToken` cannot append a respondent-authored event regardless of what the caller-supplied `author` block claims. The reviewer's session has no UI path to apply their own suggestion AND no port path either. **No "auto-apply suggestion after N minutes," no "auto-apply if reviewer is Tier-2-credentialed lawyer" — both invert the agency model.**

**Stale-marker semantics.** A comment's `FieldAnchor.valueHashAtAnchor` is compared against the current value's hash at read-time; mismatch sets the stale-marker. Stale comments are NOT auto-archived (the reviewer may still have made a valuable observation; the respondent decides if it's still relevant); the marker is informational.

**Alternative rejected: suggestions allowed on all fields (including safe-*).** Rejected: a suggestion requires the reviewer to SEE the field to suggest a value; safe-* fields are structurally invisible to reviewers per the composition rule. Allowing "blind" suggestions would leak information about expected value shapes via the suggestion form's input semantics.

**Alternative rejected: per-field per-form-policy `commentable` opt-out.** Considered for tightly-controlled forms. Rejected for slice 1: the operational cost (every form author declares which fields permit commentary) is high; the value (some fields' presence-of-comment leaks information) is low. The blanket "all fields commentable" + safe-* mask is the simpler honest default; per-field opt-out is a future-revision additive change.

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011 — sibling key `trustedReviewer` (per FW-0037 §4.1 split)

**PROPOSAL.** Add `trustedReviewer` to the append-only `RUNTIME_FEATURE_KEYS` tuple per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts). This is the sibling key of `preparerFiling` per FW-0037 §4.1 — one key per feature, flat ADR-0011 precedent preserved, NO shared sub-block.

**ADR-0011 amendment proposal text (small; consolidates with the FW-0037 amendment that splits the umbrella row):**

> Replace ADR-0011 Feature Ownership Table line 150 entry `reviewerPreparer` with two sibling rows per FW-0037 §4.1 (already proposed) — `preparerFiling` and `trustedReviewer`. The `trustedReviewer` row's Evidence text reads:
>
> | Capability | Evidence |
> |---|---|
> | `trustedReviewer` | `ReviewerSession` adapter + `ReviewThreadStore` adapter + reviewer-identity binding (optional Tier 2) + SC-6 review-thread sidecar artifacts + capability-URL minting + revocation list per share + respondent-only suggestion-apply enforcement (FW-0042 scope). |

**Append-only key ordering.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts), `RUNTIME_FEATURE_KEYS` is append-only. **FW-0042 adds one new key — `trustedReviewer`** — when the tuple is extended at build time. Coordination with FW-0037 (which adds `preparerFiling`): per FW-0037 §4.1, the two are independent; the order of landing doesn't matter; whichever ratifies first appends; the other follows. **The amendment text above SHOULD ride with whichever design ratifies second** to keep the table-replacement edit a single PR (the first-to-land design carries half the table; the second carries the consolidating edit).

| Layer | What ADR-0011 will name for `trustedReviewer` (FW-0042 only) |
|---|---|
| Instance capability | Adapter-backed: (a) `ReviewerSession` adapter for capability-URL minting + redemption + revocation; (b) `ReviewThreadStore` adapter for the SC-6 sidecar persistence + retrieval; (c) optional `IdentityProvider` adapter for Tier 2 reviewer-identity binding (reuses web ADR-0007 port); (d) verifier-render adapter for the optional EXT-37 receipt hook. Instance declares which Tier-2 IdPs are wired + retention policy for the SC-6 store. |
| Org policy | (a) Allowed reviewer-identity tiers (org may forbid Tier-2 entirely OR require Tier-2 for `suggest-allowed`); (b) Capability-URL maximum lifetime; (c) Maximum active shares per draft (rate-limit); (d) Allowed reviewer-comment-storage retention period; (e) Org-level forbidden-list (org may forbid `trustedReviewer` entirely regardless of form-policy — e.g., a high-security tenant). |
| Form policy | Three-tier per §3.1: `forbidden` / `comment-allowed` / `suggest-allowed`. High-coercion templates per FW-0048 §6.4 default to `forbidden` per §6.4 composition. Per-field `respondentOnly: true` for reviewers per §3.4. Per-form `reviewerAssuranceFloor?: AssuranceLevel` per §3.3. Per-form `maxActiveSharesPerDraft?: number` per Q3. Per-form `defaultShareExpiresAtRule?` (e.g., "72h", "form-submit", "never"). |
| Resolved runtime profile | `trustedReviewer.posture` + `allowedRoles[]` (when org-policy enumerates) + `reviewerAssuranceFloor` + `maxActiveSharesPerDraft` + `defaultShareExpiresAtRule` + `respondentOnlyFieldPointers[]` + (when posture != "forbidden") `reviewerSessionBindingRef` + `reviewThreadStoreBindingRef`. Flat, no sub-block. Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 only if a `required`-grade composition existed — since FW-0042 forbids `required` per §3.1, this branch is unreachable for `trustedReviewer` standalone but the typed-error machinery is preserved for composition orthogonality. Form-load throws `FeaturePolicyConflictError` when the form forbids and the org requires (the org-forbids-form-permits case is reachable). |

**Locale-conditional set.** `trustedReviewer` is **NOT** locale-conditional — the per-form policy doesn't change with locale. No `LOCALE_CONDITIONAL_FEATURE_KEYS` membership.

**Invariant (mirrors FW-0037 §4.3 LOW F9).** When org-policy enumerates `allowedRoles[]`, resolved `allowedRoles` MUST be the intersection of form-policy `allowedRoles` (when declared) and org-policy `allowedRoles`. Empty intersection is a `FeaturePolicyConflictError` at form-load — no reviewer role is allowed across both layers, so the `posture: comment-allowed | suggest-allowed` flow has nothing it can offer.

### 4.2 Port shapes — `ReviewerSession` + `ReviewThreadStore` land here; reference adapters at build

Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md): post-MVP ports await consumer code. FW-0042 is a design row; build row is FW-0109. The honest application is to specify the **adopter contracts** here and let the port shapes land with the build, with TWO explicit exceptions per the FW-0037 §4.2 precedent: the `ReviewerSession` port shape AND the `ReviewThreadStore` port shape (the two load-bearing ports) land here.

**Adopter contracts (what the FW-0109 build row must satisfy).**

| Adopter axis | What it implies |
|---|---|
| `ReviewerSession` adapter binding | Per the port shape below — capability-URL mint + redeem + revoke; HMAC verification with per-tenant key; revocation-list pull on each access. REQUIRED when posture != "forbidden". |
| `ReviewThreadStore` adapter binding | Per the port shape below — append-only event log + share registry + per-thread retention policy. REQUIRED when posture != "forbidden". |
| `IdentityProvider` adapter (reviewer Tier 2) | Same port as respondent + filer per web ADR-0007. Optional; REQUIRED only when org or form policy mandates Tier-2 reviewer-identity. |
| Verifier "reviewed by N" render adapter | The verifier-side adapter that reads the optional EXT-37 receipt hook (when present) and renders the capacity-discipline copy per §5. Adopter-styled per their UI conventions; the render contract is the constant. |
| Respondent share-and-revoke UI affordance | Renderer-class: the respondent's session surface for "share with reviewer", "see who I've shared with", "revoke this share", "panic-revoke all". The reference renderer SHOULD include the panic-revoke affordance per §2.3.4(e); non-reference renderers MAY omit. |
| Reviewer UI structurally omits submit/sign | Renderer-class: the reviewer's session surface MUST omit any submit / sign / draft-finalize affordance. **This is renderer-class enforcement; substrate-class enforcement is the signer-ceremony's refusal of reviewer-capability-URL-bound sessions in §3.6.** Both layers AND-compose; substrate carries the structural guarantee. |

**`ReviewerSession` port (sketch).**

```text
interface ReviewerSession {
  // Respondent-side: mint a capability URL for a fresh share.
  mintShare(args: {
    threadId: string
    requestedScope: "view" | "view+comment" | "view+comment+suggest"  // bounded by thread.policySnapshot.posture
    expiresAt?: string  // RFC 3339; optional time bound; defaults to form-policy defaultShareExpiresAtRule
    audienceHint?: string  // free-text or registered claim
  }): Promise<{shareId: string; capabilityUrl: string}>;

  // Reviewer-side: redeem the capability URL; resolves the share's bound scope.
  redeem(args: {capabilityUrl: string}): Promise<{
    shareId: string;
    threadId: string;
    grantedScope: "view" | "view+comment" | "view+comment+suggest";
    threadPolicySnapshot: ReviewThread["policySnapshot"];
  }>;

  // Respondent-side: revoke a share.
  revoke(args: {shareId: string; reason?: string}): Promise<void>;

  // Respondent-side: list shares for a thread.
  listShares(args: {threadId: string}): Promise<ReadonlyArray<ReviewerShare>>;
}
```

**`ReviewThreadStore` port (sketch).**

```text
interface ReviewThreadStore {
  // Read the thread (any party with redeem-grant).
  read(args: {threadId: string}): Promise<ReviewThread>;

  // Append an event. Author + payload are caller-supplied; substrate enforces:
  //   - sessionToken cross-check: the adapter MUST resolve the supplied token's role
  //     (CapabilityToken → reviewer + shareId; RespondentSessionToken → respondent) and
  //     refuse when args.author.kind disagrees with the resolved role. This closes the
  //     "any caller asserting author.kind == 'respondent' is trusted" gap by making the
  //     author claim adapter-verified against the redeemed session.
  //   - suggestion-accepted / suggestion-declined MUST resolve to a respondent session
  //     (token role == respondent AND author.kind == "respondent")
  //   - share-minted / share-revoked MUST resolve to a respondent session
  //   - posture-bound (suggestion records refused when policySnapshot.posture is comment-allowed)
  //   - field-anchor masking (suggestion refused on respondentOnly fields per §3.4)
  appendEvent(args: {
    threadId: string;
    sessionToken: CapabilityToken | RespondentSessionToken;
    author: ReviewThreadEvent["author"];
    payload: ReviewThreadEvent["payload"];
  }): Promise<ReviewThreadEvent>;

  // Bind an EXT-37 receipt-hook pointer at signing time (respondent-only).
  pinForReceipt(args: {threadId: string}): Promise<{threadHash: string; bindingArtifactRef: string}>;
}
```

**Why these are the two load-bearing ports.** `ReviewerSession` carries the capability-URL substrate (the no-account property is structurally the load-bearing property; the port shape encodes it). `ReviewThreadStore` carries the SC-6 append-only event substrate + the respondent-only-suggestion-apply enforcement (the "reviewer cannot author respondent-authored events" invariant is enforced at the port boundary). Other concerns (verifier-render, share UI, IdP wiring) fall out at build time.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a flat `trustedReviewer` block (per FW-0037 §4.1 split — no sub-block):

```text
trustedReviewer?: {
  posture: "forbidden" | "comment-allowed" | "suggest-allowed"
  allowedRoles?: ReadonlySet<string>             // intersection of org-policy and form-policy when both declared
  reviewerAssuranceFloor?: AssuranceLevel        // per-form; from §3.3
  maxActiveSharesPerDraft?: number               // per-form OR org cap
  defaultShareExpiresAtRule?: string             // per-form; e.g., "72h", "form-submit", "never"
  respondentOnlyFieldPointers: ReadonlyArray<string>  // RFC 6901 pointers; per-form + safe-* auto-marks per §6.3
  reviewerSessionBindingRef?: string             // URN of the wired ReviewerSession adapter (REQUIRED when posture != "forbidden")
  reviewThreadStoreBindingRef?: string           // URN of the wired ReviewThreadStore adapter (REQUIRED when posture != "forbidden")
}
```

The shell consults `posture` at form-load (renders the share-affordance unless `forbidden`); `reviewerAssuranceFloor` (drives the reviewer-IdP gate at capability-URL redemption when set); `maxActiveSharesPerDraft` (constrains the share-mint flow); `defaultShareExpiresAtRule` (default expiration for new shares); `respondentOnlyFieldPointers` (drives per-field masking in the reviewer session); the binding refs (the two adapters the shell trusts for orchestration).

**Sensitive-data discipline.** The resolved profile contains no reviewer identity material, no in-flight comment content, no share-URL bytes. The profile is recomputable from the instance + org + form policy without consulting any reviewer action.

## 5. Verifier rendering contract

The verifier reads the OPTIONAL EXT-37 receipt-hook (when present) and renders ambient reviewer-trace **only when the respondent chose to attach it**. By default, a signed Response is reviewer-trace-silent at the verifier — the canonical reviewer scenario produces a receipt indistinguishable from a no-reviewer submission.

**Rendering rules.**

1. **Default: no reviewer trace.** When `extensions["formspec.response.review-attestation.v1"]` (EXT-37 namespaced extension on the Response) is absent, the verifier renders ONLY `signed by [signer-name]`. The SC-6 sidecar is NOT part of the signed Response and the verifier does NOT pursue links to it absent the explicit opt-in.
2. **Opt-in: ambient capacity-discipline copy.** When EXT-37 is present and resolves to a SC-6 thread, the verifier renders `signed by [signer-name] · reviewed by N parties before signing` (where N is the count of distinct reviewers who left at least one event in the bound thread up to the signing time). The phrasing uses capacity vocabulary ("reviewed by") — NOT truth vocabulary ("approved by", "certified by").
3. **Per-reviewer disclosure on expansion.** When EXT-37 is present AND the respondent attached named reviewers (Tier 2 IdP-bound), the verifier's expanded view surfaces "[reviewer-name] (identity-claim: [authMethod]) commented N times; suggested N times; N suggestions accepted". When reviewers were Tier 1 only (free-text self-named), the expanded view surfaces "[display-name] (self-named, unverified) commented N times" with the unverified-capacity marker per AP-023.
4. **Per AP-023 vocabulary firewall.** The verifier MUST distinguish *integrity* (bytes unchanged), *attribution* (the signer-key signed; the reviewer thread is bound by hash to the signed Response if attached), *capacity* (reviewer was acting as a reviewer; signer was acting in capacity `self`), and *truth* (the underlying facts; the soundness of any reviewer's advice). The verifier attests to the first three; never the fourth. **No verifier copy says "verified as correctly reviewed" or "your lawyer's advice was approved."**
5. **Thread availability.** When EXT-37 binds a thread by hash, the verifier MAY render "thread available" (when the thread artifact is fetchable at the bound URI) or "thread not available" (informational; the receipt's integrity is unaffected by thread retrievability; the reviewer-trace claim becomes `ThreadArtifactUnresolvable` analogous to FW-0037 §7.4 `FilerIdentityUnresolvable`).
6. **No reviewer-comment text in the default verifier surface.** Even when EXT-37 is attached, the verifier's default view does NOT render comment bodies (privacy-by-default; comments may contain sensitive advice). Expanded view (deliberate respondent action) MAY render bodies when the respondent's deployment exposes the thread.

## 6. Cross-row composition

Mirrors FW-0037 §6 / §8 verbatim where applicable. Composition rules are load-bearing: most of FW-0042's substrate honesty comes from how it composes with the sibling design rows.

### 6.1 FW-0037 — Filer-not-signer (sibling capability key; composition at submission layer)

FW-0042 is the **reviewer-only** sibling of FW-0037 (filer). Per [FW-0037 §8.1 (split sibling keys per code-review F6)](2026-05-24-fw-0037-filer-not-signer-design.md): FW-0042 = READ + COMMENT (cannot AUTHOR or SIGN). FW-0037 = READ + AUTHOR + HANDOFF (cannot SIGN).

**Composition.** The same submission MAY have BOTH a filer (paralegal fills, per FW-0037) AND a reviewer (supervising attorney reviews the paralegal's work, per FW-0042) before the respondent signs. The two carriers coexist without interference: `metadata.filer` (EXT-36, on the signed Response) names the human filer; the SC-6 thread (off the signed Response, optionally bound via EXT-37) carries the reviewer trail; the signer's `AuthoredSignature.capacity` stays `self`.

**Three-way independence.** The two CAPABILITY KEYS (`preparerFiling` + `trustedReviewer`) are independent at the resolved-profile layer (per FW-0037 §4.1). The three carriers (`metadata.filer`, SC-6 thread, signed Response) compose orthogonally — none corrupts any other's signed-bytes preimage.

**Reviewer of a filer-pre-filled draft.** When the form composes both, the reviewer's session shows the filer-pre-filled values with the same per-field provenance + filer-attribution UI the respondent sees post-handoff. The reviewer's comments anchor to whichever fields are visible to them (subject to per-field reviewer-masking per §3.4 + safe-* per §6.3); reviewer suggestions can target filer-pre-filled fields when `suggest-allowed` (the respondent decides whether to apply, same as for self-filled fields).

**Cross-row touch.** FW-0037's §8.1 already lands the FW-0042 sibling note. FW-0042's §6.1 (this section) closes the bidirectional touch.

### 6.2 FW-0048 / FW-0059 — Coercion-aware signing (load-bearing composition for AP-014; reviewer-as-coercer is a primary vector)

FW-0042 carries a real AP-014 vector: the "trusted reviewer" who is also the coercer (canonical: abusive partner who insists on "helping" with the protective-order form, or predatory legal-aid grifter steering a vulnerable respondent toward bad advice). The composition is load-bearing.

**Composition rules (mirrors FW-0037 §6.2 / §8.2 structure).**

1. **High-coercion template default-forbidden.** Forms in FW-0048's high-coercion-risk template set ([FW-0048 §6.4](2026-05-23-fw-0048-coercion-aware-signing-design.md): financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect) default `trustedReviewer: forbidden`. The default may be overridden per-deployment, but the default holds. **Same template-set as FW-0037; coordinated default.**
2. **Capability-URL revocability is the first-class survivor affordance.** Per §2.3.4(c) — a respondent who shared under duress can revoke; subsequent reviewer accesses fail. The renderer-class panic-revoke (§2.3.4(e)) gives a single-gesture path. FW-0107-style substrate-upgrade (auto-revoke timer; auto-revoke on safe-template-detection) is filed as FW-0110 (§9), blocked on real coercion incident OR adopter request.
3. **Safe-* fields are structurally invisible to reviewers per §6.3.** Even if the reviewer is the coercer, the safe-* address never renders in their session.
4. **Signer-ceremony refuses reviewer-capability-URL sessions.** No path lets a reviewer-bound session reach the signing surface; the cryptographic gate holds even if the reviewer obtains the respondent's draft via shoulder-surf or coerced share.
5. **The duress affordance per FW-0048 §3 is reachable from the signer's ceremony only.** The reviewer never sees it.
6. **Asymmetric assurance.** For high-coercion templates when `trustedReviewer: comment-allowed | suggest-allowed` is permitted (overriding the default-forbidden), the form-policy SHOULD require Tier-2 (IdP-bound) reviewer-identity. The substrate-class layer holds: a "trusted reviewer" on a high-coercion form MUST be a named-and-bound party; pseudonymous coercer-reviewers are filtered.

**Cross-row touch.** FW-0048 design's §7 (per-row composition) gets a sibling note for FW-0042 — canonical AP-014 vector via the reviewer-as-coercer pattern; default-forbidden for high-coercion templates; safe-* mask survives reviewer-read; capability-URL revocability is the first-class survivor affordance; FW-0110 substrate-upgrade tracked. **Load-bearing touch.**

### 6.3 FW-0049 / FW-0060 — Safe-address composition (safe-* fields structurally invisible to reviewers)

Mirrors FW-0037 §6.3 verbatim with reviewer-substituted-for-filer. Safe-* class fields default to `respondentOnly: true` for reviewers per §3.4 + §6.3 composition. The reviewer does NOT see the plaintext; the field renders masked in the reviewer session.

**Composition rule.** When `accessControl.class` starts with `safe-*` (per FW-0049 §3.1 taxonomy: `safe-address`, `safe-contact`, `safe-employer`), the field is treated as `respondentOnly: true` for reviewers AUTOMATICALLY, regardless of form-policy `respondentOnlyFieldPointers[]`. The union of form-policy declared pointers + class-derived safe-* auto-marking is the reviewer-non-visible set.

**Comment is allowed; suggest is forbidden.** The reviewer can leave a comment on a masked safe-* field ("Mom, double-check the address looks right"); the reviewer CANNOT suggest a value for a field they cannot see.

**Cross-row touch.** FW-0049 design's §7 gets a sibling note for FW-0042 — safe-* mask survives reviewer-read; reviewer-fillable taxonomy auto-marks safe-* as respondent-only-visible; suggest-mode is structurally forbidden on safe-* fields. **Load-bearing touch.**

### 6.4 FW-0050 / FW-0061 — Multi-party composition (per-party reviewer share)

**Closes FW-0050 §8(8): two separate sharing primitives, not one** — SC-6 reviewer-thread and `parties[]` co-party state are architecturally independent. Per [FW-0050 §8(8)](2026-05-23-fw-0050-multi-party-submission-design.md), the reviewer-vs-party single-sidecar question was deferred to this row. The resolution: the reviewer is READ + COMMENT (+ SUGGEST when allowed) on the respondent's behalf and never holds party identity; a co-party is a distinct first-class party that reads + edits its own scope + signs its own scope. Different capabilities, different trust boundaries, different carriers — SC-6 sidecar (off the signed Response) for the reviewer; `parties[]` per FW-0050 / EXT-28 (on the Definition + per-party signatures) for the co-party. A single sidecar would conflate two trust boundaries; the two compose orthogonally instead (§6.4 composition rule below).

In a multi-party flow, each party MAY share their portion of the draft with their own reviewer(s). Reviewers are scoped per-party; Party A's reviewer doesn't see Party B's fields (composition with FW-0050 §7.1 per-party visibility).

**Composition rule.** Slice 1 supports per-party reviewer-share. When the form declares `multiParty` AND `trustedReviewer: comment-allowed | suggest-allowed`, the `ReviewerSession.mintShare()` operation requires a `partyRef` argument naming which party's portion the share grants access to; the resolved scope is the intersection of (capability-URL bound scope) ∩ (FW-0050 per-party visibility set).

**Per-party SC-6 thread.** Slice 1 has one thread per (draft, party); multi-party flows produce N parallel threads. The signed-Response opt-in EXT-37 hook, when used, references the per-party thread set bound to the respondent's party. Cross-party reviewer-visibility (a reviewer who can see both parties' threads simultaneously) is NOT in slice-1 scope — explicit per-party share is the rule.

**Cross-row touch.** FW-0050 design's §7 gets a sibling note for FW-0042 — per-party reviewer share; reviewer-visibility scoped per FW-0050 §7.1; per-party SC-6 thread. **Light touch; informational** — no FW-0050 substrate change required; the per-party-visibility primitive covers naturally.

### 6.5 FW-0034 / FW-0038 — Honest-correction (reviewer involvement in correction)

A respondent who signed a reviewed-and-signed submission MAY later need a correction. The reviewer who originally helped MAY be involved in the correction; OR the respondent corrects solo.

**Per-form policy `correctableReviewerPosture: same | same-or-new | respondent-only`** declares the rule (mirrors FW-0037 §6.5 `correctableFilerPosture`). Defaults to `same-or-new` (most permissive); high-coercion templates default to `respondent-only` (the correction MUST be filed by the respondent alone to prevent re-coercion via re-share).

**Each correction event MAY carry its own SC-6 thread** (a fresh `threadId` bound to the correction's draft id); cross-event thread continuity is OPTIONAL.

**Cross-row touch.** FW-0034 design's §7 gets a sibling note for FW-0042 — reviewer-involved-correction composition; per-form `correctableReviewerPosture` declaration; per-event SC-6 thread rides naturally. **Light touch.**

### 6.6 FW-0030 — Federated identity (reviewer-identity Tier 2 binding)

The reviewer's Tier-2 identity binding rides the same `IdentityProvider` port per [web ADR-0007](../adr/0007-identity-provider-port.md) as the respondent / filer / signer. No new substrate; SC-4 + EXT-8a generalize to reviewer identities identically.

**Cross-row touch.** FW-0030 row body gets a sibling note for FW-0042 — reviewer-identity (when Tier-2 escalated) rides the same identity substrate; no new IdP integration required; per-form reviewer-assurance-floor is form-policy-declared per §3.3. **Informational touch; no FW-0030 substrate change.**

### 6.7 FW-0051 / FW-0058 — Vocabulary firewall (load-bearing distinction)

**FW-0042 is HUMAN-reviewer (read+comment); FW-0051 is AI-as-respondent-helper (AI proposes per-field values to the respondent themselves); FW-0058 is AI-as-respondent (AI signs).** The three are easy to confuse pairwise. The four-way framing table extends FW-0037 §6.7 with the FW-0042 column:

| Axis | FW-0037 (human filer) | FW-0042 (human reviewer) | FW-0058 (AI filer/signer) | FW-0051 (AI assistant) |
|---|---|---|---|---|
| Who is the actor | A separate human from the signer | A separate human from the signer | An AI agent (non-human) | An AI in the respondent's tools |
| What they can do | READ + AUTHOR + HANDOFF (not SIGN) | READ + COMMENT (+ SUGGEST when allowed) (not AUTHOR, not SIGN) | READ + AUTHOR + SIGN | Per-act PROPOSE (respondent confirms each act) |
| Who signs the form | The human respondent (capacity `self`) | The human respondent (capacity `self`) | The AI agent (capacity `ai-agent`) | The human respondent (capacity `self`) |
| Capacity on AuthoredSignature | `self` (unchanged) | `self` (unchanged) | `ai-agent` + `agentChain` block (EXT-3) | `self` (no AI on signature) |
| Submission carrier | `metadata.filer` (EXT-36) — on the signed Response | SC-6 review-thread sidecar (off the signed Response); optional EXT-37 receipt hook for opt-in attestation | `agentChain` on `AuthoredSignature` (EXT-3) | `metadata.provenance[path].attestedBy: respondent, sourceRef: assistant-suggested` (EXT-2) |
| Form policy key | `preparerFiling` (split per FW-0037 §4.1) | `trustedReviewer` (split per FW-0037 §4.1; this row) | `aiAgentFiler` | `bringYourOwnAssistant` |
| Substrate | EXT-36 `metadata.filer`; no signer-side change | NEW SC-6 sidecar + EXT-37 opt-in receipt hook; signed Response byte-identical to no-reviewer case | WOS `ActorKind::Agent` + `AgentInvoker` + EXT-3 `agentChain` | Existing Assist Provider spec; per-field EXT-2 provenance |
| Trust model | Filer is named party with separate identity; signer attests | Reviewer is named (Tier 2) or self-named (Tier 1); signer attests; reviewer's advice is NOT attestation | AI is registered actor in WOS workflow; WOS deontic constraints apply | Assistant is untrusted by form; per-act respondent confirmation |
| Threat focus | AP-014 coercion ("helpful preparer" steers signer) | AP-014 coercion ("trusted reviewer" is the coercer); reviewer-credential-redistribution | Prompt-injection + capacity-spoofing | Per-act respondent rejects suggestion |
| Bytes signed | Different from no-filer case (`metadata.filer` is on the envelope) | **Identical to no-reviewer case (SC-6 is off-envelope)** | Different (AI's signature + agentChain) | Identical to non-assisted case (provenance is off-bytes per EXT-2 design) |

**Pairwise composition rules.**

- **FW-0042 + FW-0037 compose** (filer fills, reviewer reviews the filer's work, signer signs). Canonical legal-clinic scenario (paralegal-as-filer + supervising attorney-as-reviewer + pro se client-as-signer). §6.1 above.
- **FW-0042 + FW-0051 compose** (respondent uses BYO assistant while drafting; respondent shares with reviewer; reviewer comments; respondent applies). Reviewer can see EXT-2 `attestedBy: respondent, sourceRef: assistant-suggested` per-field provenance — useful context for the reviewer ("the AI generated this; let me check it"). **Composition is informational; no new substrate.**
- **FW-0042 + FW-0058 compose minimally** (AI agent signs; pre-signing the AI's operator MAY have a human reviewer review the agent's draft). The reviewer in this case reviews the AI's pre-signed draft; the AI's signing capacity stays `ai-agent`; the SC-6 thread coexists with the agent's `agentChain`. **Useful but unusual; deferred for slice 1.**
- **FW-0042 + FW-0048 + FW-0049 + FW-0050 all compose** per §6.2 / §6.3 / §6.4 — independently.

**Cross-row touch.** FW-0051 design's §7.6 + FW-0058 §7.7 + FW-0037 §6.7 all reciprocate by adding the FW-0042 column to their respective vocabulary tables when this design ratifies. PLANNING.md cross-link bilaterally updated.

### 6.8 web ADR-0010 (respondent-place trust model) — SC-6 thread storage discipline

Per [web ADR-0010](../adr/0010-respondent-place-trust-model.md): the respondent's draft + associated artifacts are respondent-controlled, with client-side encryption for at-rest material when production-grade. The SC-6 thread inherits this discipline:

1. **The thread is bound to the draft id; draft deletion deletes the thread.** Per [web ADR-0010 + FW-0043 (abandon-and-erase with deletion receipt)](../adr/0010-respondent-place-trust-model.md): when the respondent deletes a draft, the SC-6 thread MUST be deleted alongside; the deletion receipt MUST account for the thread artifact.
2. **Encryption posture follows the draft.** When the draft is encrypted client-side per ADR-0010, the SC-6 thread is encrypted under the same trust profile; the reviewer's access via capability URL requires the key material to be derivable from the URL claim (HMAC-derived per-thread DEK; the URL carries the unwrap material as part of the capability claim, never on the server).
3. **Cross-tenant aggregation is forbidden.** Per ADR-0010 + stack-root ADR-0068: the SC-6 store is per-tenant; cross-tenant reviewer-history aggregation is structurally forbidden server-side. Wallet-side aggregation (a reviewer who reviews drafts across many deployments has their own view) is wallet-substrate concern.

**Cross-row touch.** web ADR-0010 reads need no edit (the trust model already covers); FW-0043 row needs a sibling note that draft-deletion-includes-thread is load-bearing for FW-0042 composition. **Light touch.**

## 7. Architectural call — Option A (new SC-6 sidecar) over Option B (Assist-spec profile + ledger actor enum)

Per the project CLAUDE.md HIGH-PRIORITY prior-art rule, evaluate Option A (new sidecar) vs Option B (fold into existing Assist spec as a profile + extend Respondent Ledger actor enum with `"reviewer"`) — **adopt vs wrap vs use-as-conformance-oracle vs reject**, with migration / compatibility cost named explicitly.

### 7.1 Option B — Assist-spec profile + Respondent Ledger actor enum extension. REJECTED.

**Shape (as proposed in the PLANNING.md row).** Add a `reviewer` Provider role to the Assist Spec (analogous to "Assist Provider" + "Passive Provider"); extend Respondent Ledger Spec §6.4 actor enum with `"reviewer"`; route reviewer comments through Assist-spec tool invocations (per `formspec.field.help` style) recorded as ledger events.

**Verdict: REJECTED.** Three load-bearing reasons:

1. **Assist-spec scope is "AI / agent / accessibility tooling helping the live respondent."** Per [`formspec/specs/assist/assist-spec.md` §2.1 / §2.2 / §11.1](../../../formspec/specs/assist/assist-spec.md): the Assist Provider exists to give *tooling* a structured interface to the live form *as the respondent uses it*. The trust model is "the respondent trusts their tools." A human reviewer is **not the respondent's tool** — the reviewer is a separate party with separate intent, separate identity, separate trust boundary. Conflating "tools assisting the respondent" with "other humans reviewing the respondent" muddies the spec's clean trust model and breaks the §11.1 "MUST treat all tool input as untrusted" boundary in a way that's hard to recover from. The Assist spec is *exactly* the right shape for FW-0051 (BYO assistant) because there the AI IS the respondent's tool; it's *exactly the wrong shape* for FW-0042 because the human reviewer is structurally another party.
2. **The Respondent Ledger actor enum is too narrow a hook.** §6.4 enumerates `respondent | delegate | system | support-agent | unknown`. Adding `reviewer` is additive (easy), BUT the ledger's per-event shape (one event = one ChangeSetEntry / one ValidationSnapshot / one IdentityAttestation per §6.2 / §6.3) does NOT model threads: comments are anchored, replies are nested, suggestions are state-machine-tracked (pending → accepted/declined), stale-markers compute against value-hash. Per FW-0037 §6.1 evidence: the ledger is a flat sequence; threads have cross-event topology. The ledger is the wrong substrate for the thread; it CAN host certain side-events (`reviewer.invited`, `reviewer.access-revoked` per §7.2 below) but cannot host the thread itself.
3. **The "reviewer cannot sign on user's behalf" invariant is hard to maintain inside the Assist tool surface.** Assist tools include `formspec.field.set` (a mutation primitive). The reviewer would need a strict no-mutation profile; the Assist Provider would need a posture-aware refusal of every mutation tool. The trust-model boundary becomes one more spec note to enforce by convention. A separate sidecar makes the no-write property structural — `ReviewThreadStore.appendEvent` doesn't have a write-the-response surface to refuse; it physically can't.

**Migration / compatibility cost of choosing Option B.** Adopting Option B would require:
- A new Assist Spec profile (mid-touch upstream edit).
- Respondent Ledger Spec §6.4 actor-enum extension (small upstream edit).
- Per-Provider-implementer support for the reviewer profile in their Assist Provider implementation (medium effort, fan-out cost across implementers).
- A new substrate for threading on top of the ledger's flat event log (the topology mismatch that's load-bearing reason 2 — this is the cost that doesn't go away).
- Ongoing maintenance burden of carrying two trust models in one spec (Assist's "tools the respondent trusts" + the new "other humans the respondent trusted enough to share with").

### 7.2 Option A — New review-thread sidecar (SC-6). ADOPTED.

**Shape per §3.2.** New sidecar spec + schema authored as SC-6 in the upstream extension queue. The SC-6 thread coexists with the existing Respondent Ledger for share-lifecycle events.

**Verdict: ADOPTED.** Defended above per §3.2's four substrate-shaping properties. Three reasons it's the right choice:

1. **Substrate matches shape.** A thread substrate models a thread; the trust boundary maps cleanly (reviewer-thread is reviewer-and-respondent collaboration; signed Response is respondent-only attestation).
2. **The "reviewer cannot sign on user's behalf" invariant is cryptographically real.** The signed Response is byte-identical to a no-reviewer submission (§3.2 substrate property 1). No spec convention to enforce by review; the substrate carries the guarantee.
3. **Lifetime independence.** Draft deletion cleanly deletes the thread; signed Response stands without the thread; the optional EXT-37 hook ties them when the respondent chooses.

**Composition with the Respondent Ledger (Option A + small ledger touches).** Some share-lifecycle events are usefully recorded in the Respondent Ledger:

- `reviewer.invited` (new EXT-5 ledger event): respondent minted a share. Carrying `shareId`, `audienceHint`, `mintedAt`. Records the respondent's act for audit. Actor = `respondent`.
- `reviewer.access-revoked` (new EXT-5 ledger event): respondent revoked a share. Carrying `shareId`, `reason`, `revokedAt`. Actor = `respondent`.

**These ledger events are OPTIONAL** — adopters can land FW-0042 without them; they enhance the audit story for deployments that already consume the ledger heavily (e.g., regulated-financial-services deployments). The two events are tiny additions to EXT-5's existing "events to add" list; no schema redesign.

**Why not a Respondent Ledger actor-enum extension?** Because reviewers DO NOT author respondent-ledger events — the respondent does (mint and revoke are respondent acts). Reviewer events live on the SC-6 thread, where the substrate IS the carrier. The actor enum stays at its current closed set (`respondent | delegate | system | support-agent | unknown`); FW-0042 does NOT require the enum to grow.

**Migration / compatibility cost of choosing Option A.**
- New SC-6 sidecar spec + schema (mid-touch upstream; substantial — but bounded and parallel to existing sidecar SC-2 / SC-3 / SC-4 / SC-5 work).
- New EXT-37 receipt-hook extension on Response (small; one optional namespaced-extension property).
- Small EXT-5 ledger event additions for `reviewer.invited` + `reviewer.access-revoked` (tiny; rides existing EXT-5 PR).
- ADR-0011 small amendment for `trustedReviewer` (tiny; rides FW-0037's `preparerFiling` amendment per §4.1).
- No Assist-spec change (preserves the assist-spec's clean trust model).
- No Ledger actor-enum change (preserves the enum's intentionally-closed shape).

**Conformance / fixtures.** The SC-6 spec authors a small fixture matrix (see §10); the EXT-37 receipt-hook adds one fixture to the response-schema test set; the EXT-5 additions ride the existing ledger-event-type fixture pattern. Total fixture work scales with the substrate-additions count, not with reviewer-flow complexity (most reviewer-flow behavior is in the runtime UI and ports, where conformance is the build row's job).

### 7.3 No new XS-N cross-stack ADR required for slice 1

FW-0042 is structurally a Formspec-only design — Trellis is byte-neutral (the signed Response is byte-identical to no-reviewer; the SC-6 sidecar lives as response-adjacent metadata through the standard chain unchanged for slice 1, with the optional EXT-37 receipt hook carrying a hash-pointer); WOS has no `reviewer-actor` extension needed (the reviewer is invisible to WOS governance per §1.2 non-goal); PKAF is distinct scope (`AILineage` is assertion-side; reviewer-side has no PKAF analog).

**Subsystem-count honesty.** Formspec ratifies: the SC-6 sidecar (substantive — new spec); EXT-37 (small); EXT-5 ledger event additions (tiny). ADR-0011 amendment is small (one row in the table, riding FW-0037's amendment per §4.1). **No new cross-stack ratification path.** **Same slice-1 cross-stack discipline as FW-0037: Formspec-only for slice 1; future per-reviewer-actor WOS governance (lawyer-as-reviewer under ABA-1.6 confidentiality audit, CPA-as-reviewer under Circular 230) is a future WOS-side row + sibling XS-N when an adopter deployment needs it.**

### 7.4 What FW-0042 ratifies standalone (slice 1 honesty)

**Standalone ratifiable today (no upstream dependency):**
- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `trustedReviewer` capability key + resolved-profile shape (flat) per §4.3 — sibling key to `preparerFiling` per FW-0037 §4.1.
- The `ReviewerSession` + `ReviewThreadStore` port shapes per §4.2.
- **The SC-6 review-thread sidecar SHAPE per §3.2** — the substrate proposal (ReviewThread / ReviewerShare / ReviewThreadEvent / FieldAnchor shapes; append-only event log; optional hash-chain). The SHAPE is decided here; the upstream AUTHORING of `formspec/specs/review-thread/review-thread-spec.md` + `formspec/schemas/review-thread.schema.json` is a separate (formspec-side) ratification — see "Waits on upstream" below.
- The verifier rendering contract per §5.
- The runtime invariants binding form-load failure semantics to ADR-0011 typed errors (§8.1).
- The composition rules with FW-0037 (§6.1), FW-0048 (§6.2), FW-0049 (§6.3), FW-0050 (§6.4), FW-0034 (§6.5), FW-0030 (§6.6 informational), FW-0058 / FW-0051 (§6.7 vocabulary firewall), web ADR-0010 (§6.8).
- The adopter contracts per §4.2.
- The Option A vs Option B architectural call per §7.

**Waits on upstream:**
- SC-6 sidecar spec + schema **authoring** in `formspec/` (the largest dependency; bounded but not trivial). The shape is decided here per the bullet above; the formspec-side spec text and JSON Schema land via the formspec spec-expert review path.
- EXT-37 ratification for the receipt-hook shape.
- EXT-5 minor additions for `reviewer.invited` + `reviewer.access-revoked` (these are optional even at consumption time).
- ADR-0011 amendment splitting the `reviewerPreparer` umbrella per FW-0037 §4.1 — already in flight from FW-0037; FW-0042 piggybacks.

## 8. Failure semantics

### 8.1 Form-load failures

| Condition | Error per ADR-0011 |
|---|---|
| Form requires `trustedReviewer` posture but instance lacks `ReviewerSession` adapter | `UnsupportedRequiredFeatureError` at form-load. **Note:** since §3.1 forbids `required` for `trustedReviewer` form-policy, this branch is unreachable in practice for `trustedReviewer` alone; preserved for composition orthogonality. |
| Form-policy posture is non-`forbidden` but instance lacks `ReviewThreadStore` adapter | `UnsupportedRequiredFeatureError` when there's no usable fall-through; otherwise the share-affordance is silently absent (treat as `forbidden`-degrade). The honest path: if the deployment configured `trustedReviewer` non-forbidden but didn't wire the store, that's an `InvalidRuntimePolicyError` at form-load (the deployment's policy is internally inconsistent — substrate-class refusal). |
| Form requires Tier-2 reviewer-identity (form-policy `reviewerAssuranceFloor` set) but instance lacks any Tier-2-capable `IdentityProvider` adapter | `InvalidRuntimePolicyError` at form-load. |
| Form forbids `trustedReviewer` but org policy requires it for the template class | `FeaturePolicyConflictError` at form-load. (Unusual but reachable: an org may declare reviewer-share required for compliance reasons; a form designed before the policy may forbid.) |
| Form-policy declares `respondentOnlyFieldPointers[]` for reviewers referencing fields not in the form's Definition | `InvalidRuntimePolicyError` at form-load. |

**Silent downgrade discipline.** When `trustedReviewer: comment-allowed | suggest-allowed` is requested but the instance lacks substrate, the share-affordance is structurally absent — the respondent never sees a "share with reviewer" button that doesn't work. This is consistent with ADR-0011's silent-downgrade rule for optional features (the feature is disabled; no false UI).

### 8.2 Reviewer-session failures

| Condition | Behavior |
|---|---|
| Reviewer redeems a capability URL whose HMAC fails verification | Typed `CapabilityInvalidError`; reviewer surface shows plain-language "This share link is not valid"; share is recorded as `invalid-redemption-attempt` for audit (no SC-6 thread modification). |
| Reviewer redeems a capability URL that has been revoked | Typed `CapabilityRevokedError`; reviewer surface shows plain-language "The respondent revoked this share". |
| Reviewer redeems a capability URL whose `expiresAt` is past | Typed `CapabilityExpiredError`; reviewer surface shows plain-language "This share link expired"; the respondent SHOULD see a notification in their UI that a reviewer attempted access on an expired share. |
| Reviewer redeems a capability URL on a form whose `reviewerAssuranceFloor` requires Tier-2 IdP binding, and the reviewer's session is Tier-1 (free-text self-name) only | Typed `humanReviewerUnauthorized` (symmetric to FW-0058's `humanRequiredButAgent` per [web ADR-0011 §"Tier-1-when-Tier-2-required"](../adr/0011-runtime-feature-resolution-and-policy-gates.md)); reviewer surface shows plain-language "This form requires reviewers to sign in with a verified identity"; the redeem operation MAY offer a Tier-2 upgrade path (route through the standard `IdentityProvider` port) before failing terminally. |
| Reviewer attempts to write into a `respondentOnly: true` field via suggestion (suggested value for a safe-* field) | Substrate refusal: `ReviewThreadStore.appendEvent` returns `SuggestionForbiddenOnRespondentOnlyFieldError`. Renderer-class: the suggest affordance is structurally absent from masked fields per §3.4; defensive substrate-class rejection is the second layer. |
| Reviewer attempts to use a tool the substrate forbids (e.g., calls a hypothetical `applySuggestion` directly) | Substrate refusal: no such tool exists; the reviewer's session has no path to mutate the response. **Structural prevention.** |
| Reviewer's IdP session expires mid-session (Tier-2 only) | Standard IdentityProvider port session-recovery; reviewer re-authenticates; thread state preserved per existing draft mechanisms; uncompleted draft-comments preserved client-side until re-auth completes. |

### 8.3 Respondent-session failures (when active reviewers are sharing)

| Condition | Behavior |
|---|---|
| Respondent attempts to delete the draft while reviewers are mid-session | Confirm dialog ("N reviewers currently have access; deleting will revoke their access and erase the thread"); on confirm, all shares are revoked + thread deleted; per §6.8 + FW-0043 composition, the deletion receipt accounts for the thread. |
| Respondent attempts to apply a suggestion that anchors to a field that has been deleted (form-definition migration mid-flight) | Typed `StaleSuggestionError`; respondent surface shows the suggestion's text with stale-marker; suggestion remains in thread but cannot be applied; respondent MAY decline with reason "field-removed". |
| Respondent signs while reviewers are still active (no submit-time auto-revoke) | The signed Response is independent of the SC-6 thread (§3.2 substrate property 3); reviewers may continue to add comments post-signing, BUT the optional EXT-37 receipt hook (if attached) is pinned at signing-time and the thread artifact bound to the receipt is the snapshot at that pin. Post-signing comments append to the thread but do NOT alter the receipt's bound snapshot. |

### 8.4 Verification-time failures

| Condition | Behavior |
|---|---|
| Signed Response carries EXT-37 hook but the bound SC-6 thread is unresolvable | Verifier reports `ThreadArtifactUnresolvable` (informational) — the thread was named but not fetchable at verify-time. The signed Response's integrity is unaffected; the reviewer-trace claim is unverifiable-capacity per AP-023 (capacity claim cannot be substantiated). |
| Signed Response carries EXT-37 hook + the bound SC-6 thread resolves but its hash doesn't match the EXT-37 carrier | Verifier reports `ThreadHashMismatch` — the thread bound at signing has been modified since. **Receipt's integrity holds**; the reviewer-attestation claim fails. |
| Signed Response carries EXT-37 hook + the bound thread resolves but contains events whose `occurredAt > AuthoredSignature.signedAt` (impossible if the snapshot was pinned at signing) | Verifier reports `TemporalCoherenceViolation` on the thread artifact — the snapshot was supposed to be pinned at signing, so post-sign events are inconsistent. The signed Response's integrity is unaffected; the bound thread artifact is structurally invalid. |

## 9. Open questions / deferrals; future row reservations

Honest list of what FW-0042 design does NOT resolve. Per the FW-0037 §9 precedent + the project CLAUDE.md decay-class rule, follow-on rows are reserved with free integer numbers + inline scope notes; PLANNING.md grows them as separate `### FW-NNNN` headers later.

1. **Per-jurisdiction reviewer-professional-conduct verification.** Whether a "lawyer" claiming Tier-2 identity holds a valid bar license; whether a "CPA" actually holds an active PTIN. Per §1.2 non-goal — substrate-layer concern; deployments verify.
2. **Multi-thread per draft.** Slice 1 has one thread per (draft, party). Parallel review streams (e.g., legal-review thread + accounting-review thread on the same draft) deferred to a future revision (additive change to SC-6).
3. **Reviewer-side audit-trail UX.** Verifier expanded view shows comment counts + identity claims; full thread rendering deferred to build per §5.
4. **Cross-deployment reviewer-identity portability.** A reviewer Tier-2-credentialed at deployment A is not auto-recognized at deployment B. Per §1.2 non-goal; substrate-layer concern.
5. **Capability URL refresh / rotation.** A long-running share whose URL the respondent wants to rotate without revoking access (e.g., the email it was sent to was compromised). Deferred — slice 1 is revoke + re-mint as a fresh share.
6. **Reviewer-side notification / inbox.** A reviewer who'd like to be notified when the respondent applies a suggestion they made. Deferred to a future row + adopter-side notification adapter (rides existing `NotificationDelivery` port; not a substrate change).
7. **Reviewer-side "I'm done reviewing" attestation.** A signed-by-reviewer "I reviewed this draft on this date" attestation rideable on the EXT-37 receipt hook. Slice 1 records reviewer events; the higher-assurance reviewer-attestation primitive is **reserved as FW-0110 (substrate-honesty follow-on; see below)**.
8. **`humanReviewerUnauthorized` symmetric typed error — DEFINED.** Analogous to FW-0058's `humanRequiredButAgent` per [web ADR-0011 §"Tier-1-when-Tier-2-required"](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Defined in §8.2 above for the case where a form-policy requires Tier-2 reviewer-identity (`reviewerAssuranceFloor`) and a Tier-1 (free-text) reviewer attempts redemption. The error is FW-0042's own; the renderer-class copy is plain-language; the optional Tier-2 upgrade path routes through the standard `IdentityProvider` port before failing terminally.
9. **Substrate-class auto-revoke timer / safe-template-detection auto-revoke (panic-revoke at substrate layer).** Per §2.3.4(e): the renderer-class panic-revoke is in scope; substrate-class promotion is filed as **future row FW-0110** (substrate honesty follow-on; mirrors FW-0107 for FW-0037). Blocked on real coercion incident OR adopter request — same trigger precedent as FW-0107.

### 9.1 Future-row reservations (next free integers above [FW-0108 in `PLANNING.md:1203`](../../PLANNING.md))

**Build row.**

- **FW-0109 — Trusted-reviewer build (slice 1).** Materializes the `ReviewerSession` + `ReviewThreadStore` ports + reference adapters + reviewer-UI shell + respondent share-and-revoke UI + verifier render adapter. Blocked on FW-0042 design ratification + SC-6 sidecar ratification + EXT-37 ratification + ADR-0011 amendment landing (the latter rides FW-0037's amendment per §4.1).

**Substrate-honesty follow-on.**

- **FW-0110 — Substrate-class reviewer-share auto-revoke + reviewer-attestation primitive.** Two related capabilities folded into one substrate-honesty row (the FW-0107 precedent for FW-0037). (a) Substrate-class auto-revoke timer (default-revoke-on-X-minutes-of-inactivity; default-revoke-on-safe-template-detection); (b) signed-by-reviewer attestation primitive (the reviewer signs "I reviewed this draft" with Tier-2 identity binding; the attestation is rideable on EXT-37). **Blocked on:** trigger condition — either a real coercion incident exploiting the renderer-class-only panic-revoke, OR an adopter request to harden the affordance into a substrate guarantee, OR an adopter request for signed-by-reviewer attestation in a high-trust deployment (medical-second-opinion, CPA-signoff). Until the trigger fires, FW-0042's substrate-class AP-014 defense rests on §2.3.4 layers (a)+(b)+(c)+(d); the renderer-class panic-revoke carries layer (e) within the formspec-web reference renderer only.

**No further future rows reserved at design time.** Per the project CLAUDE.md HIGH-PRIORITY decay-class rule, any additional follow-ons get a free integer + scope sketch as the trigger fires; FW-0109 / FW-0110 are pinned now because the FW-0037 design landed analogous numbers (FW-0107 substrate-honesty follow-on; build row) and the bilateral parallelism matters for cross-row navigation.

## 10. Conformance fixtures

The FW-0109 build row's fixture matrix MUST cover (the SC-6 spec authors a subset of these as its own conformance corpus; the FW-0109 build authors the runtime + composition coverage):

1. **Canonical comment-only flow.** Respondent shares draft via capability URL with one reviewer; reviewer leaves N field-anchored comments; respondent resolves all; submits; signed Response is byte-identical to no-reviewer case (no EXT-37 attached). Verifier renders `signed by [signer]` only.
2. **Canonical suggest-allowed flow.** Same as (1) but `suggest-allowed` posture; reviewer leaves suggestions; respondent accepts some, edits-and-accepts some, declines some. Verifier optionally renders reviewer-trace when respondent opts in.
3. **Multi-reviewer thread.** Two reviewers share the same thread via separate capability URLs; both comment; respondent resolves both. Verifier expanded view (when EXT-37 attached) lists both reviewers.
4. **Tier-1 (free-text) vs Tier-2 (IdP-bound) reviewer-identity mix.** One reviewer Tier-1 self-named; another Tier-2 IdP-bound. Verifier renders the assurance distinction per §5.
5. **Capability URL revocation mid-session.** Reviewer is mid-session when respondent revokes; reviewer's next action fails with `CapabilityRevokedError`; reviewer surface shows plain-language copy; thread records `share-revoked` event.
6. **Capability URL expiration.** URL minted with `expiresAt`; access after expiration fails with `CapabilityExpiredError`.
7. **Reviewer attempts forbidden action (substrate refusal cases).** Reviewer attempts to apply own suggestion → `ReviewThreadStore` refuses (no path; adapter-layer sessionToken cross-check per §3.4 + §4.2); reviewer attempts to suggest a value for a safe-* field → `SuggestionForbiddenOnRespondentOnlyFieldError`; reviewer attempts to redeem a URL with mutated scope claim → `CapabilityInvalidError`; Tier-1 reviewer attempts to redeem on a form whose `reviewerAssuranceFloor` requires Tier-2 → `humanReviewerUnauthorized`.
8. **Form-policy forbidden.** Form declares `trustedReviewer: forbidden`; respondent UI omits share-affordance entirely; reviewer-capability-URL redemption attempts fail with `FeaturePolicyConflictError`.
9. **Safe-* composition.** Form has a `safe-address` class field per FW-0049; reviewer's session renders the field masked; reviewer can comment but cannot suggest.
10. **Multi-party composition.** Form has two parties per FW-0050; each respondent shares their party's draft with their own reviewer; per-party scope holds (reviewer A doesn't see party B's draft).
11. **FW-0037 + FW-0042 composition.** Form declares both `preparerFiling: allowed` and `trustedReviewer: comment-allowed`; filer fills; reviewer comments on the filer-pre-filled draft; signer signs; receipt carries `metadata.filer` (EXT-36) AND optional EXT-37 thread-hook (when respondent opts in).
12. **Stale-comment marker.** Reviewer comments on a field with value V1; respondent edits to V2; reviewer's session shows stale-marker; comment text is preserved; respondent decides whether the comment is still relevant.
13. **Suggestion-acceptance produces respondent-authored mutation.** Reviewer suggests value X; respondent accepts; resulting Response field is authored-by-respondent per EXT-2 provenance (the suggestion provenance lives on the SC-6 thread; the response value carries respondent attribution). **The chain of authorship is honest: respondent wrote the value into the Response; reviewer proposed it.**
14. **EXT-37 receipt-hook integrity.** Respondent signs with EXT-37 attached; thread artifact is fetched + hash-verified by verifier; renders reviewer-trace. Then: thread artifact is modified post-sign; verifier reports `ThreadHashMismatch`; signed Response integrity holds.
15. **Negative: signed Response carries reviewer-authored material inside the signed bytes.** Substrate refusal — there is no path to put reviewer-authored bytes inside the signed Response envelope. Defensive test: handcrafted fixture attempting to embed; substrate refuses to accept the manipulated Response shape at the validation layer.

## 11. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: three-tier `forbidden \| comment-allowed \| suggest-allowed` form-policy (no `required` tier; `read-only` collapsed per slice-1-honesty) | PROPOSAL | owner review |
| Q2: separate SC-6 review-thread sidecar; signed Response byte-identical to no-reviewer case | PROPOSAL | owner review + SC-6 spec authoring |
| Q3: capability URL with HMAC-bound scope; Tier-1 (free-text) default + Tier-2 (IdP-bound) optional | PROPOSAL | owner review |
| Q4: comments on all fields by default; suggestions forbidden on safe-* + `respondentOnly: true` fields | PROPOSAL | owner review |
| `trustedReviewer` capability key under ADR-0011 (split sibling of `preparerFiling` per FW-0037 §4.1; amendment text per §4.1) | PROPOSAL | owner review + ADR-0011 amendment (rides FW-0037 amendment) |
| `ReviewerSession` + `ReviewThreadStore` port shapes per §4.2 (two load-bearing exceptions to ADR-0009 §(b) defer-till-build) | PROPOSAL | owner review |
| SC-6 review-thread sidecar — new spec + schema; substantive but bounded upstream work | PROPOSAL to formspec | formspec spec-expert review + SC-6 authoring |
| EXT-37 receipt-hook on Response (optional namespaced extension) | PROPOSAL to formspec | formspec spec-expert review + EXT-37 ratification |
| EXT-5 ledger event additions: `reviewer.invited` + `reviewer.access-revoked` (optional; tiny additions to existing list) | PROPOSAL to formspec | formspec spec-expert review + EXT-5 PR |
| Verifier rendering contract: default reviewer-trace-silent; opt-in capacity-discipline copy per AP-023 | PROPOSAL | owner review |
| Form-load failure semantics: typed errors per ADR-0011 | PROPOSAL | owner review |
| Reviewer-session failure semantics: `CapabilityInvalidError`, `CapabilityRevokedError`, `CapabilityExpiredError`, `humanReviewerUnauthorized`, `SuggestionForbiddenOnRespondentOnlyFieldError` | PROPOSAL | owner review |
| Respondent-session failure semantics (with active reviewers): `StaleSuggestionError`; deletion-includes-thread per FW-0043 composition | PROPOSAL | owner review + FW-0043 design author |
| Verification-time failures: `ThreadArtifactUnresolvable`, `ThreadHashMismatch`, `TemporalCoherenceViolation` (on thread) | PROPOSAL | owner review |
| Adopter contracts over ReviewerSession + ReviewThreadStore + optional Tier-2 IdP + verifier render adapter + respondent share-and-revoke UI + reviewer UI structurally omits submit/sign | PROPOSAL | owner review |
| Architectural call: Option A (new SC-6 sidecar) over Option B (Assist-spec profile + ledger actor enum) — per §7 | PROPOSAL | owner review + cross-stack reviewer for the call's defensibility |
| No new XS-N cross-stack ADR required for slice 1 — Trellis byte-neutral; WOS unchanged (no `reviewer-actor` extension); PKAF distinct scope | PROPOSAL | owner review (verify cross-stack reviewer agrees) |
| FW-0037 composition (sibling capability keys per F6 split; carriers coexist; signer is unchanged) | PROPOSAL | owner review + FW-0037 design author |
| FW-0048 composition (high-coercion default-forbidden; safe-* mask survives reviewer-read; capability-URL revocability is first-class survivor affordance; FW-0110 substrate-upgrade tracked) | PROPOSAL | owner review + FW-0048 design author |
| FW-0049 composition (safe-* auto-marks `respondentOnly` for reviewers; comment allowed, suggest forbidden on safe-*) | PROPOSAL | owner review + FW-0049 design author |
| FW-0050 composition (per-party reviewer share; per-party SC-6 thread) | PROPOSAL | owner review + FW-0050 design author |
| FW-0034 composition (`correctableReviewerPosture` form-policy field; per-correction SC-6 thread) | PROPOSAL | owner review + FW-0034 design author |
| FW-0030 composition (Tier-2 reviewer-identity rides web ADR-0007 + SC-4 + EXT-8a substrate identically) | PROPOSAL | owner review |
| FW-0051 / FW-0058 vocabulary distinction reciprocated (four-way framing table per §6.7) | PROPOSAL | owner review + FW-0051 + FW-0058 design authors |
| web ADR-0010 composition (SC-6 thread inherits draft trust profile; encryption posture follows draft; deletion-includes-thread is FW-0043 composition) | PROPOSAL | owner review |
| AP-014 / AP-023 / AP-024 bindings codified | PROPOSAL | owner review |
| Future-row reservations: FW-0109 build; FW-0110 substrate-class auto-revoke + reviewer-attestation (substrate-honesty follow-on) | PROPOSAL | owner review |

**Row status change:** FW-0042 moves from `open` to `in design`. FW-0042 stays in design until this proposal is owner-ratified, SC-6 sidecar spec is authored + ratified, EXT-37 ratifies, EXT-5 ledger events are added, and ADR-0011 amends to split the umbrella per FW-0037 §4.1.

## 12. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc; SC-6 lands per the rule that no existing carrier fits — defended in §7).
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`trustedReviewer` is post-MVP; this design stages for post-MVP).
- [web ADR-0007](../adr/0007-identity-provider-port.md) — identity provider port (Tier-2 reviewer-identity rides the same port).
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §4.2 defers most port shapes to build per §(b); ReviewerSession + ReviewThreadStore are the load-bearing exceptions that land here).
- [web ADR-0010](../adr/0010-respondent-place-trust-model.md) — respondent-place trust model (SC-6 thread inherits the draft's trust profile per §6.8).
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (`reviewerPreparer` umbrella; split into `preparerFiling` + `trustedReviewer` per FW-0037 §4.1; amendment text consolidated here at §4.1).
- [FW-0037 design 2026-05-24](2026-05-24-fw-0037-filer-not-signer-design.md) — split-keys sibling design; FW-0042 mirrors the framing-and-composition shape (§1 / §6 / §8 / §10 sectioning).
- [FW-0048 design 2026-05-23](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-aware signing (composition seam at §6.2; reviewer-as-coercer is a primary AP-014 vector).
- [FW-0049 design 2026-05-23](2026-05-23-fw-0049-safe-address-handling-design.md) — safe-address handling (composition seam at §6.3; safe-* auto-marks reviewer-respondentOnly).
- [FW-0050 design 2026-05-23 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party (composition seam at §6.4; per-party reviewer share).
- [FW-0034 design 2026-05-24](2026-05-24-fw-0034-honest-correction-path-design.md) — honest correction (composition seam at §6.5; `correctableReviewerPosture`).
- [FW-0058 design 2026-05-24 §7.7](2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — AI-agent filer (vocabulary firewall reciprocated at §6.7; four-way framing table).
- [FW-0051 design 2026-05-23](2026-05-23-fw-0051-bring-your-own-assistant-design.md) — BYO-assistant (composition note at §6.7; the assist-spec is also the rejected Option B candidate substrate per §7).
- [FW-0030 — `PLANNING.md`](../../PLANNING.md) — federated identity (composition seam at §6.6; informational).
- [FW-0043 — `PLANNING.md`](../../PLANNING.md) — abandon-and-erase with deletion receipt (composition seam at §6.8 + §8.3; deletion-includes-thread is load-bearing).
- [FW-0107 — `PLANNING.md:1191`](../../PLANNING.md) — FW-0037 substrate-honesty precedent for FW-0110 reservation per §9.1.
- [Respondent Ledger Spec §6.4 actor enum + §8 event taxonomy — `formspec/specs/audit/respondent-ledger-spec.md`](../../../formspec/specs/audit/respondent-ledger-spec.md) — REJECTED Option B half (the enum stays at the current closed set; EXT-5 takes the two new ledger events).
- [Formspec Assist Specification — `formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md) — REJECTED Option B half (assist-spec scope is tooling-assisting-respondent; the human-reviewer trust boundary is structurally different).
- Journey: [J-014 in `JOURNEYS.md:368`](../../JOURNEYS.md).
- Anti-patterns: [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-023 in `JOURNEYS.md:185`](../../JOURNEYS.md), [AP-024 in `JOURNEYS.md:191`](../../JOURNEYS.md).
- External prior art (informed §3 framing; defended §7 reject of "fold into existing collaboration substrate"): Google Docs suggesting mode + comment threading; GitHub PR comment + suggested-change UI; Microsoft Word Track-Changes; HotDocs document-collaboration; Clio + MyCase legal-collaboration tools; W3C Web Annotation Protocol (capability-URL-pattern reference); HIPAA Business Associate scoping (relevant to medical-reviewer compositions in future XS-N).
