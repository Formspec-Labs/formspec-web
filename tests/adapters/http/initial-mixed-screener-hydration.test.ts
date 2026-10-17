import { afterEach, describe, expect, it, vi } from 'vitest';
import { MixedProofWorkerClient } from '../../../src/adapters/source-worker/general-client.ts';
import { HttpMixedProofReader } from '../../../src/adapters/http/mixed-proof-reader.ts';
import { HttpInitialMixedScreenerHydration } from '../../../src/adapters/http/initial-mixed-screener-hydration.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import type { FormDefinition } from '../../../src/ports/definition-source.ts';
import type { HydrateScreenerCandidate } from '../../../src/ports/screener-hydration.ts';
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
    generalWorker: { module: new Uint8Array([1]), maxModuleBytes: 1, wholeOperationMilliseconds: 10_000, createWorker: () => { throw new Error('mock verifier only'); } } };
  const current = vi.fn();
  return { input, config, current, token, fetch, setElapsed: (value: number) => { elapsed = value; } };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('general hydration (MOCK owning verifier; schema/guard checks only)', () => {
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
    const hydration = structuredClone(mockFixture().hydration) as { results: object[]; providerReceipt: object; requestHash?: string };
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
      return { outcome: {} as never, assertCurrent: f.current, remainingMilliseconds: () => 60_000, refreshRequired: () => false };
    });
    const adapter = new HttpInitialMixedScreenerHydration({ ...f.config, registration });
    return { f, input, nativeCurrentCheck, adapter, reader, verify, native };
  }
  it('selects fresh native current checks for the exact unchanged signed candidate without an association command', async () => {
    const { f, input, nativeCurrentCheck, adapter, verify } = await generalFixture(false, true);
    const original = JSON.stringify(input.saved.response);
    const facts = await adapter.hydrate(input);
    expect(facts.nativeCurrentCheck).toEqual(nativeCurrentCheck); expect(facts.remainingMilliseconds!()).toBe(60_000);
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
    expect(verify).toHaveBeenCalledOnce(); expect(reader).toHaveBeenCalledOnce();
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
