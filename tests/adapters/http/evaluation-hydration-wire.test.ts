import { describe, expect, it } from 'vitest';
import { decodeEvaluationHydrationWire } from '../../../src/adapters/http/evaluation-hydration-wire.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const at = '2026-10-09T12:00:00Z';
function fixture() {
  const scope = { tenant_id: 't', workspace_id: 'w', environment_id: 'e', cell_id: 'c' };
  const owner = { sessionId: 'session', subjectRef: 'subject', authenticated: {
    issuer: 'https://issuer.example', subject: 'oidc', clientId: null, principalId: 'principal', profile: 'profile',
    actorRef: 'actor', subjectRef: 'subject', sessionId: 'session',
  } };
  const association = { scope, owner, draftId: 'draft', draftVersion: 3, candidateHash: digest,
    selectionHash: digest, runId: 'run', runRevision: 1, evidenceHash: digest, associatedAt: at };
  const registration = { providerId: 'provider', providerVersion: '1', registrationHash: digest, outputSchemaHash: digest,
    maxEvidenceAgeSeconds: 60, maxValiditySeconds: 300, publicDescriptor: { rawMappingRules: [{ value: false }], opaque: [null, { x: 0 }] } };
  const native = { kind: 'nativeScreenerMapping', version: 1, purpose: 'formspec.instance.native-screener.map', registration,
    requestHash: digest, resolvedAt: at, proof: { association, evidenceRef: 'urn:evidence', evidenceHash: digest,
      issuedAt: at, expiresAt: '2026-10-09T12:05:00Z', instanceName: 'facts', sourceRef: 'screening', dataHash: digest }, receiptHash: digest };
  const http = { registration, requestHash: digest, callHash: digest, requestedAt: at, responseStatus: 200,
    attachments: [{ reference: { uri: 'urn:attachment', opaque: false }, hash: digest, contentType: 'image/jpeg', size: 0 }] };
  const value = { version: 1, purpose: 'formspec.instance.hydrate', operation: 'hydrate', scope, owner,
    selection: { scope, formId: 'form', formVersionId: 'version', definitionUrl: 'urn:form', definitionVersion: '1',
      definitionHash: digest, requiredSources: ['screening'] }, draftId: 'draft', draftVersion: 3, candidateHash: digest,
    formVersionHash: digest, requestHash: digest, sources: { facts: 'screening' }, attachmentBindings: [{ opaque: [false, null] }],
    qualifiedAt: at, results: [{ status: 'qualified', instanceName: 'facts', sourceRef: 'screening', data: { eligible: false },
      dataHash: digest, evidenceRef: 'urn:evidence', issuedAt: at, expiresAt: '2026-10-09T12:05:00Z' }], providerReceipt: native };
  return { value, native, http };
}

describe('Source evaluation hydration wire decoder (schema only)', () => {
  it('preserves the distinct native receipt and opaque values as detached deeply frozen data', () => {
    const { value } = fixture();
    const result = decodeEvaluationHydrationWire(value);
    expect(result).toEqual(value);
    expect(result).not.toBe(value);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.owner.authenticated)).toBe(true);
    expect(Object.isFrozen(result.results[0])).toBe(true);
    expect(Object.isFrozen(result.providerReceipt?.registration.publicDescriptor)).toBe(true);
    expect(Object.isFrozen(result.attachmentBindings[0])).toBe(true);
    value.results[0].data.eligible = true;
    expect(result.results[0]).toHaveProperty('data.eligible', false);
  });

  it('preserves the unchanged HTTP receipt and null alternative', () => {
    const { value, http } = fixture();
    for (const providerReceipt of [http, null]) {
      const input = { ...value, providerReceipt };
      expect(decodeEvaluationHydrationWire(input)).toEqual(input);
    }
  });

  it('preserves nullable authenticated owner and every explicit result status', () => {
    const { value } = fixture();
    const input = { ...value, owner: { ...value.owner, authenticated: null }, providerReceipt: null,
      results: [{ status: 'pending', instanceName: 'facts', sourceRef: 'screening', reason: 'pending' },
        { status: 'unavailable', instanceName: 'photo', sourceRef: 'photo', reason: 'unavailable' }] };
    expect(decodeEvaluationHydrationWire(input)).toEqual(input);
  });

  it.each(['mixed', 'unknown kind', 'missing proof', 'extra proof', 'extra association', 'extra root', 'extra result', 'bad date', 'missing authenticated'])('refuses %s shape', mode => {
    const { value, native, http } = fixture();
    if (mode === 'mixed') Object.assign(native, http);
    if (mode === 'unknown kind') native.kind = 'future';
    if (mode === 'missing proof') Reflect.deleteProperty(native, 'proof');
    if (mode === 'extra proof') Object.assign(native.proof, { accepted: true });
    if (mode === 'extra association') Object.assign(native.proof.association, { accepted: true });
    if (mode === 'extra root') Object.assign(value, { accepted: true });
    if (mode === 'extra result') Object.assign(value.results[0], { accepted: true });
    if (mode === 'bad date') native.resolvedAt = 'not-a-date';
    if (mode === 'missing authenticated') Reflect.deleteProperty(value.owner, 'authenticated');
    expect(() => decodeEvaluationHydrationWire(value)).toThrow();
  });

  it.each([undefined, NaN, Infinity, () => false, Symbol('x'), new Date(), new Map()])('refuses non-JSON opaque value %s without normalization', invalid => {
    const { value } = fixture();
    Object.assign(value.results[0], { data: invalid });
    expect(() => decodeEvaluationHydrationWire(value)).toThrow();
  });

  it('refuses cycles, sparse arrays, accessors and excessive nesting', () => {
    for (const invalid of [(() => { const x: unknown[] = []; x.push(x); return x; })(), Array(2),
      Object.defineProperty({}, 'x', { enumerable: true, get() { throw new Error('getter executed'); } }),
      Array.from({ length: 260 }).reduce<unknown>(x => [x], null)]) {
      const { value } = fixture();
      Object.assign(value.results[0], { data: invalid });
      expect(() => decodeEvaluationHydrationWire(value)).toThrow();
    }
  });

  it('does not claim binding or digest verification from schema validity', () => {
    const { value } = fixture();
    value.providerReceipt.requestHash = `sha256:${'b'.repeat(64)}`;
    // Cross-field authority belongs to the authenticated HTTP consumer, not this decoder.
    expect(decodeEvaluationHydrationWire(value)).toEqual(value);
  });
});
