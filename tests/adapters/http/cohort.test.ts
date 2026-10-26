import { describe, expect, it, vi } from 'vitest';
import { AnonymousSessionBridge } from '../../../src/adapters/http/anonymous-session.ts';
import {
  createHttpAdapterCohort,
  draftKeyFromHandoff,
} from '../../../src/adapters/http/cohort.ts';
import {
  sampleFormDefinition,
  sampleFormResponse,
  sampleIntakeHandoff,
} from '../../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../../src/shared/idempotency-key.ts';
import { idempotencyKey, jsonResponse, recordingFetch } from './test-fetch.ts';

describe('createHttpAdapterCohort (FW-0064)', () => {
  it('shares a binding so submit looks up the draft id created by save (no extensions key required)', async () => {
    const { fetch, requests } = recordingFetch((request) => {
      if (request.method === 'POST' && /\/drafts$/.test(new URL(request.url).pathname)) {
        return jsonResponse(initialized('draft-cohort-1', 'S-1'));
      }
      if (request.method === 'POST' && /\/drafts\/draft-cohort-1\/submit$/.test(new URL(request.url).pathname)) {
        return jsonResponse({ response_id: 'response-cohort-1', status: 'accepted' });
      }
      if (request.method === 'PATCH') return jsonResponse({ draft_id: new URL(request.url).pathname.split('/').at(-1), draft_version: 2 });
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const cohort = createHttpAdapterCohort({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      formVersionId: 'publication',
    });
    const handoff = {
      ...sampleIntakeHandoff,
      definitionRef: { url: sampleFormDefinition.url, version: '1.0.0' },
      subjectRef: 'S-1',
    };
    const key = draftKeyFromHandoff(handoff);
    expect(cohort.invalidateResponseSigningScope).toBeUndefined();

    await cohort.draftStore.initializeDraft!(key);
    await cohort.draftStore.save(key, sampleFormResponse);
    const confirmation = await cohort.submitTransport.submit(handoff, generateIdempotencyKey());

    expect(confirmation).toMatchObject({
      referenceNumber: 'response-cohort-1',
      status: 'accepted',
    });
    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /runtime/forms/conformance/drafts',
      'PATCH /drafts/draft-cohort-1',
      'POST /drafts/draft-cohort-1/submit',
    ]);
  });

  it('derives the binding key from handoff.definitionRef + subjectRef (FW-0064 derivation contract)', () => {
    const key = draftKeyFromHandoff({
      ...sampleIntakeHandoff,
      definitionRef: { url: 'https://forms.example/form-a', version: '2.0.0' },
      subjectRef: 'respondent:abc',
    });
    expect(key).toEqual({
      formUrl: 'https://forms.example/form-a',
      formVersion: '2.0.0',
      subjectRef: 'respondent:abc',
    });
  });

  it('returns undefined draft id when the handoff has no matching binding (fail-fast at submit)', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ title: 'unexpected' }, 500));
    const cohort = createHttpAdapterCohort({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      formVersionId: 'publication',
    });
    const handoff = {
      ...sampleIntakeHandoff,
      definitionRef: { url: 'https://forms.example/never-saved', version: '1.0.0' },
      subjectRef: 'S-missing',
    };
    await expect(
      cohort.submitTransport.submit(handoff, generateIdempotencyKey()),
    ).rejects.toThrow(/requires a draft id/);
  });

  it('routes anonymous session tokens through the supplied bridge for both adapters', async () => {
    let lastDraftBody: Record<string, unknown> | undefined;
    let lastSubmitBody: Record<string, unknown> | undefined;
    const { fetch } = recordingFetch((request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/sessions/anonymous')) return jsonResponse({ session_id: 'session', session_token: 'token-from-bridge',
        subject_ref: 'anon:demo', form_id: 'conformance', expires_at: '2099-01-01T00:00:00Z' });
      if (request.method === 'POST' && /\/drafts$/.test(path)) {
        lastDraftBody = request.body as Record<string, unknown>;
        return jsonResponse(initialized('draft-anon-1', 'anon:demo'));
      }
      if (request.method === 'POST' && /\/drafts\/draft-anon-1\/submit$/.test(path)) {
        lastSubmitBody = request.body as Record<string, unknown>;
        return jsonResponse({ response_id: 'response-anon-1', status: 'accepted' });
      }
      if (request.method === 'PATCH') return jsonResponse({ draft_id: new URL(request.url).pathname.split('/').at(-1), draft_version: 2 });
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const cohort = createHttpAdapterCohort({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      formVersionId: 'publication',
      anonymousSessions: new AnonymousSessionBridge({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch }),
    });
    const handoff = {
      ...sampleIntakeHandoff,
      definitionRef: { url: sampleFormDefinition.url, version: '1.0.0' },
      subjectRef: 'anon:demo',
    };
    const key = draftKeyFromHandoff(handoff);

    await cohort.draftStore.initializeDraft!(key);
    await cohort.draftStore.save(key, sampleFormResponse);
    await cohort.submitTransport.submit(handoff, generateIdempotencyKey());

    expect(lastDraftBody).toEqual({ form_version_id: 'publication' });
    expect(lastSubmitBody).toMatchObject({ anonymous_session_token: 'token-from-bridge' });
  });

  it('isolates binding state per cohort instance (no module-level registry)', async () => {
    let draftCounter = 0;
    const { fetch } = recordingFetch((request) => {
      if (request.method === 'POST' && /\/drafts$/.test(new URL(request.url).pathname)) {
        draftCounter += 1;
        return jsonResponse(initialized(`draft-iso-${draftCounter}`, 'S-iso'));
      }
      const path = new URL(request.url).pathname;
      const match = path.match(/^\/drafts\/(draft-iso-\d+)\/submit$/);
      if (match) {
        return jsonResponse({ response_id: `response-${match[1]}`, status: 'accepted' });
      }
      if (request.method === 'PATCH') return jsonResponse({ draft_id: new URL(request.url).pathname.split('/').at(-1), draft_version: 2 });
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const cohortA = createHttpAdapterCohort({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      formVersionId: 'publication',
    });
    const cohortB = createHttpAdapterCohort({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      formVersionId: 'publication',
    });
    const handoff = {
      ...sampleIntakeHandoff,
      definitionRef: { url: sampleFormDefinition.url, version: '1.0.0' },
      subjectRef: 'S-iso',
    };
    const key = draftKeyFromHandoff(handoff);

    await cohortA.draftStore.initializeDraft!(key);
    await cohortA.draftStore.save(key, sampleFormResponse);
    // CohortB has no binding for the same key — submit fails fast (proves
    // each cohort owns its own registry, not a shared global).
    await expect(
      cohortB.submitTransport.submit(handoff, generateIdempotencyKey()),
    ).rejects.toThrow(/requires a draft id/);
    // CohortA's binding still works.
    const confirmation = await cohortA.submitTransport.submit(
      handoff,
      generateIdempotencyKey(),
    );
    expect(confirmation.referenceNumber).toBe('response-draft-iso-1');
  });

  it('does not require the handoff to carry x-formspec-draft-key in extensions', async () => {
    const { fetch } = recordingFetch((request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && /\/drafts$/.test(path)) {
        return jsonResponse(initialized('draft-no-ext', 'S-no-ext'));
      }
      if (request.method === 'POST' && /\/drafts\/draft-no-ext\/submit$/.test(path)) {
        return jsonResponse({ response_id: 'response-no-ext', status: 'accepted' });
      }
      if (request.method === 'PATCH') return jsonResponse({ draft_id: new URL(request.url).pathname.split('/').at(-1), draft_version: 2 });
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const cohort = createHttpAdapterCohort({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      formVersionId: 'publication',
    });
    const handoff = {
      ...sampleIntakeHandoff,
      definitionRef: { url: sampleFormDefinition.url, version: '1.0.0' },
      subjectRef: 'S-no-ext',
      extensions: { 'x-formspec-response': sampleFormResponse },
    };
    expect(handoff.extensions).not.toHaveProperty('x-formspec-draft-key');

    await cohort.draftStore.initializeDraft!(draftKeyFromHandoff(handoff));
    await cohort.draftStore.save(draftKeyFromHandoff(handoff), sampleFormResponse);
    const confirmation = await cohort.submitTransport.submit(handoff, generateIdempotencyKey());
    expect(confirmation.status).toBe('accepted');
  });

  it('preserves UUIDv7 idempotency contract on the cohort-wired submit transport', async () => {
    let counter = 0;
    const { fetch, requests } = recordingFetch((request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && /\/drafts$/.test(path)) {
        return jsonResponse(initialized('draft-idem', 'S-idem'));
      }
      if (request.method === 'POST' && /\/drafts\/draft-idem\/submit$/.test(path)) {
        counter += 1;
        return jsonResponse({ response_id: `response-idem-${counter}`, status: 'accepted' });
      }
      if (request.method === 'PATCH') return jsonResponse({ draft_id: new URL(request.url).pathname.split('/').at(-1), draft_version: 2 });
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const cohort = createHttpAdapterCohort({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      formVersionId: 'publication',
    });
    const handoff = {
      ...sampleIntakeHandoff,
      definitionRef: { url: sampleFormDefinition.url, version: '1.0.0' },
      subjectRef: 'S-idem',
    };
    await cohort.draftStore.initializeDraft!(draftKeyFromHandoff(handoff));
    await cohort.draftStore.save(draftKeyFromHandoff(handoff), sampleFormResponse);
    const key = generateIdempotencyKey();
    const a = await cohort.submitTransport.submit(handoff, key);
    const b = await cohort.submitTransport.submit(handoff, key);
    expect(b).toEqual(a);
    const submitRequests = requests.filter((r) => r.method === 'POST' && r.url.endsWith('/submit'));
    expect(submitRequests).toHaveLength(1);
    expect(idempotencyKey(submitRequests[0]!)).toBe(key);
  });
});

function initialized(draft_id: string, subject_ref: string) {
  return { draft_id, subject_ref, form_version_id: 'publication', draft_version: 1, draft_state: {},
    canonical_response: null, status: 'in_progress', is_initialization_only: true };
}


describe('trusted anonymous initialization ownership', () => {
  const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version };
  const grant = { session_id: 'owner-session', session_token: 'owner-token', subject_ref: 'anon:verified-owner',
    form_id: 'conformance', expires_at: '2099-01-01T00:00:00Z' };
  function fixture(serverOwner = grant.subject_ref, held = false) {
    const values = new Map<string, unknown>();
    const resumeMetadata = { read: (slot: string) => values.get(slot),
      write: (slot: string, value: unknown) => { values.set(slot, structuredClone(value)); }, remove: (slot: string) => { values.delete(slot); } };
    let release!: () => void;
    const view = initialized('actual-anonymous-draft', serverOwner);
    const { fetch, requests } = recordingFetch(async request => {
      if (request.url.endsWith('/sessions/anonymous')) return jsonResponse(grant);
      if (request.method === 'POST') {
        expect(request.body).toEqual({ form_version_id: 'publication' });
        expect(request.headers.get('Authorization')).toBe('Bearer owner-token');
        if (held) await new Promise<void>(resolve => { release = resolve; });
      }
      return jsonResponse(view);
    });
    const config = { baseUrl: 'https://source.test', formVersionId: 'publication', fetchImpl: fetch, resumeMetadata };
    const build = () => createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    return { build, values, requests, release: () => release() };
  }
  it('initializes and reloads an empty draft against the bridge owner when the caller has no subject', async () => {
    const test = fixture(); const initial = test.build();
    expect(await initial.draftStore.initializeDraft!(key)).toEqual({ draftId: 'actual-anonymous-draft', isInitializationOnly: true });
    await expect(test.build().draftStore.load(key)).resolves.toBeUndefined();
    expect(test.values.get('draft-handles')).toEqual([{ key, formId: 'conformance', draftId: 'actual-anonymous-draft', draftVersion: 1 }]);
    expect(test.requests.filter(request => request.url.endsWith('/sessions/anonymous'))).toHaveLength(1);
    expect(test.requests.filter(request => request.method === 'POST' && request.url.endsWith('/drafts'))).toHaveLength(1);
    expect(test.requests.at(-1)?.headers.get('Authorization')).toBe('Bearer owner-token');
  });
  it('refuses a different Source owner without binding its returned draft', async () => {
    const test = fixture('anon:foreign'); const cohort = test.build();
    await expect(cohort.draftStore.initializeDraft!(key)).rejects.toThrow('owned publication');
    expect(test.values.get('draft-handles')).toBeUndefined();
    const count = test.requests.length;
    await expect(cohort.draftStore.load(key)).resolves.toBeUndefined(); expect(test.requests).toHaveLength(count);
  });
  it('refuses an explicit caller owner that differs from its verified anonymous session', async () => {
    const test = fixture();
    await expect(test.build().draftStore.initializeDraft!({ ...key, subjectRef: 'anon:foreign' })).rejects.toThrow();
    expect(test.values.get('draft-handles')).toBeUndefined();
    expect(test.requests.some(request => request.url.endsWith('/drafts'))).toBe(false);
  });
  it('refuses a late initialization after retirement even without a caller subject or bound handle', async () => {
    const test = fixture(undefined, true); const cohort = test.build();
    const pending = cohort.draftStore.initializeDraft!(key);
    await vi.waitFor(() => expect(test.requests.some(request => request.url.endsWith('/drafts'))).toBe(true));
    const retired = cohort.draftStore.invalidateSubject(grant.subject_ref); test.release();
    await expect(pending).rejects.toThrow('retired'); await retired;
    expect(test.values.get('draft-handles')).toBeUndefined();
  });
});
