import { describe, expect, it, vi } from 'vitest';
import { HttpDraftStore } from '../../../src/adapters/http/draft-store.ts';
import { createDraftBindingRegistry } from '../../../src/adapters/http/draft-binding-registry.ts';
import {
  sampleFormDefinition,
  sampleFormResponse,
} from '../../../src/adapter-conformance/fixtures.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';

describe('HttpDraftStore', () => {
  it('saves, verifies, and updates initialized drafts through the formspec-server routes', async () => {
    let draftVersion = 1;
    let canonicalResponse = sampleFormResponse;
    const { fetch, requests } = recordingFetch((request) => {
      if (
        request.method === 'POST' &&
        request.url.endsWith('/runtime/forms/conformance/drafts')
      ) {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion, canonical_response: canonicalResponse, draft_state: canonicalResponse.data });
      }
      if (request.method === 'GET' && request.url.endsWith('/drafts/draft-http-1')) {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion, canonical_response: canonicalResponse, draft_state: canonicalResponse.data });
      }
      if (request.method === 'PATCH' && request.url.endsWith('/drafts/draft-http-1')) {
        draftVersion += 1;
        canonicalResponse = (request.body as { canonical_response: typeof sampleFormResponse }).canonical_response;
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion, canonical_response: canonicalResponse, draft_state: canonicalResponse.data });
      }
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const adapter = new HttpDraftStore({ bindingRegistry: retainedRegistry(),
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };

    await adapter.save(key, sampleFormResponse);
    await expect(adapter.load(key)).resolves.toEqual(sampleFormResponse);
    await adapter.save(key, { ...sampleFormResponse, data: { fullName: 'Grace Hopper' } });

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([
        'PATCH /drafts/draft-http-1',
        'GET /drafts/draft-http-1',
        'PATCH /drafts/draft-http-1',
      ]);
    expect(requests[0]?.body).toMatchObject({
      draft_state: sampleFormResponse.data,
      canonical_response: sampleFormResponse,
    });
    expect(requests[2]?.body).toMatchObject({
      draft_state: { fullName: 'Grace Hopper' },
      canonical_response: { ...sampleFormResponse, data: { fullName: 'Grace Hopper' } },
      expected_draft_version: 2,
    });
  });

  it('soft-deletes local draft mappings because formspec-server has no DELETE route', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({ draft_id: 'draft-http-1', draft_version: 1, canonical_response: sampleFormResponse, draft_state: sampleFormResponse.data }),
    );
    const adapter = new HttpDraftStore({ bindingRegistry: retainedRegistry(),
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };

    await adapter.save(key, sampleFormResponse);
    await adapter.delete(key);
    await expect(adapter.load(key)).resolves.toBeUndefined();
    expect(requests.map((request) => request.method)).toEqual(['PATCH']);
  });

  it('authenticates anonymous create, read, and repeated save without creating another draft', async () => {
    let canonicalResponse = sampleFormResponse;
    let draftVersion = 1;
    const { fetch, requests } = recordingFetch((request) => {
      if (
        request.method === 'POST' &&
        request.url.endsWith('/runtime/forms/conformance/drafts')
      ) {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion, canonical_response: canonicalResponse, draft_state: canonicalResponse.data });
      }
      if (request.method === 'PATCH' && request.url.endsWith('/drafts/draft-http-1')) {
        canonicalResponse = (request.body as { canonical_response: typeof sampleFormResponse }).canonical_response;
        draftVersion += 1;
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion, canonical_response: canonicalResponse, draft_state: canonicalResponse.data });
      }
      if (request.method === 'GET' && request.url.endsWith('/drafts/draft-http-1')) {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion, canonical_response: canonicalResponse, draft_state: canonicalResponse.data });
      }
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const adapter = new HttpDraftStore({ bindingRegistry: retainedRegistry(),
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      anonymousSessionToken: 'anonymous-token-1',
    });
    const key = {
      formUrl: sampleFormDefinition.url,
      formVersion: '1.0.0',
      subjectRef: 'anon:server-subject',
    };

    await adapter.save(key, sampleFormResponse);
    await adapter.save(key, { ...sampleFormResponse, data: { fullName: 'Grace Hopper' } });
    await expect(adapter.load(key)).resolves.toMatchObject({
      data: { fullName: 'Grace Hopper' },
    });

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([
        'PATCH /drafts/draft-http-1',
        'PATCH /drafts/draft-http-1',
        'GET /drafts/draft-http-1',
      ]);
    expect(requests[0]?.body).toMatchObject({
      expected_draft_version: 1,
    });
    expect(requests[1]?.body).toMatchObject({
      draft_state: { fullName: 'Grace Hopper' },
      canonical_response: { ...sampleFormResponse, data: { fullName: 'Grace Hopper' } },
      expected_draft_version: 2,
    });
    expect(requests.map(request => request.headers.get('authorization'))).toEqual([
      'Bearer anonymous-token-1',
      'Bearer anonymous-token-1',
      'Bearer anonymous-token-1',
    ]);
  });

  it('restores the server snapshot and uses its current version for the next save', async () => {
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };
    const serverResponse = {
      ...sampleFormResponse,
      status: 'in-progress' as const,
      authored: '2026-10-06T12:00:00.000Z',
      data: { fullName: 'Server corrected name' },
      displayedLocale: { locale: 'es', version: '2.0.0', url: 'https://example.test/locales/es' },
    };
    const bindingRegistry = createDraftBindingRegistry();
    const { fetch, requests } = recordingFetch(request => {
      if (request.method === 'POST') {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: 1, canonical_response: sampleFormResponse, draft_state: sampleFormResponse.data });
      }
      return jsonResponse({ draft_id: 'draft-http-1', draft_version: 7, canonical_response: serverResponse, draft_state: serverResponse.data });
    });
    const adapter = new HttpDraftStore({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch, bindingRegistry });

    bindingRegistry.put(key, { draftId: 'draft-http-1', draftVersion: 1, response: sampleFormResponse });
    await adapter.save(key, sampleFormResponse);
    await expect(adapter.load(key)).resolves.toEqual(serverResponse);
    expect(bindingRegistry.get(key)).toMatchObject({ draftVersion: 7, response: serverResponse });
    await adapter.save(key, serverResponse);

    expect(requests[2]?.method).toBe('PATCH');
    expect(requests[2]?.body).toMatchObject({ expected_draft_version: 7, canonical_response: serverResponse, draft_state: serverResponse.data });
  });

  it('sends the complete saved Response without replacing its locale pin or authored timestamp', async () => {
    const response = {
      ...sampleFormResponse,
      id: 'response-exact-snapshot',
      displayedLocale: { locale: 'es', version: '3.0.0', url: 'https://example.test/locales/es' },
      displayedIssuer: { url: 'https://example.test/issuer', version: '1.0.0' },
    };
    const { fetch, requests } = recordingFetch(() => jsonResponse({ draft_id: 'draft-http-1', draft_version: 1, canonical_response: response, draft_state: response.data }));
    const adapter = new HttpDraftStore({ bindingRegistry: retainedRegistry(), baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch });
    await adapter.save({ formUrl: response.definitionUrl, formVersion: response.definitionVersion, subjectRef: 'S-1' }, response);
    expect((requests[0]?.body as { canonical_response: unknown }).canonical_response).toEqual(response);
  });

  it.each([
    ['wrong returned draft identity', { draft_id: 'other-draft', canonical_response: sampleFormResponse, draft_state: sampleFormResponse.data }],
    ['absent canonical snapshot', { draft_state: sampleFormResponse.data }],
    ['null canonical snapshot', { canonical_response: null, draft_state: sampleFormResponse.data }],
    ['answers presented as a canonical Response', { canonical_response: sampleFormResponse.data, draft_state: sampleFormResponse.data }],
    ['wrong Response marker', { canonical_response: { ...sampleFormResponse, $formspecResponse: '9.0' }, draft_state: sampleFormResponse.data }],
    ['missing authored timestamp', { canonical_response: { ...sampleFormResponse, authored: undefined }, draft_state: sampleFormResponse.data }],
    ['missing Response status', { canonical_response: { ...sampleFormResponse, status: undefined }, draft_state: sampleFormResponse.data }],
    ['array instead of Response data object', { canonical_response: { ...sampleFormResponse, data: ['Ada Lovelace'] }, draft_state: ['Ada Lovelace'] }],
    ['wrong Definition URL', { canonical_response: { ...sampleFormResponse, definitionUrl: 'https://other.example.test/form' }, draft_state: sampleFormResponse.data }],
    ['wrong Definition version', { canonical_response: { ...sampleFormResponse, definitionVersion: '9.0.0' }, draft_state: sampleFormResponse.data }],
    ['inconsistent compatibility answers', { canonical_response: sampleFormResponse, draft_state: { fullName: 'Conflicting server answers' } }],
  ])('refuses %s rather than returning the cached Response', async (_name, invalidView) => {
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };
    const bindingRegistry = createDraftBindingRegistry();
    bindingRegistry.put(key, { draftId: 'draft-http-1', draftVersion: 1, response: sampleFormResponse });
    const { fetch } = recordingFetch(() => jsonResponse({ draft_id: 'draft-http-1', draft_version: 2, ...invalidView }));
    const adapter = new HttpDraftStore({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch, bindingRegistry });

    await expect(adapter.load(key)).rejects.toThrow();
    expect(bindingRegistry.get(key)).toMatchObject({ draftVersion: 1, response: sampleFormResponse });
  });

  it.each([undefined, -1, 1.5])('refuses an unusable server draft version %s', async draftVersion => {
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };
    const bindingRegistry = createDraftBindingRegistry();
    bindingRegistry.put(key, { draftId: 'draft-http-1', draftVersion: 1, response: sampleFormResponse });
    const { fetch } = recordingFetch(() => jsonResponse({
      draft_id: 'draft-http-1', draft_version: draftVersion,
      canonical_response: sampleFormResponse, draft_state: sampleFormResponse.data,
    }));
    const adapter = new HttpDraftStore({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch, bindingRegistry });
    await expect(adapter.load(key)).rejects.toThrow();
    expect(bindingRegistry.get(key)?.draftVersion).toBe(1);
  });

  it('compares compatibility answers structurally regardless of object property order', async () => {
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };
    const response = { ...sampleFormResponse, data: { fullName: 'Ada Lovelace', nested: { first: 1, second: 2 } } };
    const bindingRegistry = createDraftBindingRegistry();
    bindingRegistry.put(key, { draftId: 'draft-http-1', draftVersion: 1, response: sampleFormResponse });
    const { fetch } = recordingFetch(() => jsonResponse({
      draft_id: 'draft-http-1', draft_version: 2, canonical_response: response,
      draft_state: { nested: { second: 2, first: 1 }, fullName: 'Ada Lovelace' },
    }));
    const adapter = new HttpDraftStore({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch, bindingRegistry });
    await expect(adapter.load(key)).resolves.toEqual(response);
  });
});

describe('qualified explicit locator binding', () => {
  it('refuses a competing binding installed while owning qualification is pending', async () => {
    const registry = createDraftBindingRegistry(); const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version, subjectRef: 'owner' };
    const response = { ...sampleFormResponse, id: 'stable-response' };
    const { fetch } = recordingFetch(() => jsonResponse({ draft_id: 'selected', draft_version: 7,
      canonical_response: response, draft_state: response.data }));
    const adapter = new HttpDraftStore({ baseUrl: 'https://server.example.test', fetchImpl: fetch, bindingRegistry: registry,
      qualifyReadState: async () => { registry.put(key, { draftId: 'competing', draftVersion: 1 }); return { kind: 'active', response }; } });
    await expect(adapter.resumeState!(key, { draftId: 'selected', expectedResponseId: response.id })).rejects.toThrow('binding changed');
    expect(registry.get(key)?.draftId).toBe('competing');
  });
});


it('refuses an asynchronous direct adapter resume guard before credential resolution', async () => {
  const accessToken = vi.fn(async () => 'owned-token');
  const { fetch, requests } = recordingFetch(() => jsonResponse({}));
  const adapter = new HttpDraftStore({ bindingRegistry: retainedRegistry(), baseUrl: 'https://server.example.test', accessToken, fetchImpl: fetch,
    qualifyReadState: async () => ({ kind: 'active', response: sampleFormResponse }) });
  await expect(adapter.resumeState!({ formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version, subjectRef: 'owner' },
    { draftId: 'owned', expectedResponseId: 'response' }, async () => {})).rejects.toThrow('guard must be synchronous');
  expect(accessToken).not.toHaveBeenCalled(); expect(requests).toHaveLength(0);
});

describe('durable draft initialization (fs-7xqu / ADR 0168)', () => {
  const key = { formUrl: sampleFormDefinition.url, formVersion: sampleFormDefinition.version, subjectRef: 'S-1' };
  const empty = { draft_id: 'draft-server-minted-1', draft_version: 1, form_version_id: 'published-version',
    subject_ref: 'S-1', status: 'in_progress', canonical_response: null, draft_state: {}, is_initialization_only: true };

  it('initializes without constructing a Response, then PATCHes the first Save and reads current retry state', async () => {
    let current: Record<string, unknown> = { ...empty };
    const { fetch, requests } = recordingFetch(request => {
      if (request.method === 'PATCH') current = { ...empty, draft_version: 2, is_initialization_only: false,
        canonical_response: sampleFormResponse, draft_state: sampleFormResponse.data };
      return jsonResponse(current);
    });
    const adapter = new HttpDraftStore({ baseUrl: 'https://source.example.test', formVersionId: 'published-version', fetchImpl: fetch });
    await expect(adapter.initializeDraft(key)).resolves.toEqual({ draftId: empty.draft_id, isInitializationOnly: true });
    await adapter.save(key, sampleFormResponse);
    await expect(adapter.initializeDraft(key)).resolves.toEqual({ draftId: empty.draft_id, isInitializationOnly: false, response: sampleFormResponse });
    expect(requests.map(request => request.method)).toEqual(['POST', 'PATCH', 'POST']);
    expect(requests[0].body).toEqual({ form_version_id: 'published-version' });
    expect(requests[0].headers.get('Idempotency-Key')).toBeTruthy();
    expect(requests[2].headers.get('Idempotency-Key')).toBe(requests[0].headers.get('Idempotency-Key'));
    expect(requests[1].body).toMatchObject({ expected_draft_version: 1, canonical_response: sampleFormResponse });
  });

  it('retains the attempt key before an unknown outcome across fresh adapter and registry instances', async () => {
    const metadata = new Map<string, unknown>();
    const resumeMetadata = { read: (slot: string) => structuredClone(metadata.get(slot)),
      write: (slot: string, value: unknown) => { metadata.set(slot, structuredClone(value)); }, remove: (slot: string) => { metadata.delete(slot); } };
    const keys: (string | null)[] = [];
    let lost = true;
    const { fetch } = recordingFetch(request => { keys.push(request.headers.get('Idempotency-Key'));
      if (lost) { lost = false; throw new TypeError('connection lost after commit'); } return jsonResponse(empty); });
    const adapter = () => new HttpDraftStore({ baseUrl: 'https://source.example.test', formVersionId: 'published-version', fetchImpl: fetch,
      bindingRegistry: createDraftBindingRegistry({ resumeMetadata }) });
    await expect(adapter().initializeDraft(key)).rejects.toThrow('connection lost');
    await expect(adapter().initializeDraft(key)).resolves.toMatchObject({ draftId: empty.draft_id });
    expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
    expect(JSON.stringify([...metadata.values()])).not.toContain('canonical_response');
  });

  it('coalesces concurrent initialization requests and refuses a late retired-owner result', async () => {
    let complete!: (response: Response) => void;
    const { fetch, requests } = recordingFetch(() => new Promise<Response>(resolve => { complete = resolve; }));
    const registry = createDraftBindingRegistry();
    const adapter = new HttpDraftStore({ baseUrl: 'https://source.example.test', formVersionId: 'published-version', fetchImpl: fetch, bindingRegistry: registry });
    const first = adapter.initializeDraft(key), second = adapter.initializeDraft(key);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await adapter.retireSubject('S-1');
    complete(jsonResponse(empty));
    await expect(first).rejects.toThrow('retired'); await expect(second).rejects.toThrow('retired');
    expect(registry.get(key)).toBeUndefined();
  });

  it('fences retirement while trusted initialization ownership is resolving', async () => {
    let release!: (owner: string) => void;
    const fetch = vi.fn();
    const adapter = new HttpDraftStore({ baseUrl: 'https://source.test', formVersionId: 'published-version', fetchImpl: fetch,
      expectedInitializationOwner: () => new Promise<string>(resolve => { release = resolve; }) });
    const pending = adapter.initializeDraft(key);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await adapter.retireSubject('S-1'); release('S-1');
    await expect(pending).rejects.toThrow('retired'); expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses initialization when neither the trusted resolver nor caller supplies an owner', async () => {
    const fetch = vi.fn();
    const adapter = new HttpDraftStore({ baseUrl: 'https://source.test', formVersionId: 'published-version', fetchImpl: fetch });
    await expect(adapter.initializeDraft({ formUrl: key.formUrl, formVersion: key.formVersion })).rejects.toThrow('resolved owner');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps empty initialized identity available without hydrating an empty Response', async () => {
    const registry = createDraftBindingRegistry(); registry.put(key, { draftId: empty.draft_id, draftVersion: 1 });
    const { fetch } = recordingFetch(() => jsonResponse(empty));
    const adapter = new HttpDraftStore({ baseUrl: 'https://source.example.test', fetchImpl: fetch, bindingRegistry: registry });
    await expect(adapter.load(key)).resolves.toBeUndefined(); expect(registry.get(key)?.draftId).toBe(empty.draft_id);
  });

  it.each([{ is_initialization_only: undefined }, { subject_ref: 'foreign-owner' }, { form_version_id: 'foreign-version' },
    { draft_version: 2 }, { canonical_response: sampleFormResponse }, { status: 'submitted' }])('refuses malformed or foreign initialization %j', async change => {
    const { fetch } = recordingFetch(() => jsonResponse({ ...empty, ...change }));
    const registry = createDraftBindingRegistry();
    const adapter = new HttpDraftStore({ baseUrl: 'https://source.example.test', formVersionId: 'published-version', fetchImpl: fetch, bindingRegistry: registry });
    await expect(adapter.initializeDraft(key)).rejects.toThrow(); expect(registry.get(key)).toBeUndefined();
  });

  it('refuses Save before initialization instead of sending caller-selected identity', async () => {
    const { fetch, requests } = recordingFetch(() => jsonResponse(empty));
    const adapter = new HttpDraftStore({ baseUrl: 'https://source.example.test', fetchImpl: fetch });
    await expect(adapter.save(key, sampleFormResponse)).rejects.toThrow('initialized'); expect(requests).toHaveLength(0);
  });
});

function retainedRegistry() {
  const registry = createDraftBindingRegistry();
  for (const subjectRef of ['S-1', 'anon:server-subject']) registry.put({ formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef },
    { draftId: 'draft-http-1', draftVersion: 1, response: sampleFormResponse });
  return registry;
}
