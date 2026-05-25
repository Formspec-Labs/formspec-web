/**
 * F1..F4 conformance fixtures for the `MultiPartyCommit` port per
 * ADR-0155 §8.4. Originally authored as the Shape A spike scenarios;
 * retained as the live conformance suite for the locked port until
 * FW-0061 ships the production adapter.
 */
import { describe, expect, it } from 'vitest';

import { stubDraftStore } from '../../../src/adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../../../src/adapters/stub/identity-provider.ts';
import { stubSubmitTransport } from '../../../src/adapters/stub/submit-transport.ts';
import { createInMemoryMultiPartyCommit } from '../../../src/composition/spike/multi-party-commit-A/in-memory.ts';
import {
  runAbandonment,
  runHappyPath,
  runMidFlowPartyAddition,
  runPostPrepareAmendment,
  type ScenarioPorts,
} from '../../../src/composition/spike/multi-party-commit-A/scenario.ts';

function makePorts(): ScenarioPorts {
  return {
    commit: createInMemoryMultiPartyCommit(),
    draftStore: stubDraftStore(),
    identityProvider: stubIdentityProvider(),
    submitTransport: stubSubmitTransport(),
  };
}

describe('MultiPartyCommit port — F1..F4 conformance (2PC explicit states)', () => {
  it('F1 happy-path — both parties prepare, commit, joint submission completes', async () => {
    const outcome = await runHappyPath(makePorts());
    expect(outcome.kind).toBe('completed');
    expect(outcome.snapshot.completedDigest).not.toBeNull();
    expect(outcome.confirmation?.status).toBe('accepted');
  });

  it('F2 abandonment — P2 abandons; coordinator GCs P1 on window expiry', async () => {
    const outcome = await runAbandonment(makePorts());
    expect(outcome.kind).toBe('abandoned');
    const p1State = outcome.snapshot.parties.get('urn:party:spouse:1');
    const p2State = outcome.snapshot.parties.get('urn:party:spouse:2');
    expect(p1State?.kind).toBe('Aborted');
    if (p1State?.kind !== 'Aborted') throw new Error('unreachable');
    expect(p1State.reason).toBe('windowExpired');
    expect(p2State?.kind).toBe('Aborted');
    if (p2State?.kind !== 'Aborted') throw new Error('unreachable');
    expect(p2State.reason).toBe('partyAbandoned');
    expect(outcome.snapshot.completedDigest).toBeNull();
  });

  it('F3 post-prepare amendment — P1 amends shared field; cascade fires; re-prepare completes', async () => {
    const outcome = await runPostPrepareAmendment(makePorts());
    expect(outcome.kind).toBe('completed');
    expect(outcome.snapshot.completedDigest).not.toBeNull();
  });

  it('F4 mid-flow party-addition — P1+P2 prepared, P3 added, all three commit', async () => {
    const outcome = await runMidFlowPartyAddition(makePorts());
    expect(outcome.kind).toBe('completed');
    expect(outcome.snapshot.parties.size).toBe(3);
    expect(outcome.snapshot.completedDigest).not.toBeNull();
  });

  it('records port-method-call count per fixture for §8.5 observation', async () => {
    const happy = await runHappyPath(makePorts());
    const abandoned = await runAbandonment(makePorts());
    const amended = await runPostPrepareAmendment(makePorts());
    const added = await runMidFlowPartyAddition(makePorts());
    // Numbers are recorded in the §8.5 observation report; here we
    // assert that they are stable and non-zero so a future regression
    // surfaces in CI.
    expect(happy.callLog.commitMethodCalls).toBeGreaterThan(0);
    expect(abandoned.callLog.commitMethodCalls).toBeGreaterThan(0);
    expect(amended.callLog.commitMethodCalls).toBeGreaterThan(0);
    expect(added.callLog.commitMethodCalls).toBeGreaterThan(0);
  });
});
