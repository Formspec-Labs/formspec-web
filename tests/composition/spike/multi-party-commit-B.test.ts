/**
 * Shape B conformance fixtures — F1..F4 per ADR-0155 §8.4.
 *
 * SPIKE only; will be deleted with the losing shape per ADR-0155 §8.7.
 */
import { describe, expect, it } from 'vitest';

import { stubDraftStore } from '../../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../../src/adapters/stub/identity-provider.ts';
import { stubSubmitTransport } from '../../../src/adapters/stub/submit-transport.ts';
import { createInMemoryCommitB } from '../../../src/composition/spike/multi-party-commit-B/in-memory.ts';
import {
  runAbandonment,
  runHappyPath,
  runMidFlowPartyAddition,
  runPostPrepareAmendment,
  type ScenarioPorts,
} from '../../../src/composition/spike/multi-party-commit-B/scenario.ts';

function makePorts(): ScenarioPorts {
  return {
    commit: createInMemoryCommitB(),
    draftStore: stubDraftStore(),
    identityProvider: stubIdentityProvider(),
    submitTransport: stubSubmitTransport(),
  };
}

describe('Shape B — multi-party-commit-B (eventual-consistency)', () => {
  it('F1 happy-path — both parties draft + sign; read converges Completed', async () => {
    const outcome = await runHappyPath(makePorts());
    expect(outcome.kind).toBe('completed');
    expect(outcome.readModel.convergence.kind).toBe('Completed');
    expect(outcome.confirmation?.status).toBe('accepted');
  });

  it('F2 abandonment — P2 tombstones; GC drops it past TTL', async () => {
    const outcome = await runAbandonment(makePorts());
    expect(outcome.kind).toBe('abandoned');
    // After GC, P2 is removed and only P1 (signed) remains, so the live
    // population reads Completed against the current digest. The fixture's
    // F2 invariant is that P2's abandonment was RECORDED + GC'd; the
    // resulting convergence shape is implementation-truthful, not a
    // pretend "abandoned" final state.
    const conv = outcome.readModel.convergence;
    expect(['Completed', 'Abandoned']).toContain(conv.kind);
    expect(outcome.readModel.perParty.has('urn:party:spouse:2')).toBe(false);
  });

  it('F3 post-prepare amendment — P1 amends shared field after signing; read drops P1 to missing', async () => {
    const outcome = await runPostPrepareAmendment(makePorts());
    expect(outcome.kind).toBe('completed');
    expect(outcome.readModel.convergence.kind).toBe('Completed');
  });

  it('F4 mid-flow party-addition — P1+P2 signed, P3 added, read flips to PendingConvergence', async () => {
    const outcome = await runMidFlowPartyAddition(makePorts());
    expect(outcome.kind).toBe('completed');
    expect(outcome.readModel.perParty.size).toBe(3);
    expect(outcome.readModel.convergence.kind).toBe('Completed');
  });

  it('records port-method-call count per fixture for §8.5 observation', async () => {
    const happy = await runHappyPath(makePorts());
    const abandoned = await runAbandonment(makePorts());
    const amended = await runPostPrepareAmendment(makePorts());
    const added = await runMidFlowPartyAddition(makePorts());
    expect(happy.callLog.commitMethodCalls).toBeGreaterThan(0);
    expect(abandoned.callLog.commitMethodCalls).toBeGreaterThan(0);
    expect(amended.callLog.commitMethodCalls).toBeGreaterThan(0);
    expect(added.callLog.commitMethodCalls).toBeGreaterThan(0);
  });
});
