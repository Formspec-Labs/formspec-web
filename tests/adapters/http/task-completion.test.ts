import { RESPONSE_SCHEMA_DOCUMENT } from '../../../src/adapters/schema/canonical-schemas.ts';
import { describe, expect, it, vi } from 'vitest';
import { HttpTaskCompletion } from '../../../src/adapters/http/task-completion.ts';
import { sampleFormResponse } from '../../../src/adapter-conformance/fixtures.ts';
import type { TaskSubmission } from '../../../src/ports/task-completion.ts';
import { jsonResponse } from './test-fetch.ts';

const processId = 'urn:wos:default_process_01hw7rm71vfay8vvw14d2pf2db';
const selection = { processId, taskId: `${processId}/tasks/photo-correction`,
  definitionUrl: sampleFormResponse.definitionUrl, definitionVersion: sampleFormResponse.definitionVersion };
const signedDraft = { draftId: 'actual-source-draft', expectedSignedDraftVersion: 3, expectedSignedResponseHash: `sha256:${'a'.repeat(64)}`, associationHash: `sha256:${'b'.repeat(64)}`, taskBindingHash: `sha256:${'c'.repeat(64)}` };
const submission: TaskSubmission = { signedDraft, definitionUrl: selection.definitionUrl, definitionVersion: selection.definitionVersion,
  response: { ...sampleFormResponse, status: 'completed', authoredSignatures: [RESPONSE_SCHEMA_DOCUMENT.properties.authoredSignatures.examples[0][0]] as TaskSubmission['response']['authoredSignatures'] } };
const outcome = { taskId: selection.taskId, processId, outcome: 'completed', newStatus: 'submitted', occurredAt: '2026-10-09T12:00:00Z' };
const lifetime = () => ({ signal: new AbortController().signal, assertCurrent: () => {} });

describe('inactive typed WOS task completion adapter', () => {
  it('keeps signed draft selectors optional for other task submissions', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(outcome));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token', fetchImpl,
      assertCurrentAuth: () => {} });
    const actual = { definitionUrl: submission.definitionUrl, definitionVersion: submission.definitionVersion,
      response: submission.response };
    expect(await adapter.complete(actual, 'signed-operation', lifetime())).toEqual(outcome);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toEqual(actual);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).not.toHaveProperty('signedDraft');
  });
  it.each([
    { ...signedDraft, draftId: '' },
    { ...signedDraft, expectedSignedDraftVersion: 1 },
    { ...signedDraft, expectedSignedDraftVersion: 2.5 },
    { ...signedDraft, expectedSignedResponseHash: 'a'.repeat(64) },
    { ...signedDraft, associationHash: `sha256:${'B'.repeat(64)}` },
    { ...signedDraft, taskBindingHash: `sha256:${'c'.repeat(63)}` },
    { ...signedDraft, owner: 'client-selected-owner' },
    null,
    ...Object.keys(signedDraft).map(key => Object.fromEntries(Object.entries(signedDraft).filter(([name]) => name !== key))),
  ])('refuses malformed signed draft selectors before credentials: %j', async candidate => {
    const accessToken = vi.fn(() => 'wos-token'); const fetchImpl = vi.fn();
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken, fetchImpl,
      assertCurrentAuth: () => {} });
    await expect(adapter.complete({ ...submission, signedDraft: candidate } as unknown as TaskSubmission,
      'signed-operation', lifetime())).rejects.toThrow('candidate mismatch');
    expect(accessToken).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['', ' key', 'key ', 'line\nbreak', 'non-ascii-é', 'a'.repeat(257)])('refuses malformed key before credentials: %j', async operationId => {
    const accessToken = vi.fn(() => 'wos-token'); const fetchImpl = vi.fn();
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken, fetchImpl, assertCurrentAuth: () => {} });
    await expect(adapter.complete(submission, operationId, lifetime())).rejects.toThrow();
    expect(accessToken).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('encodes the entire opaque task once and returns only the actual event', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(outcome));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token', fetchImpl, assertCurrentAuth: () => {} });
    expect(await adapter.complete(submission, 'same-operation', lifetime())).toEqual(outcome);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://wos.test/api/v1/tasks/${encodeURIComponent(selection.taskId)}/response`);
    const init = fetchImpl.mock.calls[0][1]!;
    expect(JSON.parse(init.body as string)).toEqual(submission);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer wos-token');
    expect(new Headers(init.headers).get('idempotency-key')).toBe('same-operation');
  });
  it.each([{ ...outcome, taskId: `${processId}/tasks/foreign` }, { ...outcome, outcome: 'submitted' },
    { ...outcome, newStatus: 'pending' }, { ...outcome, response_id: 'fake-intake' }])('refuses an unrelated or malformed result', async result => {
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token',
      fetchImpl: async () => jsonResponse(result), assertCurrentAuth: () => {} });
    await expect(adapter.complete(submission, 'same-operation', lifetime())).rejects.toThrow('outcome mismatch');
  });
  it('aborts a task result while its response body is still arriving', async () => {
    let bodyStarted!: () => void;
    const started = new Promise<void>(resolve => { bodyStarted = resolve; });
    const body = new ReadableStream<Uint8Array>({ pull() { bodyStarted(); } }, { highWaterMark: 0 });
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token',
      fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
      assertCurrentAuth: () => {} });
    const abort = new AbortController();
    const pending = adapter.complete(submission, 'same-operation', { signal: abort.signal, assertCurrent: () => {} });
    await started; abort.abort(new Error('retired during body'));
    await expect(pending).rejects.toThrow('retired during body');
  });
  it('checks current WOS authority again after delayed credentials', async () => {
    let release!: (value: string) => void;
    const wait = new Promise<string>(resolve => { release = resolve; });
    const accessToken = vi.fn(() => wait); const fetchImpl = vi.fn(); let current = true;
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken, fetchImpl,
      assertCurrentAuth: () => { if (!current) throw new Error('retired'); } });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    await vi.waitFor(() => expect(accessToken).toHaveBeenCalledOnce()); current = false; release('wos-token');
    await expect(pending).rejects.toThrow('retired'); expect(fetchImpl).not.toHaveBeenCalled();
  });
});
