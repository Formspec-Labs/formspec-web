import { describe, expect, it } from 'vitest';
import { HttpClient } from '../../../src/adapters/http/http-client.ts';
const headers = { 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
describe('selected protected-object byte transport', () => {
  it('preserves non-UTF8 bytes and sends JSON selectors with the selected bearer', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0, 0x80]); let init: RequestInit | undefined;
    const client = new HttpClient({ baseUrl: 'https://source.example', accessToken: async () => 'selected-bearer',
      fetchImpl: async (_url, options) => { init = options; return new Response(bytes, { headers }); } });
    const selector = { version: 1, objectKey: 'selected-key' };
    const actual = await client.postJsonForBytes('/drafts/draft/evaluation-instances/proof-object', selector, { maxResponseBytes: 4, timeoutMs: 1000 });
    expect(actual).toEqual(bytes);
    expect(init?.method).toBe('POST'); expect(init?.redirect).toBe('error'); expect(init?.body).toBe(JSON.stringify(selector));
    expect(new Headers(init?.headers).get('accept')).toBe('application/octet-stream');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer selected-bearer');
  });
  it('enforces cap, content type, no-store and nosniff', async () => {
    const cases = [
      new Response(new Uint8Array([1, 2]), { headers }),
      new Response(new Uint8Array([1]), { headers: { ...headers, 'content-type': 'text/plain' } }),
      new Response(new Uint8Array([1]), { headers: { ...headers, 'cache-control': 'private' } }),
      new Response(new Uint8Array([1]), { headers: { ...headers, 'x-content-type-options': '' } }),
    ];
    for (const response of cases) {
      const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: async () => response });
      await expect(client.postJsonForBytes('/proof-object', {}, { maxResponseBytes: 1 })).rejects.toThrow();
    }
  });
  it('refuses missing caps before credentials or transport', async () => {
    let called = false;
    const client = new HttpClient({ baseUrl: 'https://source.example', accessToken: () => { called = true; return 'bearer'; },
      fetchImpl: async () => { called = true; return new Response(); } });
    await expect(client.postJsonForBytes('/proof-object', {}, {})).rejects.toThrow('admitted byte limit');
    expect(called).toBe(false);
  });
  it('fences cancellation during asynchronous credential resolution before dispatch', async () => {
    const controller = new AbortController(); let release!: (value: string) => void; let called = false;
    const client = new HttpClient({ baseUrl: 'https://source.example', accessToken: () => new Promise(resolve => { release = resolve; }),
      fetchImpl: async () => { called = true; return new Response(new Uint8Array([1]), { headers }); } });
    const pending = client.postJsonForBytes('/proof-object', {}, { maxResponseBytes: 1, signal: controller.signal });
    controller.abort(); release('bearer'); await expect(pending).rejects.toThrow(); expect(called).toBe(false);
  });
});
