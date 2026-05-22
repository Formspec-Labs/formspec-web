# ADR-0007 — Identity & auth: magic-link + optional OIDC via narrow `IdentityProvider` port

**Date:** 2026-05-22
**Status:** accepted

## Context

The MVP slice (web ADR-0005) ships login. The journey corpus covers identity at multiple levels:

- **J-019** (public terminal): no email, no account, ephemeral session, receipt via SMS / print.
- **J-032** (sign in with something I already have): multi-IdP picker, no oversharing.
- **J-033** (humane bot protection): invisible-first, accessible alternatives, no puzzle CAPTCHAs.
- **J-034** (already-proved identity): use existing IdP-proofed identity; targeted step-up only the missing factor; never silently downgrade.
- **J-035** (passkey-bound signing): WebAuthn for both sign-in and per-document signature assertion.

The cross-stack scout walk confirmed that identity-provider integration is **deployment-shaped**: every adopter has different identity infrastructure (login.gov for US federal, ID.me for VA, NHS login for UK, gov.uk One Login for UK central, generic OIDC for everything else). Per web ADR-0004 (consume, don't invent), formspec-web does NOT spec identity provider integration — OIDC is OIDC, no Formspec sidecar required.

The Respondent Ledger spec already provides the canonical landing surface. `formspec/specs/audit/respondent-ledger-spec.md` §6.6 "Identity attestation object" defines a **provider-neutral** identity shape with explicit guidance (§6.6.1 final paragraph) that integrators MUST normalize provider-native payloads (OIDC `acr`/`amr`, ID.me sessions, wallet presentations) into the spec's canonical fields **through an adapter boundary** before writing to the ledger. §6.6A separates three concerns: response state and audit continuity; subject continuity (`subjectRef`); identity proofing. formspec-web must honor that separation — the port output cannot leak provider-native vocabulary into the ledger.

The user's MVP login decision: magic-link as the default low-friction path; OIDC as opt-in per-form when assurance is required. Both behind one port.

## Decision

formspec-web hosts an `IdentityProvider` port. The port's output (`IdentityClaim`) mirrors the **provider-neutral** field set defined in `respondent-ledger-spec.md` §6.6 — adapters normalize provider-native payloads into this shape **before** any ledger or Response write.

```ts
interface IdentityProvider {
  discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]>;
  authenticate(option: IdpOption): Promise<IdentityClaim>;
  revoke(claim: IdentityClaim): Promise<void>;
}

// Mirror of respondent-ledger-spec.md §6.6 identityAttestation field set.
// Spec field names — not OIDC-native vocabulary.
type IdentityClaim = {
  provider: string;              // e.g. "login.gov", "idme", "magic-link"
  adapter: string;               // e.g. "oidc-client-ts@2", "magic-link-v1"
  subjectRef: string;            // stable pseudonymous subject reference
  did?: string;                  // when the flow issues or binds one
  verificationMethod?: string;   // DID URL / key id / method reference
  credentialType: string;        // "oidc-token" | "verifiable-credential" | "proof-of-personhood" | "magic-link"
  credentialRef?: string;        // reference to envelope, not raw secret
  personhoodCheck?: "passed" | "failed" | "not-performed";
  subjectBinding: "respondent" | "subject" | "delegate" | "other";
  assuranceLevel: "L1" | "L2" | "L3" | "L4";  // spec §6.6.1 four-level taxonomy
  privacyTier?: "anonymous" | "pseudonymous" | "identified" | "public";
  selectiveDisclosureProfile?: string;
  evidenceRef?: string;
  expiresAt?: string;
};

type IdpOption =
  | { kind: "magic-link"; channel: "email" | "sms"; minAssurance: "L2" }
  | { kind: "oidc"; issuer: string; displayName: string; minAssurance: AssuranceLevel };
```

Reference adapters in formspec-web for MVP:

- **`MagicLinkAdapter`** — email + token delivered via the `NotificationDelivery` port (also adopter-side; reference wiring uses host SMTP). Default low-friction path. Issues an `IdentityClaim` with `provider: "magic-link"`, `credentialType: "magic-link"`, `assuranceLevel: "L2"` (corroborated, per §6.6.1).
- **`OidcAdapter`** — wraps a browser OIDC client. Recommended: [`oidc-client-ts`](https://github.com/authts/oidc-client-ts) (community-maintained, widely deployed). Consumes raw OIDC `acr`/`amr`/`id_token` claims, **normalizes to `IdentityClaim` mirror of §6.6 fields**, then returns. Per-deployment OIDC issuer config wires login.gov / ID.me / NHS login / etc.

The `IdentityClaim` is written to the Respondent Ledger as `identityAttestation` on `identity-verified` / `attestation.captured` events. **It does NOT land on Response.** Response carries `displayedIssuer` per web ADR-0006 — distinct concept: what was *shown* at submit time. The §6.6A separation of "response state" from "identity proofing" is normative; conflating them violates the spec.

Login is **per-form**, not per-deployment:

- Forms that declare an assurance requirement get OIDC (filtered by IdPs meeting the requirement).
- Forms that do not declare a requirement get magic-link OR anonymous (respondent choice).
- Forms that explicitly opt out of login get no login surface at all.

### Reaching upstream services: formspec-server primary, WOS secondary

formspec-web's HTTP boundary lands at two upstream services. See web ADR-0008 for the full map.

- **`formspec-server` (primary).** MVP submit (produces `IntakeHandoff` per `formspec/schemas/intake-handoff.schema.json`), magic-link delivery (`formspec-server-email`), OIDC callback handling, draft persistence, Issuer document fetch via server cache. Post-MVP: signature ceremony, signed receipts, PDF rendering ([stack-root ADR-0141](../../../thoughts/adr/0141-rendering-service-architecture.md) rendering service), verifier projection (`formspec-server-verifier-integrity`).
- **WOS / workspec-server (secondary, post-MVP).** Applicant-status reads (`GET /api/v1/applicant/cases/{id}` for J-021 / FW-0039) **proxied through formspec-server** — WOS does NOT learn that magic-link was the respondent-side auth method; it sees the OIDC-compatible token its existing `LoginKind` enum already accepts.

Net result: no WOS `LoginKind` extension is needed. The earlier upstream-extension proposal (`EXT-9`) is dropped. The proxy pattern keeps formspec-web's auth methods inside its own contract.

Authorization at the upstream services follows stack-root [ADR-0117 (authorization engine selection)](../../../thoughts/adr/0117-authorization-engine-selection.md) — OpenFGA is the seed adapter for the auth port. formspec-web does NOT implement Zanzibar checks directly; it calls `formspec-server-ports`' auth port, which dispatches to whatever auth engine the deployment configures.

**Explicitly NOT in formspec-web for MVP:**

- WebAuthn / passkey-bound signing (deferred per web ADR-0005 — cryptographic substrate work).
- Wallet / Verifiable Credentials presentation (deferred — Phase-3 selective-disclosure dependency).
- SMS OTP as a primary second factor (violates AP-021 when phishing-resistant alternatives exist on the device).
- Google reCAPTCHA, Microsoft-only, Apple-only, or any single-IdP lock-in (violates AP-020).
- Cross-form, cross-sender identity federation (J-039 / J-042 / J-043 trio is post-MVP, lives in the respondent-library sidecar work).

## Rationale

1. **§6.6 is the right vocabulary.** OIDC `acr`/`amr` strings are non-portable across IdPs (login.gov ACR ≠ ID.me ACR ≠ NHS ACR). The spec's normalized fields (`provider`, `assuranceLevel`, `subjectRef`, `personhoodCheck`, etc.) survive adapter changes, exports, and future credential families (wallet-presented VCs). Letting OIDC vocabulary leak into the ledger or the port output would re-couple formspec-web to one provider family.
2. **AP-001 / AP-006 honored.** Anonymous fill stays a first-class path. Magic-link adds resume and receipt retrieval without a password gauntlet. No account creation required to read one's own record.
3. **AP-020 honored.** Multi-IdP at the per-form layer. Deployments can ship login.gov + ID.me + generic OIDC together; the picker filters by required assurance. No forced single-IdP path.
4. **AP-022 honored.** The §6.6 `assuranceLevel` (L1–L4 per §6.6.1) is recorded in the ledger as the level actually achieved — not the level the form wanted. No silent downgrade.
5. **Bias to consume (web ADR-0004).** OIDC is OIDC; magic-link is generic. The port and adapters live in formspec-web; the contract is industry standards. The proxy pattern keeps formspec-web's auth choices from leaking into upstream service specs.
6. **Substrate-deferral compatibility (web ADR-0005).** Identity is not cryptographic substrate (it's an external assertion). The port shape stays stable when WebAuthn-bound signing lands later — it adds a `PasskeyAdapter` to the same port, not a new port. FW-0031 / J-035 unblocked when substrate lands.

## Consequences

- A browser OIDC client is a formspec-web dependency (recommended `oidc-client-ts`, swappable behind the adapter).
- A `NotificationDelivery` port also lives in formspec-web (magic-link requires email send; future SMS / push). Per web ADR-0004, NotificationDelivery is adopter-side. Reference adapter wires to host SMTP; production deployments swap to Twilio / SES / SendGrid / etc.
- The Respondent Ledger receives `identityAttestation` (in `respondent-ledger-event.schema.json`) populated when login occurred. The Response itself does NOT carry `identityAttestation` — it lives in the ledger event stream per `respondent-ledger-spec.md` §6.6A.
- Form-side declaration of required assurance level is a small `formspec` Definition extension (tracked as EXT-8 in [`../specs/2026-05-22-upstream-extension-queue.md`](../specs/2026-05-22-upstream-extension-queue.md); verification still pending whether `definition.schema.json` already has an `assurance` annotation slot).
- **`IdentityClaim` shape alignment with `wos-events::IdentityAttestation`.** Stack-root [ADR-0140 (identity-attestation shape)](../../../thoughts/adr/0140-identity-attestation-shape.md) ratifies a cross-stack identity-attestation record with NIST IAL/AAL/FAL axes. The current `IdentityClaim` field set (above) mirrors `respondent-ledger-spec.md` §6.6 and is MVP-correct, but the NIST-axis block should be added once `wos-events` PLN-0384 closes. Tracked as queue EXT-8a.
- WOS reads happen through formspec-web's authenticated proxy via formspec-server — no WOS `LoginKind` extension needed (EXT-9 is removed). See web ADR-0008 for the full upstream-services map.
- The identity layer lives as MVP row FW-0063 in `PLANNING.md`.
- Post-MVP additions to the same port: `PasskeyAdapter` (WebAuthn — J-035), `VcPresenterAdapter` (W3C VC + OpenID4VP — J-013), `WalletAdapter` (J-042 respondent library handshake). Each is an adapter, not a new port — the DI shape is forward-compatible.
- Bot protection (J-033) gets its own port (`BotProtection`) in a sibling ADR when scoped; it is logically separate from identity (one proves "I am a person," the other proves "I am this person").
