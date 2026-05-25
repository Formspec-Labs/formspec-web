/**
 * Shape A — 2PC explicit-state commitment protocol port (SPIKE only).
 *
 * Per-party state is the explicit triple `Prepared | Committed | Aborted`,
 * lifted from a `Drafting` baseline. A coordinator (the runtime) drives
 * transitions; each `prepare` opens a bounded preparation window; window
 * expiry triggers automatic `abort`. Amendment-after-prepare is represented
 * by re-`prepare` on the affected party which CASCADES — any other
 * party whose visible-field set intersects the amended fields drops from
 * `Prepared` / `Committed` back to `Drafting` and must re-`prepare`.
 *
 * Spike scope: this lives under `src/composition/spike/` and is not a real
 * production port. The spike's verdict (per ADR-0155 §8) decides whether
 * Shape A or Shape B (or a third shape) lands as the locked port at
 * `src/ports/multi-party-commit.ts`.
 */

export type PartyRef = string;
export type FieldId = string;
export type ResponseDigest = string;

export type RoleClass =
  | 'coEqual'
  | 'asymmetricPrimary'
  | 'asymmetricSecondary'
  | 'guardianFor';

export interface PartyDeclaration {
  readonly partyRef: PartyRef;
  readonly roleId: string;
  readonly roleClass: RoleClass;
  /** Field ids this party can see/edit. */
  readonly visibleFields: ReadonlySet<FieldId>;
}

/** Per-party state in Shape A's explicit-states FSM. */
export type PartyState =
  | { kind: 'Drafting' }
  | { kind: 'Prepared'; preparedDigest: ResponseDigest; expiresAtMs: number }
  | { kind: 'Committed'; preparedDigest: ResponseDigest; signature: Signature }
  | { kind: 'Aborted'; reason: AbortReason };

export type AbortReason =
  | 'windowExpired'
  | 'partyAbandoned'
  | 'amendedAway'
  | 'caller';

export interface Signature {
  readonly partyRef: PartyRef;
  readonly digest: ResponseDigest;
  /**
   * Per FW-0048 §7.1 the per-party duress sidecar rides on the
   * `submission.duress-signaled` event keyed by `partyRef`. The port
   * carries a uniform-shape opaque blob (HPKE ciphertext or padded
   * filler) — the port is not the place that decides duress semantics.
   */
  readonly duressOpaque: Uint8Array;
}

export interface CommitmentSnapshot {
  /** Per-party state, keyed by partyRef. */
  readonly parties: ReadonlyMap<PartyRef, PartyState>;
  /** All-`Committed` parties for the current shared digest. */
  readonly completedDigest: ResponseDigest | null;
}

export interface AmendmentResult {
  /** Parties whose `Prepared` / `Committed` state was cascade-invalidated. */
  readonly cascadedParties: ReadonlyArray<PartyRef>;
  /** The new shared response digest after the amendment. */
  readonly newDigest: ResponseDigest;
}

export interface PreparationWindow {
  readonly windowMs: number;
}

/**
 * Shape A — 2PC explicit-state commitment protocol port.
 */
export interface MultiPartyCommitA {
  /** Bind a party to the draft. Idempotent on existing partyRef. */
  addParty(declaration: PartyDeclaration): Promise<void>;

  /**
   * Apply per-party field edits. Edits to fields outside the party's
   * `visibleFields` are rejected. Returns the new shared response digest
   * AND the list of parties whose prior `Prepared`/`Committed` state was
   * cascade-invalidated because the amended fields intersected their
   * visible-field set.
   */
  amend(
    partyRef: PartyRef,
    fieldEdits: ReadonlyMap<FieldId, unknown>,
  ): Promise<AmendmentResult>;

  /**
   * Per-party 2PC prepare. The party asserts: "the current shared digest
   * is what I will sign." Opens a bounded preparation window; window
   * expiry triggers automatic `abort('windowExpired')`.
   */
  prepare(partyRef: PartyRef, window: PreparationWindow): Promise<PartyState>;

  /**
   * Per-party 2PC commit. Must be called after `prepare` and before the
   * window expires. Signature must reference the prepared digest.
   */
  commit(partyRef: PartyRef, signature: Signature): Promise<PartyState>;

  /**
   * Per-party abort. Reason discriminates abandonment from caller-initiated
   * abort; window-expiry aborts are coordinator-internal.
   */
  abort(partyRef: PartyRef, reason: Extract<AbortReason, 'partyAbandoned' | 'caller'>): Promise<PartyState>;

  /** Read-only snapshot. */
  snapshot(): CommitmentSnapshot;

  /** Drive the coordinator's clock forward; processes window expiries. */
  tickClock(nowMs: number): Promise<ReadonlyArray<PartyRef>>;
}
