import { describe, expect, it, vi } from 'vitest';
import { HttpTaskCandidateHydration } from '../../../src/adapters/http/task-candidate-hydration.ts';
import { hydrationFixture } from './screener-hydration-fixture.ts';

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
    expect(verify).toHaveBeenCalledOnce();
    elapsed = 50;
    expect(() => facts.assertReady()).toThrow('original proof expired');
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
    expect(() => facts.assertCurrent()).toThrow('elapsed clock mismatch');
    elapsed = 11;
    expect(() => facts.assertCurrent()).toThrow('elapsed clock mismatch');
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
