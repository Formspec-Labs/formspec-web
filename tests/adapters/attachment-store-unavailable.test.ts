import { describe, expect, it } from 'vitest';
import { unavailableAttachmentStore } from '../../src/adapters/unavailable/attachment-store.ts';
import { AttachmentUploadError } from '../../src/ports/attachment-store.ts';
import { isUnavailableAdapter } from '../../src/policy/sentinel.ts';

describe('unavailableAttachmentStore', () => {
  it('is marked as an unavailable adapter', () => {
    expect(isUnavailableAdapter(unavailableAttachmentStore())).toBe(true);
  });

  it('throws AttachmentUploadError with a plain-language message', async () => {
    const adapter = unavailableAttachmentStore();
    await expect(
      adapter.upload(new Blob(['x']), { filename: 'x.txt', mimeType: 'text/plain' }),
    ).rejects.toBeInstanceOf(AttachmentUploadError);
  });

  it('carries the typed `unavailable` code so adopters branch without parsing prose (L-1)', async () => {
    const adapter = unavailableAttachmentStore();
    try {
      await adapter.upload(new Blob(['x']), { filename: 'x.txt', mimeType: 'text/plain' });
      throw new Error('expected upload to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AttachmentUploadError);
      expect((err as AttachmentUploadError).code).toBe('unavailable');
    }
  });

  it('uses the supplied message when overridden', async () => {
    const adapter = unavailableAttachmentStore('custom message');
    await expect(
      adapter.upload(new Blob(['x']), { filename: 'x.txt', mimeType: 'text/plain' }),
    ).rejects.toThrow('custom message');
  });
});
