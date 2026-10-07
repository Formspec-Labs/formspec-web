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

async function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const context = { baseUrl: 'https://server.example.test', tenantBinding: { kind: 'bound' as const,
    scope: { tenant: 'tenant', workspace: 'workspace', environment: 'test', cell: 'cell' } } };
  const state = { response: structuredClone(response), version: 1, patchCount: 0, signCount: 0,
    lostPatch: false, lostSign: false, refuseSign: false, signStatus: 200, persistSign: true,
    actor: 'anon:owner', formVersionId: 'publication-1',
    mutateSigned: undefined as ((response: FormResponse) => void) | undefined,
    signGate: undefined as Promise<void> | undefined, getGate: undefined as Promise<void> | undefined, getStatus: 200 };
  const view = () => ({ draft_id: 'owned-draft', form_version_id: state.formVersionId, subject_ref: state.actor,
    draft_version: state.version, draft_state: state.response.data, canonical_response: structuredClone(state.response) });
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
      if (body.expected_draft_version !== state.version) return jsonResponse({ detail: 'stale' }, 409);
      state.version++;
    }
    state.response = structuredClone(body.canonical_response);
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
  const prepare = () => cohort.responseSigning!.prepare({ draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US' });
  const sign = (preparation: PreparedResponseSigning, operationId = generateIdempotencyKey()) => cohort.responseSigning!.sign({
    preparation, assent: { signerName: 'Ada Lovelace', consentAccepted: true }, operationId, action,
  });
  return { cohort, state, requests, prepare, sign, now, values, build, metadata, policy };
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
      formVersionId: 'publication-1', response: unsigned, source, locale: 'en-US' }))
      .rejects.toThrow(/completed unsigned pinned Response/);
    expect(test.state.patchCount).toBe(0);
    expect(test.state.signCount).toBe(0);
  });

  it.each(['source', 'locale'] as const)('refuses invalid authored %s before saving the draft', async field => {
    const test = await fixture();
    await test.cohort.draftStore.save(key, response);
    const input = { draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US' };
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
    await expect(test.build().responseSigning!.prepare({ draftKey: key, definition, formVersionId: 'publication-1', response, source, locale: 'en-US' }))
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
