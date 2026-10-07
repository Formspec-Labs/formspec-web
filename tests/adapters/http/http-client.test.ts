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
});
