import { describe, expect, it, vi } from 'vitest';
import type { SurfaceScreenerCompletionRequest } from '@formspec-org/surface-react';
import type { ScreenerHydration } from '../../src/ports/screener-hydration.ts';
import type { ScreenerRetention, ScreenerRunView } from '../../src/ports/screener-retention.ts';
import { HttpScreenerRetention } from '../../src/adapters/http/screener-retention.ts';
import { computeJcsSha256Digest as hash } from '../../src/adapters/http/response-action-ledger.ts';
import { recordingFetch } from '../adapters/http/test-fetch.ts';
import { HttpScreenerHydration } from '../../src/adapters/http/screener-hydration.ts';
import { hydrationFixture } from '../adapters/http/screener-hydration-fixture.ts';
import { createNativeScreenerCoordinator } from '../../src/shared/native-screener-coordinator.ts';

async function fixture(extraSource = false, routingOnly = false) {
  const f = await hydrationFixture({ extraSource });
  const retained = vi.fn<ScreenerRetention['retain']>(async () => f.input.run);
  const associated = vi.fn<ScreenerRetention['associate']>(async () => f.input.association);
  const context = () => ({ identity: f.input.identity, signal: f.input.signal, assertCurrent: f.input.assertCurrent });
  let routeElapsed = 0;
  const hydrated = vi.fn<ScreenerHydration['hydrate']>(async input => ({ view: f.view, ...(input.nativeCurrentCheck ? { nativeCurrentCheck: input.nativeCurrentCheck } : {}), assertCurrent: f.input.assertCurrent, assertReady: f.input.assertCurrent }));
  const coordinator = createNativeScreenerCoordinator({ elapsedNow: () => routeElapsed, routeContext: context, selectionKey: 'selected', retention: { retain: retained, associate: associated },
    hydration: routingOnly ? { hydrate: hydrated } : new HttpScreenerHydration(f.config), context });
  const surface = new AbortController();
  const request: SurfaceScreenerCompletionRequest = { completionId: 'same-original-act', selectionKey: 'selected',
    document: { $formspecScreener: '1.0', url: 'urn:test:screener', version: '1', title: 'Screen', items: [], evaluation: [] },
    screenerRef: { url: 'urn:test:screener', version: '1' }, answers: { flag: false }, target: 'urn:test:target',
    determination: { $formspecDetermination: '1.0', screener: { url: 'urn:test:screener', version: '1' }, timestamp: 'untrusted',
      evaluationVersion: '1', status: 'completed', overrides: { matched: [], halted: false }, phases: [], inputs: {} },
    evaluationTime: 'untrusted', allowedTargets: ['urn:test:target'], route: { surfaceId: 'surface', routeId: 'route', routeClass: undefined, params: {} },
    slotId: 'screener', visitId: 'visit', runtimeGeneration: 'render', signal: surface.signal };
  return { ...f, coordinator, retained, associated, hydrated, surface, request, setRouteElapsed: (value: number) => { routeElapsed = value; } };
}

describe('same-session native Screener coordination', () => {
  it('passes only the issued association for an unsigned saved candidate', async () => {
    const f = await fixture(false, true);
    await f.coordinator.completionPolicy.complete(f.request);
    await f.coordinator.qualifySaved(f.input.saved);
    expect(f.associated).toHaveBeenCalledTimes(1);
    const candidate = f.hydrated.mock.calls[0][0];
    expect(candidate.association).toBe(f.input.association);
    expect(Object.hasOwn(candidate, 'nativeCurrentCheck')).toBe(false);
    f.coordinator.dispose();
  });

  it('denies fresh and foreign destinations, retaining only the exact accepted selected document target', async () => {
    const f = await fixture();
    const document = { url: f.input.run.selection.screenerUrl, version: f.input.run.selection.screenerVersion };
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(false);
    await f.coordinator.completionPolicy.complete(f.request);
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(true);
    expect(f.coordinator.routeAllowed('surface:foreign', document)).toBe(false);
    expect(f.coordinator.routeAllowed(f.request.target, { ...document, version: 'foreign' })).toBe(false);
    f.surface.abort();
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(true);
    f.coordinator.dispose();
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(false);
  });

  it('counts transport time against original acceptance validity and refuses expired navigation', async () => {
    const f = await fixture();
    Object.assign(f.input.run.run.determination, { validity: { validUntil: new Date(Date.parse(f.input.run.acceptance!.checkedAt) + 1000).toISOString() } });
    f.retained.mockImplementationOnce(async () => { f.setRouteElapsed(600); return f.input.run; });
    await expect(f.coordinator.completionPolicy.complete(f.request)).resolves.toEqual({ status: 'accepted' });
    const document = { url: f.input.run.selection.screenerUrl, version: f.input.run.selection.screenerVersion };
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(true);
    f.setRouteElapsed(1000);
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(false);
    f.coordinator.dispose();
  });

  it('refuses submillisecond validity instead of rounding its remaining duration upward', async () => {
    const f = await fixture();
    Object.assign(f.input.run, { acceptance: { checkedAt: '2026-10-09T10:00:00.0009Z', qualification: { status: 'ready', target: f.request.target } } });
    Object.assign(f.input.run.run.determination, { validity: { validUntil: '2026-10-09T10:00:00.0011Z' } });
    await expect(f.coordinator.completionPolicy.complete(f.request)).resolves.toMatchObject({ status: 'refused' });
    f.coordinator.dispose();
  });

  it.each([Number.NaN, -1])('permanently refuses invalid or rewound elapsed clock %s', async value => {
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    const document = { url: f.input.run.selection.screenerUrl, version: f.input.run.selection.screenerVersion };
    f.setRouteElapsed(100);
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(true);
    f.setRouteElapsed(value);
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(false);
    f.setRouteElapsed(101);
    expect(f.coordinator.routeAllowed(f.request.target, document)).toBe(false);
    f.coordinator.dispose();
  });

  it('refuses a retention result that arrives after its original route validity', async () => {
    const f = await fixture();
    Object.assign(f.input.run.run.determination, { validity: { validUntil: new Date(Date.parse(f.input.run.acceptance!.checkedAt) + 1000).toISOString() } });
    f.retained.mockImplementationOnce(async () => { f.setRouteElapsed(1001); return f.input.run; });
    await expect(f.coordinator.completionPolicy.complete(f.request)).resolves.toMatchObject({ status: 'refused' });
    f.coordinator.dispose();
  });

  it('uses the exact fresh retained run for signed current checks without replacing the historical association', async () => {
    const f = await fixture(false, true); await f.coordinator.completionPolicy.complete(f.request);
    // This exercises routing only; Source owns cryptographic admission of real signed responses.
    const signed = { ...f.input.saved, response: { ...f.input.saved.response, authoredSignatures: [{}] } } as unknown as typeof f.input.saved;
    const facts = await f.coordinator.qualifySaved(signed);
    expect(f.associated).not.toHaveBeenCalled();
    expect(f.hydrated.mock.calls[0][0]).toMatchObject({ saved: signed, run: f.input.run,
      nativeCurrentCheck: { selectionHash: f.input.run.run.selectionHash, runId: f.input.run.run.runId, runRevision: f.input.run.run.revision } });
    expect(f.hydrated.mock.calls[0][0]).not.toHaveProperty('association');
    expect(Object.hasOwn(f.hydrated.mock.calls[0][0], 'association')).toBe(false);
    expect(facts.nativeCurrentCheck).toEqual({ selectionHash: f.input.run.run.selectionHash, runId: f.input.run.run.runId, runRevision: f.input.run.run.revision });
    f.coordinator.dispose();
  });

  it('retains the original attempt and false answers, then associates and hydrates the exact saved candidate with issued run identity', async () => {
    const f = await fixture();
    await expect(f.coordinator.completionPolicy.complete(f.request)).resolves.toEqual({ status: 'accepted' });
    const retain = f.retained.mock.calls[0][0];
    expect(retain.completionId).toBe('same-original-act');
    expect(retain.answers).toEqual({ flag: false });
    expect(retain).not.toHaveProperty('evaluationTime');
    expect(retain).not.toHaveProperty('determination');
    const context = await f.coordinator.qualifySaved(f.input.saved);
    expect(f.associated.mock.calls[0][0].run).toBe(f.input.run);
    expect(f.associated.mock.calls[0][0].saved).toEqual(f.input.saved);
    expect(context.view.results[0]).toMatchObject({ status: 'qualified', data: { eligible: false } });
    context.assertReady();
    f.coordinator.dispose();
  });

  it('preserves issued provenance through maintained retention, association and hydration HTTP adapters', async () => {
    const f = await fixture();
    f.coordinator.dispose();
    Object.assign(f.config.selection, { screenerHash: await hash(f.request.document) });
    const selectionHash = await hash(f.config.selection);
    Object.assign(f.config, { selectionHash });
    const run = f.input.run.run;
    Object.assign(run.determination, { $formspecDetermination: '1.0', screener: f.request.screenerRef, status: 'completed',
      evaluationVersion: '1', overrides: { matched: [], halted: false }, phases: [], inputs: run.answers });
    Object.assign(run, { selectionHash, determinationHash: await hash(run.determination) });
    const { evidenceHash: _old, ...evidence } = run;
    Object.assign(run, { evidenceHash: await hash(evidence) });
    Object.assign(f.input.association, { selectionHash, evidenceHash: run.evidenceHash });
    Object.assign(f.receipt.proof, { evidenceHash: run.evidenceHash });
    Object.assign(f.receipt.registration.publicDescriptor, { screenerSelectionHash: selectionHash });
    Object.assign(f.receipt.registration, { registrationHash: await hash(f.receipt.registration.publicDescriptor) });
    const { receiptHash: _previous, ...preimage } = f.receipt;
    Object.assign(f.receipt, { receiptHash: await hash(preimage) });
    const { fetch, requests } = recordingFetch(async request => {
      const value = request.url.endsWith('/screener-runs') ? f.input.run
        : request.url.endsWith('/screener-associations') ? f.input.association : f.view;
      return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    });
    const config = { ...f.config, fetchImpl: fetch };
    const retention = new HttpScreenerRetention(config);
    const coordinator = createNativeScreenerCoordinator({ selectionKey: 'selected', retention, hydration: new HttpScreenerHydration(config),
      context: () => ({ identity: f.input.identity, signal: f.input.signal, assertCurrent: f.input.assertCurrent }) });
    await expect(coordinator.completionPolicy.complete(f.request)).resolves.toEqual({ status: 'accepted' });
    f.surface.abort();
    const qualified = await coordinator.qualifySaved(f.input.saved);
    qualified.assertReady();
    expect(requests.map(request => new URL(request.url).pathname)).toEqual([
      '/forms/form%2Fid/screener-runs', '/drafts/draft%2Fid/screener-associations', '/drafts/draft%2Fid/evaluation-instances']);
    expect(requests[0].headers.get('idempotency-key')).toBe('same-original-act');
    expect(requests[1].body).toMatchObject({ candidateHash: await hash(f.input.saved.response), draftVersion: 3 });
    coordinator.dispose();
  });

  it('snapshots the saved candidate before association waits despite later caller mutation', async () => {
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    let resolve!: () => void;
    f.associated.mockImplementationOnce(() => new Promise(yes => { resolve = () => yes(f.input.association); }));
    const pending = f.coordinator.qualifySaved(f.input.saved);
    Object.assign(f.input.saved.draft, { version: 99 });
    f.input.saved.response.data.flag = true;
    resolve();
    const qualified = await pending;
    qualified.assertReady();
    expect(f.associated.mock.calls[0][0].saved.draft.version).toBe(3);
    expect(qualified.view.draftVersion).toBe(3);
    expect(qualified.view.results[0]).toMatchObject({ data: { eligible: false } });
    f.coordinator.dispose();
  });

  it('retains issued run across normal Surface navigation and captures a fresh candidate context', async () => {
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    f.surface.abort(new Error('route unmounted after acceptance'));
    const context = await f.coordinator.qualifySaved(f.input.saved);
    context.assertReady();
    expect(f.associated.mock.calls[0][0].run).toBe(f.input.run);
    f.coordinator.dispose();
  });

  it('preserves same-act retry after ambiguous transport without inventing acceptance', async () => {
    const f = await fixture();
    f.retained.mockRejectedValueOnce(new Error('ambiguous retention'));
    await expect(f.coordinator.completionPolicy.complete(f.request)).rejects.toThrow('ambiguous');
    await expect(f.coordinator.qualifySaved(f.input.saved)).rejects.toThrow();
    await expect(f.coordinator.completionPolicy.complete(f.request)).resolves.toEqual({ status: 'accepted' });
    expect(f.retained.mock.calls.map(([input]) => input.completionId)).toEqual(['same-original-act', 'same-original-act']);
    f.coordinator.dispose();
  });

  it.each(['pending', 'wrong-target', 'original-pending', 'original-target'] as const)('refuses explicit %s acceptance with a new act and clears older run authority', async mode => {
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    const run: ScreenerRunView = structuredClone(f.input.run);
    if (mode.startsWith('original')) Object.assign(run.run, { qualification: mode === 'original-pending'
      ? { status: 'pending', reason: 'expired' } : { status: 'ready', target: 'urn:other' } });
    else Object.assign(run, { acceptance: { checkedAt: run.acceptance!.checkedAt, qualification: mode === 'pending'
      ? { status: 'pending', reason: 'expired' } : { status: 'ready', target: 'urn:other' } } });
    f.retained.mockResolvedValueOnce(run);
    await expect(f.coordinator.completionPolicy.complete(f.request)).resolves.toMatchObject({ status: 'refused', retry: 'new-act' });
    await expect(f.coordinator.qualifySaved(f.input.saved)).rejects.toThrow();
    expect(f.associated).not.toHaveBeenCalled();
    f.coordinator.dispose();
  });

  it('rejects selection and non-flat answers before Source I/O', async () => {
    const f = await fixture();
    for (const request of [{ ...f.request, selectionKey: 'other' }, { ...f.request, answers: { flag: null } },
      { ...f.request, answers: { flag: [false] } }, { ...f.request, answers: { flag: Infinity } }]) {
      await expect(f.coordinator.completionPolicy.complete(request)).rejects.toThrow();
    }
    expect(f.retained).not.toHaveBeenCalled(); f.coordinator.dispose();
  });

  it('retires prior facts when qualification starts again, and exposes unavailable facts without readiness', async () => {
    const f = await fixture(true);
    await f.coordinator.completionPolicy.complete(f.request);
    const first = await f.coordinator.qualifySaved(f.input.saved);
    expect(() => first.assertReady()).toThrow('unavailable');
    const second = await f.coordinator.qualifySaved(f.input.saved);
    expect(() => first.assertCurrent()).toThrow();
    second.assertCurrent();
    f.coordinator.retireFacts();
    expect(() => second.assertCurrent()).toThrow();
    // Edits retire facts, while later association still rechecks the original issued run.
    const third = await f.coordinator.qualifySaved(f.input.saved); third.assertCurrent();
    f.coordinator.dispose();
  });

  it('preserves a committed saved result when later association refuses', async () => {
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    const committed = structuredClone(f.input.saved);
    f.associated.mockRejectedValueOnce(new Error('association refused'));
    await expect(f.coordinator.qualifySaved(f.input.saved)).rejects.toThrow('association refused');
    expect(f.input.saved).toEqual(committed);
    expect(f.requests).toHaveLength(0);
    f.coordinator.dispose();
  });

  it('does not install late completion after disposal, even if the port ignores cancellation', async () => {
    const f = await fixture();
    let resolve!: (run: ScreenerRunView) => void;
    f.retained.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    const pending = f.coordinator.completionPolicy.complete(f.request);
    f.coordinator.dispose(); resolve(f.input.run);
    await expect(pending).rejects.toThrow();
    await expect(f.coordinator.qualifySaved(f.input.saved)).rejects.toThrow();
  });

  it('rejects late older completion after a newer completion takes ownership', async () => {
    const f = await fixture();
    let resolve!: (run: ScreenerRunView) => void;
    f.retained.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    const older = f.coordinator.completionPolicy.complete(f.request);
    await expect(f.coordinator.completionPolicy.complete({ ...f.request, completionId: 'newer-act' })).resolves.toEqual({ status: 'accepted' });
    resolve(f.input.run); await expect(older).rejects.toThrow();
    const context = await f.coordinator.qualifySaved(f.input.saved); context.assertReady();
    f.coordinator.dispose();
  });

  it('qualifies the actual commitment-bearing Sign revision separately from the prior saved revision', async () => {
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    const previous = await f.coordinator.qualifySaved(f.input.saved);
    Object.assign(f.input.saved.draft, { version: 4 });
    Object.assign(f.input.saved.evidence, { draft_version: 4 });
    Object.assign(f.input.saved.response, { extensions: { 'x-formspec-signing-content': { commitment: 'actual-sign-revision' } } });
    const candidateHash = await hash(f.input.saved.response);
    Object.assign(f.input.association, { draftVersion: 4, candidateHash });
    Object.assign(f.view, { draftVersion: 4, candidateHash });
    const requestHash = await hash({ operation: f.view.operation, scope: f.view.scope, owner: f.view.owner,
      selection: f.view.selection, formVersionHash: f.view.formVersionHash, draftId: f.view.draftId,
      draftVersion: 4, candidateHash, sources: f.view.sources });
    Object.assign(f.view, { requestHash }); Object.assign(f.receipt, { requestHash });
    const { receiptHash: _previous, ...receipt } = f.receipt;
    Object.assign(f.receipt, { receiptHash: await hash(receipt) });
    const gate = await f.coordinator.preSignCandidate({ saved: f.input.saved, operationId: 'original-sign-act', assertCurrent() {} });
    gate.assertCurrent();
    expect(() => previous.assertCurrent()).toThrow('retired');
    expect(f.associated.mock.calls.map(([input]) => input.saved.draft.version)).toEqual([3, 4]);
    expect(f.requests[1].body).toEqual({ draftVersion: 4, candidateHash });
    f.coordinator.dispose();
  });

  it('binds the pre-Sign caller fence and hydration freshness through final synchronous dispatch', async () => {
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    let current = true;
    const assertCurrent = () => { if (!current) throw new Error('actual Sign act retired'); };
    const gate = await f.coordinator.preSignCandidate({ saved: f.input.saved, operationId: 'sign-act', assertCurrent });
    gate.assertCurrent(); current = false;
    expect(() => gate.assertCurrent()).toThrow('actual Sign act retired');
    current = true; expect(() => gate.assertCurrent()).toThrow('retired');
    f.coordinator.dispose();
  });

  it('releases an abort-ignoring retention wait immediately and observes its late rejection', async () => {
    const f = await fixture();
    let reject!: (reason: unknown) => void;
    f.retained.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }));
    const pending = f.coordinator.completionPolicy.complete(f.request);
    f.surface.abort(new Error('visit retired'));
    await expect(pending).rejects.toThrow('visit retired');
    reject(new Error('late transport failure'));
    await Promise.resolve();
    expect(f.associated).not.toHaveBeenCalled();
    f.coordinator.dispose();
  });

  it.each(['parent-resolve', 'parent-reject', 'caller-resolve', 'caller-reject'])('refuses %s async guards and observes rejection before any port effect', async kind => {
    const f = await fixture();
    const asyncGuard = async () => { if (kind.endsWith('reject')) throw new Error('async guard failure'); };
    if (kind.startsWith('parent')) {
      f.input.assertCurrent.mockImplementation(asyncGuard);
      await expect(f.coordinator.completionPolicy.complete(f.request)).rejects.toThrow('synchronous');
      expect(f.retained).not.toHaveBeenCalled();
    } else {
      await f.coordinator.completionPolicy.complete(f.request);
      await expect(f.coordinator.preSignCandidate({ saved: f.input.saved, operationId: 'sign', assertCurrent: asyncGuard })).rejects.toThrow('synchronous');
    }
    expect(f.associated).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
    await Promise.resolve(); f.coordinator.dispose();
  });

  it('refuses pre-Sign with unavailable required sources and retires the guard on expiry', async () => {
    const missing = await fixture(true);
    await missing.coordinator.completionPolicy.complete(missing.request);
    await expect(missing.coordinator.preSignCandidate({ saved: missing.input.saved, operationId: 'sign', assertCurrent() {} })).rejects.toThrow('unavailable');
    missing.coordinator.dispose();
    const f = await fixture();
    await f.coordinator.completionPolicy.complete(f.request);
    const gate = await f.coordinator.preSignCandidate({ saved: f.input.saved, operationId: 'sign', assertCurrent() {} });
    f.setElapsed(60_001); expect(() => gate.assertCurrent()).toThrow('expired');
    f.coordinator.dispose();
  });
});
