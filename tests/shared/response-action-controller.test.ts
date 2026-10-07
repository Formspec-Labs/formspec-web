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

describe('generic admitted Response Action controller', () => {
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
    expect(test.submit.mock.calls[1]).toEqual([handoff, operation]); expect(test.buildHandoff).toHaveBeenCalledOnce();
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
