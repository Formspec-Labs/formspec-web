import { describe, expect, it } from 'vitest';
import { HttpDraftStore } from '../../../src/adapters/http/draft-store.ts';
import {
  sampleFormDefinition,
  sampleFormResponse,
} from '../../../src/adapter-conformance/fixtures.ts';
import { jsonResponse, recordingFetch } from './test-fetch.ts';

describe('HttpDraftStore', () => {
  it('creates, verifies, and updates drafts through the formspec-server routes', async () => {
    let draftVersion = 1;
    const { fetch, requests } = recordingFetch((request) => {
      if (
        request.method === 'POST' &&
        request.url.endsWith('/runtime/forms/conformance/drafts')
      ) {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion });
      }
      if (request.method === 'GET' && request.url.endsWith('/drafts/draft-http-1')) {
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion });
      }
      if (request.method === 'PATCH' && request.url.endsWith('/drafts/draft-http-1')) {
        draftVersion += 1;
        return jsonResponse({ draft_id: 'draft-http-1', draft_version: draftVersion });
      }
      return jsonResponse({ title: 'unexpected' }, 500);
    });
    const adapter = new HttpDraftStore({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };

    await adapter.save(key, sampleFormResponse);
    expect(adapter.draftIdFor(key)).toBe('draft-http-1');
    await expect(adapter.load(key)).resolves.toEqual(sampleFormResponse);
    await adapter.save(key, { ...sampleFormResponse, data: { fullName: 'Grace Hopper' } });

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`))
      .toEqual([
        'POST /runtime/forms/conformance/drafts',
        'GET /drafts/draft-http-1',
        'PATCH /drafts/draft-http-1',
      ]);
    expect(requests[0]?.body).toMatchObject({
      respondent_subject_ref: 'S-1',
      draft_state: sampleFormResponse.data,
    });
    expect(requests[2]?.body).toMatchObject({
      draft_state: { fullName: 'Grace Hopper' },
      expected_draft_version: 1,
    });
  });

  it('soft-deletes local draft mappings because formspec-server has no DELETE route', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({ draft_id: 'draft-http-1', draft_version: 1 }),
    );
    const adapter = new HttpDraftStore({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });
    const key = { formUrl: sampleFormDefinition.url, formVersion: '1.0.0', subjectRef: 'S-1' };

    await adapter.save(key, sampleFormResponse);
    await adapter.delete(key);
    await expect(adapter.load(key)).resolves.toBeUndefined();
    expect(requests.map((request) => request.method)).toEqual(['POST']);
  });
});
