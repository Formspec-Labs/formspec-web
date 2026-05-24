/**
 * AttachmentStore port — web ADR-0009 (port what's adopter-shaped) + ADR-0011
 * (fileUpload instance capability).
 *
 * Persists respondent-supplied file bytes during form-fill so the engine value
 * at an attachment field is a serializable `AttachmentRef` by the time
 * `buildIntakeHandoff` runs. The handoff carries the ref through
 * `response.data` JSON unchanged — no parallel sidecar plumbing.
 *
 * Adopters wire S3 / R2 / Azure Blob / server-bundled / IPFS / etc. for
 * storage independently of the submit endpoint. The reference deployment
 * composition declares `unavailable` honestly until an adopter wires a real
 * adapter.
 *
 * See FW-0033 slice 1 design + `docs/ports/attachment-store.md`.
 */

export interface AttachmentUploadMetadata {
  /** Respondent-chosen filename, surfaced in receipts and UI. */
  readonly filename: string;
  /** Browser-reported MIME type; adopter MAY override server-side. */
  readonly mimeType: string;
}

export interface AttachmentRef {
  /**
   * Discriminator literal so server-side / verifier detection inside
   * arbitrary response data is keyed off a non-empty field, not a
   * heuristic.
   */
  readonly kind: 'attachment-ref';
  /** Adopter's canonical reference (e.g., `s3://bucket/key`, `attachment:demo-1`). */
  readonly uri: string;
  /** `sha256:<hex>` digest of the uploaded bytes; the conformance suite asserts determinism per adapter. */
  readonly hash: string;
  /** Byte count of the uploaded blob. */
  readonly size: number;
  /** Echoes back `metadata.mimeType` for receipt display. */
  readonly mimeType: string;
  /** Echoes back `metadata.filename` for receipt display. */
  readonly filename: string;
}

/**
 * Discriminator codes adopters branch on for telemetry and UI copy without
 * parsing the prose `message`. Keep the closed set narrow — new failure
 * categories add a new code + a corresponding plain-language copy entry in
 * the renderer's failure-copy map.
 */
export type AttachmentUploadErrorCode =
  | 'file-too-large'
  | 'mime-rejected'
  | 'network'
  | 'unavailable'
  | 'unknown';

export class AttachmentUploadError extends Error {
  readonly code: AttachmentUploadErrorCode;
  constructor(message: string, options: { code: AttachmentUploadErrorCode; cause?: unknown }) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AttachmentUploadError';
    this.code = options.code;
  }
}

export interface AttachmentStore {
  upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef>;
  /**
   * Optional: lifecycle hook the renderer calls when the respondent removes
   * an AttachmentRef from the field value before submit. Adopters who back
   * the port with durable object storage (S3 / R2 / Azure Blob / GCS) SHOULD
   * implement `delete` to avoid orphaned bytes from abandoned attaches.
   *
   * Adopters who omit `delete` are responsible for lifecycle cleanup at
   * submit time by diffing the bytes their AttachmentStore retains against
   * the final `response.data` set (the substrate-of-record).
   *
   * Errors thrown by `delete` are swallowed by the renderer — lifecycle is
   * adopter-side responsibility and a failed cleanup MUST NOT block the
   * respondent's flow.
   */
  delete?(uri: string): Promise<void>;
}
