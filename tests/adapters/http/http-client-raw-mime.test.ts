import { expect, it, vi } from 'vitest';
import { HttpClient, type RawByteRequestOptions } from '../../../src/adapters/http/http-client.ts';
const options: RawByteRequestOptions = { maxResponseBytes: 8 };
function response(mime = 'application/octet-stream', extra: Record<string, string> = {}) {
  return new Response(new Uint8Array([0, 255, 1]), { headers: {
    'content-type': mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', ...extra,
  } });
}
function client(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return new HttpClient({ baseUrl: 'https://owner.test', fetchImpl });
}
it('preserves octet-stream default and raw encoding', async () => {
  const fetch = vi.fn(async (_url, init) => { expect(new Headers(init?.headers).get('accept')).toBe('application/octet-stream'); return response(); });
  await expect(client(fetch).postJsonForBytes('/object', {}, options)).resolves.toEqual(new Uint8Array([0, 255, 1]));
  await expect(client(async () => response('image/png')).postJsonForBytes('/object', {}, options)).rejects.toThrow('admitted MIME');
});
it.each(['image/png', 'image/jpeg', 'application/pdf', 'text/csv'])('admits explicit retained %s bytes', async mime => {
  const fetch = vi.fn(async (_url, init) => { expect(new Headers(init?.headers).get('accept')).toBe(mime); return response(mime.toUpperCase() + '; charset=binary'); });
  await expect(client(fetch).postJsonForBytes('/object', {}, { ...options, successMimeTypes: [mime] })).resolves.toEqual(new Uint8Array([0, 255, 1]));
});
it.each([[], ['*/*'], ['image/*'], ['image/png; charset=binary'], ['IMAGE/PNG'], ['image/png\r\nx: bad']].map(successMimeTypes => ({ successMimeTypes })))('refuses malformed MIME selections before credentials or dispatch: $successMimeTypes', async ({ successMimeTypes }) => {
  const fetch = vi.fn(); const token = vi.fn();
  const c = new HttpClient({ baseUrl: 'https://owner.test', fetchImpl: fetch, accessToken: token });
  await expect(c.postJsonForBytes('/object', {}, { ...options, successMimeTypes })).rejects.toThrow('base MIME');
  expect(fetch).not.toHaveBeenCalled(); expect(token).not.toHaveBeenCalled();
});
it('snapshots caller MIME selection before asynchronous credentials', async () => {
  let release!: (value: string) => void;
  const types = ['image/png'];
  const c = new HttpClient({ baseUrl: 'https://owner.test', accessToken: () => new Promise<string>(resolve => { release = resolve; }),
    fetchImpl: async (_url, init) => { expect(new Headers(init?.headers).get('accept')).toBe('image/png'); return response('image/jpeg'); } });
  const pending = c.postJsonForBytes('/object', {}, { ...options, successMimeTypes: types });
  types[0] = 'image/jpeg'; release('test');
  await expect(pending).rejects.toThrow('admitted MIME');
});
it.each([['x-content-type-options', ''], ['cache-control', 'private']])('retains %s requirement', async (header, value) => {
  await expect(client(async () => response('image/png', { [header]: value })).postJsonForBytes('/object', {}, { ...options, successMimeTypes: ['image/png'] })).rejects.toThrow();
});
it('retains bounded reading and admitted status', async () => {
  await expect(client(async () => response('image/png')).postJsonForBytes('/object', {}, { maxResponseBytes: 2, successMimeTypes: ['image/png'] })).rejects.toThrow('byte limit');
  await expect(client(async () => response('image/png')).postJsonForBytes('/object', {}, { ...options, successStatuses: [201], successMimeTypes: ['image/png'] })).rejects.toMatchObject({ status: 200 });
});
it('retains structured JSON failure for a selected image success type', async () => {
  await expect(client(async () => new Response('{"title":"denied"}', { status: 403, headers: { 'content-type': 'application/problem+json' } }))
    .postJsonForBytes('/object', {}, { ...options, maxResponseBytes: 64, successMimeTypes: ['image/png'] })).rejects.toMatchObject({ status: 403, responseBody: { title: 'denied' } });
});
it('retains deadline and currentness before returning selected bytes', async () => {
  await expect(client(() => new Promise<Response>(() => {})).postJsonForBytes('/object', {}, { ...options, timeoutMs: 5, successMimeTypes: ['image/png'] })).rejects.toMatchObject({ name: 'TimeoutError' });
  let current = true;
  await expect(client(async () => { current = false; return response('image/png'); }).postJsonForBytes('/object', {}, { ...options, successMimeTypes: ['image/png'], assertCurrent() { if (!current) throw new Error('retired'); } })).rejects.toThrow('retired');
});
