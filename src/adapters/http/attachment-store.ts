import { isRecord } from '../../shared/is-record.ts';
import { abortable } from '../../shared/abortable.ts';
import type { AttachmentRef, AttachmentStore, AttachmentUploadMetadata } from '../../ports/attachment-store.ts';
import { AttachmentUploadError } from '../../ports/attachment-store.ts';
import { formspecTenantHeaderNames, tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { generateIdempotencyKey, IDEMPOTENCY_KEY_HEADER } from '../../shared/idempotency-key.ts';
import { validatedAttachmentMaxUploadBytes } from '../../config/attachment-policy.ts';
import type { CompletionLifetime } from '../../ports/response-completion.ts';
import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import { defaultFetch, type HttpClientConfig } from './http-client.ts';

export interface HttpAttachmentStoreConfig extends HttpClientConfig {
  formId: string;
  maxUploadBytes?: number;
  /** Explicit task selection; Source owns current grant, publication and path authorization. */
  taskBinding?: { draftId: string; fieldPaths: Readonly<Record<string, string>>; lifetime: CompletionLifetime };
}

/** Transfer actual file bytes to the authenticated form attachment endpoint. */
export class HttpAttachmentStore implements AttachmentStore {
  readonly maxUploadBytes?: number;

  private readonly config: HttpAttachmentStoreConfig;
  constructor(config: HttpAttachmentStoreConfig) {
    this.config = { ...config, tenantBinding: config.tenantBinding ? structuredClone(config.tenantBinding) : undefined,
      taskBinding: config.taskBinding ? { draftId: config.taskBinding.draftId, fieldPaths: Object.freeze({ ...config.taskBinding.fieldPaths }),
        lifetime: { signal: config.taskBinding.lifetime.signal, assertCurrent: config.taskBinding.lifetime.assertCurrent } } : undefined };
    const task = this.config.taskBinding;
    const scope = config.tenantBinding ? tenantScopeHeaders(config.tenantBinding) : {};
    if (task && Object.values(formspecTenantHeaderNames).some(name => !scope[name]?.trim()))
      throw new Error('Task attachments require all four deployment scope headers');
    if (task && (!task.draftId.trim() || ['.', '..'].includes(task.draftId) || !config.accessToken
      || Object.entries(task.fieldPaths).some(([field, path]) => !field.trim()
        || !/^\/(?:[^~]|~[01])+$/.test(path) || path !== '/' + field.replace(/\[(\d+)\]/g, '.$1').split('.').map(part => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')) || config.maxUploadBytes === undefined)) throw new Error('Task attachments require explicit draft, paths, owner and finite limit');
    this.maxUploadBytes = validatedAttachmentMaxUploadBytes(config.maxUploadBytes);
  }

  private check(signal?: AbortSignal): void {
    signal?.throwIfAborted();
    const lifetime = this.config.taskBinding?.lifetime;
    if (lifetime) { lifetime.signal.throwIfAborted(); assertSynchronousGuard(lifetime.assertCurrent); }
  }
  private path(fieldPath?: string): string | undefined {
    const task = this.config.taskBinding;
    if (!task) return undefined;
    const exact = fieldPath && Object.hasOwn(task.fieldPaths, fieldPath) ? task.fieldPaths[fieldPath] : undefined;
    const arrayField = fieldPath?.replace(/\[\d+\]$/, '');
    const selected = exact ?? (arrayField && Object.hasOwn(task.fieldPaths, arrayField) ? task.fieldPaths[arrayField] : undefined);
    if (typeof selected !== 'string' || !selected) throw new Error('Task attachment field path is unselected');
    return selected;
  }
  private basePath(): string {
    return this.config.taskBinding ? `/runtime/drafts/${encodeURIComponent(this.config.taskBinding.draftId)}/attachments`
      : `/runtime/forms/${encodeURIComponent(this.config.formId)}/attachments`;
  }
  private fetchResponse(url: URL, init: RequestInit): Promise<Response> {
    const signal = init.signal ?? undefined;
    this.check(signal);
    const pending = Promise.resolve().then(() => { this.check(signal); return (this.config.fetchImpl ?? defaultFetch())(url, init); });
    if (!this.config.taskBinding || !signal) return pending;
    const checked = pending.then(response => {
      try { this.check(signal); return response; }
      catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
    });
    return abortable(signal, checked);
  }
  /** Read a retained upload through this adapter's fixed form and owner session. */
  async read(descriptor: unknown, options: { signal?: AbortSignal; fieldPath?: string } = {}): Promise<Blob> {
    const ref = structuredClone(descriptor);
    const dataPath = this.path(options.fieldPath);
    const { uploadId, mimeType, size, hash } = qualifyReadDescriptor(ref, this.config.formId, this.config.taskBinding ? this.basePath() : undefined, dataPath);
    const signal = this.config.taskBinding ? AbortSignal.any([this.config.taskBinding.lifetime.signal, AbortSignal.timeout(10_000), ...(options.signal ? [options.signal] : [])]) : options.signal;
    this.check(signal);
    if (this.maxUploadBytes === undefined) throw new Error('A finite attachment read limit is required');
    if (size > this.maxUploadBytes) {
      throw new Error('Attachment exceeds the configured read limit');
    }
    const scopeHeaders = this.config.tenantBinding ? tenantScopeHeaders(this.config.tenantBinding) : {};
    if ((['x-formspec-tenant-id', 'x-formspec-workspace-id', 'x-formspec-environment-id', 'x-formspec-cell-id'] as const)
      .some(name => !scopeHeaders[name]?.trim())) throw new Error('Attachment read requires all four deployment scope headers');
    if (!globalThis.crypto?.subtle) throw new Error('Attachment digest verification is unavailable');
    this.check(signal);
    const tokenPromise = Promise.resolve(typeof this.config.accessToken === 'function' ? this.config.accessToken() : this.config.accessToken);
    const token = signal ? await abortable(signal, tokenPromise) : await tokenPromise;
    if (!token) throw new Error('An owned attachment session is required');
    this.check(signal);
    const url = new URL(`${this.config.baseUrl.replace(/\/+$/, '')}${this.basePath()}/${uploadId}`);
    if (dataPath !== undefined) url.searchParams.set('dataPath', dataPath);
    const response = await this.fetchResponse(
      url,
      { method: 'GET', redirect: 'error', signal, headers: {
        authorization: `Bearer ${token}`,
        ...scopeHeaders,
      } },
    );
    try { this.check(signal); } catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
    if (response.status !== 200 || response.redirected || response.type === 'opaque'
      || response.headers.get('content-type') !== mimeType
      || response.headers.get('cache-control') !== 'private, no-store'
      || response.headers.get('x-content-type-options') !== 'nosniff') {
      void response.body?.cancel().catch(() => {});
      throw new Error('Attachment read status or MIME type differs from its descriptor');
    }
    const bytes = await readExactBytes(response, size, signal);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actualHash = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
    this.check(signal);
    if (actualHash !== hash) throw new Error('Attachment bytes differ from their retained digest');
    return new Blob([bytes], { type: mimeType });
  }

  async upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef> {
    const dataPath = this.path(metadata.fieldPath);
    const signal = this.config.taskBinding ? AbortSignal.any([this.config.taskBinding.lifetime.signal, AbortSignal.timeout(10_000)]) : undefined;
    this.check(signal);
    if (this.maxUploadBytes !== undefined && blob.size > this.maxUploadBytes) {
      throw new AttachmentUploadError('File exceeds the configured upload limit', { code: 'file-too-large' });
    }
    const tokenPromise = Promise.resolve(typeof this.config.accessToken === 'function' ? this.config.accessToken() : this.config.accessToken);
    const token = signal ? await abortable(signal, tokenPromise) : await tokenPromise;
    if (!token) throw new AttachmentUploadError('An upload session is required', { code: 'unavailable' });
    this.check(signal);
    const mimeType = metadata.mimeType || blob.type || 'application/octet-stream';
    const headers = new Headers({
      'content-type': mimeType,
      authorization: `Bearer ${token}`,
      [IDEMPOTENCY_KEY_HEADER]: generateIdempotencyKey(),
      ...(this.config.tenantBinding ? tenantScopeHeaders(this.config.tenantBinding) : {}),
    });
    const url = new URL(`${this.config.baseUrl.replace(/\/+$/, '')}${this.basePath()}`);
    url.searchParams.set('filename', metadata.filename);
    if (dataPath !== undefined) url.searchParams.set('dataPath', dataPath);
    let response: Response;
    try {
      response = await this.fetchResponse(url, { method: 'POST', headers, body: blob, redirect: 'error', signal });
    } catch (cause) {
      throw new AttachmentUploadError('File upload failed', { code: 'network', cause });
    }
    try { this.check(signal); } catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new AttachmentUploadError(`File upload failed: HTTP ${response.status}`, {
        code: response.status === 413 ? 'file-too-large' : response.status === 415 ? 'mime-rejected' : 'unavailable',
      });
    }
    if (this.config.taskBinding && (response.status !== 201 || response.redirected || response.headers.get('cache-control') !== 'private, no-store'
      || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')) {
      void response.body?.cancel().catch(() => {}); throw new AttachmentUploadError('Task upload response differs from the maintained route', { code: 'unknown' });
    }
    let value: unknown;
    try { value = signal ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readExactBytes(response, 16 * 1024, signal, false))) : await response.json(); } catch (cause) {
      throw new AttachmentUploadError('File upload returned invalid JSON', { code: 'unknown', cause });
    }
    this.check(signal);
    if (!isUploadedRef(value, { size: blob.size, filename: metadata.filename, mimeType })) {
      throw new AttachmentUploadError('File upload returned an invalid reference', { code: 'unknown' });
    }
    const ref = value;
    if (this.config.taskBinding) qualifyReadDescriptor(ref, this.config.formId, this.basePath(), dataPath);
    return ref;
  }
}

function isUploadedRef(value: unknown, expected: { size: number; filename: string | undefined; mimeType: string }): value is AttachmentRef {
  return isRecord(value) && value.kind === 'attachment-ref' && typeof value.uri === 'string' && !!value.uri
    && typeof value.hash === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.hash)
    && value.size === expected.size && value.filename === expected.filename && value.mimeType === expected.mimeType;
}

function qualifyReadDescriptor(value: unknown, formId: string, taskBasePath?: string, dataPath?: string): { uploadId: string; mimeType: string; size: number; hash: string } {
  if (!isRecord(value)) throw new Error('Attachment descriptor is unavailable');
  const ref = value;
  const uri = ref.uri ?? ref.url;
  const mimeType = ref.mimeType ?? ref.contentType;
  const uploadId = typeof uri === 'string' ? /^urn:formspec:attachment:(upload_[a-f0-9]{64})$/.exec(uri)?.[1] : undefined;
  if (!uploadId || (ref.kind !== undefined && ref.kind !== 'attachment-ref')
    || typeof ref.hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(ref.hash)
    || typeof ref.size !== 'number' || !Number.isSafeInteger(ref.size) || ref.size < 0
    || typeof mimeType !== 'string' || !['application/pdf', 'image/png', 'image/jpeg', 'text/csv'].includes(mimeType)
    || typeof ref.filename !== 'string' || !ref.filename.trim() || new TextEncoder().encode(ref.filename).byteLength > 255
    || Array.from(ref.filename).some(character => character.codePointAt(0)! < 32
      || (character.codePointAt(0)! >= 127 && character.codePointAt(0)! <= 159))
    || Object.entries({ uri, url: uri, mimeType, contentType: mimeType, upload_id: uploadId,
      ...(!taskBasePath ? { read_url: `/runtime/forms/${encodeURIComponent(formId)}/attachments/${uploadId}` } : {}) })
      .some(([key, expected]) => ref[key] !== undefined && ref[key] !== expected)) {
    throw new Error('Attachment descriptor does not match this form read reference');
  }
  if (taskBasePath) {
    if (typeof ref.read_url !== 'string' || !ref.read_url.startsWith('/')) throw new Error('Task attachment read reference is missing');
    const url = new URL(ref.read_url, 'https://attachment.invalid');
    if (url.origin !== 'https://attachment.invalid' || url.pathname !== `${taskBasePath}/${uploadId}` || url.hash
      || [...url.searchParams.keys()].join(',') !== 'dataPath' || url.searchParams.get('dataPath') !== dataPath)
      throw new Error('Task attachment read reference differs from its draft or path');
  }
  return { uploadId, mimeType, size: ref.size, hash: ref.hash };
}

async function readExactBytes(response: Response, expectedSize: number, signal?: AbortSignal, exact = true): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    if (expectedSize === 0 || !exact) return new ArrayBuffer(0);
    throw new Error('Attachment read returned no bytes');
  }
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = signal ? await abortable(signal, reader.read()) : await reader.read();
      signal?.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > expectedSize) throw new Error('Attachment read exceeds its retained size');
      chunks.push(next.value);
    }
    if (exact && size !== expectedSize) throw new Error('Attachment read differs from its retained size');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { signal?.removeEventListener('abort', abort); reader.releaseLock(); }
}
