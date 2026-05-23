import { describe, expect, it } from 'vitest';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { DEMO_STUB_ADAPTER, isDemoStubAdapter } from '../../src/policy/sentinel.ts';

describe('stub adapters that back runtime feature keys carry the demo-stub marker', () => {
  it('stubRespondentPlaceSource is marked with featureKey "respondentPlace"', () => {
    const adapter = stubRespondentPlaceSource();
    expect(isDemoStubAdapter(adapter)).toBe(true);
    if (!isDemoStubAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[DEMO_STUB_ADAPTER].featureKey).toBe('respondentPlace');
  });

  it('stubStatusReader is marked with featureKey "status"', () => {
    const adapter = stubStatusReader();
    expect(isDemoStubAdapter(adapter)).toBe(true);
    if (!isDemoStubAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[DEMO_STUB_ADAPTER].featureKey).toBe('status');
  });
});
