import { describe, expect, it } from 'vitest';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { sameResponseDataView } from '../../src/shared/response-data-view.ts';

describe('Response data versus Source answer view', () => {
  const text = '{"amount":1234567890.123456789,"count":9007199254740993,"nested":{"enabled":true,"label":"retained"}}';
  it('normalizes both exact numeric sources to the same ordinary display numbers', () => {
    expect(sameResponseDataView(parseJsonExact(text), JSON.parse(text))).toBe(true);
    expect(sameResponseDataView(JSON.parse(text), parseJsonExact(text))).toBe(true);
  });
  it.each(['boolean', 'string', 'missing', 'numeric', 'fake-raw'] as const)('refuses ordinary %s mismatch', change => {
    const display = JSON.parse(text);
    if (change === 'boolean') display.nested.enabled = false;
    if (change === 'string') display.nested.label = 'changed';
    if (change === 'missing') delete display.count;
    if (change === 'numeric') display.amount = 1;
    if (change === 'fake-raw') display.amount = { rawJSON: '1234567890.123456789' };
    expect(sameResponseDataView(parseJsonExact(text), display)).toBe(false);
  });
});
