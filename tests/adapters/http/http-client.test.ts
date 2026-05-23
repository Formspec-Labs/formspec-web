import { describe, expect, it } from 'vitest';
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

  it('surfaces stack Problem JSON on failed requests', async () => {
    const { fetch } = recordingFetch(() => problemResponse(401, 'unauthorized'));
    const client = new HttpClient({ baseUrl: 'https://formspec-server.example.test', fetchImpl: fetch });

    await expect(client.getJson('/runtime/forms/form-1')).rejects.toMatchObject({
      status: 401,
      problem: { error_code: 'FORMSPEC-4010' },
    });
  });
});
