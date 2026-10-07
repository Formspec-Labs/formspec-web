import type { AttachmentRef, AttachmentStore, AttachmentUploadMetadata } from '../../ports/attachment-store.ts';
import { AttachmentUploadError } from '../../ports/attachment-store.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { generateIdempotencyKey, IDEMPOTENCY_KEY_HEADER } from '../../shared/idempotency-key.ts';
import { validatedAttachmentMaxUploadBytes } from '../../config/attachment-policy.ts';
import type { HttpClientConfig } from './http-client.ts';

export interface HttpAttachmentStoreConfig extends HttpClientConfig {
  formId: string;
  maxUploadBytes?: number;
}

/** Transfer actual file bytes to the authenticated form attachment endpoint. */
export class HttpAttachmentStore implements AttachmentStore {
  readonly maxUploadBytes?: number;

  constructor(private readonly config: HttpAttachmentStoreConfig) {
    this.maxUploadBytes = validatedAttachmentMaxUploadBytes(config.maxUploadBytes);
  }

  /** Read a retained upload through this adapter's fixed form and owner session. */
  async read(descriptor: unknown, options: { signal?: AbortSignal } = {}): Promise<Blob> {
    const ref = structuredClone(descriptor);
    const { uploadId, mimeType, size, hash } = qualifyReadDescriptor(ref, this.config.formId);
    if (this.maxUploadBytes === undefined) throw new Error('A finite attachment read limit is required');
    if (size > this.maxUploadBytes) {
      throw new Error('Attachment exceeds the configured read limit');
    }
    const scopeHeaders = this.config.tenantBinding ? tenantScopeHeaders(this.config.tenantBinding) : {};
    if ((['x-formspec-tenant-id', 'x-formspec-workspace-id', 'x-formspec-environment-id', 'x-formspec-cell-id'] as const)
      .some(name => !scopeHeaders[name]?.trim())) throw new Error('Attachment read requires all four deployment scope headers');
    if (!globalThis.crypto?.subtle) throw new Error('Attachment digest verification is unavailable');
    options.signal?.throwIfAborted();
    const token = typeof this.config.accessToken === 'function'
      ? await this.config.accessToken() : this.config.accessToken;
    if (!token) throw new Error('An owned attachment session is required');
    options.signal?.throwIfAborted();
    const response = await (this.config.fetchImpl ?? fetch)(
      `${this.config.baseUrl.replace(/\/+$/, '')}/runtime/forms/${encodeURIComponent(this.config.formId)}/attachments/${uploadId}`,
      { method: 'GET', redirect: 'error', signal: options.signal, headers: {
        authorization: `Bearer ${token}`,
        ...scopeHeaders,
      } },
    );
    if (response.status !== 200 || response.redirected || response.type === 'opaque'
      || response.headers.get('content-type') !== mimeType
      || response.headers.get('cache-control') !== 'private, no-store'
      || response.headers.get('x-content-type-options') !== 'nosniff') {
      await response.body?.cancel();
      throw new Error('Attachment read status or MIME type differs from its descriptor');
    }
    const bytes = await readExactBytes(response, size, options.signal);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actualHash = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
    options.signal?.throwIfAborted();
    if (actualHash !== hash) throw new Error('Attachment bytes differ from their retained digest');
    return new Blob([bytes], { type: mimeType });
  }

  async upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef> {
    if (this.maxUploadBytes !== undefined && blob.size > this.maxUploadBytes) {
      throw new AttachmentUploadError('File exceeds the configured upload limit', { code: 'file-too-large' });
    }
    const token = typeof this.config.accessToken === 'function'
      ? await this.config.accessToken() : this.config.accessToken;
    if (!token) throw new AttachmentUploadError('An upload session is required', { code: 'unavailable' });
    const mimeType = metadata.mimeType || blob.type || 'application/octet-stream';
    const headers = new Headers({
      'content-type': mimeType,
      authorization: `Bearer ${token}`,
      [IDEMPOTENCY_KEY_HEADER]: generateIdempotencyKey(),
      ...(this.config.tenantBinding ? tenantScopeHeaders(this.config.tenantBinding) : {}),
    });
    const url = new URL(`${this.config.baseUrl.replace(/\/+$/, '')}/runtime/forms/${encodeURIComponent(this.config.formId)}/attachments`);
    url.searchParams.set('filename', metadata.filename);
    let response: Response;
    try {
      response = await (this.config.fetchImpl ?? fetch)(url, { method: 'POST', headers, body: blob, redirect: 'error' });
    } catch (cause) {
      throw new AttachmentUploadError('File upload failed', { code: 'network', cause });
    }
    if (!response.ok) {
      throw new AttachmentUploadError(`File upload failed: HTTP ${response.status}`, {
        code: response.status === 413 ? 'file-too-large' : response.status === 415 ? 'mime-rejected' : 'unavailable',
      });
    }
    let value: unknown;
    try { value = await response.json(); } catch (cause) {
      throw new AttachmentUploadError('File upload returned invalid JSON', { code: 'unknown', cause });
    }
    if (!value || typeof value !== 'object') {
      throw new AttachmentUploadError('File upload returned an invalid reference', { code: 'unknown' });
    }
    const ref = value as AttachmentRef;
    if (ref.kind !== 'attachment-ref' || typeof ref.uri !== 'string' || !ref.uri
      || typeof ref.hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(ref.hash)
      || ref.size !== blob.size || ref.filename !== metadata.filename || ref.mimeType !== mimeType) {
      throw new AttachmentUploadError('File upload returned an invalid reference', { code: 'unknown' });
    }
    return ref;
  }
}

function qualifyReadDescriptor(value: unknown, formId: string): { uploadId: string; mimeType: string; size: number; hash: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Attachment descriptor is unavailable');
  const ref = value as Record<string, unknown>;
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
      read_url: `/runtime/forms/${encodeURIComponent(formId)}/attachments/${uploadId}` })
      .some(([key, expected]) => ref[key] !== undefined && ref[key] !== expected)) {
    throw new Error('Attachment descriptor does not match this form read reference');
  }
  return { uploadId, mimeType, size: ref.size, hash: ref.hash };
}

async function readExactBytes(response: Response, expectedSize: number, signal?: AbortSignal): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    if (expectedSize === 0) return new ArrayBuffer(0);
    throw new Error('Attachment read returned no bytes');
  }
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = await reader.read();
      signal?.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > expectedSize) throw new Error('Attachment read exceeds its retained size');
      chunks.push(next.value);
    }
    if (size !== expectedSize) throw new Error('Attachment read differs from its retained size');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { signal?.removeEventListener('abort', abort); reader.releaseLock(); }
}
