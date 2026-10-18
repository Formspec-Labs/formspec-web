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
async function setup(mutate?: (view: ScreenerRunView, request: CapturedHttpRequest) => unknown, instanceMappingHash?: string, recoveryMutation?: (value: Record<string, unknown>) => unknown) {
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
    if (request.method === 'GET') return response({ version: 1, purpose: 'formspec.screener.run', selection,
      run: lastRun, acceptance: null });
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
