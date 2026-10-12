import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../src/adapters/http/http-client.ts';

describe('bounded raw JSON response evidence', () => {
  it('preserves original duplicate members, unsafe integer text and whitespace beside parsed diagnostics', async () => {
    const original = ' {"value":1,"value":2,"large":9007199254740993} \n';
    const client = new HttpClient({ baseUrl: 'https://source.test', fetchImpl: async () => new Response(original,
      { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }) });
    const response = await client.postJsonWithBytes<Record<string, unknown>>('/proof', {},
      { maxResponseBytes: 1024, requireNoStore: true, successStatuses: [200] });
    expect(response.utf8Bytes).toEqual(new TextEncoder().encode(original));
    expect(response.value.value).toBe(2);
    // Only the preserved bytes can be submitted to owning duplicate-member/number parsing.
    expect(new TextDecoder().decode(response.utf8Bytes)).toContain('9007199254740993');
  });

  it('requires a byte cap before acquiring credentials or dispatching', async () => {
    const token = vi.fn(() => 'current-owner');
    const fetch = vi.fn(() => { throw new Error('must not dispatch'); });
    const client = new HttpClient({ baseUrl: 'https://source.test', accessToken: token, fetchImpl: fetch });
    await expect(client.postJsonWithBytes('/proof', {}, {})).rejects.toThrow('admitted byte limit');
    expect(token).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains the existing parsed-only API result', async () => {
    const client = new HttpClient({ baseUrl: 'https://source.test', fetchImpl: async () => new Response('{"answer":false}',
      { headers: { 'content-type': 'application/json' } }) });
    await expect(client.postJson('/existing', {}, { maxResponseBytes: 1024 })).resolves.toEqual({ answer: false });
  });
});
