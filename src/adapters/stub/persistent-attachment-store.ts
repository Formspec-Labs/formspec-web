import type {
  AttachmentRef,
  AttachmentResumableUploadOptions,
  AttachmentUploadMetadata,
  ResumableAttachmentStore,
} from '../../ports/attachment-store.ts';
import { markDemoStubAdapter } from '../../policy/sentinel.ts';

export interface PersistentDemoAttachmentStore extends ResumableAttachmentStore {
  /** Test-only accessor: returns bytes stored at `ref.uri`, including across adapter instances. */
  getStoredBytes(uri: string): Blob | undefined;
}

export interface PersistentDemoAttachmentStoreOptions {
  readonly namespace?: string;
  readonly chunkSizeBytes?: number;
  readonly storage?: Storage;
}

interface StoredAttachment {
  readonly ref: AttachmentRef;
  readonly bytesBase64: string;
}

const DEFAULT_NAMESPACE = 'formspec-web:demo-attachments';
const DEFAULT_CHUNK_SIZE_BYTES = 256 * 1024;

/**
 * Demo AttachmentStore that survives page refresh via localStorage.
 *
 * This is intentionally demo-scoped, not a production object-store reference
 * adapter. It exists so the bundled OSS demo can include an attachment field
 * while completed demo uploads persist across reload.
 */
export function persistentDemoAttachmentStore(
  options: PersistentDemoAttachmentStoreOptions = {},
): PersistentDemoAttachmentStore {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const storage = options.storage ?? resolveStorage();
  const memoryFallback = new Map<string, string>();
  const chunkSizeBytes = options.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES;

  const adapter: PersistentDemoAttachmentStore = {
    async upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef> {
      return adapter.uploadResumable(blob, metadata);
    },

    async uploadResumable(
      blob: Blob,
      metadata: AttachmentUploadMetadata,
      uploadOptions: AttachmentResumableUploadOptions = {},
    ): Promise<AttachmentRef> {
      const chunkSize = Math.max(1, uploadOptions.chunkSizeBytes ?? chunkSizeBytes);
      const chunks: Uint8Array[] = [];
      const chunkCount = Math.max(1, Math.ceil(blob.size / chunkSize));
      let loadedBytes = 0;

      for (let offset = 0, chunkIndex = 0; offset < blob.size || (blob.size === 0 && chunkIndex === 0); offset += chunkSize, chunkIndex += 1) {
        const end = blob.size === 0 ? 0 : Math.min(blob.size, offset + chunkSize);
        const chunk = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
        chunks.push(chunk);
        loadedBytes += chunk.byteLength;
        uploadOptions.onProgress?.({
          loadedBytes,
          totalBytes: blob.size,
          chunksUploaded: Math.min(chunkIndex + 1, chunkCount),
          chunkCount,
        });
        if (blob.size === 0) break;
      }

      const bytes = concatBytes(chunks, blob.size);
      const hash = await sha256(bytes);
      const counter = nextCounter(namespace, storage, memoryFallback);
      const uri = `attachment:demo-persistent-${counter}`;
      const ref: AttachmentRef = {
        kind: 'attachment-ref',
        uri,
        hash,
        size: blob.size,
        mimeType: metadata.mimeType,
        filename: metadata.filename,
      };
      setItem(
        itemKey(namespace, uri),
        JSON.stringify({ ref, bytesBase64: bytesToBase64(bytes) } satisfies StoredAttachment),
        storage,
        memoryFallback,
      );
      return ref;
    },

    async delete(uri: string): Promise<void> {
      removeItem(itemKey(namespace, uri), storage, memoryFallback);
    },

    getStoredBytes(uri: string): Blob | undefined {
      const raw = getItem(itemKey(namespace, uri), storage, memoryFallback);
      if (!raw) return undefined;
      const stored = JSON.parse(raw) as StoredAttachment;
      return new Blob([base64ToBytes(stored.bytesBase64) as unknown as BlobPart], {
        type: stored.ref.mimeType,
      });
    },
  };

  markDemoStubAdapter(adapter, {
    featureKey: 'fileUpload',
    reason: 'demo-only localStorage attachment store; not valid for production',
  });
  return adapter;
}

function resolveStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function itemKey(namespace: string, uri: string): string {
  return `${namespace}:item:${uri}`;
}

function counterKey(namespace: string): string {
  return `${namespace}:counter`;
}

function nextCounter(namespace: string, storage: Storage | undefined, fallback: Map<string, string>): number {
  const key = counterKey(namespace);
  const current = Number.parseInt(getItem(key, storage, fallback) ?? '0', 10);
  const next = Number.isFinite(current) ? current + 1 : 1;
  setItem(key, String(next), storage, fallback);
  return next;
}

function getItem(key: string, storage: Storage | undefined, fallback: Map<string, string>): string | null {
  return storage?.getItem(key) ?? fallback.get(key) ?? null;
}

function setItem(
  key: string,
  value: string,
  storage: Storage | undefined,
  fallback: Map<string, string>,
): void {
  if (storage) {
    storage.setItem(key, value);
    return;
  }
  fallback.set(key, value);
}

function removeItem(key: string, storage: Storage | undefined, fallback: Map<string, string>): void {
  if (storage) {
    storage.removeItem(key);
    return;
  }
  fallback.delete(key);
}

function concatBytes(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'Persistent demo AttachmentStore requires globalThis.crypto.subtle (WebCrypto).',
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    arrayBufferForDigest(bytes),
  );
  return `sha256:${hex(new Uint8Array(digest))}`;
}

function arrayBufferForDigest(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 8192));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
