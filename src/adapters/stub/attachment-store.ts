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
 * - `hash` is SHA-256 via WebCrypto. The stub is demo-only; production
 *   adapters bring their own hashing. If `globalThis.crypto.subtle` is
 *   unavailable, the stub THROWS — the previous fnv fallback (32-bit) had
 *   weaker collision resistance than SHA-256 and risked silently degrading
 *   if this adapter ever ran in a context where the demo guard slipped.
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
    async delete(uri: string): Promise<void> {
      storage.delete(uri);
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
  if (!globalThis.crypto?.subtle) {
    // Stub is demo-only; production adopters bring their own hashing. Throwing
    // here prevents accidental degradation to a weaker hash in any context
    // where the demo-stub coherence guard slipped (older Node without
    // webcrypto, limited service-worker polyfills, etc.).
    throw new Error(
      'AttachmentStore demo stub requires globalThis.crypto.subtle (WebCrypto). Available in browsers + Node 18+ + modern service workers; not available in older Node or limited service-worker contexts.',
    );
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${hex(new Uint8Array(digest))}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
