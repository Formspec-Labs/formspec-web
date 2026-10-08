import type { AdmittedResponseAction } from '../../../src/ports/response-signing.ts';
import { describe, expect, it, vi } from 'vitest';
import { HttpApplicationLifecycle, readApplicationLifecycleCapabilities } from '../../../src/adapters/http/application-lifecycle.ts';
import { HttpClient } from '../../../src/adapters/http/http-client.ts';
import { createDraftBindingRegistry } from '../../../src/adapters/http/draft-binding-registry.ts';
import { ResponseSigningScopeFence } from '../../../src/adapters/http/response-signing.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';
const publication = { formId: 'form', formVersionId: 'publication' };
const key = { formUrl: 'urn:test:form', formVersion: '1', subjectRef: 'owner' };
const draftId = '00000000-0000-4000-8000-000000000001';
const capabilities = { earlyCaseCreation: true, persistentSaving: true, formVersionId: 'publication' };
const action: AdmittedResponseAction = { artifactRef: 'urn:test:actions', artifactDigest: 'sha256:verified', actionRef: 'start', requestRef: 'start', document: {
  $formspecResponseActions: '1.0' as const, version: '1', scope: 'response' as const, targetDefinition: { url: key.formUrl },
  actions: [{ id: 'start', intent: 'x-start-application', validation: { profile: 'off' as const, blocking: 'non-blocking' as const, persistence: 'none' as const },
    effects: [{ type: 'serviceRequest' as const, requestRef: 'start', idempotencyKey: '@invocation.id' }] }],
  'x-formspec-runtime': { version: '1.0' as const, requests: [{ id: 'start', adapter: 'http-json' as const, request: { method: 'POST' as const,
    pathTemplate: '/drafts/{draftId}/application-case', pathBindings: { draftId: { from: 'input' as const, path: 'draftId' } }, bodyDefaults: {} }, successStatuses: [200] }] } } };
const receipt = { caseLedgerId: 'urn:wos:real-case', caseReference: 'APP-001', draftRef: `urn:formspec:draft:${draftId}`, status: 'in-progress' };
function fixture(value: unknown = receipt) {
  const fetch = recordingFetch(() => jsonResponse(value));
  const client = new HttpClient({ baseUrl: 'https://api.test', accessToken: () => 'fresh-bearer', fetchImpl: fetch.fetch });
  const bindings = createDraftBindingRegistry(); bindings.put(key, { draftId, draftVersion: 1 });
  const fence = new ResponseSigningScopeFence(k => JSON.stringify(k));
  const port = new HttpApplicationLifecycle({ client, publication, definition: { url: key.formUrl, version: key.formVersion }, capabilities, action, bindings, fence });
  return { client, bindings, port, fetch, fence };
}
describe('qualified application lifecycle', () => {
  it('reads strict backend capabilities for the exact admitted publication', async () => {
    const f = fixture(capabilities);
    expect(await readApplicationLifecycleCapabilities(f.client, publication)).toEqual(capabilities);
    expect(f.fetch.requests[0].url).toBe('https://api.test/runtime/forms/form/application-lifecycle');
  });
  it.each([{ ...capabilities, formVersionId: 'other' }, { ...capabilities, persistentSaving: 'true' }, { ...capabilities, extra: true }])('refuses unqualified capabilities', async value => {
    const f = fixture(value); await expect(readApplicationLifecycleCapabilities(f.client, publication)).rejects.toThrow();
  });
  it('starts or resumes only the original owned draft and returns actual case identity', async () => {
    const f = fixture(); expect(await f.port.start(key, 'operation')).toEqual(receipt);
    expect(await f.port.start(key, 'retry')).toEqual(receipt);
    expect(f.fetch.requests).toHaveLength(2);
    expect(f.fetch.requests[0]).toMatchObject({ url: `https://api.test/drafts/${draftId}/application-case`, method: 'POST', body: {} });
    expect(f.bindings.get(key)?.draftId).toBe(draftId);
  });
  it.each([{ ...receipt, draftRef: 'urn:formspec:draft:other' }, { ...receipt, status: 'accepted' }, { ...receipt, caseLedgerId: 'invented' }, { ...receipt, extra: true }])('refuses contradictory receipt', async value => {
    const f = fixture(value); await expect(f.port.start(key, 'operation')).rejects.toThrow();
    expect(f.bindings.get(key)?.draftId).toBe(draftId);
  });
  it('reads an existing case without a write even when early creation is disabled', async () => {
    const f = fixture(); const port = new HttpApplicationLifecycle({ client: f.client, publication,
      definition: { url: key.formUrl, version: key.formVersion }, capabilities: { ...capabilities, earlyCaseCreation: false }, action, bindings: f.bindings, fence: f.fence });
    expect(await port.load(key)).toEqual(receipt); expect(f.fetch.requests[0].method).toBe('GET');
    await expect(port.start(key, 'operation')).rejects.toThrow(); expect(f.fetch.requests).toHaveLength(1);
  });
  it('accepts only qualified HTTP200 null as absence', async () => {
    const f = fixture(null); expect(await f.port.load(key)).toBeUndefined();
    const fetch = recordingFetch(() => jsonResponse(null, 404));
    const port = new HttpApplicationLifecycle({ client: new HttpClient({ baseUrl: 'https://api.test', fetchImpl: fetch.fetch }), publication,
      definition: { url: key.formUrl, version: key.formVersion }, capabilities, action, bindings: f.bindings, fence: f.fence });
    await expect(port.load(key)).rejects.toMatchObject({ status: 404 }); expect(f.bindings.get(key)?.draftId).toBe(draftId);
  });
  it('refuses missing/wrong owner or version without dispatching Start', async () => {
    const f = fixture();
    for (const changed of [{ ...key, subjectRef: 'other' }, { ...key, formVersion: '2' }, { ...key, subjectRef: 'anon:owner' }]) await expect(f.port.start(changed, 'operation')).rejects.toThrow();
    expect(f.fetch.requests).toHaveLength(0);
  });
  it('retires a held credential lookup before physical dispatch', async () => {
    const f = fixture(); let release!: (token: string) => void;
    const token = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const port = new HttpApplicationLifecycle({ client: new HttpClient({ baseUrl: 'https://api.test', accessToken: token, fetchImpl: f.fetch.fetch }),
      publication, definition: { url: key.formUrl, version: key.formVersion }, capabilities, action, bindings: f.bindings, fence: f.fence });
    const result = port.start(key, 'operation'); await vi.waitFor(() => expect(token).toHaveBeenCalled());
    f.fence.invalidate(key); release('fresh-bearer'); await expect(result).rejects.toThrow(); expect(f.fetch.requests).toHaveLength(0);
  });
  it.each([401, 403, 404, 503])('preserves the owned draft after an unsuccessful read (%s)', async status => {
    const f = fixture();
    const fetch = recordingFetch(() => jsonResponse(null, status));
    const port = new HttpApplicationLifecycle({ client: new HttpClient({ baseUrl: 'https://api.test', accessToken: () => 'fresh-bearer', fetchImpl: fetch.fetch }),
      publication, definition: { url: key.formUrl, version: key.formVersion }, capabilities, action, bindings: f.bindings, fence: f.fence });
    await expect(port.load(key)).rejects.toMatchObject({ status });
    expect(fetch.requests[0].method).toBe('GET'); expect(f.bindings.get(key)?.draftId).toBe(draftId);
  });
  it.each(['retired', 'rebound'])('rejects a late read after authority is %s', async change => {
    const f = fixture(); let release!: (response: Response) => void;
    const fetch = recordingFetch(() => new Promise<Response>(resolve => { release = resolve; }));
    const port = new HttpApplicationLifecycle({ client: new HttpClient({ baseUrl: 'https://api.test', accessToken: () => 'fresh-bearer', fetchImpl: fetch.fetch }),
      publication, definition: { url: key.formUrl, version: key.formVersion }, capabilities, action, bindings: f.bindings, fence: f.fence });
    const result = port.load(key); await vi.waitFor(() => expect(fetch.requests).toHaveLength(1));
    if (change === 'retired') f.fence.invalidate(key);
    else f.bindings.put(key, { draftId: '00000000-0000-4000-8000-000000000002', draftVersion: 1 });
    release(jsonResponse(receipt)); await expect(result).rejects.toThrow();
  });
  it.each(['intent', 'path', 'body', 'exposure'])('refuses an unadmitted Start %s before dispatch', async change => {
    const f = fixture(); const altered = structuredClone(action);
    const request = altered.document['x-formspec-runtime']!.requests[0];
    if (change === 'intent') altered.document.actions[0].intent = 'save-draft';
    if (change === 'path') request.request.pathTemplate = '/other/{draftId}';
    if (change === 'body') request.request.bodyDefaults = { caseRef: 'invented' };
    if (change === 'exposure') request.outputs = { case: { path: '/caseLedgerId', exposure: 'session' } };
    const port = new HttpApplicationLifecycle({ client: f.client, publication, definition: { url: key.formUrl, version: key.formVersion }, capabilities,
      action: altered, bindings: f.bindings, fence: f.fence });
    await expect(port.start(key, 'operation')).rejects.toThrow(); expect(f.fetch.requests).toHaveLength(0);
  });

});
