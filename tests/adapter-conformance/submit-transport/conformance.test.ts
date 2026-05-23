import { HttpSubmitTransport } from '../../../src/adapters/http/index.ts';
import { stubSubmitTransport } from '../../../src/adapters/stub/submit-transport.ts';
import { idempotencyKey, jsonResponse, recordingFetch } from '../../adapters/http/test-fetch.ts';
import { defineSubmitTransportConformance } from '../_framework/conformance.ts';

defineSubmitTransportConformance('stub SubmitTransport conformance', () => ({
  adapter: stubSubmitTransport(),
}));

defineSubmitTransportConformance('HTTP SubmitTransport conformance', () => {
  const replay = new Map<string, string>();
  let counter = 0;
  const { fetch } = recordingFetch((request) => {
    const key = idempotencyKey(request);
    if (!key) {
      return jsonResponse({ title: 'idempotency_key_required' }, 400);
    }
    const responseId =
      replay.get(key) ??
      (() => {
        counter += 1;
        const next = `response-http-${counter}`;
        replay.set(key, next);
        return next;
      })();
    return jsonResponse({ response_id: responseId, status: 'accepted' });
  });
  return {
    adapter: new HttpSubmitTransport({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      draftIdResolver: () => 'draft-http-conformance',
    }),
  };
});
