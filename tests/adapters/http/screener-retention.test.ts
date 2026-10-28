import { describe, expect, it, vi } from 'vitest';
import { HttpScreenerRetention } from '../../../src/adapters/http/screener-retention.ts';
import { computeJcsSha256Digest as hash } from '../../../src/adapters/http/response-action-ledger.ts';
import type { RetainScreenerCompletion, ScreenerRunView, ScreenerSelection } from '../../../src/ports/screener-retention.ts';
import type { SavedResponseDraft } from '../../../src/ports/response-signing.ts';
import { recordingFetch, type CapturedHttpRequest } from './test-fetch.ts';
import { otherScopeKey, testScopeKey as scope } from '../../fixtures/scope.ts';

const ownerTemplate = { sessionId: 'source-session', subjectRef: 'source-subject', authenticated: {
  issuer: 'https://id.example', subject: 'oidc-subject', clientId: 'client', principalId: 'principal',
  profile: 'profile', actorRef: 'distinct-source-actor', subjectRef: 'source-subject', sessionId: 'source-session',
} };
const document = { url: 'urn:example:screener', version: '1.0.0' };
const at = '2026-10-09T12:00:00Z';
const target = 'urn:example:renewal';
const placeholder = `sha256:${'a'.repeat(64)}`;
function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}
async function setup(mutate?: (view: ScreenerRunView, request: CapturedHttpRequest) => unknown, instanceMappingHash?: string, recoveryMutation?: (value: Record<string, unknown>) => unknown, historicalMutation?: (view: ScreenerRunView) => ScreenerRunView) {
  const owner = structuredClone(ownerTemplate);
  const selection: ScreenerSelection = {
    evaluationSelection: { scope, formId: 'form/id', formVersionId: 'version', definitionUrl: 'urn:example:form',
      definitionVersion: '1.0.0', definitionHash: placeholder, requiredSources: ['screening'] },
    formVersionHash: placeholder, sourceRef: 'screening', screenerUrl: document.url, screenerVersion: document.version,
    screenerRawHash: placeholder, screenerHash: await hash(document), allowedTargets: [target], qualificationProfile: 'flat-first-match-v1',
    ...(instanceMappingHash === undefined ? {} : { instanceMappingHash }),
  };
  const selectionHash = await hash(selection);
  const context = { identity: { issuer: owner.authenticated.issuer, subject: owner.authenticated.subject, clientId: 'client' },
    signal: new AbortController().signal, assertCurrent: vi.fn() };
  const completion: RetainScreenerCompletion = { ...context, completionId: 'same-act', document, screenerRef: document, answers: { yes: false }, target };
  const saved = {
    draftKey: { formUrl: selection.evaluationSelection.definitionUrl, formVersion: '1.0.0', subjectRef: owner.subjectRef },
    response: { $formspecResponse: '1.0', definitionUrl: selection.evaluationSelection.definitionUrl, definitionVersion: '1.0.0',
      status: 'in-progress', data: { nested: { no: false } } },
    draft: { id: 'draft_123', version: 7, responseHash: placeholder }, actor: { id: owner.subjectRef },
  } as unknown as SavedResponseDraft;
  Object.assign(saved, { evidence: { draft_id: saved.draft.id, form_version_id: 'version', subject_ref: owner.subjectRef,
    draft_version: 7, status: 'in_progress', draft_state: {}, canonical_response: saved.response } });
  let lastRun: ScreenerRunView['run'];
  const revisions = new Map<number, ScreenerRunView['run']>();
  const { fetch, requests } = recordingFetch(async request => {
    if (request.url.endsWith('/screener-recovery')) {
      const body = request.body as { candidateHash: string; draftVersion: number; formVersionHash: string };
      const recovery = { version: 1, purpose: 'formspec.screener.draft-recovery', scope, owner,
        formVersionHash: body.formVersionHash, draftId: saved.draft.id, draftVersion: body.draftVersion,
        candidateHash: body.candidateHash, selectionHash, result: { status: 'retained', relation: 'currentCandidate',
          association: { scope, owner, draftId: saved.draft.id, draftVersion: body.draftVersion, candidateHash: body.candidateHash,
            selectionHash, runId: lastRun.runId, runRevision: lastRun.revision, evidenceHash: lastRun.evidenceHash, associatedAt: at },
          history: { version: 1, purpose: 'formspec.screener.run', selection, run: lastRun, acceptance: null } } };
      return response(recoveryMutation ? recoveryMutation(structuredClone(recovery)) : recovery);
    }
    if (request.method === 'GET') {
      const revision = new URL(request.url).searchParams.get('revision');
      const history: ScreenerRunView = { version: 1, purpose: 'formspec.screener.run', selection,
        run: revision === null ? lastRun : revisions.get(Number(revision))!, acceptance: null };
      return response(historicalMutation ? historicalMutation(structuredClone(history)) : history);
    }
    if (request.url.endsWith('/screener-associations')) {
      const body = request.body as { candidateHash: string; draftVersion: number };
      return response({ scope, draftId: saved.draft.id, draftVersion: body.draftVersion, candidateHash: body.candidateHash,
        selectionHash, owner, runId: lastRun.runId, runRevision: lastRun.revision, evidenceHash: lastRun.evidenceHash, associatedAt: at });
    }
    const answers = (request.body as { answers: Record<string, unknown> }).answers;
    const determination = { $formspecDetermination: '1.0', screener: document, timestamp: at, evaluationVersion: '1.0.0', status: 'completed',
      overrides: { matched: [], halted: false }, phases: [], inputs: answers, validity: { validUntil: '2026-10-10T12:00:00Z' } };
    const revision = request.method === 'PUT' ? lastRun.revision + 1 : 1;
    const original = { version: 1 as const, scope, runId: 'run_123', revision, selectionHash, owner,
      answers: answers as ScreenerRunView['run']['answers'], answersHash: await hash(answers), evaluatedAt: at,
      determination, determinationHash: await hash(determination), qualification: { status: 'ready' as const, target },
      evidenceRef: `urn:formspec:source:screener:run_123:revision:${revision}` };
    lastRun = { ...original, evidenceHash: await hash(original) };
    revisions.set(revision, structuredClone(lastRun));
    const view: ScreenerRunView = { version: 1, purpose: 'formspec.screener.run', selection, run: lastRun,
      acceptance: { checkedAt: at, qualification: { status: 'ready', target } } };
    return response(mutate ? mutate(view, request) : view);
  });
  const config = { baseUrl: 'https://source.example', selection, selectionHash, accessToken: 'owner-token', fetchImpl: fetch,
    scopeKey: scope };
  return { adapter: new HttpScreenerRetention(config), config, completion, requests, saved, context };
}

describe('public Source Screener retention adapter', () => {
  it('uses the fixed public endpoint, exact headers, false answer and stable same-act recovery', async () => {
    const { adapter, completion, requests } = await setup();
    const first = await adapter.retain(completion);
    const recovered = await adapter.retain(completion);
    expect(recovered).toEqual(first);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe('https://source.example/forms/form%2Fid/screener-runs');
    expect(requests[0]?.body).toEqual({ selectionHash: first.run.selectionHash, answers: { yes: { state: 'answered', value: false } } });
    // Source's screener-run POST is keyed: the act's one key, reused when the same act is retried.
    expect(requests.map(request => request.headers.get('idempotency-key'))).toEqual(['same-act', 'same-act']);
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer owner-token');
    expect(requests[0]?.headers.get('x-stack-scope-key')).toBe(scope);
    expect(Object.isFrozen(first.run.owner.authenticated)).toBe(true);
  });

  it.each([['a foreign', otherScopeKey], ['no', undefined]] as const)('refuses %s scope key at construction', async (_mode, scopeKey) => {
    const { config } = await setup();
    expect(() => new HttpScreenerRetention({ ...config, scopeKey })).toThrow('selection binding mismatch');
  });

  it('PUT reevaluates exact issued typed answers under CAS and owning headers, then GET reconciles the revision', async () => {
    const f = await setup(); const run = await f.adapter.retain(f.completion);
    const fresh = await f.adapter.refresh({ ...f.context, run });
    expect(f.requests[1]).toMatchObject({ method: 'PUT', url: 'https://source.example/screener-runs/run_123',
      body: { selectionHash: run.run.selectionHash, expectedRevision: 1, answers: run.run.answers } });
    expect(f.requests[1].headers.get('authorization')).toBe('Bearer owner-token');
    expect(fresh.run.revision).toBe(2); expect(fresh.run.answers).toEqual(run.run.answers);
    expect(await f.adapter.load({ ...f.context, run })).toEqual({ ...fresh, acceptance: null });
    expect(f.requests[2].method).toBe('GET');
    const retired = { ...f.context, assertCurrent() { throw Error('owner retired'); } };
    await expect(f.adapter.refresh({ ...retired, run: fresh })).rejects.toThrow('owner retired');
    expect(f.requests).toHaveLength(3);
    await expect(f.adapter.refresh({ ...f.context, run: structuredClone(fresh) })).rejects.toThrow('Port-issued');
  });
  it.each(['exact', 'foreign history', 'retired'] as const)('recovers signed history without fresh acceptance or mutation: %s', async mode => {
    const f = await setup(undefined, undefined, value => {
      if (mode === 'foreign history') ((value.result as { history: ScreenerRunView }).history.run.owner.authenticated as { subject: string }).subject = 'foreign';
      return value;
    });
    const retained = await f.adapter.retain(f.completion);
    // Routing fixture only: the cohort separately verifies the real delegated signature.
    Object.assign(f.saved.response, { authoredSignatures: [{}] });
    const count = f.requests.length;
    const input = { ...f.context, saved: f.saved, assertCurrent: () => { if (mode === 'retired') throw Error('retired'); } };
    if (mode !== 'exact') await expect(f.adapter.recover(input)).rejects.toThrow();
    else {
      const history = await f.adapter.recover(input);
      expect(history.run).toEqual(retained.run); expect(history.acceptance).toBeNull();
      expect(f.requests.slice(count)).toMatchObject([{ method: 'POST', url: 'https://source.example/drafts/draft_123/screener-recovery',
        body: { draftVersion: 7, candidateHash: await hash(f.saved.response) } }]);
      expect(f.requests[count].headers.get('authorization')).toBe('Bearer owner-token');
      expect(f.requests[count].headers.get('x-stack-scope-key')).toBe(scope);
    }
    expect(f.requests.slice(count).every(request => request.url.endsWith('/screener-recovery'))).toBe(true);
    if (mode === 'retired') expect(f.requests).toHaveLength(count);
  });
  it('recovers only the exact owned saved association as history without ready acceptance', async () => {
    const f = await setup(); const retained = await f.adapter.retain(f.completion);
    const history = await f.adapter.recover({ ...f.context, saved: f.saved });
    expect(history.run).toEqual(retained.run); expect(history.acceptance).toBeNull();
    expect(f.requests[1].body).toEqual({ selectionHash: retained.run.selectionHash,
      formVersionHash: retained.selection.formVersionHash, draftVersion: 7, candidateHash: await hash(f.saved.response) });
    await expect(f.adapter.associate({ ...f.context, saved: f.saved, run: history })).rejects.toThrow('current retained');
    expect((await f.adapter.refresh({ ...f.context, run: history })).run.revision).toBe(2);
  });
  it.each(['prior', 'pending', 'crossed candidate'])('checks %s recovery against the exact current saved draft', async branch => {
    const f = await setup(undefined, undefined, value => {
      const result = value.result as { status: string; relation: string; association: { draftVersion: number } };
      if (branch === 'prior') { result.relation = 'priorCandidate'; result.association.draftVersion = 6; }
      if (branch === 'pending') value.result = { status: 'pending', reason: 'associationNotRetained' };
      if (branch === 'crossed candidate') value.candidateHash = placeholder;
      return value;
    });
    await f.adapter.retain(f.completion);
    if (branch === 'prior') expect((await f.adapter.recover({ ...f.context, saved: f.saved })).acceptance).toBeNull();
    else await expect(f.adapter.recover({ ...f.context, saved: f.saved })).rejects.toThrow('recovery unavailable');
  });
  it.each(['owner', 'answers', 'revision', 'hash'])('refuses changed %s in a refresh reply', async field => {
    const f = await setup((view, request) => {
      if (request.method !== 'PUT') return view;
      if (field === 'owner') (view.run.owner.authenticated as { subject: string }).subject = 'other';
      if (field === 'answers') (view.run as { answers: unknown }).answers = {};
      if (field === 'revision') (view.run as { revision: number }).revision = 4;
      if (field === 'hash') (view.run as { evidenceHash: string }).evidenceHash = placeholder;
      return view;
    });
    const run = await f.adapter.retain(f.completion);
    await expect(f.adapter.refresh({ ...f.context, run })).rejects.toThrow();
  });
  it('admits pinned original unassociated history through authenticated GET into only the reading adapter', async () => {
    const f = await setup(undefined, undefined, value => ({ ...value, result: { status: 'pending', reason: 'associationNotRetained' } }));
    const original = await f.adapter.retain(f.completion);
    const reader = new HttpScreenerRetention(f.config);
    const originalHistory = { draftId: f.saved.draft.id, runId: original.run.runId, revision: 1, evidenceHash: original.run.evidenceHash };
    const count = f.requests.length;
    const history = await reader.recover({ ...f.context, saved: f.saved, originalHistory });
    expect(history.run).toEqual(original.run); expect(history.acceptance).toBeNull();
    expect(Object.isFrozen(history.run.answers)).toBe(true);
    expect(f.requests.slice(count).map(request => [request.method, request.url])).toEqual([
      ['POST', 'https://source.example/drafts/draft_123/screener-recovery'],
      ['GET', 'https://source.example/screener-runs/run_123?revision=1'],
    ]);
    expect(f.requests.at(-1)!.headers.get('authorization')).toBe('Bearer owner-token');
    expect(f.requests.at(-1)!.headers.get('x-stack-scope-key')).toBe(scope);
    await expect(reader.associate({ ...f.context, saved: f.saved, run: history })).rejects.toThrow('current retained');
    await expect(reader.refresh({ ...f.context, run: structuredClone(history) })).rejects.toThrow('Port-issued');
    expect((await reader.refresh({ ...f.context, run: history })).run).toMatchObject({ runId: original.run.runId, revision: 2, answers: original.run.answers });
  });

  it.each(['run', 'revision', 'scope', 'owner', 'selection', 'answers hash', 'determination hash', 'evidence hash', 'timestamp', 'reference', 'acceptance', 'retired'] as const)(
    'refuses substituted original history %s without issuing a refreshable handle', async field => {
      let current = true;
      const f = await setup(undefined, undefined, value => ({ ...value, result: { status: 'pending', reason: 'associationNotRetained' } }), history => {
        if (field === 'run') Object.assign(history.run, { runId: 'foreign' });
        if (field === 'revision') Object.assign(history.run, { revision: 2 });
        if (field === 'scope') Object.assign(history.run, { scope: otherScopeKey });
        if (field === 'owner') Object.assign(history.run.owner.authenticated, { subject: 'foreign' });
        if (field === 'selection') Object.assign(history.selection, { formVersionHash: `sha256:${'b'.repeat(64)}` });
        if (field === 'answers hash') Object.assign(history.run, { answersHash: placeholder });
        if (field === 'determination hash') Object.assign(history.run, { determinationHash: placeholder });
        if (field === 'evidence hash') Object.assign(history.run, { evidenceHash: placeholder });
        if (field === 'timestamp') Object.assign(history.run, { evaluatedAt: '2026-10-08T12:00:00Z' });
        if (field === 'reference') Object.assign(history.run, { evidenceRef: 'urn:foreign' });
        if (field === 'acceptance') Object.assign(history, { acceptance: { checkedAt: at, qualification: { status: 'ready', target } } });
        if (field === 'retired') current = false;
        return history;
      });
      const original = await f.adapter.retain(f.completion);
      const reader = new HttpScreenerRetention(f.config);
      const originalHistory = { draftId: f.saved.draft.id, runId: original.run.runId, revision: 1, evidenceHash: original.run.evidenceHash };
      await expect(reader.recover({ ...f.context, saved: f.saved, originalHistory,
        assertCurrent() { if (!current) throw Error('retired'); } })).rejects.toThrow();
      expect(f.requests.slice(1).every(request => request.method !== 'PUT')).toBe(true);
    });

  it('reloads a later same-run same-answer association against the exact pinned original revision', async () => {
    const f = await setup(); const original = await f.adapter.retain(f.completion);
    const originalHistory = { draftId: f.saved.draft.id, runId: original.run.runId, revision: 1, evidenceHash: original.run.evidenceHash };
    const fresh = await f.adapter.refresh({ ...f.context, run: original });
    await f.adapter.associate({ ...f.context, run: fresh, saved: f.saved });
    const reader = new HttpScreenerRetention(f.config);
    const history = await reader.recover({ ...f.context, saved: f.saved, originalHistory });
    expect(history.run).toEqual(fresh.run); expect(history.acceptance).toBeNull();
    expect(f.requests.at(-1)!.url).toBe('https://source.example/screener-runs/run_123?revision=1');
    expect((await reader.refresh({ ...f.context, run: history })).run.revision).toBe(3);
  });

  it.each(['run', 'answers'] as const)('refuses an integrity-valid associated successor with changed original %s', async field => {
    const f = await setup(undefined, undefined, value => {
      const result = value.result as { association: Record<string, unknown>; history: ScreenerRunView };
      const run = result.history.run;
      // Hashes are recomputed below so rejection proves lineage, rather than hash corruption.
      if (field === 'run') Object.assign(run, { runId: 'different-run', evidenceRef: `urn:formspec:source:screener:different-run:revision:${run.revision}` });
      else Object.assign(run, { answers: { yes: { state: 'answered', value: true } } });
      return value;
    });
    const original = await f.adapter.retain(f.completion);
    const reader = new HttpScreenerRetention({ ...f.config, fetchImpl: async (input, init) => {
      const reply = await f.config.fetchImpl(input, init);
      if (!String(input).endsWith('/screener-recovery')) return reply;
      const value = await reply.json(); const result = value.result; const run = result.history.run;
      run.answersHash = await hash(run.answers);
      const { evidenceHash: _previous, ...evidence } = run;
      run.evidenceHash = await hash(evidence);
      Object.assign(result.association, { runId: run.runId, evidenceHash: run.evidenceHash });
      return response(value);
    } });
    await expect(reader.recover({ ...f.context, saved: f.saved, originalHistory: {
      draftId: f.saved.draft.id, runId: original.run.runId, revision: 1, evidenceHash: original.run.evidenceHash,
    } })).rejects.toThrow('recovery history mismatch');
    expect(f.requests.filter(request => request.method === 'PUT')).toHaveLength(0);
  });

  it.each(['draft', 'signed', 'signing-content', 'missing pin', 'wrong revision'] as const)('refuses invalid original locator selection %s before transport', async mode => {
    const f = await setup(); const original = await f.adapter.retain(f.completion);
    const originalHistory = { draftId: f.saved.draft.id, runId: original.run.runId, revision: 1, evidenceHash: original.run.evidenceHash };
    if (mode === 'draft') originalHistory.draftId = 'another-draft';
    if (mode === 'signed') Object.assign(f.saved.response, { authoredSignatures: [{}] });
    if (mode === 'signing-content') Object.assign(f.saved.response, { extensions: { 'x-formspec-signing-content': {} } });
    if (mode === 'missing pin') Reflect.deleteProperty(originalHistory, 'evidenceHash');
    if (mode === 'wrong revision') originalHistory.revision = 0;
    const count = f.requests.length;
    await expect(new HttpScreenerRetention(f.config).recover({ ...f.context, saved: f.saved, originalHistory })).rejects.toThrow();
    expect(f.requests).toHaveLength(count);
  });

  it('retains the original mapping-bound selection without changing legacy omission', async () => {
    const legacy = await setup();
    const unbound = await legacy.adapter.retain(legacy.completion);
    expect(Object.hasOwn(unbound.selection, 'instanceMappingHash')).toBe(false);
    const mapped = await setup(undefined, placeholder);
    const bound = await mapped.adapter.retain(mapped.completion);
    expect(bound.selection).toHaveProperty('instanceMappingHash', placeholder);
    expect(bound.run.selectionHash).toBe(await hash(bound.selection));
    expect(bound.run.selectionHash).not.toBe(unbound.run.selectionHash);
    await expect(mapped.adapter.associate({ ...mapped.context, saved: mapped.saved, run: bound })).resolves.toMatchObject({ selectionHash: bound.run.selectionHash });
  });

  it.each(['omitted', 'replaced'])('refuses %s original mapping pin from a mapping-bound response', async mode => {
    const fixture = await setup(view => {
      const selection = { ...view.selection } as ScreenerSelection & { instanceMappingHash?: string };
      if (mode === 'omitted') delete selection.instanceMappingHash;
      else selection.instanceMappingHash = `sha256:${'b'.repeat(64)}`;
      return { ...view, selection };
    }, placeholder);
    await expect(fixture.adapter.retain(fixture.completion)).rejects.toThrow();
  });

  it('associates the exact full saved candidate using plain JCS, retaining opaque Source owner', async () => {
    const { adapter, completion, requests, saved, context } = await setup();
    const run = await adapter.retain(completion);
    const association = await adapter.associate({ ...context, run, saved });
    expect(association.candidateHash).toBe(await hash(saved.response));
    expect(association.candidateHash).not.toBe(saved.draft.responseHash);
    expect(association.owner.authenticated.actorRef).toBe('distinct-source-actor');
    expect(requests[1]?.body).toEqual({ selectionHash: run.run.selectionHash, runId: 'run_123', runRevision: 1,
      draftVersion: 7, candidateHash: await hash(saved.response) });
    expect(requests[1]?.headers.has('idempotency-key')).toBe(false);
  });

  it.each([
    ['historical null', (v: ScreenerRunView) => { (v as { acceptance: unknown }).acceptance = null; }],
    ['owner', (v: ScreenerRunView) => { (v.run.owner.authenticated as { subject: string }).subject = 'crossed'; }],
    ['selection', (v: ScreenerRunView) => { (v.selection as { formVersionHash: string }).formVersionHash = `sha256:${'b'.repeat(64)}`; }],
    ['answers', (v: ScreenerRunView) => { (v.run as { answers: unknown }).answers = {}; }],
    ['evidence hash', (v: ScreenerRunView) => { (v.run as { evidenceHash: string }).evidenceHash = placeholder; }],
    ['unexpected field', (v: ScreenerRunView) => { Object.assign(v, { accepted: true }); }],
    ['target', (v: ScreenerRunView) => { (v.acceptance!.qualification as { target: string }).target = 'urn:crossed'; }],
    ['expired original', (v: ScreenerRunView) => { (v.acceptance as { checkedAt: string }).checkedAt = '2026-10-11T12:00:00Z'; }],
    ['predated acceptance', (v: ScreenerRunView) => { (v.acceptance as { checkedAt: string }).checkedAt = '2026-10-08T12:00:00Z'; }],
  ])('refuses %s', async (_, mutate) => {
    const { adapter, completion } = await setup(view => { mutate(view); return view; });
    await expect(adapter.retain(completion)).rejects.toThrow();
  });

  it('keeps current Pending explicit despite historical Ready and cannot associate it', async () => {
    const { adapter, completion, saved, context } = await setup(view => ({ ...view,
      acceptance: { checkedAt: at, qualification: { status: 'pending', reason: 'screenerExpiredNewActRequired' } } }));
    const run = await adapter.retain(completion);
    expect(run.acceptance?.qualification.status).toBe('pending');
    await expect(adapter.associate({ ...context, saved, run })).rejects.toThrow('current retained');
  });

  it.each([null, [], { nested: true }, NaN, Infinity, undefined])('rejects nonprimitive/nonfinite answer %s before credentials', async answer => {
    const { adapter, completion, requests } = await setup();
    await expect(adapter.retain({ ...completion, answers: { yes: answer } as RetainScreenerCompletion['answers'] })).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });

  it('does not retry conflicts or replace the completion key', async () => {
    const { config, completion } = await setup();
    const fetch = vi.fn(async () => response({ title: 'conflict', status: 409, error_code: 'FORMSPEC-4090' }, 409));
    await expect(new HttpScreenerRetention({ ...config, fetchImpl: fetch }).retain(completion)).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fences delayed responses when the route or owner changes', async () => {
    let current = true;
    const { adapter, completion } = await setup(view => { current = false; return view; });
    await expect(adapter.retain({ ...completion, assertCurrent() { if (!current) throw new Error('retired generation'); } })).rejects.toThrow('retired generation');
  });

  it('rejects caller-created run handles and mismatched saved snapshots before association transport', async () => {
    const { adapter, completion, saved, context, requests } = await setup();
    const run = await adapter.retain(completion);
    await expect(adapter.associate({ ...context, saved, run: structuredClone(run) })).rejects.toThrow('current retained');
    await expect(adapter.associate({ ...context, run, saved: { ...saved, draft: { ...saved.draft, version: 8 } } })).rejects.toThrow('Saved candidate');
    expect(requests).toHaveLength(1);
  });

  it('rejects dot-segment form IDs before constructing an endpoint', async () => {
    const { config } = await setup();
    const selection = structuredClone(config.selection);
    Object.assign(selection.evaluationSelection, { formId: '..' });
    expect(() => new HttpScreenerRetention({ ...config, selection })).toThrow('selection binding');
  });


  it.each([' same-act', 'same-act ', 'é', 'a'.repeat(257), 'a\nb'])('rejects altered or oversized Idempotency-Key %s before credentials', async completionId => {
    const { adapter, completion, requests } = await setup();
    await expect(adapter.retain({ ...completion, completionId })).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });

});
