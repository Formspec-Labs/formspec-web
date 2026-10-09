import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import sharp from 'sharp';
import { byteHash, jsonHash } from '../src/canonical.mjs';
import { loadProviderConfig } from '../src/provider-config.mjs';
export async function providerFixture() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey); Object.assign(key, { kid: 'controlled-service-key', alg: 'RS256', use: 'sig', key_ops: ['verify'] });
  const jwksBytes = Buffer.from(JSON.stringify({ keys: [key] }));
  const policyBytes = readFileSync(new URL('./fixtures/policy.unadopted.json', import.meta.url));
  const policy = JSON.parse(policyBytes);
  const definition = { url: 'urn:controlled:form', version: '1.0', instances: { photoCheck: { source: 'urn:controlled:photo' }, photoPolicy: { data: policy }, other: { source: 'urn:controlled:unsupported' } } };
  const formVersion = { form_version_id: 'controlled-version', form_id: 'controlled-form', definition_url: definition.url,
    definition_version: definition.version, status: 'published', definition_json: JSON.stringify(definition), definition_hash: jsonHash(definition),
    theme_ref: null, locale_refs_json: '[]', references_json: null, ontology_json: null, component_document_json: null,
    app_graph_validation_report_json: null, component_graph_json: null, host_evidence_json: null, runtime_config_json: '{}', created_by: 'controlled' };
  const scope = { tenant_id: 'controlled', workspace_id: 'controlled', environment_id: 'controlled', cell_id: 'controlled' };
  const selection = { scope, formId: formVersion.form_id, formVersionId: formVersion.form_version_id, definitionUrl: definition.url,
    definitionVersion: definition.version, definitionHash: formVersion.definition_hash, requiredSources: ['urn:controlled:photo', 'urn:controlled:unsupported'] };
  const budgets = { requestBytes: 1_000_000, responseBytes: 100_000, attachmentCount: 2, attachmentBytes: 200_000,
    totalAttachmentBytes: 400_000, concurrency: 1, deadlineMillis: 4000, maxEvidenceAgeSeconds: 300, maxValiditySeconds: 900 };
  const credentialIdentity = { purpose: 'formspec.instance.resolve', scope, endpoint: 'https://provider.example/resolve', principal: 'controlled-inspector',
    issuer: 'https://issuer.example', audience: 'controlled-photo-api', requiredScopes: ['formspec.instance.resolve'], allowedClients: ['source-photo-client'],
    profile: 'keycloak', allowDevelopmentLoopbackHttp: false, clientId: 'source-photo-client', scopes: ['formspec.instance.resolve'], assurance: 'registeredClient',
    authentication: { method: 'clientSecretBasic' } };
  const registration = { version: 1, resolver: 'registeredHttpBatchV1', selection, providerId: 'controlled-inspector', providerVersion: '0.2.0',
    endpoint: credentialIdentity.endpoint, allowDevelopmentLoopbackHttp: false, outputSchema: { url: 'urn:controlled:inspection-schema', version: '1.0',
      hash: 'sha256:56a3a9af49ad3137f93420558aaa39bfd859d3d0f0e475b1fe0b7ebe338a7985' }, credentialIdentity, budgets };
  const config = { version: 1, purpose: 'formspec.photo.measurement.provider', registrationHash: jsonHash(registration), registration,
    formVersionHash: jsonHash(formVersion), policyHash: jsonHash(policy), jwksHash: byteHash(jwksBytes), serviceSubject: 'service-account-source-photo-client',
    photoInstanceName: 'photoCheck', photoPointer: '/data/photo', policyPointer: '/instances/photoPolicy/data', limits: { maxBytes: 200_000, maxPixels: 100000, deadlineMillis: 2000 } };
  const now = Date.now();
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } }).png().toBuffer();
  const reference = { kind: 'attachment-ref', uri: 'urn:formspec:attachment:controlled-one', hash: byteHash(bytes), size: bytes.length,
    filename: 'controlled.png', mimeType: 'image/png', upload_id: 'controlled-one', read_url: '/runtime/forms/controlled-form/attachments/controlled-one' };
  const native = { operation: 'hydrate', scope, owner: { sessionId: 'controlled-session', subjectRef: 'controlled-subject', authenticated: { issuer: 'https://applicant-issuer.example', subject: 'controlled-applicant',
    clientId: 'applicant-client', principalId: 'controlled-principal', profile: 'authenticated', actorRef: 'urn:controlled:applicant', subjectRef: 'controlled-subject', sessionId: 'controlled-session' } },
    selection, formVersion, draftId: 'draft_00000000000000000000000000000001', draftVersion: 1,
    canonicalResponse: { form: definition.url, formVersion: definition.version, data: { photo: reference }, status: 'in-progress' },
    sources: { photoCheck: 'urn:controlled:photo', other: 'urn:controlled:unsupported' } };
  native.candidateHash = jsonHash(native.canonicalResponse);
  native.requestHash = jsonHash({ operation: native.operation, scope, owner: native.owner, selection, formVersionHash: config.formVersionHash,
    draftId: native.draftId, draftVersion: native.draftVersion, candidateHash: native.candidateHash, sources: native.sources });
  const requestedAt = new Date(now).toISOString();
  const body = { version: 1, providerId: registration.providerId, providerVersion: registration.providerVersion, registrationHash: config.registrationHash,
    outputSchemaHash: registration.outputSchema.hash, requestHash: native.requestHash, requestedAt, nativeRequest: native,
    attachments: [{ reference, hash: reference.hash, contentType: reference.mimeType, bytesBase64: bytes.toString('base64') }], budgets };
  body.callHash = jsonHash({ requestHash: body.requestHash, registrationHash: body.registrationHash, outputSchemaHash: body.outputSchemaHash, requestedAt,
    attachments: [{ reference, hash: reference.hash, contentType: reference.mimeType, size: bytes.length }] });
  const claims = { iss: credentialIdentity.issuer, aud: credentialIdentity.audience, sub: config.serviceSubject,
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 300, typ: 'Bearer', azp: credentialIdentity.clientId, scope: 'formspec.instance.resolve' };
  const token = payload => new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: key.kid }).sign(privateKey);
  return { config, policyBytes, jwksBytes, claims, now, token, body, selected: loadProviderConfig(Buffer.from(JSON.stringify(config)), policyBytes, jwksBytes) };
}
