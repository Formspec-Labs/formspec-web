import { describe, expect, it } from 'vitest';
import { canonicalResponseHandoffBytes, canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';

const profiles = [
  ['handoff', canonicalResponseHandoffBytes, 'formspec.response.handoff.v1'],
  ['signing', canonicalResponseSignedPayloadBytes, 'formspec.response.signed-payload.v1'],
] as const;

describe.each(profiles)('%s public canonical snapshot', (_name, bytes, domain) => {
  it('serializes admitted descriptors instead of rereading root and nested Proxy values', () => {
    let valueReads = 0;
    const traps: ProxyHandler<object> = {
      get() { valueReads++; return () => ({ substituted: true }); },
    };
    const nested = new Proxy({ name: 'Recorded', authoredSignatures: ['nested'] }, traps);
    const response = new Proxy({ id: 'response', displayedLocale: { locale: 'es', version: '1' }, data: nested }, traps);
    const expected = { id: 'response', displayedLocale: { locale: 'es', version: '1' }, data: { name: 'Recorded', authoredSignatures: ['nested'] } };
    expect(bytes(response)).toEqual(bytes(expected));
    expect(valueReads).toBe(0);
  });

  it('snapshots Proxy array lengths and elements before serialization', () => {
    let valueReads = 0;
    const data = new Proxy([0, false, null, { answer: 'Yes' }], {
      get() { valueReads++; return 99; },
    });
    expect(bytes({ data })).toEqual(bytes({ data: [0, false, null, { answer: 'Yes' }] }));
    expect(valueReads).toBe(0);
  });

  it('retains the domain and unusual keys without a serialization hook', () => {
    const data: unknown = JSON.parse('{"__proto__":{"value":1},"constructor":"Recorded","toJSON":"text"}');
    const result = new TextDecoder().decode(bytes({ data }));
    expect(result).toBe(`${domain}\0{"data":{"__proto__":{"value":1},"constructor":"Recorded","toJSON":"text"}}`);
  });

  it('refuses getters without reading them', () => {
    let reads = 0;
    const data = { get answer() { reads++; return 'Yes'; } };
    expect(() => bytes({ data })).toThrow(TypeError);
    expect(reads).toBe(0);
  });
});

it('keeps handoff signatures and omits only top-level signing signatures', () => {
  const response = { id: 'response', authoredSignatures: [{ value: 'signature' }], data: { authoredSignatures: ['nested'] } };
  expect(new TextDecoder().decode(canonicalResponseHandoffBytes(response))).toContain('"authoredSignatures":[{"value":"signature"}]');
  expect(canonicalResponseSignedPayloadBytes(response)).toEqual(canonicalResponseSignedPayloadBytes({ id: response.id, data: response.data }));
  expect(new TextDecoder().decode(canonicalResponseSignedPayloadBytes(response))).toContain('"authoredSignatures":["nested"]');
});
