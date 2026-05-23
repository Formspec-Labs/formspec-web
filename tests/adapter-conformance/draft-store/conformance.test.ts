import { HttpDraftStore } from '../../../src/adapters/http/index.ts';
import { stubDraftStore } from '../../../src/adapters/stub/draft-store.ts';
import { jsonResponse, problemResponse, recordingFetch } from '../../adapters/http/test-fetch.ts';
import { defineDraftStoreConformance } from '../_framework/conformance.ts';

defineDraftStoreConformance('stub DraftStore conformance', () => ({
  adapter: stubDraftStore(),
}));

defineDraftStoreConformance('HTTP DraftStore conformance', () => {
  const drafts = new Map<string, { draftVersion: number }>();
  let draftCounter = 0;
  const { fetch } = recordingFetch((request) => {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && /\/runtime\/forms\/[^/]+\/drafts$/.test(path)) {
      draftCounter += 1;
      const draftId = `draft-http-${draftCounter}`;
      drafts.set(draftId, { draftVersion: 1 });
      return jsonResponse({ draft_id: draftId, draft_version: 1 });
    }
    const draftId = path.split('/').at(-1) ?? '';
    const draft = drafts.get(draftId);
    if (!draft) {
      return problemResponse(404, 'draft not found');
    }
    if (request.method === 'PATCH') {
      draft.draftVersion += 1;
    }
    return jsonResponse({ draft_id: draftId, draft_version: draft.draftVersion });
  });
  return {
    adapter: new HttpDraftStore({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    }),
  };
});
