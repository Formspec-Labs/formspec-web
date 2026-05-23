import { describe, expect, it } from 'vitest';
import { HttpSubmitTransport } from '../../../src/adapters/http/submit-transport.ts';
import {
  sampleFormResponse,
  sampleIntakeHandoff,
} from '../../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../../src/shared/idempotency-key.ts';
import { idempotencyKey, jsonResponse, recordingFetch } from './test-fetch.ts';

describe('HttpSubmitTransport', () => {
  it('submits through POST /drafts/{draft_id}/submit with server idempotency header', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({ response_id: `response-${requests.length}`, status: 'accepted' }),
    );
    const adapter = new HttpSubmitTransport({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      draftIdResolver: () => 'draft-http-1',
      responseDataResolver: () => ({ fullName: 'Ada Lovelace' }),
      anonymousSessionToken: 'session-token',
      signingRequested: true,
    });
    const key = generateIdempotencyKey();

    await expect(adapter.submit(sampleIntakeHandoff, key)).resolves.toMatchObject({
      referenceNumber: 'response-1',
      status: 'accepted',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toBe(
      'https://formspec-server.example.test/drafts/draft-http-1/submit',
    );
    expect(idempotencyKey(requests[0])).toBe(key);
    expect(requests[0]?.body).toMatchObject({
      response_data: { fullName: 'Ada Lovelace' },
      anonymous_session_token: 'session-token',
      signing_requested: true,
    });
  });

  it('uses response data carried by the handoff when no resolver override is supplied', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({ response_id: 'response-from-handoff', status: 'accepted' }),
    );
    const adapter = new HttpSubmitTransport({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      draftIdResolver: () => 'draft-http-1',
    });
    const handoff = {
      ...sampleIntakeHandoff,
      extensions: {
        'x-formspec-response': sampleFormResponse,
      },
    };

    await expect(adapter.submit(handoff, generateIdempotencyKey())).resolves.toMatchObject({
      referenceNumber: 'response-from-handoff',
      status: 'accepted',
    });
    expect(requests[0]?.body).toMatchObject({
      response_data: sampleFormResponse.data,
    });
  });

  it('replays the same confirmation locally for retried idempotency keys', async () => {
    const { fetch, requests } = recordingFetch((request) =>
      jsonResponse({ response_id: `response-${idempotencyKey(request)}`, status: 'accepted' }),
    );
    const adapter = new HttpSubmitTransport({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      draftIdResolver: () => 'draft-http-1',
    });
    const key = generateIdempotencyKey();

    const first = await adapter.submit(sampleIntakeHandoff, key);
    const second = await adapter.submit(sampleIntakeHandoff, key);
    expect(second).toEqual(first);
    expect(requests).toHaveLength(1);
  });

  it('coalesces concurrent submissions with the same idempotency key', async () => {
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const { fetch, requests } = recordingFetch(async () => {
      await responseGate;
      return jsonResponse({ response_id: 'response-concurrent', status: 'accepted' });
    });
    const adapter = new HttpSubmitTransport({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
      draftIdResolver: () => 'draft-http-1',
    });
    const key = generateIdempotencyKey();

    const first = adapter.submit(sampleIntakeHandoff, key);
    const second = adapter.submit(sampleIntakeHandoff, key);
    await waitForRequests(requests, 1);
    expect(requests).toHaveLength(1);

    releaseResponse?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { referenceNumber: 'response-concurrent', status: 'accepted' },
      { referenceNumber: 'response-concurrent', status: 'accepted' },
    ]);
    expect(requests).toHaveLength(1);
  });
});

async function waitForRequests(requests: unknown[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (requests.length >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
