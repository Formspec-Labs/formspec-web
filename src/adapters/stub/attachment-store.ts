import type {
  AttachmentRef,
  AttachmentStore,
  AttachmentUploadMetadata,
} from '../../ports/attachment-store.ts';
import { markDemoStubAdapter } from '../../policy/sentinel.ts';

export interface StubAttachmentStore extends AttachmentStore {
  /** Test-only accessor: returns the bytes stored at `ref.uri`, or undefined. */
  getStoredBytes(uri: string): Blob | undefined;
}

/**
 * In-memory AttachmentStore for demo + tests.
 *
 * - URIs are `attachment:demo-<counter>` so fixtures can assert presence
 *   without leaking adapter internals.
 * - `hash` is SHA-256 via WebCrypto; falls back to a deterministic
 *   fnv-style hash when subtle crypto is unavailable (mirrors
 *   `respondent-flow.ts:responseHash`).
 * - Marked DEMO_STUB_ADAPTER per ADR-0011; the coherence assertion
 *   forbids this adapter in production mode.
 */
export function stubAttachmentStore(): StubAttachmentStore {
  let counter = 0;
  const storage = new Map<string, Blob>();

  const adapter: StubAttachmentStore = {
    async upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef> {
      const hash = await sha256(blob);
      counter += 1;
      const uri = `attachment:demo-${counter}`;
      storage.set(uri, blob);
      return {
        kind: 'attachment-ref',
        uri,
        hash,
        size: blob.size,
        mimeType: metadata.mimeType,
        filename: metadata.filename,
      };
    },
    getStoredBytes(uri: string): Blob | undefined {
      return storage.get(uri);
    },
  };
  markDemoStubAdapter(adapter, {
    featureKey: 'fileUpload',
    reason: 'demo-only in-memory attachment store; not valid for production',
  });
  return adapter;
}

async function sha256(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!globalThis.crypto?.subtle) {
    return `sha256:${fallbackHash(bytes)}`;
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${hex(new Uint8Array(digest))}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackHash(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return hash.toString(16).padStart(8, '0');
}
