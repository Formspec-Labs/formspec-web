import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HttpAttachmentStore } from '../../../src/adapters/http/attachment-store.ts';
import { testScopeKey as scopeKey } from '../../fixtures/scope.ts';

const bytes = new TextEncoder().encode('retained photo bytes');
const id = `upload_${'a'.repeat(64)}`;
const path = `/runtime/forms/form-1/attachments/${id}`;
const descriptor = {
  kind: 'attachment-ref', uri: `urn:formspec:attachment:${id}`, url: `urn:formspec:attachment:${id}`,
  upload_id: id, read_url: path, hash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  size: bytes.byteLength, mimeType: 'image/png', contentType: 'image/png', filename: 'photo.png',
};
function reply(body: BodyInit = bytes, status = 200, type = 'image/png') {
  return new Response(body, { status, headers: {
    'content-type': type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } });
}
function setup(response = () => reply(), maxUploadBytes: number | undefined = 100) {
  const token = vi.fn(async () => 'private-test-token');
  const fetchImpl = vi.fn(async () => response());
  const store = new HttpAttachmentStore({
    baseUrl: 'https://server.test', formId: 'form-1', accessToken: token, fetchImpl, maxUploadBytes, scopeKey,
  });
  return { store, token, fetchImpl };
}

describe('HttpAttachmentStore owned read', () => {
  it('returns exact verified bytes from the fixed owned endpoint without altering the frozen descriptor', async () => {
    const { store, fetchImpl } = setup();
    const frozen = Object.freeze({ ...descriptor, retainedExtra: 'preserved' });
    const blob = await store.read(frozen);
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(frozen.retainedExtra).toBe('preserved');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string | URL, RequestInit];
    expect(String(url)).toBe(`https://server.test${path}`);
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-test-token');
    expect(new Headers(init.headers).has('idempotency-key')).toBe(false);
  });

  it.each([
    { read_url: 'https://attacker.test/bytes' }, { read_url: `/runtime/forms/other/attachments/${id}` },
    { url: 'urn:formspec:attachment:upload_other' }, { upload_id: 'upload_other' },
    { hash: 'sha256:wrong' }, { size: 1.5 }, { size: -1 }, { kind: 'browserFile' },
    { contentType: 'image/jpeg' }, { mimeType: 'text/html', contentType: 'text/html' },
    { filename: '😀'.repeat(64) }, { filename: String.fromCharCode(0) }, { filename: String.fromCharCode(128) },
  ])('refuses inconsistent reference %j before acquiring a session', async change => {
    const { store, token, fetchImpl } = setup();
    await expect(store.read({ ...descriptor, ...change })).rejects.toThrow();
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires a finite injected bound and refuses an oversized descriptor before authentication', async () => {
    const unbounded = new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1' });
    await expect(unbounded.read(descriptor)).rejects.toThrow(/finite/);
    const { store, token } = setup(() => reply(), 1);
    await expect(store.read(descriptor)).rejects.toThrow(/limit/);
    expect(token).not.toHaveBeenCalled();
  });

  it('accepts the Core descriptor aliases without dropping retained fields', async () => {
    const ref = { url: descriptor.url, contentType: descriptor.contentType, hash: descriptor.hash,
      size: descriptor.size, filename: descriptor.filename, extraRetainedField: 'kept' };
    expect((await setup().store.read(ref)).size).toBe(descriptor.size);
    expect(ref.extraRetainedField).toBe('kept');
  });

  it('requires the scope key before acquiring a session', async () => {
    const token = vi.fn(async () => 'token');
    const fetchImpl = vi.fn();
    const store = new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1', maxUploadBytes: 100, accessToken: token, fetchImpl });
    await expect(store.read(descriptor)).rejects.toThrow(/scope key/);
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([201, 401, 404, 409, 503])('refuses HTTP %s', async status => {
    await expect(setup(() => reply(bytes, status)).store.read(descriptor)).rejects.toThrow();
  });

  it.each([
    () => reply(bytes, 200, 'image/jpeg'),
    () => { const value = reply(); value.headers.delete('x-content-type-options'); return value; },
    () => { const value = reply(); value.headers.set('cache-control', 'public'); return value; },
    () => { const value = reply(); Object.defineProperty(value, 'redirected', { value: true }); return value; },
  ])('refuses MIME, custody headers or a followed redirect', async response => {
    await expect(setup(response).store.read(descriptor)).rejects.toThrow();
  });

  it.each(['short', 'same length altered!!', 'this response exceeds the retained byte length'])('refuses different retained bytes %s', async body => {
    await expect(setup(() => reply(body)).store.read(descriptor)).rejects.toThrow();
  });

  it('cancels an oversized stream before retaining its remaining bytes', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(descriptor.size + 1)); }, cancel,
    });
    await expect(setup(() => reply(stream)).store.read(descriptor)).rejects.toThrow(/exceeds/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('verifies the actual digest even when the byte count is unchanged', async () => {
    const changed = bytes.slice(); changed[0] ^= 1;
    await expect(setup(() => reply(changed)).store.read(descriptor)).rejects.toThrow(/digest/);
  });

  it('selects the scope by key and cancels after token acquisition before HTTP', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('x-stack-scope-key')).toBe(scopeKey);
      return reply();
    });
    const config = { baseUrl: 'https://server.test', formId: 'form-1', maxUploadBytes: 100, fetchImpl, scopeKey };
    await new HttpAttachmentStore({ ...config, accessToken: 'test-token' }).read(descriptor);
    fetchImpl.mockClear();
    const store = new HttpAttachmentStore({ ...config, accessToken: async () => { controller.abort(); return 'test-token'; } });
    await expect(store.read(descriptor, { signal: controller.signal })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cancels a pending read when its review session is aborted', async () => {
    const cancel = vi.fn();
    const fetched = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const { store } = setup(() => { fetched(); return reply(stream); });
    const controller = new AbortController();
    const pending = store.read(descriptor, { signal: controller.signal });
    await vi.waitFor(() => expect(fetched).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('discards bytes if the review is aborted while their digest is pending', async () => {
    const actualDigest = await crypto.subtle.digest('SHA-256', bytes);
    let finish!: (value: ArrayBuffer) => void;
    const delayed = new Promise<ArrayBuffer>(resolve => { finish = resolve; });
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => delayed);
    try {
      const controller = new AbortController();
      const pending = setup().store.read(descriptor, { signal: controller.signal });
      await vi.waitFor(() => expect(digest).toHaveBeenCalledOnce());
      controller.abort(); finish(actualDigest);
      await expect(pending).rejects.toThrow();
    } finally { digest.mockRestore(); }
  });

  it('refuses unavailable digest computation before acquiring credentials', async () => {
    const { store, token, fetchImpl } = setup();
    vi.stubGlobal('crypto', undefined);
    try {
      await expect(store.read(descriptor)).rejects.toThrow(/digest/);
      expect(token).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('refuses a missing session and an already aborted review before HTTP', async () => {
    const fetchImpl = vi.fn();
    const store = new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1', maxUploadBytes: 100, fetchImpl, scopeKey });
    await expect(store.read(descriptor)).rejects.toThrow(/session/);
    const controller = new AbortController(); controller.abort();
    await expect(store.read(descriptor, { signal: controller.signal })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
