import { afterEach, describe, expect, it, vi } from 'vitest';
import { MixedProofWorkerClient } from '../../../src/adapters/source-worker/general-client.ts';
import { HttpMixedProofReader } from '../../../src/adapters/http/mixed-proof-reader.ts';
import { HttpInitialMixedScreenerHydration } from '../../../src/adapters/http/initial-mixed-screener-hydration.ts';
import { HttpInitialMixedProofReader } from '../../../src/adapters/http/initial-mixed-proof-reader.ts';
import { InitialMixedProofWorkerClient } from '../../../src/adapters/source-worker/client.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import type { FormDefinition } from '../../../src/ports/definition-source.ts';
import type { HydrateScreenerCandidate } from '../../../src/ports/screener-hydration.ts';
import type { InitialInstanceProof } from '../../../src/ports/initial-mixed-proof.ts';
import { mockFixture, at, encode } from '../source-worker/mock-fixture.ts';

// Schema-only boundaries: mocked owning verification does not establish Source semantic success.
async function fixture() {
  const mock = mockFixture(), request = mock.selected.request;
  const definition: FormDefinition = { $formspec: '1.0', url: 'urn:form', version: '1', title: 'Neutral', items: [],
    instances: { facts: { source: 'screening', readonly: true, data: {} }, photo: { source: 'inspection', readonly: true, data: {} } } };
  const definitionHash = await hash(definition);
  const formVersion = { ...request.formVersion, definition_json: JSON.stringify(definition), definition_hash: definitionHash };
  const selection = { evaluationSelection: { ...request.selection, definitionHash }, formVersionHash: await hash(formVersion), sourceRef: 'screening',
    screenerUrl: 'urn:screen', screenerVersion: '1', screenerRawHash: mock.selected.registration.registrationHash,
    screenerHash: mock.selected.registration.registrationHash, allowedTargets: ['apply'], qualificationProfile: 'flat-first-match-v1' as const };
  const selectionHash = await hash(selection);
  const response = { $formspecResponse: '1.0' as const, id: 'neutral', definitionUrl: 'urn:form', definitionVersion: '1', status: 'in-progress' as const, authored: at, data: { name: 'Alex' } };
  const run = { version: 1 as const, scope: request.scope, runId: 'run', revision: 1, selectionHash, owner: request.owner as HydrateScreenerCandidate['run']['run']['owner'],
    answers: {}, answersHash: mock.selected.registration.registrationHash, evaluatedAt: at, determination: {}, determinationHash: mock.selected.registration.registrationHash,
    qualification: { status: 'ready' as const, target: 'apply' }, evidenceRef: 'urn:run', evidenceHash: mock.selected.registration.registrationHash };
  const association = { scope: request.scope, draftId: 'draft', draftVersion: 1, candidateHash: await hash(response), selectionHash,
    owner: run.owner, runId: run.runId, runRevision: run.revision, evidenceHash: run.evidenceHash, associatedAt: at };
  const input: HydrateScreenerCandidate = { saved: { draftKey: { formUrl: 'urn:form', formVersion: '1', subjectRef: 'subject' },
    response, draft: { id: 'draft', version: 1, responseHash: 'neutral' }, actor: { id: 'subject' }, evidence: { draft_id: 'draft', draft_version: 1,
      form_version_id: 'version', subject_ref: 'subject', status: 'in_progress', draft_state: response.data, canonical_response: response } },
    run: { version: 1, purpose: 'formspec.screener.run', selection, run, acceptance: { checkedAt: at, qualification: run.qualification } }, association,
    identity: { issuer: run.owner.authenticated.issuer, subject: run.owner.authenticated.subject, clientId: null }, signal: new AbortController().signal, assertCurrent: () => {} };
  let elapsed = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }));
  const token = vi.fn(async () => 'current-token');
  const config = { source: { baseUrl: 'https://source.test', fetchImpl: fetch, accessToken: token,
    tenantBinding: { kind: 'bound' as const, scope: { tenant: 't', workspace: 'w', environment: 'e', cell: 'c' } } },
    definition, publication: { form_id: 'form', form_version_id: 'version', definition_url: 'urn:form', definition_version: '1', definition_hash: definitionHash, definition },
    selection, selectionHash, formVersion, registration: mock.selected.registration, compositionRegistrationHash: mock.selected.registration.registrationHash,
    monotonicNow: () => elapsed, utcNow: () => '2026-10-10T12:00:05Z', assertCurrent: () => {},
    worker: { module: new Uint8Array([1]), maxModuleBytes: 1, wholeOperationMilliseconds: 10_000, createWorker: () => { throw new Error('mock verification only'); } } };
  const reader = vi.spyOn(HttpInitialMixedProofReader.prototype, 'readAll').mockImplementation(async (_hydration, expected) => {
    const hydration = JSON.parse(new TextDecoder().decode(mock.bundle.hydrationBytes));
    Object.assign(hydration, { scope: expected.scope, owner: expected.owner, selection: expected.selection, sources: expected.sources,
      candidateHash: expected.candidateHash, requestHash: expected.requestHash, formVersionHash: selection.formVersionHash, qualifiedAt: '2026-10-10T12:00:04Z' });
    const native: InitialInstanceProof = { kind: 'native', version: 1, instanceName: 'facts', request: expected,
      records: { snapshot: { selectionHash, selection, formVersion, screenerBytes: [] }, run, association } };
    elapsed = 20;
    return { hydrationBytes: encode(hydration), expectedRequest: expected, proofs: [{ decoded: native, utf8Bytes: encode(native) }, mock.bundle.proofs[1]] };
  });
  const current = vi.fn();
  const verify = vi.spyOn(InitialMixedProofWorkerClient.prototype, 'verify').mockResolvedValue({ outcome: mock.outcome, assertCurrent: current });
  return { input, config, reader, verify, current, token, fetch, setElapsed: (value: number) => { elapsed = value; } };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('initial mixed saved-candidate integration', () => {
  it('selects full request before packets and captures current UTC after proof transport', async () => {
    const f = await fixture(), adapter = new HttpInitialMixedScreenerHydration(f.config);
    const facts = await adapter.hydrate(f.input);
    const selected = f.verify.mock.calls[0][0].request;
    expect(selected.canonicalResponse).toEqual(f.input.saved.response);
    expect(selected.formVersion).toEqual(f.config.formVersion);
    expect(selected.owner).toEqual(f.input.run.run.owner);
    expect(f.verify.mock.calls[0][2]).toMatchObject({ startedMonotonic: 0, currentAtMonotonic: 20, currentAt: '2026-10-10T12:00:05Z' });
    expect(facts.view.version).toBe(2); facts.assertReady();
    adapter.retireFacts(); expect(() => facts.assertCurrent()).toThrow(); adapter.dispose();
  });
  for (const change of ['actor', 'candidate', 'publication', 'extra-source'] as const) {
    it(`refuses changed independent ${change} before credentials`, async () => {
      const f = await fixture();
      if (change === 'actor') Object.assign(f.input.saved, { actor: { id: 'foreign' } });
      if (change === 'candidate') Object.assign(f.input.saved.evidence, { canonical_response: { ...f.input.saved.response, data: { name: 'Different' } } });
      if (change === 'publication') Object.assign(f.config.formVersion, { created_by: 'foreign' });
      if (change === 'extra-source') {
        f.config.definition.instances!.other = { source: 'unselected', readonly: true, data: {} };
        const definitionHash = await hash(f.config.definition);
        Object.assign(f.config.formVersion, { definition_json: JSON.stringify(f.config.definition), definition_hash: definitionHash });
        f.config.publication.definition_hash = definitionHash;
        Object.assign(f.config.selection.evaluationSelection, { definitionHash });
        f.config.selection.formVersionHash = await hash(f.config.formVersion);
        f.config.selectionHash = await hash(f.config.selection);
        Object.assign(f.input.run.run, { selectionHash: f.config.selectionHash });
        Object.assign(f.input.association, { selectionHash: f.config.selectionHash });
      }
      const adapter = new HttpInitialMixedScreenerHydration(f.config);
      await expect(adapter.hydrate(f.input)).rejects.toThrow(change === 'extra-source' ? 'source inventory mismatch' : undefined);
      expect(f.token).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled(); adapter.dispose();
    });
  }
  it('refuses a substituted native run before owning verification', async () => {
    const f = await fixture(), original = f.reader.getMockImplementation()!;
    f.reader.mockImplementation(async (...args) => {
      const bundle = await original(...args), native = bundle.proofs[0].decoded;
      if (native.kind !== 'native') throw new Error('fixture requires native');
      return { ...bundle, proofs: [{ ...bundle.proofs[0], decoded: { ...native, records: { ...native.records, run: { ...native.records.run, revision: 2 } } } }, bundle.proofs[1]] };
    });
    const adapter = new HttpInitialMixedScreenerHydration(f.config);
    await expect(adapter.hydrate(f.input)).rejects.toThrow('custody'); expect(f.verify).not.toHaveBeenCalled(); adapter.dispose();
  });
  it('captures guard and selected limit despite caller mutation during credentials', async () => {
    const f = await fixture(); let current = true;
    Object.assign(f.input, { assertCurrent: () => { if (!current) throw new Error('owner retired'); } });
    f.token.mockImplementation(async () => { current = false; Object.assign(f.input, { assertCurrent: () => {} }); f.config.worker.wholeOperationMilliseconds = 60_000; return 'token'; });
    const adapter = new HttpInitialMixedScreenerHydration(f.config);
    await expect(adapter.hydrate(f.input)).rejects.toThrow('owner retired'); expect(f.fetch).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled(); adapter.dispose();
  });
  it('retains selected deadline when caller changes only worker limits during credentials', async () => {
    const f = await fixture();
    f.token.mockImplementation(async () => { f.config.worker.wholeOperationMilliseconds = 60_000; f.setElapsed(10_000); return 'token'; });
    const adapter = new HttpInitialMixedScreenerHydration(f.config);
    await expect(adapter.hydrate(f.input)).rejects.toThrow('whole deadline expired');
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled(); adapter.dispose();
  });
  it('ends hung credentials at original whole deadline and never starts proof transport', async () => {
    const f = await fixture(); vi.useFakeTimers(); f.config.worker.wholeOperationMilliseconds = 100;
    f.token.mockImplementation(() => new Promise<string>(() => {}));
    const adapter = new HttpInitialMixedScreenerHydration(f.config), pending = adapter.hydrate(f.input);
    const refused = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(101); await refused;
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.reader).not.toHaveBeenCalled(); adapter.dispose();
  });
});

describe('explicit general hydration branch (MOCK owning verifier; schema/guard checks only)', () => {
  async function generalFixture(unavailable = false, currentCheck = false, baseAssociation = false) {
    const f = await fixture();
    const registration = structuredClone(f.config.registration);
    Object.assign(registration.publicDescriptor, { version: 3, outputSchema: {
      url: 'urn:formspec:server:evaluation-composition:3', version: '3', hash: registration.outputSchemaHash, document: '{}' } });
    const originalRun = structuredClone(f.input.run.run);
    const signedResponse = { ...f.input.saved.response, ...(baseAssociation ? { extensions: {
      ...f.input.saved.response.extensions, 'x-formspec-signing-content': { draftVersion: f.input.saved.draft.version - 1 } } } : {}),
      authoredSignatures: [{}] } as unknown as typeof f.input.saved.response;
    const selected = currentCheck ? { ...f.input, saved: { ...f.input.saved, response: signedResponse,
      evidence: { ...f.input.saved.evidence, canonical_response: signedResponse } },
      run: { ...f.input.run, run: { ...f.input.run.run, runId: 'fresh-current-run' } } } : f.input;
    const nativeCurrentCheck = { selectionHash: f.config.selectionHash, runId: selected.run.run.runId, runRevision: selected.run.run.revision };
    const input: HydrateScreenerCandidate = currentCheck ? { saved: selected.saved, run: selected.run,
      identity: selected.identity, signal: selected.signal, assertCurrent: selected.assertCurrent, nativeCurrentCheck } : selected;
    const candidateHash = await hash(input.saved.response);
    const binding = { operation: 'hydrate', scope: f.config.selection.evaluationSelection.scope, owner: input.run.run.owner,
      selection: f.config.selection.evaluationSelection, formVersionHash: f.config.selection.formVersionHash,
      draftId: input.saved.draft.id, draftVersion: input.saved.draft.version, candidateHash, sources: { facts: 'screening', photo: 'inspection' } };
    const hydration = JSON.parse(new TextDecoder().decode(mockFixture().bundle.hydrationBytes));
    Object.assign(hydration, binding, { requestHash: await hash(binding), qualifiedAt: at });
    Object.assign(hydration.providerReceipt, { version: 3, registration, requestHash: hydration.requestHash });
    if (unavailable) hydration.results[1] = { status: 'unavailable', instanceName: 'photo', sourceRef: 'inspection', reason: 'inspection pending' };
    f.fetch.mockImplementation(async () => new Response(encode(hydration), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }));
    const native = { snapshot: { selectionHash: f.config.selectionHash, selection: f.config.selection, formVersion: f.config.formVersion },
      run: originalRun, association: { ...f.input.association!, candidateHash } };
    if (baseAssociation) {
      const unsigned = structuredClone(signedResponse); delete unsigned.authoredSignatures;
      native.association.candidateHash = await hash(unsigned);
      native.association.draftVersion = input.saved.draft.version - 1;
    }
    const reader = vi.spyOn(HttpMixedProofReader.prototype, 'readAll').mockResolvedValue({ hydrationBytes: encode(hydration),
      proofIndexBytes: encode({ version: 1, references: { native: currentCheck ? {} : { facts: native },
        ...(currentCheck ? { nativeCurrentChecks: { facts: { original: native, snapshot: native.snapshot, run: input.run.run } } } : {}), images: {}, initialContext: {}, taskContext: {} }, buffers: [] }), buffers: [] });
    const verify = vi.spyOn(MixedProofWorkerClient.prototype, 'verify').mockImplementation(async (_selected, prepare, lifetime) => {
      await prepare(async () => encode({}), lifetime);
      return { outcome: {} as never, assertCurrent: f.current, refreshRequired: () => false };
    });
    const { worker, ...config } = f.config;
    const adapter = new HttpInitialMixedScreenerHydration({ ...config, registration, generalWorker: {
      ...worker, createWorker: () => { throw new Error('mock verifier only'); } } });
    return { f, input, nativeCurrentCheck, adapter, reader, verify, native };
  }
  it('selects fresh native current checks for the exact unchanged signed candidate without an association command', async () => {
    const { f, input, nativeCurrentCheck, adapter, verify } = await generalFixture(false, true);
    const original = JSON.stringify(input.saved.response);
    const facts = await adapter.hydrate(input);
    expect(facts.nativeCurrentCheck).toEqual(nativeCurrentCheck);
    expect(verify.mock.calls[0][0]).toMatchObject({ nativeCurrentCheck,
      request: { operation: 'hydrate', canonicalResponse: input.saved.response } });
    expect(JSON.parse(String(f.fetch.mock.calls[0]![1]?.body))).toMatchObject({ nativeCurrentCheck });
    expect(JSON.stringify(input.saved.response)).toBe(original); adapter.dispose();
  });
  it('accepts genuine commitment-base custody after Sign advances the revision (MOCK verifier)', async () => {
    const { input, adapter, native } = await generalFixture(false, true, true);
    expect(native.association.draftVersion + 1).toBe(input.saved.draft.version);
    const original = JSON.stringify(input.saved.response);
    const facts = await adapter.hydrate(input);
    expect(facts.nativeCurrentCheck).toEqual(input.nativeCurrentCheck);
    expect(JSON.stringify(input.saved.response)).toBe(original); adapter.dispose();
  });
  it('refuses substituted current-check selectors before HTTP or owning verification', async () => {
    const { f, input, nativeCurrentCheck, adapter, verify } = await generalFixture(false, true);
    if (!input.nativeCurrentCheck) throw new Error('current-check fixture');
    await expect(adapter.hydrate({ ...input, nativeCurrentCheck: { ...nativeCurrentCheck, runId: 'other-run' } })).rejects.toThrow('current check selection mismatch');
    expect(f.fetch).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled(); adapter.dispose();
  });
  it('refuses current-check custody for a different original signed candidate', async () => {
    const { f, input, nativeCurrentCheck, adapter, reader, native } = await generalFixture(false, true);
    reader.mockResolvedValueOnce({ hydrationBytes: encode({}), proofIndexBytes: encode({ version: 1,
      references: { native: {}, nativeCurrentChecks: { facts: { snapshot: native.snapshot, run: input.run.run,
        original: { ...native, association: { ...native.association, candidateHash: 'other-candidate' } } } } }, buffers: [] }), buffers: [] });
    await expect(adapter.hydrate(input)).rejects.toThrow('current native custody mismatch');
    expect(f.fetch).toHaveBeenCalledOnce(); expect(nativeCurrentCheck.runId).toBe('fresh-current-run'); adapter.dispose();
  });
  it('selects general verification explicitly and retains unavailable-result readiness checks', async () => {
    const { f, adapter, reader, verify } = await generalFixture(true);
    const facts = await adapter.hydrate(f.input);
    expect(verify).toHaveBeenCalledOnce(); expect(reader).toHaveBeenCalledOnce(); expect(f.reader).not.toHaveBeenCalled();
    expect(facts.view.providerReceipt).toMatchObject({ version: 3 });
    facts.assertCurrent(); expect(() => facts.assertReady()).toThrow('required source unavailable');
    adapter.retireFacts(); expect(() => facts.assertCurrent()).toThrow(); adapter.dispose();
  });
  it('retains completed general facts beyond the request deadline while enforcing the proof guard', async () => {
    const { f, adapter } = await generalFixture();
    const facts = await adapter.hydrate(f.input);
    f.setElapsed(10_001);
    expect(() => facts.assertReady()).not.toThrow();
    f.current.mockImplementation(() => { throw new Error('proof-expired'); });
    expect(() => facts.assertReady()).toThrow('proof-expired');
    adapter.dispose();
  });
  it('rejects substituted inline native custody before completing general verification', async () => {
    const { f, adapter, reader, native } = await generalFixture();
    const selected = reader.getMockImplementation()!;
    reader.mockImplementation(async (...args) => {
      const value = await selected(...args);
      return { ...value, proofIndexBytes: encode({ version: 1, references: { native: { facts: {
        ...native, run: { ...native.run, revision: 2 } } } }, buffers: [] }) };
    });
    await expect(adapter.hydrate(f.input)).rejects.toThrow('custody'); adapter.dispose();
  });
});
