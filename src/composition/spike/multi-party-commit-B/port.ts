/**
 * Shape B — Eventual-consistency commitment protocol port (SPIKE only).
 *
 * Per-party state is asynchronous; the port carries one `applyPartyAction`
 * primitive whose closed action taxonomy is `Drafted | Signed | Abandoned`.
 * Convergence is a read-time invariant: all parties' `Signed` actions must
 * reference the same response digest, else the Response is in
 * `PendingConvergence`. Tombstones (`Abandoned`) carry an explicit
 * garbage-collection contract — the spike pins a 90-day default per
 * ADR-0155 §8.3 (illustrative; the winning shape pins the real value).
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
  readonly visibleFields: ReadonlySet<FieldId>;
}

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

/** Closed action taxonomy applied per party. */
export type PartyAction =
  | { kind: 'Drafted'; fieldEdits: ReadonlyMap<FieldId, unknown>; observedAtMs: number }
  | { kind: 'Signed'; signature: Signature; observedAtMs: number }
  | { kind: 'Abandoned'; reason: string; observedAtMs: number };

export interface PartyActionLog {
  readonly partyRef: PartyRef;
  readonly declaration: PartyDeclaration;
  readonly actions: ReadonlyArray<PartyAction>;
}

export type ConvergenceState =
  | { kind: 'Drafting' }
  | { kind: 'PendingConvergence'; targetDigest: ResponseDigest; missing: ReadonlyArray<PartyRef> }
  | { kind: 'Completed'; targetDigest: ResponseDigest }
  | { kind: 'Abandoned'; tombstones: ReadonlyArray<PartyRef> };

export interface CommitmentReadModel {
  readonly currentDigest: ResponseDigest;
  readonly perParty: ReadonlyMap<PartyRef, PartyActionLog>;
  readonly convergence: ConvergenceState;
}

export interface GcReport {
  readonly tombstonedParties: ReadonlyArray<PartyRef>;
  readonly droppedActionsByParty: ReadonlyMap<PartyRef, number>;
}

/**
 * Shape B — eventual-consistency commitment protocol port.
 */
export interface MultiPartyCommitB {
  /** Bind a party. Idempotent on existing partyRef. */
  addParty(declaration: PartyDeclaration): Promise<void>;

  /**
   * Apply one action against the party log. The port enforces:
   *   - `Drafted` may only edit fields in the party's `visibleFields`.
   *   - `Signed` must reference the digest *as observed by the signing party*;
   *     the read-model decides whether the digest matches the others.
   *   - `Abandoned` produces a tombstone; downstream `applyPartyAction`
   *     calls for that party are rejected until the tombstone is GC'd.
   */
  applyPartyAction(partyRef: PartyRef, action: PartyAction): Promise<void>;

  /**
   * Read-time convergence: returns `Completed` when every non-abandoned
   * party's latest `Signed` action references `currentDigest`; otherwise
   * `PendingConvergence` (lists the parties still missing) or `Abandoned`
   * (when every party has tombstoned).
   */
  read(): CommitmentReadModel;

  /**
   * Garbage-collection sweep. Drops tombstoned parties whose
   * `Abandoned.observedAtMs + abandonmentTtlMs < nowMs`.
   */
  garbageCollect(nowMs: number): Promise<GcReport>;
}

export interface CommitmentBOptions {
  /**
   * Per ADR-0155 §8.3 the tombstone TTL is illustrative — the winning shape
   * pins the real value. Default 90 days.
   */
  readonly abandonmentTtlMs?: number;
}
