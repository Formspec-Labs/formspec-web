import type { EvaluationProviderRegistration } from '../../../src/ports/evaluation-hydration.ts';
import type { InitialInstanceProof, InitialNativeRequest } from '../../../src/ports/initial-mixed-proof.ts';
import type { InitialProofReadBundle } from '../../../src/adapters/http/initial-mixed-proof-reader.ts';
import type { InitialProofOutcome } from '../../../src/adapters/source-worker/wire.ts';

// SCHEMA-ONLY MOCK: arbitrary digests/null leaf receipts are not owning proof successes.
// These values exercise caller lifecycle only. Actual Source/native/WASM parity is separate.
export const digest = `sha256:${'a'.repeat(64)}`;
export const at = '2026-10-10T12:00:00Z';
export const until = '2026-10-10T12:00:30Z';
export const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
export function mockFixture() {
  const scope = { tenant_id: 't', workspace_id: 'w', environment_id: 'e', cell_id: 'c' };
  const owner = { sessionId: 'session', subjectRef: 'subject', authenticated: {
    issuer: 'https://issuer.example', subject: 'oidc', clientId: null, principalId: 'principal', profile: 'profile',
    actorRef: 'actor', subjectRef: 'subject', sessionId: 'session',
  } };
  const selection = { scope, formId: 'form', formVersionId: 'version', definitionUrl: 'urn:form',
    definitionVersion: '1', definitionHash: digest, requiredSources: ['screening', 'inspection'] };
  const registration: EvaluationProviderRegistration = { providerId: 'provider', providerVersion: '1', registrationHash: digest,
    outputSchemaHash: digest, maxEvidenceAgeSeconds: 60, maxValiditySeconds: 300, publicDescriptor: {
      version: 2, resolver: 'mixedSourceComposition', providerId: 'provider', providerVersion: '1', selection,
      formVersionHash: digest, outputSchema: { url: 'urn:formspec:server:evaluation-composition:2', version: '2', hash: digest, document: '{}' },
      budgets: { deadlineMillis: 30_000, concurrency: 1, responseBytes: 2 * 1024 * 1024, maxEvidenceAgeSeconds: 60, maxValiditySeconds: 300 },
      owners: [{ instanceName: 'facts', sourceRef: 'screening', resolverKind: 'nativeScreenerMapping', registrationHash: digest,
        attachmentMode: 'metadataOnly', executorAdmissionHash: null, unavailableReason: null },
      { instanceName: 'photo', sourceRef: 'inspection', resolverKind: 'structuredImageMapping', registrationHash: digest,
        attachmentMode: 'verifiedBytes', executorAdmissionHash: digest, unavailableReason: null }],
    } };
  const request: InitialNativeRequest = { operation: 'hydrate', scope, owner, selection, draftId: 'draft', draftVersion: 1,
    candidateHash: digest, requestHash: digest, sources: { facts: 'screening', photo: 'inspection' }, canonicalResponse: { data: {} },
    formVersion: { form_version_id: 'version', form_id: 'form', definition_url: 'urn:form', definition_version: '1',
      definition_json: '{}', definition_hash: digest, locale_refs_json: '[]', runtime_config_json: '{}', created_by: 'actor', status: 'active',
      theme_ref: null, references_json: null, ontology_json: null, component_document_json: null,
      app_graph_validation_report_json: null, component_graph_json: null, host_evidence_json: null } };
  const results = ['facts', 'photo'].map(instanceName => ({ status: 'qualified' as const, instanceName,
    sourceRef: request.sources[instanceName], data: { value: false }, dataHash: digest, evidenceRef: `urn:${instanceName}`,
    issuedAt: at, expiresAt: until }));
  const hydration = { version: 2, purpose: 'formspec.instance.hydrate', operation: 'hydrate', scope, owner, selection,
    draftId: request.draftId, draftVersion: request.draftVersion, candidateHash: digest, formVersionHash: digest,
    requestHash: digest, sources: request.sources, attachmentBindings: [], qualifiedAt: at, results,
    providerReceipt: { kind: 'composedSources', version: 2, purpose: 'formspec.instance.compose', registration, requestHash: digest,
      resolvedAt: at, validUntil: until, receiptHash: digest,
      contributions: results.map(result => ({ instanceName: result.instanceName, sourceRef: result.sourceRef, resultHash: digest, receipt: null })) } };
  const outcome: InitialProofOutcome = { version: 1, kind: 'verifiedInitialMixed', requestHash: digest, registrationHash: digest,
    receiptHash: digest, qualifiedAt: at, expiresAt: until, results };
  const bundle: InitialProofReadBundle = { hydrationBytes: encode(hydration), expectedRequest: request,
    proofs: [{ decoded: { kind: 'native' } as InitialInstanceProof, utf8Bytes: new TextEncoder().encode('{ "duplicate":1,"duplicate":2 }') },
      { decoded: { kind: 'image' } as InitialInstanceProof, utf8Bytes: new TextEncoder().encode(' {"raw":true} ') }] };
  return { selected: { registration, request }, bundle, outcome };
}
