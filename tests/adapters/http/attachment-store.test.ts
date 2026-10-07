import { describe, expect, it } from 'vitest';
import { HttpAttachmentStore } from '../../../src/adapters/http/attachment-store.ts';
import { isUuidV7IdempotencyKey } from '../../../src/shared/idempotency-key.ts';

describe('HttpAttachmentStore', () => {
  it.each(['broken JSON', 'null'])('reports malformed successful body %s through the upload error boundary', async body => {
    const store = new HttpAttachmentStore({ baseUrl: 'http://127.0.0.1:18080', formId: 'form-1', accessToken: 'test-token', fetchImpl: async () => new Response(body) });
    await expect(store.upload(new Blob(['x']), { filename: 'x.png', mimeType: 'image/png' })).rejects.toMatchObject({ code: 'unknown' });
  });

  it('sends original bytes with form-bound authentication and preserves the server reference', async () => {
    const blob = new Blob(['test photo'], { type: 'image/png' });
    const ref = { kind: 'attachment-ref' as const, uri: 'urn:formspec:attachment:upload-1', hash: `sha256:${'a'.repeat(64)}`, size: blob.size, mimeType: 'image/png', filename: 'photo 1.png', upload_id: 'upload-1', read_url: '/runtime/forms/form-1/attachments/upload-1' };
    const store = new HttpAttachmentStore({ baseUrl: 'http://127.0.0.1:18080', formId: 'form-1', accessToken: async () => 'test-token', fetchImpl: async (url, init) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/runtime/forms/form-1/attachments?filename=photo+1.png');
      expect(init?.body).toBe(blob);
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer test-token');
      expect(headers.get('content-type')).toBe('image/png');
      expect(isUuidV7IdempotencyKey(headers.get('idempotency-key') ?? '')).toBe(true);
      return new Response(JSON.stringify(ref));
    } });
    expect(await store.upload(blob, { filename: ref.filename, mimeType: ref.mimeType })).toEqual(ref);
  });

  it('uses one effective MIME type when file metadata omits it', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    const store = new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1', accessToken: 'token', fetchImpl: async (_url, init) => {
      expect(new Headers(init?.headers).get('content-type')).toBe('image/png');
      return new Response(JSON.stringify({ kind: 'attachment-ref', uri: 'urn:formspec:attachment:upload-1', hash: `sha256:${'a'.repeat(64)}`, size: 1, filename: 'x.png', mimeType: 'image/png' }));
    } });
    await expect(store.upload(blob, { filename: 'x.png', mimeType: '' })).resolves.toMatchObject({ mimeType: 'image/png' });
  });

  it('returns an upload error instead of a local reference when server custody fails', async () => {
    const store = new HttpAttachmentStore({ baseUrl: 'http://127.0.0.1:18080', formId: 'form-1', accessToken: 'test-token', fetchImpl: async () => new Response('', { status: 404 }) });
    await expect(store.upload(new Blob(['x']), { filename: 'x.png', mimeType: 'image/png' })).rejects.toMatchObject({ code: 'unavailable' });
  });
});
