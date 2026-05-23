/**
 * IdentityProvider port — web ADR-0007 + ADR-0009 §MVP port inventory.
 *
 * Conformance invariant: output `IdentityClaim` mirrors
 * `respondent-ledger-spec.md` §6.6 `identityAttestation` field set.
 * Adapter MUST normalize provider-native payloads and assurance evidence into
 * this canonical shape before returning
 * from `authenticate()`. Provider-native vocabulary MUST NOT leak through.
 *
 * Statefulness (web ADR-0009 §Composition lifecycle): IdentityProvider is one
 * of the two MVP stateful ports. Exposes `subscribe()` so the React shell can
 * orchestrate cross-port effects on login / logout / revoke.
 */

export type AssuranceLevel = 'L1' | 'L2' | 'L3' | 'L4'; // §6.6.1

export type Unsubscribe = () => void;

/**
 * Spec-aligned with respondent-ledger-spec.md §6.6 identityAttestation.
 * Enums match respondent-ledger-event.schema.json; expiresAt + nistAssurance
 * are port-level extensions beyond §6.6.
 */
export interface IdentityClaim {
  /** Provider or issuer identifier. */
  provider: string;
  /** Implementation adapter identifier. */
  adapter: string;
  /** Stable pseudonymous subject reference. */
  subjectRef: string;
  /** Subject DID when the identity flow issues or binds one. */
  did?: string;
  /** DID URL, key id, or other verification method reference. */
  verificationMethod?: string;
  credentialType:
    | 'oidc-token'
    | 'verifiable-credential'
    | 'proof-of-personhood'
    | 'delegation-assertion'
    | 'provider-assertion'
    | 'other';
  /** Reference to the protected credential or token envelope, not the raw secret. */
  credentialRef?: string;
  personhoodCheck?: 'passed' | 'failed' | 'inconclusive' | 'not-performed';
  subjectBinding: 'respondent' | 'subject' | 'delegate' | 'other' | 'unknown';
  assuranceLevel: AssuranceLevel;
  privacyTier?: 'anonymous' | 'pseudonymous' | 'identified' | 'public';
  selectiveDisclosureProfile?: string;
  evidenceRef?: string;
  /** Port-level extension (session expiry; not in §6.6 schema). */
  expiresAt?: string;
  /** Port-level extension — stack-root ADR-0140 alignment; tracked as queue EXT-8a. */
  nistAssurance?: { ial?: string; aal?: string; fal?: string };
}

export type IdpOption =
  | {
      kind: 'magic-link';
      channel: 'email' | 'sms';
      minAssurance: Extract<AssuranceLevel, 'L2' | 'L3' | 'L4'>;
    }
  | { kind: 'oidc'; issuer: string; displayName: string; minAssurance: AssuranceLevel }
  | { kind: 'anonymous'; minAssurance: 'L1' };

export interface IdentityProvider {
  /**
   * Enumerate available adapters; optionally filtered by required assurance.
   * When EXT-8 (form-side assurance annotation) lands, the React shell can
   * pass the form's required assurance here for per-form filtering.
   */
  discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]>;

  authenticate(option: IdpOption): Promise<IdentityClaim>;

  revoke(claim: IdentityClaim): Promise<void>;

  /**
   * Subscribe to session-lifecycle events (login, logout, revoke).
   * The React shell uses this to orchestrate cross-port effects
   * (e.g., clearing DraftStore subject cache).
   */
  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe;
}
