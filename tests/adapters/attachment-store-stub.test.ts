import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubAttachmentStore } from '../../src/adapters/stub/attachment-store.ts';
import { sampleAttachmentBlob, sampleAttachmentMetadata } from '../../src/adapter-conformance/fixtures.ts';
import { isDemoStubAdapter } from '../../src/policy/sentinel.ts';

describe('stubAttachmentStore', () => {
  it('is marked as a demo-stub adapter', () => {
    expect(isDemoStubAdapter(stubAttachmentStore())).toBe(true);
  });

  it('emits monotonic counter URIs scoped per instance', async () => {
    const adapter = stubAttachmentStore();
    const a = await adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata);
    const b = await adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata);
    expect(a.uri).toBe('attachment:demo-1');
    expect(b.uri).toBe('attachment:demo-2');
  });

  it('exposes a test-only getStoredBytes helper that round-trips the blob', async () => {
    const adapter = stubAttachmentStore();
    const blob = sampleAttachmentBlob();
    const ref = await adapter.upload(blob, sampleAttachmentMetadata);
    const stored = adapter.getStoredBytes(ref.uri);
    expect(stored).toBeDefined();
    expect(stored?.size).toBe(blob.size);
  });

  it('returns undefined for an unknown URI', () => {
    expect(stubAttachmentStore().getStoredBytes('attachment:nope')).toBeUndefined();
  });

  describe('when globalThis.crypto.subtle is unavailable (M-1: weak-hash fallback removed)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('throws rather than silently degrading to a weaker hash', async () => {
      // Simulate a context where WebCrypto subtle is missing (older Node, some
      // limited service-worker polyfills, etc.). The demo stub MUST refuse to
      // produce a hash; production adopters bring their own hashing path.
      vi.stubGlobal('crypto', {});
      const adapter = stubAttachmentStore();
      await expect(adapter.upload(sampleAttachmentBlob(), sampleAttachmentMetadata)).rejects.toThrow(
        /globalThis\.crypto\.subtle/,
      );
    });
  });
});
