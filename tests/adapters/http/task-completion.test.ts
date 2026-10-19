import { RESPONSE_SCHEMA_DOCUMENT } from '../../../src/adapters/schema/canonical-schemas.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpTaskCompletion } from '../../../src/adapters/http/task-completion.ts';
import { sampleFormResponse } from '../../../src/adapter-conformance/fixtures.ts';
import { testScopeKey } from '../../fixtures/scope.ts';
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
  it('uses the selected finite completion budget instead of an unqualified increase', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
      const config = { baseUrl: 'https://wos.test', selection, accessToken: 'wos-token', fetchImpl,
        assertCurrentAuth: () => {}, completionTimeoutMs: 20 };
      const adapter = new HttpTaskCompletion(config);
      const pending = adapter.complete(submission, 'operation', lifetime());
      const assertion = expect(pending).rejects.toMatchObject({ name: 'TaskCompletionOutcomeUnknown' });
      await vi.advanceTimersByTimeAsync(20);
      await assertion;
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it.each([0, -1, Infinity, 1.5])('refuses invalid selected completion budget %s', completionTimeoutMs => {
    const config = { baseUrl: 'https://wos.test', selection, accessToken: 'wos-token',
      assertCurrentAuth: () => {}, completionTimeoutMs };
    expect(() => new HttpTaskCompletion(config)).toThrow('Task completion timeout');
  });
  it('retains a normal delayed server outcome within the selected browser wait', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(() => new Promise<Response>(resolve => setTimeout(() => resolve(jsonResponse(outcome)), 25_200)));
      const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token',
        fetchImpl, assertCurrentAuth: () => {}, completionTimeoutMs: 120_000 });
      const pending = adapter.complete(submission, 'operation', lifetime());
      await vi.advanceTimersByTimeAsync(25_200);
      expect(await pending).toEqual(outcome); expect(fetchImpl).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it('keeps the default wait at ten seconds and classifies only dispatched timeout as unknown', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
      const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token',
        fetchImpl, assertCurrentAuth: () => {} });
      const pending = adapter.complete(submission, 'operation', lifetime());
      const assertion = expect(pending).rejects.toMatchObject({ name: 'TaskCompletionOutcomeUnknown' });
      await vi.advanceTimersByTimeAsync(10_000); await assertion;
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it('preserves an actual conflict response and status', async () => {
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token',
      fetchImpl: async () => jsonResponse({ title: 'Conflict' }, 409), assertCurrentAuth: () => {}, completionTimeoutMs: 120_000 });
    await expect(adapter.complete(submission, 'operation', lifetime())).rejects.toMatchObject({ name: 'HttpAdapterError', status: 409 });
  });
  it('keeps credential timeout before dispatch distinct from an unknown submission', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn();
      const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection,
        accessToken: () => new Promise<string>(() => {}), fetchImpl, assertCurrentAuth: () => {}, completionTimeoutMs: 20 });
      const pending = adapter.complete(submission, 'operation', lifetime());
      const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(20); await assertion; expect(fetchImpl).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
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

it.each([['a bound', testScopeKey, { 'x-stack-scope-key': testScopeKey }], ['an unbound', undefined, {}]] as const)(
  'selects the WOS scope by key for %s task completion', async (_mode, scopeKey, expected) => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(outcome));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'wos-token', fetchImpl,
      scopeKey, assertCurrentAuth: () => {} });
    await adapter.complete(submission, 'native-scope-operation', lifetime());
    const actual = Object.fromEntries([...new Headers(fetchImpl.mock.calls[0][1]!.headers)].filter(([name]) => name.startsWith('x-')));
    expect(actual).toEqual(expected);
  });


describe('fixed task Submit diagnostics', () => {
  it.each(['preflight', 'status', 'timeout', 'outcome'] as const)('reports %s metadata and preserves the original failure', async kind => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const privateFailure = new DOMException('private URL credential signature response', 'TimeoutError');
    const fetchImpl = vi.fn(async () => {
      if (kind === 'timeout') throw privateFailure;
      return jsonResponse(kind === 'status' ? { title: 'private URL credential signature response' }
        : kind === 'outcome' ? { ...outcome, taskId: 'private-foreign-task' } : outcome, kind === 'status' ? 403 : 200);
    });
    try {
      const adapter = new HttpTaskCompletion({ baseUrl: 'https://private.test', selection, accessToken: 'private-token', fetchImpl, assertCurrentAuth: () => {} });
      const promise = adapter.complete(kind === 'preflight' ? { ...submission, definitionVersion: 'private-version' } : submission, 'private-operation', lifetime());
      if (kind === 'timeout') await expect(promise).rejects.toMatchObject({ name: 'TaskCompletionOutcomeUnknown' });
      else await expect(promise).rejects.toThrow(kind === 'preflight' ? 'candidate mismatch' : kind === 'outcome' ? 'outcome mismatch' : 'HTTP adapter request failed');
      expect(warn.mock.calls).toEqual([['Native form Submit diagnostic', JSON.stringify({
        stage: kind === 'preflight' ? 'task-preflight' : kind === 'outcome' ? 'task-outcome-validation' : 'task-transport',
        kind: kind === 'status' ? 'http-status' : kind === 'timeout' ? 'timeout' : 'failed', ...(kind === 'status' ? { status: 403 } : {}) })]]);
      expect(fetchImpl).toHaveBeenCalledTimes(kind === 'preflight' ? 0 : 1);
    } finally { warn.mockRestore(); }
  });
  it('keeps success silent and preserves original exceptions when observation throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('observer'); });
    const original = new Error('private failure');
    try {
      const fetchImpl = vi.fn(async () => jsonResponse(outcome));
      const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'private-token', fetchImpl, assertCurrentAuth: () => {} });
      expect(await adapter.complete(submission, 'operation', lifetime())).toEqual(outcome);
      expect(warn).not.toHaveBeenCalled();
      fetchImpl.mockRejectedValueOnce(original);
      await expect(adapter.complete(submission, 'operation', lifetime())).rejects.toBe(original);
      expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });
});

describe('original accepted task receipt', () => {
  const receipt = { acceptedCommandRef: 'command_original-1',
    receiptUrl: '/api/v1/accepted-commands/command_original-1?operation=task-submit' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps one POST and reads the original receipt with fresh current credentials until committed', async () => {
    const accessToken = vi.fn().mockResolvedValueOnce('first-token').mockResolvedValueOnce('second-token').mockResolvedValueOnce('third-token');
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(receipt, 202));
    fetchImpl.mockResolvedValueOnce(reply(receipt, 202)).mockResolvedValueOnce(reply(receipt, 202)).mockResolvedValueOnce(reply(outcome));
    const current = vi.fn();
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', scopeKey: testScopeKey, selection,
      accessToken, fetchImpl, assertCurrentAuth: current, completionTimeoutMs: 5000 });
    const pending = adapter.complete(submission, 'original-operation', lifetime());
    const settled = pending.then(value => ({ value }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(2000);
    const result = await settled;
    if ('error' in result) throw result.error;
    expect(result.value).toEqual(outcome);
    expect(fetchImpl).toHaveBeenCalledTimes(3); expect(accessToken).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `https://wos.test/api/v1/tasks/${encodeURIComponent(selection.taskId)}/response`,
      `https://wos.test${receipt.receiptUrl}`, `https://wos.test${receipt.receiptUrl}`,
    ]);
    expect(fetchImpl.mock.calls.map(([, init]) => init!.method)).toEqual(['POST', 'GET', 'GET']);
    expect(fetchImpl.mock.calls.map(([, init]) => new Headers(init!.headers).get('authorization')))
      .toEqual(['Bearer first-token', 'Bearer second-token', 'Bearer third-token']);
    for (const [, init] of fetchImpl.mock.calls) expect(new Headers(init!.headers).get('x-stack-scope-key')).toBe(testScopeKey);
    expect(new Headers(fetchImpl.mock.calls[0][1]!.headers).get('idempotency-key')).toBe('original-operation');
    for (const [, init] of fetchImpl.mock.calls.slice(1)) {
      expect(init!.body).toBeUndefined(); expect(new Headers(init!.headers).has('idempotency-key')).toBe(false);
    }
    expect(current).toHaveBeenCalled();
  });

  it.each([
    { ...receipt, receiptUrl: `https://foreign.test${receipt.receiptUrl}` },
    { ...receipt, receiptUrl: `https://wos.test${receipt.receiptUrl}` },
    { ...receipt, receiptUrl: receipt.receiptUrl + '&operation=task-submit' },
    { ...receipt, receiptUrl: receipt.receiptUrl.replace('task-submit', 'intake-create') },
    { ...receipt, acceptedCommandRef: '../foreign' },
    { ...receipt, acceptedCommandRef: 'a'.repeat(129) },
    { ...receipt, extra: true },
    { receiptUrl: receipt.receiptUrl },
  ])('refuses an unqualified pending URL/reference without following it: %j', body => {
    const accessToken = vi.fn(() => 'token'); const fetchImpl = vi.fn(async () => reply(body, 202));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken, fetchImpl, assertCurrentAuth: () => {} });
    return expect(adapter.complete(submission, 'same-operation', lifetime())).rejects.toThrow('Pending task receipt mismatch')
      .then(() => { expect(fetchImpl).toHaveBeenCalledOnce(); expect(accessToken).toHaveBeenCalledOnce(); });
  });

  it('refuses a changed receipt reference during pending reads', async () => {
    const next = { acceptedCommandRef: 'other', receiptUrl: '/api/v1/accepted-commands/other?operation=task-submit' };
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(receipt, 202)).mockResolvedValueOnce(reply(next, 202));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'token', fetchImpl, assertCurrentAuth: () => {} });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const refused = expect(pending).rejects.toThrow('Pending task receipt mismatch');
    await vi.advanceTimersByTimeAsync(1000); await refused;
    expect(fetchImpl.mock.calls.map(([, init]) => init.method)).toEqual(['POST', 'GET']);
  });

  it.each([403, 404, 409])('preserves a permanent receipt refusal %s without resubmitting', async status => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(receipt, 202)).mockResolvedValueOnce(reply({ title: 'Refused' }, status));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'token', fetchImpl, assertCurrentAuth: () => {} });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const refused = expect(pending).rejects.toMatchObject({ name: 'HttpAdapterError', status });
    await vi.advanceTimersByTimeAsync(1000); await refused; expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([{ ...outcome, taskId: selection.taskId + '.foreign' },
    { ...outcome, processId: 'urn:wos:other_process_01hw7rm71vfay8vvw14d2pf2db' },
    { ...outcome, outcome: 'drafted' }, { ...outcome, newStatus: 'pending' }])('validates the actual committed receipt against the original task: %j', async body => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(receipt, 202)).mockResolvedValueOnce(reply(body));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'token', fetchImpl, assertCurrentAuth: () => {} });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const refused = expect(pending).rejects.toThrow('Task completion outcome mismatch');
    await vi.advanceTimersByTimeAsync(1000); await refused; expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not reset the whole completion deadline after the accepted POST', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(resolve => setTimeout(() => resolve(reply(receipt, 202)), 750)));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'token', fetchImpl,
      assertCurrentAuth: () => {}, completionTimeoutMs: 1500 });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const unknown = expect(pending).rejects.toMatchObject({ name: 'TaskCompletionOutcomeUnknown' });
    await vi.advanceTimersByTimeAsync(1500); await unknown; expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rechecks current authority before another credential or receipt fetch', async () => {
    let current = true;
    const accessToken = vi.fn(() => 'token'); const fetchImpl = vi.fn(async () => reply(receipt, 202));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken, fetchImpl,
      assertCurrentAuth: () => { if (!current) throw new Error('retired'); } });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const refused = expect(pending).rejects.toThrow('retired');
    await vi.advanceTimersByTimeAsync(0); current = false;
    await vi.advanceTimersByTimeAsync(1000); await refused;
    expect(fetchImpl).toHaveBeenCalledOnce(); expect(accessToken).toHaveBeenCalledOnce();
  });

  it('keeps receipt body streaming inside the original deadline', async () => {
    const body = new ReadableStream<Uint8Array>({ pull() {} }, { highWaterMark: 0 });
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(receipt, 202)).mockResolvedValueOnce(new Response(body,
      { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'token', fetchImpl,
      assertCurrentAuth: () => {}, completionTimeoutMs: 1500 });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const unknown = expect(pending).rejects.toMatchObject({ name: 'TaskCompletionOutcomeUnknown' });
    await vi.advanceTimersByTimeAsync(1500); await unknown; expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rechecks authority after delayed credentials for the receipt GET', async () => {
    let release!: (token: string) => void; let current = true;
    const delayed = new Promise<string>(resolve => { release = resolve; });
    const accessToken = vi.fn().mockResolvedValueOnce('first-token').mockReturnValueOnce(delayed);
    const fetchImpl = vi.fn(async () => reply(receipt, 202));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken, fetchImpl,
      assertCurrentAuth: () => { if (!current) throw new Error('receipt session retired'); } });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const refused = expect(pending).rejects.toThrow('receipt session retired');
    await vi.advanceTimersByTimeAsync(1000); expect(accessToken).toHaveBeenCalledTimes(2);
    current = false; release('late-token'); await refused;
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('cancels pending receipt observation when its caller lifetime ends', async () => {
    const abort = new AbortController();
    const fetchImpl = vi.fn(async () => reply(receipt, 202));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'token', fetchImpl, assertCurrentAuth: () => {} });
    const pending = adapter.complete(submission, 'same-operation', { signal: abort.signal, assertCurrent() {} });
    const refused = expect(pending).rejects.toThrow('visit retired');
    await vi.advanceTimersByTimeAsync(0); abort.abort(new Error('visit retired')); await refused;
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('refuses a cacheable final protected receipt', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(receipt, 202)).mockResolvedValueOnce(jsonResponse(outcome));
    const adapter = new HttpTaskCompletion({ baseUrl: 'https://wos.test', selection, accessToken: 'token', fetchImpl, assertCurrentAuth: () => {} });
    const pending = adapter.complete(submission, 'same-operation', lifetime());
    const refused = expect(pending).rejects.toThrow('must prohibit storage');
    await vi.advanceTimersByTimeAsync(1000); await refused; expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
