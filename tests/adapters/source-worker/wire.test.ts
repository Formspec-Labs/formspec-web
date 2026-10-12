import { describe, expect, it } from 'vitest';
import { decodeInitialProofOutcome } from '../../../src/adapters/source-worker/wire.ts';
import { encode, mockFixture } from './mock-fixture.ts';

describe('owning worker output admission (schema only)', () => {
  it('retains complete mock output as deeply frozen detached data', () => {
    const fixture = mockFixture(); const result = decodeInitialProofOutcome(encode(fixture.outcome));
    expect(result).toEqual(fixture.outcome);
    const qualified = result.results[0];
    expect(qualified.status).toBe('qualified');
    if (qualified.status !== 'qualified') throw new Error('expected Qualified mock result');
    expect(Object.isFrozen(qualified.data)).toBe(true);
  });
  it.each(['duplicate', 'integer', 'infinity', 'unknown', 'kind', 'utf8', 'cap'])('refuses %s emitted output', mode => {
    const { outcome } = mockFixture(); let bytes = encode(outcome);
    if (mode === 'duplicate') bytes = new TextEncoder().encode(JSON.stringify(outcome).replace('"version":1', '"version":1,"version":1'));
    if (mode === 'integer') bytes = new TextEncoder().encode(JSON.stringify(outcome).replace('"value":false', '"value":9007199254740992'));
    if (mode === 'infinity') bytes = new TextEncoder().encode(JSON.stringify(outcome).replace('"value":false', '"value":1e999'));
    if (mode === 'unknown') bytes = encode({ ...outcome, extra: true });
    if (mode === 'kind') bytes = encode({ ...outcome, kind: 'future' });
    if (mode === 'utf8') bytes = new Uint8Array([255]);
    if (mode === 'cap') bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    expect(() => decodeInitialProofOutcome(bytes)).toThrow();
  });
});
