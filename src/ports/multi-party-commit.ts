/**
 * MultiPartyCommit port — multi-party commitment protocol per
 * [ADR-0155 §8 (Spike-and-Observe protocol)](../../../thoughts/adr/0155-multi-party-intake.md).
 *
 * Locks the 2PC explicit-state shape (formerly "Shape A" in the spike).
 * The shape was selected by the FW-0115 Spike-and-Observe pass against the
 * eventual-consistency alternative; see the verdict at
 * `../../thoughts/spikes/2026-05-25-multi-party-commit-spike-observation.md`
 * §3. The load-bearing asymmetry: this port's `PreparationWindow` + `tickClock`
 * compose natively with FW-0050 §3.3 + §5.1's per-party deadline policy
 * (which FW-0050 §4.2 routes to WOS for the asymmetric tier), while the
 * losing shape forced consumers to layer a sibling timer port.
 *
 * SCOPE — `PreparationWindow` tier-overreach guard. `PreparationWindow` +
 * `tickClock` are a **coEqual-tier intake-only live-session-abandonment
 * primitive per ADR-0155 §8.1(a)**. They are NOT the FW-0050 §3.3
 * `deadlinePolicy` resolver block, and they are NOT the FW-0050 §4.2
 * WOS-owned asymmetric-tier per-party-deadline contract — §4.2 explicitly
 * routes asymmetric-tier per-party deadlines to WOS. The FW-0061 asymmetric-
 * tier build composes the port's window (covering per-prepare session
 * timeout only) with WOS for the flow-level deadline; this port does not
 * own flow-level deadline semantics.
 *
 * Per-party state is the explicit triple `Prepared | Committed | Aborted`,
 * lifted from a `Drafting` baseline. A coordinator (the adapter) drives
 * transitions; each `prepare` opens a bounded preparation window; window
 * expiry triggers automatic `abort('windowExpired')`. Amendment-after-prepare
 * CASCADES — any other party whose visible-field set intersects the amended
 * fields drops from `Prepared` / `Committed` back to `Aborted('amendedAway')`
 * and must re-`prepare`.
 *
 * KNOWN GAP — post-sign retraction (ADR-0155 §8.1(d)) is not expressible at
 * this port today: `abort()` disallows transition from `Committed`. Closing
 * the gap is deferred to a FW-0061-era FSM widening (allow `Aborted` as a
 * valid transition from `Committed`); until that widening lands the port
 * DISALLOWS abort-from-Committed and post-sign retraction must compose
 * through ADR-0066 §D-6 lifecycle acts at the artifact-contract layer.
 *
 * Primary consumer: FW-0061 (multi-party submission build). FW-0061 uses
 * the preallocated `multiParty` RuntimeFeatureKey at position 14 of
 * `RUNTIME_FEATURE_KEYS` (see `../policy/feature-keys.ts`); no new key is
 * minted for this port.
 *
 * Adapter status. An in-memory reference adapter lives at
 * `../composition/spike/multi-party-commit-A/in-memory.ts`, with the F1..F4
 * scenario harness from ADR-0155 §8.4 alongside. They are retained
 * deliberately as the working reference implementation until FW-0061 ships
 * the production adapter — do not delete them as "spike scaffold." The
 * losing Shape B was deleted per ADR-0155 §8.7 "throw away the loser."
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

/** Per-party state in the 2PC explicit-states FSM. */
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
 * Multi-party 2PC explicit-state commitment protocol port.
 */
export interface MultiPartyCommit {
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
  abort(
    partyRef: PartyRef,
    reason: Extract<AbortReason, 'partyAbandoned' | 'caller'>,
  ): Promise<PartyState>;

  /** Read-only snapshot. */
  snapshot(): CommitmentSnapshot;

  /** Drive the coordinator's clock forward; processes window expiries. */
  tickClock(nowMs: number): Promise<ReadonlyArray<PartyRef>>;
}
