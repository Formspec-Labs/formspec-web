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
      recordKind: 'response',
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

  it('preserves full canonical metadata and stable identity through a transport retry', async () => {
    const snapshot = { ...sampleFormResponse, id: 'stable-response-id', displayedLocale: { locale: 'es-US', version: '1.0.0', url: 'urn:locale:spanish' }, issuer: { id: 'issuer-1' } };
    const { fetch, requests } = recordingFetch(() => requests.length === 1
      ? jsonResponse({ title: 'temporary failure' }, 503)
      : jsonResponse({ response_id: snapshot.id, status: 'accepted' }));
    const adapter = new HttpSubmitTransport({ baseUrl: 'https://server.test', fetchImpl: fetch, draftIdResolver: () => 'draft-1', anonymousSessionToken: 'test-token' });
    const handoff = { ...sampleIntakeHandoff, extensions: { 'x-formspec-response': snapshot } };
    const key = generateIdempotencyKey();
    await expect(adapter.submit(handoff, key)).rejects.toMatchObject({ status: 503 });
    await expect(adapter.submit(handoff, key)).resolves.toMatchObject({ referenceNumber: snapshot.id });
    expect(requests[0]?.body).toEqual(requests[1]?.body);
    expect(requests[1]?.body).toMatchObject({ canonical_response: snapshot, response_id: snapshot.id, response_data: snapshot.data });
    expect(requests[1]?.headers.get('authorization')).toBe('Bearer test-token');
  });

  it('refuses changed canonical lifecycle values under a failed operation retry key', async () => {
    const { fetch, requests } = recordingFetch(() => jsonResponse({ title: 'failure' }, 503));
    const adapter = new HttpSubmitTransport({ baseUrl: 'https://server.test', fetchImpl: fetch, draftIdResolver: () => 'draft-1' });
    const key = generateIdempotencyKey();
    const handoff = { ...sampleIntakeHandoff, extensions: { 'x-formspec-response': { ...sampleFormResponse, id: 'stable-id' } } };
    await expect(adapter.submit(handoff, key)).rejects.toMatchObject({ status: 503 });
    await expect(adapter.submit({ ...handoff, extensions: { 'x-formspec-response': { ...handoff.extensions['x-formspec-response'], authored: '2026-05-23T00:00:00.000Z' } } }, key)).rejects.toThrow(/preserve the finalized/);
    expect(requests).toHaveLength(1);
  });

  it.each(['answers', 'identity'])('refuses a conflicting %s override for the full Response', async conflict => {
    const { fetch, requests } = recordingFetch(() => jsonResponse({ response_id: 'other', status: 'accepted' }));
    const adapter = new HttpSubmitTransport({ baseUrl: 'https://server.test', fetchImpl: fetch, draftIdResolver: () => 'draft-1',
      ...(conflict === 'answers' ? { responseDataResolver: () => ({ fullName: 'Other' }) } : { responseIdResolver: () => 'other' }),
    });
    await expect(adapter.submit({ ...sampleIntakeHandoff, extensions: { 'x-formspec-response': { ...sampleFormResponse, id: 'stable-id' } } }, generateIdempotencyKey())).rejects.toThrow(/conflicts/);
    expect(requests).toHaveLength(0);
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
      { recordKind: 'response', referenceNumber: 'response-concurrent', status: 'accepted' },
      { recordKind: 'response', referenceNumber: 'response-concurrent', status: 'accepted' },
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
