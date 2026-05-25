# FW-0036 Humane bot protection — Research Brief

**Status:** Sketch / research artifact. Not a design proposal. Seeds the design conversation.
**FW row:** [FW-0036 in `PLANNING.md:491`](../../PLANNING.md) (design).
**Journey:** [J-033 in `JOURNEYS.md:601`](../../JOURNEYS.md) — "let me prove I'm a person without making me prove I'm a robot."
**Anti-patterns:** [AP-019 in `JOURNEYS.md:161`](../../JOURNEYS.md) — MUST NOT default to puzzle CAPTCHAs.
**Feature key (proposed):** `botProtection` — would be a new entry in [web ADR-0011 Feature Ownership Table line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md); currently NOT enumerated.

Headline finding: **bot protection is a port problem, not a substrate problem.** No new Trellis primitive is required; no Formspec schema change is required for the baseline shape; WOS is silent on humanity-attestation. The substrate-tier work is small: one new event-type registration (`bot-protection-cleared`, already queued in EXT-5), one capability key in ADR-0011 (`botProtection`), and one DI-shaped port (`BotProtectionAttester`) that admits multiple proof-of-personhood adapters (WebAuthn user-present, Privacy Pass / Apple Private Access Tokens, Cloudflare Turnstile non-interactive, last-resort tap-to-confirm). The design rows that matter are (a) the **layered ladder** (Tier 1 device-attested → Tier 5 contact-support escape) and (b) the **AND-with-FW-0058** composition rule (humanity attestation INVERTS for `aiAgentFiler: allowed | required` paths — registered agents pass the gate via agent-identity binding, not via the human-attester).

Hardest finding: **the load-bearing primitive is the port, not the puzzle.** Adopters MUST be able to wire ANY combination of attesters (or none in `forbidden` posture) without forking the runtime. The shell consumes a single `verdict: "human" | "uncertain" | "agent" | "denied"` plus a tier-name; the underlying attester family is invisible to product code. Multi-attester composition (analogous to `CompositeIdentityProvider` per FW-0028) is the route to "fallback ladder without code change."

---

## 1. Upstream Primitive Inventory

### 1.1 WOS — no humanity-attestation primitive today

[`work-spec/specs/`](../../../work-spec/specs/) search for `bot`, `captcha`, `humanity`, `attestation` (snake/camel variants): no humanity-attestation primitive exists. WOS specifies identity attestation (`AuditAttestationView` per `audit.md`, NIST IAL/AAL/FAL alignment per ADR 0140) and agent attestation (`ActorKind::Agent` per ADR-0064, `agentSubmitterUnauthorized` per Kernel §10.5), but the **respondent-side "is-a-human" signal is absent**. This is correct: WOS governance binds on *identity* (and the IdP's identity-proofing pipeline is the substrate-layer humanity gate). For sessions with NO identity (anonymous-allowed forms), the humanity signal MUST come from somewhere else; FW-0036 is that somewhere else.

**Composition with FW-0028 multi-IdP picker:** when the resolved profile lists an OIDC/passkey IdP, the IdP's identity-proofing pipeline is the upstream humanity signal — login.gov, ID.me, NHS login etc. already proof for personhood. The form-side `botProtection` posture for those paths SHOULD be `forbidden` (or `allowed` with a "skip when identity-proofed" runtime hint) to avoid double-gating.

**Composition with FW-0058 agent filer:** the WOS substrate already accepts agent-class actors via `actorExtension`. When `aiAgentFiler: allowed | required` is in effect, the humanity-attester MUST NOT fail-close a registered agent; the agent presents its agent-identity credential (per SC-4 + EXT-8a) and bypasses the human-attester. The FW-0058 design's §2.3.4 already cites "privacy-preserving attestation (WebAuthn user-present, Apple Private Access Tokens, Turnstile non-interactive)" as layer (a) of the adversarial defense — FW-0036 is the implementation of that layer.

### 1.2 Formspec — `bot-protection-cleared` event pre-allocated in EXT-5

[`formspec-web/thoughts/specs/2026-05-22-upstream-extension-queue.md:88` EXT-5](../specs/2026-05-22-upstream-extension-queue.md):
> **Events to add:** `response.declined` … `bot-protection-cleared`. File as one combined PR.

The event-type is **pre-allocated**; FW-0036 design closes the deferred payload shape. Proposed shape (minimal):

```text
event_type: "bot-protection-cleared"
data:
  attesterTier: "device-attested" | "private-token" | "invisible-challenge" | "human-confirmation" | "escape-to-support"
  attesterId: string            // opaque URN naming the adapter, e.g. "urn:formspec:bot-attester:cf-turnstile@1"
  verdict: "human" | "agent-registered" | "uncertain-confirmed"  // "agent-registered" when FW-0058 composition fires
  evaluatedAt: string           // RFC 3339
  evidenceRef?: string          // optional opaque attester-side audit ref (Privacy Pass token redemption id, Turnstile response token hash, etc.) — NEVER a fingerprint
```

**Privacy discipline.** The event SHOULD NOT carry IP, User-Agent, device fingerprint, geolocation, or any other re-identifiable signal. Per AP-019, the attestation's role is "this submission was proven not-a-bot," not "here is who proved it." If an attester needs to retain audit records, it does so on its own substrate (Cloudflare's, Apple's, the adopter's); the Formspec receipt-side event is the receipt-side fact, opaque.

**The Trellis substrate is ZERO.** The event signs and chains like any other respondent-ledger event per Trellis Core §6.4. No new envelope primitive; no commitment-slot use; no HPKE wrap (the event payload is non-sensitive — the verdict is intentionally public).

### 1.3 Trellis — byte-neutral, no primitive needed

Same as FW-0058: byte-neutral. The `bot-protection-cleared` event rides the standard ledger chain. Cross-stack confirmation is small and rides as a paragraph in the EXT-5 fixture set, not a standalone XS-N ADR.

### 1.4 PKAF — assertion-side AI tracking is unrelated

`rkaf:AILineage` (PKAF rkaf-core §5.3) is downstream of assertion authoring; FW-0036 is upstream of submission. No overlap. Downstream assertions citing a `bot-protection-cleared`-witnessed submission MAY surface the attestation tier in their `rkaf:EvidenceBinding`; that is a PKAF-side composition, NOT an FW-0036 substrate.

### 1.5 web ADR-0011 — `botProtection` NOT enumerated

[Feature Ownership Table at line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Compared to existing entries:

| Feature | Instance capability | Org policy | Form policy |
|---|---|---|---|
| Identity continuity | identity/session adapter | accepted IdPs and assurance floors | assurance required |

`botProtection` is absent. FW-0036 proposes the addition. Proposed shape:

| Layer | What ADR-0011 would name for `botProtection` |
|---|---|
| Instance capability | One or more `BotProtectionAttester` adapter instances composed behind one slot (per §3 ladder); demo `NullBotProtectionAttester` (always-human) for development. |
| Org policy | (a) Enabled attester families (allow WebAuthn user-present? allow Cloudflare Turnstile? allow Apple Private Access Tokens?); (b) tier-floor (`require ≥ Tier-2 for org policy reasons`); (c) escape-channel disclosure (org names the support contact for the Tier-5 escape path). |
| Form policy | Three-tier `forbidden | allowed | required`. `forbidden` for authenticated-only forms (the IdP did the work); `allowed` default for public forms; `required` for high-spam-risk public forms. **The form-policy tier does NOT pick the attester** — adopters compose adapters; the form picks whether a verdict is required. |
| Resolved runtime profile | Enabled attester tiers + escape-channel copy + verdict gate + composition with `aiAgentFiler` (when `allowed | required`, registered agents bypass the human-attester). |

### 1.6 EXT-5 — `bot-protection-cleared` payload is the schema work FW-0036 owns

Per EXT-5 row body, the event type is pre-allocated alongside `response.declined`, `submission.duress-signaled`, etc. FW-0036 owns the payload shape (§1.2 above) and the fixture set (positive `device-attested`; positive `invisible-challenge`; positive `agent-registered` for FW-0058 composition; negative `escape-to-support` showing the user did NOT clear the gate and the form's submit boundary refused).

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0036 |
|---|---|---|
| **FW-0028** Multi-IdP picker | [`PLANNING.md:416`](../../PLANNING.md) | **Bot protection sits BEFORE or PARALLEL TO the picker.** When the resolved profile carries an OIDC IdP that satisfies the form's assurance floor, the form-policy SHOULD be `botProtection: forbidden` (no double-gate). When the picker offers an anonymous path AND that path is selected, the gate fires AFTER the picker but BEFORE the form's submit boundary. Cross-row touch: FW-0028 picker UI gets a single sentence — "when anonymous is the chosen path, the form may require a humanity check before submit." |
| **FW-0058** AI-agent filer | [`PLANNING.md:677`](../../PLANNING.md) | **Inversion case.** When `aiAgentFiler: allowed | required` and the submitter presents a registered agent-identity credential (per SC-4 + EXT-8a), the human-attester MUST NOT fail-close. The `BotProtectionAttester` port's resolver consults the FW-0058 substrate first; registered agents emit verdict `"agent-registered"` and proceed. Unregistered agents (FW-0058 §2.3.4 adversarial scraper) fail. Cross-row touch: FW-0058 design's §2.3.4 already names FW-0036 as layer (a) of the adversarial defense — informational. |
| **FW-0048 / FW-0059** Coercion-aware signing | [`PLANNING.md:593`](../../PLANNING.md) | **No interaction.** Bot protection runs at form load / pre-submit; coercion-aware signing runs at the signing ceremony with a credential the respondent already has. The two surfaces don't compose at the substrate level. |
| **FW-0034 / FW-0038** Correction lifecycle | [`PLANNING.md:468`](../../PLANNING.md) | **Per-act gating, NOT re-attestation.** A respondent issuing a correction has already cleared the original `bot-protection-cleared` gate; the correction submit MAY require a fresh `bot-protection-cleared` event when the org policy declares high-spam-risk on the lifecycle-action surface (e.g., to prevent agent-driven mass-withdrawal). Default is no re-attestation. Build row decides per-template; FW-0036 design names the seam. |
| **FW-0027** Multi-rail payment | [`PLANNING.md`](../../PLANNING.md) | **Independent.** Payment authorization and humanity attestation are orthogonal: card networks have their own fraud surface; ACH has its own; the form-side humanity gate fires before the payment rail. No cross-row touch. |
| **AP-021** SMS-OTP-as-only-2FA | [`JOURNEYS.md:173`](../../JOURNEYS.md) | **Adjacent anti-pattern.** SMS OTP is sometimes used as a humanity check (the assumption that "someone with a phone is a human"); per AP-021 this is structurally weak. FW-0036's Tier 4 fallback (tap-to-confirm) is intentionally NOT phone-bound. |

---

## 3. External Prior Art

| System | URL | What it provides | What FW-0036 takes |
|---|---|---|---|
| Cloudflare Turnstile (non-interactive mode) | https://developers.cloudflare.com/turnstile/ | Invisible / managed challenge that emits a one-time token; server-side verifies via siteverify endpoint; no puzzle 99% of the time. Privacy-Pass-aligned. | A canonical Tier-3 attester. Site-key + secret-key shape adapters mirror; the verdict-or-fail outcome is the wire shape. |
| Apple Private Access Tokens (PAT) | https://datatracker.ietf.org/doc/draft-ietf-privacypass-auth-scheme/ + https://developer.apple.com/news/?id=huqjyh7k | RFC 9576 Privacy Pass authentication scheme; Safari and iOS-native browsers redeem device-attested tokens at the issuer's challenge endpoint, with cryptographic unlinkability between the attester and the verifier. Zero puzzle, zero fingerprint. | A canonical Tier-2 attester. The IETF Privacy Pass framework (RFC 9576) is the standardized substrate; Apple's implementation is one issuer. |
| IETF Privacy Pass (RFC 9576 + RFC 9577 + RFC 9578) | https://datatracker.ietf.org/wg/privacypass/ | Standardized framework for issuing and redeeming privacy-preserving authentication tokens. Multiple issuers (Cloudflare, Fastly, Apple); pluggable per browser. | The substrate FW-0036's Tier-2 attesters conform to. Adopters CAN run a Privacy Pass issuer themselves; commercial issuers (Cloudflare, Fastly) are common. |
| W3C WebAuthn user-present / user-verified flags | https://www.w3.org/TR/webauthn-3/#sctn-authenticator-data + https://www.w3.org/TR/webauthn-3/#user-present + https://www.w3.org/TR/webauthn-3/#user-verified | Browser-native `up` (user-present) and `uv` (user-verified) flags returned in authenticator data. `up=1` proves a person physically interacted with the device (touched the sensor, pressed the key); `uv=1` proves the user authenticated with PIN/biometric. | The canonical Tier-1 attester. Highest-assurance no-puzzle humanity signal; rides existing passkey infrastructure (FW-0031 territory). Requires the user to enroll a passkey first; for first-time visitors with no passkey, fall through to Tier 2. |
| Google reCAPTCHA Enterprise (score-based) | https://cloud.google.com/recaptcha-enterprise/docs/overview | Score-based risk model (0.0 = bot, 1.0 = human); invisible by default; falls to "challenge" (puzzle) when the score is ambiguous. | **Reference for what FW-0036 does NOT default to.** reCAPTCHA Enterprise CAN run invisible-only, but the typical adopter posture is "fall to puzzle on uncertainty," which is AP-019. The Tier-3 attester slot can wrap reCAPTCHA Enterprise as long as the puzzle fallback is explicitly disabled — that is a configuration discipline, not a code design. |
| hCaptcha Privacy Pass mode | https://www.hcaptcha.com/privacy-pass | Privacy-preserving alternative to reCAPTCHA; IETF Privacy Pass-aligned token issuance. | A second Tier-3 attester option for adopters who can't use Turnstile (Cloudflare lock-in concerns) but want the Privacy-Pass-style invisible attestation. |
| FriendlyCaptcha / mCaptcha (proof-of-work) | https://friendlycaptcha.com/ + https://mcaptcha.org/ | Browser-side proof-of-work; no user puzzle; small CPU burn proves human-class device. | A Tier-3 alternative for adopters who want zero third-party dependency. Trade-off: PoW burns user device cycles and slightly delays submit. |
| Cluely / "AI agent CAPTCHA bypass" research (industry observation) | https://www.tomshardware.com/tech-industry/cyber-security/cluely-claims-an-ai-tool-that-bypasses-captchas-puts-the-final-nail-in-the-coffin (industry coverage) | Demonstrates that determined attackers run LLM-driven agents through headless-with-residential-IP infrastructure that defeats reCAPTCHA-style scoring. | **Bounds the realistic attack surface.** Per the threat model (§4 of design), FW-0036's defense holds AT THE COMPOSITION LEVEL (multiple AND-composed layers per FW-0058 §2.3.4), not at any single attester. The Cluely-class adversary defeats one or two layers; the design rests on layered defense. |
| OWASP Authentication Cheat Sheet — anti-automation | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#anti-automation | Industry guidance on rate limiting + bot detection without puzzle-default. | Confirms the "puzzle-as-last-resort" posture is industry-accepted, not a Formspec-specific opinion. |
| W3C WCAG 2.2 — non-text content + accessibility | https://www.w3.org/WAI/standards-guidelines/wcag/ | Sets the accessibility bar; puzzle CAPTCHAs are well-documented WCAG failures. | The grounding for AP-019 + the Tier-5 escape requirement. Any design that traps a user on an inaccessible challenge violates WCAG. |
| EFF on CAPTCHAs ("The Problem with CAPTCHAs") | https://www.eff.org/deeplinks/2019/08/captchas-are-bad (general critique) | Long-form critique of CAPTCHA-as-bot-protection; advocates Privacy-Pass-style alternatives. | Confirms the political / accessibility framing is mainstream, not idiosyncratic. |

---

## 4. Threat Scenario Probes

Three scenarios surface the design's load-bearing seams. Final design §2.3 carries the threat-model-grade rendering.

### 4.1 Public form, no sign-in (canonical case)

A municipal benefits form on a public URL. Anyone can hit it. No identity, no session, no prior trust signal. The form's audience includes elderly, disabled, low-bandwidth, screen-reader, non-native-language respondents.

- **What humanity attestation must provide:** invisible-by-default attestation at form-load (Tier 1–3), accessible fallback (Tier 4), escape-to-support (Tier 5). **No respondent ever sees a puzzle.**
- **Adversarial baseline:** scraper bots want the form's text + structure for analysis; spam bots want to submit garbage; credential-stuffing isn't applicable (no credential). The form-load attestation rides Tier 3 (Turnstile-class invisible) by adopter default; the submit-boundary checks the resolved verdict.
- **What this design provides:** the layered ladder per §3; tier-up policy lives in adopter config.

### 4.2 Authenticated form (sign-in done first)

A healthcare-provider portal that requires login.gov sign-in at IAL2 before the form loads. The IdP's identity-proofing pipeline already gated humanity.

- **What humanity attestation must provide:** **nothing.** The IdP did the work; double-gating wastes the user's time and exposes more attesters to user data than necessary.
- **Adversarial baseline:** if an attacker can get a login.gov session, they can fill the form; the form-side humanity gate doesn't add defense.
- **What this design provides:** form-policy `botProtection: forbidden`; the resolver synthesizes the verdict from the active IdP claim (or skips the gate entirely). Adopters MAY override per-form (e.g., "even authenticated, this surface has been targeted by credential-stuffing — require Tier 1 fresh humanity").

### 4.3 Agent-friendly form (FW-0058 `aiAgentFiler: allowed | required`)

A procurement-automation form designed to accept AI-agent filings per FW-0058. The agent presents an agent-identity credential per SC-4 + EXT-8a.

- **What humanity attestation must provide:** **NOT human-attestation.** A registered agent is not a human; the form expects this. The gate's verdict is `"agent-registered"`; the submit boundary accepts.
- **Adversarial baseline:** an UNREGISTERED agent attempting to fill (FW-0058 §2.3.4 adversarial scraper) is the threat. FW-0036's Tier-1–3 attesters fail-close for unregistered agents; the agent fails the gate AND fails identity-binding AND fails form-policy AND fails WOS volume caps — the AND-composition from FW-0058 §2.3.4 holds.
- **What this design provides:** the `BotProtectionAttester` port's resolver checks the FW-0058 substrate first (when wired); registered agents short-circuit to `"agent-registered"`; the human-attester chain runs only for non-agent submitters.

### 4.4 Adversarial — sophisticated scraper

A scraping bot operator deploys a headless browser farm with residential-IP rotation, retains Privacy Pass tokens from compromised devices, and feeds the form through an LLM. The Cluely-class threat.

- **What humanity attestation must provide:** **honest layered defense.** Tier 1 (WebAuthn) requires real device + real user gesture — defeats most bots. Tier 2 (Privacy Pass) requires a fresh redeemable token — defeats bulk token-recycling. Tier 3 (Turnstile invisible) defeats casual bots; sophisticated bots may pass. Tier 4 (tap-to-confirm) is per-submit friction — defeats high-volume bots. The composition with `aiAgentFiler: forbidden` + identity binding + WOS volume caps (per FW-0058 §2.3.4) is what holds against the Cluely-class adversary; FW-0036 alone does NOT.
- **Adversarial baseline:** the attacker may pay $0.50/captcha-solve at a solving farm; AP-019 already names this — puzzle CAPTCHAs LET this attacker through. FW-0036's privacy-preserving attesters at least cost the attacker a real-device + real-fingerprint operation, not a $0.50 solve.
- **What this design provides:** §2.3 threat model and §3 fallback ladder are tuned to this adversary; §8 names what the design cannot block (the determined nation-state adversary with real device farms is out of every web form's reach).

### 4.5 Residual privacy threat — fingerprinting masquerading as bot protection

A naive "bot protection" implementation collects User-Agent + IP + canvas fingerprint + audio fingerprint + behavioral biometrics ("how does the mouse move") and scores. This is **surveillance dressed as security**.

- **What FW-0036 design must enforce:** the `BotProtectionAttester` port contract MUST forbid any attester from collecting or transmitting re-identifiable signals. Adopters wiring Cloudflare Turnstile inherit Cloudflare's privacy posture (token-based, no cross-site tracking); wiring reCAPTCHA Enterprise opts into Google's posture (less private). The port contract names the privacy obligation; the adopter's adapter choice is the enforcement.
- **What this design provides:** §6 contract obligation: every attester adapter MUST disclose its privacy posture (per-tier: "what does this attester see? what does it record? what does it transmit?") in its `BotProtectionAttester.disclose()` method; the runtime can surface the disclosure to compliance teams and to respondents (Tier 4–5 only — Tier 1–3 are invisible, no respondent surface to render the disclosure on).

---

## 5. Open Design Questions Heading Into the Spec

These are the framing decisions the design doc decides (§3 there). Sketch-status here; not load-bearing.

1. **Q1 — Form-policy shape.** Three-tier `forbidden | allowed | required` (mirrors FW-0049 / FW-0050 / FW-0058) vs. four-tier with `optional` floor (mirrors web ADR-0011's existing four-tier `required | optional | forbidden | default-on`). **Leaning three-tier** for sibling consistency; `optional` semantics are unclear for a security gate.
2. **Q2 — Attester composition model.** Single attester per slot vs. ordered composite (mirroring `CompositeIdentityProvider` from FW-0028). **Leaning ordered composite** — adopters need fallback ladders; single-attester forces adapter code changes when wiring a fallback.
3. **Q3 — Verdict shape.** Boolean (`human: true/false`) vs. enum (`"human" | "uncertain" | "agent" | "denied"`). **Leaning enum** — the verdict carries action information (denied → render escape; uncertain → escalate ladder; agent → FW-0058 path).
4. **Q4 — Escape-to-support discipline.** Must the form ALWAYS expose an escape-to-support contact, even when org policy `forbidden`? **Leaning yes for `required`, no for `forbidden`** — if the form doesn't gate, there's nothing to escape from; if it gates, the user must never be trapped.
5. **Q5 — Per-act vs. per-session.** Does the `bot-protection-cleared` verdict cover the whole session (form-load → submit), or must each submit (including lifecycle actions per FW-0034) re-attest? **Leaning per-session for primary submit; per-act for lifecycle actions ONLY when org policy declares high-risk template.**
6. **Q6 — Adopter privacy disclosure surface.** Where does the per-attester privacy posture get surfaced (compliance docs only? respondent-visible "what is this checking?" affordance on Tier 4–5?). **Leaning compliance docs + Tier 4–5 ambient disclosure.**
7. **Q7 — Default attester family.** Should the reference adopter wiring (formspec-stack composition) ship with a default attester family? **Leaning `NullBotProtectionAttester` for dev/demo + an empty `[]` composite for production** — adopters MUST opt into specific attesters; the framework does not pick.

---

## 6. Failure-Surface Inventory (preview)

Final design §5 carries the threat-model-grade rendering. Sketch list:

- **Form-load failures.** `UnsupportedRequiredFeatureError` when `botProtection: required` and no attester adapter is wired; `FeaturePolicyConflictError` when form says `forbidden` and org says `required`; `InvalidRuntimePolicyError` when an attester adapter is wired but the disclosure manifest is missing.
- **Pre-submit failures.** When the gate's verdict is `"denied"` (Tier 4 explicitly failed; Tier 5 escape declined), the submit boundary refuses with typed `BotProtectionDeniedError`; the shell renders the Tier-5 escape copy ("can't pass this — please contact support; ref: <support-ref>").
- **Composition failures.** When `aiAgentFiler: required` AND `botProtection: required` AND the agent fails ALL attesters (no human-attester applies AND no agent-identity binding resolves), the typed error chain is `agentSubmitterUnauthorized` from WOS Kernel §10.5 — NOT a bot-protection error (the agent failed identity, not humanity).

---

## 7. Cross-Stack Dependencies (preview)

Among the smallest cross-stack footprints of any post-MVP design row to date (FW-0028 slice 1 was literally zero upstream work; FW-0036 closes one EXT-5 payload deferral on top of that):

- **Formspec:** ratify EXT-5 `bot-protection-cleared` event payload shape (§1.2). One spec edit, one fixture matrix.
- **WOS:** nothing. No new substrate; humanity-attestation is not a WOS concern.
- **Trellis:** nothing. Byte-neutral.
- **PKAF:** nothing. Out-of-scope (assertion-side, not submission-side).
- **No new cross-stack ADR.** Compared to FW-0058's XS-6 + FW-0048's XS-3 + FW-0049's XS-4 + FW-0034's XS-5, FW-0036 is genuinely formspec-web-local. The EXT-5 closure is the only upstream-spec touch.

---

## 8. What FW-0036 Cannot Do (preview)

Final design §8 carries the honest scope-limits. Sketch list:

1. **Defeat real device farms with rotating residential IPs.** Out of every web form's reach. Composition with FW-0058 + WOS volume caps + adopter-side rate limiting at infra layer is the realistic defense.
2. **Defeat coercion-by-instruction** (an attacker telling a real human to fill the form). The respondent IS human; humanity-attestation passes. The coercion-aware-signing surface per FW-0048 is the relevant defense for coerced signatures; FW-0036 does not cover coerced fills.
3. **Solve the WebAuthn-discovery UX problem.** A first-time visitor with no passkey enrolled cannot use Tier 1; the design assumes Tier 2 / 3 fallback. The "make passkey enrollment effortless" problem is FW-0031 territory.
4. **Legal-compliance frameworks (CAN-SPAM, GDPR Article 22, ADA).** The design adheres to accessibility (Tier 5 escape) and privacy (no fingerprinting) commitments, but legal compliance per jurisdiction is the adopter's obligation, not FW-0036's.

---

## 9. Where This Brief Lands

This brief feeds the design doc at [`thoughts/specs/2026-05-24-fw-0036-humane-bot-protection-design.md`](../specs/2026-05-24-fw-0036-humane-bot-protection-design.md). The design owns the framing decisions (Q1–Q7 above), the threat-model-grade rendering, the port contract, and the cross-row composition rules.

The design is **NOT a build row**. The build row is a future follow-on (not yet filed; expected to materialize when (a) an adopter wires a real attester family, (b) EXT-5 ratifies, and (c) FW-0028 slice-2 production OIDC wiring stabilizes the "skip when identity-proofed" composition with this row).
