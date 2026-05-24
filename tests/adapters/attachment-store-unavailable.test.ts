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

  it('uses the supplied message when overridden', async () => {
    const adapter = unavailableAttachmentStore('custom message');
    await expect(
      adapter.upload(new Blob(['x']), { filename: 'x.txt', mimeType: 'text/plain' }),
    ).rejects.toThrow('custom message');
  });
});
