import { describe, expect, it } from 'vitest';
import { unavailableScreenerDocumentSource } from '../../src/adapters/unavailable/screener-document-source.ts';
import { isUnavailableAdapter } from '../../src/policy/sentinel.ts';

describe('unavailableScreenerDocumentSource', () => {
  it('throws with the adopter-facing message on read', async () => {
    const adapter = unavailableScreenerDocumentSource();
    await expect(
      adapter.readScreener({ url: 'urn:any' }),
    ).rejects.toThrow(/not configured/);
  });

  it('is marked as an unavailable adapter (web ADR-0011 §Failure Semantics)', () => {
    const adapter = unavailableScreenerDocumentSource();
    expect(isUnavailableAdapter(adapter)).toBe(true);
  });

  it('accepts a custom message and surfaces it on read', async () => {
    const adapter = unavailableScreenerDocumentSource('test message');
    await expect(adapter.readScreener({ url: 'urn:any' })).rejects.toThrow('test message');
  });
});
