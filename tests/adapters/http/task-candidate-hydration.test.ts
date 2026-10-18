import { computeJcsSha256Digest } from '../../../src/adapters/http/response-action-ledger.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpTaskCandidateHydration } from '../../../src/adapters/http/task-candidate-hydration.ts';
import { hydrationFixture } from './screener-hydration-fixture.ts';
import { otherScopeKey } from '../../fixtures/scope.ts';

afterEach(() => vi.useRealTimers());

async function fixture() {
  const original = await hydrationFixture();
  const taskDraft = { version: 1 as const, associationHash: `sha256:${'b'.repeat(64)}`, taskBindingHash: `sha256:${'c'.repeat(64)}` };
  const originalSaved = structuredClone(original.input.saved);
  const saved = { ...originalSaved, evidence: { ...originalSaved.evidence, taskDraft } };
  const pending = { ...structuredClone(original.view), providerReceipt: null,
    results: [{ status: 'pending' as const, instanceName: 'facts', sourceRef: 'screening', reason: 'task-origin-unavailable' }] };
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(pending,
    { headers: { 'cache-control': 'no-store' } }));
  const lifetime = { signal: new AbortController().signal, assertCurrent: vi.fn() };
  const config = { ...original.config, fetchImpl, selection: original.config.selection.evaluationSelection,
    formVersionHash: original.config.selection.formVersionHash, taskDraft, subjectRef: saved.actor.id,
    identity: original.input.identity, assertCurrent: vi.fn(), elapsedNow: () => 0 };
  return { original, saved, pending, fetchImpl, lifetime, config };
}

describe('task candidate hydration through the maintained Source route', () => {
  it.each(['depth', 'nodes'] as const)('preserves the legacy %s snapshot budget before proof verification', async mode => {
    const f = await fixture();
    const data = mode === 'depth' ? Array.from({ length: 130 }).reduce<unknown>(value => [value], null) : Array(100_001).fill(null);
    const view = { ...f.original.view, results: [{ ...f.original.view.results[0], data, dataHash: await computeJcsSha256Digest(data) }] };
    f.fetchImpl.mockImplementation(async () => Response.json(view, { headers: { 'cache-control': 'no-store' } }));
    await expect(new HttpTaskCandidateHydration(f.config, f.lifetime).qualifySaved(f.saved, f.lifetime)).rejects.toThrow('Response data exceeds the safe snapshot limit');
    expect(f.fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses the actual saved candidate and preserves Pending without a browser Screener act', async () => {
    const f = await fixture();
    const adapter = new HttpTaskCandidateHydration(f.config, f.lifetime);
    const facts = await adapter.qualifySaved(f.saved, f.lifetime);
    expect(f.fetchImpl).toHaveBeenCalledOnce();
    expect(f.fetchImpl.mock.calls[0][0]).toBe(`https://source.example/drafts/${encodeURIComponent(f.saved.draft.id)}/evaluation-instances`);
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1]!.body as string)).toEqual({
      draftVersion: f.saved.draft.version, candidateHash: f.original.view.candidateHash,
    });
    expect(new Headers(f.fetchImpl.mock.calls[0][1]!.headers).get('authorization')).toBe('Bearer owner-token');
    expect(facts.view.results[0].status).toBe('pending');
    expect(() => facts.assertReady()).toThrow('pending or unavailable');
  });
  it.each([['a foreign', otherScopeKey], ['no', undefined]] as const)('refuses %s scope key before obtaining credentials or dispatching', async (_mode, scopeKey) => {
    const f = await fixture();
    expect(() => new HttpTaskCandidateHydration({ ...f.config, scopeKey }, f.lifetime)).toThrow('selection mismatch');
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.original.accessToken).not.toHaveBeenCalled();
  });

  it('refuses a different task association before obtaining credentials or dispatching', async () => {
    const f = await fixture();
    const saved = { ...f.saved, evidence: { ...f.saved.evidence, taskDraft: { ...f.config.taskDraft, associationHash: `sha256:${'d'.repeat(64)}` } } };
    await expect(new HttpTaskCandidateHydration(f.config, f.lifetime).qualifySaved(saved, f.lifetime)).rejects.toThrow('saved candidate binding');
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.original.accessToken).not.toHaveBeenCalled();
  });
  it('refuses a valid-looking result without the selected original task proof verifier', async () => {
    const f = await fixture();
    f.fetchImpl.mockImplementation(async () => Response.json(f.original.view, { headers: { 'cache-control': 'no-store' } }));
    await expect(new HttpTaskCandidateHydration(f.config, f.lifetime).qualifySaved(f.saved, f.lifetime)).rejects.toThrow('task-origin proof verifier unavailable');
  });
  it('refuses a mismatched full publication from Source', async () => {
    const f = await fixture();
    f.fetchImpl.mockImplementation(async () => Response.json({ ...f.pending, formVersionHash: `sha256:${'d'.repeat(64)}` },
      { headers: { 'cache-control': 'no-store' } }));
    await expect(new HttpTaskCandidateHydration(f.config, f.lifetime).qualifySaved(f.saved, f.lifetime)).rejects.toThrow('returned candidate binding');
  });
  it('retires previously returned candidate facts on edit or disposal', async () => {
    const f = await fixture();
    const adapter = new HttpTaskCandidateHydration(f.config, f.lifetime);
    const facts = await adapter.qualifySaved(f.saved, f.lifetime);
    adapter.retireFacts();
    expect(() => facts.assertCurrent()).toThrow('candidate retired');
    adapter.dispose();
    await expect(adapter.qualifySaved(f.saved, f.lifetime)).rejects.toThrow('disposed');
  });
  it('anchors selected proof validity to dispatch and retires it at the original deadline', async () => {
    const f = await fixture();
    let elapsed = 0;
    f.fetchImpl.mockImplementation(async () => { elapsed = 40; return Response.json(f.original.view,
      { headers: { 'cache-control': 'no-store' } }); });
    const verify = vi.fn(async () => ({ validForMilliseconds: 50 }));
    const adapter = new HttpTaskCandidateHydration({ ...f.config, elapsedNow: () => elapsed,
      receiptVerifier: { verify } }, f.lifetime);
    const facts = await adapter.qualifySaved(f.saved, f.lifetime);
    facts.assertReady();
    expect(facts.refreshRequired!()).toBe(false); expect(facts.remainingMilliseconds!()).toBe(10);
    expect(verify).toHaveBeenCalledOnce();
    elapsed = 50;
    expect(facts.remainingMilliseconds!()).toBe(0); expect(facts.refreshRequired!()).toBe(true);
    expect(() => facts.assertReady()).toThrow('original proof expired');
    expect(facts.refreshRequired!()).toBe(true); expect(f.fetchImpl).toHaveBeenCalledOnce();
    f.lifetime.assertCurrent.mockImplementation(() => { throw new Error('task owner retired'); });
    expect(() => facts.refreshRequired!()).toThrow('task owner retired');
    f.lifetime.assertCurrent.mockImplementation(() => {});
    expect(() => facts.refreshRequired!()).toThrow('task owner retired');
  });
  it('keeps returned facts immutable and observes caller cancellation after qualification', async () => {
    const f = await fixture();
    const abort = new AbortController();
    const facts = await new HttpTaskCandidateHydration(f.config, f.lifetime).qualifySaved(f.saved,
      { signal: abort.signal, assertCurrent: vi.fn() });
    expect(Object.isFrozen(facts.view)).toBe(true);
    expect(Object.isFrozen(facts.view.results)).toBe(true);
    abort.abort(new Error('task owner retired'));
    expect(() => facts.assertCurrent()).toThrow('task owner retired');
  });

  it('permanently retires facts after an invalid clock even when the clock recovers', async () => {
    const f = await fixture();
    let elapsed = 10;
    const facts = await new HttpTaskCandidateHydration({ ...f.config, elapsedNow: () => elapsed }, f.lifetime)
      .qualifySaved(f.saved, f.lifetime);
    elapsed = NaN;
    expect(() => facts.refreshRequired!()).toThrow('elapsed clock mismatch');
    elapsed = 11;
    expect(() => facts.assertCurrent()).toThrow('elapsed clock mismatch');
    expect(() => facts.refreshRequired!()).toThrow('elapsed clock mismatch');
  });

  it('stops waiting for a non-cooperative verifier when the task owner retires', async () => {
    const f = await fixture();
    f.fetchImpl.mockImplementation(async () => Response.json(f.original.view, { headers: { 'cache-control': 'no-store' } }));
    const abort = new AbortController();
    let started!: () => void;
    let release!: (value: { validForMilliseconds: number }) => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const verifier = { verify: vi.fn(() => { started(); return new Promise<{ validForMilliseconds: number }>(resolve => { release = resolve; }); }) };
    const pending = new HttpTaskCandidateHydration({ ...f.config, receiptVerifier: verifier }, f.lifetime)
      .qualifySaved(f.saved, { signal: abort.signal, assertCurrent: vi.fn() });
    await entered;
    abort.abort(new Error('task owner retired'));
    await expect(pending).rejects.toThrow('task owner retired');
    release({ validForMilliseconds: 50 });
    await Promise.resolve();
  });

});

describe('task hydration within the existing native operation budget', () => {
  it('accepts a verified response after ten seconds without renewing original proof validity', async () => {
    const f = await fixture(); vi.useFakeTimers();
    let elapsed = 0; let dispatched!: () => void;
    const entered = new Promise<void>(resolve => { dispatched = resolve; });
    f.fetchImpl.mockImplementation(async () => {
      dispatched();
      return new Promise<Response>(resolve => { setTimeout(() => {
        elapsed = 15_000; resolve(Response.json(f.original.view, { headers: { 'cache-control': 'no-store' } }));
      }, 15_000); });
    });
    const verify = vi.fn(async () => ({ validForMilliseconds: 20_000 }));
    const adapter = new HttpTaskCandidateHydration({ ...f.config, elapsedNow: () => elapsed, receiptVerifier: { verify } }, f.lifetime);
    const outcome = adapter.qualifySaved(f.saved, f.lifetime).then(facts => ({ facts }), error => ({ error }));
    await entered; await vi.advanceTimersByTimeAsync(15_000);
    const result = await outcome;
    if (!('facts' in result)) throw result.error;
    result.facts.assertReady(); expect(verify).toHaveBeenCalledOnce(); expect(f.fetchImpl).toHaveBeenCalledOnce();
    expect(result.facts.remainingMilliseconds!()).toBe(5_000);
    elapsed = 20_000; expect(() => result.facts.assertReady()).toThrow('original proof expired');
    adapter.dispose();
  });
  it.each(['host-deadline', 'session-retirement', 'unmount'] as const)('honors %s before a delayed response', async retirement => {
    const f = await fixture(); vi.useFakeTimers();
    const owner = new AbortController(), stage = new AbortController();
    let dispatched!: () => void;
    const entered = new Promise<void>(resolve => { dispatched = resolve; });
    f.fetchImpl.mockImplementation(async () => {
      dispatched(); return new Promise<Response>(resolve => { setTimeout(() => resolve(Response.json(f.original.view,
        { headers: { 'cache-control': 'no-store' } })), 15_000); });
    });
    const verify = vi.fn(async () => ({ validForMilliseconds: 20_000 }));
    const adapter = new HttpTaskCandidateHydration({ ...f.config, receiptVerifier: { verify } },
      { signal: owner.signal, assertCurrent: vi.fn() });
    const outcome = adapter.qualifySaved(f.saved, { signal: stage.signal, assertCurrent: vi.fn() })
      .then(() => ({ accepted: true, error: undefined }), error => ({ accepted: false, error }));
    await entered;
    // The enclosing host has only five seconds remaining; the request cannot renew it.
    const reason = new Error(retirement === 'host-deadline' ? 'native-facts-deadline' : 'task owner retired');
    setTimeout(() => {
      if (retirement === 'host-deadline') stage.abort(reason);
      else if (retirement === 'session-retirement') owner.abort(reason);
      else adapter.dispose();
    }, 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await outcome; expect(result.accepted).toBe(false);
    if (retirement !== 'unmount') expect(result.error).toBe(reason);
    expect(f.fetchImpl.mock.calls[0][1]!.signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(verify).not.toHaveBeenCalled(); expect(f.fetchImpl).toHaveBeenCalledOnce(); adapter.dispose();
  });
});

describe('whole task qualification budget without an enclosing host timer', () => {
  it('stops cumulative hydration and a non-cooperative verifier at thirty seconds', async () => {
    const f = await fixture(); vi.useFakeTimers();
    let dispatched!: () => void;
    const entered = new Promise<void>(resolve => { dispatched = resolve; });
    f.fetchImpl.mockImplementation(async () => {
      dispatched(); return new Promise<Response>(resolve => { setTimeout(() => resolve(Response.json(f.original.view,
        { headers: { 'cache-control': 'no-store' } })), 15_000); });
    });
    let verificationStarted!: () => void;
    const verificationEntered = new Promise<void>(resolve => { verificationStarted = resolve; });
    const verify = vi.fn(async () => new Promise<{ validForMilliseconds: number }>(resolve => {
      verificationStarted(); setTimeout(() => resolve({ validForMilliseconds: 60_000 }), 16_000);
    }));
    const adapter = new HttpTaskCandidateHydration({ ...f.config, receiptVerifier: { verify } }, f.lifetime);
    let status = 'pending'; let refusal: unknown;
    const outcome = adapter.qualifySaved(f.saved, f.lifetime).then(() => { status = 'accepted'; }, error => { status = 'failed'; refusal = error; });
    try {
      await entered; await vi.advanceTimersByTimeAsync(15_000); await verificationEntered;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(verify).toHaveBeenCalledOnce(); expect(status).toBe('failed');
      expect(refusal).toEqual(new Error('native-facts-deadline'));
      expect(f.fetchImpl).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1_000); expect(status).toBe('failed');
    } finally { await vi.advanceTimersByTimeAsync(1_000); await outcome; adapter.dispose(); }
  });
  it('clears the operation timer without aborting successfully returned candidate facts', async () => {
    const f = await fixture(); vi.useFakeTimers(); let elapsed = 0;
    f.fetchImpl.mockImplementation(async () => Response.json(f.original.view, { headers: { 'cache-control': 'no-store' } }));
    const adapter = new HttpTaskCandidateHydration({ ...f.config, elapsedNow: () => elapsed,
      receiptVerifier: { verify: async () => ({ validForMilliseconds: 60_000 }) } }, f.lifetime);
    try {
      const facts = await adapter.qualifySaved(f.saved, f.lifetime); facts.assertReady();
      await vi.advanceTimersByTimeAsync(30_000); elapsed = 30_000;
      facts.assertReady(); expect(facts.remainingMilliseconds!()).toBe(30_000);
      elapsed = 60_000; expect(() => facts.assertReady()).toThrow('original proof expired');
    } finally { adapter.dispose(); }
  });
});
