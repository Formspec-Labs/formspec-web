import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/shared/problem-json.ts', () => {
  throw new Error('problem-json chunk failed to load');
});

describe('HttpClient when Problem JSON admission cannot load', () => {
  it('still refuses with the HTTP status and no problem details', async () => {
    const { HttpAdapterError, HttpClient } = await import('../../../src/adapters/http/http-client.ts');
    const body = { type: 'about:blank', title: 'not-found', status: 404, error_code: 'FORMSPEC-4040' };
    const client = new HttpClient({
      baseUrl: 'https://source.example',
      fetchImpl: async () => new Response(JSON.stringify(body), { status: 404, statusText: 'Not Found',
        headers: { 'content-type': 'application/problem+json' } }),
    });
    const error = await client.getJson('/drafts/d').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpAdapterError);
    expect(error).toMatchObject({ status: 404, problem: undefined, message: 'Not Found', responseBody: body });
  });
});
