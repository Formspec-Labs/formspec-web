import type { AttachmentRef, AttachmentStore, AttachmentUploadMetadata } from '../../ports/attachment-store.ts';
import { AttachmentUploadError } from '../../ports/attachment-store.ts';
import { tenantScopeHeaders } from '../../profiles/tenant-headers.ts';
import { generateIdempotencyKey, IDEMPOTENCY_KEY_HEADER } from '../../shared/idempotency-key.ts';
import type { HttpClientConfig } from './http-client.ts';

export interface HttpAttachmentStoreConfig extends HttpClientConfig {
  formId: string;
}

/** Transfer actual file bytes to the authenticated form attachment endpoint. */
export class HttpAttachmentStore implements AttachmentStore {
  constructor(private readonly config: HttpAttachmentStoreConfig) {}

  async upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef> {
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
