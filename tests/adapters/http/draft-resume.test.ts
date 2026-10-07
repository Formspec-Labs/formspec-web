import { describe, expect, it, vi } from 'vitest';
import { createBrowserDraftResumeMetadataStore } from '../../../src/adapters/browser/draft-resume-metadata.ts';
import { AnonymousSessionBridge } from '../../../src/adapters/http/anonymous-session.ts';
import { createHttpAdapterCohort } from '../../../src/adapters/http/cohort.ts';
import { createDraftBindingRegistry } from '../../../src/adapters/http/draft-binding-registry.ts';
import { sampleFormDefinition, sampleFormResponse, sampleIntakeHandoff } from '../../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../../src/shared/idempotency-key.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';

function tabStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const context = { baseUrl: 'https://server.example.test/api', tenantBinding: {
  kind: 'bound' as const, scope: { tenant: 'tenant', workspace: 'workspace', environment: 'test', cell: 'cell' },
} };
const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version };
const grant = { session_id: 'session', session_token: 'server-owner-token', subject_ref: 'anon:owner',
  form_id: 'conformance', expires_at: '2099-01-01T00:00:00Z' };

describe('tab metadata anonymous draft resume', () => {
  it('refuses a newer package for a retained draft and restores the original version', async () => {
    const storage = tabStorage();
    const oldKey = { ...key, formVersion: '0.1.2' };
    const currentKey = { ...key, formVersion: '0.1.3' };
    const oldResponse = { ...sampleFormResponse, definitionVersion: oldKey.formVersion };
    const { fetch, requests } = recordingFetch(request => {
      if (request.url.endsWith('/sessions/anonymous')) return jsonResponse(grant);
      if (request.method === 'POST') return jsonResponse({ draft_id: 'old-version-draft', draft_version: 1 });
      return jsonResponse({ draft_id: 'old-version-draft', draft_version: 2,
        draft_state: oldResponse.data, canonical_response: oldResponse });
    });
    const build = () => {
      const config = { ...context, fetchImpl: fetch,
        resumeMetadata: createBrowserDraftResumeMetadataStore(context, storage) };
      return createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    };
    await build().draftStore.save(oldKey, oldResponse);
    const retained = [...storage.values];
    await expect(build().draftStore.load(currentKey)).rejects.toThrow(/another form version/);
    await expect(build().draftStore.save(currentKey, { ...oldResponse, definitionVersion: '0.1.3' }))
      .rejects.toThrow(/another form version/);
    expect(requests).toHaveLength(2);
    expect([...storage.values]).toEqual(retained);
    await expect(build().draftStore.load(oldKey)).resolves.toEqual(oldResponse);
    await build().draftStore.delete(currentKey);
    expect(storage.values.size).toBe(0);
    await expect(build().draftStore.load(currentKey)).resolves.toBeUndefined();
  });

  it('keeps conflicting-version checks separate for each subject and party', async () => {
    const storage = tabStorage();
    const oldKey = { ...key, formVersion: '0.1.2', subjectRef: 'anon:owner', partyRef: 'applicant' };
    const oldResponse = { ...sampleFormResponse, definitionVersion: oldKey.formVersion };
    const { fetch, requests } = recordingFetch(request => request.url.endsWith('/sessions/anonymous')
      ? jsonResponse(grant) : jsonResponse({ draft_id: 'applicant-draft', draft_version: 1 }));
    const config = { ...context, fetchImpl: fetch,
      resumeMetadata: createBrowserDraftResumeMetadataStore(context, storage) };
    await createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) })
      .draftStore.save(oldKey, oldResponse);
    const resumed = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    await expect(resumed.draftStore.load({ ...oldKey, formVersion: '0.1.3', partyRef: 'preparer' }))
      .resolves.toBeUndefined();
    await expect(resumed.draftStore.load({ ...oldKey, formVersion: '0.1.3', subjectRef: 'anon:other' }))
      .resolves.toBeUndefined();
    await expect(resumed.draftStore.load({ ...oldKey, formVersion: '0.1.3' }))
      .rejects.toThrow(/another form version/);
    expect(requests).toHaveLength(2);
  });

  it('clears conflicting version handles only for the same resolved form, subject and party', () => {
    const resumeMetadata = createBrowserDraftResumeMetadataStore(context, tabStorage());
    const resolveFormId = () => 'server-form-id';
    const first = createDraftBindingRegistry({ resumeMetadata, formIdResolver: resolveFormId });
    const applicant = { formUrl: 'urn:package:old', formVersion: '0.1.2', partyRef: 'applicant' };
    const preparer = { ...applicant, partyRef: 'preparer' };
    first.put(applicant, { draftId: 'applicant-draft', draftVersion: 1 });
    first.put(preparer, { draftId: 'preparer-draft', draftVersion: 2 });
    const resumed = createDraftBindingRegistry({ resumeMetadata, formIdResolver: resolveFormId });
    const current = { ...applicant, formUrl: 'urn:package:current', formVersion: '0.1.3' };
    expect(() => resumed.get(current)).toThrow(/another form version/);
    resumed.delete(current);
    const fresh = createDraftBindingRegistry({ resumeMetadata, formIdResolver: resolveFormId });
    expect(fresh.get(current)).toBeUndefined();
    expect(fresh.get(preparer)).toEqual({ draftId: 'preparer-draft', draftVersion: 2 });
  });

  it('restores a new bridge and cohort with the same owner token, while server GET supplies the answers', async () => {
    const storage = tabStorage();
    const { fetch, requests } = recordingFetch(request => {
      if (request.url.endsWith('/sessions/anonymous')) return jsonResponse(grant);
      if (request.method === 'POST') return jsonResponse({ draft_id: 'server-draft', draft_version: 1 });
      return jsonResponse({ draft_id: 'server-draft', draft_version: 2,
        draft_state: sampleFormResponse.data, canonical_response: sampleFormResponse });
    });
    const build = () => {
      const resumeMetadata = createBrowserDraftResumeMetadataStore(context, storage);
      const config = { ...context, fetchImpl: fetch, resumeMetadata };
      const anonymousSessions = new AnonymousSessionBridge(config);
      return { bridge: anonymousSessions, ...createHttpAdapterCohort({ ...config, anonymousSessions }) };
    };
    await build().draftStore.save(key, sampleFormResponse);
    const persisted = [...storage.values.values()].join('');
    expect(persisted).not.toContain('canonical_response');
    expect(persisted).not.toContain('definitionVersion');
    expect(persisted).not.toContain(JSON.stringify(sampleFormResponse.data));
    const resumed = build();
    await expect(resumed.draftStore.load(key)).resolves.toEqual(sampleFormResponse);
    expect(requests.filter(request => request.url.endsWith('/sessions/anonymous'))).toHaveLength(1);
    expect(requests.at(-1)?.headers.get('authorization')).toBe('Bearer server-owner-token');
    await resumed.draftStore.delete(key);
    expect(storage.values.size).toBe(0);
    await expect(build().draftStore.load(key)).resolves.toBeUndefined();
  });

  it('refuses an expired retained owner or a locator without its grant instead of issuing another subject', async () => {
    const storage = tabStorage();
    const { fetch, requests } = recordingFetch(request => request.url.endsWith('/sessions/anonymous')
      ? jsonResponse(grant) : jsonResponse({ draft_id: 'server-draft', draft_version: 1 }));
    const metadata = createBrowserDraftResumeMetadataStore(context, storage);
    const config = { ...context, fetchImpl: fetch, resumeMetadata: metadata };
    const first = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    await first.draftStore.save(key, sampleFormResponse);
    metadata.write('grant:conformance', { sessionId: 'session', sessionToken: grant.session_token,
      subjectRef: grant.subject_ref, formId: grant.form_id, expiresAt: '2000-01-01T00:00:00Z' });
    const expired = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    await expect(expired.draftStore.load(key)).rejects.toThrow(/expiration/);
    metadata.remove('grant:conformance');
    const missing = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    await expect(missing.draftStore.load(key)).rejects.toThrow(/no anonymous owner grant/);
    await expect(missing.submitTransport.submit({ ...sampleIntakeHandoff,
      definitionRef: { url: key.formUrl, version: key.formVersion }, subjectRef: undefined,
    }, generateIdempotencyKey())).rejects.toThrow(/no anonymous owner grant/);
    expect(requests).toHaveLength(2);
  });

  it('isolates all deployment scope fields and rejects copied metadata context', () => {
    const storage = tabStorage();
    const original = createBrowserDraftResumeMetadataStore(context, storage);
    original.write('grant:form', { token: 'secret' });
    for (const field of ['tenant', 'workspace', 'environment', 'cell'] as const) {
      const changed = { ...context, tenantBinding: { ...context.tenantBinding,
        scope: { ...context.tenantBinding.scope, [field]: 'other' } } };
      expect(createBrowserDraftResumeMetadataStore(changed, storage).read('grant:form')).toBeUndefined();
    }
    expect(createBrowserDraftResumeMetadataStore({ ...context, baseUrl: 'https://other.example.test/api' }, storage).read('grant:form')).toBeUndefined();
    const [storedKey, raw] = [...storage.values][0];
    storage.values.set(storedKey, raw.replace('"slot":"grant:form"', '"slot":"different"'));
    expect(() => original.read('grant:form')).toThrow(/unavailable or invalid/);
  });

  it('reports unavailable tab storage before issuing a session', async () => {
    const fetch = vi.fn();
    const storage = { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} };
    const bridge = new AnonymousSessionBridge({ ...context, fetchImpl: fetch,
      resumeMetadata: createBrowserDraftResumeMetadataStore(context, storage) });
    await expect(bridge.sessionForForm(key.formUrl)).rejects.toThrow(/storage is unavailable/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses malformed grants and handles before making an owner request', async () => {
    const storage = tabStorage();
    const resumeMetadata = createBrowserDraftResumeMetadataStore(context, storage);
    const fetch = vi.fn();
    const config = { ...context, fetchImpl: fetch, resumeMetadata };
    resumeMetadata.write('grant:conformance', { sessionId: 'session', sessionToken: 'token',
      subjectRef: 'anon:owner', formId: 'another-form', expiresAt: grant.expires_at });
    await expect(new AnonymousSessionBridge(config).sessionForForm(key.formUrl)).rejects.toThrow(/bound to another form/);
    resumeMetadata.write('draft-handles', [{ key, draftId: 'draft', draftVersion: 1, formId: 'another-form' }]);
    const cohort = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    await expect(cohort.draftStore.load(key)).rejects.toThrow(/does not match its form context/);
    expect(fetch).not.toHaveBeenCalled();
    await cohort.draftStore.delete(key);
    expect(storage.values.size).toBe(0);
  });

  it('fences late grant issuance during clear so credentials cannot reappear', async () => {
    const storage = tabStorage();
    let release!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    const bridge = new AnonymousSessionBridge({ ...context, fetchImpl: fetch,
      resumeMetadata: createBrowserDraftResumeMetadataStore(context, storage) });
    const issuance = bridge.sessionForForm(key.formUrl);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const cleared = bridge.clearForForm(key.formUrl);
    release(jsonResponse(grant));
    await expect(issuance).rejects.toThrow(/cleared/);
    await cleared;
    expect(storage.values.size).toBe(0);
  });

  it('drains a pending draft save before removing handles and credentials', async () => {
    const storage = tabStorage();
    let release!: (response: Response) => void;
    const { fetch, requests } = recordingFetch(request => request.url.endsWith('/sessions/anonymous')
      ? jsonResponse(grant) : new Promise<Response>(resolve => { release = resolve; }));
    const resumeMetadata = createBrowserDraftResumeMetadataStore(context, storage);
    const config = { ...context, fetchImpl: fetch, resumeMetadata };
    const cohort = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    const saved = cohort.draftStore.save(key, sampleFormResponse);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    const cleared = cohort.draftStore.delete(key);
    await expect(cohort.draftStore.save(key, sampleFormResponse)).rejects.toThrow(/being cleared/);
    release(jsonResponse({ draft_id: 'server-draft', draft_version: 1 }));
    await saved;
    await cleared;
    expect(storage.values.size).toBe(0);
    const reloaded = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    await expect(reloaded.draftStore.load(key)).resolves.toBeUndefined();
  });

  it('refuses a late server GET completion after clear instead of repopulating handles', async () => {
    const storage = tabStorage();
    let release!: (response: Response) => void;
    const { fetch, requests } = recordingFetch(request => {
      if (request.url.endsWith('/sessions/anonymous')) return jsonResponse(grant);
      if (request.method === 'POST') return jsonResponse({ draft_id: 'server-draft', draft_version: 1 });
      return new Promise<Response>(resolve => { release = resolve; });
    });
    const resumeMetadata = createBrowserDraftResumeMetadataStore(context, storage);
    const config = { ...context, fetchImpl: fetch, resumeMetadata };
    const cohort = createHttpAdapterCohort({ ...config, anonymousSessions: new AnonymousSessionBridge(config) });
    await cohort.draftStore.save(key, sampleFormResponse);
    const loaded = cohort.draftStore.load(key);
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    await cohort.draftStore.delete(key);
    release(jsonResponse({ draft_id: 'server-draft', draft_version: 1,
      draft_state: sampleFormResponse.data, canonical_response: sampleFormResponse }));
    await expect(loaded).rejects.toThrow(/cleared while loading/);
    expect(storage.values.size).toBe(0);
  });
});
