/**
 * Shape B in-memory implementation — SPIKE only.
 *
 * Reference eventual-consistency commitment store. Per-party actions
 * accumulate; the read-model derives convergence (Drafting /
 * PendingConvergence / Completed / Abandoned) by inspecting the latest
 * non-abandoned per-party `Signed` against the current shared digest.
 */

import type {
  CommitmentBOptions,
  CommitmentReadModel,
  ConvergenceState,
  FieldId,
  GcReport,
  MultiPartyCommitB,
  PartyAction,
  PartyActionLog,
  PartyDeclaration,
  PartyRef,
  ResponseDigest,
} from './port.ts';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface PartyRecord {
  readonly declaration: PartyDeclaration;
  readonly actions: PartyAction[];
}

export function createInMemoryCommitB(options: CommitmentBOptions = {}): MultiPartyCommitB {
  const abandonmentTtlMs = options.abandonmentTtlMs ?? NINETY_DAYS_MS;
  const parties = new Map<PartyRef, PartyRecord>();
  const fieldValues = new Map<FieldId, unknown>();
  let digestCounter = 0;

  function currentDigest(): ResponseDigest {
    const keys = [...fieldValues.keys()].sort();
    const flat = keys.map((k) => `${k}=${JSON.stringify(fieldValues.get(k))}`).join('|');
    return `sha-spike:${digestCounter}:${flat}`;
  }

  function latestAction(record: PartyRecord, kinds: ReadonlyArray<PartyAction['kind']>): PartyAction | undefined {
    for (let i = record.actions.length - 1; i >= 0; i -= 1) {
      const action = record.actions[i];
      if (action && kinds.includes(action.kind)) {
        return action;
      }
    }
    return undefined;
  }

  function isAbandoned(record: PartyRecord): boolean {
    const latest = record.actions[record.actions.length - 1];
    return latest?.kind === 'Abandoned';
  }

  function convergence(digest: ResponseDigest): ConvergenceState {
    if (parties.size === 0) {
      return { kind: 'Drafting' };
    }
    const live = [...parties.entries()].filter(([, r]) => !isAbandoned(r));
    if (live.length === 0) {
      return {
        kind: 'Abandoned',
        tombstones: [...parties.keys()],
      };
    }
    const missing: PartyRef[] = [];
    for (const [ref, record] of live) {
      const signed = latestAction(record, ['Signed']);
      if (!signed || signed.kind !== 'Signed') {
        missing.push(ref);
        continue;
      }
      if (signed.signature.digest !== digest) {
        missing.push(ref);
      }
    }
    if (missing.length === 0) {
      return { kind: 'Completed', targetDigest: digest };
    }
    return { kind: 'PendingConvergence', targetDigest: digest, missing };
  }

  return {
    async addParty(declaration: PartyDeclaration) {
      if (parties.has(declaration.partyRef)) {
        return;
      }
      parties.set(declaration.partyRef, { declaration, actions: [] });
    },

    async applyPartyAction(partyRef: PartyRef, action: PartyAction) {
      const record = parties.get(partyRef);
      if (!record) {
        throw new Error(`unknown party ${partyRef}`);
      }
      if (isAbandoned(record)) {
        throw new Error(`party ${partyRef} is abandoned; actions rejected until GC`);
      }
      if (action.kind === 'Drafted') {
        for (const fieldId of action.fieldEdits.keys()) {
          if (!record.declaration.visibleFields.has(fieldId)) {
            throw new Error(
              `party ${partyRef} cannot edit non-visible field ${fieldId}`,
            );
          }
        }
        for (const [fieldId, value] of action.fieldEdits) {
          fieldValues.set(fieldId, value);
        }
        digestCounter += 1;
      }
      if (action.kind === 'Signed') {
        if (action.signature.partyRef !== partyRef) {
          throw new Error(
            `signature.partyRef ${action.signature.partyRef} does not match action partyRef ${partyRef}`,
          );
        }
      }
      record.actions.push(action);
    },

    read(): CommitmentReadModel {
      const digest = currentDigest();
      const perParty = new Map<PartyRef, PartyActionLog>();
      for (const [ref, record] of parties) {
        perParty.set(ref, {
          partyRef: ref,
          declaration: record.declaration,
          actions: [...record.actions],
        });
      }
      return {
        currentDigest: digest,
        perParty,
        convergence: convergence(digest),
      };
    },

    async garbageCollect(nowMs: number): Promise<GcReport> {
      const tombstonedParties: PartyRef[] = [];
      const droppedActionsByParty = new Map<PartyRef, number>();
      for (const [ref, record] of parties) {
        const latest = record.actions[record.actions.length - 1];
        if (latest?.kind !== 'Abandoned') {
          continue;
        }
        if (latest.observedAtMs + abandonmentTtlMs >= nowMs) {
          continue;
        }
        droppedActionsByParty.set(ref, record.actions.length);
        parties.delete(ref);
        tombstonedParties.push(ref);
      }
      return { tombstonedParties, droppedActionsByParty };
    },
  };
}
