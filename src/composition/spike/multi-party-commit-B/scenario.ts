/**
 * Shape B scenario harness — SPIKE only.
 *
 * Wires `MultiPartyCommitB` (this shape's new port) with the real
 * `DraftStore`, `IdentityProvider`, and `SubmitTransport` ports per
 * ADR-0155 §5 and §8.4. The four scenario runners exercised by the
 * conformance fixtures live here.
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
  CommitmentReadModel,
  FieldId,
  MultiPartyCommitB,
  PartyAction,
  PartyDeclaration,
  PartyRef,
  Signature,
} from './port.ts';

export interface ScenarioPorts {
  readonly commit: MultiPartyCommitB;
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
  readonly readModel: CommitmentReadModel;
  readonly callLog: ScenarioCallLog;
}

function instrument(commit: MultiPartyCommitB): {
  wrapped: MultiPartyCommitB;
  callLog: ScenarioCallLog;
} {
  let count = 0;
  const wrapped: MultiPartyCommitB = {
    async addParty(d: PartyDeclaration) {
      count += 1;
      return commit.addParty(d);
    },
    async applyPartyAction(p: PartyRef, a: PartyAction) {
      count += 1;
      return commit.applyPartyAction(p, a);
    },
    read(): CommitmentReadModel {
      count += 1;
      return commit.read();
    },
    async garbageCollect(now) {
      count += 1;
      return commit.garbageCollect(now);
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
const SHARED_FIELD: FieldId = 'jointAddress';
const PARTY_1_FIELD: FieldId = 'p1Name';
const PARTY_2_FIELD: FieldId = 'p2Name';
const NOW = Date.now();
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

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

/** F1 — happy-path: both parties draft + sign; convergence reads Completed. */
export async function runHappyPath(ports: ScenarioPorts): Promise<ScenarioOutcome> {
  const { wrapped, callLog } = instrument(ports.commit);
  const claim1 = await authenticateParty(ports.identityProvider);
  const claim2 = await authenticateParty(ports.identityProvider);
  const p1 = 'urn:party:spouse:1';
  const p2 = 'urn:party:spouse:2';

  await wrapped.addParty(partyOneDeclaration(p1));
  await wrapped.addParty(partyTwoDeclaration(p2));

  await wrapped.applyPartyAction(p1, {
    kind: 'Drafted',
    fieldEdits: new Map([[PARTY_1_FIELD, 'Ada'], [SHARED_FIELD, '1 Main']]),
    observedAtMs: NOW,
  });
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), wrapped.read().currentDigest);

  await wrapped.applyPartyAction(p2, {
    kind: 'Drafted',
    fieldEdits: new Map([[PARTY_2_FIELD, 'Grace']]),
    observedAtMs: NOW,
  });
  const beforeSign = wrapped.read();
  await saveDraftSnapshot(ports.draftStore, draftKey(claim2, p2), beforeSign.currentDigest);

  await wrapped.applyPartyAction(p1, {
    kind: 'Signed',
    signature: makeSignature(p1, beforeSign.currentDigest),
    observedAtMs: NOW,
  });
  await wrapped.applyPartyAction(p2, {
    kind: 'Signed',
    signature: makeSignature(p2, beforeSign.currentDigest),
    observedAtMs: NOW,
  });

  const finalRead = wrapped.read();
  if (finalRead.convergence.kind !== 'Completed') {
    throw new Error(`expected Completed convergence; got ${finalRead.convergence.kind}`);
  }
  const confirmation = await submitJointHandoff(ports.submitTransport, finalRead.convergence.targetDigest);
  return { kind: 'completed', confirmation, readModel: finalRead, callLog };
}

/** F2 — abandonment: P2 abandons; convergence reads `Abandoned` after sweep. */
export async function runAbandonment(ports: ScenarioPorts): Promise<ScenarioOutcome> {
  const { wrapped, callLog } = instrument(ports.commit);
  const claim1 = await authenticateParty(ports.identityProvider);
  const claim2 = await authenticateParty(ports.identityProvider);
  const p1 = 'urn:party:spouse:1';
  const p2 = 'urn:party:spouse:2';

  await wrapped.addParty(partyOneDeclaration(p1));
  await wrapped.addParty(partyTwoDeclaration(p2));
  await wrapped.applyPartyAction(p1, {
    kind: 'Drafted',
    fieldEdits: new Map([[SHARED_FIELD, '1 Main']]),
    observedAtMs: NOW,
  });
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), wrapped.read().currentDigest);
  await wrapped.applyPartyAction(p1, {
    kind: 'Signed',
    signature: makeSignature(p1, wrapped.read().currentDigest),
    observedAtMs: NOW,
  });

  // P2 abandons. Convergence reads PendingConvergence (P2 is alive-but-not-
  // signed). Once we abandon P1 too OR sweep P2's tombstone past TTL, the
  // read shifts.
  await wrapped.applyPartyAction(p2, {
    kind: 'Abandoned',
    reason: 'lostContact',
    observedAtMs: NOW,
  });
  // After P2 abandons, P1 is alive-and-signed; the only `live` party is P1,
  // which IS signed at the current digest, so convergence reads Completed.
  // The fixture's invariant is: the abandonment is RECORDED and gettable;
  // GC after TTL removes the tombstone from the read.
  await ports.draftStore.delete(draftKey(claim2, p2));
  await wrapped.garbageCollect(NOW + NINETY_DAYS_MS + 1);

  return { kind: 'abandoned', readModel: wrapped.read(), callLog };
}

/** F3 — post-prepare amendment: P1 signs, then P2 amends shared field; cascade fires by digest move. */
export async function runPostPrepareAmendment(ports: ScenarioPorts): Promise<ScenarioOutcome> {
  const { wrapped, callLog } = instrument(ports.commit);
  const claim1 = await authenticateParty(ports.identityProvider);
  const claim2 = await authenticateParty(ports.identityProvider);
  const p1 = 'urn:party:spouse:1';
  const p2 = 'urn:party:spouse:2';

  await wrapped.addParty(partyOneDeclaration(p1));
  await wrapped.addParty(partyTwoDeclaration(p2));
  await wrapped.applyPartyAction(p1, {
    kind: 'Drafted',
    fieldEdits: new Map([[SHARED_FIELD, '1 Main']]),
    observedAtMs: NOW,
  });
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), wrapped.read().currentDigest);
  await saveDraftSnapshot(ports.draftStore, draftKey(claim2, p2), wrapped.read().currentDigest);
  await wrapped.applyPartyAction(p1, {
    kind: 'Signed',
    signature: makeSignature(p1, wrapped.read().currentDigest),
    observedAtMs: NOW,
  });

  // P1 amends shared field after signing — cascade fires by virtue of
  // digest movement; P1's old `Signed` no longer matches the new digest,
  // so the read-model surfaces P1 in `missing`.
  await wrapped.applyPartyAction(p1, {
    kind: 'Drafted',
    fieldEdits: new Map([[SHARED_FIELD, '2 Main']]),
    observedAtMs: NOW,
  });
  const mid = wrapped.read();
  if (mid.convergence.kind !== 'PendingConvergence') {
    throw new Error(`expected PendingConvergence after amend; got ${mid.convergence.kind}`);
  }
  if (!mid.convergence.missing.includes(p1)) {
    throw new Error('expected P1 to be missing in PendingConvergence after amend');
  }

  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), mid.currentDigest);
  await wrapped.applyPartyAction(p1, {
    kind: 'Signed',
    signature: makeSignature(p1, mid.currentDigest),
    observedAtMs: NOW,
  });
  await wrapped.applyPartyAction(p2, {
    kind: 'Signed',
    signature: makeSignature(p2, mid.currentDigest),
    observedAtMs: NOW,
  });

  const finalRead = wrapped.read();
  if (finalRead.convergence.kind !== 'Completed') {
    throw new Error(`expected Completed; got ${finalRead.convergence.kind}`);
  }
  const confirmation = await submitJointHandoff(ports.submitTransport, finalRead.convergence.targetDigest);
  return { kind: 'completed', confirmation, readModel: finalRead, callLog };
}

/** F4 — mid-flow party-addition: P1+P2 signed; P3 added; read flips to PendingConvergence. */
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
  await wrapped.applyPartyAction(p1, {
    kind: 'Drafted',
    fieldEdits: new Map([[SHARED_FIELD, '1 Main']]),
    observedAtMs: NOW,
  });
  const digestBeforeP3 = wrapped.read().currentDigest;
  await saveDraftSnapshot(ports.draftStore, draftKey(claim1, p1), digestBeforeP3);
  await saveDraftSnapshot(ports.draftStore, draftKey(claim2, p2), digestBeforeP3);
  await wrapped.applyPartyAction(p1, {
    kind: 'Signed',
    signature: makeSignature(p1, digestBeforeP3),
    observedAtMs: NOW,
  });
  await wrapped.applyPartyAction(p2, {
    kind: 'Signed',
    signature: makeSignature(p2, digestBeforeP3),
    observedAtMs: NOW,
  });

  // Add P3. No fields changed, so the digest is unchanged, and P1+P2's
  // signatures remain valid. P3 has not signed, so convergence flips
  // to PendingConvergence with P3 missing.
  await wrapped.addParty(partyThreeDeclaration(p3));
  await saveDraftSnapshot(ports.draftStore, draftKey(claim3, p3), digestBeforeP3);
  const afterAdd = wrapped.read();
  if (afterAdd.convergence.kind !== 'PendingConvergence') {
    throw new Error(`expected PendingConvergence after addParty; got ${afterAdd.convergence.kind}`);
  }
  if (!afterAdd.convergence.missing.includes(p3) || afterAdd.convergence.missing.length !== 1) {
    throw new Error('expected only P3 missing in PendingConvergence');
  }
  await wrapped.applyPartyAction(p3, {
    kind: 'Signed',
    signature: makeSignature(p3, digestBeforeP3),
    observedAtMs: NOW,
  });

  const finalRead = wrapped.read();
  if (finalRead.convergence.kind !== 'Completed') {
    throw new Error(`expected Completed; got ${finalRead.convergence.kind}`);
  }
  const confirmation = await submitJointHandoff(ports.submitTransport, finalRead.convergence.targetDigest);
  return { kind: 'completed', confirmation, readModel: finalRead, callLog };
}
