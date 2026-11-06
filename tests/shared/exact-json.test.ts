import { expect, it } from 'vitest';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { canonicalJsonIdentity, cloneJsonValue } from '../../src/shared/exact-json.ts';

it('detaches host state while preserving numeric identity and JSON omission rules', () => {
  const text = '0.3333333333333333333333333333';
  const original = { data: { value: parseJsonExact(text), omitted: undefined } };
  const copy = cloneJsonValue(original);
  expect(copy.data).not.toBe(original.data);
  expect(JSON.stringify(copy.data.value)).toBe(text);
  expect(canonicalJsonIdentity(copy)).toBe(`{"data":{"value":${text}}}`);
  expect(canonicalJsonIdentity(copy)).not.toBe(canonicalJsonIdentity({ data: { value: { rawJSON: text } } }));
  expect(() => canonicalJsonIdentity({ data: { value: Infinity } })).toThrow('finite');
});
