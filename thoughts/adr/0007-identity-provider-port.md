# ADR-0007 — `IdentityProvider` port: contract + §6.6 normalization invariant

**Date:** 2026-05-22
**Status:** accepted (rewritten 2026-05-22 to drop service-specific prescription; see web ADR-0009)
**Subordinate to:** web ADR-0009

## Context

formspec-web rendered forms can be filled with or without authentication. The architecture must accommodate every reasonable auth backend an adopter brings — Firebase / Supabase / Clerk / Auth0 / Okta / Azure AD / Entra / Keycloak / login.gov / ID.me / NHS login / gov.uk One Login / WorkOS / AWS Cognito / custom OIDC / anonymous / passkey-only / magic-link / etc.

A first-attempt draft of this ADR prescribed "magic-link + optional OIDC" as the MVP auth posture. That was a UX/onboarding choice masquerading as architecture. Under hexagonal DI discipline (web ADR-0009), the architecture is the **port** plus a **normalization invariant**; specific adapter choice is per-deployment.

The Respondent Ledger spec already provides the normalization shape. `formspec/specs/audit/respondent-ledger-spec.md` §6.6 ("Identity attestation object") defines a provider-neutral identity record. The spec uses **SHOULD** for adapter-boundary normalization (§6.6 and §6.6.1 final paragraph); **this ADR elevates that SHOULD to MUST** as a port-level invariant for all `IdentityProvider` adapters in formspec-web — provider-native payloads (OIDC `acr`/`amr`, Firebase user/token, Cognito assertion, ID.me result, wallet presentation, magic-link consumption, etc.) MUST be normalized into the canonical field set **before** returning from `authenticate()`. §6.6A separates response continuity, subject continuity (`subjectRef`), and identity proofing as three concerns that must not collapse.

## Decision

formspec-web defines an `IdentityProvider` port with the following contract.

```ts
interface IdentityProvider {
  discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]>;
  authenticate(option: IdpOption): Promise<IdentityClaim>;
  revoke(claim: IdentityClaim): Promise<void>;
}

// Spec-aligned with respondent-ledger-spec.md §6.6 identityAttestation field set.
// Enums match respondent-ledger-event.schema.json; expiresAt + nistAssurance are
// port-level extensions beyond §6.6.
type IdentityClaim = {
  provider: string;              // e.g. "firebase", "auth0", "login.gov", "anonymous"
  adapter: string;               // e.g. "firebase-auth@10", "oidc-client-ts@2"
  subjectRef: string;            // stable pseudonymous subject reference
  did?: string;
  verificationMethod?: string;
  credentialType:                // values match respondent-ledger-event.schema.json enum
    | "oidc-token"
    | "verifiable-credential"
    | "proof-of-personhood"
    | "delegation-assertion"
    | "provider-assertion"
    | "other";
  credentialRef?: string;
  personhoodCheck?: "passed" | "failed" | "inconclusive" | "not-performed";
  subjectBinding: "respondent" | "subject" | "delegate" | "other" | "unknown";
  assuranceLevel: "L1" | "L2" | "L3" | "L4";  // §6.6.1
  privacyTier?: "anonymous" | "pseudonymous" | "identified" | "public";
  selectiveDisclosureProfile?: string;
  evidenceRef?: string;
  expiresAt?: string;             // port-level extension (session expiry; not in §6.6 schema)
  nistAssurance?: { ial?: string; aal?: string; fal?: string };  // port-level extension (ADR-0140 alignment; queue EXT-8a)
};
```

### Normalization invariant (load-bearing)

Every adapter MUST normalize provider-native payloads into the spec field set above **before returning from `authenticate`**. The conformance suite verifies this for any adapter — first-party or third-party. Provider-native fields (e.g., raw OIDC `acr`/`amr` strings, raw Firebase tokens, raw Auth0 claims) MUST NOT leak into the ledger, the Response, or anything downstream of the port.

This is the only architectural commitment this ADR makes. Everything else is per-deployment.

### Form-side assurance declaration

When a form's Definition declares a required assurance level (tracked as queue EXT-8 — verification pending), `discover()` filters `IdpOption[]` to adapters whose `minAssurance` meets the requirement. When no requirement is declared, anonymous + low-friction adapters are valid options.

### Reference adapters

Specific reference adapters are documented in [web ADR-0008 (reference deployment composition)](0008-reference-deployment-composition.md). Custom adapters from adopters are first-class as long as they pass the conformance suite. The port spec deliberately does not enumerate adapters here — that would privilege some over others, contradicting the architectural posture in web ADR-0009.

Post-MVP additions to the same port (not new ports): `PasskeyAdapter` (WebAuthn, FW-0031, depends on SC-4); `VcPresenterAdapter` (W3C VC + OpenID4VP, J-013, depends on SC-4).

### What this port does NOT cover

- **Bot protection / proof-of-personhood.** Separate concern (`BotProtection` port, scoped in a sibling ADR when needed). One proves "I am a person"; this port proves "I am this person."
- **Authorization (who-can-do-what).** Per stack-root [ADR-0117](../../../thoughts/adr/0117-authorization-engine-selection.md), authorization is its own engine. formspec-web doesn't implement authorization; upstream services call their own auth engine via their own port.

## Rationale

1. **The port is the architecture; adapters are deployment choices.** Per web ADR-0009, formspec-web cannot pick "magic-link" or "OIDC" or "Firebase" as architecture — those are deployment compositions. The architecture is the port + the §6.6 normalization invariant.
2. **§6.6 is the right vocabulary.** OIDC `acr`/`amr` strings are non-portable across IdPs; Firebase tokens are non-portable across vendors; etc. The spec's normalized fields survive adapter changes, exports, audits, future credential families. Letting provider-native vocabulary leak into the ledger re-couples formspec-web to one provider family — exactly what the architecture forbids.
3. **AP-001 / AP-006 / AP-020 / AP-022 honored at the port layer, not the adapter layer.** Anonymous fill stays a first-class adapter. Multi-IdP per-form via `discover()` filtering. Assurance level recorded as actually achieved (never silently downgraded). The JOURNEYS anti-patterns are honored as port invariants, not adapter-specific behavior.
4. **Adapter swap is real because the conformance suite makes it so.** A custom `OktaAdapter` or `CognitoAdapter` written by an adopter drops in if and only if it passes the suite.
5. **Substrate-deferral compatibility.** Identity is not cryptographic substrate (it's an external assertion). The port shape stays stable when WebAuthn-bound signing lands later — it adds an adapter, not a new port.

## Consequences

- `IdentityProvider` port + conformance suite live in `src/ports/identity-provider.ts` + `tests/adapter-conformance/identity-provider/` per web ADR-0009.
- The Respondent Ledger receives `identityAttestation` in §6.6 shape, regardless of which adapter resolved. The Response itself does NOT carry `identityAttestation` (§6.6A separation; ledger event stream is the home).
- Form-side declaration of required assurance level is upstream extension EXT-8 in [`../specs/2026-05-22-upstream-extension-queue.md`](../specs/2026-05-22-upstream-extension-queue.md). Until EXT-8 lands, adapters' `minAssurance` declarations are honored by the port but cannot be filtered against form requirements.
- `IdentityClaim` alignment with `wos-events::IdentityAttestation` per stack-root [ADR-0140](../../../thoughts/adr/0140-identity-attestation-shape.md) is tracked as queue EXT-8a — the optional `nistAssurance` block is the alignment surface.
- Adapters that need to talk to a backend (e.g., `MagicLinkAdapter` needs email send; `OidcAdapter` needs the issuer's discovery doc; `FirebaseAuthAdapter` needs Firebase project config) do so via other ports (`NotificationDelivery`) or directly to the IdP. **No specific backend is named in the port contract.** Whether a deployment proxies through formspec-stack services or talks directly to Firebase / Auth0 / login.gov is a composition choice (see web ADR-0008 for the formspec-stack reference composition).
- **Cross-port composition is explicit.** Per web ADR-0009 §"Composition lifecycle and cross-port coordination," adapters that legitimately consume multiple ports (canonical example: `MagicLinkAdapter` consumes both `IdentityProvider` and `NotificationDelivery` for email send) do so via constructor injection — `new MagicLinkAdapter({ notificationDelivery })`. The shell does NOT pass the entire Composition to adapters; only specific dependencies they declare. Adapter cross-port consumption is documented in the adapter's own contract and is bounded (no transitive Composition reference).
- **Session lifecycle.** `IdentityProvider` is one of two MVP ports with state (per web ADR-0009). It exposes `subscribe(listener: (claim: IdentityClaim | null) => void) => Unsubscribe` so the React shell can orchestrate cross-port effects on login / logout / revoke (e.g., clearing `DraftStore` subject cache, resetting in-flight `SubmitTransport` retries, navigating to anonymous state). Adapters MUST emit `subscribe` events when their underlying provider's session changes (e.g., Firebase `onAuthStateChanged`, OIDC silent-refresh failure, magic-link revocation by issuer).
- PLANNING row FW-0063 delivers the port + conformance suite + at least one reference adapter — NOT a specific auth UX.

## Related decisions

- web ADR-0009 — hexagonal architecture (constitutional; this ADR is one port instance)
- web ADR-0004 — consume the SPEC, not specific services (§6.6 is the SPEC for identity)
- web ADR-0008 — reference deployment composition (worked example of which adapter the formspec-stack composition wires)
- stack-root [ADR-0117](../../../thoughts/adr/0117-authorization-engine-selection.md) — authorization engine selection (distinct from identity)
- stack-root [ADR-0140](../../../thoughts/adr/0140-identity-attestation-shape.md) — cross-stack identity attestation shape
- queue EXT-8 — form-side assurance annotation
- queue EXT-8a — `IdentityClaim` NIST-axis alignment
