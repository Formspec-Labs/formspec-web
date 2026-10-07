import { describe, expect, it, vi } from 'vitest';
import { detachedSignatureProtectedHeader, encodeCoseSign1 } from '@formspec-org/integrity-cose';
import { canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import type { FormResponse, ResponseActionsDocument, SigningContent } from '@formspec-org/types';
import { createHttpAdapterCohort } from '../../../src/adapters/http/cohort.ts';
import { AnonymousSessionBridge } from '../../../src/adapters/http/anonymous-session.ts';
import { createBrowserDraftResumeMetadataStore } from '../../../src/adapters/browser/draft-resume-metadata.ts';
import { loadCanonicalSigningContentValidator, validateCanonicalFormResponse } from '../../../src/adapters/schema/index.ts';
import { ResponseSigningUnresolvedError, type PreparedResponseSigning } from '../../../src/ports/response-signing.ts';
import { sampleFormDefinition, sampleFormResponse, sampleIntakeHandoff } from '../../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../../src/shared/idempotency-key.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';

const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version };
const source = { ref: `${key.formUrl}#/extensions/x-formspec-signing-content/entries/english`, version: '1.0.0' };
const content: SigningContent = {
  source, locale: 'en-US', documentId: 'declaration', signingIntent: 'urn:formspec:test:intent',
  declaration: 'These are my actual answers.', paperAlternative: 'Request a paper form.',
  affirmationText: 'I affirm these answers.', delegatedSigningNotice: 'The service signs using its key.',
  electronicConsent: { textRef: 'urn:formspec:test:consent', version: '1.0.0', text: 'I agree to sign electronically.', controlLabel: 'I agree' },
};
const definition = { ...sampleFormDefinition, extensions: { 'x-formspec-signing-content': { version: '1.0' as const, entries: { english: content } } } };
const response: FormResponse = { ...sampleFormResponse, id: 'response-stable',
  displayedLocale: { locale: 'en-US', url: 'https://forms.example.test/english', version: '1.0.0' } };
const document: ResponseActionsDocument = {
  $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: key.formUrl },
  actions: [{ id: 'sign', intent: 'x-sign', effects: [{ type: 'serviceRequest', requestRef: 'sign-draft', idempotencyKey: '@invocation.id' }] }],
  'x-formspec-runtime': { version: '1.0', requests: [{ id: 'sign-draft', adapter: 'http-json',
    request: { method: 'POST', pathTemplate: '/drafts/{draftId}/sign', pathBindings: { draftId: { from: 'input', path: 'draftId' } },
      bodyBindings: { '/draft_version': { from: 'input', path: 'draftVersion' }, '/canonical_response': { from: 'input', path: 'frozenResponse' } } }, successStatuses: [200] }] },
};
const action = { document, actionRef: 'sign', requestRef: 'sign-draft', artifactRef: 'https://forms.example.test/actions', artifactDigest: `sha256:${'a'.repeat(64)}` };

function saveAction(method: 'POST' | 'PATCH') {
  const draftAction = structuredClone(action);
  draftAction.actionRef = 'save'; draftAction.requestRef = 'save-draft';
  draftAction.document.actions = [{ id: 'save', intent: 'save-draft', effects: [
    { type: 'serviceRequest', requestRef: 'save-draft', idempotencyKey: '@invocation.id' },
  ] }];
  draftAction.document['x-formspec-runtime'] = { version: '1.0', requests: [{ id: 'save-draft', adapter: 'http-json',
    request: { method, pathTemplate: method === 'POST' ? '/runtime/forms/{formId}/drafts' : '/drafts/{draftId}',
      pathBindings: method === 'PATCH' ? { draftId: { from: 'input' as const, path: 'draftId' } }
        : { formId: { from: 'input' as const, path: 'formId' } },
      bodyBindings: { '/draft_state': { from: 'input', path: 'frozenResponse.data' },
        '/canonical_response': { from: 'input', path: 'frozenResponse' },
        ...(method === 'PATCH' ? { '/expected_draft_version': { from: 'input' as const, path: 'draftVersion' } } : {}) },
    }, successStatuses: [200] }] };
  return draftAction;
}
const prepareAction = saveAction('PATCH');

async function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const context = { baseUrl: 'https://server.example.test', tenantBinding: { kind: 'bound' as const,
    scope: { tenant: 'tenant', workspace: 'workspace', environment: 'test', cell: 'cell' } } };
  const state = { response: structuredClone(response), version: 1, patchCount: 0, signCount: 0,
    createdVersion: 1, mutateSave: undefined as ((response: FormResponse) => void) | undefined, lostCreate: false, createCount: 0, status: 'in_progress' as string | undefined, lostPatch: false, lostSign: false, refuseSign: false, signStatus: 200, persistSign: true,
    actor: 'anon:owner', formVersionId: 'publication-1',
    mutateSigned: undefined as ((response: FormResponse) => void) | undefined,
    createGate: undefined as Promise<void> | undefined, patchGate: undefined as Promise<void> | undefined, signGate: undefined as Promise<void> | undefined, getGate: undefined as Promise<void> | undefined, getStatus: 200 };
  const view = () => ({ draft_id: 'owned-draft', form_version_id: state.formVersionId, subject_ref: state.actor,
    status: state.status, draft_version: state.version, draft_state: state.response.data, canonical_response: structuredClone(state.response) });
  const { fetch, requests } = recordingFetch(async request => {
    if (request.url.endsWith('/sessions/anonymous')) return jsonResponse({ session_id: 'session', session_token: 'owner-token',
      subject_ref: 'anon:owner', form_id: 'conformance', expires_at: '2099-01-01T00:00:00Z' });
    if (request.method === 'GET') { await state.getGate; return jsonResponse(view(), state.getStatus); }
    if (request.url.endsWith('/submit')) return jsonResponse({ response_id: response.id, status: 'accepted' });
    if (request.url.endsWith('/sign')) {
      state.signCount++;
      await state.signGate;
      if (state.refuseSign) throw new Error('ambiguous signing failure');
      const body = request.body as { draft_version: number; canonical_response: FormResponse };
      expect(body.draft_version).toBe(state.version);
      expect(body.canonical_response).toEqual(state.response);
      const signed = await signedResponse(state.response);
      if (!state.persistSign) return jsonResponse({ ...view(), draft_version: state.version + 1, canonical_response: signed }, state.signStatus);
      state.response = signed;
      state.mutateSigned?.(state.response);
      state.version++;
      if (state.lostSign) { state.lostSign = false; throw new Error('lost signing reply'); }
      return jsonResponse(view(), state.signStatus);
    }
    const body = request.body as { canonical_response: FormResponse; expected_draft_version?: number };
    if (request.method === 'PATCH') {
      state.patchCount++;
      await state.patchGate;
      if (body.expected_draft_version !== state.version) return jsonResponse({ detail: 'stale' }, 409);
      state.version++;
    }
    if (request.method === 'POST') { state.createCount++; await state.createGate; state.version = state.createdVersion; }
    state.response = structuredClone(body.canonical_response);
    state.mutateSave?.(state.response);
    if (state.lostCreate && request.method === 'POST') { state.lostCreate = false; throw new Error('lost create reply'); }
    if (state.lostPatch) { state.lostPatch = false; throw new Error('lost patch reply'); }
    return jsonResponse(view());
  });
  const now = vi.fn(() => '2026-10-07T03:00:00.000Z');
  const policy = { validateResponse: validateCanonicalFormResponse,
    validateContent: await loadCanonicalSigningContentValidator(), signingProfileDigest: vi.fn(profileDigest), keyId: 'test-key', now };
  const metadata = createBrowserDraftResumeMetadataStore(context, storage);
  const build = () => {
    const config = { ...context, fetchImpl: fetch, resumeMetadata: metadata };
    return createHttpAdapterCohort({ ...config, responseSigning: policy, anonymousSessions: new AnonymousSessionBridge(config) });
  };
  const cohort = build();
  const prepare = () => cohort.responseSigning!.prepare({ draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US', action: prepareAction });
  const sign = (preparation: PreparedResponseSigning, operationId = generateIdempotencyKey()) => cohort.responseSigning!.sign({
    preparation, assent: { signerName: 'Ada Lovelace', consentAccepted: true }, operationId, action,
  });
  const save = (draftAction = saveAction('POST'), savedResponse = response, operationId = generateIdempotencyKey()) => cohort.responseSigning!.saveDraft({
    formId: 'conformance', draftKey: key, definition, formVersionId: 'publication-1', response: savedResponse, operationId, action: draftAction,
  });
  return { save, cohort, state, requests, prepare, sign, now, values, build, metadata, policy };
}

async function signedResponse(unsigned: FormResponse): Promise<FormResponse> {
  const commitment = unsigned.extensions!['x-formspec-signing-content']!;
  const bytes = encodeCoseSign1(detachedSignatureProtectedHeader(-8, new TextEncoder().encode('test-key'),
    'urn:formspec:sig-method:ed25519-cose-sign1@1'), null, new Uint8Array(64));
  const signatureValue = btoa(String.fromCharCode(...bytes));
  const digest = await profileDigest(unsigned);
  return { ...structuredClone(unsigned), authoredSignatures: [{ signatureId: 'sig_test', ceremonyId: 'ceremony_test',
    signatureProvider: 'urn:formspec:provider:delegated-response@1', documentId: content.documentId, signingIntent: content.signingIntent,
    signatureValue, signerId: commitment.actorRef, signerName: commitment.signerName, consentAccepted: true,
    consentTextRef: content.electronicConsent.textRef, consentVersion: content.electronicConsent.version,
    affirmationText: content.affirmationText, documentHash: commitment.documentHash, documentHashAlgorithm: 'sha-256',
    signedPayload: { canonicalization: 'formspec-response-signing-v1', digestAlgorithm: 'sha-256', digest,
      responseId: unsigned.id!, definitionUrl: unsigned.definitionUrl, definitionVersion: unsigned.definitionVersion,
      signedAt: commitment.signedAt, signingIntent: content.signingIntent } }] };
}

async function profileDigest(response: FormResponse): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', canonicalResponseSignedPayloadBytes(response));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

describe('cohort-owned Response Prepare and Sign', () => {
  it('requires unresolved-operation metadata only when signing is enabled', async () => {
    const test = await fixture();
    const config = { baseUrl: 'https://server.example.test' };
    expect(() => createHttpAdapterCohort(config)).not.toThrow();
    expect(() => createHttpAdapterCohort({ ...config, responseSigning: test.policy }))
      .toThrow(/requires injected draft resume metadata/);
    expect(() => createHttpAdapterCohort({ ...config, responseSigning: test.policy, resumeMetadata: test.metadata }))
      .not.toThrow();
  });

  it('requires an existing owned handle and freezes the saved preparation without inventing assent', async () => {
    const test = await fixture();
    await expect(test.prepare()).rejects.toThrow(/existing owned draft handle/);
    expect(test.requests).toHaveLength(0);
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    expect(prepared.response).toEqual(response);
    expect(prepared.actor.id).toBe('anon:owner');
    expect(prepared.draft).toMatchObject({ id: 'owned-draft', version: 2 });
    expect(prepared.draft.responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(prepared.response.data)).toBe(true);
    expect(prepared.response.extensions?.['x-formspec-signing-content']).toBeUndefined();
    expect(test.now).not.toHaveBeenCalled();
  });

  it('signs once and submits the exact signed object separately through the existing transport', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    const operationId = generateIdempotencyKey();
    const [signed, duplicate] = await Promise.all([test.sign(prepared, operationId), test.sign(prepared, operationId)]);
    expect(duplicate).toEqual(signed);
    expect(test.state.signCount).toBe(1);
    expect(test.now).toHaveBeenCalledOnce();
    expect(signed.draft.version).toBe(4);
    expect(signed.verification).toEqual({ mode: 'delegated-service-key', provider: 'urn:formspec:provider:delegated-response@1', keyId: 'test-key' });
    expect(test.requests.some(request => request.url.endsWith('/submit'))).toBe(false);
    await test.cohort.submitTransport.submit({ ...sampleIntakeHandoff, subjectRef: undefined,
      extensions: { 'x-formspec-response': signed.response } }, generateIdempotencyKey());
    expect((test.requests.at(-1)!.body as { canonical_response: FormResponse }).canonical_response).toEqual(signed.response);
  });

  it('refuses an empty authored signature array required to be omitted by the maintained Response schema', async () => {
    const test = await fixture();
    const unsigned = { ...response, authoredSignatures: [] } as unknown as FormResponse;
    await test.cohort.draftStore.save(key, unsigned);
    await expect(test.cohort.responseSigning!.prepare({ draftKey: key, definition,
      formVersionId: 'publication-1', response: unsigned, source, locale: 'en-US', action: prepareAction }))
      .rejects.toThrow(/completed unsigned pinned Response/);
    expect(test.state.patchCount).toBe(0);
    expect(test.state.signCount).toBe(0);
  });

  it.each(['source', 'locale'] as const)('refuses invalid authored %s before saving the draft', async field => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const input = { draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US', action: prepareAction };
    await expect(test.cohort.responseSigning!.prepare({ ...input,
      ...(field === 'source' ? { source: { ...source, version: 'wrong' } } : { locale: 'fr-FR' }),
    })).rejects.toThrow();
    expect(test.state.patchCount).toBe(0);
    expect(test.state.version).toBe(1);
    expect(test.state.response).toEqual(response);
  });

  it('refuses an authored signing success status that differs from the exact server mapping before PATCH', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const preparation = await test.prepare();
    const incompatible = structuredClone(action);
    incompatible.document['x-formspec-runtime']!.requests[0].successStatuses = [201];
    const revision = test.state.version;
    const patches = test.state.patchCount;
    await expect(test.cohort.responseSigning!.sign({ preparation, operationId: generateIdempotencyKey(),
      assent: { signerName: 'Ada Lovelace', consentAccepted: true }, action: incompatible }))
      .rejects.toThrow(/does not match the exact owned candidate/);
    expect(test.state.version).toBe(revision);
    expect(test.state.patchCount).toBe(patches);
    expect(test.state.signCount).toBe(0);
  });

  it('refuses a raw 201 signing result when owned GET confirms it was not persisted', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    test.state.signStatus = 201;
    test.state.persistSign = false;
    await expect(test.sign(prepared)).rejects.toMatchObject({ status: 201 });
    expect(test.state.response.authoredSignatures).toBeUndefined();
    await expect(test.cohort.submitTransport.submit({ ...sampleIntakeHandoff, subjectRef: undefined,
      extensions: { 'x-formspec-response': test.state.response } }, generateIdempotencyKey()))
      .rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
  });

  it('qualifies a persisted signed result through owned GET after a disallowed 201 reply', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    test.state.signStatus = 201;
    const signed = await test.sign(prepared);
    expect(signed.response).toEqual(test.state.response);
    expect(test.requests.at(-1)!.method).toBe('GET');
  });

  it.each(['lostPatch', 'lostSign'] as const)('reconciles %s through owned GET without changing time or candidate', async failure => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    test.state[failure] = true;
    const signed = await test.sign(prepared);
    expect(signed.response.authoredSignatures).toHaveLength(1);
    expect(test.state.signCount).toBe(1);
    expect(test.now).toHaveBeenCalledOnce();
  });

  it('retries an unchanged frozen act but refuses a changed retry and unresolved reload', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    const operationId = generateIdempotencyKey();
    test.state.refuseSign = true;
    await expect(test.sign(prepared, operationId)).rejects.toThrow(/ambiguous signing failure/);
    const firstBody = test.requests.find(request => request.url.endsWith('/sign'))!.body;
    expect([...test.values.values()].join('')).not.toContain(JSON.stringify(response.data));
    await expect(test.cohort.responseSigning!.sign({ preparation: prepared,
      assent: { signerName: 'Another name', consentAccepted: true }, operationId, action })).rejects.toThrow(/preserve its frozen act/);
    await expect(test.build().responseSigning!.prepare({ draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US', action: prepareAction }))
      .rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    test.state.refuseSign = false;
    await test.sign(prepared, operationId);
    expect(test.requests.filter(request => request.url.endsWith('/sign')).map(request => request.body)).toEqual([firstBody, firstBody]);
    expect(test.now).toHaveBeenCalledOnce();
  });

  it.each(['actor', 'formVersionId'] as const)('refuses mismatched authoritative %s without mutation', async field => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    test.state[field] = 'wrong';
    await expect(test.prepare()).rejects.toThrow(/authoritative Response snapshot/);
    expect(test.state.patchCount).toBe(0);
  });

  it('refuses altered signed payload digest before private writeback', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    test.state.mutateSigned = signed => { signed.authoredSignatures![0].signedPayload.digest = 'a'.repeat(64); };
    await expect(test.sign(prepared)).rejects.toThrow(/evidence differs/);
    await expect(test.cohort.submitTransport.submit({ ...sampleIntakeHandoff, subjectRef: undefined,
      extensions: { 'x-formspec-response': test.state.response } }, generateIdempotencyKey())).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
  });

  it('rechecks authoritative revision before returning a completed Sign retry', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    const operationId = generateIdempotencyKey();
    await test.sign(prepared, operationId);
    test.state.version++;
    await expect(test.sign(prepared, operationId)).rejects.toThrow(/candidate changed/);
    expect(test.state.signCount).toBe(1);
    expect(test.now).toHaveBeenCalledOnce();
  });

  it('refuses a changed CAS base instead of rebasing or posting Sign', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    test.state.version++;
    test.state.response.data.fullName = 'Changed answer';
    await expect(test.sign(prepared)).rejects.toThrow(/candidate changed/);
    expect(test.state.signCount).toBe(0);
    expect(test.state.patchCount).toBe(1);
  });

  it('rejects an unsafe authored path before the candidate PATCH', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    const unsafe = structuredClone(action);
    unsafe.document['x-formspec-runtime']!.requests[0].request.pathTemplate = '//outside.example.test/{draftId}/sign';
    await expect(test.cohort.responseSigning!.sign({ preparation: prepared, assent: { signerName: 'Ada', consentAccepted: true },
      operationId: generateIdempotencyKey(), action: unsafe })).rejects.toThrow(/unsafe/);
    expect(test.state.patchCount).toBe(1);
    expect(test.state.signCount).toBe(0);
  });

  it('rejects a wrong delegated key envelope before private writeback', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    test.state.mutateSigned = signed => {
      const bytes = encodeCoseSign1(detachedSignatureProtectedHeader(-8, new TextEncoder().encode('other-key'),
        'urn:formspec:sig-method:ed25519-cose-sign1@1'), null, new Uint8Array(64));
      signed.authoredSignatures![0].signatureValue = btoa(String.fromCharCode(...bytes));
    };
    await expect(test.sign(prepared)).rejects.toThrow(/key pin/);
  });

  it('fences and drains late Sign before clear, refusing edits and preventing handle resurrection', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare();
    let release!: () => void;
    test.state.signGate = new Promise<void>(resolve => { release = resolve; });
    const signing = test.sign(prepared);
    await vi.waitFor(() => expect(test.state.signCount).toBe(1));
    await expect(test.cohort.draftStore.save(key, response)).rejects.toThrow(/already in progress/);
    const clear = test.cohort.draftStore.delete(key);
    release();
    await expect(signing).rejects.toThrow(/cleared/);
    await clear;
    expect(test.values.size).toBe(0);
    await expect(test.build().draftStore.load(key)).resolves.toBeUndefined();
  });

  it('rejects late owned GET 404 during clear without mutating restored handle state', async () => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    let release!: () => void;
    test.state.getGate = new Promise<void>(resolve => { release = resolve; });
    const prepared = test.prepare();
    await vi.waitFor(() => expect(test.requests.some(request => request.method === 'GET')).toBe(true));
    const clear = test.cohort.draftStore.delete(key);
    test.state.getStatus = 404;
    release();
    await expect(prepared).rejects.toThrow(/cleared/);
    await clear;
    expect(test.values.size).toBe(0);
    test.state.getStatus = 200;
    test.state.getGate = undefined;
    await test.cohort.draftStore.save(key, response);
    await expect(test.build().draftStore.load(key)).resolves.toEqual(response);
  });
});

describe('cohort-owned authored Save', () => {
  it('creates once, joins one frozen operation, returns actual evidence, then saves through owned PATCH', async () => {
    const test = await fixture();
    const operationId = generateIdempotencyKey();
    const [saved, duplicate] = await Promise.all([test.save(saveAction('POST'), response, operationId), test.save(saveAction('POST'), response, operationId)]);
    expect(duplicate).toBe(saved);
    expect(test.state.createCount).toBe(1);
    expect(saved.draft.version).toBe(1);
    expect(saved.evidence).toEqual({ draft_id: 'owned-draft', draft_version: 1, form_version_id: 'publication-1',
      subject_ref: 'anon:owner', canonical_response: response, draft_state: response.data, status: 'in_progress' });
    expect(Object.isFrozen(saved.evidence.canonical_response.data)).toBe(true);
    const changed = { ...response, data: { fullName: 'Changed answer' } };
    const updated = await test.save(saveAction('PATCH'), changed);
    expect(updated.draft.version).toBe(2);
    expect(updated.response).toEqual(changed);
    expect(test.state.patchCount).toBe(1);
    const wire = test.requests.find(request => request.url.endsWith('/drafts') && request.method === 'POST')!.body as Record<string, unknown>;
    expect(wire.canonical_response).toEqual(response);
    expect(wire.anonymous_session_token).toBe('owner-token');
    expect(test.requests.at(-1)!.method).toBe('GET');
    expect([...test.values.values()].join('')).not.toContain(JSON.stringify(response.data));
  });

  it('refuses changed replay inputs rather than writing again', async () => {
    const test = await fixture(); const operationId = generateIdempotencyKey();
    await test.save(saveAction('POST'), response, operationId);
    await expect(test.save(saveAction('PATCH'), { ...response, data: { fullName: 'Other' } }, operationId)).rejects.toThrow('preserve its frozen operation');
    expect(test.state.createCount).toBe(1); expect(test.state.patchCount).toBe(0);
  });

  it.each(['app', 'artifact', 'path', 'body', 'outputs', 'branch', 'version'] as const)('rejects invalid %s before CREATE or session issuance', async field => {
    const test = await fixture(); const invalid = saveAction('POST');
    if (field === 'app') (invalid.document as ResponseActionsDocument).scope = 'app';
    if (field === 'artifact') invalid.artifactDigest = 'unqualified';
    if (field === 'path') invalid.document['x-formspec-runtime']!.requests[0].request.pathTemplate = '/runtime/forms/wrong/{formId}/drafts';
    if (field === 'body') invalid.document['x-formspec-runtime']!.requests[0].request.bodyDefaults = { arbitrary: 'not supported' };
    if (field === 'outputs') invalid.document['x-formspec-runtime']!.requests[0].outputs = { time: { path: '/acceptedAt' } };
    if (field === 'branch') invalid.document['x-formspec-runtime']!.requests[0].request.method = 'PATCH';
    if (field === 'version') invalid.document.targetDefinition!.compatibleVersions = '^2.0.0';
    await expect(test.save(invalid)).rejects.toThrow();
    expect(test.requests).toHaveLength(0); expect(test.values.size).toBe(0);
  });

  it('rejects non-string public output classifications before mutation', async () => {
    const test = await fixture(); const invalid = saveAction('POST');
    invalid.document['x-formspec-runtime']!.requests[0].outputs = { response: { path: '/canonical_response', exposure: 'transition' } };
    await expect(test.save(invalid)).rejects.toThrow('unsupported outputs'); expect(test.requests).toHaveLength(0);
  });

  it('qualifies a declared verified output using actual owned readback', async () => {
    const test = await fixture(); const configured = saveAction('POST');
    configured.document['x-formspec-runtime']!.requests[0].outputs = {
      id: { path: '/draft_id', exposure: 'transition' }, snapshot: { path: '/canonical_response' },
    };
    const saved = await test.save(configured);
    expect(saved.evidence.draft_id).toBe('owned-draft'); expect(saved.evidence.canonical_response).toEqual(response);
    expect('acceptedAt' in saved.evidence).toBe(false); expect('httpStatus' in saved.evidence).toBe(false);
  });

  it('requires metadata storage before dispatching CREATE', async () => {
    const test = await fixture(); vi.spyOn(test.metadata, 'write').mockImplementation(() => { throw new Error('storage unavailable'); });
    await expect(test.save()).rejects.toThrow('storage unavailable'); expect(test.requests).toHaveLength(0);
  });

  it('persists an ambiguous CREATE fence across reload and ordinary writes until explicit Clear', async () => {
    const test = await fixture(); test.state.lostCreate = true;
    await expect(test.save()).rejects.toThrow('lost create reply');
    expect(test.state.createCount).toBe(1);
    expect([...test.values.values()].join('')).not.toContain(JSON.stringify(response.data));
    const fresh = test.build();
    const input = { formId: 'conformance', draftKey: key, definition, formVersionId: 'publication-1', response, operationId: generateIdempotencyKey(), action: saveAction('POST') };
    await expect(fresh.responseSigning!.saveDraft(input)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    await expect(fresh.draftStore.save(key, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    await expect(fresh.responseSigning!.prepare({ draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US', action: prepareAction })).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    expect(test.state.createCount).toBe(1);
    await fresh.draftStore.delete(key);
    expect(test.values.size).toBe(0);
    const recovered = await fresh.responseSigning!.saveDraft({ ...input, operationId: generateIdempotencyKey() });
    expect(recovered.draft.version).toBe(1); expect(test.state.createCount).toBe(2);
  });

  it.each(['actor', 'formVersionId', 'status'] as const)('refuses unqualified initial readback %s and leaves the creation fence', async field => {
    const test = await fixture(); test.state[field] = 'wrong';
    await expect(test.save()).rejects.toThrow('authoritative Response snapshot');
    await expect(test.build().draftStore.save(key, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    expect(test.state.createCount).toBe(1);
  });

  it('refuses absent status rather than fabricating evidence', async () => {
    const test = await fixture(); test.state.status = undefined;
    await expect(test.save()).rejects.toThrow('authoritative Response snapshot');
  });

  it('refuses stale owned CAS without mutation or rebasing', async () => {
    const test = await fixture(); await test.save(); test.state.version++;
    await expect(test.save(saveAction('PATCH'))).rejects.toThrow('changed before Save');
    expect(test.state.patchCount).toBe(0);
  });

  it('reconciles one lost PATCH through exact owned GET, without resending', async () => {
    const test = await fixture(); await test.save(); test.state.lostPatch = true;
    const saved = await test.save(saveAction('PATCH'));
    expect(saved.draft.version).toBe(2); expect(test.state.patchCount).toBe(1);
  });

  it('qualifies mandatory Prepare request before its PATCH', async () => {
    const test = await fixture(); await test.save();
    const invalid = structuredClone(prepareAction);
    invalid.document['x-formspec-runtime']!.requests[0].request.bodyDefaults = { expected_draft_version: 99, arbitrary: true };
    await expect(test.cohort.responseSigning!.prepare({ draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US', action: invalid })).rejects.toThrow('exact private draft operation');
    expect(test.state.patchCount).toBe(0);
    const prepared = await test.prepare(); expect(prepared.evidence.draft_version).toBe(2);
  });

  it('drains late creation during Clear and prevents returned readiness or handle resurrection', async () => {
    const test = await fixture(); let release!: () => void;
    test.state.createGate = new Promise<void>(resolve => { release = resolve; });
    const saved = test.save(); await vi.waitFor(() => expect(test.state.createCount).toBe(1));
    const clear = test.cohort.draftStore.delete(key); release();
    await expect(saved).rejects.toThrow('cleared'); await clear;
    expect(test.values.size).toBe(0); expect(await test.build().draftStore.load(key)).toBeUndefined();
  });
});


it('refuses a created draft at an unexpected initial revision', async () => {
  const test = await fixture(); test.state.createdVersion = 2;
  await expect(test.save()).rejects.toThrow('exact saved Response');
  await expect(test.build().draftStore.save(key, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
  expect(test.state.createCount).toBe(1);
});

it('refuses server-altered canonical readback and retains the initial creation fence', async () => {
  const test = await fixture(); test.state.mutateSave = saved => { saved.data.fullName = 'Altered by server'; };
  await expect(test.save()).rejects.toThrow('exact saved Response');
  await expect(test.build().draftStore.save(key, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
  expect(test.state.createCount).toBe(1);
});

it('does not return owned Save readiness when Clear starts during the PATCH', async () => {
  const test = await fixture(); await test.save(); let release!: () => void;
  test.state.patchGate = new Promise<void>(resolve => { release = resolve; });
  const saving = test.save(saveAction('PATCH'));
  await vi.waitFor(() => expect(test.state.patchCount).toBe(1));
  const clear = test.cohort.draftStore.delete(key); release();
  await expect(saving).rejects.toThrow('cleared'); await clear;
  expect(test.values.size).toBe(0); expect(await test.build().draftStore.load(key)).toBeUndefined();
});

it('refuses completed Save replay after a later operation advances the revision', async () => {
  const test = await fixture(); const operationId = generateIdempotencyKey();
  await test.save(saveAction('POST'), response, operationId);
  await test.save(saveAction('PATCH'), { ...response, data: { fullName: 'Later answer' } });
  const requestCount = test.requests.length;
  await expect(test.save(saveAction('POST'), response, operationId)).rejects.toThrow('retired');
  expect(test.requests).toHaveLength(requestCount);
  expect(test.state.createCount).toBe(1); expect(test.state.patchCount).toBe(1);
});

it('qualifies actual publication form_id before any CREATE and binds it through the authored selector', async () => {
  const test = await fixture();
  await expect(test.cohort.responseSigning!.saveDraft({ formId: 'wrong-server-form', draftKey: key, definition,
    formVersionId: 'publication-1', response, operationId: generateIdempotencyKey(), action: saveAction('POST') }))
    .rejects.toThrow('publication form id');
  expect(test.requests).toHaveLength(0);
  await test.save();
  expect(test.requests.find(request => request.url.endsWith('/drafts'))?.url).toBe('https://server.example.test/runtime/forms/conformance/drafts');
});

it('stores full immutable Definition pins and a stable candidate hash in the unresolved CREATE marker', async () => {
  const test = await fixture(); test.state.lostCreate = true; const operationId = generateIdempotencyKey();
  await expect(test.save(saveAction('POST'), response, operationId)).rejects.toThrow('lost create reply');
  const markers = test.metadata.read('response-draft-create-operations') as Record<string, unknown>[];
  expect(markers).toHaveLength(1);
  expect(markers[0]).toMatchObject({ operationId, definitionUrl: definition.url, definitionVersion: definition.version });
  expect(markers[0].candidateHash).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(markers[0]).sort()).toEqual(['candidateHash', 'definitionUrl', 'definitionVersion', 'operationId', 'scope']);
  const { canonicalResponseHandoffBytes } = await import('@formspec-org/integrity-canonical');
  const digest = await crypto.subtle.digest('SHA-256', canonicalResponseHandoffBytes(response));
  expect(markers[0].candidateHash).toBe([...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
});

it.each(['definitionUrl', 'definitionVersion', 'candidateHash'] as const)('fails closed on malformed CREATE marker %s after reload', async field => {
  const test = await fixture(); test.state.lostCreate = true;
  await expect(test.save()).rejects.toThrow('lost create reply');
  const markers = test.metadata.read('response-draft-create-operations') as Record<string, unknown>[];
  delete markers[0][field]; test.metadata.write('response-draft-create-operations', markers);
  const requestCount = test.requests.length;
  await expect(test.build().draftStore.save(key, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
  expect(test.requests).toHaveLength(requestCount);
});

describe('retiring local response-signing authority', () => {
  it('refuses an old preparation without deleting the owned draft or issuing a Sign', async () => {
    const test = await fixture(); await test.save();
    const prepared = await test.prepare();
    const metadata = [...test.values]; const count = test.requests.length;
    test.cohort.invalidateResponseSigningScope!(key);
    await expect(test.sign(prepared)).rejects.toThrow('invalidated');
    expect(test.requests).toHaveLength(count);
    expect([...test.values]).toEqual(metadata);
    expect(await test.build().draftStore.load(key)).toEqual(prepared.response);
    expect(test.requests.some(request => request.method === 'DELETE')).toBe(false);
  });

  it('keeps late CREATE serialized and retains its uncertainty marker and binding across reload', async () => {
    const test = await fixture(); let release!: () => void;
    test.state.createGate = new Promise<void>(resolve => { release = resolve; });
    const saving = test.save(); await vi.waitFor(() => expect(test.state.createCount).toBe(1));
    const markers = test.metadata.read('response-draft-create-operations');
    test.cohort.invalidateResponseSigningScope!(key);
    await expect(test.save()).rejects.toThrow('already in progress');
    await expect(test.cohort.draftStore.load(key)).rejects.toThrow('already in progress');
    release(); await expect(saving).rejects.toThrow('invalidated');
    expect(test.metadata.read('response-draft-create-operations')).toEqual(markers);
    expect(await test.build().draftStore.load(key)).toEqual(response);
    await expect(test.build().draftStore.save(key, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    expect(test.state.createCount).toBe(1);
    expect(test.requests.some(request => request.method === 'DELETE')).toBe(false);
  });

  it('refuses readiness from a late owned Save while keeping its updated server binding', async () => {
    const test = await fixture(); await test.save(); let release!: () => void;
    test.state.patchGate = new Promise<void>(resolve => { release = resolve; });
    const changed = { ...structuredClone(response), data: { answer: 'Changed' } };
    const saving = test.save(saveAction('PATCH'), changed);
    await vi.waitFor(() => expect(test.state.patchCount).toBe(1));
    test.cohort.invalidateResponseSigningScope!(key);
    await expect(test.save(saveAction('PATCH'), changed)).rejects.toThrow('already in progress');
    release(); await expect(saving).rejects.toThrow('invalidated');
    expect(await test.build().draftStore.load(key)).toEqual(changed);
    expect(test.state.version).toBe(2);
    expect(test.requests.some(request => request.method === 'DELETE')).toBe(false);
  });

  it('retains a pending Sign marker after invalidation even when the dispatched server request completes', async () => {
    const test = await fixture(); await test.save(); const prepared = await test.prepare();
    let release!: () => void;
    test.state.signGate = new Promise<void>(resolve => { release = resolve; });
    const signing = test.sign(prepared);
    await vi.waitFor(() => expect(test.state.signCount).toBe(1));
    const metadata = [...test.values];
    test.cohort.invalidateResponseSigningScope!(key);
    await expect(test.cohort.draftStore.save(key, response)).rejects.toThrow('already in progress');
    release(); await expect(signing).rejects.toThrow('invalidated');
    expect([...test.values]).toEqual(metadata);
    expect(test.state.response.authoredSignatures).toHaveLength(1);
    await expect(test.sign(prepared)).rejects.toThrow('invalidated');
    await expect(test.build().draftStore.save(key, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    expect(test.requests.some(request => request.method === 'DELETE')).toBe(false);
  });
});
