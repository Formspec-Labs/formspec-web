import { describe, expect, it } from 'vitest';
import { unavailableRespondentHistorySource } from '../../src/adapters/unavailable/respondent-history-source.ts';

describe('unavailableRespondentHistorySource (FW-0057)', () => {
  it('throws on readHistory with an adopter-facing message by default', async () => {
    const adapter = unavailableRespondentHistorySource();
    await expect(adapter.readHistory({})).rejects.toThrow(/not configured/);
  });

  it('honors a custom message override', async () => {
    const adapter = unavailableRespondentHistorySource('custom unavailable copy');
    await expect(adapter.readHistory({})).rejects.toThrow('custom unavailable copy');
  });
});
