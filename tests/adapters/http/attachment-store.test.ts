import { describe, expect, it, vi } from 'vitest';
import { HttpAttachmentStore } from '../../../src/adapters/http/attachment-store.ts';
import { testScopeKey as scopeKey } from '../../fixtures/scope.ts';
import { isUuidV7IdempotencyKey } from '../../../src/shared/idempotency-key.ts';

describe('HttpAttachmentStore', () => {
  it('rejects final bytes above the injected limit before session acquisition or HTTP', async () => {
    const token = vi.fn(async () => 'token');
    const fetchImpl = vi.fn(async () => new Response());
    const store = new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1', accessToken: token, fetchImpl, maxUploadBytes: 2 });
    expect(store.maxUploadBytes).toBe(2);
    await expect(store.upload(new Blob(['abc']), { filename: 'original.pdf', mimeType: 'application/pdf' })).rejects.toMatchObject({ code: 'file-too-large' });
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([undefined, 3, 4])('uploads bytes at or below the configured bound %s, preserving exact bytes', async maxUploadBytes => {
    const blob = new Blob(['abc'], { type: 'application/pdf' });
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.body).toBe(blob);
      return new Response(JSON.stringify({ kind: 'attachment-ref', uri: 'attachment:test', hash: `sha256:${'a'.repeat(64)}`, size: 3, filename: 'x.pdf', mimeType: 'application/pdf' }));
    });
    const store = new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1', accessToken: 'token', fetchImpl, maxUploadBytes });
    expect(store.maxUploadBytes).toBe(maxUploadBytes);
    await expect(store.upload(blob, { filename: 'x.pdf', mimeType: 'application/pdf' })).resolves.toMatchObject({ size: 3 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('refuses invalid byte limit %s', maxUploadBytes => {
    expect(() => new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1', maxUploadBytes })).toThrow(/positive safe integer/);
  });

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
    const store = new HttpAttachmentStore({ baseUrl: 'https://server.test', formId: 'form-1', accessToken: 'token', fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
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

describe('task-bound attachment route selection', () => {
  it('preserves the task descriptor and raw bytes through the draft and actual field path', async () => {
    const bytes = new Blob(['abc'], { type: 'application/pdf' });
    const uploadId = `upload_${'a'.repeat(64)}`;
    const ref = { kind: 'attachment-ref' as const, uri: `urn:formspec:attachment:${uploadId}`, hash: `sha256:${'b'.repeat(64)}`,
      size: 3, filename: 'proof.pdf', mimeType: 'application/pdf', upload_id: uploadId,
      read_url: `/runtime/drafts/task-draft/attachments/${uploadId}?dataPath=%2Fproof` };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(ref, { status: 201, headers: { 'cache-control': 'private, no-store' } }));
    const store = new HttpAttachmentStore({ baseUrl: 'https://source.test', scopeKey, formId: 'form', accessToken: 'current-owner', fetchImpl,
      maxUploadBytes: 1024, taskBinding: { draftId: 'task-draft', fieldPaths: { proof: '/proof' },
        lifetime: { signal: new AbortController().signal, assertCurrent: vi.fn() } } });
    expect(await store.upload(bytes, { filename: 'proof.pdf', mimeType: bytes.type, fieldPath: 'proof' })).toEqual(ref);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/runtime/drafts/task-draft/attachments');
    expect(new URL(String(url)).searchParams.get('dataPath')).toBe('/proof');
    expect(init!.body).toBe(bytes);
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer current-owner');
    expect(new Headers(init!.headers).get('x-stack-scope-key')).toBe(scopeKey);
  });
  it('refuses an unselected field or other task descriptor before HTTP', async () => {
    const fetchImpl = vi.fn();
    const store = new HttpAttachmentStore({ baseUrl: 'https://source.test', scopeKey, formId: 'form', accessToken: 'current-owner', fetchImpl,
      maxUploadBytes: 1024, taskBinding: { draftId: 'task-draft', fieldPaths: { proof: '/proof' },
        lifetime: { signal: new AbortController().signal, assertCurrent: vi.fn() } } });
    await expect(store.upload(new Blob(['a']), { filename: 'x.pdf', mimeType: 'application/pdf', fieldPath: 'other' })).rejects.toThrow('unselected');
    const uploadId = `upload_${'a'.repeat(64)}`;
    await expect(store.read({ kind: 'attachment-ref', uri: `urn:formspec:attachment:${uploadId}`, hash: `sha256:${'b'.repeat(64)}`,
      size: 1, filename: 'x.pdf', mimeType: 'application/pdf', read_url: `/runtime/drafts/other/attachments/${uploadId}?dataPath=%2Fproof` },
      { fieldPath: 'proof' })).rejects.toThrow('draft or path');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

it('bounds a task upload when injected transport ignores abort and cancels its late body', async () => {
  const abort = new AbortController();
  let release!: (response: Response) => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const fetchImpl = vi.fn(() => { started(); return new Promise<Response>(resolve => { release = resolve; }); });
  const store = new HttpAttachmentStore({ baseUrl: 'https://source.test', formId: 'form', accessToken: 'owner', fetchImpl,
    scopeKey,
    maxUploadBytes: 1024, taskBinding: { draftId: 'task-draft', fieldPaths: { proof: '/proof' },
      lifetime: { signal: abort.signal, assertCurrent: vi.fn() } } });
  const pending = store.upload(new Blob(['a']), { filename: 'proof.pdf', mimeType: 'application/pdf', fieldPath: 'proof' });
  await entered;
  abort.abort(new Error('task owner retired'));
  await expect(pending).rejects.toMatchObject({ code: 'network' });
  const cancel = vi.fn();
  release(new Response(new ReadableStream({ cancel })));
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
});

it.each(['toString', 'constructor', '__proto__'])('rejects inherited task path %s before credentials', async fieldPath => {
  const accessToken = vi.fn(async () => 'owner'); const fetchImpl = vi.fn();
  const store = new HttpAttachmentStore({ baseUrl: 'https://source.test', formId: 'form', accessToken, fetchImpl,
    scopeKey,
    maxUploadBytes: 1024, taskBinding: { draftId: 'task-draft', fieldPaths: { proof: '/proof' },
      lifetime: { signal: new AbortController().signal, assertCurrent: vi.fn() } } });
  await expect(store.upload(new Blob(['a']), { filename: 'x.pdf', mimeType: 'application/pdf', fieldPath })).rejects.toThrow('unselected');
  expect(accessToken).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
});

it('preserves task upload refusal when invalid response cleanup never settles', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 403 }));
  const store = new HttpAttachmentStore({ baseUrl: 'https://source.test', formId: 'form', accessToken: 'owner', fetchImpl,
    scopeKey,
    maxUploadBytes: 1024, taskBinding: { draftId: 'task-draft', fieldPaths: { proof: '/proof' },
      lifetime: { signal: new AbortController().signal, assertCurrent: vi.fn() } } });
  await expect(store.upload(new Blob(['a']), { filename: 'x.pdf', mimeType: 'application/pdf', fieldPath: 'proof' })).rejects.toMatchObject({ code: 'unavailable' });
  expect(cancel).toHaveBeenCalledOnce();
});

it('denies every attachment operation for an explicit empty task map before credentials or HTTP', async () => {
  const accessToken = vi.fn(async () => 'owner'); const fetchImpl = vi.fn();
  const store = new HttpAttachmentStore({ baseUrl: 'https://source.test', formId: 'form', accessToken, fetchImpl,
    scopeKey,
    maxUploadBytes: 1024, taskBinding: { draftId: 'task-draft', fieldPaths: {},
      lifetime: { signal: new AbortController().signal, assertCurrent: vi.fn() } } });
  await expect(store.upload(new Blob(['a']), { filename: 'x.pdf', mimeType: 'application/pdf', fieldPath: 'proof' })).rejects.toThrow('unselected');
  await expect(store.read({ kind: 'attachment-ref', uri: 'urn:formspec:attachment:unselected', hash: `sha256:${'b'.repeat(64)}`,
    size: 1, filename: 'x.pdf', mimeType: 'application/pdf' }, { fieldPath: 'proof' })).rejects.toThrow('unselected');
  expect(accessToken).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
});
