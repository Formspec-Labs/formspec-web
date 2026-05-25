/**
 * Shape A in-memory implementation — SPIKE only.
 *
 * Reference 2PC coordinator + per-party state machine. Computes the shared
 * response digest deterministically from accumulated edits across parties;
 * cascades `Prepared`/`Committed` invalidation when an amendment touches a
 * field visible to other parties.
 */

import type {
  AbortReason,
  AmendmentResult,
  CommitmentSnapshot,
  FieldId,
  MultiPartyCommitA,
  PartyDeclaration,
  PartyRef,
  PartyState,
  PreparationWindow,
  ResponseDigest,
  Signature,
} from './port.ts';

interface PartyRecord {
  readonly declaration: PartyDeclaration;
  state: PartyState;
}

export interface InMemoryCommitAOptions {
  readonly clockMs?: number;
}

export function createInMemoryCommitA(
  options: InMemoryCommitAOptions = {},
): MultiPartyCommitA {
  const parties = new Map<PartyRef, PartyRecord>();
  const fieldValues = new Map<FieldId, unknown>();
  let clockMs = options.clockMs ?? 0;
  let digestCounter = 0;
  let currentDigest: ResponseDigest = computeDigest(fieldValues, digestCounter);

  function snapshot(): CommitmentSnapshot {
    const partySnap = new Map<PartyRef, PartyState>();
    for (const [ref, record] of parties) {
      partySnap.set(ref, record.state);
    }
    const allCommitted =
      parties.size > 0 &&
      [...parties.values()].every(
        (r) => r.state.kind === 'Committed' && r.state.preparedDigest === currentDigest,
      );
    return {
      parties: partySnap,
      completedDigest: allCommitted ? currentDigest : null,
    };
  }

  return {
    async addParty(declaration: PartyDeclaration) {
      const existing = parties.get(declaration.partyRef);
      if (existing) {
        return;
      }
      parties.set(declaration.partyRef, {
        declaration,
        state: { kind: 'Drafting' },
      });
      // Mid-flow addition: existing prepared/committed parties whose visible
      // fields overlap with the new party's visible fields are NOT cascade-
      // invalidated, because no field values changed. The new party simply
      // joins at `Drafting` and may `amend` later.
    },

    async amend(partyRef: PartyRef, fieldEdits: ReadonlyMap<FieldId, unknown>): Promise<AmendmentResult> {
      const record = mustParty(parties, partyRef);
      for (const fieldId of fieldEdits.keys()) {
        if (!record.declaration.visibleFields.has(fieldId)) {
          throw new Error(
            `party ${partyRef} cannot amend non-visible field ${fieldId}`,
          );
        }
      }
      for (const [fieldId, value] of fieldEdits) {
        fieldValues.set(fieldId, value);
      }
      digestCounter += 1;
      currentDigest = computeDigest(fieldValues, digestCounter);

      const cascaded: PartyRef[] = [];
      for (const [otherRef, other] of parties) {
        if (other.state.kind === 'Drafting' || other.state.kind === 'Aborted') {
          continue;
        }
        const overlaps = [...fieldEdits.keys()].some((fid) =>
          other.declaration.visibleFields.has(fid),
        );
        if (!overlaps) {
          continue;
        }
        other.state = { kind: 'Aborted', reason: 'amendedAway' };
        cascaded.push(otherRef);
      }
      return { cascadedParties: cascaded, newDigest: currentDigest };
    },

    async prepare(partyRef: PartyRef, window: PreparationWindow): Promise<PartyState> {
      const record = mustParty(parties, partyRef);
      if (record.state.kind === 'Committed') {
        throw new Error(`party ${partyRef} already committed; amend to re-prepare`);
      }
      record.state = {
        kind: 'Prepared',
        preparedDigest: currentDigest,
        expiresAtMs: clockMs + window.windowMs,
      };
      return record.state;
    },

    async commit(partyRef: PartyRef, signature: Signature): Promise<PartyState> {
      const record = mustParty(parties, partyRef);
      if (record.state.kind !== 'Prepared') {
        throw new Error(
          `party ${partyRef} must be Prepared to commit; got ${record.state.kind}`,
        );
      }
      if (signature.digest !== record.state.preparedDigest) {
        throw new Error(
          `party ${partyRef} signature digest does not match prepared digest`,
        );
      }
      if (signature.partyRef !== partyRef) {
        throw new Error(
          `signature.partyRef ${signature.partyRef} does not match commit partyRef ${partyRef}`,
        );
      }
      if (clockMs > record.state.expiresAtMs) {
        record.state = { kind: 'Aborted', reason: 'windowExpired' };
        throw new Error(`party ${partyRef} preparation window expired`);
      }
      record.state = {
        kind: 'Committed',
        preparedDigest: record.state.preparedDigest,
        signature,
      };
      return record.state;
    },

    async abort(
      partyRef: PartyRef,
      reason: Extract<AbortReason, 'partyAbandoned' | 'caller'>,
    ): Promise<PartyState> {
      const record = mustParty(parties, partyRef);
      record.state = { kind: 'Aborted', reason };
      return record.state;
    },

    snapshot,

    async tickClock(nowMs: number): Promise<ReadonlyArray<PartyRef>> {
      clockMs = nowMs;
      const expired: PartyRef[] = [];
      for (const [ref, record] of parties) {
        if (record.state.kind === 'Prepared' && nowMs > record.state.expiresAtMs) {
          record.state = { kind: 'Aborted', reason: 'windowExpired' };
          expired.push(ref);
        }
      }
      return expired;
    },
  };
}

function mustParty(parties: Map<PartyRef, PartyRecord>, partyRef: PartyRef): PartyRecord {
  const record = parties.get(partyRef);
  if (!record) {
    throw new Error(`unknown party ${partyRef}`);
  }
  return record;
}

function computeDigest(values: Map<FieldId, unknown>, counter: number): ResponseDigest {
  const keys = [...values.keys()].sort();
  const flat = keys.map((k) => `${k}=${JSON.stringify(values.get(k))}`).join('|');
  return `sha-spike:${counter}:${flat}`;
}
