import { HttpDraftStore } from '../../../src/adapters/http/index.ts';
import type { FormResponse } from '../../../src/ports/draft-store.ts';
import { stubDraftStore } from '../../../src/adapters/stub/draft-store.ts';
import { jsonResponse, problemResponse, recordingFetch } from '../../adapters/http/test-fetch.ts';
import { defineDraftStoreConformance } from '../_framework/conformance.ts';

defineDraftStoreConformance('stub DraftStore conformance', () => ({
  adapter: stubDraftStore(),
}));

defineDraftStoreConformance('HTTP DraftStore conformance', () => {
  const drafts = new Map<string, { draftVersion: number; response: FormResponse; data: Record<string, unknown> }>();
  let draftCounter = 0;
  const { fetch } = recordingFetch((request) => {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && /\/runtime\/forms\/[^/]+\/drafts$/.test(path)) {
      draftCounter += 1;
      const draftId = `draft-http-${draftCounter}`;
      const body = request.body as { canonical_response: FormResponse; draft_state: Record<string, unknown> };
      drafts.set(draftId, { draftVersion: 1, response: structuredClone(body.canonical_response), data: structuredClone(body.draft_state) });
      return jsonResponse({ draft_id: draftId, draft_version: 1 });
    }
    const draftId = path.split('/').at(-1) ?? '';
    const draft = drafts.get(draftId);
    if (!draft) {
      return problemResponse(404, 'draft not found');
    }
    if (request.method === 'PATCH') {
      const body = request.body as { canonical_response: FormResponse; draft_state: Record<string, unknown> };
      draft.draftVersion += 1;
      draft.response = structuredClone(body.canonical_response); draft.data = structuredClone(body.draft_state);
    }
    return jsonResponse({ draft_id: draftId, draft_version: draft.draftVersion,
      canonical_response: draft.response, draft_state: draft.data });
  });
  return {
    adapter: new HttpDraftStore({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    }),
  };
});
