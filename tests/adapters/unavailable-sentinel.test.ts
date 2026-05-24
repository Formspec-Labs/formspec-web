import { describe, expect, it } from 'vitest';
import { unavailableAttachmentStore } from '../../src/adapters/unavailable/attachment-store.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';
import { isUnavailableAdapter, UNAVAILABLE_ADAPTER } from '../../src/policy/sentinel.ts';

describe('unavailable adapters carry the policy sentinel marker', () => {
  it('unavailableRespondentPlaceSource is marked with featureKey "respondentPlace"', () => {
    const adapter = unavailableRespondentPlaceSource();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('respondentPlace');
  });

  it('unavailableStatusReader is marked with featureKey "status"', () => {
    const adapter = unavailableStatusReader();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('status');
  });

  it('unavailableAttachmentStore is marked with featureKey "fileUpload"', () => {
    const adapter = unavailableAttachmentStore();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('fileUpload');
  });

  it('marked adapters still throw on call (sentinel does not change runtime behavior)', async () => {
    await expect(unavailableRespondentPlaceSource().readPlace({} as never)).rejects.toThrow();
    await expect(
      unavailableStatusReader().readStatus({ subjectRef: 'x', submissionId: 'y' } as never),
    ).rejects.toThrow();
    await expect(
      unavailableAttachmentStore().upload(new Blob(['x']), { filename: 'x', mimeType: 'text/plain' }),
    ).rejects.toThrow();
  });
});
