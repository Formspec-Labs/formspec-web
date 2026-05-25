# FW-0037 — Filer-not-signer (human filer; respondent signs): design proposal

**Date:** 2026-05-24
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q4 are open until accepted.
**Row:** [FW-0037 in `PLANNING.md:505`](../../PLANNING.md) (design).
**Journey:** [J-012 in `JOURNEYS.md:343`](../../JOURNEYS.md) — the **human-capacity slice** ("filer ≠ signer ≠ subject"; non-AI variants — paralegal-for-pro-se-client, clinic-staff-for-patient, family-helper-for-elder, tax-preparer-for-taxpayer). AI variant is [FW-0058](2026-05-24-fw-0058-ai-agent-filer-chain-design.md).
**Anti-patterns:** [AP-014 (coercion) in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-023 (verified ≠ true) in `JOURNEYS.md:185`](../../JOURNEYS.md).
**Feature key:** `preparerFiling` — proposed as a split from the original `reviewerPreparer` umbrella enumerated at [web ADR-0011 Feature Ownership Table line 150](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Per code-review HIGH F6, the umbrella row decomposes into two sibling keys: `preparerFiling` (FW-0037) + `trustedReviewer` (FW-0042 future). One key per feature preserves the existing ADR-0011 flat-key precedent and avoids pre-committing FW-0042's architecture before its design starts (see §4.1).
**Source brief:** [`thoughts/sketches/2026-05-24-fw-0037-filer-not-signer-research-brief.md`](../sketches/2026-05-24-fw-0037-filer-not-signer-research-brief.md). Upstream-primitive inventory, threat scenarios, FW interactions, and external prior art live there; this doc decides over them.
**Substrate sources (load-bearing):**
- [EXT-3 in `thoughts/specs/2026-05-22-upstream-extension-queue.md:46`](2026-05-22-upstream-extension-queue.md) — `AuthoredSignature.capacity` enum (signer-side; covers POA / guardian / executor / etc.). FW-0037 sits ABOVE this — the respondent's capacity stays `self`; the filer is a sibling carrier.
- [web ADR-0011 line 150](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `reviewerPreparer` umbrella key (proposed to split into `preparerFiling` + `trustedReviewer` per code-review F6; see §4.1).
- [web ADR-0007](../adr/0007-identity-provider-port.md) — IdentityProvider port (filer-identity binding rides the same port as signer-identity).
- [FW-0058 design 2026-05-24](2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — AI-capacity sibling; vocabulary distinction is load-bearing (see §6.6).

Per [web ADR-0004 consume-not-invent](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web does not author legal-authority frameworks or per-jurisdiction filer-role taxonomies. FW-0037 is a **consumer-side composition** — names the formspec-web filer-not-signer posture, proposes the `filerRef` carrier on the submission audit trail, specifies the signature-ceremony handoff port shape, writes the threat model centered on the AP-014 coercion vector, distinguishes firmly from FW-0058 (AI) and FW-0042 (reviewer-only).

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for accepting submissions where a **human filer** (paralegal, preparer, clinic staff, family helper, advocate) fills the form on behalf of a **human respondent** who retains capacity to sign, such that:

- The receipt unambiguously names the filer and the signer as distinct parties.
- The signer's `AuthoredSignature.capacity` stays `self` (the respondent has capacity; no POA chain on the signature).
- The runtime UX surfaces "I'm filling this for someone else" entry, captures filer identity, and routes the signing ceremony explicitly to the respondent.
- The signature ceremony fires under the respondent's identity + authentication session, separately from the filer's session.
- The form-policy can FORBID filer-not-signer on the high-coercion-risk template set per FW-0048 §6.4.
- The verifier renders "filed by [filer-name] · signed by [signer-name]" as ambient capacity-discipline copy per AP-023.

**The substrate already mostly exists**: EXT-3 covers the signer-side `capacity` (FW-0037 doesn't touch it — respondent capacity stays `self`); web ADR-0011 enumerates `reviewerPreparer` (proposed to split into `preparerFiling` + `trustedReviewer` per code-review F6 — see §4.1); the IdentityProvider port (web ADR-0007) carries the filer's identity binding without extension. The new substrate is small: a `filerRef` carrier on the submission audit trail and a `SignerHandoff` port shape.

FW-0037 deliverables: framing decisions (Q1–Q4); the `preparerFiling` capability key + resolved-profile shape (flat, per split-keys F6 — §4.1); the `filerRef` carrier shape on the submission; the runtime UX contract for filer-session + handoff + signer-ceremony; the SignerHandoff port shape and its adopter contracts; the verifier rendering contract; the failure semantics; the composition seams with FW-0042 / FW-0048 / FW-0049 / FW-0050 / FW-0034 / FW-0030 / FW-0051 / FW-0058; the cross-stack dependency chain (smallest slice-1 footprint of any post-MVP design row to date per code-review F2 — see §6.4 honesty disclaimer; one EXT for `filerRef` carrier; small ADR-0011 amendment splitting the `reviewerPreparer` umbrella row).

This is a **design row**. The deliverable is a doc plus follow-on EXT and spec items, not code. The build row is a future follow-on (not yet filed; expected to materialize when EXT for `filerRef` ratifies and the first adopter deployment needs a preparer flow).

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. A future build row owns the materialization.
- **Inventing a parallel capacity model.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), EXT-3 IS the capacity model. The signer's capacity stays `self`; FW-0037 does NOT add a new capacity value. The filer is a sibling carrier, NOT a capacity.
- **Authoring legal-authority frameworks.** Whether a paralegal can legally file a court document on behalf of a pro se client is a jurisdictional legal question. Per AP-023, FW-0037 captures filer-identity-claim, NOT legal authorization. Deployments bind legal-authority verification to their own substrate (paralegal-license check, family-member affidavit, etc.).
- **Authoring per-jurisdiction filer-role taxonomies.** Whether "paralegal" or "advocate" or "navigator" is the right role name for a given deployment is per-deployment. FW-0037 declares a seed enumeration (`family | preparer | professional | advocate | guardian-helper`) and defers per-deployment extensions.
- **Solving coerced-signing in real-time.** FW-0048 owns the duress affordance substrate; FW-0037 composes with it (§6.2). FW-0037 itself cannot detect coercion; the respondent is the only party who knows.
- **WOS substrate for filer-actor governance.** WOS has no `human-filer` actor extension today and FW-0037 does not propose one. If a deployment needs per-filer-actor governance (e.g., per-paralegal capability scoping under CPA Board audit rules), that's a future WOS-side row.
- **AI-agent filer case.** That's FW-0058. Vocabulary firewall is load-bearing — see §6.6.
- **Replacing FW-0042 (reviewer-only).** FW-0042 is read+comment; FW-0037 is read+author+handoff. The two are architecturally distinct features — split into sibling capability keys `preparerFiling` (FW-0037) and `trustedReviewer` (FW-0042 future) per code-review F6, not a shared umbrella key. See §4.1 + §8.1.
- **POA / guardian / executor / licensed-professional signing cases.** Those are already EXT-3 `capacity: poa | guardian | executor | licensed-professional` — the SIGNER signs in that capacity; there is no separate "filer." FW-0037 is the third leg where the respondent has capacity to sign and a separate human filled the form for them.
- **Specifying the per-act audit-trail event taxonomy.** The submission-level `filerRef` carrier is the load-bearing primitive; ledger event types (e.g., `filer.session-opened` / `filer.handoff-completed`) are deferred to build per Q2.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Trust boundary

**The signer (respondent) is the trust anchor for the legal act**; the filer is OUTSIDE the trust boundary for any attestation, BUT INSIDE the trust boundary for content-authoring within the scope the form-policy permits.

- The **form** trusts the **signer's identity binding** (via the standard IdentityProvider port per web ADR-0007). The signer's `AuthoredSignature.identityBinding` is unchanged from non-filer flows.
- The **form** trusts the **filer's identity binding** (same IdentityProvider port; distinct session) for the purpose of **attributing typed content**, NOT for the purpose of **attesting to anything**. The filer's identity rides the standard binding but is recorded on the submission's audit trail, never on the `AuthoredSignature`.
- The **form** does NOT trust the filer to authorize the signing act. The signing ceremony MUST run under the signer's authenticated session; no path lets the filer's session produce a signature event.
- The **respondent (signer)** is the only party who can attest to their answers being accurate. Per AP-023, the receipt attests to filer-identity (captured on submission) + signer-identity (captured on signature) + temporal ordering (filer finished before signer signed) — NOT to truth.

**What the filer SEES (when the form-policy declares `filerNotSigner: allowed | required`):** the Formspec Definition (the form's structure); the per-field help context (References + Ontology sidecars); the per-field values typed in the filer's session; the per-field policy declarations (which fields the filer may fill vs. which are respondent-only per Q4). **The filer does NOT see** safe-* class fields' plaintext when the form-policy declares them `respondentOnly: true` (Q4 default for safe-*) — those fields render masked in the filer session and unmask only in the signer session.

**What the filer DOES NOT see:** the signer's signing-ceremony session state (the signer authenticates separately); the duress affordance (per FW-0048, the duress UI is reachable only from the signer's ceremony); the issuer's deployment-internal config (`safetyTeamRecipients[]` per EXT-30, etc.).

### 2.2 Attacker model

- **Attacker identity.** (a) A predatory "helper" who fills the form with content the respondent didn't intend (financial-redirect scam targeting an elder). (b) A coercive filer (abusive partner, predatory caregiver) who fills the form and forces the respondent to sign. (c) An unauthorized filer who claims a role they don't hold (faking paralegal status). (d) An adversary who intercepts a handoff link (the filer's "ready for [signer] to review" magic link) and impersonates the signer.
- **Attacker goal.** Cause the respondent to sign a submission they didn't author or wouldn't author if reviewed; impersonate the signer to produce a signed submission without the actual respondent's involvement; falsify filer-identity in the audit trail.
- **What the attacker observes.** The Formspec Definition + sidecars are public; the filer's session state is visible to the filer; the handoff transport (short-link / QR / device-pass) is visible to whoever holds the device or receives the link.
- **What the attacker cannot force.** (a) A signature without the signer's authenticated session — the signing ceremony MUST run under the signer's IdentityProvider session. (b) A bypass of the form-load gate when `filerNotSigner: forbidden` (the high-coercion template set per FW-0048 §6.4). (c) Bypass of the per-field respondent-only-fillable gate (filer can't type into a `respondentOnly: true` field). (d) In the formspec-web reference renderer, bypass of the per-section review acknowledgement at signer ceremony (each filer-pre-filled section requires the signer to acknowledge before the signing CTA enables per §3.3) — but this is a **renderer-class affordance**, not a substrate guarantee; non-reference renderers can skip it. FW-0107 (§6.9) tracks the substrate-class upgrade.
- **What the attacker knows.** Kerckhoffs-style — the attacker has read this design, the FW-0048 design, and the form's Definition. **The substrate-class defense rests on structural mechanisms** (form-policy forbidden-list for high-coercion templates; signer-session-only duress affordance; asymmetric assurance for high-coercion templates; form-load enforcement of `filerNotSigner: forbidden`) **rather than on any single secret.** The per-section review gate is a **renderer-class enhancement on top** — load-bearing inside the reference renderer, but the FW-0037 substrate does not enforce it; FW-0107 (§6.9) is the substrate-class upgrade path.

### 2.3 Four grounded scenarios

Each scenario gives: the setup, what the FW-0037 mechanism must achieve, what this design's posture provides.

**2.3.1 Paralegal fills small-claims complaint for competent pro se client (canonical scenario).** A legal-aid clinic paralegal helps a client file a small-claims complaint. The client signed an engagement letter authorizing fill-on-behalf; the client is present and reviews + signs at the end of the session.
- **Required:** receipt names paralegal as filer (role: `professional`); names client as signer (capacity `self`); shows temporal ordering (filer T1 < signer T2). Court audit can determine "who typed this" vs "who attested this."
- **Design posture:** §3 framing decisions; §3.1 form-policy `allowed`; §3.2 `filerRef` carrier (single filer per submission); §3.3 runtime UX "you are filing on behalf of [signer]" banner during filer session + "ready for [signer-name] to review" handoff CTA; §3.4 same-device session-switch is the canonical adapter for this scenario. **Canonical scenario; design optimizes for this.**

**2.3.2 Clinic intake coordinator fills demographics + history; patient signs on iPad in waiting room.** A clinic's intake coordinator pre-fills the patient's chart before the appointment; the patient arrives, the iPad shows the pre-filled form, the patient reviews + signs.
- **Required:** receipt names intake coordinator as filer (role: `professional` or deployment-specific `staff`); names patient as signer (capacity `self`); distinct-device handoff between admin-station session (filer) and waiting-room iPad session (signer).
- **Design posture:** §3.4 distinct-device handoff via short-link / QR / device-pass; per-section review gate at signer ceremony (patient acknowledges each pre-filled section before signing CTA enables); asymmetric assurance allowed (filer at IAL1 / staff credential; patient at IAL2 / driver's-license-bound credential per form policy). **Canonical scenario for the device-handoff case.**

**2.3.3 Adult daughter helps elderly competent mother with benefits-redetermination form.** Daughter sits with mother, fills the form while mother reviews each section verbally, mother signs at the end.
- **Required:** receipt names daughter as filer (role: `family`); names mother as signer (capacity `self`); temporal ordering may be very tight (T2 - T1 = ~30s); asymmetric assurance allowed (daughter at email-bound IAL1; mother at IAL2).
- **Design posture:** §3 framing decisions; §3.5 filer assurance floor is form-policy-declared, MAY be lower than signer; §3.3 same-device hand-the-device handoff is the canonical adapter. **Canonical scenario for the home-care family-helper case.**

**2.3.4 Adversarial — "helpful preparer" coerces respondent into signing benefits-redirect form.** A predatory "helper" at a senior center fills a benefits-redirect form (redirecting Social Security to the helper's account), hands the device to the elder, says "just tap here." The elder doesn't read carefully and taps.
- **Required:** structural defenses that hold against an adversarial filer at the signature step.
- **Design posture.** **Layered defense (substrate-class layers AND-composed; renderer-class affordance separately noted).** (a) **Per-template forbidden-list per FW-0048 §6.4** — benefits-redirect, financial POA, advance directive, marriage/divorce, custody, immigration sponsorship default to `filerNotSigner: forbidden` (the signer MUST be the filer; no separate filer session). (b) **Per-section review affordance at signer ceremony (renderer-class)** — the formspec-web reference renderer SHOULD surface each filer-pre-filled section as a discrete acknowledgement step. **This is a renderer-class assurance, not a substrate-class guarantee.** Non-reference renderers can satisfy `metadata.filer` + signer signature shape while skipping the affordance; the substrate carries no acknowledgement evidence today. Substrate-level enforcement (carrier extension + form-policy gate + verifier coverage check) is filed as FW-0107 per §6.9 — blocked on a real coercion incident OR an adopter request. (c) **Duress affordance reachable from signer's ceremony per FW-0048 §3** — the dual-credential mechanism is available on the signer's ceremony surface, NOT the filer's. (d) **Asymmetric assurance for high-coercion templates** — when the template class is in FW-0048's high-coercion set, the form-policy SHOULD require IAL2+ for the signer regardless of the filer's assurance; substrate per FW-0030 + EXT-8. (e) **Form-policy `filerNotSigner: forbidden` enforcement** — the form-load gate refuses to enter filer-session-mode for forbidden templates; the only path is signer-as-respondent fills + signs themselves. **Composition rule (explicit; substrate-honest): the AP-014 vector on FW-0037 is closed by substrate-class layers (a)+(c)+(d)+(e) AND-composed. Layer (b) is a renderer-class enhancement that the reference renderer enforces but the substrate does not — bypassing the reference renderer breaks (b); the substrate-class layers still hold. Adversarial scenarios that bypass (a) (template not in high-coercion set + form-policy `allowed`) are caught by (c) (duress affordance at signer-only ceremony surface), (d) (asymmetric assurance lifting the signer floor), and (e) (form-load forbidden gate when the org/form policy demands it).**

### 2.4 Out-of-scope threat patterns

Named explicitly so the design isn't read as covering them:

- **Compromised filer-device.** Once an attacker controls the filer's device, the filer's session can be manipulated. Mitigation = the filer's own device hygiene (device-attested credentials, MDM for clinical contexts). FW-0037 doesn't author endpoint security.
- **Compromised signer-device.** Same shape on the signer side — if the signer's device is compromised, the signing ceremony can be manipulated. Mitigation = signer-device hygiene + composition with FW-0036 (humane bot protection, device-attested credentials per Tier 1).
- **Filer-identity-provider compromise.** If the IdP issues filer-class credentials to unauthorized parties, FW-0037 cannot detect. Substrate-layer concern; per ADR-0007 + SC-4 IdP discipline.
- **Coerced-respondent-with-no-filer-present.** A respondent coerced by a non-filer (abusive partner standing nearby) signing a form they filled themselves is FW-0048's territory, not FW-0037's.
- **Per-jurisdiction legal-authority verification.** Whether the filer is legally authorized to file on behalf of the signer (paralegal status, family-member affidavit, professional license) is deployment-bound per-jurisdiction. FW-0037 captures the role + identity; deployments verify authority.
- **Cross-deployment filer-reputation.** A filer's behavior at deployment A doesn't bind their behavior at deployment B. Cross-deployment reputation is out of scope.

## 3. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 3.1 Q1 — Form-policy shape: three-tier `forbidden | allowed | required`

**PROPOSAL.** Form-policy carries the standard ADR-0011 three-tier shape:

| Tier | Semantics |
|---|---|
| `forbidden` | Form REJECTS filer-not-signer. Signer MUST be the same identity as the form-fill author; no separate filer session is offered at entry. Default for high-coercion / rights-impacting templates (FW-0048 §6.4: financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect). Form-load with a filer-session URL triggers typed `FeaturePolicyConflictError`. |
| `allowed` | Form accepts EITHER same-identity fills-and-signs OR filer-fills-then-signer-signs. Default for most forms; minimal disruption to existing flows. The entry-point UX surfaces an opt-in "I'm filling this for someone else" affordance; users who don't opt-in get the standard self-fill flow. |
| `required` | Form REQUIRES filer-not-signer. Same-identity fills-and-signs is rejected. Rare; use cases include forms designed for paralegal-only filing with paper-signature handback, clinic-staff-only intake forms, or process-mandated separation-of-duties flows. Explicit. |

**Justification.** Maps directly onto ADR-0011's existing form-policy enum and the existing typed-error rendering at form-load. Mirrors FW-0058 (`aiAgentFiler`), FW-0049 (`safeAddress`), FW-0050 (`multiParty`) three-tier shape directly. The form-policy tier composes with the runtime UX entry-point — `allowed` is the canonical case where users opt-in; `required` forces the filer-session entry; `forbidden` skips the affordance entirely.

**Alternative rejected: two-tier `forbidden | allowed` (no `required`).** Considered because `required` is rare. Rejected: maintaining symmetry with FW-0058 / FW-0050 / FW-0049 outweighs minor force-fitting on the rare tier; the symmetric vocabulary keeps reasoning-about-multiple-features cognitively consistent. The rare `required` use cases exist.

**Alternative rejected: per-role granular tier (e.g., `filerRoles: { family: "allowed", professional: "allowed", advocate: "forbidden" }`).** Considered for finer-grained per-role control. Rejected: per-role gating creates a sprawling form-policy shape; per-role acceptability is a deployment / org-policy concern, not a form-policy concern. **Form-policy gates the FLOW shape; org-policy gates the ROLE set (per ADR-0011 line 150 "allowed reviewer/preparer roles" is org-side).** Clean separation.

### 3.2 Q2 — `filerRef` carrier shape: submission-level `metadata.filer`, single filer per submission

**PROPOSAL.** Add `metadata.filer?` on the Formspec Response as a sibling block to EXT-2's `metadata.provenance[path]`. One filer per submission.

```text
metadata.filer?: {
  filerId: string                  // URN naming the filer's identity (e.g., "urn:formspec:identity:user:abc123")
  filerName: string                // Display name as shown in the verifier's "filed by" copy
  role: "family" | "preparer" | "professional" | "advocate" | "guardian-helper" | string  // Seed enumeration + deployment-extensible (per Q1 §1.2 non-goal — role taxonomy is deployment-bound)
  relationshipToSigner?: string    // Free-text or controlled by deployment; informational ("daughter", "engaged paralegal", "intake coordinator at [clinic]")
  identityBinding: IdentityBinding // Same shape as AuthoredSignature.identityBinding (per web ADR-0007); the filer's authentication binding
  sessionStartedAt: string          // RFC 3339; filer's session start
  sessionCompletedAt: string        // RFC 3339; filer's hand-off to signer
  fieldsAuthored: Array<string>     // RFC 6901 pointers; which fields the filer typed values into (empty if filer only navigated)
  handoffMethod: "same-device-session-switch" | "distinct-device-short-link" | "distinct-device-qr" | "in-person-device-pass" | string  // Adopter-extensible per Q3
}
```

**Substrate justification.** The `filerRef` carrier rides on the Response envelope as `metadata.filer` (parallel to EXT-2's `metadata.provenance[path]` and EXT-2's `metadata.derivations[path]`); the base Response envelope is **unchanged**. The signer's `AuthoredSignature` is **unchanged** — the respondent signs in capacity `self` as they would in a non-filer flow. The `metadata.filer` block is metadata the verifier reads to render the filer-vs-signer distinction.

**Single filer per submission.** Slice 1 assumes one filer per submission. The canonical scenarios (paralegal-for-client, clinic-staff-for-patient, family-helper-for-elder) are single-filer; multi-hop filer chains (filer A starts, hands to filer B, who hands to signer) are rare and deferred to a future row OR a future ledger event extension. Per Q1 §1.2 non-goals.

**`identityBinding` rides web ADR-0007.** No new substrate; the filer's identity is bound via the same `IdentityProvider` port as the signer's. The filer's IdP session is distinct from the signer's IdP session; both are captured.

**`role` is the seed enumeration + deployment-extensible.** Per Q1 §1.2 non-goal, the role taxonomy is deployment-bound. The seed enumeration covers the canonical scenarios; deployments extend with their own role names (e.g., a court e-file portal might add `pro-se-coordinator`).

**Alternative rejected: per-AuthoredSignature `filedBy?` sibling field.** Considered as a smaller change. Rejected: couples filer-identity to a signature event when the filer didn't sign; conflates with EXT-3 `principalRef` (the principal subject the signer represents); creates ambiguity when a signature has both `principalRef` (signer represents principal) AND `filedBy` (a third party typed it). Cleaner to keep the filer on the submission audit trail.

**Alternative rejected: per-act ledger event types (e.g., `filer.session-opened`, `filer.handoff-completed`).** Considered for richer audit trails. Rejected for slice 1; per Q1 §1.2 non-goals, defer to build row when consumers materialize. The `metadata.filer` carrier covers the canonical receipt-rendering use case; per-act events are an enrichment.

**Alternative rejected: `filerRef[]` array (multi-filer support).** Considered for the multi-hop case (filer A → filer B → signer). Rejected for slice 1: not in canonical scenarios; can extend to `filer: FilerEntry | FilerEntry[]` in a future revision (additive change). **Single filer is load-bearing for slice 1.**

### 3.3 Q3 — Signature ceremony handoff: SignerHandoff port shape; reference adapters at build

**PROPOSAL.** The handoff from filer-session to signer-ceremony is mediated by a `SignerHandoff` port. Adopters wire reference adapters per their flow. Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md), the port shape lands here; reference adapters land with the build row.

**Three canonical reference adapters** (declared as adopter contracts; built later):

| Adapter | Use case | UX shape |
|---|---|---|
| `SameDeviceSessionSwitch` | Paralegal-and-client side-by-side; family-helper-and-elder at home. | Filer ends session via "ready for signer" CTA; sign-out flushes filer's session state; signer's IdP login screen appears; signer authenticates; the form re-opens in signer-review mode with pre-filled fields visible. |
| `DistinctDeviceShortLink` | Clinic-staff fills at admin station; patient signs on waiting-room iPad. | Filer ends session; system emits a one-time signer-link sent via email/SMS to the signer's pre-declared address (or shows a QR for in-person device-handoff); signer opens on their device, authenticates, reviews + signs. Short-link is single-use, expires within form-policy-declared window. |
| `InPersonDevicePass` | Tax-prep CPA hands tablet to client across the desk. | Filer ends session via "ready for signer" CTA; the device prompts for signer authentication INLINE (no new device); signer authenticates with their credential (passkey, ID-bound credential); the form re-opens in signer-review mode. Differs from `SameDeviceSessionSwitch` in that signer auth fires immediately, no log-out/log-in lag. |

**Per-form handoff-method declaration.** Form-policy can constrain which handoff methods are acceptable. High-coercion templates (FW-0048 §6.4) when `filerNotSigner: allowed` SHOULD require `DistinctDeviceShortLink` (fresh-device, fresh-auth, time-gap for the signer to consider away from the filer's presence).

**Port shape (adopter contract; sketch).**

```text
interface SignerHandoff {
  // Adopter contract: produce a handoff token bound to the filer's completed session;
  // the signer's session redeems the token to open the form in signer-review mode.
  // Tokens are single-use, time-bound, and bound to the filer-session's submission audit trail.
  initiate(args: {
    filerSubmissionId: string         // Opaque submission id from the filer's session
    signerDeclaredContact?: {kind: "email" | "sms" | "in-person"; value: string}
    handoffMethod: string             // Adopter chooses; matches form-policy allowedHandoffMethods
  }): Promise<{handoffToken: string; userVisibleArtifact?: {kind: "link" | "qr" | "session-switch"; artifact: string}}>;

  // Adopter contract: redeem the handoff token; resolve the filer-session's submission and
  // open the signer-ceremony surface with pre-filled fields visible and the per-section review gate active.
  redeem(args: {handoffToken: string; signerIdentityClaim: IdentityClaim}): Promise<{
    submissionId: string;
    preFilledFields: ReadonlyArray<string>;  // RFC 6901 pointers from metadata.filer.fieldsAuthored
  }>;
}
```

**Why a port (not a built-in helper).** Per ADR-0009, every backend-shaped concern is a port. The handoff transport varies per deployment (short-link via deployment's own notification service; QR via the device's camera; session-switch via the IdP's logout-flow); a built-in helper would force one transport on every adopter. Reference adapters defer to build; the port shape lands here so adopter-contracts are explicit.

**Per-section review affordance (renderer-class, NOT substrate-class — honest demotion per code-review).** When the signer-ceremony opens via `SignerHandoff.redeem`, the formspec-web reference renderer SHOULD surface each filer-pre-filled section (per Definition section grouping) as a discrete acknowledgement step. The signing CTA is disabled until all pre-filled sections are acknowledged. The acknowledgement is per-section ("I have read the demographics section"); NOT per-field (per-field would create fatigue). The acknowledgement is non-skippable in the reference renderer; design forbids a "sign everything" shortcut on that surface.

**This affordance is bypassable by non-reference renderers.** Any third-party renderer that satisfies `metadata.filer` shape + signer signature can skip the acknowledgement gate; the substrate carries no `acknowledgedSections` evidence today, and no verifier-side check enforces coverage. Substrate-level enforcement (an EXT-36 carrier extension + form-policy gate at submit + verifier coverage check) is filed as future row FW-0107 (§6.9), pending a real coercion incident or adopter request to surface need. Defense against AP-014 in FW-0037 substrate-honestly rests on layers (a)+(c)+(d)+(e) per §2.3.4; layer (b) is a reference-renderer affordance, not a substrate guarantee.

**Alternative rejected: single built-in handoff implementation in the formspec-web codebase.** Considered for simplicity. Rejected per ADR-0009: the handoff transport is a backend-shaped concern; built-in would prevent adopters from wiring their own notification rails. The port discipline holds.

**Alternative rejected: handoff via the existing IdentityProvider session-restoration flow.** Considered for reusing existing identity primitives. Rejected: the handoff carries submission-state continuity (the signer must see the filer's pre-fills), not just identity continuity. Identity-session restoration is a sibling concern; the SignerHandoff port composes ABOVE the IdentityProvider port (the signer authenticates via the IdP; the SignerHandoff resolves the submission state).

### 3.4 Q4 — Per-field filer-fillable taxonomy: default-all-fillable with respondent-only opt-out

**PROPOSAL.** Filer can fill any field by default; form-policy declares per-field `respondentOnly: true` to gate. Safe-* class fields (per FW-0049) default to `respondentOnly: true` automatically (composition rule §6.3); no per-field declaration needed.

**Substrate justification.** The canonical scenarios (paralegal-fills-demographics, clinic-staff-fills-history, family-helper-fills-most-fields) have most fields filer-fillable. Treating filer-fillable as default minimizes form-policy bloat — only the sensitive subset needs declaration. Safe-* default-respondent-only is automatic via §6.3 composition, eliminating duplicate declaration.

**Field rendering in filer-session.**

| Field type | In filer-session |
|---|---|
| Default (filer-fillable) | Fully renderable + writable. |
| `respondentOnly: true` (form-policy declared) | Renders as masked label ("Signer to fill at signing"); not writable in filer-session; revealed + writable in signer-review mode after handoff. |
| Safe-* class (FW-0049) | Same as `respondentOnly: true` (composition rule §6.3); the safe-* mask discipline survives the filer's read. |

**Field rendering in signer-review mode.**

| Field type | In signer-review mode |
|---|---|
| Filer-pre-filled | Renders with "Filed by [filer-name]" provenance badge; signer can edit; per-section review acknowledgement required (per Q3 §3.3). |
| `respondentOnly: true` (unfilled by filer) | Renders empty + writable by signer; the signer fills these. |
| Safe-* class (unfilled by filer per default-respondent-only) | Same as `respondentOnly: true` (composition rule §6.3); signer fills with plaintext access. |

**Alternative rejected: default-respondent-only (filer can fill nothing without explicit form-policy grant).** Considered for maximum safety. Rejected: forces every form to declare per-field `filerFillable: true` for the bulk of its fields — administrative burden + drift risk + onboarding cost. Default-all-fillable matches canonical scenarios; respondent-only opt-out is the smaller surface.

**Alternative rejected: per-section filer-fillable instead of per-field.** Considered to reduce form-policy size. Rejected: real forms have sensitive fields mixed with non-sensitive fields within the same section (e.g., a household demographics section may have non-sensitive name + age fields alongside a sensitive employer field protected via safe-employer). Per-field granularity is required; the safe-* composition handles the bulk of the sensitive set automatically.

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011 — split keys `preparerFiling` + `trustedReviewer` (code-review F6)

**PROPOSAL (revised per code-review HIGH F6).** Split the umbrella `reviewerPreparer` row at ADR-0011 line 150 into two append-only sibling keys, one per feature:

- **`preparerFiling`** — owned by FW-0037; covers human filer fills + handoff to human respondent who signs.
- **`trustedReviewer`** — owned by FW-0042 (future design); covers reviewer who reads + comments but does NOT author or sign.

**Why split (the precedent that the original shared-key sub-block decomposition broke).** Every other `RUNTIME_FEATURE_KEYS` entry is one key per feature (`payment`, `embed`, `safeAddress`, `multiParty`, `fileUpload`, etc.). The shared-key sub-block shape (`reviewerPreparer.preparerFlow.posture` + `reviewerPreparer.reviewerFlow.posture`) is NEW shape — no other entry uses a sub-block decomposition. **The append-only key tuple is the precedent**; a shared key with named sub-blocks pre-commits FW-0042's architecture before its design has started. Splitting now preserves the one-key-per-feature discipline and leaves FW-0042 full design freedom — FW-0042 may decide whether `trustedReviewer` is a flat three-tier posture or a richer shape, without inheriting FW-0037's sub-block convention.

**ADR-0011 amendment proposal text (small):**

> Replace ADR-0011 Feature Ownership Table line 150 entry `reviewerPreparer` with two sibling rows:
>
> | Capability | Evidence |
> |---|---|
> | `preparerFiling` | Filer-session UI + `SignerHandoff` adapter + filer-identity binding + `metadata.filer` carrier + per-section review affordance in the reference renderer (FW-0037 scope). |
> | `trustedReviewer` | Reviewer-session sharing + comment substrate + reviewer-identity binding (FW-0042 scope). |
>
> The umbrella label "Reviewer/preparer sharing, role, and permission model" decomposes into the two sibling capabilities. **No shared sub-block convention is introduced** — each key carries its own resolved-runtime-profile entry per the existing flat ADR-0011 pattern. FW-0042 is free to design its `trustedReviewer` shape without inheriting any FW-0037-imposed sub-block ordering.

**Append-only key ordering.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts), `RUNTIME_FEATURE_KEYS` is append-only. **FW-0037 adds one new key — `preparerFiling`** — when the tuple at `feature-keys.ts:68-76` is extended at build time. **FW-0042's `trustedReviewer` lands independently** when FW-0042's design ratifies; the two keys do not share build-time coordination beyond the ADR-0011 amendment text above. The original ADR-0011 line 150 `reviewerPreparer` umbrella is **deprecated by this proposal**; no production code consumes it yet (the SHIPPED tuple is what `feature-keys.ts:68-76` exposes today, and `reviewerPreparer` is not in it).

| Layer | What ADR-0011 will name for `preparerFiling` (FW-0037 only) |
|---|---|
| Instance capability | Adapter-backed: (a) `SignerHandoff` adapter binding (per §3.3); (b) IdentityProvider adapter for filer-session authentication (same port as signer per web ADR-0007); (c) audit-trail render adapter for the "filed by" + "signed by" capacity-discipline copy (§5). Instance declares which handoff adapters are wired + which IdPs support filer-session entry. |
| Org policy | (a) Allowed filer roles (subset of seed enumeration + deployment extensions per Q2); (b) Allowed handoff methods per template class; (c) Filer-assurance-floor configuration per template class; (d) Org-level forbidden-list for filer-not-signer (org may forbid the entire flow regardless of form-policy). |
| Form policy | Three-tier per §3.1: `forbidden` (form REJECTS filer-not-signer), `allowed` (default opt-in), `required` (form REQUIRES filer-not-signer). High-coercion templates per FW-0048 §6.4 default to `forbidden` per §6.2 composition. Per-field `respondentOnly: true` per §3.4. Per-form `allowedHandoffMethods: string[]` per §3.3. Per-form `filerAssuranceFloor?: AssuranceLevel` per Q5 §3.4 (optional; defaults to signer's assurance floor). |
| Resolved runtime profile | `preparerFiling.posture` + `allowedRoles[]` + `allowedHandoffMethods[]` + `filerAssuranceFloor` + `respondentOnlyFieldPointers[]` + (when posture != "forbidden") `signerHandoffBindingRef`. Flat, no sub-block. Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if the form requires `preparerFiling` but the instance lacks a `SignerHandoff` adapter; throws `FeaturePolicyConflictError` if the form FORBIDS and the org REQUIRES. |

**Locale-conditional set.** `preparerFiling` is **NOT** locale-conditional — the per-form policy doesn't change with locale. No `LOCALE_CONDITIONAL_FEATURE_KEYS` membership. (`trustedReviewer` membership is FW-0042's call.)

### 4.2 Port shape — adopter contracts now; reference adapters at build

Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md): post-MVP ports await consumer code. FW-0037 is a design row; build row is a future follow-on. The honest application is to specify the **adopter contracts** here and let the port shapes land with the build, with one explicit exception: the `SignerHandoff` port shape (§3.3) IS the load-bearing decision and lands here (port shape, not reference adapter implementation).

**Adopter contracts (what the build row must satisfy).**

| Adopter axis | What it implies |
|---|---|
| `SignerHandoff` adapter binding | Per §3.3 — handoff token issuance + redemption; transport-extensible (same-device / short-link / QR / in-person). REQUIRED when posture != "forbidden". |
| `IdentityProvider` adapter (filer-session) | Same port as signer's IdP per web ADR-0007. Filer-session authentication; the adapter may enforce different assurance-level requirements than signer-session per form-policy. REQUIRED when posture != "forbidden". |
| Verifier "filed by" / "signed by" render adapter | The verifier-side adapter that reads `metadata.filer` + the signer's `AuthoredSignature` and renders the capacity-discipline copy per §5. Adopter-styled per their UI conventions; the render contract is the constant. |
| Filer-session opt-in entry-point | The UI affordance that surfaces "I'm filling this for someone else" at form-load when posture == "allowed". Required for `allowed` (so users can opt-in); SHOULD redirect immediately to filer-session-mode for `required` (no choice); SHOULD be absent for `forbidden`. |
| Per-section review affordance at signer ceremony (renderer-class) | Per §3.3 — the reference renderer SHOULD surface a non-skippable acknowledgement of each filer-pre-filled section before the signing CTA enables. **Renderer-class, NOT substrate-class** — non-reference renderers can satisfy the rest of the FW-0037 contract while skipping this affordance. Substrate-level enforcement is filed as FW-0107 (§6.9). The reference renderer's gate-existence + non-skippability are the in-renderer constants. |

**Why not invent more port surfaces here.** Per ADR-0009 §(b) the bar is consumer code, not predicted-need. The `SignerHandoff` port is the load-bearing decision because its adopter-shape varies and its absence is detectable at form-load (without it, the `required` posture cannot satisfy); other surfaces fall out at build time when the React shell is co-implemented.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a flat `preparerFiling` block (per code-review F6 split-keys — no sub-block; FW-0042's `trustedReviewer` lands as an independent sibling key):

```text
preparerFiling?: {
  posture: "forbidden" | "allowed" | "required"
  allowedRoles: ReadonlySet<string>              // org-policy filter on filer roles
  allowedHandoffMethods: ReadonlySet<string>     // org × form intersection
  filerAssuranceFloor?: AssuranceLevel           // per-form; defaults to signer's
  respondentOnlyFieldPointers: ReadonlyArray<string>  // RFC 6901 pointers; per-form
  signerHandoffBindingRef?: string               // URN of the wired SignerHandoff adapter (REQUIRED when posture != "forbidden")
}
// FW-0042 (reviewer-only) lands as a sibling KEY `trustedReviewer?: {...}` — not a sub-block of preparerFiling.
// One key per feature; FW-0042 owns its own resolved-profile shape independent of FW-0037.
```

**Invariant (per code-review LOW F9 → `preparerFiling` validation gap).** Resolved `allowedRoles` MUST be the intersection of form-policy `allowedRoles`, org-policy `allowedRoles`, and instance-capability `allowedRoles` (a deployment-extensible set). The resolver computes this intersection at form-load; runtime asserts the result is non-empty before activating the filer flow (an empty intersection is a `FeaturePolicyConflictError` per §7.1 — no filer role is allowed across all three layers, so the `posture: "allowed" | "required"` flow has nothing it can offer). The intersection invariant also applies to `allowedHandoffMethods` symmetrically.

The block is the resolver's read-only output. The shell consults `posture` at form-load (renders the opt-in entry-point unless `forbidden`); `allowedRoles` (constrains the role-picker UX); `allowedHandoffMethods` (constrains the handoff method offered at filer-session end); `filerAssuranceFloor` (drives the filer-session IdP assurance gate); `respondentOnlyFieldPointers` (drives the per-field masking in filer-session); `signerHandoffBindingRef` (the substrate the form-load surface trusts for handoff orchestration).

**Sensitive-data discipline:** the resolved profile contains no filer identity material, no in-flight submission data, no field values. The profile is recomputable from the instance + org + form policy without consulting any filer action.

## 5. Verifier rendering contract

The verifier reads `metadata.filer` + the signer's `AuthoredSignature` and renders the filer-vs-signer distinction. Per AP-023, capacity, not truth.

**Rendering rules:**

1. **Ambient capacity-discipline copy.** Near the submission timestamp, render: `filed by [filer-name] · signed by [signer-name]`. When `metadata.filer` is absent, render `signed by [signer-name]` only (the standard self-fill case). The phrasing uses capacity vocabulary ("filed by", "signed by", "ready for review by") — NOT truth vocabulary ("certified", "approved by", "guaranteed").
2. **Temporal-ordering display.** When `metadata.filer.sessionCompletedAt` and `AuthoredSignature.signedAt` are both present, render the ordering (e.g., "Filed 2026-05-23 09:14; signed 2026-05-23 14:32"). When the gap is very tight (under 60s), render normally (don't flag — tight ordering is the canonical family-helper / same-device case).
3. **Per-field provenance.** Fields listed in `metadata.filer.fieldsAuthored` render with a "Filed by [filer-name]" badge (subtle, ambient, expandable on hover/focus). Fields not in the list render without a filer badge (signer typed those).
4. **Handoff method.** OPTIONAL informational chip ("Handoff: distinct-device short link") visible in audit-detail view; hidden in default verifier view to avoid clutter. Adopter-styled.
5. **Filer-identity-claim disclosure.** The filer's `identityBinding.authMethod` is renderable on demand (expandable); same convention as the signer's identity binding. Adopter rendering convention.
6. **Per AP-023 vocabulary firewall.** The verifier MUST distinguish *integrity* (bytes unchanged), *attribution* (the filer was named in submission; the signer-key signed), *capacity* (the signer was acting in capacity `self`; the filer was acting as a named filer), and *truth* (the underlying facts). The verifier attests to the first three; never the fourth. The "filed by" copy is capacity-attribution; the "signed by" copy is capacity-attribution + integrity. **No verifier copy says "verified as correctly filed."**

## 6. Cross-stack dependency chain

### 6.1 The chain

```
FW-0037 design (this doc)
    ↓
new EXT-N (formspec) — metadata.filer carrier on Response schema
    ↓
ADR-0011 amendment (small) — split reviewerPreparer umbrella into sibling keys
                              preparerFiling (FW-0037) + trustedReviewer (FW-0042 future)
                              per code-review F6 (one-key-per-feature precedent preserved)
    ↓
FW-0037 build (formspec-web) — when an adopter deployment needs the flow
```

**This is the lightest slice-1 cross-stack chain of any post-MVP design row to date (per code-review F2 — slice-1 honesty, not architecture-final; see §6.4 disclaimer for the WOS-side future).** No new XS-N cross-stack ADR for slice 1 (the substrate is byte-neutral for Trellis; WOS has no `human-filer` actor extension in slice 1 — see §6.4; PKAF is distinct scope). Lighter than XS-5 / XS-6 (which were primarily confirmation ADRs); FW-0037 slice 1 needs no confirmation ADR because the slice-1 substrate ownership is unambiguous: Formspec owns `metadata.filer` (new); ADR-0011 owns the `preparerFiling` capability key (small amendment splitting the `reviewerPreparer` umbrella per code-review F6 — see §4.1).

### 6.2 EXT-N (new) — `metadata.filer` carrier on Response schema

**Proposed for upstream extension queue.** New EXT entry. The shape is per §3.2.

**Schema land:** `formspec/schemas/response.schema.json` `Response` envelope gains an optional `metadata.filer?: FilerRef` block. `FilerRef` is a new `$def` per §3.2. Conditional: nothing; the carrier is optional always. Validation rules: `filerId` URN format; `sessionCompletedAt > sessionStartedAt`; `fieldsAuthored[*]` RFC 6901 format.

**Fixture matrix:** the EXT-N fixture set MUST include:
1. Single-filer canonical case (paralegal + client; one filer per submission).
2. Filer-session-with-no-fields-authored (filer navigated but typed nothing; signer typed everything).
3. Filer + safe-* composition (filer omits safe-* fields; signer fills safe-* at ceremony).
4. Filer + per-field `respondentOnly` composition (filer omits respondent-only fields; signer fills them at ceremony).
5. Filer + multi-party composition (per-party filer; one filer per party; per FW-0050 §7.1).
6. Filer + tight-temporal-ordering (family-helper case; T2 - T1 < 60s; verifier renders normally, doesn't flag).
7. Filer-session-incomplete + signer-signs — **two sub-cases per code-review MED F8 (suppression-by-tab-close fix):**
   - **7a.** Filer authored ZERO fields AND signer == draft-owner (self-fill fall-through): `metadata.filer` MUST be absent; verifier renders `signed by [signer]` only.
   - **7b.** Filer authored AT LEAST ONE field AND signer ≠ draft-owner: `metadata.filer` MUST materialize with partial filer record (e.g., `sessionCompletedAt: null` sentinel or last-mutation timestamp; `handoffMethod: "abandoned-before-handoff"`; `fieldsAuthored[]` reflects what the filer typed). Suppression-by-tab-close is forbidden; verifier renders `filed by [filer] · signed by [signer]` to preserve the "who typed this" audit guarantee.
8. Filer-with-distinct-IdP-from-signer (filer authenticated via IdP A; signer via IdP B; both bindings captured).
9. Negative: `filerNotSigner: forbidden` form-policy + `metadata.filer` present in submission (verifier surfaces a form-policy violation; the submission is structurally invalid).
10. Negative: `metadata.filer.filerId == AuthoredSignature.signerId` (filer-equals-signer is a self-fill; `metadata.filer` should be absent; verifier surfaces a structural-coherence warning).

### 6.3 No XS-N cross-stack ADR required

FW-0037 is structurally a Formspec-only design — Trellis is byte-neutral (`metadata.filer` rides as response metadata through the standard chain unchanged); WOS has no filer-actor extension needed (the signer is the WOS-visible actor; the filer is invisible to WOS governance per §1.2 non-goal); PKAF is distinct scope (`AILineage` is assertion-side; filer-side has no PKAF analog).

**Subsystem-count honesty.** Only Formspec ratifies anything beyond the current substrate (EXT-N for `metadata.filer`). ADR-0011 amendment is a small clarification (one paragraph naming the two sub-flows). **No new cross-stack ratification path.** Smallest slice-1 cross-stack footprint of any post-MVP design row to date (per §6.4 slice-1 disclaimer — architecture-final footprint depends on whether a future row promotes per-filer-actor WOS governance) — even lighter than FW-0036 (which closed one EXT-5 payload; FW-0037 introduces one EXT-N carrier).

### 6.4 What FW-0037 ratifies standalone (slice 1 honesty)

**Slice-1 footprint disclaimer (honest demotion per code-review F2).** The "smallest cross-stack footprint" claim earlier in this design (§6.3, EXT-36 closure prose) was overclaiming — it was true for **slice 1 only**, not architecture-final. If a future build deployment needs per-filer-actor WOS governance — e.g., a CPA-as-filer flow needing PTIN binding and ABA Model Rule 5.3 supervision audit, a clinic-staff-as-filer flow needing HIPAA-PHI per-filer access scoping, a court-paralegal flow needing per-paralegal capability scoping — a follow-on WOS-side row will file an `actorExtension` for `human-filer` and a sibling XS-N to confirm the formspec-side `metadata.filer` ↔ WOS-side actor mapping. The current scope-statement is **slice-1-honest, not architecture-final**.

### 6.9 Future row — FW-0107 substrate-class acknowledgement carrier (honest demotion follow-on)

**Tracked as `FW-0107` in [PLANNING.md](../../PLANNING.md).** The per-section review affordance in §3.3 / §4.2 is renderer-class (formspec-web reference renderer enforces; non-reference renderers MAY skip). FW-0107 is the substrate-class upgrade: extend EXT-36 with `metadata.filer.acknowledgedSections: ReadonlyArray<{sectionId: string; acknowledgedAt: string}>`; form-policy gate at submit enforces non-empty + coverage matches Definition section grouping; verifier-side check enforces the same. **Blocked on:** a real coercion incident in the wild OR an adopter request to harden the affordance into a substrate guarantee. Until the trigger fires, layer (b) remains a renderer-class enhancement, layers (a)+(c)+(d)+(e) carry the substrate-class AP-014 defense per §2.3.4.



**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `preparerFiling` capability key + resolved-profile shape (flat) per §4.3 — split from the `reviewerPreparer` umbrella per code-review F6.
- The `SignerHandoff` port shape per §3.3.
- The verifier rendering contract per §5.
- The runtime invariants binding form-load failure semantics to ADR-0011 typed errors (§7.1).
- The composition rules with FW-0042 (§6.1), FW-0048 (§6.2), FW-0049 (§6.3), FW-0050 (§6.4), FW-0034 (§6.5), FW-0030 (§6.6 informational), FW-0058 (§6.7 vocabulary firewall), FW-0051 (§6.8 composition note).
- The adopter contracts per §4.2.

**Waits on upstream:**

- EXT-N ratification for the `metadata.filer` carrier shape.
- ADR-0011 amendment splitting the `reviewerPreparer` umbrella row at line 150 into sibling keys `preparerFiling` (FW-0037 scope) + `trustedReviewer` (FW-0042 future scope), per code-review F6 — see §4.1 for the exact amendment proposal text. Small edit; expected to land with this design's owner-ratification.
- FW-0042 is no longer coupled at the capability-key shape (independent sibling key `trustedReviewer` per F6); FW-0042 is currently `open` status, awaiting its own design work which can proceed in parallel.

## 7. Failure semantics

### 7.1 Form-load failures

| Condition | Error per ADR-0011 |
|---|---|
| Form requires `filerNotSigner` (form-policy `required`) but instance lacks `SignerHandoff` adapter | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `filerNotSigner` but org policy forbids the feature for the form's template class | `FeaturePolicyConflictError` at form-load |
| Form forbids `filerNotSigner` (form-policy `forbidden`) but org policy requires it for the template class | `FeaturePolicyConflictError` at form-load |
| Form-policy declares `filerAssuranceFloor` higher than the instance's IdP can deliver | `InvalidRuntimePolicyError` at form-load |
| Form-policy declares `allowedHandoffMethods` outside the instance's supported set | `InvalidRuntimePolicyError` at form-load |
| Form-policy declares `respondentOnlyFieldPointers` referencing fields not in the form's Definition | `InvalidRuntimePolicyError` at form-load |

**Silent downgrade is forbidden.** A form requiring `filerNotSigner` MUST fail-load on an instance without the substrate. Falling back to "self-fill only" silently would violate the form's required-capability contract.

### 7.2 Filer-session failures

| Condition | Behavior |
|---|---|
| Filer attempts to write into a `respondentOnly: true` field | Rendering disables input; per §3.4 the field is masked + non-writable in filer-session. No error event; structural prevention. |
| Filer attempts to invoke `SignerHandoff.initiate` with a `handoffMethod` not in form-policy `allowedHandoffMethods[]` | Typed `InvalidHandoffMethodError`; the handoff CTA UI gates by available methods so this should not be user-reachable, but defensive at the API layer. |
| Filer's IdP session expires mid-fill | Standard IdentityProvider port session-recovery; filer re-authenticates; submission state preserved per existing draft mechanisms. |
| Filer's session ends without invoking `SignerHandoff.initiate` (e.g., closes the tab) | The partial fill is preserved as a draft per existing FW-0001 mechanisms. **Suppression-by-tab-close is forbidden per code-review MED F8:** if **any field was authored in the filer session** AND **the signer's authenticated identity differs from the draft-owner identity**, `metadata.filer` MUST materialize with the partial filer record at submit (e.g., `sessionCompletedAt: null` sentinel — or, where the substrate prefers a non-null value, the RFC 3339 timestamp of the last filer mutation; `fieldsAuthored[]` reflects whatever the filer typed; `handoffMethod` records `"abandoned-before-handoff"`). Letting a predatory filer erase their trail by closing the tab violates the "who typed this" audit guarantee that FW-0037 substrate exists to provide. **If no field was authored in the filer session** (the filer navigated but typed nothing) **OR the signer authenticates as the same identity as the draft-owner** (self-fill fall-through), `metadata.filer` is elided — there is no filer-attribution claim to record. Signer can resume via standard draft-resume flow; the materialization gate is **(filer mutations > 0) AND (signer ≠ draft-owner)**. |

### 7.3 Signer-ceremony failures

| Condition | Behavior |
|---|---|
| Signer attempts to invoke the signing CTA without acknowledging all filer-pre-filled sections | In the formspec-web reference renderer, the UI gates the CTA per §3.3 — renderer-class affordance, not substrate-class. Non-reference renderers MAY skip the gate; substrate carries no enforcement today. No error event in the reference renderer; structural prevention only within that renderer. Substrate-carrier upgrade tracked at FW-0107 (§6.9). |
| Signer's authentication session has a lower assurance than the form's signer-assurance floor | Standard IdentityProvider port step-up flow per existing FW-0030 mechanisms; unrelated to FW-0037. |
| Signer authenticates as a different identity than the filer's declared "ready for [signer-id]" target (handoff target mismatch) | Typed `HandoffTargetMismatchError`; the redeemed handoff token doesn't match the signer's authenticated identity. The session is rejected; the form-load surfaces the error and offers the signer to start a fresh self-fill submission OR contact the filer for a new handoff. |
| Signer's submission carries `metadata.filer.filerId == signerId` (filer-equals-signer) | Typed `StructuralCoherenceWarning` (not Error); the submission is technically valid (the same person filled and signed), but `metadata.filer` should be absent in the self-fill case. The runtime SHOULD elide `metadata.filer` from the submitted Response on this condition (silently rewrite to `metadata.filer = undefined`) to avoid the structural-coherence warning at verify time. |

### 7.4 Verification-time failures

| Condition | Behavior |
|---|---|
| Submission carries `metadata.filer` but form-policy is `filerNotSigner: forbidden` | Verifier reports `FormPolicyViolation` — the submission was filed against the form-policy gate. The receipt is structurally invalid; the signature integrity may still hold but the submission MUST NOT be treated as honoring the form's policy. |
| Submission carries `metadata.filer` but `metadata.filer.identityBinding` cannot be resolved | Verifier reports `FilerIdentityUnresolvable` (informational) — the filer was named but their identity-claim cannot be cryptographically resolved at verify time. The signer's signature is unaffected; the filer-attribution is unverifiable-capacity per AP-023 (capacity claim cannot be substantiated). |
| Submission carries `metadata.filer.sessionCompletedAt > AuthoredSignature.signedAt` (filer "finished" AFTER signer signed) | Verifier reports `TemporalCoherenceViolation` — the filer-session timestamps are inconsistent with the signer's signing event. The receipt is structurally invalid. |

## 8. Hard binding to other FW rows

### 8.1 FW-0042 — Share-draft-with-trusted-reviewer (split sibling key `trustedReviewer` per code-review F6)

FW-0042 is the **reviewer-only** sibling. The reviewer can READ + COMMENT but cannot AUTHOR or SIGN. FW-0037 is the **preparer / filer** flow — the filer can READ + AUTHOR + HANDOFF, but cannot SIGN.

**Split capability keys (revised per code-review HIGH F6).** Per §4.1, the original ADR-0011 `reviewerPreparer` umbrella row at line 150 decomposes into two **sibling keys**, one per feature — NOT a shared key with named sub-blocks:

- **`preparerFiling`** (FW-0037) — three-tier `posture: forbidden | allowed | required` per §3.1; resolved-profile shape per §4.3.
- **`trustedReviewer`** (FW-0042 future design) — shape owned entirely by FW-0042; not pre-committed by this row.

**Why split (not shared sub-blocks).** Every other `RUNTIME_FEATURE_KEYS` entry is one key per feature. A shared key with named sub-blocks (`reviewerPreparer.preparerFlow` + `reviewerPreparer.reviewerFlow`) would be NEW shape with no precedent — and it would pre-commit FW-0042's architecture (specifically the sub-block convention and the sibling-naming) before FW-0042's design starts. The split preserves the one-key-per-feature discipline; FW-0042 gets full design freedom.

**Composition:** the same submission MAY have BOTH a filer (paralegal fills) AND a reviewer (supervising attorney reviews) before the respondent signs. The two roles are independent at the FEATURE layer — `preparerFiling` and `trustedReviewer` are independent resolved-profile keys; resolution is independent; the two carriers (`metadata.filer` + `metadata.reviewers[]` if FW-0042 proposes one) coexist without interference.

**Cross-row touch.** FW-0042 row body updated to drop the shared-key framing — `trustedReviewer` is FW-0042's own sibling capability key, NOT a sub-block of FW-0037's key. FW-0042's future design owns the `trustedReviewer` shape + reviewer-side carrier; FW-0037 does NOT pre-empt FW-0042's design at the capability-key layer or any sub-block convention.

### 8.2 FW-0048 / FW-0059 — Coercion-aware signing (load-bearing composition for AP-014)

FW-0037 is the canonical AP-014 coercion vector in the corpus (a "helpful preparer" is the textbook coercion shape). The composition is load-bearing.

**Composition rules.**

1. **High-coercion template default-forbidden.** Forms in FW-0048's high-coercion-risk template set ([FW-0048 §6.4](2026-05-23-fw-0048-coercion-aware-signing-design.md): financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect) default `filerNotSigner: forbidden`. The default may be overridden per-deployment, but the default holds.
2. **Signer-only duress affordance.** When `filerNotSigner: allowed` AND `duressAware: required` are both declared, the duress affordance per FW-0048 §3 (dual-credential mechanism) is rendered ONLY in the signer-ceremony surface — NOT in the filer-session. The filer never sees the duress affordance; the signer can invoke it during their review.
3. **Per-section review affordance is a RENDERER-class enhancement, not a structural mitigation (honest demotion).** Per §3.3 + §2.3.4(b), the signer ceremony's per-section acknowledgement is enforced by the formspec-web reference renderer but is BYPASSABLE by non-reference renderers — the substrate carries no `acknowledgedSections` evidence today, no verifier-side check. The duress affordance per FW-0048 IS a substrate-class AP-014 mitigation; FW-0037's substrate-class composition with FW-0048 is the duress channel, the high-coercion default-forbidden gate (§6.4), and the form-load enforcement — not the per-section affordance. Substrate-carrier upgrade is filed as FW-0107 (§6.9); blocked on real coercion incident or adopter request.
4. **Asymmetric assurance.** For high-coercion templates, form-policy SHOULD require IAL2+ for the signer regardless of the filer's assurance level (a low-assurance filer cannot use FW-0037 to lower the bar for the signer).

**Cross-row touch.** FW-0048 design's §7 (per-row composition) gets a sibling note for FW-0037 — the canonical AP-014 vector; default-forbidden for high-coercion templates; signer-only duress; per-section review affordance is a **renderer-class enhancement, NOT a structural mitigation** (per §2.3.4 / §3.3 / §6.9; FW-0107 tracks the substrate-class upgrade). **Load-bearing touch on the substrate-class layers (a)+(c)+(d)+(e).**

### 8.3 FW-0049 / FW-0060 — Safe-address composition (per-field filer disclosure)

Safe-* class fields default to respondent-only-fillable per §3.4 + §6.3 composition. The filer doesn't see the plaintext; the field renders masked in the filer-session and unmasks at signer-review.

**Composition rule.** When `accessControl.class` starts with `safe-*` (per FW-0049 §3.1 taxonomy: `safe-address`, `safe-contact`, `safe-employer`), the field is treated as `respondentOnly: true` AUTOMATICALLY, regardless of form-policy `respondentOnlyFieldPointers[]`. The two mechanisms compose:

- `respondentOnlyFieldPointers[]` is form-policy-declared per-field.
- Safe-* class auto-marking is class-derived per FW-0049 mask discipline.
- The union of the two is the filer-non-fillable set.

**Cross-row touch.** FW-0049 design's §7 gets a sibling note for FW-0037 — safe-* mask survives filer's read; filer-fillable taxonomy auto-marks safe-* as respondent-only. **Load-bearing touch.**

### 8.4 FW-0050 / FW-0061 — Multi-party composition (per-party filer)

In a multi-party flow, each party MAY have its own filer (paralegal fills Party A's section; Party A signs; Party B may have a separate filer or may self-fill).

**Composition rule.** Slice 1 supports per-party filer via `metadata.filer` being per-PARTY-scoped: when the form declares `multiParty` AND `filerNotSigner: allowed`, the carrier shape becomes `metadata.filers: ReadonlyArray<FilerRef & {partyRef: string}>` (each filer carries a `partyRef` binding it to one party). Single-party flows keep `metadata.filer?: FilerRef` (no array, no `partyRef`).

**Per-party scope holds.** Per FW-0050 §7.1, per-party visibility applies — Party A's filer doesn't see Party B's fields. The filer-session opens scoped to one party; the handoff routes to the corresponding party's signer.

**Cross-row touch.** FW-0050 design's §7 (other FW interactions) gets a sibling note for FW-0037 — per-party filer composition; `metadata.filers[]` shape extension for multi-party; the per-party-visibility primitive covers naturally. **Light touch; informational** — no FW-0050 substrate change required.

### 8.5 FW-0034 / FW-0038 — Honest-correction (filer-driven correction)

A respondent who signed a filer-filed form MAY later need a correction. Two cases:

1. **Respondent-solo correction.** The original filer is not involved; respondent corrects + re-signs solo. `metadata.filer` is absent on the correction event.
2. **Filer-assisted correction.** Same filer (or a new filer) helps; respondent re-signs. The correction event carries its own `metadata.filer` (new filer-session).

**Per-form policy `correctableFilerPosture: same | same-or-new | respondent-only`** declares the rule. Defaults to `same-or-new` (most permissive); high-coercion templates default to `respondent-only` (the correction MUST be filed by the respondent themselves to prevent re-coercion).

**Cross-row touch.** FW-0034 design's §7 (cross-row composition) gets a sibling note for FW-0037 — filer-assisted correction composition; per-form `correctableFilerPosture` declaration; per-event `metadata.filer` rides naturally. **Light touch.**

### 8.6 FW-0030 — Federated identity (filer-identity binding)

The filer's identity binding rides the same IdentityProvider port per [web ADR-0007](../adr/0007-identity-provider-port.md) as the signer's. No new substrate; SC-4 + EXT-8a generalize to filer identities identically.

**Cross-row touch.** FW-0030 row body gets a sibling note for FW-0037 — filer-identity rides the same identity substrate; no new IdP integration required; per-form asymmetric assurance is form-policy-declared per §3.5. **Informational touch; no FW-0030 substrate change.**

### 8.7 FW-0058 — AI-agent filer (vocabulary firewall; load-bearing distinction)

**FW-0037 is HUMAN-filer / human-signer; FW-0058 is AI-filer / AI-signer (non-human capacity).** The two rows are easy to confuse but architecturally distinct. The vocabulary table mirrors FW-0058 §7.7 with the third-leg framing:

| Axis | FW-0037 (human filer) | FW-0058 (AI-agent filer) | FW-0051 (BYO-assistant) |
|---|---|---|---|
| Who fills the form | A human filer (different person from signer) | An AI agent (non-human) | A human respondent (the signer themselves), assisted by AI |
| Who signs the form | A human respondent (the signer; capacity `self`) | The AI agent (non-human capacity: `ai-agent`) | The human respondent (same as filler; capacity `self`) |
| Capacity on AuthoredSignature | `self` (unchanged from non-filer flow) | `ai-agent` + `agentChain` block (EXT-3) | `self` (no AI on the signature) |
| Submission carrier | `metadata.filer` (FW-0037 — this design) | `agentChain` on `AuthoredSignature` (FW-0058) | `metadata.provenance[path].attestedBy: respondent, sourceRef: assistant-suggested` (EXT-2) |
| Form policy key | `preparerFiling.posture` (split from `reviewerPreparer` umbrella per code-review F6 — see §4.1) | `aiAgentFiler` | `bringYourOwnAssistant` |
| Substrate | New `metadata.filer` carrier (EXT-N); no signer-side change | WOS `ActorKind::Agent` + `AgentInvoker` port + `capabilityInvocation` provenance + EXT-3 `agentChain` | Existing Assist Provider spec; per-field EXT-2 provenance |
| Trust model | Filer is a named party with separate identity; signer attests | AI is registered actor in WOS workflow; deontic constraints from WOS AI Integration apply | Assistant is untrusted by form; respondent attests per-field |
| Threat focus | AP-014 coercion (filer steers signer) | Prompt-injection (compromised AI) + capacity-spoofing (forged human credentials) | Per-act respondent rejects suggestion |
| GDPR Article 22 | Not applicable — human signer is the decision-maker | Implicit via `agentChain` presence on receipt | Not applicable — human respondent decides per-field |

**Compositions of the above (code-review F1 — three-leg table reads as exhaustive on its own; the fourth shape sits at the composition layer).**

| Composition | Realistic scenario | Where it lives |
|---|---|---|
| FW-0037 ⊕ FW-0051 | CPA-as-filer uses AI tax-prep software that proposes values, CPA confirms per-act, then hands off to taxpayer-as-signer who reviews and signs. | Filer's session activates FW-0051 BYO-assistant (the FILER is the assistant's per-act confirmation user, per §8.8); signer's session capacity stays `self`; EXT-2 per-field provenance records assistant-suggested values; `metadata.filer` records the human CPA. **The "fourth shape" the three-leg table reads as missing — it is a composition of two legs, not a separate leg.** |
| FW-0037 ⊕ FW-0058 | (structurally absent by construction) | The filer in FW-0037 is human-by-definition; an AI-agent filer is the FW-0058 case (capacity `ai-agent`). There is no composition where the filer is BOTH human and AI in the same session, because each leg's "who fills" axis is mutually exclusive with the other's. The FW-0058 + FW-0037 row in §8.7's table reflects this correctly — **the rows do NOT compose at the filler axis**, even though they each compose separately with FW-0051. |
| FW-0058 ⊕ FW-0051 | AI agent (FW-0058) consults an external assistant (FW-0051) during its own fill, then signs as `ai-agent`. | Per FW-0058 §7.7 — deferred for slice 1 (FW-0051 §7.6). Vocabulary holds (the AGENT is the assistant's per-act confirmation user in this composition). |

**Why the table needs the composition sub-table:** the three legs are mutually-exclusive *at the filler axis* (human filer / AI filer / no separate filer); the *assistant axis* is orthogonal — FW-0051 composes with either filler axis. The original three-row table without this sub-table is honest about the three legs but reads as exhaustive of the FW-0037/FW-0051/FW-0058 universe, which is wrong: the universe is `(filler axis) × (assistant axis)` and the canonical CPA-with-AI-tax-software case is FW-0037 ⊕ FW-0051, not any single leg.

**FW-0058 + FW-0037 do NOT compose at the filler axis** (an AI agent IS the signer in FW-0058; there is no human-filer + AI-signer shape because the AI is the signer not the helper). **All three rows DO compose pairwise with FW-0051** at the assistant axis. Per §1.2 non-goals, the cross-leg compositions are deferred for slice 1; vocabulary stays clean.

**Cross-row touch.** FW-0058 design's §7.7 already names the AI vs human distinction; FW-0037 design's §6.7 reciprocates with the three-way framing table. **PLANNING.md cross-link bilaterally updated.**

### 8.8 FW-0051 — BYO-assistant (composition note)

A human filer (FW-0037) may use a BYO AI assistant (FW-0051) during their fill session. The filer is the assistant's "user"; the assistant's per-field provenance (EXT-2) carries `attestedBy: respondent` where `respondent` here means the filer (the assistant's per-act confirmation user), not the signer.

**This is subtle but coherent.** The EXT-2 `attestedBy: respondent` field names "the human who confirmed the assistant's suggestion" — in a self-fill flow that's the signer; in a filer-flow that's the filer (who is the per-act confirmation user even though they're not the signer). The composition deferred for slice 1 per §1.2 non-goals.

**Cross-row touch (light).** FW-0051 design's §7 gets a sibling note for FW-0037 — composition deferred; vocabulary clean (filer is the assistant's per-act confirmation user; signer is the form's attestation user). **Light touch.**

## 9. Open questions / deferrals

Honest list of what FW-0037 design does NOT resolve:

1. **Per-jurisdiction filer-role legal verification.** Whether a "paralegal" is recognized by a court, whether a "navigator" is recognized by a state Medicaid agency, etc. Per §1.2 non-goal — substrate-layer concern; deployments verify.
2. **Multi-hop filer chains (filer A → filer B → signer).** Single-filer per submission only in slice 1. Future row or future EXT-N revision can extend.
3. **Filer-session ledger event taxonomy.** Per Q2 — submission-level `metadata.filer` is load-bearing; per-act events (e.g., `filer.session-opened` / `filer.handoff-completed`) deferred to build row.
4. **WOS filer-actor governance.** No `human-filer` actor extension proposed. Future WOS-side row if a deployment needs per-filer governance.
5. **FW-0051 composition (filer uses BYO assistant).** Per §6.8 + §1.2 — deferred; the per-field provenance vocabulary holds when slice 2 picks it up.
6. **Handoff target-mismatch UX.** Per §7.3 — `HandoffTargetMismatchError` typed error; UX for the recovery flow (signer offered to start fresh OR contact filer) deferred to build.
7. **Reference adapter for the `SignerHandoff` port.** Port shape lands here; reference adapters land with build per §4.2.
8. **Long-form filer audit trail UX.** Verifier rendering for filer-session audit trail (expandable detail view) deferred to build per §5 informational chip.
9. **Cross-deployment filer-identity portability.** A filer registered with one deployment may or may not be recognized by another. Per §1.2 non-goal; substrate-layer concern.
10. **Asymmetric assurance enforcement integration with FW-0030.** Per §3.5 + §6.6 — form-policy `filerAssuranceFloor` is declared; the IdP integration is FW-0030 substrate. Build-time coordination.

## 10. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: three-tier `forbidden \| allowed \| required` form-policy | PROPOSAL | owner review |
| Q2: submission-level `metadata.filer` carrier; single filer per submission | PROPOSAL | owner review + EXT-N filing |
| Q3: `SignerHandoff` port shape with three canonical reference adapters (deferred to build) | PROPOSAL | owner review + future build row |
| Q4: default-all-fillable + per-field `respondentOnly` opt-out; safe-* auto-marks | PROPOSAL | owner review + FW-0049 design author |
| `preparerFiling` capability key under ADR-0011 (split from `reviewerPreparer` umbrella per code-review F6 — one key per feature; amendment proposal text per §4.1) | PROPOSAL | owner review + ADR-0011 amendment |
| `metadata.filer` schema shape per §3.2 — new EXT-N to formspec | PROPOSAL to formspec | formspec spec-expert review + EXT-N ratification |
| Verifier rendering contract: ambient "filed by · signed by" capacity-discipline copy per AP-023 | PROPOSAL | owner review |
| Form-load failure semantics: typed errors per ADR-0011 | PROPOSAL | owner review |
| Filer-session failure semantics: `respondentOnly` masking + per-section review affordance (renderer-class per §2.3.4 / §3.3 / §6.9) | PROPOSAL | owner review |
| Signer-ceremony failure semantics: `HandoffTargetMismatchError`, `StructuralCoherenceWarning` (filer-equals-signer rewrite) | PROPOSAL | owner review |
| Verification-time failures: `FormPolicyViolation` / `FilerIdentityUnresolvable` / `TemporalCoherenceViolation` | PROPOSAL | owner review |
| Adopter contracts over SignerHandoff binding + IdP filer-session + verifier render + entry-point + per-section review affordance (renderer-class enhancement, not substrate guarantee per §6.9); port shape lands here for SignerHandoff per ADR-0009 §(b) exception | PROPOSAL | owner review |
| No new XS-N cross-stack ADR required — Trellis byte-neutral; WOS unchanged; PKAF distinct scope | PROPOSAL | owner review (verify cross-stack reviewer agrees) |
| Coercion composition per FW-0048 §6.4 (high-coercion default `forbidden`; signer-only duress; per-section review affordance is RENDERER-class, NOT substrate-class per §2.3.4 + §3.3 + §6.9; substrate-class AP-014 defense rests on layers (a)+(c)+(d)+(e); FW-0107 follow-on tracked) | PROPOSAL | owner review + FW-0048 design author |
| Safe-address composition per FW-0049 §3.3 (safe-* auto-marks respondent-only-fillable) | PROPOSAL | owner review + FW-0049 design author |
| Multi-party composition per FW-0050 §7.1 (per-party filer; `metadata.filers[]` extension when both keys enabled) | PROPOSAL | owner review + FW-0050 design author |
| Correction composition per FW-0034 (`correctableFilerPosture` form-policy field; filer-assisted correction rides `metadata.filer` per event) | PROPOSAL | owner review + FW-0034 design author |
| FW-0030 composition (filer-identity rides web ADR-0007 + SC-4 + EXT-8a substrate identically) | PROPOSAL | owner review |
| FW-0042 composition (SPLIT sibling keys per code-review F6: `preparerFiling` (FW-0037) + `trustedReviewer` (FW-0042 future); no shared sub-block convention; FW-0042 architecturally independent) | PROPOSAL | owner review + FW-0042 future design author |
| FW-0058 vocabulary distinction reciprocated (FW-0037 = human filer + human signer; FW-0058 = AI filer + AI signer) | PROPOSAL | owner review + FW-0058 design author |
| FW-0051 composition note (filer-uses-assistant; vocabulary holds; deferred for slice 1) | PROPOSAL | owner review + FW-0051 design author |
| AP-014 / AP-023 bindings codified | PROPOSAL | owner review |

**Row status change:** FW-0037 moves from `open` to `in design`. FW-0037 stays in design until this proposal is owner-ratified, ADR-0011 amends to split the `reviewerPreparer` umbrella into sibling keys `preparerFiling` + `trustedReviewer` per §4.1 (code-review F6), and EXT-36 ratifies with the `metadata.filer` shape.

## 11. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`preparerFiling` / `trustedReviewer` are post-MVP; this design stages for post-MVP)
- [web ADR-0007](../adr/0007-identity-provider-port.md) — identity provider port (filer-identity rides the same port)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §4.2 defers most port shapes to build per §(b); SignerHandoff is the load-bearing exception that lands here)
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (`reviewerPreparer` umbrella enumerated; split into `preparerFiling` + `trustedReviewer` sibling keys per code-review F6 — amendment proposal text at §4.1)
- [EXT-3 — `thoughts/specs/2026-05-22-upstream-extension-queue.md:46`](2026-05-22-upstream-extension-queue.md) — signer-side `capacity` enum (FW-0037 doesn't touch — respondent stays `self`)
- [FW-0042 — `PLANNING.md`](../../PLANNING.md) — reviewer-only sibling under split sibling key `trustedReviewer` per code-review F6 (no longer sharing umbrella `reviewerPreparer`)
- [FW-0048 design 2026-05-23](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-aware signing (composition seam at §6.2; canonical AP-014 vector)
- [FW-0049 design 2026-05-23](2026-05-23-fw-0049-safe-address-handling-design.md) — safe-address handling (composition seam at §6.3; safe-* auto-marks respondent-only)
- [FW-0050 design 2026-05-23 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party (composition seam at §6.4; per-party filer)
- [FW-0034 design 2026-05-24](2026-05-24-fw-0034-honest-correction-path-design.md) — honest correction (composition seam at §6.5; `correctableFilerPosture`)
- [FW-0058 design 2026-05-24 §7.7](2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — AI-agent filer (vocabulary firewall reciprocated at §6.7; three-way framing table)
- [FW-0051 design 2026-05-23](2026-05-23-fw-0051-bring-your-own-assistant-design.md) — BYO-assistant (composition note at §6.8; filer-uses-assistant deferred)
- [FW-0030 — `PLANNING.md:441`](../../PLANNING.md) — federated identity (composition seam at §6.6; informational)
- Source brief: [`thoughts/sketches/2026-05-24-fw-0037-filer-not-signer-research-brief.md`](../sketches/2026-05-24-fw-0037-filer-not-signer-research-brief.md)
- Journey: [J-012 in `JOURNEYS.md:343`](../../JOURNEYS.md)
- Anti-patterns: [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-023 in `JOURNEYS.md:185`](../../JOURNEYS.md)
- External prior art: IRS Form 1040 Paid Preparer; IRS Form 8879 e-file Signature Authorization; ABA Model Rule 5.3; HIPAA pre-visit intake (Phreesia, Klara, EHR portals); GOV.UK "I'm helping someone" patterns; CMS Marketplace "Application Filer" role; USCIS Form G-28 Notice of Appearance; NIST SP 800-63-3; W3C Verifiable Credentials Data Model 2.0
