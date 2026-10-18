import { generateIdempotencyKey } from '../../../src/shared/idempotency-key.ts';
import { hydrationFixture } from './screener-hydration-fixture.ts';
import { HttpDraftStore } from '../../../src/adapters/http/draft-store.ts';
import { createDraftBindingRegistry } from '../../../src/adapters/http/draft-binding-registry.ts';
import { describe, expect, it, vi } from 'vitest';
import { HttpTaskDraftLaunch } from '../../../src/adapters/http/task-draft-launch.ts';
import { createTaskComposition } from '../../../src/composition/task.ts';
import { sampleFormDefinition, sampleFormResponse } from '../../../src/adapter-conformance/fixtures.ts';
import { taskCompletionFixture } from '../../fixtures/task-completion.ts';
import { otherScopeKey, testScopeKey } from '../../fixtures/scope.ts';

const selection = { version: 1 as const, taskId: 'opaque-actual-task', expectedTaskRevision: 'actual-revision',
  formVersionId: 'actual-publication', formVersionHash: `sha256:${'a'.repeat(64)}` };
const view = { draft_id: 'actual-draft', form_version_id: selection.formVersionId, subject_ref: 'actual-owner', draft_version: 1,
  draft_state: sampleFormResponse.data, canonical_response: sampleFormResponse, status: 'in_progress',
  taskDraft: { version: 1, associationHash: `sha256:${'b'.repeat(64)}`, taskBindingHash: `sha256:${'c'.repeat(64)}` } };
const lifetime = () => ({ signal: new AbortController().signal, assertCurrent: () => {} });

describe('Source-owned task launch', () => {
  it('forwards actual launch selectors with current bearer and stable idempotency', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(view));
    const adapter = new HttpTaskDraftLaunch({ baseUrl: 'https://source.example.test', accessToken: 'actual-token',
      fetchImpl, selection, expectedSubjectRef: 'actual-owner', definition: sampleFormDefinition,
      assertCurrent: () => {}, validateResponse: () => true });
    expect(await adapter.launch('same-key', lifetime())).toEqual(view);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://source.example.test/runtime/task-drafts');
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toEqual(selection);
    expect(new Headers(fetchImpl.mock.calls[0][1]!.headers).get('idempotency-key')).toBe('same-key');
  });
  it('refuses a mismatched canonical draft snapshot', async () => {
    const adapter = new HttpTaskDraftLaunch({ baseUrl: 'https://source.example.test', accessToken: 'actual-token',
      fetchImpl: async () => Response.json({ ...view, draft_state: { changed: true } }), selection,
      expectedSubjectRef: 'actual-owner', definition: sampleFormDefinition, assertCurrent: () => {}, validateResponse: () => true });
    await expect(adapter.launch('same-key', lifetime())).rejects.toThrow('mismatched owned draft');
  });
  it('refuses missing task hydration before launching Source', async () => {
    const fetchImpl = vi.fn();
    const config = { source: { scopeKey: testScopeKey, baseUrl: 'https://source.example.test', accessToken: 'actual-token', fetchImpl },
      wos: { scopeKey: otherScopeKey, baseUrl: 'https://wos.example.test', accessToken: 'actual-token' }, launch: selection,
      completion: { taskId: selection.taskId, processId: 'actual-process', definitionUrl: sampleFormDefinition.url,
        definitionVersion: sampleFormDefinition.version }, draftKey: { formUrl: sampleFormDefinition.url,
        formVersion: sampleFormDefinition.version, subjectRef: 'actual-owner' }, formId: 'actual-form',
      definition: sampleFormDefinition, locales: [], signing: { validateResponse: () => true, validateContent: () => true,
        signingProfileDigest: async () => 'hash', keyId: 'actual-key', expectedIssuer: 'https://source.example.test/tenant/workspace/production' },
      resumeMetadata: { read: () => undefined, write: () => {}, remove: () => {} },
      assertCurrentSource: () => {}, assertCurrentWos: () => {}, launchOperationId: 'same-key' };
    await expect(createTaskComposition(config, lifetime())).rejects.toThrow('task candidate hydration');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});


it('refuses ordinary draft creation after a task-owned binding is lost', async () => {
  const fetchImpl = vi.fn();
  const store = new HttpDraftStore({ baseUrl: 'https://source.example.test', accessToken: 'actual-token', fetchImpl,
    requireExistingBinding: true, bindingRegistry: createDraftBindingRegistry() });
  await expect(store.save({ formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version,
    subjectRef: 'actual-owner' }, sampleFormResponse)).rejects.toThrow('relaunch the owning task');
  expect(fetchImpl).not.toHaveBeenCalled();
});


it('validates the selected completion wait through task composition before any Source launch', async () => {
  const fetchImpl = vi.fn();
  await expect(createTaskComposition({ ...taskConfig(fetchImpl), completionTimeoutMs: 0 }, lifetime())).rejects.toThrow('Task completion timeout');
  expect(fetchImpl).not.toHaveBeenCalled();
});
function taskConfig(fetchImpl: typeof fetch) {
  const processId = 'urn:wos:default_process_01hw7rm71vfay8vvw14d2pf2db';
  const launch = { ...selection, taskId: `${processId}/tasks/actual` };
  return { source: { scopeKey: testScopeKey, baseUrl: 'https://source.example.test', accessToken: 'actual-token', fetchImpl },
    wos: { scopeKey: otherScopeKey, baseUrl: 'https://wos.example.test', accessToken: 'actual-token' }, launch,
    completion: { taskId: launch.taskId, processId, definitionUrl: sampleFormDefinition.url, definitionVersion: sampleFormDefinition.version },
    draftKey: { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version, subjectRef: 'actual-owner' },
    formId: 'actual-form', definition: sampleFormDefinition, locales: [],
    signing: { validateResponse: () => true, validateContent: () => true, signingProfileDigest: async () => 'hash', keyId: 'actual-key', expectedIssuer: 'https://source.example.test/tenant/workspace/production',
      preSignCandidate: async () => ({ assertCurrent: () => {} }) },
    resumeMetadata: { read: () => undefined, write: () => {}, remove: () => {} },
    assertCurrentSource: () => {}, assertCurrentWos: () => {}, launchOperationId: 'same-key' };
}

it('preserves the client request signal when adding the task lifetime', async () => {
  let observed: AbortSignal | null | undefined;
  const clientLifetime = lifetime();
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    observed = init?.signal;
    return Response.json(view);
  });
  await createTaskComposition(taskConfig(fetchImpl), clientLifetime);
  expect(observed).toBeInstanceOf(AbortSignal);
  expect(observed).not.toBe(clientLifetime.signal);
});

it('cancels a late response body when the Source owner retires during launch', async () => {
  let release!: (response: Response) => void;
  let started!: () => void;
  const observed = new Promise<void>(resolve => { started = resolve; });
  const fetchImpl = vi.fn(async () => { started(); return new Promise<Response>(resolve => { release = resolve; }); });
  const config = taskConfig(fetchImpl);
  let current = true;
  config.assertCurrentSource = () => { if (!current) throw new Error('retired owner'); };
  const pending = createTaskComposition(config, lifetime());
  await observed;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }));
  current = false;
  release(response);
  await expect(pending).rejects.toThrow('retired owner');
  expect(cancel).toHaveBeenCalledOnce();
});

it('composes the selected task candidate adapter against the actual launch result', async () => {
  const original = await hydrationFixture();
  const taskDraft = { version: 1 as const, associationHash: `sha256:${'b'.repeat(64)}`, taskBindingHash: `sha256:${'c'.repeat(64)}` };
  const saved = { ...original.input.saved, evidence: { ...original.input.saved.evidence, taskDraft } };
  const launchView = saved.evidence;
  const pendingView = { ...original.view, providerReceipt: null, results: [{ status: 'pending' as const,
    instanceName: 'facts', sourceRef: 'screening', reason: 'actual-task-origin-unavailable' }] };
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => Response.json(new URL(String(url)).pathname === '/runtime/task-drafts' ? launchView : pendingView,
    { headers: { 'cache-control': 'no-store' } }));
  const base = taskConfig(fetchImpl);
  const composed = await createTaskComposition({ ...base, source: { ...base.source, scopeKey: original.config.scopeKey },
    definition: original.config.definition, draftKey: saved.draftKey, formId: original.view.selection.formId,
    launch: { ...base.launch, formVersionId: original.view.selection.formVersionId, formVersionHash: original.view.formVersionHash },
    completion: { ...base.completion, definitionUrl: original.config.definition.url!, definitionVersion: original.config.definition.version },
    taskHydration: { selection: original.view.selection, identity: original.input.identity } }, lifetime());
  expect(composed.launched.taskDraft).toEqual(taskDraft);
  expect(composed.candidateHydration).toBeDefined();
  const facts = await composed.candidateHydration!.qualifySaved(saved, lifetime());
  expect(facts.view.results[0].status).toBe('pending');
  expect(() => facts.assertReady()).toThrow('pending or unavailable');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  for (const [, init] of fetchImpl.mock.calls) expect(new Headers(init?.headers).get('x-stack-scope-key')).toBe(original.config.scopeKey);
  composed.candidateHydration!.dispose();
});

it('forwards trusted nonserialized Save lifetime options through the task wrapper', async () => {
  const fetchImpl = vi.fn(async () => Response.json(view));
  const config = taskConfig(fetchImpl); const composed = await createTaskComposition(config, lifetime());
  const guard = vi.fn(() => { throw Error('task save lifetime retired'); });
  await expect(composed.responseSigning.saveDraft({ formId: config.formId, draftKey: config.draftKey,
    definition: config.definition, formVersionId: selection.formVersionId, response: sampleFormResponse,
    operationId: generateIdempotencyKey(), action: { document: { $formspecResponseActions: '1.0', version: '1', scope: 'response',
      targetDefinition: { url: sampleFormDefinition.url }, actions: [{ id: 'save', intent: 'save-draft', effects: [{ type: 'serviceRequest', requestRef: 'save', idempotencyKey: '@invocation.id' }] }] }, artifactRef: 'urn:test:save', artifactDigest: `sha256:${'a'.repeat(64)}`,
      actionRef: 'save', requestRef: 'save' } }, { assertBeforeDispatch: guard })).rejects.toThrow('task save lifetime retired');
  expect(guard).toHaveBeenCalledOnce(); expect(fetchImpl).toHaveBeenCalledOnce();
});


it.each(['guard', 'settings-accessor'] as const)('routes distinct Source reads and WOS completion through their actual adapters despite caller %s', async mutation => {
  const sourceFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(view));
  const config = taskConfig(sourceFetch);
  Object.assign(config.source, { scopeKey: testScopeKey });
  const wosFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
    taskId: config.completion.taskId, processId: config.completion.processId, outcome: 'completed',
    newStatus: 'submitted', occurredAt: '2026-10-18T12:00:00Z' }));
  Object.assign(config.wos, { scopeKey: otherScopeKey, fetchImpl: wosFetch });
  const mutate = () => { Object.assign(config.source, { scopeKey: otherScopeKey }); Object.assign(config.wos, { scopeKey: testScopeKey }); };
  if (mutation === 'guard') config.assertCurrentSource = mutate;
  else Object.defineProperty(config.source, 'fetchImpl', { enumerable: true, get() { mutate(); return sourceFetch; } });
  const composed = await createTaskComposition(config, lifetime());
  await composed.draftStore.load(config.draftKey);
  const prepared = await composed.completion.capture(taskCompletionFixture(sampleFormResponse), lifetime());
  await composed.completion.complete(prepared, 'scope-routing-completion', lifetime());
  expect(sourceFetch).toHaveBeenCalledTimes(2);
  for (const [, init] of sourceFetch.mock.calls) expect(new Headers(init?.headers).get('x-stack-scope-key')).toBe(testScopeKey);
  expect(wosFetch).toHaveBeenCalledOnce();
  expect(new Headers(wosFetch.mock.calls[0][1]?.headers).get('x-stack-scope-key')).toBe(otherScopeKey);
});

it.each(['source', 'wos'] as const)('refuses missing or malformed %s selection before callbacks or I/O', async service => {
  for (const scopeKey of [undefined, null, '', 'A'.repeat(64), 'a'.repeat(63), 17]) {
    const fetchImpl = vi.fn();
    const config = taskConfig(fetchImpl);
    Object.assign(config[service], { scopeKey });
    const callback = vi.fn();
    config.assertCurrentSource = callback; config.assertCurrentWos = callback;
    config.source.accessToken = callback as unknown as string; config.wos.accessToken = callback as unknown as string;
    await expect(createTaskComposition(config, { ...lifetime(), assertCurrent: callback })).rejects.toThrow('scope key');
    expect(fetchImpl).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
  }
});
