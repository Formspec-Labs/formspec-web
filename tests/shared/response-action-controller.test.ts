import type { TaskSubmission } from '../../src/ports/task-completion.ts';
import type { CompletionLifetime } from '../../src/ports/response-completion.ts';
import { createTaskResponseCompletion } from '../../src/shared/task-response-completion.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalResponseHandoffBytes } from '@formspec-org/integrity-canonical';
import type { FormResponse, ResponseActionsDocument, SigningContent } from '@formspec-org/types';
import type { SurfaceWidgetActionExecutorInput, SurfaceWidgetActionSource } from '@formspec-org/surface-react';
import { sampleFormDefinition, sampleFormResponse, sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import type { PreparedResponseSigning, SavedResponseDraft, SignedResponseSigning } from '../../src/ports/response-signing.ts';
import { createResponseActionController, type QualifiedResponseActionRole, type ResponseActionControllerConfig, type ResponseActionRole } from '../../src/shared/response-action-controller.ts';
import { isUuidV7IdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { validateCanonicalFormResponse } from '../../src/adapters/schema/index.ts';
import type { IntakeHandoff } from '../../src/ports/submit-transport.ts';

const response = { ...sampleFormResponse, id: 'stable-response' };
const draftKey = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version };
const source = { ref: `${sampleFormDefinition.url}#/extensions/x-formspec-signing-content/entries/en`, version: '1' };
const content: SigningContent = { source, locale: 'en', documentId: 'document', signingIntent: 'urn:test:sign',
  declaration: 'Declaration', paperAlternative: 'Paper', affirmationText: 'Affirmation', delegatedSigningNotice: 'Notice',
  electronicConsent: { textRef: 'urn:test:consent', version: '1', text: 'Consent', controlLabel: 'Consent' } };
const responseSource = { inputName: 'response', catalogRef: 'urn:test:catalog', sourceRef: 'host:response' };
function widgetSource(role: string): SurfaceWidgetActionSource {
  return { moduleId: 'x-shared', widgetName: 'SigningCeremony', slotId: 'ceremony', outputName: role,
    route: { surfaceId: 'surface', routeId: 'signing', routeClass: 'ceremony', params: {} } };
}
function roleAdmission(role: ResponseActionRole): QualifiedResponseActionRole {
  const requestId = `${role}-request`;
  const initial = role === 'saveInitial';
  const path = initial ? '/runtime/forms/{formId}/drafts' : role === 'sign' || role === 'submit' ? `/drafts/{draftId}/${role}` : '/drafts/{draftId}';
  const document: ResponseActionsDocument = { $formspecResponseActions: '1.0', version: '1', scope: 'response',
    targetDefinition: { url: sampleFormDefinition.url }, actions: [{ id: role, intent: 'x-test',
      validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
      effects: role === 'paper' ? [{ type: 'hostEvent', eventName: 'formspec-paper-review' }]
        : [{ type: 'serviceRequest', requestRef: requestId, idempotencyKey: '@invocation.id' }],
    }], 'x-formspec-runtime': { version: '1.0', requests: [{ id: requestId, adapter: 'http-json',
      request: { method: initial || role === 'sign' || role === 'submit' ? 'POST' : 'PATCH', pathTemplate: path,
        pathBindings: initial ? { formId: { from: 'input', path: 'formId' } } : { draftId: { from: 'input', path: 'draftId' } },
        bodyBindings: { '/canonical_response': { from: 'input', path: 'frozenResponse' } } },
      successStatuses: [200], outputs: role === 'submit' ? { responseId: { path: '/response_id', exposure: 'transition' }, status: { path: '/status', exposure: 'internal' } }
        : { draftId: { path: '/draft_id', exposure: 'internal' } },
    }] } };
  return { document, actionRef: role, requestRef: requestId, artifactRef: `urn:test:actions:${role}`, artifactDigest: `sha256:${'b'.repeat(64)}`,
    ...(role === 'sign' || role === 'submit' || role === 'paper' ? { widgetSource: widgetSource(role), responseSource } : {}) };
}
async function hashResponse(value: FormResponse) {
  return createHash('sha256').update(canonicalResponseHandoffBytes(value)).digest('hex');
}
async function evidence(value: FormResponse, version: number): Promise<SavedResponseDraft> {
  return { draftKey, response: value, draft: { id: 'owned-draft', version, responseHash: await hashResponse(value) }, actor: { id: 'server-actor' },
    evidence: { draft_id: 'owned-draft', form_version_id: 'publication', subject_ref: 'server-actor', draft_version: version,
      draft_state: value.data, canonical_response: value, status: 'in_progress' } };
}
function fixture(change: Partial<ResponseActionControllerConfig> = {}) {
  const roles = Object.fromEntries(['saveInitial', 'saveOwned', 'prepare', 'sign', 'submit', 'paper'].map(role => [role, roleAdmission(role as ResponseActionRole)])) as Record<ResponseActionRole, QualifiedResponseActionRole>;
  let version = 0;
  const saves = new Map<string, SavedResponseDraft>();
  const saveDraft = vi.fn(async (input: Parameters<ResponseActionControllerConfig['signing']['saveDraft']>[0]) => {
    if (!saves.has(input.operationId)) saves.set(input.operationId, await evidence(input.response, ++version));
    return saves.get(input.operationId)!;
  });
  const prepare = vi.fn(async (input: Parameters<ResponseActionControllerConfig['signing']['prepare']>[0]) => ({ ...await evidence(input.response, ++version), content }));
  const sign = vi.fn(async (input: Parameters<ResponseActionControllerConfig['signing']['sign']>[0]): Promise<SignedResponseSigning> => {
    const { RESPONSE_SCHEMA_DOCUMENT } = await import('../../src/adapters/schema/canonical-schemas.ts');
    const example = RESPONSE_SCHEMA_DOCUMENT.properties.authoredSignatures.examples[0][0];
    const signedResponse: FormResponse = { ...input.preparation.response, authoredSignatures: [{ ...example,
      signedPayload: { ...example.signedPayload, responseId: response.id, definitionUrl: response.definitionUrl, definitionVersion: response.definitionVersion },
    }] as FormResponse['authoredSignatures'], extensions: { 'x-test-signed': true } };
    return { ...input.preparation, ...await evidence(signedResponse, ++version), verification: { mode: 'delegated-service-key', provider: 'urn:test:delegated', keyId: 'key' } };
  });
  const submit = vi.fn(async (_handoff: IntakeHandoff, _operationId: string) => ({ referenceNumber: 'actual-reference', status: 'accepted' as const }));
  const reviewReady = vi.fn(() => true);
  const buildHandoff = vi.fn(async (signedResponse: FormResponse) => ({ ...sampleIntakeHandoff,
    responseRef: `response:${signedResponse.id}`, responseHash: `sha256:${await hashResponse(signedResponse)}`,
    extensions: { 'x-formspec-response': signedResponse } }));
  const config: ResponseActionControllerConfig = { context: { definition: sampleFormDefinition, draftKey, publication: { formId: 'actual-form', formVersionId: 'publication' },
    responseId: response.id, generation: 'session-1' }, roles, signing: { saveDraft, prepare, sign }, submitTransport: { submit },
    validateResponse: validateCanonicalFormResponse, hashResponse,
    validateFrozenResponse: (value, validationTuple) => ({ response: value, validationTuple,
      validationReport: { $formspecValidationReport: '1.0', definitionUrl: value.definitionUrl,
        definitionVersion: value.definitionVersion, valid: true, results: [], counts: { error: 0, warning: 0, info: 0 }, timestamp: '2026-10-06T12:00:00Z' } }),
    signingContext: () => ({ source, locale: 'en' }), reviewReady, buildHandoff, ...change };
  const controller = createResponseActionController(config);
  function definition(role: ResponseActionRole, delivery = `definition:${role}`, value = response) {
    return controller.definitionInvoker({ document: config.roles[role]!.document, actionRef: role,
      invocationContext: { invocationId: delivery }, ports: { submit: () => ({ response: value, validationReport: null }), validationReportValid: () => true, dispatchHostEvent: vi.fn() } });
  }
  function widget(role: 'sign' | 'submit' | 'paper', selected: PreparedResponseSigning | SignedResponseSigning, delivery = `surface-widget:${role}`,
    override: Partial<SurfaceWidgetActionExecutorInput> = {}) {
    const input = role === 'sign' ? { draftId: selected.draft.id, draftVersion: selected.draft.version, responseId: selected.response.id!,
      responseHash: selected.draft.responseHash, source, locale: 'en', signerName: 'Actual signer', consentAccepted: true }
      : role === 'submit' ? { draftId: selected.draft.id, draftVersion: selected.draft.version, canonical_response: selected.response } : { source, locale: 'en' };
    return controller.widgetExecutor({ document: config.roles[role]!.document, actionRef: role, invocationId: delivery,
      source: widgetSource(role), responseContext: { inputName: 'response', source: { catalogRef: responseSource.catalogRef, sourceRef: responseSource.sourceRef },
        definition: sampleFormDefinition, response: selected.response }, input: input as unknown as SurfaceWidgetActionExecutorInput['input'], ...override });
  }
  async function ready() { await definition('saveInitial'); await definition('prepare'); return controller.getSnapshot().prepared!; }
  return { controller, config, roles, saveDraft, prepare, sign, submit, reviewReady, buildHandoff, definition, widget, ready };
}

function lifecycleFixture(enabled = true, change: Partial<ResponseActionControllerConfig> = {}) {
  const original = fixture();
  const roles = structuredClone(original.config.roles);
  const start = roleAdmission('startApplication');
  start.document.actions[0].intent = 'x-start-application';
  start.document.actions[0].validation = { profile: 'off', blocking: 'non-blocking', persistence: 'none' };
  const request = start.document['x-formspec-runtime']!.requests[0];
  request.request = { method: 'POST', pathTemplate: '/drafts/{draftId}/application-case',
    pathBindings: { draftId: { from: 'input', path: 'draftId' } }, bodyDefaults: {} };
  request.outputs = { case: { path: '/caseLedgerId' } };
  roles.startApplication = start;
  roles.saveInitial!.document.actions[0].validation = { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' };
  const startApplication = vi.fn(async () => ({ caseLedgerId: 'urn:wos:real-case', caseReference: 'APP-001', draftRef: 'urn:formspec:draft:owned-draft', status: 'in-progress' as const }));
  return { ...fixture({ roles, applicationLifecycle: { capabilities: { earlyCaseCreation: enabled, persistentSaving: true, formVersionId: 'publication' }, load: vi.fn(async () => undefined), start: startApplication }, ...change }), startApplication };
}
describe('detached controller evidence context', () => {
  it('keeps saved receipt checks bound to construction context after caller mutation', async () => {
    const test = fixture();
    Object.assign(test.config.context.publication, { formVersionId: 'mutated-publication' });
    expect(await test.definition('saveInitial')).toMatchObject({ status: 'completed' });
    expect(test.controller.getSnapshot().saved!.evidence.form_version_id).toBe('publication');
  });
});
describe('maintained application Start', () => {
  it('keeps Save available while unavailable case status blocks Start and Submit, then retries authoritative absence', async () => {
    const base = lifecycleFixture(); const load = vi.fn(async () => undefined);
    const f = fixture({ roles: base.config.roles, restoredResponse: response,
      restoredApplicationLookup: { status: 'unavailable', statusCode: 503 },
      applicationLifecycle: { ...base.config.applicationLifecycle!, load } });
    expect(f.controller.getSnapshot().applicationLookup).toEqual({ status: 'unavailable', statusCode: 503 });
    expect(await f.definition('startApplication')).toMatchObject({ status: 'failed' });
    expect(await f.definition('saveOwned')).toMatchObject({ status: 'completed' });
    expect(f.saveDraft).toHaveBeenCalledOnce();
    await f.definition('prepare');
    expect(await f.widget('sign', f.controller.getSnapshot().prepared!)).toMatchObject({ status: 'completed' });
    expect(await f.widget('submit', f.controller.getSnapshot().signed!)).toMatchObject({ status: 'failed' });
    expect(base.startApplication).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
    await f.controller.refreshApplication(); expect(load).toHaveBeenCalledOnce();
    expect(f.controller.getSnapshot().applicationLookup).toBeUndefined();
    expect(f.controller.getSnapshot().application).toBeUndefined();
  });

  it('retains a known association and unavailable status when retry returns null or fails', async () => {
    const base = lifecycleFixture(); await base.definition('startApplication');
    const application = base.controller.getSnapshot().application!;
    const load = vi.fn(async () => undefined);
    const f = fixture({ roles: base.config.roles, restoredResponse: response, restoredApplication: application,
      restoredApplicationLookup: { status: 'unavailable', statusCode: 503 },
      applicationLifecycle: { ...base.config.applicationLifecycle!, load } });
    await expect(f.controller.refreshApplication()).rejects.toThrow();
    expect(f.controller.getSnapshot()).toMatchObject({ application, applicationLookup: { status: 'unavailable', statusCode: 503 } });
    load.mockRejectedValueOnce(new Error('lookup unavailable'));
    await expect(f.controller.refreshApplication()).rejects.toThrow();
    expect(f.controller.getSnapshot()).toMatchObject({ application, applicationLookup: { status: 'unavailable', statusCode: 503 } });
  });

  it('serializes status retry and refuses a late result after retirement', async () => {
    const base = lifecycleFixture(); let release!: (value: undefined) => void;
    const load = vi.fn(() => new Promise<undefined>(resolve => { release = resolve; }));
    const f = fixture({ roles: base.config.roles, restoredResponse: response,
      restoredApplicationLookup: { status: 'unavailable', statusCode: 503 },
      applicationLifecycle: { ...base.config.applicationLifecycle!, load } });
    const pending = f.controller.refreshApplication(); const refusal = expect(pending).rejects.toThrow();
    await expect(f.controller.refreshApplication()).rejects.toThrow();
    expect(await f.definition('saveOwned')).toMatchObject({ status: 'failed' }); expect(f.saveDraft).not.toHaveBeenCalled();
    f.controller.invalidate(); release(undefined); await refusal;
    expect(load).toHaveBeenCalledOnce(); expect(f.controller.getSnapshot().applicationLookup).toEqual({ status: 'unavailable', statusCode: 503 });
  });

  it('creates no draft or case on startup, then checkpoints progress and starts deliberately', async () => {
    const f = lifecycleFixture(); expect(f.saveDraft).not.toHaveBeenCalled(); expect(f.startApplication).not.toHaveBeenCalled();
    const result = await f.definition('startApplication');
    expect(result).toMatchObject({ status: 'completed' }); expect(f.saveDraft).toHaveBeenCalledOnce(); expect(f.startApplication).toHaveBeenCalledOnce();
    expect(f.controller.getSnapshot().application).toMatchObject({ caseReference: 'APP-001', status: 'in-progress' });
  });
  it('retains the exact first checkpoint and operation on a failed Start retry', async () => {
    const f = lifecycleFixture(); f.startApplication.mockRejectedValueOnce(new Error('lost-reply'));
    expect(await f.definition('startApplication', 'start-act')).toMatchObject({ status: 'failed' });
    expect(f.controller.getSnapshot().owned).toBe(true); expect(f.controller.getSnapshot().application).toBeUndefined();
    expect(await f.definition('startApplication', 'start-act')).toMatchObject({ status: 'completed' });
    expect(f.saveDraft).toHaveBeenCalledOnce(); expect(f.startApplication).toHaveBeenCalledTimes(2);
    expect(f.startApplication.mock.calls[0]).toEqual(f.startApplication.mock.calls[1]);
  });
  it('refuses disabled early creation without checkpoint or case effect', async () => {
    const f = lifecycleFixture(false); expect(await f.definition('startApplication')).toMatchObject({ status: 'failed' });
    expect(f.saveDraft).not.toHaveBeenCalled(); expect(f.startApplication).not.toHaveBeenCalled();
  });
  it('keeps a restored case visible from the initial snapshot and refreshes through read-only lookup', async () => {
    const f = lifecycleFixture(); await f.definition('startApplication');
    const application = f.controller.getSnapshot().application!;
    const load = vi.fn(async () => ({ ...application, status: 'submitted' as const }));
    const next = fixture({ roles: f.config.roles, restoredResponse: response, restoredApplication: application,
      applicationLifecycle: { ...f.config.applicationLifecycle!, load } });
    expect(next.controller.getSnapshot().application).toEqual(application);
    await next.controller.refreshApplication(); expect(load).toHaveBeenCalledWith(next.config.context.draftKey);
    expect(f.startApplication).toHaveBeenCalledOnce();
    expect(next.controller.getSnapshot().application?.status).toBe('submitted');
  });
  it('discards late Start evidence after authority withdrawal', async () => {
    const f = lifecycleFixture(); let release!: (receipt: Awaited<ReturnType<typeof f.startApplication>>) => void;
    f.startApplication.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = f.definition('startApplication'); await vi.waitFor(() => expect(f.startApplication).toHaveBeenCalledOnce());
    f.controller.invalidate(); release({ caseLedgerId: 'urn:wos:real-case', caseReference: 'APP-001', draftRef: 'urn:formspec:draft:owned-draft', status: 'in-progress' });
    expect(await pending).toMatchObject({ status: 'failed' }); expect(f.controller.getSnapshot().application).toBeUndefined();
  });
});
describe('generic admitted Response Action controller', () => {
  async function restoredSignedFixture() {
    const producer = fixture(); await producer.widget('sign', await producer.ready());
    const previous = producer.controller.getSnapshot().signed!;
    const value: FormResponse = { ...previous.response, extensions: { ...previous.response.extensions,
      'x-formspec-signing-content': { version: '1.0', content, draftId: previous.draft.id, draftVersion: previous.draft.version - 1,
        actorRef: previous.actor.id, signerName: 'Actual signer', consentAccepted: true, signedAt: '2026-10-08T12:00:00Z',
        documentHash: 'a'.repeat(64), documentHashAlgorithm: 'sha-256' } } };
    const signed = { ...previous, ...await evidence(value, previous.draft.version), content,
      verification: { ...previous.verification, provider: value.authoredSignatures![0].signatureProvider } };
    return { signed, test: fixture({ restoredResponse: value }) };
  }
  it('publishes a reconciled signature before downstream qualification and never creates a successor act', async () => {
    const { signed } = await restoredSignedFixture(); const unsigned = structuredClone(signed.response); delete unsigned.authoredSignatures;
    const value = { ...await evidence(unsigned, signed.draft.version - 1), content, operationId: '01a12800-0000-7000-8000-000000000001' };
    const baseline = fixture(); let observedSigned = false;
    const restorePending = vi.fn(async () => ({ kind: 'signed' as const, signed }));
    const test = fixture({ restoredResponse: unsigned, signing: { ...baseline.config.signing, restorePending },
      afterCommittedDraft: async () => { observedSigned = !!test.controller.getSnapshot().signed; throw new Error('facts unavailable'); } });
    await test.controller.restorePending(value);
    expect(observedSigned).toBe(true); expect(test.controller.getSnapshot()).toMatchObject({ phase: 'signed', signed });
    expect(test.controller.getSnapshot().prepared).toBeUndefined(); expect(test.controller.getSnapshot().pendingSign).toBeUndefined();
    expect(baseline.sign).not.toHaveBeenCalled(); expect(baseline.prepare).not.toHaveBeenCalled();
  });
  it.each(['unsigned', 'provider', 'key'] as const)('refuses malformed reconciled signed result: %s', async mismatch => {
    const { signed } = await restoredSignedFixture(); const unsigned = structuredClone(signed.response); delete unsigned.authoredSignatures;
    const value = { ...await evidence(unsigned, signed.draft.version - 1), content, operationId: '01a12800-0000-7000-8000-000000000001' };
    const candidate = structuredClone(signed);
    if (mismatch === 'unsigned') Object.assign(candidate, await evidence(unsigned, signed.draft.version));
    if (mismatch === 'provider') candidate.verification.provider = 'different-provider';
    if (mismatch === 'key') candidate.verification.keyId = '';
    const baseline = fixture(); const test = fixture({ restoredResponse: unsigned,
      signing: { ...baseline.config.signing, restorePending: async () => ({ kind: 'signed' as const, signed: candidate }) } });
    await expect(test.controller.restorePending(value)).rejects.toThrow('context-mismatch');
    expect(test.controller.getSnapshot().signed).toBeUndefined(); expect(test.submit).not.toHaveBeenCalled();
  });
  it('restores qualified signed evidence without writes and requires fresh review before Submit', async () => {
    const { signed, test } = await restoredSignedFixture();
    test.reviewReady.mockReturnValue(false);
    await test.controller.restoreSigned(signed);
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'signed', signed, owned: true });
    const refused = await test.widget('submit', signed);
    expect('invocation' in refused ? refused.invocation.failureReason : refused.failureReason).toBe('review-unready');
    expect(test.submit).not.toHaveBeenCalled();
    test.reviewReady.mockReturnValue(true);
    await test.widget('submit', signed, 'fresh-reviewed-submit');
    expect(test.submit).toHaveBeenCalledOnce();
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.prepare).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
  });
  it.each(['response', 'hash', 'content', 'verification'] as const)('refuses mismatched restored signed %s', async changed => {
    const { signed, test } = await restoredSignedFixture(); const candidate = structuredClone(signed);
    if (changed === 'response') candidate.response.id = 'another-response';
    if (changed === 'hash') candidate.draft = { ...candidate.draft, responseHash: '0'.repeat(64) };
    if (changed === 'content') candidate.content = { ...candidate.content, declaration: 'Changed' };
    if (changed === 'verification') candidate.verification = { ...candidate.verification, provider: 'different-provider' };
    await expect(test.controller.restoreSigned(candidate)).rejects.toThrow();
    expect(test.controller.getSnapshot().signed).toBeUndefined(); expect(test.submit).not.toHaveBeenCalled();
  });
  it('refuses late signed restoration after controller withdrawal', async () => {
    const { signed, test } = await restoredSignedFixture(); let finish!: () => void;
    test.config.hashResponse = async () => new Promise(resolve => { finish = () => resolve(signed.draft.responseHash); });
    const restoring = test.controller.restoreSigned(signed); const refused = expect(restoring).rejects.toThrow('context-obsolete');
    await vi.waitFor(() => expect(finish).toBeDefined()); test.controller.invalidate(); finish(); await refused;
    expect(test.controller.getSnapshot().signed).toBeUndefined();
  });
  it('returns the known Submit outcome for the same exact delivery without another transport call or phase change', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    const result = await test.widget('submit', signed, 'confirmed-submit');
    const terminal = test.controller.getSnapshot(); const changed = vi.fn(); const unsubscribe = test.controller.subscribe(changed);
    const replay = await test.widget('submit', signed, 'confirmed-submit');
    expect(replay).toEqual(result);
    expect(test.submit).toHaveBeenCalledOnce(); expect(test.buildHandoff).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot()).toEqual(terminal); expect(changed).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('refuses a new Submit act after confirmation before transport, handoff construction or replacing terminal state', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!; await test.widget('submit', signed, 'confirmed-submit');
    const terminal = test.controller.getSnapshot(); const changed = vi.fn(); const unsubscribe = test.controller.subscribe(changed);
    expect(terminal).toMatchObject({ phase: 'submitted', confirmation: { status: 'accepted', referenceNumber: 'actual-reference' } });
    const refused = await test.widget('submit', signed, 'new-submit-act');
    expect('invocation' in refused ? refused.invocation.status : refused.status).toBe('failed');
    expect(test.submit).toHaveBeenCalledOnce(); expect(test.buildHandoff).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot()).toEqual(terminal); expect(changed).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('refuses a changed confirmed delivery and erases its completed replay when invalidated', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    await test.widget('submit', signed, 'confirmed-submit');
    const terminal = test.controller.getSnapshot(); const changed = vi.fn(); const unsubscribe = test.controller.subscribe(changed);
    const altered = await test.widget('submit', signed, 'confirmed-submit', { input: { draftId: signed.draft.id, draftVersion: signed.draft.version + 1, canonical_response: signed.response } as unknown as SurfaceWidgetActionExecutorInput['input'] });
    expect('invocation' in altered ? altered.invocation.status : altered.status).toBe('failed');
    expect(test.controller.getSnapshot()).toEqual(terminal); expect(changed).not.toHaveBeenCalled();
    test.controller.invalidate();
    const replay = await test.widget('submit', signed, 'confirmed-submit');
    expect('invocation' in replay ? replay.invocation.status : replay.status).toBe('failed');
    expect(test.controller.getSnapshot()).toEqual({ phase: 'refused', owned: false, reason: 'context-obsolete' });
    expect(test.submit).toHaveBeenCalledOnce(); expect(test.buildHandoff).toHaveBeenCalledOnce(); unsubscribe();
  });

  it('joins pending exact Submit deliveries and preserves one physical operation and signed object', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    let finish!: (value: Awaited<ReturnType<typeof test.submit>>) => void;
    test.submit.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const first = test.widget('submit', signed, 'pending-submit'); const joined = test.widget('submit', signed, 'pending-submit');
    await vi.waitFor(() => expect(test.submit).toHaveBeenCalledOnce());
    expect(test.submit.mock.calls[0][0].extensions?.['x-formspec-response']).toEqual(signed.response);
    finish({ status: 'accepted', referenceNumber: 'actual-reference' });
    expect(await joined).toEqual(await first); expect(test.buildHandoff).toHaveBeenCalledOnce(); expect(test.submit).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'submitted', confirmation: { referenceNumber: 'actual-reference' } });
  });

  it('retries an uncertain Submit with its original operation and handoff until confirmation, then caches the outcome', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    test.submit.mockRejectedValueOnce(new Error('reply lost'));
    await test.widget('submit', signed, 'uncertain-submit');
    expect(test.controller.getSnapshot().confirmation).toBeUndefined();
    const operation = test.submit.mock.calls[0][1]; const handoff = test.submit.mock.calls[0][0];
    expect(isUuidV7IdempotencyKey(operation)).toBe(true);
    const result = await test.widget('submit', signed, 'uncertain-submit');
    expect(test.submit.mock.calls[1]).toEqual([handoff, operation, expect.any(Function)]); expect(test.buildHandoff).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot().phase).toBe('submitted');
    expect(await test.widget('submit', signed, 'uncertain-submit')).toEqual(result);
    expect(test.submit).toHaveBeenCalledTimes(2);
  });

  it('fences late Submit completion and future activations after the owner clears or disposes the controller', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    let finish!: (value: Awaited<ReturnType<typeof test.submit>>) => void;
    test.submit.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const pending = test.widget('submit', signed, 'retired-submit');
    await vi.waitFor(() => expect(test.submit).toHaveBeenCalledOnce());
    test.controller.invalidate(); finish({ status: 'accepted', referenceNumber: 'late-result' }); await pending;
    expect(test.controller.getSnapshot()).toEqual({ phase: 'refused', owned: false, reason: 'context-obsolete' });
    await test.widget('submit', signed, 'fresh-after-clear');
    expect(test.submit).toHaveBeenCalledOnce(); expect(test.buildHandoff).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot().confirmation).toBeUndefined();
  });

  it('uses server actor/evidence, original preparation identity, separate UUID and exact signed Submit', async () => {
    const test = fixture();
    const prepared = await test.ready();
    const result = await test.widget('sign', prepared);
    expect('invocation' in result ? result.invocation.status : result.status).toBe('completed');
    expect(test.sign).toHaveBeenCalledOnce();
    expect(test.sign.mock.calls[0][0].preparation).toBe(test.prepare.mock.results[0].value instanceof Promise ? await test.prepare.mock.results[0].value : test.prepare.mock.results[0].value);
    const operationId = test.sign.mock.calls[0][0].operationId;
    expect(isUuidV7IdempotencyKey(operationId)).toBe(true);
    expect(operationId).not.toBe('surface-widget:sign');
    const signed = test.controller.getSnapshot().signed!;
    const submitted = await test.widget('submit', signed);
    expect('invocation' in submitted ? submitted.invocation.transitionBindings : submitted.transitionBindings).toEqual({ responseId: 'actual-reference' });
    expect(test.submit.mock.calls[0][0].extensions?.['x-formspec-response']).toEqual(signed.response);
    expect(test.saveDraft).toHaveBeenCalledOnce();
    expect(test.prepare).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot().phase).toBe('submitted');
    expect(Object.isFrozen(test.controller.getSnapshot().signed!.response.data)).toBe(true);
  });

  it('refuses wrong role/catalog/branch/pins or invalid Response before physical Save', async () => {
    const test = fixture();
    await test.definition('saveOwned');
    expect(test.controller.getSnapshot().reason).toBe('branch-mismatch');
    await test.definition('saveInitial', 'wrong-id', { ...response, id: 'other' });
    expect(test.controller.getSnapshot().reason).toBe('response-invalid');
    await test.controller.definitionInvoker({ document: { ...test.roles.saveInitial.document, version: 'unadmitted' }, actionRef: 'saveInitial',
      ports: { submit: () => ({ response, validationReport: null }), dispatchHostEvent: vi.fn() } });
    expect(test.controller.getSnapshot().reason).toBe('action-unadmitted');
    expect(test.saveDraft).not.toHaveBeenCalled();
  });

  it('requires exact widget source, frozen Response and independently ready review before Sign', async () => {
    const test = fixture();
    const prepared = await test.ready();
    test.reviewReady.mockReturnValue(false);
    await test.widget('sign', prepared);
    expect(test.controller.getSnapshot().reason).toBe('review-unready');
    test.reviewReady.mockReturnValue(true);
    await test.widget('sign', prepared, 'different-source', { source: { ...widgetSource('sign'), slotId: 'other' } });
    expect(test.controller.getSnapshot().reason).toBe('context-mismatch');
    await test.widget('sign', { ...prepared, response: { ...response, data: { changed: true } } }, 'changed-response');
    expect(test.sign).not.toHaveBeenCalled();
  });

  it('refuses unsupported Submit outputs before constructing handoff or submitting', async () => {
    const submitRole = roleAdmission('submit');
    submitRole.document['x-formspec-runtime']!.requests[0].outputs!.acceptedAt = { path: '/accepted_at', exposure: 'internal' };
    const test = fixture({ roles: { ...fixture().roles, submit: submitRole } });
    const prepared = await test.ready(); await test.widget('sign', prepared);
    await test.widget('submit', test.controller.getSnapshot().signed!);
    expect(test.controller.getSnapshot().reason).toBe('outputs-unsupported');
    expect(test.buildHandoff).not.toHaveBeenCalled();
    expect(test.submit).not.toHaveBeenCalled();
  });

  it('joins identical pending saves and retires successful Save/Prepare deliveries', async () => {
    const test = fixture();
    const [one, two] = await Promise.all([test.definition('saveInitial'), test.definition('saveInitial')]);
    expect(one).toEqual(two);
    expect(test.saveDraft).toHaveBeenCalledOnce();
    await test.definition('saveInitial');
    expect(test.saveDraft).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot().reason).toBe('operation-conflict');
    await test.definition('saveInitial', 'definition:saveInitial', { ...response, data: { different: true } });
    expect(test.controller.getSnapshot().reason).toBe('operation-conflict');
    expect(test.saveDraft).toHaveBeenCalledOnce();
    await test.definition('prepare');
    await test.definition('prepare');
    expect(test.prepare).toHaveBeenCalledOnce();
    expect(test.controller.getSnapshot().reason).toBe('operation-conflict');
  });

  it('fences a late completed port result when clear invalidates the controller', async () => {
    let finish!: (result: SavedResponseDraft) => void;
    const pending = new Promise<SavedResponseDraft>(resolve => { finish = resolve; });
    const test = fixture();
    test.saveDraft.mockImplementation(async () => pending);
    const saving = test.definition('saveInitial');
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    test.controller.invalidate();
    finish(await evidence(response, 1));
    await saving;
    expect(test.controller.getSnapshot()).toEqual({ phase: 'refused', owned: false, reason: 'context-obsolete' });
  });

  it('continues a restored unsigned checkpoint through Prepare without another Save', async () => {
    const qualified = await evidence(response, 1);
    const afterCommittedDraft = vi.fn();
    const test = fixture({ restoredResponse: response, afterCommittedDraft });
    await test.controller.restoreSavedDraft(qualified);
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'saved', owned: true, saved: qualified });
    expect(afterCommittedDraft).toHaveBeenCalledWith(qualified);
    await test.definition('prepare');
    expect(test.prepare).toHaveBeenCalledOnce();
    expect(test.saveDraft).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot().phase).toBe('prepared');
  });

  it.each(['actor', 'publication', 'revision', 'hash', 'response'] as const)('refuses contradictory restored saved %s without publishing a handle', async field => {
    let value = await evidence(response, 1);
    const test = fixture({ restoredResponse: response, context: { ...fixture().config.context, expectedActor: 'server-actor' } });
    if (field === 'actor') value = { ...value, actor: { id: 'other-actor' } };
    if (field === 'publication') value = { ...value, evidence: { ...value.evidence, form_version_id: 'other-publication' } };
    if (field === 'revision') value = { ...value, evidence: { ...value.evidence, draft_version: 2 } };
    if (field === 'hash') value = { ...value, draft: { ...value.draft, responseHash: 'f'.repeat(64) } };
    if (field === 'response') value = { ...value, response: { ...response, data: { ...response.data, fullName: 'changed' } } };
    await expect(test.controller.restoreSavedDraft(value)).rejects.toMatchObject({ code: 'context-mismatch' });
    expect(test.controller.getSnapshot().saved).toBeUndefined();
    expect(test.saveDraft).not.toHaveBeenCalled();
  });

  it('pins a restored saved actor to the selected draft owner without an expectedActor hint', async () => {
    const value = await evidence(response, 1);
    const selectedKey = { ...draftKey, subjectRef: 'selected-owner' };
    const test = fixture({ restoredResponse: response, context: { ...fixture().config.context, draftKey: selectedKey } });
    await expect(test.controller.restoreSavedDraft({ ...value, draftKey: selectedKey })).rejects.toMatchObject({ code: 'context-mismatch' });
    expect(test.controller.getSnapshot().saved).toBeUndefined();
  });

  it('reserves restoration during hashing and refuses its late result after retirement', async () => {
    let release!: () => void; let entered!: () => void;
    const hashing = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const test = fixture({ restoredResponse: response, hashResponse: async value => { entered(); await gate; return hashResponse(value); } });
    const qualified = await evidence(response, 1);
    const pending = test.controller.restoreSavedDraft(qualified);
    await hashing;
    await expect(test.controller.restoreSavedDraft(qualified)).rejects.toMatchObject({ code: 'restoration-unresolved' });
    const saving = test.definition('saveOwned');
    test.controller.invalidate(); release();
    await expect(pending).rejects.toMatchObject({ code: 'context-obsolete' });
    await saving;
    expect(test.saveDraft).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot()).toEqual({ phase: 'refused', owned: false, reason: 'context-obsolete' });
  });

  it('rechecks retirement after the restored checkpoint qualification hook', async () => {
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const test = fixture({ restoredResponse: response, afterCommittedDraft: async () => { entered(); await gate; } });
    const pending = test.controller.restoreSavedDraft(await evidence(response, 1));
    await started; test.controller.invalidate(); release();
    await expect(pending).rejects.toMatchObject({ code: 'context-obsolete' });
    expect(test.controller.getSnapshot().saved).toBeUndefined();
  });

  it('uses restored full Response only for owned branch and refuses signed restoration without qualification', async () => {
    const test = fixture({ restoredResponse: response });
    await test.definition('saveInitial');
    expect(test.saveDraft).not.toHaveBeenCalled();
    await test.definition('prepare');
    expect(test.controller.getSnapshot().reason).toBe('branch-mismatch');
    expect(test.prepare).not.toHaveBeenCalled();
    await test.definition('saveOwned');
    expect(test.saveDraft).toHaveBeenCalledOnce();
    const signed = fixture({ restoredResponse: { ...response, authoredSignatures: [{}] } as unknown as FormResponse });
    await signed.definition('saveOwned');
    expect(signed.controller.getSnapshot().reason).toBe('restoration-unresolved');
    expect(signed.saveDraft).not.toHaveBeenCalled();
  });

  it.each(['actor', 'publication', 'snapshot'] as const)('refuses changed authoritative %s after Save without publishing readiness', async field => {
    const test = fixture();
    await test.definition('saveInitial');
    test.prepare.mockImplementation(async input => {
      const result = { ...await evidence(input.response, 2), content };
      if (field === 'actor') return { ...result, actor: { id: 'other' }, evidence: { ...result.evidence, subject_ref: 'other' } };
      if (field === 'publication') return { ...result, evidence: { ...result.evidence, form_version_id: 'other-publication' } };
      return { ...result, evidence: { ...result.evidence, canonical_response: { ...response, data: { changed: true } } } };
    });
    await test.definition('prepare');
    expect(test.controller.getSnapshot().reason).toBe('context-mismatch');
    expect(test.controller.getSnapshot().prepared).toBeUndefined();
    expect(test.sign).not.toHaveBeenCalled();
  });

  it('pins expected actor without manufacturing an initial session and checks review again before a physical act', async () => {
    const test = fixture();
    expect(test.saveDraft).not.toHaveBeenCalled();
    const prepared = await test.ready();
    test.reviewReady.mockReturnValueOnce(true).mockReturnValue(false);
    await test.widget('sign', prepared);
    expect(test.controller.getSnapshot().reason).toBe('review-unready');
    expect(test.sign).not.toHaveBeenCalled();
  });

  it.each(['missing', 'tuple', 'response', 'pins', 'blocked'] as const)('refuses %s frozen validation evidence before Sign', async kind => {
    const actual = fixture().config.validateFrozenResponse;
    const test = fixture({ validateFrozenResponse: async (value, tuple) => {
      const evidence = await actual(value, tuple);
      if (kind === 'missing') return { ...evidence, validationReport: null };
      if (kind === 'tuple') return { ...evidence, validationTuple: { ...tuple, profile: 'off' } };
      if (kind === 'response') return { ...evidence, response: { ...value, data: { changed: true } } };
      if (kind === 'pins') return { ...evidence, validationReport: { ...evidence.validationReport!, definitionVersion: 'other' } };
      return { ...evidence, validationReport: { ...evidence.validationReport!, valid: false, counts: { error: 1, warning: 0, info: 0 } } };
    } });
    const prepared = await test.ready();
    const result = await test.widget('sign', prepared);
    expect('invocation' in result ? result.invocation.status : result.status).toBe(kind === 'blocked' ? 'blocked' : 'failed');
    expect(test.sign).not.toHaveBeenCalled();
  });

  it('refuses an admitted Submit body changed from the exact signed Response before handoff construction', async () => {
    const roles = fixture().roles;
    roles.submit.document['x-formspec-runtime']!.requests[0].request.bodyBindings = {
      '/canonical_response': { from: 'input', path: 'frozenResponse' },
      '/draft_version': { from: 'input', path: 'draftVersion' },
    };
    const test = fixture({ roles });
    const prepared = await test.ready();
    await test.widget('sign', prepared);
    await test.widget('submit', test.controller.getSnapshot().signed!);
    expect(test.controller.getSnapshot().reason).toBe('action-unadmitted');
    expect(test.buildHandoff).not.toHaveBeenCalled();
    expect(test.submit).not.toHaveBeenCalled();
  });

  it('accepts the actual r5 signed Submit defaults while preserving the exact signed Response', async () => {
    const exported = JSON.parse(readFileSync(resolve('tests/fixtures/native-signing-r5/native-bundle.json'), 'utf8')) as BundleExport;
    const actual = dereferenceBundleExport(exported).responseActions[0]['x-formspec-runtime']!.requests.find(request => request.id === 'submit-draft')!;
    expect(actual.request.bodyDefaults).toEqual({ signing_requested: false });
    const roles = fixture().roles;
    roles.submit.document['x-formspec-runtime']!.requests[0].request.bodyDefaults = structuredClone(actual.request.bodyDefaults);
    const test = fixture({ roles }); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    await test.widget('submit', signed);
    expect(test.controller.getSnapshot().phase).toBe('submitted'); expect(test.submit).toHaveBeenCalledOnce();
    expect(test.submit.mock.calls[0][0].extensions?.['x-formspec-response']).toEqual(signed.response);
  });

  it.each([{ signing_requested: true }, { signing_requested: null }, { signing_requested: false, extra: true }])(
    'refuses unqualified Submit defaults %j before constructing the handoff', async defaults => {
      const roles = fixture().roles; roles.submit.document['x-formspec-runtime']!.requests[0].request.bodyDefaults = defaults;
      const test = fixture({ roles }); const prepared = await test.ready(); await test.widget('sign', prepared);
      await test.widget('submit', test.controller.getSnapshot().signed!);
      expect(test.controller.getSnapshot().reason).toBe('action-unadmitted');
      expect(test.buildHandoff).not.toHaveBeenCalled(); expect(test.submit).not.toHaveBeenCalled();
    });

  it('joins double Sign activation using one UUID and refuses a changed assent under the same shell delivery', async () => {
    const test = fixture();
    const prepared = await test.ready();
    let finish!: (result: SignedResponseSigning) => void;
    const result = await test.sign.getMockImplementation()!({ preparation: prepared, operationId: 'unused',
      assent: { signerName: 'Actual signer', consentAccepted: true }, action: test.roles.sign as never });
    test.sign.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const first = test.widget('sign', prepared);
    const duplicate = test.widget('sign', prepared);
    await vi.waitFor(() => expect(test.sign).toHaveBeenCalledOnce());
    finish(result);
    await Promise.all([first, duplicate]);
    const changed = { draftId: prepared.draft.id, draftVersion: prepared.draft.version, responseId: prepared.response.id!,
      responseHash: prepared.draft.responseHash, source, locale: 'en', signerName: 'Other signer', consentAccepted: true };
    await test.widget('sign', prepared, 'surface-widget:sign', { input: changed });
    expect(test.controller.getSnapshot().reason).toBe('operation-conflict');
    expect(test.sign).toHaveBeenCalledOnce();
  });

  it('does not replace cleared state when an in-flight port later rejects', async () => {
    let reject!: (error: Error) => void;
    const test = fixture();
    test.saveDraft.mockImplementation(async () => new Promise((_resolve, fail) => { reject = fail; }));
    const pending = test.definition('saveInitial');
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    test.controller.invalidate(); reject(new Error('late network failure'));
    await pending;
    expect(test.controller.getSnapshot()).toEqual({ phase: 'refused', owned: false, reason: 'context-obsolete' });
    await test.definition('saveInitial', 'new-delivery');
    expect(test.saveDraft).toHaveBeenCalledOnce();
  });

  it('refuses altered handoff pins and signed-object replacement before Submit', async () => {
    const test = fixture();
    const prepared = await test.ready(); await test.widget('sign', prepared);
    test.buildHandoff.mockImplementation(async value => ({ ...sampleIntakeHandoff, responseRef: `response:${value.id}`,
      responseHash: `sha256:${await hashResponse(value)}`, extensions: { 'x-formspec-response': { ...value, data: { replaced: true } } } }));
    await test.widget('submit', test.controller.getSnapshot().signed!);
    expect(test.controller.getSnapshot().reason).toBe('context-mismatch');
    expect(test.submit).not.toHaveBeenCalled();
  });
});


describe('durable publication before downstream qualification', () => {
  it('gives downstream checks a detached frozen result and keeps preparation private for Sign', async () => {
    const observed: SavedResponseDraft[] = [];
    const test = fixture({ afterCommittedDraft: value => {
      observed.push(value);
      expect(Object.isFrozen(value.response.data)).toBe(true);
      expect(() => { Object.assign(value.draft, { id: 'tampered' }); }).toThrow();
    } });
    const prepared = await test.ready();
    const privatePrepared = await test.prepare.mock.results[0].value;
    expect(observed[1]).not.toBe(privatePrepared);
    expect(await test.widget('sign', prepared)).toMatchObject({ status: 'completed' });
    expect(test.sign.mock.calls[0][0].preparation).toBe(privatePrepared);
    expect(test.controller.getSnapshot().signed!.draft.id).toBe('owned-draft');
  });

  it('keeps the checkpoint but prevents Start dispatch after retirement during downstream checks', async () => {
    let finish!: () => void;
    const downstream = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const test = lifecycleFixture(true, { afterCommittedDraft: downstream });
    const pending = test.definition('startApplication');
    await vi.waitFor(() => expect(downstream).toHaveBeenCalledOnce());
    expect(test.controller.getSnapshot().saved!.draft.id).toBe('owned-draft');
    test.controller.invalidate(); finish();
    expect(await pending).toMatchObject({ status: 'failed' });
    expect(test.saveDraft).toHaveBeenCalledOnce();
    expect(test.startApplication).not.toHaveBeenCalled();
  });

  it('preserves Save, Prepare and Sign success when the awaited downstream callback rejects', async () => {
    const phases: string[] = [];
    const afterCommittedDraft = vi.fn(async (value: SavedResponseDraft) => {
      phases.push(test.controller.getSnapshot().phase);
      expect(test.controller.getSnapshot().saved).toEqual(value);
      throw new Error('later qualification Pending');
    });
    const test = fixture({ afterCommittedDraft });
    expect(await test.definition('saveInitial')).toMatchObject({ status: 'completed' });
    expect(await test.definition('prepare')).toMatchObject({ status: 'completed' });
    const prepared = test.controller.getSnapshot().prepared!;
    expect(await test.widget('sign', prepared)).toMatchObject({ status: 'completed' });
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'signed', owned: true });
    expect(test.controller.getSnapshot().signed!.response.authoredSignatures).toHaveLength(1);
    expect(phases).toEqual(['saved', 'prepared', 'signed']);
    expect(afterCommittedDraft).toHaveBeenCalledTimes(3);
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.prepare).toHaveBeenCalledOnce(); expect(test.sign).toHaveBeenCalledOnce();
  });

  it('shares the original pending Save while downstream checks wait and never resaves', async () => {
    let finish!: () => void;
    const afterCommittedDraft = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const hash = vi.fn(hashResponse);
    const test = fixture({ afterCommittedDraft, hashResponse: hash });
    const first = test.definition('saveInitial', 'same-act');
    await vi.waitFor(() => expect(afterCommittedDraft).toHaveBeenCalledOnce());
    expect(test.controller.getSnapshot().phase).toBe('saved');
    const retry = test.definition('saveInitial', 'same-act');
    await vi.waitFor(() => expect(hash).toHaveBeenCalledTimes(3));
    finish();
    expect(await first).toMatchObject({ status: 'completed' });
    expect(await retry).toMatchObject({ status: 'completed' });
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(afterCommittedDraft).toHaveBeenCalledOnce();
  });
});


describe('exact dispatched Sign reconciliation retry', () => {
  it.each(['uncommitted', 'committed'] as const)('re-enters only the frozen existing act after an ambiguous %s result', async kind => {
    const validation = vi.fn(fixture().config.validateFrozenResponse);
    const test = fixture({ reconcileSignRetries: true, validateFrozenResponse: validation });
    const prepared = await test.ready();
    const original = test.sign.getMockImplementation()!;
    const gate = vi.fn(); let writes = 0; let retained: SignedResponseSigning | undefined;
    test.sign.mockImplementation(async input => {
      if (retained) return retained;
      gate();
      if (kind === 'committed' || gate.mock.calls.length > 1) { writes++; retained = await original(input); }
      if (gate.mock.calls.length === 1) {
        test.reviewReady.mockReturnValue(false);
        validation.mockImplementation(() => { throw new Error('prepared facts retired'); });
        throw new Error('ambiguous transport');
      }
      return retained!;
    });
    expect(await test.widget('sign', prepared, 'same-sign-act')).toMatchObject({ status: 'failed' });
    expect(test.sign).toHaveBeenCalledOnce();
    expect(await test.widget('sign', prepared, 'new-sign-act')).toMatchObject({ status: 'failed' });
    expect(await test.widget('sign', prepared, 'same-sign-act', { input: { signerName: 'changed' } })).toMatchObject({ status: 'failed' });
    expect(test.sign).toHaveBeenCalledOnce();
    expect(await test.widget('sign', prepared, 'same-sign-act')).toMatchObject({ status: 'completed' });
    expect(test.sign).toHaveBeenCalledTimes(2);
    expect(test.sign.mock.calls[1][0].operationId).toBe(test.sign.mock.calls[0][0].operationId);
    expect(test.sign.mock.calls[1][0].preparation).toBe(test.sign.mock.calls[0][0].preparation);
    expect(test.sign.mock.calls[1][0].assent).toEqual(test.sign.mock.calls[0][0].assent);
    expect(gate).toHaveBeenCalledTimes(kind === 'committed' ? 1 : 2);
    expect(writes).toBe(1);
    expect(test.controller.getSnapshot().signed).toEqual(retained);
    expect(await test.widget('submit', test.controller.getSnapshot().signed!)).toMatchObject({ status: 'failed' });
    expect(test.submit).not.toHaveBeenCalled();
  });

  it('clears retry admission when the controller epoch retires', async () => {
    const test = fixture({ reconcileSignRetries: true }); const prepared = await test.ready();
    test.sign.mockRejectedValueOnce(new Error('ambiguous transport'));
    expect(await test.widget('sign', prepared, 'same-sign-act')).toMatchObject({ status: 'failed' });
    test.controller.invalidate();
    expect(await test.widget('sign', prepared, 'same-sign-act')).toMatchObject({ status: 'failed' });
    expect(test.sign).toHaveBeenCalledOnce();
  });
});


describe('typed response completion', () => {
  const selection = { taskId: 'urn:wos:default_process_01hw7rm71vfay8vvw14d2pf2db/tasks/correction',
    processId: 'urn:wos:default_process_01hw7rm71vfay8vvw14d2pf2db',
    definitionUrl: sampleFormDefinition.url, definitionVersion: sampleFormDefinition.version };
  function taskFixture(optionalOutput = false) {
    const roles = Object.fromEntries(['saveInitial', 'saveOwned', 'prepare', 'sign', 'submit', 'paper'].map(role =>
      [role, roleAdmission(role as ResponseActionRole)])) as ResponseActionControllerConfig['roles'];
    const request = roles.submit!.document['x-formspec-runtime']!.requests[0];
    request.request = { method: 'POST', pathTemplate: '/api/v1/tasks/{taskId}/response',
      pathBindings: { taskId: { from: 'input', path: 'taskId' } },
      bodyDefaults: { definitionUrl: selection.definitionUrl, definitionVersion: selection.definitionVersion },
      bodyBindings: { '/response': { from: 'input', path: 'frozenResponse' }, '/signedDraft': { from: 'input', path: 'signedDraft' } } };
    request.outputs = { task: { path: '/taskId', exposure: 'transition' }, status: { path: '/newStatus', exposure: 'internal' },
      ...(optionalOutput ? { actor: { path: '/actorRef', exposure: 'internal' as const } } : {}) };
    const complete = vi.fn(async (_submission: TaskSubmission, _operationId: string, _lifetime: CompletionLifetime) => ({ taskId: selection.taskId, processId: selection.processId,
      outcome: 'completed' as const, newStatus: 'submitted' as const, occurredAt: '2026-10-09T12:00:00Z' }));
    const test = fixture({ roles, completion: createTaskResponseCompletion({ selection, transport: { complete } }) });
    const sign = test.sign.getMockImplementation()!;
    test.sign.mockImplementation(async input => {
      const actual = await sign(input);
      const signedDraft = { draftId: actual.draft.id, expectedSignedDraftVersion: actual.draft.version,
        expectedSignedResponseHash: `sha256:${actual.draft.responseHash}`, associationHash: `sha256:${'b'.repeat(64)}`,
        taskBindingHash: `sha256:${'c'.repeat(64)}` };
      return { ...actual, evidence: { ...actual.evidence, taskDraft: { version: 1,
        associationHash: signedDraft.associationHash, taskBindingHash: signedDraft.taskBindingHash, signedDraft } } };
    });
    return { ...test, complete };
  }
  it('publishes the actual task outcome, preserves full signed bytes, and caches the completed act', async () => {
    const test = taskFixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    const first = await test.widget('submit', signed, 'task-completion');
    expect('invocation' in first ? first.invocation.status : first.status).toBe('completed');
    expect(test.complete).toHaveBeenCalledOnce();
    expect(test.complete.mock.calls[0][0]).toEqual({ definitionUrl: selection.definitionUrl,
      definitionVersion: selection.definitionVersion, response: signed.response, signedDraft: signed.evidence.taskDraft!.signedDraft });
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'submitted', completion: { kind: 'task', outcome: {
      taskId: selection.taskId, processId: selection.processId, outcome: 'completed', newStatus: 'submitted' } } });
    expect(test.controller.getSnapshot().confirmation).toBeUndefined();
    expect(test.buildHandoff).not.toHaveBeenCalled(); expect(test.submit).not.toHaveBeenCalled();
    expect(await test.widget('submit', signed, 'task-completion')).toEqual(first);
    expect(test.complete).toHaveBeenCalledOnce();
  });
  it.each(['exact', 'missing', 'hash', 'revision', 'association', 'binding'] as const)('restores only an exact signed task without new Save, Prepare or Sign: %s', async mode => {
    const producer = taskFixture(); const prepared = await producer.ready(); await producer.widget('sign', prepared);
    const generated = producer.controller.getSnapshot().signed!;
    const value: FormResponse = { ...generated.response, extensions: { ...generated.response.extensions, 'x-formspec-signing-content': {
      version: '1.0' as const, content, draftId: generated.draft.id, draftVersion: generated.draft.version - 1,
      actorRef: generated.actor.id, signerName: 'Actual signer', consentAccepted: true, signedAt: '2026-10-08T12:00:00Z',
      documentHash: 'a'.repeat(64), documentHashAlgorithm: 'sha-256' as const } } };
    const previous = { ...generated, ...await evidence(value, generated.draft.version), content,
      verification: { ...generated.verification, provider: value.authoredSignatures![0].signatureProvider } };
    const signedDraft = { draftId: previous.draft.id, expectedSignedDraftVersion: previous.draft.version,
      expectedSignedResponseHash: `sha256:${previous.draft.responseHash}`, associationHash: `sha256:${'b'.repeat(64)}`,
      taskBindingHash: `sha256:${'c'.repeat(64)}` };
    const signed = { ...previous, evidence: { ...previous.evidence, taskDraft: { version: 1 as const,
      associationHash: signedDraft.associationHash, taskBindingHash: signedDraft.taskBindingHash, signedDraft } } };
    const selected = taskFixture();
    const test = fixture({ roles: selected.config.roles, completion: selected.config.completion, restoredResponse: signed.response });
    if (mode !== 'exact') {
      const candidate = structuredClone(signed);
      if (mode === 'missing') Reflect.deleteProperty(candidate.evidence.taskDraft!, 'signedDraft');
      if (mode === 'hash') candidate.evidence.taskDraft!.signedDraft!.expectedSignedResponseHash = `sha256:${'0'.repeat(64)}`;
      if (mode === 'revision') candidate.evidence.taskDraft!.signedDraft!.expectedSignedDraftVersion++;
      if (mode === 'association') candidate.evidence.taskDraft!.signedDraft!.associationHash = `sha256:${'0'.repeat(64)}`;
      if (mode === 'binding') candidate.evidence.taskDraft!.signedDraft!.taskBindingHash = `sha256:${'0'.repeat(64)}`;
      await expect(test.controller.restoreSigned(candidate)).rejects.toThrow('context-mismatch');
      expect(test.controller.getSnapshot().signed).toBeUndefined(); expect(selected.complete).not.toHaveBeenCalled();
      expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.prepare).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
      return;
    }
    await test.controller.restoreSigned(signed);
    expect(test.controller.getSnapshot().signed).toEqual(signed);
    await test.widget('submit', signed, 'resumed-task-submit');
    expect(selected.complete).toHaveBeenCalledOnce();
    expect(selected.complete.mock.calls[0][0].response).toEqual(signed.response);
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.prepare).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
    expect(test.submit).not.toHaveBeenCalled();
  });
  it('retains the committed task event when optional authored output extraction fails', async () => {
    const test = taskFixture(true); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    await test.widget('submit', signed, 'missing-optional-output');
    expect(test.controller.getSnapshot().completion).toMatchObject({ kind: 'task', outcome: { outcome: 'completed' } });
    await test.widget('submit', signed, 'missing-optional-output');
    await test.widget('submit', signed, 'new-act');
    expect(test.complete).toHaveBeenCalledOnce();
  });
  it('refuses forged or foreign preparations and changed operation keys', async () => {
    const test = taskFixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    const strategy = createTaskResponseCompletion({ selection, transport: { complete: test.complete } });
    const foreign = createTaskResponseCompletion({ selection, transport: { complete: test.complete } });
    const lifetime = { signal: new AbortController().signal, assertCurrent: () => {} };
    const input = { signed, request: test.config.roles.submit!.document['x-formspec-runtime']!.requests[0], invocationInput: {} };
    const captured = await strategy.capture(input, lifetime);
    await expect(foreign.complete(captured, 'operation', lifetime)).rejects.toThrow('preparation mismatch');
    await expect(strategy.complete({ kind: 'task' }, 'operation', lifetime)).rejects.toThrow('preparation mismatch');
    expect(test.complete).not.toHaveBeenCalled();
    await strategy.complete(captured, 'operation', lifetime);
    await expect(strategy.complete(captured, 'changed-operation', lifetime)).rejects.toThrow('preparation mismatch');
    expect(test.complete).toHaveBeenCalledOnce();
  });
  it('keeps one captured task and operation key across an ambiguous retry', async () => {
    const test = taskFixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    test.complete.mockRejectedValueOnce(new Error('reply lost'));
    await test.widget('submit', signed, 'same-task-act');
    await test.widget('submit', signed, 'same-task-act');
    expect(test.complete).toHaveBeenCalledTimes(2);
    expect(test.complete.mock.calls[1].slice(0, 2)).toEqual(test.complete.mock.calls[0].slice(0, 2));
  });
  it('prevents intake dispatch when the controller retires during handoff preparation', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const original = test.buildHandoff.getMockImplementation()!;
    test.buildHandoff.mockImplementation(async value => { await wait; return original(value); });
    const pending = test.widget('submit', signed);
    await vi.waitFor(() => expect(test.buildHandoff).toHaveBeenCalledOnce());
    test.controller.invalidate(); release(); await pending;
    expect(test.submit).not.toHaveBeenCalled();
    expect(test.controller.getSnapshot().completion).toBeUndefined();
  });
  it('freezes the detached signed response before invoking an intake builder', async () => {
    const test = fixture(); const prepared = await test.ready(); await test.widget('sign', prepared);
    const signed = test.controller.getSnapshot().signed!;
    test.buildHandoff.mockImplementation(async value => {
      expect(Object.isFrozen(value.data)).toBe(true);
      expect(() => { value.data.changed = true; }).toThrow();
      return { ...sampleIntakeHandoff, responseRef: `response:${value.id}`, responseHash: `sha256:${await hashResponse(value)}`,
        extensions: { 'x-formspec-response': value } };
    });
    await test.widget('submit', signed);
    expect(signed.response.data.changed).toBeUndefined(); expect(test.submit).toHaveBeenCalledOnce();
  });
});


describe('restored pending signing act', () => {
  it('uses the renewed operation key after fresh review and refuses new Save or Prepare acts', async () => {
    const value = { ...await evidence(response, 33), content, operationId: '01a12800-0000-7000-8000-000000000001' };
    const baseline = fixture(); const newKey = '01a12800-0000-7000-8000-000000000002'; const restorePending = vi.fn(async () => ({ kind: 'prepared' as const, preparation: value, operationId: newKey }));
    const test = fixture({ restoredResponse: response, signing: { ...baseline.config.signing, restorePending } });
    await test.controller.restorePending(value);
    expect(test.controller.getSnapshot()).toMatchObject({ phase: 'prepared', pendingSign: true, prepared: value });
    await test.definition('saveOwned'); await test.definition('prepare');
    expect(baseline.saveDraft).not.toHaveBeenCalled(); expect(baseline.prepare).not.toHaveBeenCalled();
    test.reviewReady.mockReturnValue(false);
    await test.widget('sign', value); expect(baseline.sign).not.toHaveBeenCalled();
    test.reviewReady.mockReturnValue(true); await test.widget('sign', value, 'renewed-reviewed-act');
    expect(baseline.sign.mock.calls[0][0].operationId).toBe(newKey);
  });
});


it('captures the pending operation key and candidate before asynchronous restoration', async () => {
  const original = { ...await evidence(structuredClone(response), 33), content, operationId: '01a12800-0000-7000-8000-000000000001' };
  const value = structuredClone(original); const baseline = fixture(); let finish!: () => void;
  const restorePending = vi.fn((_input: Parameters<NonNullable<ResponseActionControllerConfig['signing']['restorePending']>>[0], _operationId: string) => new Promise<{ kind: 'prepared'; preparation: PreparedResponseSigning; operationId: string }>(resolve => { finish = () => resolve({ kind: 'prepared', preparation: original, operationId: original.operationId }); }));
  const test = fixture({ restoredResponse: structuredClone(response), signing: { ...baseline.config.signing, restorePending } });
  const restoring = test.controller.restorePending(value);
  await vi.waitFor(() => expect(finish).toBeDefined());
  value.operationId = '01a12800-0000-7000-8000-000000000002'; value.response.data = { changed: true };
  finish(); await restoring;
  await test.widget('sign', original);
  expect(restorePending.mock.calls[0][1]).toBe(original.operationId);
  expect(baseline.sign.mock.calls[0][0].operationId).toBe(original.operationId);
});

describe('unsigned checkpoints without signing wording', () => {
  it('saves initial and owned checkpoints without invoking signing context', async () => {
    const signingContext = vi.fn(() => { throw new Error('Signing wording unavailable'); });
    const test = fixture({ signingContext });
    expect(await test.definition('saveInitial')).toMatchObject({ status: 'completed' });
    expect(await test.definition('saveOwned')).toMatchObject({ status: 'completed' });
    expect(signingContext).not.toHaveBeenCalled(); expect(test.saveDraft).toHaveBeenCalledTimes(2);
    expect(await test.definition('prepare')).toMatchObject({ status: 'failed' });
    expect(signingContext).toHaveBeenCalledOnce(); expect(test.prepare).not.toHaveBeenCalled();
  });
  it('starts an admitted application without invoking signing context', async () => {
    const signingContext = vi.fn(() => { throw new Error('Signing wording unavailable'); });
    const test = lifecycleFixture(true, { signingContext });
    expect(await test.definition('startApplication')).toMatchObject({ status: 'completed' });
    expect(signingContext).not.toHaveBeenCalled(); expect(test.startApplication).toHaveBeenCalledOnce();
  });
  it.each(['sign', 'submit'] as const)('retains signing context admission for %s', async role => {
    let available = true;
    const signingContext = vi.fn(() => { if (!available) throw new Error('Signing wording unavailable'); return { source, locale: 'en' }; });
    const test = fixture({ signingContext }); const preparation = await test.ready();
    if (role === 'submit') await test.widget('sign', preparation);
    const selected = role === 'submit' ? test.controller.getSnapshot().signed! : preparation;
    available = false; signingContext.mockClear();
    expect(await test.widget(role, selected)).toMatchObject({ status: 'failed' });
    expect(signingContext).toHaveBeenCalledOnce(); expect(test.submit).not.toHaveBeenCalled();
    expect(test.sign).toHaveBeenCalledTimes(role === 'submit' ? 1 : 0);
  });
});


it('reports Save validation refusal before any signing port call with closed metadata', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const test = fixture();
  expect(await test.controller.definitionInvoker({ document: test.config.roles.saveInitial!.document, actionRef: 'saveInitial',
    ports: { submit: () => { throw new Error('private URL token response'); }, validationReportValid: () => true, dispatchHostEvent: vi.fn() } })).toMatchObject({ status: 'failed' });
  expect(test.saveDraft).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledExactlyOnceWith('Native form Save diagnostic', JSON.stringify({ stage: 'controller-validation', reason: 'port-failed' }));
  warn.mockRestore();
});


describe('fixed Submit diagnostics', () => {
  it.each(['admission', 'validation', 'review', 'preflight', 'effect', 'blocked'] as const)('reports %s without private values and preserves refusal', async kind => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const test = fixture(); await test.widget('sign', await test.ready());
      const signed = test.controller.getSnapshot().signed!;
      if (kind === 'validation') test.config.validateFrozenResponse = () => { throw new Error('private URL token signature response'); };
      if (kind === 'review') test.reviewReady.mockReturnValue(false);
      if (kind === 'preflight') test.config.captureSubmitOptions = async () => { throw new Error('private URL token signature response'); };
      if (kind === 'effect') test.submit.mockRejectedValueOnce(new Error('private URL token signature response'));
      if (kind === 'blocked') {
        const original = test.config.validateFrozenResponse;
        test.config.validateFrozenResponse = async (value, tuple) => {
          const result = await original(value, tuple);
          return { ...result, validationReport: { ...result.validationReport!, valid: false,
            results: [{ $formspecValidationResult: '1.0', constraintKind: 'required', path: 'private-field', severity: 'error', message: 'private validation message' }],
            counts: { error: 1, warning: 0, info: 0 } } };
        };
      }
      const result = await test.widget('submit', signed, 'private-operation', kind === 'admission' ? { source: widgetSource('foreign') } : {});
      expect(result).toMatchObject({ status: kind === 'blocked' ? 'blocked' : 'failed' });
      expect(warn.mock.calls).toEqual([['Native form Submit diagnostic', JSON.stringify({
        stage: kind === 'admission' ? 'controller-admission' : kind === 'review' ? 'controller-review'
          : kind === 'effect' ? 'controller-effect' : kind === 'preflight' ? 'controller-completion-preflight' : 'controller-frozen-validation',
        kind: kind === 'blocked' ? 'refused' : 'failed' })]]);
      expect(test.controller.getSnapshot().signed).toEqual(signed);
      expect(test.submit).toHaveBeenCalledTimes(kind === 'effect' ? 1 : 0);
    } finally { warn.mockRestore(); }
  });
  it('keeps success silent and preserves failures when console throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('observer'); });
    try {
      const test = fixture(); await test.widget('sign', await test.ready());
      const signed = test.controller.getSnapshot().signed!;
      test.reviewReady.mockReturnValue(false);
      expect(await test.widget('submit', signed)).toMatchObject({ status: 'failed', failureReason: 'review-unready' });
      test.reviewReady.mockReturnValue(true);
      expect(await test.widget('submit', signed, 'new-act')).toMatchObject({ status: 'completed' });
      expect(warn).toHaveBeenCalledOnce(); expect(test.submit).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });
});
