/**
 * Shape A scenario harness — SPIKE only.
 *
 * Wires `MultiPartyCommitA` (this shape's new port) with the real
 * `DraftStore`, `IdentityProvider`, and `SubmitTransport` ports per
 * ADR-0155 §5 and §8.4. The four scenario runners exercised by the
 * conformance fixtures live here.
 *
 * Per ADR-0155 §8.5 the §8.4 fixtures are scored on consumer LOC and
 * port-method call counts. To keep the comparison honest, `recordCall`
 * wraps every call to the commitment port; the test harness exposes the
 * count for the observation report.
 */

import type {
  DraftKey,
  DraftStore,
  FormResponse,
} from '../../../ports/draft-store.ts';
import type {
  IdentityClaim,
  IdentityProvider,
} from '../../../ports/identity-provider.ts';
import type {
  IntakeHandoff,
  SubmitConfirmation,
  SubmitTransport,
} from '../../../ports/submit-transport.ts';
import { generateIdempotencyKey } from '../../../shared/idempotency-key.ts';
import type {
  AmendmentResult,
  CommitmentSnapshot,
  FieldId,
  MultiPartyCommitA,
  PartyDeclaration,
  PartyRef,
  PartyState,
  PreparationWindow,
  Signature,
} from './port.ts';

export interface ScenarioPorts {
  readonly commit: MultiPartyCommitA;
  readonly draftStore: DraftStore;
  readonly identityProvider: IdentityProvider;
  readonly submitTransport: SubmitTransport;
}

export interface ScenarioCallLog {
  readonly commitMethodCalls: number;
}

export interface ScenarioOutcome {
  readonly kind: 'completed' | 'pendingConvergence' | 'abandoned';
  readonly confirmation?: SubmitConfirmation;
  readonly snapshot: CommitmentSnapshot;
  readonly callLog: ScenarioCallLog;
}

/** Count every commit-port call so the spike observation tally is honest. */
function instrument(commit: MultiPartyCommitA): {
  wrapped: MultiPartyCommitA;
  callLog: ScenarioCallLog;
} {
  let count = 0;
  const wrapped: MultiPartyCommitA = {
    async addParty(d: PartyDeclaration) {
      count += 1;
      return commit.addParty(d);
    },
    async amend(p: PartyRef, edits: ReadonlyMap<FieldId, unknown>): Promise<AmendmentResult> {
      count += 1;
      return commit.amend(p, edits);
    },
    async prepare(p: PartyRef, w: PreparationWindow): Promise<PartyState> {
      count += 1;
      return commit.prepare(p, w);
    },
    async commit(p: PartyRef, sig: Signature): Promise<PartyState> {
      count += 1;
      return commit.commit(p, sig);
    },
    async abort(p, reason): Promise<PartyState> {
      count += 1;
      return commit.abort(p, reason);
    },
    snapshot(): CommitmentSnapshot {
      count += 1;
      return commit.snapshot();
    },
    async tickClock(now: number): Promise<ReadonlyArray<PartyRef>> {
      count += 1;
      return commit.tickClock(now);
    },
  };
  const callLog = {
    get commitMethodCalls() {
      return count;
    },
  } as ScenarioCallLog;
  return { wrapped, callLog };
}

const FORM_URL = 'https://formspec.example.test/forms/joint-spike';
const WINDOW: PreparationWindow = { windowMs: 60_000 };
const SHARED_FIELD: FieldId = 'jointAddress';
const PARTY_1_FIELD: FieldId = 'p1Name';
const PARTY_2_FIELD: FieldId = 'p2Name';

function partyOneDeclaration(partyRef: PartyRef): PartyDeclaration {
  return {
    partyRef,
    roleId: 'spouse',
    roleClass: 'coEqual',
    visibleFields: new Set([PARTY_1_FIELD, SHARED_FIELD]),
  };
}

function partyTwoDeclaration(partyRef: PartyRef): PartyDeclaration {
  return {
    partyRef,
    roleId: 'spouse',
    roleClass: 'coEqual',
    visibleFields: new Set([PARTY_2_FIELD, SHARED_FIELD]),
  };
}

function partyThreeDeclaration(partyRef: PartyRef): PartyDeclaration {
  return {
    partyRef,
    roleId: 'witness',
    roleClass: 'coEqual',
    visibleFields: new Set([SHARED_FIELD]),
  };
}

async function authenticateParty(idp: IdentityProvider): Promise<IdentityClaim> {
  const [option] = await idp.discover();
  if (!option) throw new Error('no identity option available');
  return idp.authenticate(option);
}

function draftKey(claim: IdentityClaim, partyRef: PartyRef): DraftKey {
  return { formUrl: FORM_URL, subjectRef: claim.subjectRef, partyRef };
}

async function saveDraftSnapshot(
  draftStore: DraftStore,
  key: DraftKey,
  digest: string,
): Promise<void> {
  const response: FormResponse = {
    $formspecResponse: '1.0',
    definitionUrl: FORM_URL,
    definitionVersion: '1.0.0',
    status: 'in-progress',
    data: { digest },
    authored: new Date().toISOString(),
  };
  await draftStore.save(key, response);
}

function makeSignature(partyRef: PartyRef, digest: string): Signature {
  return { partyRef, digest, duressOpaque: new Uint8Array(16) };
}

async function submitJointHandoff(
  transport: SubmitTransport,
  digest: string,
): Promise<SubmitConfirmation> {
  const handoff: IntakeHandoff = {
    $formspecIntakeHandoff: '1.0',
    handoffId: `handoff-spike-${digest.slice(-8)}`,
    initiationMode: 'publicIntake',
    definitionRef: { url: FORM_URL, version: '1.0.0' },
    responseRef: `response:spike:${digest.slice(-8)}`,
    responseHash: `sha256:${digest}`,
    validationReportRef: `validation:spike:${digest.slice(-8)}`,
    intakeSessionId: `intake-session-spike-${digest.slice(-8)}`,
    ledgerHeadRef: `ledger:spike:${digest.slice(-8)}`,
    occurredAt: new Date().toISOString(),
  };
  return transport.submit(handoff, generateIdempotencyKey());
}

/** F1 — happy-path: both parties prepare, both commit, joint submission. */
export async function runHappyPath(ports: ScenarioPorts): Promise<ScenarioOutcome> {
  const { wrapped, callLog } = instrument(ports.commit);
  const claim1 = await authenticateParty(ports.identityProvider);
  const claim2 = await authenticateParty(ports.identityProvider);
  const p1 = 'urn:party:spouse:1';
  const p2 = 'urn:party:spouse:2';

  await wrapped.addParty(partyOneDeclaration(p1));
  await wrapped.addParty(partyTwoDeclaration(p2));

  const amend1 = await wrapped.amend(p1, new Map([[PARTY_1_FIELD, 'Ada'], [SHARED_FIELD, '1 Main']]));
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), amend1.newDigest);

  const amend2 = await wrapped.amend(p2, new Map([[PARTY_2_FIELD, 'Grace']]));
  await saveDraftSnapshot(ports.draftStore, draftKey(claim2, p2), amend2.newDigest);

  const prep1 = await wrapped.prepare(p1, WINDOW);
  const prep2 = await wrapped.prepare(p2, WINDOW);
  if (prep1.kind !== 'Prepared' || prep2.kind !== 'Prepared') {
    throw new Error('expected both parties Prepared after prepare()');
  }
  await wrapped.commit(p1, makeSignature(p1, prep1.preparedDigest));
  await wrapped.commit(p2, makeSignature(p2, prep2.preparedDigest));

  const snap = wrapped.snapshot();
  if (!snap.completedDigest) throw new Error('expected completed snapshot');
  const confirmation = await submitJointHandoff(ports.submitTransport, snap.completedDigest);
  return { kind: 'completed', confirmation, snapshot: snap, callLog };
}

/** F2 — abandonment: P1 prepared, P2 abandons; coordinator GCs P1. */
export async function runAbandonment(ports: ScenarioPorts): Promise<ScenarioOutcome> {
  const { wrapped, callLog } = instrument(ports.commit);
  const claim1 = await authenticateParty(ports.identityProvider);
  const claim2 = await authenticateParty(ports.identityProvider);
  const p1 = 'urn:party:spouse:1';
  const p2 = 'urn:party:spouse:2';

  await wrapped.addParty(partyOneDeclaration(p1));
  await wrapped.addParty(partyTwoDeclaration(p2));
  const amend1 = await wrapped.amend(p1, new Map([[SHARED_FIELD, '1 Main']]));
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), amend1.newDigest);
  await wrapped.prepare(p1, WINDOW);

  await wrapped.abort(p2, 'partyAbandoned');
  await ports.draftStore.delete(draftKey(claim2, p2));
  // Window expiry releases P1 deterministically.
  await wrapped.tickClock(WINDOW.windowMs + 1);

  return { kind: 'abandoned', snapshot: wrapped.snapshot(), callLog };
}

/** F3 — post-prepare amendment: P1 amends after preparing; cascade fires. */
export async function runPostPrepareAmendment(ports: ScenarioPorts): Promise<ScenarioOutcome> {
  const { wrapped, callLog } = instrument(ports.commit);
  const claim1 = await authenticateParty(ports.identityProvider);
  const claim2 = await authenticateParty(ports.identityProvider);
  const p1 = 'urn:party:spouse:1';
  const p2 = 'urn:party:spouse:2';

  await wrapped.addParty(partyOneDeclaration(p1));
  await wrapped.addParty(partyTwoDeclaration(p2));
  const a1 = await wrapped.amend(p1, new Map([[SHARED_FIELD, '1 Main']]));
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), a1.newDigest);
  await saveDraftSnapshot(ports.draftStore, draftKey(claim2, p2), a1.newDigest);

  const prep1 = await wrapped.prepare(p1, WINDOW);
  if (prep1.kind !== 'Prepared') throw new Error('expected Prepared');

  // P1 amends a SHARED field after preparing. Cascade should re-invalidate
  // P1's own Prepared state (the amend changed the digest under it).
  const cascade = await wrapped.amend(p1, new Map([[SHARED_FIELD, '2 Main']]));
  if (!cascade.cascadedParties.includes(p1)) {
    throw new Error('expected P1 to cascade');
  }
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), cascade.newDigest);

  // Both parties re-prepare against the new digest and commit.
  const re1 = await wrapped.prepare(p1, WINDOW);
  const re2 = await wrapped.prepare(p2, WINDOW);
  if (re1.kind !== 'Prepared' || re2.kind !== 'Prepared') {
    throw new Error('expected re-Prepared');
  }
  await wrapped.commit(p1, makeSignature(p1, re1.preparedDigest));
  await wrapped.commit(p2, makeSignature(p2, re2.preparedDigest));

  const snap = wrapped.snapshot();
  if (!snap.completedDigest) throw new Error('expected completed after re-prepare');
  const confirmation = await submitJointHandoff(ports.submitTransport, snap.completedDigest);
  return { kind: 'completed', confirmation, snapshot: snap, callLog };
  // Note: claim2 is materialized to model the second party's IdP session even
  // though it is not referenced again here — kept for parity with F1.
}

/** F4 — mid-flow party-addition: P1+P2 prepared, P3 added; visibility recomputes. */
export async function runMidFlowPartyAddition(ports: ScenarioPorts): Promise<ScenarioOutcome> {
  const { wrapped, callLog } = instrument(ports.commit);
  const claim1 = await authenticateParty(ports.identityProvider);
  const claim2 = await authenticateParty(ports.identityProvider);
  const claim3 = await authenticateParty(ports.identityProvider);
  const p1 = 'urn:party:spouse:1';
  const p2 = 'urn:party:spouse:2';
  const p3 = 'urn:party:witness:3';

  await wrapped.addParty(partyOneDeclaration(p1));
  await wrapped.addParty(partyTwoDeclaration(p2));
  const a1 = await wrapped.amend(p1, new Map([[SHARED_FIELD, '1 Main']]));
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), a1.newDigest);
  await saveDraftSnapshot(ports.draftStore, draftKey(claim2, p2), a1.newDigest);
  await wrapped.prepare(p1, WINDOW);
  await wrapped.prepare(p2, WINDOW);

  // Add a third party AFTER P1+P2 prepared. No field values changed, so
  // P1+P2's preparation must survive; P3 joins at Drafting.
  await wrapped.addParty(partyThreeDeclaration(p3));
  await saveDraftSnapshot(ports.draftStore, draftKey(claim3, p3), a1.newDigest);

  const snap = wrapped.snapshot();
  const p1State = snap.parties.get(p1);
  const p2State = snap.parties.get(p2);
  const p3State = snap.parties.get(p3);
  if (p1State?.kind !== 'Prepared' || p2State?.kind !== 'Prepared') {
    throw new Error('expected P1+P2 to survive party-addition');
  }
  if (p3State?.kind !== 'Drafting') {
    throw new Error('expected P3 to join at Drafting');
  }

  // P3 prepares + commits against the unchanged digest; P1 + P2 commit too.
  const p3Prepared = await wrapped.prepare(p3, WINDOW);
  if (p3Prepared.kind !== 'Prepared') throw new Error('expected P3 Prepared');
  await wrapped.commit(p1, makeSignature(p1, p1State.preparedDigest));
  await wrapped.commit(p2, makeSignature(p2, p2State.preparedDigest));
  await wrapped.commit(p3, makeSignature(p3, p3Prepared.preparedDigest));

  const finalSnap = wrapped.snapshot();
  if (!finalSnap.completedDigest) throw new Error('expected completed after P3 commit');
  const confirmation = await submitJointHandoff(ports.submitTransport, finalSnap.completedDigest);
  return { kind: 'completed', confirmation, snapshot: finalSnap, callLog };
}
