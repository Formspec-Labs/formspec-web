import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../src/adapters/http/http-client.ts';
import { departmentAppProfile } from '../../../src/profiles/index.ts';
import { generateIdempotencyKey } from '../../../src/shared/idempotency-key.ts';
import { jsonResponse, problemResponse, recordingFetch } from './test-fetch.ts';

describe('HttpClient', () => {
  it('sends tenant headers, bearer token, and idempotency key', async () => {
    const token = 'token-1';
    const { fetch, requests } = recordingFetch(() => jsonResponse({ ok: true }));
    const client = new HttpClient({
      baseUrl: 'https://formspec-server.example.test/',
      tenantBinding: departmentAppProfile.tenantBinding,
      accessToken: () => token,
      fetchImpl: fetch,
    });
    const key = generateIdempotencyKey();
    await client.postJson('/drafts/draft-1/submit', { ok: true }, { idempotencyKey: key });

    expect(requests[0]?.url).toBe('https://formspec-server.example.test/drafts/draft-1/submit');
    expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(requests[0]?.headers.get('idempotency-key')).toBe(key);
    expect(requests[0]?.headers.get('x-formspec-tenant-id')).toBe('department-reference');
  });

  it('refuses redirect following for credentialed JSON requests', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      throw new TypeError('Redirect refused');
    });
    const client = new HttpClient({ baseUrl: 'https://formspec-server.example.test', accessToken: 'test-owner', fetchImpl: fetch });
    await expect(client.postJson('/drafts/owned/sign', {})).rejects.toThrow('Redirect refused');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('enforces an admitted success status while retaining the default 2xx policy', async () => {
    const { fetch } = recordingFetch(() => new Response('{"ok":true}', {
      status: 201, headers: { 'content-type': 'application/json' },
    }));
    const client = new HttpClient({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch });
    await expect(client.postJson('/drafts/owned/sign', {}, { successStatuses: [200] }))
      .rejects.toMatchObject({ status: 201, message: 'HTTP response status does not match the admitted request' });
    await expect(client.postJson('/example', {})).resolves.toEqual({ ok: true });
  });

  it('surfaces stack Problem JSON on failed requests', async () => {
    const { fetch } = recordingFetch(() => problemResponse(401, 'unauthorized'));
    const client = new HttpClient({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch });

    await expect(client.getJson('/runtime/forms/form-1')).rejects.toMatchObject({
      status: 401,
      problem: { error_code: 'FORMSPEC-4010' },
    });
  });

  it('aborts a hung credential lookup without dispatching a request', async () => {
    const controller = new AbortController();
    const fetch = vi.fn();
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: fetch,
      accessToken: () => new Promise<string>(() => {}) });
    const pending = client.getJson('/private', { signal: controller.signal });
    controller.abort(new Error('owner changed'));
    await expect(pending).rejects.toThrow('owner changed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('applies the deadline to credentials as well as HTTP', async () => {
    const fetch = vi.fn();
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: fetch,
      accessToken: () => new Promise<string>(() => {}) });
    await expect(client.getJson('/private', { timeoutMs: 5 })).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fences transports that ignore cancellation', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: fetch });
    const pending = client.getJson('/private', { signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort(new Error('generation retired'));
    await expect(pending).rejects.toThrow('generation retired');
  });

  it('bounds streamed bytes before JSON parsing and cancels an oversized reader', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"text":"too long"}')); }, cancel });
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: async () => new Response(stream, {
      headers: { 'content-type': 'application/json' },
    }) });
    await expect(client.getJson('/private', { maxResponseBytes: 8 })).rejects.toThrow('byte limit');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('bounds stalled response streams with the same deadline', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel });
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: async () => new Response(stream, {
      headers: { 'content-type': 'application/json' },
    }) });
    await expect(client.getJson('/private', { timeoutMs: 5, maxResponseBytes: 8 })).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['media type', { 'content-type': 'text/html', 'cache-control': 'no-store' }],
    ['storage', { 'content-type': 'application/json', 'cache-control': 'private' }],
  ])('enforces the admitted %s response policy', async (_, headers) => {
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: async () => new Response('{}', { headers }) });
    await expect(client.getJson('/private', { requireJson: true, requireNoStore: true, maxResponseBytes: 100 })).rejects.toThrow();
  });


  it('keeps the admitted tenant binding immutable after construction', async () => {
    const binding = structuredClone(departmentAppProfile.tenantBinding!);
    const { fetch, requests } = recordingFetch(() => jsonResponse({ ok: true }));
    const client = new HttpClient({ baseUrl: 'https://source.example', tenantBinding: binding, fetchImpl: fetch });
    if (binding.kind === 'bound') binding.scope.tenant = 'crossed';
    await client.getJson('/private');
    expect(requests[0]?.headers.get('x-formspec-tenant-id')).toBe('department-reference');
  });

  it('cancels a late response from a transport that ignored abort', async () => {
    const controller = new AbortController();
    let resolve!: (response: Response) => void;
    const cancel = vi.fn();
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: () => new Promise<Response>(r => { resolve = r; }) });
    const pending = client.getJson('/private', { signal: controller.signal });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    controller.abort(new Error('retired'));
    await expect(pending).rejects.toThrow('retired');
    resolve(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels a response when the host retires it before the body read', async () => {
    const cancel = vi.fn();
    let current = true;
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: async () => {
      current = false;
      return new Response(new ReadableStream({ cancel }));
    } });
    await expect(client.getJson('/private', { assertCurrent() { if (!current) throw new Error('retired'); } })).rejects.toThrow('retired');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('parses admitted JSON media types without case sensitivity', async () => {
    const client = new HttpClient({ baseUrl: 'https://source.example', fetchImpl: async () => new Response('{"ok":true}', {
      headers: { 'content-type': 'Application/JSON', 'cache-control': 'no-store' },
    }) });
    await expect(client.getJson('/private', { requireJson: true, requireNoStore: true, maxResponseBytes: 100 })).resolves.toEqual({ ok: true });
  });

});
