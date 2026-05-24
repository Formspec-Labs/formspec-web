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

export class AttachmentUploadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AttachmentUploadError';
  }
}

export interface AttachmentStore {
  upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef>;
}
