# FW-0036 — Humane bot protection (no puzzles as default): design proposal

**Date:** 2026-05-24
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q7 are open until accepted.
**Row:** [FW-0036 in `PLANNING.md:491`](../../PLANNING.md) (design).
**Journey:** [J-033 in `JOURNEYS.md:601`](../../JOURNEYS.md) — "let me prove I'm a person without making me prove I'm a robot."
**Anti-patterns:** [AP-019 in `JOURNEYS.md:161`](../../JOURNEYS.md) — MUST NOT default to puzzle CAPTCHAs.
**Feature key (proposed; NOT yet enumerated):** `botProtection` — ADR-0011 extension proposed in §4.1.
**Source brief:** [`thoughts/sketches/2026-05-24-fw-0036-humane-bot-protection-research-brief.md`](../sketches/2026-05-24-fw-0036-humane-bot-protection-research-brief.md). Upstream-primitive inventory, external prior art with URLs, threat scenarios, FW interactions live there; this doc decides over them.
**Substrate sources (load-bearing):**
- [EXT-5 in `thoughts/specs/2026-05-22-upstream-extension-queue.md:88`](2026-05-22-upstream-extension-queue.md) — `bot-protection-cleared` event type pre-allocated; payload shape deferred to this row.
- [web ADR-0011 Feature Ownership Table line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — capability shape FW-0036 extends.
- [web ADR-0009 §"Not in the constitutional inventory"](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — DI/port discipline this design's `BotProtectionAttester` port follows.
- [FW-0058 design §2.3.4](2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — already cites FW-0036 as layer (a) of the adversarial-agent defense; the AND-composition rule is reciprocated here.
- [FW-0028 design](2026-05-24-fw-0028-multi-idp-picker-design.md) — `CompositeIdentityProvider` is the substrate-primitive pattern this design's `CompositeBotProtectionAttester` mirrors.

Per [web ADR-0004 consume-not-invent](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web does not author the humanity-attestation substrate; the substrate lives in external standards (W3C WebAuthn, IETF Privacy Pass RFC 9576/9577/9578, vendor implementations). FW-0036 is a **consumer-side composition** — names the formspec-web `botProtection` posture, the `BotProtectionAttester` port contract (so adopters can wire any proof-of-personhood framework), the layered ladder, the verdict shape, the receipt-side event payload, and the cross-row composition rules with FW-0028 + FW-0058 + FW-0034.

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for **humane bot protection** — non-puzzle proof-of-personhood at the form-load / pre-submit boundary, with privacy preservation, accessibility, and a layered fallback ladder. Per [FW-0036 Done](../../PLANNING.md): bot protection is invisible to most humans; when the system can't tell, the user gets multiple accessible paths and is never trapped on a single inaccessible challenge. Deliverables: framing decisions (Q1–Q7); the `botProtection` capability contract proposed under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md); the `BotProtectionAttester` port contract (admits multiple proof-of-personhood frameworks); the layered ladder (Tier 1 device-attested through Tier 5 escape); the verdict-shape contract; the EXT-5 `bot-protection-cleared` event payload shape; the cross-row composition rules with FW-0028 (multi-IdP picker) + FW-0058 (AI-agent filer) + FW-0034 (correction lifecycle); the failure semantics for `botProtection: forbidden | allowed | required` per ADR-0011; the open questions that remain for the build row.

This is a **design row**. The deliverable is a doc plus the EXT-5 payload closure, not code. The build row is a future follow-on (not yet filed; expected to materialize when an adopter wires a real attester family + EXT-5 ratifies + FW-0028 slice-2 production OIDC wiring stabilizes the "skip when identity-proofed" composition).

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. A future build row owns materialization.
- **Picking the default attester family.** Per §3.7 the framework ships with a `NullBotProtectionAttester` (always-human, dev/demo only) and an empty `[]` composite as the production default. **Adopters MUST opt into specific attesters** (Cloudflare Turnstile, Apple Private Access Tokens, hCaptcha Privacy Pass, FriendlyCaptcha PoW, etc.); the framework does not pick.
- **Inventing a new humanity-attestation primitive.** The substrate lives in W3C WebAuthn + IETF Privacy Pass + vendor APIs. FW-0036 is a port over those primitives.
- **Solving the WebAuthn-discovery / first-time-visitor UX problem.** A first-time visitor with no passkey enrolled cannot use Tier 1; the design falls through to Tier 2–3. "Make passkey enrollment effortless" is FW-0031 territory.
- **Defeating the determined nation-state adversary with real device farms.** Out of every web form's reach. §2.4 documents.
- **Legal compliance frameworks (CAN-SPAM, GDPR Article 22, ADA).** The design adheres to accessibility + privacy commitments; legal compliance per jurisdiction is the adopter's obligation.
- **Solving credential-stuffing or password-spray.** Those are identity-substrate concerns (FW-0028 / FW-0031 / FW-0030). FW-0036 covers the unauthenticated humanity gate; once a credential is presented, credential-substrate defenses take over.
- **Defeating coercion-by-instruction.** A coerced human IS a human; humanity attestation passes. Coercion-aware signing is FW-0048 / FW-0059 territory.
- **Specifying attester-vendor SLAs / pricing / vendor-selection guidance.** The port contract is vendor-neutral; adopters pick per their privacy, cost, regulatory, and existing-infrastructure constraints.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Trust boundary

**The form is the trust anchor for whether a submission proceeds**; the attester is OUTSIDE the trust boundary in the sense that the form does not blindly accept any attester's verdict — the resolved runtime profile names which attesters are wired, the verdict must come from a wired attester, and the verdict's transport is signed and tamper-evident per the receipt-side event (§4.4).

- The **form** trusts the **org-policy declaration** of which attester families are enabled.
- The **form** trusts a **wired attester's verdict** within the bounds of the attester's disclosed posture (§6 disclosure obligation).
- The **form** does NOT trust **any single attester's verdict in isolation** to make a security claim; composition with FW-0058's AND-composition holds (per FW-0058 §2.3.4 the bot-protection layer is one of five AND-composed defenses against the adversarial-scraper class).
- The **attester** runs in the user's browser (WebAuthn, Privacy Pass redemption) and/or the vendor's substrate (Turnstile, reCAPTCHA verification endpoint). The form has no visibility into the attester's internals beyond the disclosed posture and the wire-shape verdict.

**What the attester surface SEES:** the user's browser context, any tokens / claims the user's browser presents (passkey assertion, Privacy Pass token, Turnstile challenge response). Each attester's posture (§6) names exactly what it sees and what it transmits.

**What the attester surface DOES NOT see:** the form's content (the attester runs at form-load / pre-submit, NOT at field-fill); the user's identity (Tier 1–3 are anonymous attestation by design); other users' attestation history (per-vendor — Cloudflare doesn't share with Apple, etc.).

### 2.2 Attacker model

- **Attacker identity.** (a) A casual form-spam bot operator (the "spray everything" class); (b) a scraping bot operator collecting form text + structure for downstream analysis; (c) a sophisticated bot operator with headless browser + residential IP rotation + LLM-driven form filling (Cluely-class per research brief §3); (d) a paid-CAPTCHA-solver-using operator (the "AP-019 names this" class); (e) an unregistered AI-agent operator attempting to file without authorization (FW-0058 §2.3.4 territory).
- **Attacker goal.** Bypass the humanity gate to submit forms in bulk; exfiltrate form structure; consume issuer-side resources (rate-limit-exhaust); subvert downstream determination flows.
- **What the attacker observes.** Everything the public form's surface exposes — definition, references, ontology, the attester's choice-of-tier, the verdict-or-fail outcome. **NOT the attester's per-redemption secret** (the Privacy Pass token's blinded redemption proof, the WebAuthn challenge nonce, the Turnstile site-secret-keyed verification).
- **What the attacker cannot force.** (a) A WebAuthn user-present assertion without a real device + real user gesture (Tier 1). (b) A valid Privacy Pass token without prior issuer-side attestation (Tier 2). (c) A Turnstile non-interactive token without satisfying the Turnstile vendor's invisible-challenge model (Tier 3). (d) A Tier-4 tap-to-confirm without per-submit human interaction (limited by attacker's solving cost). **None of these are absolute**; per §2.4, the design rests on **layered defense composition** per FW-0058 §2.3.4, not on any single attester.
- **What the attacker knows.** Kerckhoffs-style — the attacker has read this design + the attester vendor docs + the form's policy. **The defense rests on per-attester structural mechanisms (WebAuthn user-present requires real device interaction; Privacy Pass requires unforgeable token redemption; Turnstile requires invisible-challenge satisfaction)** rather than on any single secret of the framework itself.

### 2.3 Three grounded scenarios

Each scenario gives: the setup, what FW-0036 must achieve, what this design's posture provides. (A fourth scenario, the adversarial unregistered agent, lives in §2.3.4 and reciprocates the FW-0058 composition.)

**2.3.1 Public form, no sign-in (canonical scenario).** A municipal benefits form on a public URL. Anyone can hit it. No identity, no session, no prior trust signal. The form's audience includes elderly, disabled, low-bandwidth, screen-reader, non-native-language respondents.
- **Required:** invisible-by-default humanity gate at form-load; never trap a user; full accessibility; escape-to-support is always reachable.
- **Design posture:** §3.1 form-policy `allowed` (the form accepts the gate; the gate runs invisible Tier 3 by default in the reference composition); §3.2 layered ladder runs Tier 1 → Tier 2 → Tier 3 invisibly; §3.4 Tier 4 (tap-to-confirm) and Tier 5 (escape) are accessible. **Canonical scenario; design optimizes for this.**

**2.3.2 Authenticated form (sign-in done first).** A healthcare-provider portal that requires login.gov sign-in at IAL2 before the form loads. The IdP's identity-proofing pipeline already gated humanity.
- **Required:** no double-gating; respect the user's time; do not subject IdP-verified respondents to a second humanity attester.
- **Design posture:** §3.1 form-policy `forbidden` is the standard posture for authenticated forms (the IdP did the work); the resolver synthesizes the "verdict: human-implied-by-identity-claim" without running any attester. **The form-policy tier is the dominant control here.** Adopters MAY override per-form (e.g., "even authenticated, this surface has been targeted by credential-stuffing — require Tier-1 fresh humanity"); the runtime supports it via the form-policy override per §3.1.

**2.3.3 Agent-friendly form (FW-0058 `aiAgentFiler: allowed | required`).** A procurement-automation form designed to accept AI-agent filings per FW-0058. The agent presents an agent-identity credential per SC-4 + EXT-8a.
- **Required:** humanity attestation MUST NOT fail-close a registered agent. The gate emits `"agent-registered"` and the submit boundary accepts.
- **Design posture:** §3.3 verdict shape includes `"agent-registered"` as a first-class verdict; §7.2 specifies the composition rule (the `BotProtectionAttester` port's resolver consults the FW-0058 substrate first when wired; registered agents short-circuit to `"agent-registered"`; the human-attester chain runs only for non-agent submitters). **Canonical inversion case; design supports directly.**

**2.3.4 Adversarial — unregistered scraping agent (reciprocates FW-0058 §2.3.4).** A scraping-bot operator deploys an LLM-backed agent to fill forms en masse via the public URL, without registering as an authorized agent.
- **Required:** structural defenses that hold against an adversarial unregistered agent at the bot-protection layer specifically, in AND-composition with FW-0058's identity-binding + form-policy + WOS-volume-caps + honest-credential layers.
- **Design posture:** **bot-protection is layer (a) of the FW-0058 §2.3.4 AND-composition.** Tier 1 (WebAuthn user-present) fails for a bot — no real device + no real user gesture. Tier 2 (Privacy Pass) fails for a bot — no prior issuer-side attestation. Tier 3 (Turnstile invisible) defeats casual scrapers; sophisticated scrapers (Cluely-class) MAY pass. Tier 4 (tap-to-confirm) is per-submit friction — defeats high-volume bots; bypassable at $0.50/solve via paid solver farms (AP-019 names this). **The composition rule per FW-0058 §2.3.4 holds: bypassing bot-protection (Tier 1–4) still leaves identity-binding + form-policy + WOS volume caps + honest-credential resolution.** Per FW-0058 §2.3.4 the layers are AND-composed; FW-0036 is layer (a). **The honest framing: FW-0036 alone cannot defeat the Cluely-class adversary; the composition does.**

### 2.4 Out-of-scope threat patterns

Named explicitly so the design isn't read as covering them:

- **Real device farms with rotating residential IPs.** Out of every web form's reach. Composition with FW-0058 + WOS volume caps + adopter-side infrastructure rate limiting (Cloudflare-level, WAF-level) is the realistic defense; FW-0036 alone does not cover.
- **Coercion-by-instruction.** A coerced human IS a human; humanity-attestation passes. Coercion-aware signing per FW-0048 is the defense; FW-0036 does NOT cover coerced fills.
- **Credential-stuffing / password-spray.** Identity-substrate concerns (FW-0028 / FW-0031 / FW-0030). Once a credential is presented, credential-substrate defenses take over.
- **Determined nation-state adversaries with custom hardware.** Out of every web form's reach.
- **Side-channel inference via attester timing or vendor-specific quirks.** A determined attacker could fingerprint the active attester via timing differences and select-target accordingly. Out of FW-0036's reach; attester-vendor concern.
- **Privacy leakage through naive fingerprinting attesters.** This is a real threat in vendor selection — adopters wiring naive "score-based" attesters opt into vendor fingerprinting. The port contract (§6) requires per-attester privacy disclosure, but the design CANNOT prevent an adopter from wiring a privacy-hostile attester. Adopter choice + compliance review is the discipline.

## 3. Framing decisions (Q1–Q7)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All seven are PROPOSALS pending owner review.

### 3.1 Q1 — Form-policy shape: three-tier `forbidden | allowed | required`

**PROPOSAL.** Form-policy carries the standard ADR-0011 three-tier shape:

| Tier | Semantics |
|---|---|
| `forbidden` | Form REJECTS humanity attestation. Submissions never run the gate; the resolver synthesizes a placeholder verdict for receipt-event purposes only. Default for authenticated-only forms (the IdP did the work; double-gating wastes the user's time and exposes more attesters to user data than necessary). |
| `allowed` | Form accepts humanity attestation per the deployment's resolved profile. The gate runs the wired attester ladder; the verdict accompanies the submission. Default for most public forms. |
| `required` | Form REQUIRES a positive verdict (`"human"` or `"agent-registered"`) before submit. Submissions without a positive verdict fail-load (no attester wired → `UnsupportedRequiredFeatureError`) or fail-submit (gate verdict `"denied"` → `BotProtectionDeniedError`). Use case: high-spam-risk public surfaces (mass-redemption coupons, sign-up storms, post-incident DDoS hardening). |

**Justification.** Maps directly onto ADR-0011's existing form-policy enum and the existing typed-error rendering at form-load (§5.1). Mirrors FW-0049 / FW-0050 / FW-0058 three-tier shape directly. The form-policy tier composes with FW-0028's IdP claim (per §7.1) and FW-0058's agent declaration (per §7.2).

**Alternative rejected: four-tier with `optional` floor.** Considered for backwards-compatibility with ADR-0011's `required | optional | forbidden`. Rejected: `allowed` already conveys optional-acceptance semantics; `optional` for a security gate is confusing ("optional security" reads as "security off"). FW-0049 / FW-0050 / FW-0058 set the three-tier precedent.

**Alternative rejected: binary on/off.** Considered as the simplest possible shape. Rejected: doesn't distinguish "form actively refuses the gate" (authenticated-only case) from "form accepts whatever the deployment wires" — both would collapse to "off," losing the per-form authorial signal. The three-tier shape carries the authorial intent.

### 3.2 Q2 — Attester composition model: ordered composite (`CompositeBotProtectionAttester`)

**PROPOSAL.** The `BotProtectionAttester` port slot accepts a single attester OR a `CompositeBotProtectionAttester` wrapping an ordered `BotProtectionAttester[]`. The composite mirrors `CompositeIdentityProvider` from [FW-0028 design](2026-05-24-fw-0028-multi-idp-picker-design.md). Ordering = tier preference; first-passing-attester's verdict wins; on failure-or-uncertain, fall through to next attester in the list.

```ts
export class CompositeBotProtectionAttester implements BotProtectionAttester {
  constructor(private readonly attesters: readonly BotProtectionAttester[]) {}

  async attest(context: AttestationContext): Promise<AttestationVerdict> {
    for (const attester of this.attesters) {
      const verdict = await attester.attest(context);
      if (verdict.outcome === 'human' || verdict.outcome === 'agent-registered') {
        return verdict;
      }
      if (verdict.outcome === 'denied') {
        return verdict;          // explicit denial short-circuits; do not escalate
      }
      // 'uncertain' falls through to next attester (the ladder)
    }
    return { outcome: 'denied', tier: 'escape-to-support', attesterId: '__composite__' };
  }

  disclose(): readonly AttesterDisclosure[] {
    return this.attesters.flatMap((a) => a.disclose());
  }
}
```

**Justification.** Adopters need fallback ladders (§3.3 below). Single-attester forces adapter-code changes when wiring a fallback; composite makes "WebAuthn first, then Privacy Pass, then Turnstile, then tap-to-confirm" a configuration choice, not a code change. The composite mirrors the FW-0028 substrate primitive: "wrap an ordered N-tuple of port instances behind one port slot." Per FW-0028 §"Port shape," the existing `CompositeIdentityProvider` validates this pattern for stateful + async composition; `CompositeBotProtectionAttester` is the same shape with simpler semantics (no subscribe lifecycle, no claim-owner cache).

**Routing rule (`attest`).** Iterate `attesters` in order. **`human`** or **`agent-registered`** verdicts short-circuit-pass. **`denied`** verdicts short-circuit-fail (an explicit denial — the user invoked Tier 5 escape, or an attester actively refused). **`uncertain`** verdicts fall through to the next attester (the ladder). If no attester returns `human` or `agent-registered` or `denied`, the composite returns `denied` with tier `escape-to-support`.

**Disclosure aggregation (`disclose`).** The composite aggregates per-attester disclosures (§6); the adopter / compliance team / Tier-4–5 disclosure surface sees the union of every wired attester's posture.

**Alternative rejected: parallel race (all attesters in flight; first verdict wins).** Considered for latency. Rejected: would issue Privacy Pass redemption tokens + Turnstile challenges + tap-to-confirm modals simultaneously, exposing the user to multiple vendor surfaces unnecessarily and confusing the Tier-4 modal-flash UX. Ordered-fallthrough is the right pattern.

**Alternative rejected: single attester per slot, multi-slot resolution.** Considered to keep the port shape one-attester-only. Rejected: forces adopters to write composition logic in app code; mirroring the FW-0028 substrate primitive is the lower-debt choice.

### 3.3 Q3 — Verdict shape: enum (`human | agent-registered | uncertain | denied`)

**PROPOSAL.** The verdict is an enum:

```ts
type AttestationOutcome =
  | 'human'             // Tier 1–4 passed; submitter proven human
  | 'agent-registered'  // FW-0058 composition: submitter is a registered agent per WOS substrate
  | 'uncertain'         // Tier attester cannot decide; composite falls through to next
  | 'denied';           // Explicit denial: Tier 4 failed; Tier 5 declined; gate refuses
```

Plus per-verdict metadata:

```ts
type AttestationVerdict = {
  outcome: AttestationOutcome;
  tier: 'device-attested' | 'private-token' | 'invisible-challenge' | 'human-confirmation' | 'escape-to-support';
  attesterId: string;       // URN naming the attester adapter (e.g., 'urn:formspec:bot-attester:cf-turnstile@1')
  evaluatedAt: string;      // RFC 3339
  evidenceRef?: string;     // Opaque attester-side audit ref (token redemption id, response token hash, etc.) — NEVER a fingerprint
};
```

**Justification.** A boolean (`human: true/false`) is insufficient: the verdict carries action information (`denied` → render Tier-5 escape; `uncertain` → composite escalates; `agent-registered` → FW-0058 path proceeds). The enum is the smallest set that carries this discriminator.

**`agent-registered` as a first-class verdict.** Per FW-0058 §2.3.4 the bot-protection layer is layer (a) of the adversarial defense; it MUST NOT fail-close a registered agent. The `agent-registered` outcome lets the verdict carry "this is an agent, not a human, and that's OK because FW-0058 says so." The receipt-side event (§4.4) records the outcome so downstream auditors can distinguish human-attested from agent-registered submissions.

**`evidenceRef` is opaque + non-fingerprinting.** Per §6 disclosure obligation: every attester adapter MUST emit `evidenceRef` values that do NOT carry re-identifiable user signals. Token redemption ids, response token hashes, opaque attester audit ids are acceptable; IP, User-Agent, canvas fingerprints, behavioral biometrics are FORBIDDEN.

**Alternative rejected: boolean.** Per above; insufficient discriminator.

**Alternative rejected: score (0.0–1.0).** Modeled on reCAPTCHA Enterprise. Rejected: scores invite "where do we draw the line" debate at deployment-config time; the decision belongs in the attester's code (or in the org policy as a hard threshold), not in the wire-shape. Per AP-019, score-based attesters can be wrapped behind the enum verdict by the adapter (e.g., `score >= 0.5 → "human"`, `score < 0.5 → "uncertain"`); the framework sees only the enum.

### 3.4 Q4 — Layered ladder: five tiers (Tier 1 device-attested → Tier 5 escape)

**PROPOSAL.** The reference composition wires (or admits wiring) up to five tiers, in this preference order:

| Tier | Mechanism | What the user sees | Privacy posture |
|---|---|---|---|
| **Tier 1 — device-attested** | W3C WebAuthn user-present (or user-verified) assertion via existing passkey. Rides FW-0031 substrate when present. | Nothing if browser silently surfaces; an OS-native passkey prompt if not (one-tap). | Highest. No vendor sees user data. |
| **Tier 2 — private-token** | IETF Privacy Pass (RFC 9576) — Apple PAT, hCaptcha Privacy Pass, third-party issuers. Token redeemed at issuer's endpoint with cryptographic unlinkability. | Nothing. Browser-native redemption. | Very high. Token issuer and verifier are cryptographically unlinkable. |
| **Tier 3 — invisible-challenge** | Cloudflare Turnstile non-interactive, FriendlyCaptcha proof-of-work, mCaptcha. Browser-side check; emits a token; server-side verifies. | Nothing 99% of the time; a brief "verifying" spinner if the vendor escalates to managed challenge. | Vendor-dependent. Adopter chooses per privacy posture; Turnstile is Privacy-Pass-aligned, reCAPTCHA Enterprise is more invasive. |
| **Tier 4 — human-confirmation** | A single accessible interaction: tap-to-confirm, press-and-hold (NOT puzzle CAPTCHA — no traffic lights, no piece-dragging, no audio puzzles). Per AP-019 this is fallback, not default. | A button or affordance saying "I'm a person — tap to continue." Honestly disclosed: "we couldn't verify automatically — quick check." | Per-vendor; minimal data transmitted. |
| **Tier 5 — escape-to-support** | The "I can't do this — contact support" affordance. Never trap the user. | A link + a support reference id: "still stuck? contact us at <support@adopter>; reference <id>." | Out-of-band; adopter's responsibility. |

**Justification.** Per AP-019 and J-033, puzzle CAPTCHAs are the failure mode. The ladder runs invisible-first (Tier 1–3); falls to accessible-but-visible (Tier 4) ONLY when invisible attesters cannot decide; ALWAYS exposes Tier 5 escape when the form policy is `required` (per §3.5). **Tier 4 is NOT a puzzle** — it is a single-gesture confirmation, AAA-WCAG-accessible, screen-reader-friendly, language-neutral. The design REFUSES to specify a puzzle adapter; if an adopter wires a third-party puzzle attester (e.g., reCAPTCHA v2 piece-drag), they have opted out of the design's accessibility floor.

**Justification for the per-tier mechanism choices.** The mechanisms are illustrative; the port contract (§6) admits any attester family that satisfies the privacy + verdict-shape obligations. Adopters MAY wire (per §3.7) FriendlyCaptcha for PoW-only no-third-party-dependency; hCaptcha Privacy Pass for non-Cloudflare adopters; a custom proof-of-personhood (World ID-class) for high-assurance use cases.

**Alternative rejected: four-tier (collapse Tier 1 and Tier 2 into "invisible-attestation").** Considered for simpler vocabulary. Rejected: WebAuthn user-present and Privacy Pass are structurally different (WebAuthn is per-device per-user; Privacy Pass is per-token-redemption per-vendor); the disclosure surface needs to distinguish them.

**Alternative rejected: include puzzle CAPTCHA as Tier 5 fallback.** Considered for "we have to handle the case where Tier 4 is impossible." Rejected: per AP-019, puzzle CAPTCHAs are the failure mode the row exists to avoid; introducing them as fallback violates the design's central commitment. Tier 5 (escape-to-support) is the honest fallback.

### 3.5 Q5 — Escape-to-support discipline: always available when `required`

**PROPOSAL.** When form-policy is `required`, the resolved profile MUST carry an escape-to-support contact (configured per adopter per org-policy). The Tier-4 surface MUST always render a "I can't do this — contact us" affordance alongside the tap-to-confirm. The Tier-5 escape, when invoked, emits a `bot-protection-cleared` event with `outcome: 'denied', tier: 'escape-to-support'`; the form-load surface renders the adopter-configured copy + support reference.

**When form-policy is `allowed`**, the Tier-5 escape is optional (since the gate is not blocking). When form-policy is `forbidden`, the gate doesn't run; escape is moot.

**Justification.** Per J-033 "What 'done' looks like": "the system offers multiple paths — audio, visual, WebAuthn, magic-link, voice — and never traps the user on one." Escape-to-support is the universal "never trap" mechanism. The adopter configures the contact (email, phone, in-person counter, chat); the form-policy `required` posture MUST carry one. Org policy can override per-form to require the escape disclosure even when form-policy is `allowed`.

**Alternative rejected: no escape; rely on adopter goodwill.** Rejected: this is the AP-019 failure mode — adopters in good faith ship forms that trap users. The design's authority lives in making escape a port-contract obligation, not a hope.

### 3.6 Q6 — Verdict persistence: per-session for primary submit; per-act for lifecycle actions on high-risk templates

**PROPOSAL.** A positive verdict (`human` or `agent-registered`) persists for the form-load session (covers form-fill + primary submit). Lifecycle actions per FW-0034 (correction, withdrawal, dispute) DO NOT inherit the original verdict by default; the org policy declares per-template whether lifecycle actions require fresh attestation.

**Reasoning.** Re-attesting per-submit interrupts the user; per-session is the right grain for the primary flow. Lifecycle actions on high-risk templates (financial POA, immigration, custody — the FW-0048 set) are exactly the spam-vector target ("bulk auto-withdraw to harass"); org policy MAY require fresh attestation. The FW-0034 build row decides per-template; FW-0036 design names the seam.

**Cross-row touch:** FW-0034 design's §7 gets a sibling note ("for lifecycle actions on high-risk templates, the org policy MAY require fresh `bot-protection-cleared` per act"). Informational; no FW-0034 substrate change.

**Alternative rejected: per-act always.** Rejected: punishes the user for normal lifecycle activity (filing a correction within minutes of submit shouldn't re-trigger the gate).

**Alternative rejected: per-session always (no per-act override).** Rejected: closes the door on legitimate org-policy needs for high-risk templates.

### 3.7 Q7 — Default attester family: empty composite (production); `NullBotProtectionAttester` (dev)

**PROPOSAL.** The reference composition (formspec-stack wiring) ships:

- **Production default:** `BotProtectionAttester` slot defaults to an **empty `CompositeBotProtectionAttester([])`** that returns `outcome: 'denied'` for any non-FW-0058 submitter. This is fail-closed: a deployment that did NOT wire bot-protection but declares `botProtection: required` on a form will fail-load (no attester wired) per ADR-0011 `UnsupportedRequiredFeatureError`. Deployments that declare `botProtection: forbidden` or `allowed` proceed normally (the gate doesn't run, or runs and emits `denied` which the form-policy `allowed` posture tolerates by surfacing the Tier-5 escape).
- **Dev / demo default:** `NullBotProtectionAttester` returns `outcome: 'human', tier: 'device-attested', attesterId: 'urn:formspec:bot-attester:null@1'` for every call. Marked as demo-mode-only per ADR-0011 §"Demo stubs."

**Justification.** Per ADR-0011 §"Demo stubs MAY satisfy demo capabilities only when the composition is explicitly in demo mode. Production stubs do not satisfy production capabilities." The framework MUST NOT silently ship a "always-human" attester in production. The fail-closed default forces adopters to make an explicit choice (wire Turnstile? wire Privacy Pass? wire `botProtection: forbidden` per-form? wire WebAuthn-only?), which is the right default for a security gate.

**Alternative rejected: ship Cloudflare Turnstile as the default wired attester.** Rejected: vendor lock-in dressed as a default. Forces every adopter to depend on Cloudflare (one company, US-headquartered, geopolitically loaded for some adopters). The fail-closed default is vendor-neutral.

**Alternative rejected: ship a chained default (`Tier 1 WebAuthn → Tier 4 tap-to-confirm`) with no vendor dependency.** Rejected: WebAuthn requires prior passkey enrollment (Tier 1 is only reachable for users who have a passkey for the issuer); first-time visitors would fall directly to Tier 4 tap-to-confirm, which is fine UX but a thin defense (any bot taps). Without Tier 2–3 (which are vendor-bound), the defense degrades. Adopter choice is the discipline.

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011 — PROPOSED ADDITION

**PROPOSAL.** Add `botProtection` to the ADR-0011 [Feature Ownership Table at line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md). This is a **new entry**; the capability is not currently enumerated.

| Layer | What ADR-0011 names for `botProtection` |
|---|---|
| Instance capability | Adapter-backed: a `BotProtectionAttester` port slot (per §4.2). The slot accepts a single attester OR a `CompositeBotProtectionAttester` per §3.2. Demo deployments wire `NullBotProtectionAttester`; production deployments wire whatever combination of WebAuthn / Privacy Pass / Turnstile / hCaptcha / FriendlyCaptcha / custom attesters their privacy + cost + regulatory posture admits. Empty composite is the fail-closed production default per §3.7. |
| Org policy | (a) Enabled attester families (per `enabledAttesterIds: ReadonlySet<string>` allowlist that the wired composite filters against); (b) tier-floor (`minimumTier: 'device-attested' \| 'private-token' \| 'invisible-challenge' \| 'human-confirmation'` — org refuses verdicts below the floor); (c) escape-to-support contact (per-org configured `supportContact: { email?, phone?, chat? }` rendered on the Tier-5 escape surface); (d) per-template lifecycle-action re-attestation flag (per §3.6); (e) attester privacy disclosure manifest (per §6 — the org-side compliance review). |
| Form policy | Three-tier per §3.1: `forbidden` (form REJECTS the gate; default for authenticated-only forms), `allowed` (form accepts the gate; default for public forms), `required` (form REQUIRES a positive verdict before submit; high-spam-risk public surfaces). The form-policy tier does NOT pick the attester — adopters compose adapters; the form picks whether a verdict is required. |
| Resolved runtime profile | Enabled attester tiers + escape-channel copy + verdict gate; the composition with `aiAgentFiler` (when `allowed | required`, registered agents bypass the human-attester via §7.2); the composition with `identityContinuity` (when an IdP claim is present, the human-attester chain SHOULD short-circuit via §7.1). Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if the form requires `botProtection` but the instance has no wired attester (empty composite with `required` form-policy). |

**Append-only key ordering.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts) the `RUNTIME_FEATURE_KEYS` tuple is append-only. Current tuple: `respondentPlace`, `status`, `documentPresentation`, `fileUpload`, `crossIssuerHistory`, `offlineSubmit`. **Coordination with FW-0033 / FW-0051 / FW-0058 (proposed siblings):** all are append-only; the build row for FW-0036 reads the current tuple at build time and appends.

**Locale-conditional set.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts) `LOCALE_CONDITIONAL_FEATURE_KEYS`, this set is currently empty. `botProtection` is **NOT** locale-conditional — per-locale jurisdictional attester variation (e.g., Privacy Pass issuer per region) is an adopter-config concern, not a per-form locale-change concern.

### 4.2 Port shape — `BotProtectionAttester`

**PROPOSAL.** The port shape is intentionally narrow; per [web ADR-0009 §"Hexagonal architecture"](../adr/0009-hexagonal-architecture-ports-and-adapters.md) the bar for port admission is narrowness + replaceability. The shape admits any proof-of-personhood framework — W3C WebAuthn, IETF Privacy Pass, Cloudflare Turnstile, hCaptcha Privacy Pass mode, FriendlyCaptcha proof-of-work, World ID, custom proof-of-personhood, plus the demo `NullBotProtectionAttester`.

```ts
export interface AttestationContext {
  formAssuranceLevel?: AssuranceLevel;          // Composition with FW-0028's per-assurance discovery
  identityClaim?: IdentityClaim | null;         // Composition with FW-0028's resolved claim (when an IdP attests humanity, the attester chain SHOULD short-circuit)
  agentDeclaration?: AgentDeclaration | null;   // Composition with FW-0058's registered-agent path; when present and validated, attester returns 'agent-registered'
  formPolicy: BotProtectionFormPolicy;          // 'forbidden' | 'allowed' | 'required'
  hostingOrigin: string;                        // For attesters that bind to origin (Turnstile site keys, WebAuthn RP id)
}

export interface AttesterDisclosure {
  attesterId: string;                           // URN
  family: 'webauthn' | 'privacy-pass' | 'invisible-challenge' | 'proof-of-work' | 'human-confirmation' | 'demo';
  vendor?: string;                              // For third-party attesters ('cloudflare', 'apple', 'hcaptcha', 'friendlycaptcha', 'google'); null for self-hosted / browser-native
  privacyPosture: {
    seesUserData: ReadonlySet<'ip' | 'user-agent' | 'cookies' | 'browser-fingerprint' | 'behavioral-biometrics' | 'webauthn-credential-id' | 'redemption-token'>;
    transmitsToVendor: boolean;
    crossSiteLinkable: boolean;                 // Privacy Pass / WebAuthn = false; reCAPTCHA Enterprise = true
  };
  accessibilityPosture: {
    requiresUserInteraction: boolean;           // Tier 1 = sometimes; Tier 2–3 = no; Tier 4–5 = yes
    minimumWcagLevel: 'A' | 'AA' | 'AAA';       // Tier 4 SHOULD be AAA
  };
}

export interface BotProtectionAttester {
  attest(context: AttestationContext): Promise<AttestationVerdict>;
  disclose(): readonly AttesterDisclosure[];
}
```

**Per ADR-0009 §"Conformance suite" minimum bar.** The port ships with a conformance suite that validates: (1) every attester adapter emits a verdict of the AttestationOutcome enum (no string drift); (2) `disclose()` returns a non-empty array; (3) the verdict's `evidenceRef` does NOT contain known-fingerprinting fields (IP, UA, canvas hash) — adapter-side test obligation; (4) `attest(context)` is deterministic-by-context for the `NullBotProtectionAttester` and stateful-but-idempotent for production attesters (a re-attest within session bounds returns the same verdict).

**Why a port, not a runtime hard-wire.** Per the user's correction ("good DI, let different proof-of-personhood frameworks if possible"): the framework MUST NOT pick a specific attester. Cloudflare Turnstile, Apple Private Access Tokens, hCaptcha Privacy Pass, FriendlyCaptcha PoW, World ID, custom proof-of-personhood all conform to the same port — adopters compose per their constraints. This mirrors `IdentityProvider` (FW-0028), `FormRuntimePolicyExtractor` (FW-0066), `AttachmentStore` (FW-0033), `OfflineSubmitQueue` (FW-0044), `RespondentHistorySource` (FW-0057) — the same hexagonal pattern.

**Why `disclose()` is part of the port.** Per §6 the disclosure obligation is normative; making it part of the port ensures every wired attester emits its privacy posture machine-readably, which the compliance / Tier-4–5 surface consumes. Without this, the framework cannot enforce the "no fingerprinting masquerading as bot protection" commitment.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a `botProtection` block:

```text
botProtection?: {
  posture: 'forbidden' | 'allowed' | 'required';   // resolved per-form policy after org + instance
  enabledAttesterIds: ReadonlySet<string>;          // org-policy allowlist; the wired composite filters against
  minimumTier?: 'device-attested' | 'private-token' | 'invisible-challenge' | 'human-confirmation';
  supportContact?: { email?: string; phone?: string; chat?: string };   // for Tier-5 escape rendering
  disclosures: readonly AttesterDisclosure[];       // aggregated from the wired composite's disclose()
  lifecycleReAttestation: ReadonlySet<TemplateClassRef>;   // org-declared templates requiring fresh attestation per FW-0034 lifecycle action per §3.6
}
```

The block is the resolver's read-only output. The shell consults `posture` at form-load (skips the gate when `forbidden`); the gate at submit boundary; the `disclosures` for Tier-4–5 ambient disclosure; the `supportContact` for Tier-5 escape; the `lifecycleReAttestation` for FW-0034 composition.

**Sensitive-data discipline:** the resolved profile contains no per-user attester state, no token material, no verdict history. The profile is recomputable from instance + org + form policy without consulting any user action.

### 4.4 Receipt-side event payload (EXT-5 `bot-protection-cleared`)

Per [EXT-5](../specs/2026-05-22-upstream-extension-queue.md) the event type is pre-allocated. FW-0036 closes the payload shape:

```json
{
  "event_type": "bot-protection-cleared",
  "data": {
    "attesterTier": "device-attested",
    "attesterId": "urn:formspec:bot-attester:webauthn-up@1",
    "outcome": "human",
    "evaluatedAt": "2026-05-24T15:30:00Z",
    "evidenceRef": "wa-up-assertion-id-…"
  }
}
```

**Privacy discipline (load-bearing).** The event payload MUST NOT carry IP, User-Agent, device fingerprint, geolocation, behavioral biometrics, or any other re-identifiable signal. `evidenceRef` is an OPAQUE attester-side audit id; adopters who do not need attester-side audit MAY omit it.

**Uniform-presence (NOT REQUIRED).** Unlike FW-0048's `submission.duress-signaled` event (which MUST emit on every submission to avoid event-existence leaking the binary signal), `bot-protection-cleared` is event-presence-encoded: emitted when the gate cleared, absent when the gate did not run. Per §3.1, `forbidden` form-policy does not emit the event; `allowed` emits when the gate ran; `required` always emits (negative verdict → event with `outcome: 'denied'` is emitted to record the gate's refusal). **No information leak via event-presence:** the form's policy is public (definitionUrl + version), so the absence-of-event for `forbidden` forms is structural, not signaling.

**Trellis discipline.** The event signs and chains like any other respondent-ledger event per Trellis Core §6.4 + §6.7 event-registry. No new envelope primitive; no commitment-slot use; no HPKE wrap (the payload is non-sensitive by design).

## 5. Failure semantics

### 5.1 Form-load failures

| Condition | Error per ADR-0011 |
|---|---|
| Form requires `botProtection` but instance has no wired attester (empty composite + `required`) | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `botProtection` but org policy forbids the feature | `FeaturePolicyConflictError` at form-load |
| Form forbids `botProtection` but org policy requires it | `FeaturePolicyConflictError` at form-load |
| Org policy declares `enabledAttesterIds` that doesn't intersect the wired composite's attester ids | `InvalidRuntimePolicyError` at form-load |
| Form requires `botProtection` AND `required` AND org policy declares `minimumTier` but no wired attester reaches the tier | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `botProtection: required` but no `supportContact` is configured in org policy | `InvalidRuntimePolicyError` at form-load (Tier-5 escape would have no contact to render) |

**Silent downgrade is forbidden.** A form requiring `botProtection: required` MUST fail-load on an instance without a wired attester. Falling back to "no humanity gate" silently would violate the form's required-capability contract.

### 5.2 Pre-submit failures

| Condition | Behavior |
|---|---|
| Form policy is `required` + attester verdict `denied` (Tier 5 escape invoked, or Tier 4 explicit fail) | Submit boundary rejects with typed `BotProtectionDeniedError`; shell renders adopter-configured escape copy + support reference |
| Form policy is `required` + composite returns `uncertain` after exhausting ladder (no Tier 4 wired) | Submit boundary rejects with typed `BotProtectionUncertainError`; shell renders Tier-5 escape |
| Form policy is `allowed` + attester verdict `denied` | Form proceeds; submission MAY be flagged for issuer-side review per adopter policy (the `bot-protection-cleared` event with `outcome: 'denied'` is emitted; issuer-side processing decides). |
| Form policy is `forbidden` + attester somehow ran (configuration error) | Configuration error; form-load should have rejected; this state is unreachable in a correctly-resolved profile |
| Form policy is `required` + attester verdict `agent-registered` (FW-0058 composition) | Submit boundary accepts; the event records `outcome: 'agent-registered'` per §4.4 |

### 5.3 Cross-stack failures

| Condition | Behavior |
|---|---|
| FW-0058 composition: `aiAgentFiler: required` + submitter is a registered agent + `botProtection: required` + agent presents no human-attester credential | Per §7.2 the resolver consults FW-0058 substrate FIRST; agent's identity-binding satisfies the gate; verdict `agent-registered`; no human-attester chain runs |
| FW-0058 composition: `aiAgentFiler: forbidden` + submitter claims human capacity + attester verdict `denied` | Submit boundary rejects with `BotProtectionDeniedError`; the form is the trust anchor; the attester result wins |
| FW-0028 composition: IdP claim is present (identity attestation gates humanity) + form policy is `botProtection: required` | Per §7.1 the resolver MAY skip the attester chain when the IdP claim's assurance level satisfies a humanity-floor; verdict `human` with `attesterId: '__idp-implied__'`. Org policy can disable this short-circuit ("even authenticated, run the human-attester") per per-template config |
| FW-0034 lifecycle action + org policy lists template in `lifecycleReAttestation` set + no fresh `bot-protection-cleared` event | Lifecycle-action submit boundary rejects with `BotProtectionDeniedError`; shell prompts for fresh attestation |

## 6. Disclosure obligation (privacy + accessibility)

Per §2.4, the central privacy threat is **fingerprinting masquerading as bot protection.** The port contract obligates every attester to disclose its posture machine-readably; the framework can then aggregate, validate, and surface.

### 6.1 Per-attester disclosure (machine-readable)

Every `BotProtectionAttester.disclose()` returns one or more `AttesterDisclosure` records (§4.2 shape). The records carry:

- **`privacyPosture.seesUserData`** — explicit closed enum of fields. Adopters reviewing wired attesters can grep for `'behavioral-biometrics'`, `'browser-fingerprint'`, etc., to find privacy-hostile attesters in their stack.
- **`privacyPosture.crossSiteLinkable`** — boolean. Privacy Pass / WebAuthn = false; reCAPTCHA Enterprise = true. Compliance teams gate on this.
- **`accessibilityPosture.minimumWcagLevel`** — Tier 4 SHOULD be AAA; Tier 1–3 are invisible (effectively AAA by absence-of-UI); Tier 5 is adopter-configurable copy + link, MUST be AAA-accessible.

### 6.2 Adopter compliance surface

The resolver aggregates `disclosures` from the wired composite into the resolved profile (§4.3). Adopters' compliance review pipelines consume this to:

- Verify that no wired attester's `seesUserData` exceeds the org's privacy posture.
- Verify that no wired attester's `crossSiteLinkable` is `true` when the org's posture forbids it.
- Verify that every wired attester's `minimumWcagLevel` meets the adopter's accessibility commitment.
- Generate the org's privacy notice ("This service uses Cloudflare Turnstile and Apple Private Access Tokens for invisible humanity verification; no fingerprinting is performed.").

### 6.3 Respondent-visible disclosure (Tier 4–5 only)

Tier 1–3 are invisible — no respondent surface to render the disclosure on. Tier 4 (tap-to-confirm) and Tier 5 (escape) MUST render an ambient disclosure: "quick check — your device is being verified using <vendor>; <one-line privacy posture>; <link to full disclosure>." Plain-language; never "by clicking you agree to…"; no dark patterns.

**Vocabulary firewall (per stack CLAUDE.md):** never leak `BotProtectionAttester`, `Privacy Pass`, `WebAuthn user-present`, `Turnstile` into respondent-facing chrome. Respondents see "quick check" / "prove you're a person" / "contact support if you're stuck"; the spec-jargon lives behind the Developer view toggle.

## 7. Cross-row composition

### 7.1 FW-0028 — Multi-IdP picker (skip-when-identity-proofed)

**Composition rule.** When the resolved profile carries an `IdentityClaim` (per FW-0028's `CompositeIdentityProvider` discovery) whose IdP's assurance level satisfies a humanity-floor (org-configured; default `L1`), the `BotProtectionAttester` chain SHOULD short-circuit to `outcome: 'human', attesterId: '__idp-implied__'`. The IdP's identity-proofing pipeline already gated humanity; double-gating wastes the user's time.

**Configuration knob.** Org policy MAY disable the short-circuit per-template ("even authenticated, this surface has been targeted by credential-stuffing — require fresh humanity"). The resolver's `botProtection.posture` accepts a `requireFreshHumanityEvenWhenAuthenticated: boolean` flag at the per-template tier; default false.

**Cross-row touch.** FW-0028 design's §"Open questions" gets a sibling note ("FW-0036 composes by short-circuiting when an IdP claim is present"). FW-0028's `signInOptionsForIdentityPolicy` does NOT need to know about bot-protection — the gate runs AFTER the picker resolves.

### 7.2 FW-0058 — AI-agent filer (inversion case)

**Composition rule.** When the resolved profile carries `aiAgentFiler.posture: 'allowed' | 'required'` AND the submitter presents a registered agent-identity credential (per SC-4 + EXT-8a), the `BotProtectionAttester` chain MUST short-circuit to `outcome: 'agent-registered'`. The form is the trust anchor; FW-0058's substrate is authoritative for "this is a registered agent."

**Layered defense rule (per FW-0058 §2.3.4).** Bot-protection is layer (a) of the five-layer AND-composition. **Unregistered agents fail at THIS layer** (they fail WebAuthn user-present, fail Privacy Pass, fail Turnstile invisible, fail Tier-4 tap-to-confirm if attempted programmatically). Layer (b) identity-binding, layer (c) form-policy enforcement, layer (d) WOS volume constraints, layer (e) honest-credential resolution provide AND-composed defense; a determined adversary must defeat all five to bypass.

**Cross-row touch.** FW-0058 design's §2.3.4 already names FW-0036 as layer (a) of the adversarial defense; this row reciprocates by making `agent-registered` a first-class verdict (§3.3) and specifying the FW-0058 short-circuit (§5.3 row 1).

### 7.3 FW-0048 / FW-0059 — Coercion-aware signing (no interaction)

**No composition.** Bot protection runs at form-load / pre-submit; coercion-aware signing runs at the signing ceremony with a credential the respondent already has. The two surfaces don't compose at the substrate level; the resolved profile's `botProtection.posture` and `duressAware.posture` are independent. A form MAY require both (high-spam-risk + high-coercion-risk template); both gates fire independently.

**Adversarial-agent overlap with FW-0058.** Per FW-0058 §7.2, prompt-injection is structurally a coercion vector; FW-0036 + FW-0058 + FW-0048 compose for the adversarial-agent + coercion-prone-template intersection. No new substrate.

### 7.4 FW-0034 / FW-0038 — Correction lifecycle (per-act re-attestation on high-risk templates)

**Composition rule.** Per §3.6, the verdict persists for the form-load session; lifecycle actions per FW-0034 (correction / withdrawal / dispute) do NOT inherit by default. Org policy's `botProtection.lifecycleReAttestation: ReadonlySet<TemplateClassRef>` declares per-template whether lifecycle actions require fresh attestation. High-spam-risk templates (financial POA, immigration, custody — the FW-0048 high-coercion set) are the canonical case for `lifecycleReAttestation` membership.

**Cross-row touch.** FW-0034 design's §7 gets a sibling note ("for lifecycle actions on high-spam-risk templates, the org policy MAY require fresh `bot-protection-cleared` per act"). Informational; no FW-0034 substrate change. The FW-0038 build row picks per-template defaults.

### 7.5 FW-0027 — Multi-rail payment (independent)

**No composition.** Payment authorization runs independently of humanity attestation. Card networks have their own fraud surface; ACH has its own; the form-side humanity gate fires before the payment rail. No cross-row touch.

### 7.6 AP-021 — SMS-OTP-as-only-2FA (intentional non-use)

**Composition rule (negative).** SMS OTP MUST NOT be used as a Tier-4 humanity check. The implicit assumption that "someone with a phone is a human" is structurally weak per AP-021 (SIM-swappable, observable to coercer, tied to phone numbers the user may not control). FW-0036 Tier 4 is explicitly tap-to-confirm / press-and-hold — not phone-bound. If an adopter wires a "SMS OTP as humanity attester" adapter, they have opted out of the design's commitments.

## 8. Open questions / deferrals

Honest list of what FW-0036 design does NOT resolve:

1. **The Cluely-class adversary defeat.** FW-0036 alone cannot defeat sophisticated headless-with-residential-IP scrapers. The composition with FW-0058 + WOS volume caps + adopter-side infrastructure rate limiting is the realistic defense. §2.4 documents.
2. **The WebAuthn-discovery / first-time-visitor UX problem.** A first-time visitor with no passkey enrolled cannot use Tier 1; the design falls through to Tier 2–3. Improving the "make passkey enrollment effortless" UX is FW-0031 territory; FW-0036 names the gap.
3. **Per-attester pricing / vendor-selection guidance.** The port contract is vendor-neutral; adopters pick per privacy, cost, regulatory, existing-infrastructure constraints. The design refuses to recommend a specific vendor.
4. **Privacy Pass issuer-vetting.** Adopters wiring Privacy Pass attesters depend on the trustworthiness of the issuer. The design provides the port + the disclosure obligation; adopter compliance review is the discipline.
5. **The legal-compliance overlap.** GDPR Article 22, CAN-SPAM, ADA, jurisdictional accessibility frameworks each have surface area near bot protection. The design adheres to accessibility + privacy commitments; legal compliance per jurisdiction is the adopter's obligation.
6. **The "always-on Tier 4" anti-pattern.** An adopter who wires ONLY Tier 4 (tap-to-confirm for every submission) is technically compliant with the framework but is shipping a degraded UX. The design names the ladder; the discipline lives in adopter choice + compliance review.
7. **The default attester family.** Per §3.7, the production default is fail-closed empty composite. This forces adopters to make an explicit choice. Owner pushback may prefer a non-empty default (e.g., bundle a self-hosted FriendlyCaptcha PoW adapter); deferred.
8. **The `bot-protection-cleared` event privacy disclosure.** The event payload is opaque-by-design (§4.4); per-vendor `evidenceRef` formats are vendor-controlled. If a vendor's `evidenceRef` later proves to be a de-facto identifier (e.g., a token redemption id that uniquely identifies the user across sites), the disclosure obligation per §6 catches it; the framework cannot prevent the leak at the framework layer.
9. **The "is FW-0036 obsolete when Tier 1 ships universally" question.** If WebAuthn user-present becomes universal (every visitor has a passkey for every issuer), Tier 2–5 become irrelevant and FW-0036 collapses to "the Tier-1-only port." The design admits this via the composite shape; no separate row needed.
10. **The cross-deployment attestation portability question.** A `bot-protection-cleared` verdict at deployment A is NOT recognized by deployment B (per the per-session discipline). Cross-deployment portability would require a federated attestation substrate (W3C verifiable credential of "this user is human, attested by X at time T"); out of scope, deferred to a future row if a use case materializes.

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: three-tier `forbidden \| allowed \| required` form-policy | PROPOSAL | owner review + ADR-0011 evolution |
| Q2: `CompositeBotProtectionAttester` mirroring `CompositeIdentityProvider` from FW-0028 | PROPOSAL | owner review |
| Q3: enum verdict `human \| agent-registered \| uncertain \| denied` with tier + attesterId + evaluatedAt + opaque evidenceRef | PROPOSAL | owner review |
| Q4: five-tier ladder Tier 1 (device-attested) → Tier 5 (escape-to-support); puzzle CAPTCHAs are NOT a Tier | PROPOSAL | owner review |
| Q5: Tier-5 escape always available when form-policy `required`; org-configurable supportContact | PROPOSAL | owner review |
| Q6: per-session for primary submit; per-act for lifecycle actions on org-declared high-risk templates | PROPOSAL | owner review + FW-0034 design author |
| Q7: production default = fail-closed empty composite; dev default = `NullBotProtectionAttester` | PROPOSAL | owner review |
| `botProtection` capability addition to ADR-0011 Feature Ownership Table | PROPOSAL | owner review + ADR-0011 amendment |
| `BotProtectionAttester` port shape + `AttesterDisclosure` machine-readable disclosure obligation | PROPOSAL | owner review + ADR-0009 alignment |
| `bot-protection-cleared` EXT-5 payload shape closure | PROPOSAL to formspec | formspec spec-expert review + EXT-5 ratification |
| Form-load failure semantics: typed errors per ADR-0011 | PROPOSAL | owner review |
| Submit-time failure semantics: `BotProtectionDeniedError` / `BotProtectionUncertainError` | PROPOSAL | owner review |
| FW-0028 composition: skip-when-identity-proofed short-circuit (org-overrideable) | PROPOSAL | owner review + FW-0028 design author |
| FW-0058 composition: `agent-registered` verdict short-circuit; reciprocates FW-0058 §2.3.4 layered defense | PROPOSAL | owner review + FW-0058 design author |
| FW-0034 composition: per-act re-attestation for org-declared high-risk templates | PROPOSAL | owner review + FW-0034 design author |
| AP-019 satisfied: no puzzle CAPTCHA as default; Tier-5 escape always available when `required`; full WCAG-AAA discipline on Tier 4 | PROPOSAL | owner review |
| AP-021 satisfied: SMS OTP explicitly forbidden as a Tier-4 humanity attester | PROPOSAL | owner review |
| No new cross-stack ADR required (EXT-5 closure is the only upstream-spec touch) | PROPOSAL | cross-stack scout review |

**Row status change:** FW-0036 moves from `open` to `in design`. FW-0036 stays in design until this proposal is owner-ratified, ADR-0011 amends to include `botProtection`, and EXT-5 ratifies with the `bot-protection-cleared` payload shape.

## 10. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-substrate call; WebAuthn / Privacy Pass / Turnstile are external standards FW-0036 ports)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`botProtection` is post-MVP; this design stages for post-MVP)
- [web ADR-0007](../adr/0007-identity-provider-port.md) — identity provider port (FW-0028 picker integration per §7.1)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §4.2 `BotProtectionAttester` port + `AttesterDisclosure` follows)
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (the design proposes adding `botProtection` to the Feature Ownership Table)
- [FW-0028 design 2026-05-24](2026-05-24-fw-0028-multi-idp-picker-design.md) — multi-IdP picker (the `CompositeIdentityProvider` substrate primitive that `CompositeBotProtectionAttester` mirrors; the skip-when-identity-proofed composition per §7.1)
- [FW-0058 design 2026-05-24](2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — AI-agent filer chain (the `agent-registered` verdict short-circuit per §7.2; FW-0058 §2.3.4 already cites FW-0036 as layer (a) of the adversarial defense — reciprocated here)
- [FW-0034 design 2026-05-24](2026-05-24-fw-0034-honest-correction-path-design.md) — honest correction (the per-act re-attestation seam per §7.4)
- [FW-0048 design 2026-05-23](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-aware signing (independent surface per §7.3; no composition)
- [EXT-5 (`bot-protection-cleared` event) — `thoughts/specs/2026-05-22-upstream-extension-queue.md:88`](2026-05-22-upstream-extension-queue.md) — closes the payload deferral with §4.4 shape
- Source brief: [`thoughts/sketches/2026-05-24-fw-0036-humane-bot-protection-research-brief.md`](../sketches/2026-05-24-fw-0036-humane-bot-protection-research-brief.md)
- Journey: [J-033 in `JOURNEYS.md:601`](../../JOURNEYS.md)
- Anti-patterns: [AP-019 in `JOURNEYS.md:161`](../../JOURNEYS.md), [AP-021 in `JOURNEYS.md:173`](../../JOURNEYS.md)
- External prior art (with URLs in source brief §3): W3C WebAuthn 3 (user-present + user-verified flags); IETF Privacy Pass RFC 9576/9577/9578; Cloudflare Turnstile (non-interactive); Apple Private Access Tokens; hCaptcha Privacy Pass mode; FriendlyCaptcha / mCaptcha (proof-of-work); Google reCAPTCHA Enterprise (reference for what FW-0036 does NOT default to); OWASP Authentication Cheat Sheet (anti-automation); W3C WCAG 2.2; EFF on CAPTCHAs; Cluely / AI-CAPTCHA-bypass research (bounds the realistic attack surface)
