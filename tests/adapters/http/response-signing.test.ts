import type { HttpResponseSigningPolicy } from '../../../src/adapters/http/response-signing.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detachedSignatureProtectedHeader, encodeCoseSign1 } from '@formspec-org/integrity-cose';
import { canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import type { FormResponse, ResponseActionsDocument, SigningContent } from '@formspec-org/types';
import { createHttpAdapterCohort } from '../../../src/adapters/http/cohort.ts';
import { handoffHash } from '../../../src/adapters/http/response-signing.ts';
import { AnonymousSessionBridge } from '../../../src/adapters/http/anonymous-session.ts';
import { createBrowserDraftResumeMetadataStore } from '../../../src/adapters/browser/draft-resume-metadata.ts';
import { loadCanonicalSigningContentValidator, validateCanonicalFormResponse } from '../../../src/adapters/schema/index.ts';
import { ResponseSigningUnresolvedError, type PreparedResponseSigning, type SavedResponseDraft } from '../../../src/ports/response-signing.ts';
import { sampleFormDefinition, sampleFormResponse, sampleIntakeHandoff } from '../../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../../src/shared/idempotency-key.ts';
import type { DraftKey } from '../../../src/ports/draft-store.ts';
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

type CandidateGate = (input: { saved: SavedResponseDraft; operationId: string; assertCurrent: () => void }) => Promise<{ assertCurrent: () => void }>;
async function fixture(stateReading = false, authenticated = false, anonymousSubject = false, earlyCaseCreation?: boolean, preSignCandidate?: CandidateGate, persistentSaving = true, prePrepareCandidate?: HttpResponseSigningPolicy['prePrepareCandidate']) {
  const draftId = earlyCaseCreation === undefined ? 'owned-draft' : 'draft_01a11ca26d05793192f9f01f97ba9c0b';
  const draftKey: DraftKey = authenticated ? { ...key, subjectRef: 'oidc:owner' }
    : anonymousSubject ? { ...key, subjectRef: 'anon:owner' } : key;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const context = { baseUrl: 'https://server.example.test', tenantBinding: { kind: 'bound' as const,
    scope: { tenant: 'tenant', workspace: 'workspace', environment: 'test', cell: 'cell' } } };
  const state = { response: structuredClone(response), version: 1, patchCount: 0, signCount: 0,
    patchProblem: undefined as unknown, patchStatus: 200, createdVersion: 1, mutateSave: undefined as ((response: FormResponse) => void) | undefined, lostCreate: false, createCount: 0, status: 'in_progress' as string | undefined, lostPatch: false, lostSign: false, refuseSign: false, signStatus: 200, persistSign: true,
    actor: authenticated ? 'oidc:owner' : 'anon:owner', token: 'owner-token' as string | undefined,
    tokenGate: undefined as Promise<void> | undefined, formVersionId: 'publication-1',
    mutateSigned: undefined as ((response: FormResponse) => void) | undefined,
    createGate: undefined as Promise<void> | undefined, patchGate: undefined as Promise<void> | undefined, signGate: undefined as Promise<void> | undefined, getGate: undefined as Promise<void> | undefined, getStatus: 200,
    taskDraft: undefined as unknown, applicationStatus: 200, applicationAbsent: false, applicationGate: undefined as Promise<void> | undefined };
  const view = () => ({ draft_id: draftId, form_version_id: state.formVersionId, subject_ref: state.actor,
    status: state.status, draft_version: state.version, draft_state: state.response.data, canonical_response: structuredClone(state.response), ...(state.taskDraft === undefined ? {} : { taskDraft: state.taskDraft }) });
  const { fetch, requests } = recordingFetch(async request => {
    if (authenticated && (!state.token || request.headers.get('authorization') !== `Bearer ${state.token}`)) return jsonResponse({ detail: 'unauthorized' }, 401);
    if (request.url.endsWith('/sessions/anonymous')) return jsonResponse({ session_id: 'session', session_token: 'owner-token',
      subject_ref: 'anon:owner', form_id: 'conformance', expires_at: '2099-01-01T00:00:00Z' });
    if (request.url.endsWith('/application-case')) {
      expect(request.method).toBe('GET');
      await state.applicationGate;
      if (state.applicationStatus !== 200) return jsonResponse({ status: state.applicationStatus, title: 'unavailable', type: 'about:blank' }, state.applicationStatus);
      if (state.applicationAbsent) return jsonResponse(null);
      return jsonResponse({ caseLedgerId: 'urn:wos:real-case', caseReference: 'APP-001', draftRef: `urn:formspec:draft:${draftId}`, status: state.status === 'submitted' ? 'submitted' : 'in-progress' });
    }
    if (request.method === 'GET') { await state.getGate; return jsonResponse(view(), state.getStatus); }
    if (request.url.endsWith('/submit')) return jsonResponse({ response_id: response.id, status: 'accepted' });
    if (request.url.endsWith('/sign')) {
      state.signCount++;
      await state.signGate;
      if (state.refuseSign) throw new Error('ambiguous signing failure');
      const body = request.body as { draft_version: number; canonical_response: FormResponse };
      if (body.draft_version !== state.version) return jsonResponse({ detail: 'stale' }, 409);
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
      if (state.patchStatus !== 200) return jsonResponse(state.patchProblem ?? { detail: 'private URL token subject response' }, state.patchStatus);
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
    validateContent: await loadCanonicalSigningContentValidator(), signingProfileDigest: vi.fn(profileDigest), keyId: 'test-key', now, ...(preSignCandidate ? { preSignCandidate } : {}), ...(prePrepareCandidate ? { prePrepareCandidate } : {}) };
  const statePolicy = { definition: structuredClone(definition), formVersionId: 'publication-1', localeDocuments: [{
    $formspecLocale: '2.0' as const, url: response.displayedLocale!.url, version: response.displayedLocale!.version,
    locale: response.displayedLocale!.locale, target: { kind: 'definition' as const, url: definition.url }, strings: {},
  }] };
  const metadata = createBrowserDraftResumeMetadataStore(context, storage);
  const startAction = structuredClone(action);
  startAction.actionRef = 'start'; startAction.requestRef = 'start';
  startAction.document.actions = [{ id: 'start', intent: 'x-start-application', validation: { profile: 'off', blocking: 'non-blocking', persistence: 'none' },
    effects: [{ type: 'serviceRequest', requestRef: 'start', idempotencyKey: '@invocation.id' }] }];
  startAction.document['x-formspec-runtime'] = { version: '1.0', requests: [{ id: 'start', adapter: 'http-json', request: { method: 'POST',
    pathTemplate: '/drafts/{draftId}/application-case', pathBindings: { draftId: { from: 'input', path: 'draftId' } }, bodyDefaults: {} }, successStatuses: [200] }] };
  const build = () => {
    const config = { ...context, fetchImpl: fetch, resumeMetadata: metadata };
    return createHttpAdapterCohort({ ...config, responseSigning: policy,
      ...(earlyCaseCreation !== undefined ? { applicationLifecycle: { capabilities: { earlyCaseCreation, persistentSaving, formVersionId: 'publication-1' }, action: startAction } } : {}), ...(stateReading ? { qualifiedDraftState: statePolicy } : {}),
      ...(authenticated ? { accessToken: async () => { await state.tokenGate; return state.token; } } : { anonymousSessions: new AnonymousSessionBridge(config) }) });
  };
  const cohort = build();
  const prepare = () => cohort.responseSigning!.prepare({ draftKey, definition, formVersionId: 'publication-1', response, source, locale: 'en-US', action: prepareAction });
  const sign = (preparation: PreparedResponseSigning, operationId = generateIdempotencyKey()) => cohort.responseSigning!.sign({
    preparation, assent: { signerName: 'Ada Lovelace', consentAccepted: true }, operationId, action,
  });
  const save = (draftAction = saveAction('POST'), savedResponse = response, operationId = generateIdempotencyKey()) => cohort.responseSigning!.saveDraft({
    formId: 'conformance', draftKey, definition, formVersionId: 'publication-1', response: savedResponse, operationId, action: draftAction,
  });
  return { save, cohort, state, requests, prepare, sign, now, values, build, metadata, policy, statePolicy, draftKey, draftId };
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
  it('returns the committed Prepare receipt when freshness expires after dispatch and before readback', async () => {
    let expired = false; let guarded = 0; let committed = false; let release!: () => void;
    const readback = new Promise<void>(resolve => { release = resolve; });
    const test = await fixture(false, true, false, undefined, undefined, true, async ({ assertCurrent }) => ({
      assertCurrent: () => { assertCurrent(); guarded++; if (expired) throw new Error('facts expired'); },
    }));
    const saved = await test.save(); const count = test.state.patchCount;
    test.state.mutateSave = () => { expired = true; committed = true; test.state.getGate = readback; };
    const preparing = test.prepare(); await vi.waitFor(() => expect(committed).toBe(true)); release();
    const prepared = await preparing;
    expect(prepared.draft.version).toBe(saved.draft.version + 1); expect(test.state.patchCount).toBe(count + 1); expect(guarded).toBe(1);
    expect(prepared.response).toEqual(test.state.response);
  });
  it('refuses owned Save after host retirement during actual PATCH credential resolution', async () => {
    const test = await fixture(false, true); const saved = await test.save();
    let releaseRead!: () => void; test.state.getGate = new Promise<void>(resolve => { releaseRead = resolve; });
    let current = true; const before = test.requests.length;
    const pending = test.cohort.responseSigning!.saveDraft({ formId: 'conformance', draftKey: test.draftKey,
      definition, formVersionId: 'publication-1', response, operationId: generateIdempotencyKey(), action: saveAction('PATCH') },
      { assertBeforeDispatch() { if (!current) throw Error('host retired'); } });
    const refused = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(test.requests.length).toBeGreaterThan(before));
    let releaseToken!: () => void; test.state.tokenGate = new Promise<void>(resolve => { releaseToken = resolve; });
    releaseRead(); await Promise.resolve(); current = false; releaseToken(); await refused;
    expect(test.state.patchCount).toBe(0); expect(test.state.version).toBe(saved.draft.version);
    expect(test.requests.slice(before).some(request => request.method === 'PATCH')).toBe(false);
  });
  it('does not reconcile a dispatch refusal as this Save even when a same-content successor appears', async () => {
    const test = await fixture(false, true); await test.save(); let calls = 0;
    await expect(test.cohort.responseSigning!.saveDraft({ formId: 'conformance', draftKey: test.draftKey,
      definition, formVersionId: 'publication-1', response, operationId: generateIdempotencyKey(), action: saveAction('PATCH') },
      { assertBeforeDispatch() { if (++calls === 2) { test.state.version++; throw Error('retired before PATCH'); } } })).rejects.toThrow('retired before PATCH');
    expect(test.state.patchCount).toBe(0); expect(calls).toBe(2);
  });
  it('preserves an undefined dispatch refusal without reconciling a concurrent successor', async () => {
    const test = await fixture(false, true); await test.save(); let calls = 0;
    const pending = test.cohort.responseSigning!.saveDraft({ formId: 'conformance', draftKey: test.draftKey,
      definition, formVersionId: 'publication-1', response, operationId: generateIdempotencyKey(), action: saveAction('PATCH') },
      { assertBeforeDispatch() { if (++calls === 2) { test.state.version++; throw undefined; } } });
    await expect(pending).rejects.toBeUndefined(); expect(test.state.patchCount).toBe(0);
  });
  it('refuses a configured Prepare provider without its required dispatch assertion', async () => {
    const test = await fixture(false, true, false, undefined, undefined, true, async () => undefined as unknown as { assertCurrent: () => void });
    const saved = await test.save(); const count = test.state.patchCount;
    await expect(test.prepare()).rejects.toThrow('dispatch assertion');
    expect(test.state.patchCount).toBe(count); expect(test.state.version).toBe(saved.draft.version);
  });
  it('refuses Prepare at dispatch when facts expire during credential resolution, preserving the owned revision', async () => {
    let expired = false; let release!: () => void; let gateReached = false;
    const credentials = new Promise<void>(resolve => { release = resolve; });
    const test = await fixture(false, true, false, undefined, undefined, true, async ({ saved, assertCurrent }) => {
      expect(saved.draft.version).toBe(test.state.version);
      test.state.tokenGate = credentials; gateReached = true;
      return { assertCurrent: () => { assertCurrent(); if (expired) throw new Error('facts expired before dispatch'); } };
    });
    const saved = await test.save(); const count = test.state.patchCount;
    const preparing = test.prepare(); const refused = expect(preparing).rejects.toThrow('Preparation differs');
    await vi.waitFor(() => expect(gateReached).toBe(true)); expired = true; release(); await refused;
    expect(test.state.patchCount).toBe(count); expect(test.state.version).toBe(saved.draft.version);
    expect(test.state.response).toEqual(saved.response);
  });

  it('restores the unsigned saved handle from one qualified owned read without a write', async () => {
    const test = await fixture(true, true); await test.save();
    const before = test.requests.length;
    const state = await test.build().draftStore.readState!(test.draftKey);
    expect(state?.kind).toBe('active');
    if (state?.kind !== 'active') throw new Error('expected active owned draft');
    expect(state.savedDraft).toMatchObject({ draftKey: test.draftKey, response,
      draft: { id: 'owned-draft', version: test.state.version }, actor: { id: test.state.actor },
      evidence: { draft_id: 'owned-draft', draft_version: test.state.version, status: 'in_progress' } });
    expect(state.savedDraft?.draft.responseHash).toBe(await handoffHash(response));
    expect(test.requests.slice(before).every(request => request.method === 'GET')).toBe(true);
    expect(test.state.createCount).toBe(1); expect(test.state.patchCount).toBe(0);
  });

  it('retains and refuses an unresolved create marker before unsigned handle restoration', async () => {
    const test = await fixture(true, true); await test.save();
    const marker = { scope: JSON.stringify({ formId: 'conformance', subject: test.draftKey.subjectRef, party: null }),
      operationId: generateIdempotencyKey(), definitionUrl: response.definitionUrl,
      definitionVersion: response.definitionVersion, candidateHash: await handoffHash(response) };
    test.metadata.write('response-draft-create-operations', [marker]);
    const before = test.requests.length;
    await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    expect(test.metadata.read('response-draft-create-operations')).toEqual([marker]);
    expect(test.requests.slice(before).every(request => request.method === 'GET')).toBe(true);
    expect(test.state.createCount).toBe(1); expect(test.state.patchCount).toBe(0);
  });

  it('resumes an owned draft with explicit unavailable case status and keeps saving its exact handle', async () => {
    const test = await fixture(true, true, false, false); await test.save();
    test.state.applicationStatus = 503;
    const state = await test.build().draftStore.readState!(test.draftKey);
    expect(state).toMatchObject({ kind: 'active', response, applicationLookup: { status: 'unavailable', statusCode: 503 } });
    expect(state?.application).toBeUndefined();
    expect(Object.isFrozen(state?.applicationLookup)).toBe(true);
    await test.cohort.draftStore.save(test.draftKey, { ...response, data: { ...response.data, fullName: 'Saved after unavailable lookup' } });
    expect(test.state.createCount).toBe(1); expect(test.state.patchCount).toBe(1);
    test.state.applicationStatus = 200; test.state.applicationAbsent = true;
    const absent = await test.build().draftStore.readState!(test.draftKey);
    expect(absent?.application).toBeUndefined(); expect(absent?.applicationLookup).toBeUndefined();
  });

  it.each([401, 403, 404])('refuses case lookup %s instead of treating it as unavailable or absent', async status => {
    const test = await fixture(true, true, false, false); await test.save(); test.state.applicationStatus = status;
    await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toMatchObject({ status });
  });

  it('refuses native draft 503 and owner/publication mismatches before optional case recovery', async () => {
    const test = await fixture(true, true, false, false); await test.save(); test.state.applicationStatus = 503;
    test.state.getStatus = 503;
    await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toMatchObject({ status: 503 });
    test.state.getStatus = 200; test.state.actor = 'other';
    await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toThrow('qualified publication');
    test.state.actor = 'oidc:owner'; test.state.formVersionId = 'other';
    await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toThrow('qualified publication');
    expect(test.requests.filter(request => request.url.endsWith('/application-case'))).toHaveLength(0);
  });

  it('retains native submitted authority when optional case lookup is unavailable', async () => {
    const test = await fixture(true, true, false, false); await test.save();
    const prepared = await test.prepare(); await test.sign(prepared); test.state.status = 'submitted'; test.state.version++;
    test.state.applicationStatus = 503;
    const state = await test.build().draftStore.readState!(test.draftKey);
    expect(state).toMatchObject({ kind: 'submitted', response: test.state.response, applicationLookup: { status: 'unavailable', statusCode: 503 } });
  });

  it('rejects unavailable lookup recovery after the held owner is retired', async () => {
    const test = await fixture(true, true, false, false); await test.save(); test.state.applicationStatus = 503;
    let release!: () => void; test.state.applicationGate = new Promise(resolve => { release = resolve; });
    const pending = test.cohort.draftStore.readState!(test.draftKey); const refusal = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(test.requests.some(request => request.url.endsWith('/application-case'))).toBe(true));
    await test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!); release(); await refusal;
  });

  it.each([true, false])('restores the existing case through GET when early creation is %s', async earlyCaseCreation => {
    const test = await fixture(true, true, false, earlyCaseCreation);
    await test.save(); await test.sign(await test.prepare());
    await test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!);
    const writes = test.requests.filter(request => request.method !== 'GET').length;
    for (const submitted of [false, true]) {
      if (submitted) { test.state.status = 'submitted'; test.state.version++; }
      const state = await test.build().draftStore.readState!(test.draftKey);
      expect(state).toMatchObject({ kind: submitted ? 'submitted' : 'active', application: { caseReference: 'APP-001', status: submitted ? 'submitted' : 'in-progress' } });
      expect(test.requests.slice(-2).map(request => request.method)).toEqual(['GET', 'GET']);
      expect(test.requests.at(-1)?.url).toMatch(/application-case$/);
    }
    expect(test.requests.filter(request => request.method !== 'GET')).toHaveLength(writes);
    expect(test.state.createCount).toBe(1); expect(test.state.signCount).toBe(1);
  });
  it('retains only the authenticated locator through withdrawal and requires a fresh owner GET', async () => {
    const test = await fixture(true, true);
    await test.save(); const prepared = await test.prepare(); const signed = await test.sign(prepared);
    await test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!);
    const handles = test.metadata.read('draft-handles');
    expect(handles).toEqual([{ key: test.draftKey, formId: 'conformance', draftId: 'owned-draft', draftVersion: 4, responseId: signed.response.id }]);
    expect(JSON.stringify(handles)).not.toContain('These are my actual answers');
    test.state.token = undefined;
    await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toThrow();
    expect(test.metadata.read('draft-handles')).toEqual(handles);
    test.state.token = 'fresh-owner-token';
    const fresh = test.build(); const recovered = await fresh.draftStore.readState!(test.draftKey);
    expect(recovered).toMatchObject({ kind: 'active', response: signed.response, signed: { response: signed.response, draft: signed.draft, actor: signed.actor } });
    expect(test.requests.at(-1)?.headers.get('authorization')).toBe('Bearer fresh-owner-token');
    await fresh.draftStore.delete(test.draftKey);
    expect(test.metadata.read('draft-handles')).toBeUndefined();
  });
  it.each(['owner', 'publication', 'response-id', 'revision', 'content', 'locale', 'signature', 'missing-signature', 'missing-commitment'] as const)(
    'refuses signed recovery with changed %s and retains its locator', async changed => {
      const test = await fixture(true, true);
      await test.save(); await test.sign(await test.prepare());
      await test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!);
      const handles = structuredClone(test.metadata.read('draft-handles'));
      if (changed === 'owner') test.state.actor = 'different-owner';
      if (changed === 'publication') test.state.formVersionId = 'different-publication';
      if (changed === 'response-id') test.state.response.id = 'different-response';
      if (changed === 'revision') test.state.version++;
      if (changed === 'content') test.state.response.extensions!['x-formspec-signing-content']!.content.declaration = 'Changed wording';
      if (changed === 'locale') test.state.response.displayedLocale!.locale = 'es';
      if (changed === 'signature') test.state.response.authoredSignatures![0].signedPayload!.digest = '0'.repeat(64);
      if (changed === 'missing-signature') delete test.state.response.authoredSignatures;
      if (changed === 'missing-commitment') delete test.state.response.extensions!['x-formspec-signing-content'];
      await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toThrow();
      expect(test.metadata.read('draft-handles')).toEqual(handles);
    });
  it('keeps different subjects from finding the retained signed locator', async () => {
    const test = await fixture(true, true); await test.save(); await test.sign(await test.prepare());
    await test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!);
    const requests = test.requests.length;
    expect(await test.build().draftStore.readState!({ ...test.draftKey, subjectRef: 'oidc:other' })).toBeUndefined();
    expect(test.requests).toHaveLength(requests);
  });
  it.each(['load', 'readState'] as const)('fences late %s after withdrawal without losing the locator', async method => {
    const test = await fixture(true, true); await test.save();
    let finish!: () => void; test.state.getGate = new Promise<void>(resolve => { finish = resolve; });
    const count = test.requests.length;
    const reading = method === 'load' ? test.cohort.draftStore.load(test.draftKey) : test.cohort.draftStore.readState!(test.draftKey);
    const refused = expect(reading).rejects.toThrow(/cleared|invalidated/);
    await vi.waitFor(() => expect(test.requests.length).toBe(count + 1));
    await test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!);
    const handles = structuredClone(test.metadata.read('draft-handles'));
    finish(); await refused;
    expect(test.metadata.read('draft-handles')).toEqual(handles);
  });
  it('retains unresolved signing markers across retirement and refuses restored submission authority', async () => {
    const test = await fixture(true, true); await test.save(); await test.sign(await test.prepare());
    const marker = { scope: JSON.stringify({ formId: 'conformance', subject: test.draftKey.subjectRef, party: null }),
      operationId: generateIdempotencyKey(), draftId: 'owned-draft', version: 3 };
    test.metadata.write('response-signing-operations', [marker]);
    await test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!);
    const recovering = test.build(); const state = await recovering.draftStore.readState!(test.draftKey);
    expect(state).toMatchObject({ kind: 'active', pendingSign: { operationId: marker.operationId } });
    expect(state?.kind === 'active' && state.signed).toBeUndefined();
    await expect(recovering.draftStore.save(test.draftKey, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    expect(test.metadata.read('response-signing-operations')).toEqual([marker]);
    await test.cohort.draftStore.delete(test.draftKey);
    expect(test.metadata.read('response-signing-operations')).toBeUndefined();
  });
  it('preserves anonymous retirement behavior and removes its locator and grant', async () => {
    const test = await fixture(true, false, true); await test.save();
    await test.cohort.draftStore.invalidateSubject('anon:owner');
    expect(test.metadata.read('draft-handles')).toBeUndefined();
    expect(test.metadata.read('grant:conformance')).toBeUndefined();
  });
  it('refuses an obsolete Save before dispatch when retirement occurs during token resolution', async () => {
    const test = await fixture(true, true); await test.save();
    let finish!: () => void; test.state.tokenGate = new Promise<void>(resolve => { finish = resolve; });
    const requests = test.requests.length;
    const saving = test.cohort.draftStore.save(test.draftKey, response);
    const refused = expect(saving).rejects.toThrow(/retired|invalidated/);
    await Promise.resolve(); await Promise.resolve();
    const retiring = test.cohort.draftStore.invalidateSubject(test.draftKey.subjectRef!);
    finish(); await refused; await retiring;
    expect(test.requests).toHaveLength(requests);
  });
  it('scopes saved locators to the selected issuer and client as well as endpoint and tenant', () => {
    const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    const config = { baseUrl: 'https://server.example.test', identityContext: { issuer: 'https://idp.example.test', clientId: 'client-a' } };
    createBrowserDraftResumeMetadataStore(config, storage).write('draft-handles', [{ draftId: 'opaque-reference' }]);
    expect(createBrowserDraftResumeMetadataStore(config, storage).read('draft-handles')).toEqual([{ draftId: 'opaque-reference' }]);
    for (const identityContext of [{ issuer: 'https://other.example.test', clientId: 'client-a' }, { issuer: config.identityContext.issuer, clientId: 'client-b' }]) {
      expect(createBrowserDraftResumeMetadataStore({ ...config, identityContext }, storage).read('draft-handles')).toBeUndefined();
    }
  });
  it('exposes state-aware loading only under explicit qualification and resumes a fresh owner instance from submitted GET', async () => {
    const ordinary = await fixture(); expect(ordinary.cohort.draftStore.readState).toBeUndefined();
    const test = await fixture(true);
    await expect(test.cohort.draftStore.readState!(key)).resolves.toBeUndefined(); expect(test.requests).toHaveLength(0);
    await test.cohort.draftStore.save(key, response); const prepared = await test.prepare(); const signed = await test.sign(prepared);
    const signedRevision = signed.draft.version;
    test.state.status = 'submitted'; test.state.version++;
    const fresh = test.build(); const state = await fresh.draftStore.readState!(key);
    expect(state).toEqual({ kind: 'submitted', response: signed.response, draft: { id: 'owned-draft', version: signedRevision + 1 },
      subjectRef: 'anon:owner', formVersionId: 'publication-1' });
    expect(Object.isFrozen(state!.response.data)).toBe(true);
    expect(test.requests.at(-1)?.headers.get('authorization')).toBe('Bearer owner-token');
    for (const name of ['tenant', 'workspace', 'environment', 'cell']) expect(test.requests.at(-1)?.headers.get(`x-formspec-${name}-id`)).toBe(name === 'environment' ? 'test' : name);
    expect(test.requests.filter(request => request.url.endsWith('/sessions/anonymous'))).toHaveLength(1);
    expect(test.state.signCount).toBe(1); expect(test.state.patchCount).toBe(2);
  });

  it('retains legacy active load and returns an active variant under the qualified reader', async () => {
    const test = await fixture(true); await test.cohort.draftStore.save(key, response);
    await expect(test.cohort.draftStore.readState!(key)).resolves.toMatchObject({ kind: 'active', response,
      savedDraft: { response, draft: { id: 'owned-draft', version: 1 } } });
    await expect(test.cohort.draftStore.load(key)).resolves.toEqual(response);
    test.state.status = 'unknown'; await expect(test.cohort.draftStore.readState!(key)).rejects.toThrow();
  });

  it('refuses a retained owner handle returning 404 without treating it as a fresh draft', async () => {
    const test = await fixture(true); await test.cohort.draftStore.save(key, response);
    const retained = structuredClone(test.metadata.read('draft-handles')); test.state.getStatus = 404;
    await expect(test.build().draftStore.readState!(key)).rejects.toThrow();
    expect(test.metadata.read('draft-handles')).toEqual(retained);
    expect(test.state.createCount).toBe(1);
  });

  it.each(['actor', 'publication', 'data', 'definition', 'id', 'locale-url', 'locale-version', 'locale-code', 'commitment-owner', 'commitment-draft', 'revision', 'signature', 'digest', 'content', 'key'] as const)(
    'refuses submitted %s mismatch without mutating the retained handle or sending writes', async mismatch => {
      const test = await fixture(true); await test.cohort.draftStore.save(key, response);
      const prepared = await test.prepare(); await test.sign(prepared); test.state.status = 'submitted'; test.state.version++;
      const retained = structuredClone(test.metadata.read('draft-handles')); const requests = test.requests.length;
      const value = test.state.response;
      if (mismatch === 'actor') test.state.actor = 'anon:other';
      if (mismatch === 'publication') test.state.formVersionId = 'other-publication';
      if (mismatch === 'data') value.data = { fullName: 'changed after signing' };
      if (mismatch === 'definition') value.definitionVersion = 'other';
      if (mismatch === 'id') value.id = '';
      if (mismatch === 'locale-url') value.displayedLocale!.url = 'https://other.example.test/locale';
      if (mismatch === 'locale-version') value.displayedLocale!.version = 'other';
      if (mismatch === 'locale-code') value.displayedLocale!.locale = 'fr-FR';
      if (mismatch === 'commitment-owner') value.extensions!['x-formspec-signing-content']!.actorRef = 'anon:other';
      if (mismatch === 'commitment-draft') value.extensions!['x-formspec-signing-content']!.draftId = 'other';
      if (mismatch === 'revision') test.state.version++;
      if (mismatch === 'signature') delete value.authoredSignatures;
      if (mismatch === 'digest') value.authoredSignatures![0].signedPayload!.digest = '0'.repeat(64);
      if (mismatch === 'content') value.extensions!['x-formspec-signing-content']!.content.declaration = 'unqualified wording';
      if (mismatch === 'key') test.policy.keyId = 'different-key';
      await expect(test.build().draftStore.readState!(key)).rejects.toThrow();
      expect(test.metadata.read('draft-handles')).toEqual(retained);
      expect(test.requests.slice(requests).every(request => request.method === 'GET')).toBe(true);
    });

  it('refuses missing or expired retained grants before owner GET without issuing a replacement', async () => {
    const test = await fixture(true); await test.cohort.draftStore.save(key, response);
    const retained = test.metadata.read('grant:conformance');
    test.metadata.remove('grant:conformance'); const count = test.requests.length;
    await expect(test.build().draftStore.readState!(key)).rejects.toThrow(/no anonymous owner grant/);
    expect(test.requests).toHaveLength(count);
    test.metadata.write('grant:conformance', { ...retained as object, expiresAt: '2000-01-01T00:00:00Z' });
    await expect(test.build().draftStore.readState!(key)).rejects.toThrow(/expiration/); expect(test.requests).toHaveLength(count);
  });

  it('fences a late submitted owner GET before returning terminal authority or replacing metadata', async () => {
    const test = await fixture(true); await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare(); await test.sign(prepared); test.state.status = 'submitted'; test.state.version++;
    let finish!: () => void; test.state.getGate = new Promise(resolve => { finish = resolve; });
    const fresh = test.build(); const retained = structuredClone(test.metadata.read('draft-handles')); const count = test.requests.length;
    const reading = fresh.draftStore.readState!(key); await vi.waitFor(() => expect(test.requests.length).toBe(count + 1));
    fresh.invalidateResponseSigningScope!(key); finish();
    await expect(reading).rejects.toThrow(/invalidated/); expect(test.metadata.read('draft-handles')).toEqual(retained);
  });

  it('keeps its admitted publication and copied scope when callers mutate them during a read', async () => {
    const test = await fixture(true); await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare(); await test.sign(prepared); test.state.status = 'submitted'; test.state.version++;
    const supplied = { ...key }; let finish!: () => void;
    test.state.getGate = new Promise(resolve => { finish = resolve; });
    const count = test.requests.length; const reading = test.cohort.draftStore.readState!(supplied);
    supplied.formUrl = 'https://different.example.test/form';
    await vi.waitFor(() => expect(test.requests).toHaveLength(count + 1));
    test.statePolicy.definition.url = 'https://different.example.test/form'; test.statePolicy.formVersionId = 'different';
    test.statePolicy.localeDocuments[0].version = 'different'; test.policy.keyId = 'different';
    finish(); await expect(reading).resolves.toMatchObject({ kind: 'submitted', formVersionId: 'publication-1', subjectRef: 'anon:owner' });
  });

  it('fences digest completion during scoped Clear and does not restore a removed handle', async () => {
    const test = await fixture(true); await test.cohort.draftStore.save(key, response);
    const prepared = await test.prepare(); await test.sign(prepared); test.state.status = 'submitted'; test.state.version++;
    let finish!: (value: string) => void; const digest = await profileDigest(test.state.response);
    test.policy.signingProfileDigest.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const fresh = test.build(); const reading = fresh.draftStore.readState!(key);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const clear = fresh.draftStore.delete(key); finish(digest);
    await expect(reading).rejects.toThrow(/cleared or invalidated/); await clear;
    expect(test.metadata.read('draft-handles')).toBeUndefined(); expect(test.metadata.read('grant:conformance')).toBeUndefined();
  });

  it('requires complete deployment scope and a configured signing policy for terminal recovery', async () => {
    const test = await fixture(true);
    expect(() => createHttpAdapterCohort({ baseUrl: 'https://server.example.test', qualifiedDraftState: test.statePolicy }))
      .toThrow(/signing policy/);
    expect(() => createHttpAdapterCohort({ baseUrl: 'https://server.example.test', responseSigning: test.policy,
      resumeMetadata: test.metadata, qualifiedDraftState: test.statePolicy })).toThrow(/four tenant scope/);
  });

  it('refuses a non-200 owner read without discarding the retained handle', async () => {
    const test = await fixture(true); await test.cohort.draftStore.save(key, response);
    const retained = structuredClone(test.metadata.read('draft-handles')); test.state.getStatus = 201;
    await expect(test.build().draftStore.readState!(key)).rejects.toThrow();
    expect(test.metadata.read('draft-handles')).toEqual(retained);
  });

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


describe('exact saved Sign candidate gate', () => {
  it('qualifies the commitment-bearing revision before dispatch with frozen full evidence', async () => {
    const calls: Parameters<CandidateGate>[0][] = [];
    const gate = vi.fn(async (input: Parameters<CandidateGate>[0]) => {
      calls.push(input);
      expect(test.state.signCount).toBe(0);
      expect(Object.isFrozen(input.saved.response.data)).toBe(true);
      expect(Object.isFrozen(input.saved.evidence)).toBe(true);
      input.assertCurrent();
      return { assertCurrent: vi.fn() };
    });
    const test = await fixture(false, true, false, undefined, gate);
    await test.save();
    const prepared = await test.prepare();
    const operationId = generateIdempotencyKey();
    await test.sign(prepared, operationId);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.operationId).toBe(operationId);
    expect(calls[0]?.saved.draft.version).toBe(prepared.draft.version + 1);
    expect(calls[0]?.saved.response.extensions?.['x-formspec-signing-content']).toMatchObject({
      consentAccepted: true, signerName: 'Ada Lovelace', draftVersion: prepared.draft.version + 1,
    });
    expect(calls[0]?.saved.response).toEqual(calls[0]?.saved.evidence.canonical_response);
    expect(test.state.signCount).toBe(1);
  });

  it('retains the same frozen act after a gate refusal and skips gates after committed recovery', async () => {
    const calls: Parameters<CandidateGate>[0][] = [];
    let ready = false;
    const gate: CandidateGate = async input => {
      calls.push(input);
      if (!ready) throw new Error('association pending');
      return { assertCurrent() {} };
    };
    const test = await fixture(false, true, false, undefined, gate);
    await test.save();
    const prepared = await test.prepare();
    const operationId = generateIdempotencyKey();
    await expect(test.sign(prepared, operationId)).rejects.toThrow('association pending');
    expect(test.state.signCount).toBe(0);
    const patches = test.state.patchCount;
    ready = true;
    const signed = await test.sign(prepared, operationId);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.saved).toEqual(calls[0]?.saved);
    expect(test.state.patchCount).toBe(patches);
    expect(test.now).toHaveBeenCalledTimes(1);
    await expect(test.sign(prepared, operationId)).resolves.toEqual(signed);
    expect(calls).toHaveLength(2);
    expect(test.state.signCount).toBe(1);
  });

  it('refuses a configured gate without its required dispatch assertion', async () => {
    const gate = (async () => undefined) as unknown as CandidateGate;
    const test = await fixture(false, true, false, undefined, gate);
    await test.save();
    const prepared = await test.prepare();
    await expect(test.sign(prepared)).rejects.toThrow('dispatch assertion');
    expect(test.state.signCount).toBe(0);
  });

  it('rechecks qualification after delayed credential resolution and before any Sign dispatch', async () => {
    let ready = true;
    let release!: () => void;
    let called = false;
    const gate: CandidateGate = async () => {
      test.state.tokenGate = new Promise<void>(resolve => { release = resolve; });
      called = true;
      return { assertCurrent() { if (!ready) throw new Error('proof expired'); } };
    };
    const test = await fixture(false, true, false, undefined, gate);
    await test.save();
    const prepared = await test.prepare();
    const pending = test.sign(prepared);
    await vi.waitFor(() => expect(called).toBe(true));
    ready = false;
    release();
    await expect(pending).rejects.toThrow('proof expired');
    expect(test.state.signCount).toBe(0);
  });

  it('preserves committed Sign success when evidence expires after dispatch', async () => {
    let ready = true;
    const assertCurrent = vi.fn(() => { if (!ready) throw new Error('proof expired'); });
    const gate: CandidateGate = async () => ({ assertCurrent });
    const test = await fixture(false, true, false, undefined, gate);
    await test.save();
    const prepared = await test.prepare();
    let release!: () => void;
    test.state.signGate = new Promise<void>(resolve => { release = resolve; });
    const pending = test.sign(prepared);
    await vi.waitFor(() => expect(test.state.signCount).toBe(1));
    ready = false;
    release();
    await expect(pending).resolves.toMatchObject({ verification: { mode: 'delegated-service-key' } });
    expect(assertCurrent).toHaveBeenCalledTimes(1);
  });

  it('fences an owner or edit generation change while candidate qualification is pending', async () => {
    let release!: (value: { assertCurrent: () => void }) => void;
    let captured: SavedResponseDraft | undefined;
    const gate: CandidateGate = async input => {
      captured = input.saved;
      return new Promise(resolve => { release = resolve; });
    };
    const test = await fixture(false, true, false, undefined, gate);
    await test.save();
    const prepared = await test.prepare();
    const pending = test.sign(prepared);
    await vi.waitFor(() => expect(captured).toBeDefined());
    test.cohort.invalidateResponseSigningScope!(test.draftKey);
    release({ assertCurrent() {} });
    await expect(pending).rejects.toThrow('invalidated');
    expect(test.state.signCount).toBe(0);
    expect(test.state.response).toEqual(captured?.response);
  });

  it('does not qualify a contradictory commitment-bearing saved readback', async () => {
    const gate = vi.fn(async () => ({ assertCurrent() {} }));
    const test = await fixture(false, true, false, undefined, gate);
    await test.save();
    const prepared = await test.prepare();
    test.state.mutateSave = candidate => { candidate.data.fullName = 'Crossed candidate'; };
    await expect(test.sign(prepared)).rejects.toThrow();
    expect(gate).not.toHaveBeenCalled();
    expect(test.state.signCount).toBe(0);
  });

});


describe('owned pending Sign recovery after pre-dispatch qualification failure', () => {
  async function pendingFixture() {
    let ready = false;
    const gate = vi.fn(async (_input: Parameters<CandidateGate>[0]) => { if (!ready) throw new Error('native evidence expired'); return { assertCurrent() {} }; });
    const test = await fixture(true, true, false, undefined, gate);
    await test.save(); const prepared = await test.prepare(); const operationId = generateIdempotencyKey();
    await expect(test.sign(prepared, operationId)).rejects.toThrow('native evidence expired');
    expect(test.state.signCount).toBe(0);
    return { test, prepared, operationId, gate, ready: () => { ready = true; } };
  }
  it('fences the old revision, preserves its candidate, and requires fresh assent with a new Sign key', async () => {
    const { test, operationId, gate, ready } = await pendingFixture();
    const candidate = structuredClone(test.state.response); const revision = test.state.version; const patches = test.state.patchCount;
    const restored = test.build();
    const state = await restored.draftStore.readState!(test.draftKey);
    if (state?.kind !== 'active' || !state.pendingSign) throw new Error('Pending Sign state required');
    expect(state.pendingSign.operationId).toBe(operationId); expect(state.response).toEqual(candidate);
    await expect(restored.draftStore.save(test.draftKey, response)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    const result = await restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state.response, source, locale: 'en-US', action }, operationId);
    if (result.kind !== 'prepared') throw new Error('Prepared successor required');
    const successor = structuredClone(candidate); delete successor.extensions?.['x-formspec-signing-content'];
    expect(result.operationId).not.toBe(operationId); expect(result.preparation.response).toEqual(successor);
    expect(result.preparation.draft.version).toBe(revision + 1); expect(test.state.patchCount).toBe(patches + 1);
    expect(test.metadata.read('response-signing-operations')).toMatchObject([{ operationId, version: revision,
      renewal: { operationId: result.operationId, originalCandidate: candidate, version: revision + 1 } }]);
    await expect(restored.responseSigning!.sign({ preparation: result.preparation, operationId, action,
      assent: { signerName: 'Ada Lovelace', consentAccepted: true } })).rejects.toThrow();
    ready(); test.now.mockReturnValue('2026-10-10T23:45:00.000Z');
    const signed = await restored.responseSigning!.sign({ preparation: result.preparation, operationId: result.operationId, action,
      assent: { signerName: 'Ada Lovelace', consentAccepted: true } });
    expect(signed.response.data).toEqual(candidate.data); expect(gate).toHaveBeenCalledTimes(2);
    expect(signed.response.extensions?.['x-formspec-signing-content']).toMatchObject({ draftVersion: revision + 2, signedAt: '2026-10-10T23:45:00.000Z' });
    const request = test.requests.find(item => item.url.endsWith('/sign'))!;
    expect(request.headers.get('idempotency-key')).toBe(result.operationId);
    expect((request.body as { draft_version: number }).draft_version).toBe(revision + 2);
    expect(test.metadata.read('response-signing-operations')).toBeUndefined();
  });
  it('reconciles a lost Save reply and reloads the same prepared successor without another Save', async () => {
    const { test, operationId } = await pendingFixture(); const candidate = structuredClone(test.state.response); const revision = test.state.version;
    test.state.lostPatch = true;
    const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    const result = await restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    expect(result.kind).toBe('prepared'); const patches = test.state.patchCount;
    const reloaded = test.build(); const fresh = await reloaded.draftStore.readState!(test.draftKey);
    expect(fresh).toMatchObject({ kind: 'active', pendingSign: { operationId } });
    const again = await reloaded.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: fresh!.response, source, locale: 'en-US', action }, operationId);
    expect(again).toEqual(result); expect(test.state.patchCount).toBe(patches); expect(test.state.version).toBe(revision + 1);
    expect(test.metadata.read('response-signing-operations')).toMatchObject([{ renewal: { originalCandidate: candidate } }]);
  });
  it('conditionally renews an already-clean unsigned revision for a new native screening association', async () => {
    const { test, operationId } = await pendingFixture(); const original = structuredClone(test.state.response); const revision = test.state.version;
    const initial = test.build(); const state = await initial.draftStore.readState!(test.draftKey);
    const first = await initial.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    if (first.kind !== 'prepared') throw new Error('Prepared successor required');
    const fresh = test.build(); const current = await fresh.draftStore.readState!(test.draftKey); test.state.lostPatch = true;
    const next = await fresh.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: current!.response, source, locale: 'en-US', action, renewUnsignedRevision: true }, operationId);
    if (next.kind !== 'prepared') throw new Error('Prepared successor required');
    expect(next.preparation.response).toEqual(first.preparation.response); expect(next.preparation.response.data).toEqual(original.data);
    expect(next.preparation.draft.version).toBe(revision + 2); expect(next.operationId).not.toBe(first.operationId);
    expect(test.metadata.read('response-signing-operations')).toMatchObject([{ operationId, renewal: {
      originalCandidate: original, previousVersion: revision + 1, version: revision + 2, operationId: next.operationId } }]);
    const patches = test.state.patchCount; const reloaded = test.build(); const reread = await reloaded.draftStore.readState!(test.draftKey);
    expect(await reloaded.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: reread!.response, source, locale: 'en-US', action }, operationId)).toEqual(next);
    expect(test.state.patchCount).toBe(patches);
  });
  it('returns the verified old signature when Sign wins the conditional Save race', async () => {
    const { test, operationId } = await pendingFixture(); const candidate = structuredClone(test.state.response); const revision = test.state.version;
    const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    let release!: () => void; test.state.patchGate = new Promise(resolve => { release = resolve; }); const patches = test.state.patchCount;
    const recovery = restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    await vi.waitFor(() => expect(test.state.patchCount).toBe(patches + 1));
    test.state.response = await signedResponse(candidate); test.state.version++; release();
    const result = await recovery;
    expect(result).toMatchObject({ kind: 'signed', signed: { draft: { version: revision + 1 }, response: { authoredSignatures: [expect.anything()] } } });
    expect(test.state.response.extensions).toEqual(candidate.extensions); expect(test.metadata.read('response-signing-operations')).toBeUndefined();
    expect(test.state.signCount).toBe(0);
  });
  it('reconciles old signed state after reload without creating a new preparation', async () => {
    const { test, operationId } = await pendingFixture(); test.state.response = await signedResponse(test.state.response); test.state.version++;
    const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    const patches = test.state.patchCount;
    const result = await restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    expect(result.kind).toBe('signed'); expect(test.state.patchCount).toBe(patches);
  });
  it('refuses renewal before Save if its metadata cannot be retained', async () => {
    const { test, operationId } = await pendingFixture(); const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    const patches = test.state.patchCount; vi.spyOn(test.metadata, 'write').mockImplementation(() => { throw new Error('metadata unavailable'); });
    await expect(restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId)).rejects.toThrow('metadata unavailable');
    expect(test.state.patchCount).toBe(patches); expect(test.state.signCount).toBe(0);
  });
  it('keeps an interrupted fence recoverable when authority retires after Save dispatch', async () => {
    const { test, operationId } = await pendingFixture(); const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    let release!: () => void; test.state.patchGate = new Promise(resolve => { release = resolve; }); const patches = test.state.patchCount;
    const recovery = restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    const refusal = expect(recovery).rejects.toThrow('invalidated');
    await vi.waitFor(() => expect(test.state.patchCount).toBe(patches + 1)); restored.invalidateResponseSigningScope!(test.draftKey); release(); await refusal;
    const fresh = test.build(); const retained = await fresh.draftStore.readState!(test.draftKey);
    expect(retained).toMatchObject({ kind: 'active', pendingSign: { operationId } });
    const resumed = await fresh.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: retained!.response, source, locale: 'en-US', action }, operationId);
    expect(resumed.kind).toBe('prepared'); expect(test.state.patchCount).toBe(patches + 1);
  });
  it('fences a previously dispatched old Sign paused before its server revision check', async () => {
    const { test, prepared, operationId, ready } = await pendingFixture(); ready();
    let release!: () => void; test.state.signGate = new Promise(resolve => { release = resolve; });
    const oldSign = test.sign(prepared, operationId); const refused = expect(oldSign).rejects.toThrow();
    await vi.waitFor(() => expect(test.state.signCount).toBe(1));
    const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    const renewed = await restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    expect(renewed.kind).toBe('prepared'); release(); await refused;
    expect(test.state.response.authoredSignatures).toBeUndefined();
    if (renewed.kind !== 'prepared') throw new Error('Prepared successor required');
    const signed = await restored.responseSigning!.sign({ preparation: renewed.preparation, operationId: renewed.operationId, action,
      assent: { signerName: 'Ada Lovelace', consentAccepted: true } });
    expect(signed.response.authoredSignatures).toHaveLength(1); expect(test.state.signCount).toBe(2);
    expect(test.requests.filter(item => item.url.endsWith('/sign')).map(item => item.headers.get('idempotency-key'))).toEqual([operationId, renewed.operationId]);
  });
  it.each(['candidate', 'higher-revision', 'metadata'] as const)('keeps a renewed successor closed when %s changes', async mismatch => {
    const { test, operationId } = await pendingFixture(); const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    await restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    const patches = test.state.patchCount;
    if (mismatch === 'candidate') test.state.response.data = { changed: true };
    if (mismatch === 'higher-revision') test.state.version++;
    if (mismatch === 'metadata') {
      const markers = test.metadata.read('response-signing-operations') as { renewal: { originalCandidate: FormResponse } }[];
      markers[0].renewal.originalCandidate.data = { changed: true }; test.metadata.write('response-signing-operations', markers);
    }
    await expect(test.build().draftStore.readState!(test.draftKey)).rejects.toThrow();
    expect(test.state.patchCount).toBe(patches); expect(test.state.signCount).toBe(0);
  });
  it('does not repeat the fence for a duplicate stale recovery call', async () => {
    const { test, operationId } = await pendingFixture(); const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    const input = { draftKey: test.draftKey, definition, formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action };
    await restored.responseSigning!.restorePending!(input, operationId); const patches = test.state.patchCount;
    await expect(restored.responseSigning!.restorePending!(input, operationId)).rejects.toThrow(); expect(test.state.patchCount).toBe(patches);
  });
  it('refuses a non-durable metadata write before the conditional Save', async () => {
    const { test, operationId } = await pendingFixture(); const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    const patches = test.state.patchCount; vi.spyOn(test.metadata, 'write').mockImplementation(() => {});
    await expect(restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId)).rejects.toThrow();
    expect(test.state.patchCount).toBe(patches);
  });
  it('cannot retry past a non-durable new Sign marker after renewal', async () => {
    const { test, operationId, ready } = await pendingFixture(); const restored = test.build(); const state = await restored.draftStore.readState!(test.draftKey);
    const result = await restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: state!.response, source, locale: 'en-US', action }, operationId);
    if (result.kind !== 'prepared') throw new Error('Prepared successor required'); ready();
    const patches = test.state.patchCount; vi.spyOn(test.metadata, 'write').mockImplementation(() => {});
    const input = { preparation: result.preparation, operationId: result.operationId, action,
      assent: { signerName: 'Ada Lovelace', consentAccepted: true as const } };
    await expect(restored.responseSigning!.sign(input)).rejects.toThrow();
    await expect(restored.responseSigning!.sign(input)).rejects.toThrow();
    expect(test.state.patchCount).toBe(patches); expect(test.state.signCount).toBe(0);
  });
  it.each(['revision', 'candidate', 'marker', 'content', 'action', 'owner', 'publication'] as const)('keeps unresolved state when restored %s differs', async mismatch => {
    const { test, operationId } = await pendingFixture(); const restored = test.build();
    const state = await restored.draftStore.readState!(test.draftKey);
    if (state?.kind !== 'active' || !state.pendingSign) throw new Error('Pending Sign state required');
    const candidate = structuredClone(state.response); const selectedAction = structuredClone(action);
    if (mismatch === 'revision') test.state.version++;
    if (mismatch === 'owner') test.state.actor = 'oidc:other';
    if (mismatch === 'publication') test.state.formVersionId = 'other-publication';
    if (mismatch === 'candidate') candidate.data = { changed: true };
    if (mismatch === 'marker') test.metadata.remove('response-signing-operations');
    if (mismatch === 'content') candidate.extensions!['x-formspec-signing-content']!.documentHash = '0'.repeat(64);
    if (mismatch === 'action') selectedAction.requestRef = 'unadmitted-sign-request';
    await expect(restored.responseSigning!.restorePending!({ draftKey: test.draftKey, definition,
      formVersionId: 'publication-1', response: candidate, source, locale: 'en-US', action: selectedAction }, operationId)).rejects.toThrow();
    expect(test.state.signCount).toBe(0);
  });
});


it.each(['formUrl', 'formVersion'] as const)('rejects a pending recovery with mismatched key %s before transport', async field => {
  const test = await fixture(true, true, false, undefined, async () => { throw new Error('native evidence expired'); });
  await test.save(); const prepared = await test.prepare(); const operationId = generateIdempotencyKey();
  await expect(test.sign(prepared, operationId)).rejects.toThrow('native evidence expired');
  const restored = test.build(); const candidate = structuredClone(test.state.response); const calls = test.requests.length;
  await expect(restored.responseSigning!.restorePending!({ draftKey: { ...test.draftKey, [field]: 'different' }, definition,
    formVersionId: 'publication-1', response: candidate, source, locale: 'en-US', action }, operationId)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
  expect(test.requests).toHaveLength(calls);
});

describe('explicit owned draft resume without tab metadata', () => {
  it('recovers the same owned persisted response through qualified state reading from an empty registry', async () => {
    const test = await fixture(true, true); test.state.version = 7;
    expect(test.metadata.read('draft-handles')).toBeUndefined();
    const fresh = test.build();
    const selection = { draftId: 'owned-draft', expectedResponseId: response.id! };
    const resumed = await fresh.draftStore.resumeState!(test.draftKey, selection);
    expect(resumed?.kind).toBe('active');
    if (resumed?.kind !== 'active') throw new Error('Owned checkpoint required');
    expect(resumed.savedDraft).toMatchObject({ response, draft: { id: selection.draftId, version: 7 }, actor: { id: test.state.actor } });
    expect(await fresh.draftStore.readState!(test.draftKey)).toEqual(resumed);
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    expect(test.state.createCount).toBe(0); expect(test.state.patchCount).toBe(0); expect(test.state.signCount).toBe(0);
  });
});

describe('owned resume admission boundaries', () => {
  const selection = { draftId: 'owned-draft', expectedResponseId: response.id! };
  it.each(['owner', 'publication', 'response', 'status'] as const)('refuses wrong %s before installing a fresh registry binding', async kind => {
    const test = await fixture(true, true);
    if (kind === 'owner') test.state.actor = 'another-owner';
    if (kind === 'publication') test.state.formVersionId = 'another-publication';
    if (kind === 'response') test.state.response.id = 'another-response';
    if (kind === 'status') test.state.status = 'abandoned';
    await expect(test.build().draftStore.resumeState!(test.draftKey, selection)).rejects.toThrow();
    expect(test.metadata.read('draft-handles')).toBeUndefined();
    expect(test.requests.every(request => request.method === 'GET')).toBe(true);
    expect(test.state.createCount + test.state.patchCount + test.state.signCount).toBe(0);
  });
  it.each([401, 404, 503])('propagates HTTP %s and keeps selected absence from becoming creation', async status => {
    const test = await fixture(true, true); test.state.getStatus = status;
    await expect(test.build().draftStore.resumeState!(test.draftKey, selection)).rejects.toThrow();
    expect(test.metadata.read('draft-handles')).toBeUndefined();
    expect(test.state.createCount).toBe(0);
  });
  it('rejects task-owned returned state before ordinary binding', async () => {
    const test = await fixture(true, true);
    test.state.taskDraft = { taskId: 'owned-task' };
    // Supply the association through the retained server-view fixture, never through a locator.
    await expect(test.build().draftStore.resumeState!(test.draftKey, selection)).rejects.toThrow('Task-owned');
    expect(test.metadata.read('draft-handles')).toBeUndefined();
  });
  it.each(['account', 'clear'] as const)('fences a pending new binding on %s retirement', async kind => {
    const test = await fixture(true, true); const fresh = test.build(); let release!: () => void;
    test.state.getGate = new Promise<void>(resolve => { release = resolve; });
    const pending = fresh.draftStore.resumeState!(test.draftKey, selection);
    await vi.waitFor(() => expect(test.requests).toHaveLength(1));
    const retired = kind === 'account' ? fresh.draftStore.invalidateSubject(test.draftKey.subjectRef!) : fresh.draftStore.delete(test.draftKey);
    release(); await expect(pending).rejects.toThrow(/cleared|invalidated/); await retired;
    expect(test.metadata.read('draft-handles')).toBeUndefined();
  });
  it('refuses replacing a conflicting existing locator without a read or write', async () => {
    const test = await fixture(true, true); await test.save(); const retained = structuredClone(test.metadata.read('draft-handles')); const count = test.requests.length;
    await expect(test.build().draftStore.resumeState!(test.draftKey, { ...selection, draftId: 'another-draft' })).rejects.toThrow('conflicts');
    expect(test.requests).toHaveLength(count); expect(test.metadata.read('draft-handles')).toEqual(retained);
  });
  it('does not downgrade a valid pending Source snapshot when local signing evidence is missing', async () => {
    const test = await fixture(true, true); await test.save();
    const prepared = await test.prepare(); test.state.refuseSign = true;
    await expect(test.sign(prepared)).rejects.toThrow('ambiguous signing failure');
    expect(test.state.response.extensions?.['x-formspec-signing-content']).toBeDefined();
    expect(test.state.response.authoredSignatures?.length ?? 0).toBe(0);
    expect(await validateCanonicalFormResponse(test.state.response)).toBe(true);
    test.values.clear();
    await expect(test.build().draftStore.resumeState!(test.draftKey, selection)).rejects.toBeInstanceOf(ResponseSigningUnresolvedError);
    expect(test.metadata.read('draft-handles')).toBeUndefined();
  });
  it.each([true, false])('keeps existing lookup available with creation disabled and persistent saving %s', async persistentSaving => {
    const test = await fixture(true, true, false, false, undefined, persistentSaving);
    const state = await test.build().draftStore.resumeState!(test.draftKey, { draftId: test.draftId, expectedResponseId: response.id! });
    expect(state.kind).toBe('active'); expect(state.application?.draftRef).toBe(`urn:formspec:draft:${test.draftId}`);
    expect(test.requests.every(request => request.method === 'GET')).toBe(true); expect(test.state.createCount).toBe(0);
  });
});


it('refuses an asynchronous owned-resume guard before credentials or reads', async () => {
  const test = await fixture(true, true);
  await expect(test.build().draftStore.resumeState!(test.draftKey, { draftId: test.draftId, expectedResponseId: response.id! }, async () => {})).rejects.toThrow('guard must be synchronous');
  expect(test.requests).toHaveLength(0); expect(test.metadata.read('draft-handles')).toBeUndefined();
});


describe('bounded Save boundary diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());
  it('retains the original refused write status before unchanged reconciliation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const test = await fixture(false, true); await test.save();
    test.state.patchStatus = 403;
    await expect(test.save(saveAction('PATCH'))).rejects.toThrow('Save differs from the exact saved Response');
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(warn.mock.calls.map(call => JSON.parse(call[1]))).toEqual([
      { stage: 'write-dispatch', reason: 'http-refused', status: 403, candidate: { expectedDraftVersion: 1,
        baselineDataKeyCount: Object.keys(test.state.response.data).length, candidateDataKeyCount: Object.keys(test.state.response.data).length,
        changedDataPaths: [], changedDataPathCount: 0, removedDataPaths: [], addedDataPaths: [] } },
      { stage: 'readback', reason: 'save-failed', candidate: { expectedDraftVersion: 1,
        baselineDataKeyCount: Object.keys(test.state.response.data).length, candidateDataKeyCount: Object.keys(test.state.response.data).length,
        changedDataPaths: [], changedDataPathCount: 0, removedDataPaths: [], addedDataPaths: [] } },
    ]);
    expect(test.state.version).toBe(1); expect(test.state.patchCount).toBe(1);
  });
  it('distinguishes an owned GET refusal and bounds each adapter while isolating observer errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('private observer failure'); });
    const test = await fixture(false, true); await test.save(); test.state.getStatus = 503;
    for (let index = 0; index < 40; index++) await expect(test.save(saveAction('PATCH'))).rejects.toMatchObject({ status: 503 });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(32));
    expect(warn.mock.calls.every(call => call[1] === JSON.stringify({ stage: 'owned-read', reason: 'http-refused', status: 503 }))).toBe(true);
    expect(test.state.patchCount).toBe(0);
  });
  it('records an uncertain write reply without preventing successful authoritative reconciliation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const test = await fixture(false, true); await test.save(); test.state.lostPatch = true;
    const saved = await test.save(saveAction('PATCH'));
    expect(saved.draft.version).toBe(2);
    expect(warn).toHaveBeenCalledExactlyOnceWith('Native form Save diagnostic', JSON.stringify({ stage: 'write-dispatch', reason: 'save-failed', candidate: { expectedDraftVersion: 1,
      baselineDataKeyCount: Object.keys(test.state.response.data).length, candidateDataKeyCount: Object.keys(test.state.response.data).length,
      changedDataPaths: [], changedDataPathCount: 0, removedDataPaths: [], addedDataPaths: [] } }));
  });
});


describe('typed original Save problem diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());
  it('retains bounded typed server detail and a value-free candidate comparison before reconciliation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const test = await fixture(false, true); await test.save(); test.state.patchStatus = 409;
    const detail = 'protected task prefill data differs from original baseline';
    test.state.patchProblem = { type: 'about:blank', title: 'conflict', status: 409, error_code: 'FORMSPEC-4090', detail,
      context: { private: 'private context' }, instance: 'https://private.test/token', extra: 'private response' };
    const candidate = structuredClone(test.state.response); candidate.data['neutral/field'] = 'private answer';
    const removed = Object.keys(candidate.data)[0]; delete candidate.data[removed];
    await expect(test.save(saveAction('PATCH'), candidate)).rejects.toThrow('Save differs from the exact saved Response');
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    const first = JSON.parse(warn.mock.calls[0][1]);
    expect(first).toEqual({ stage: 'write-dispatch', reason: 'http-refused', status: 409, error_code: 'FORMSPEC-4090', detail,
      candidate: { expectedDraftVersion: 1, baselineDataKeyCount: Object.keys(test.state.response.data).length,
        candidateDataKeyCount: Object.keys(candidate.data).length, changedDataPaths: [removed, 'neutral/field'].sort()
          .map(key => '/' + key.replace(/~/g, '~0').replace(/\//g, '~1')), changedDataPathCount: 2,
        removedDataPaths: ['/' + removed], addedDataPaths: ['/neutral~1field'] } });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private answer');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private context');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('https://private.test/token');
    expect(test.state.version).toBe(1);
  });
  it('bounds recognized detail to 1024 characters and omits arbitrary response fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const test = await fixture(false, true); await test.save(); test.state.patchStatus = 409;
    test.state.patchProblem = { type: 'about:blank', title: 'conflict', status: 409, error_code: 'FORMSPEC-4090', detail: 'x'.repeat(2048) };
    await expect(test.save(saveAction('PATCH'))).rejects.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(JSON.parse(warn.mock.calls[0][1]).detail).toBe('x'.repeat(1024));
  });
  it('does not expose unrecognized raw response detail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const test = await fixture(false, true); await test.save(); test.state.patchStatus = 409;
    test.state.patchProblem = { status: 409, detail: 'private raw response', error_code: 'arbitrary' };
    await expect(test.save(saveAction('PATCH'))).rejects.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(JSON.parse(warn.mock.calls[0][1])).not.toHaveProperty('detail');
    expect(JSON.parse(warn.mock.calls[0][1])).not.toHaveProperty('error_code');
  });
});


it('keeps broader infrastructure problem codes without exposing dynamic database detail', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const test = await fixture(false, true); await test.save(); test.state.patchStatus = 409;
    test.state.patchProblem = { type: 'about:blank', title: 'conflict', status: 409, error_code: 'INFRA-4090',
      detail: 'database diagnostic containing a private answer' };
    await expect(test.save(saveAction('PATCH'))).rejects.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(JSON.parse(warn.mock.calls[0][1]).error_code).toBe('INFRA-4090');
    expect(JSON.parse(warn.mock.calls[0][1])).not.toHaveProperty('detail');
  } finally { warn.mockRestore(); }
});
