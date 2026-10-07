/** @filedesc Response envelope, validation report, changelog migration, and pinned-definition resolution. */
import { wasmApplyMigrationsToResponseData } from '../wasm-bridge-runtime.js';
import { cloneValue, toValidationResult } from './helpers.js';
function resolveResponseId(explicitId, authoredSignatures) {
    if (explicitId) {
        return explicitId;
    }
    if (!authoredSignatures || authoredSignatures.length === 0) {
        return undefined;
    }
    const responseIds = new Set(authoredSignatures
        .map((signature) => signature.signedPayload?.responseId)
        .filter((value) => typeof value === 'string' && value.trim().length > 0));
    if (responseIds.size === 0) {
        throw new Error('authoredSignatures require meta.id on getResponse(), or a single agreed non-empty signedPayload.responseId among signature records');
    }
    if (responseIds.size > 1) {
        throw new Error('authoredSignatures must agree on a single signedPayload.responseId');
    }
    return [...responseIds][0];
}
function pickIdentityBinding(binding) {
    if (!binding) {
        return undefined;
    }
    const out = {
        method: binding.method,
        assuranceLevel: binding.assuranceLevel,
    };
    if (binding.providerRef !== undefined) {
        out.providerRef = binding.providerRef;
    }
    if (binding.externalAttestationRef !== undefined) {
        out.externalAttestationRef = binding.externalAttestationRef;
    }
    return out;
}
function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} is required`);
    }
    return value;
}
function normalizeSignedPayload(signature, index, responseId, definitionUrl, definitionVersion) {
    const signedPayload = signature.signedPayload;
    if (!signedPayload) {
        throw new Error(`authoredSignatures[${index}].signedPayload is required`);
    }
    if (signedPayload.canonicalization !== 'formspec-response-signing-v1') {
        throw new Error(`authoredSignatures[${index}].signedPayload.canonicalization must be formspec-response-signing-v1`);
    }
    if (signedPayload.digestAlgorithm !== 'sha-256') {
        throw new Error(`authoredSignatures[${index}].signedPayload.digestAlgorithm must be sha-256`);
    }
    requireNonEmptyString(signedPayload.digest, `authoredSignatures[${index}].signedPayload.digest`);
    if (signedPayload.responseId !== responseId) {
        throw new Error(`SIGNED_PAYLOAD_RESPONSE_ID_MISMATCH: authoredSignatures[${index}].signedPayload.responseId must match the Response id`);
    }
    if (signedPayload.definitionUrl !== definitionUrl) {
        throw new Error(`SIGNED_PAYLOAD_DEFINITION_URL_MISMATCH: authoredSignatures[${index}].signedPayload.definitionUrl must match the Response definitionUrl`);
    }
    if (signedPayload.definitionVersion !== definitionVersion) {
        throw new Error(`SIGNED_PAYLOAD_DEFINITION_VERSION_MISMATCH: authoredSignatures[${index}].signedPayload.definitionVersion must match the Response definitionVersion`);
    }
    if (signedPayload.signingIntent !== signature.signingIntent) {
        throw new Error(`SIGNED_PAYLOAD_SIGNING_INTENT_MISMATCH: authoredSignatures[${index}].signedPayload.signingIntent must match the authored signature signingIntent`);
    }
    if (signedPayload.signedAt !== signature.signedAt) {
        throw new Error(`SIGNED_PAYLOAD_SIGNED_AT_MISMATCH: authoredSignatures[${index}].signedPayload.signedAt must match the authored signature signedAt input`);
    }
    return {
        canonicalization: signedPayload.canonicalization,
        digestAlgorithm: signedPayload.digestAlgorithm,
        digest: signedPayload.digest,
        responseId: signedPayload.responseId,
        definitionUrl: signedPayload.definitionUrl,
        definitionVersion: signedPayload.definitionVersion,
        signedAt: signedPayload.signedAt,
        signingIntent: signedPayload.signingIntent,
    };
}
/** Emit only JSON-Schema–declared AuthoredSignature properties (additionalProperties: false). */
function toNormalizedAuthoredSignatureRecord(signature, index, responseId, definitionUrl, definitionVersion, meta) {
    const signerName = signature.signerName ?? meta?.author?.name;
    if (!signerName || !signerName.trim()) {
        throw new Error(`authoredSignatures[${index}] requires signerName or meta.author.name`);
    }
    const signatureId = requireNonEmptyString(signature.signatureId, `authoredSignatures[${index}].signatureId`);
    const signingIntent = requireNonEmptyString(signature.signingIntent, `authoredSignatures[${index}].signingIntent`);
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(signingIntent)) {
        throw new Error(`SIGNED_PAYLOAD_SIGNING_INTENT_MISSING: authoredSignatures[${index}].signingIntent must be a valid URI`);
    }
    if (typeof signature.signedAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(signature.signedAt)) {
        throw new Error(`SIGNED_PAYLOAD_SIGNED_AT_INVALID: authoredSignatures[${index}].signedAt must be a valid RFC 3339 timestamp`);
    }
    const signedPayload = normalizeSignedPayload(signature, index, responseId, definitionUrl, definitionVersion);
    const signerId = signature.signerId ?? meta?.author?.id;
    const record = {
        signatureId,
        documentId: signature.documentId,
        signingIntent,
        signatureValue: signature.signatureValue,
        signerName: signerName.trim(),
        consentAccepted: signature.consentAccepted,
        consentTextRef: signature.consentTextRef,
        consentVersion: signature.consentVersion,
        affirmationText: signature.affirmationText,
        signedPayload,
        documentHash: signature.documentHash,
        documentHashAlgorithm: signature.documentHashAlgorithm,
        signatureProvider: signature.signatureProvider,
        ceremonyId: signature.ceremonyId,
    };
    if (signature.signerEvidence !== undefined) {
        record.signerEvidence = { kind: signature.signerEvidence.kind, value: signature.signerEvidence.value };
    }
    if (signerId !== undefined) {
        record.signerId = signerId;
    }
    if (signature.verificationReceipt !== undefined) {
        record.verificationReceipt = signature.verificationReceipt;
    }
    if (signature.identityProofRef !== undefined) {
        record.identityProofRef = signature.identityProofRef;
    }
    const identityBinding = pickIdentityBinding(signature.identityBinding);
    if (identityBinding) {
        record.identityBinding = identityBinding;
    }
    return record;
}
/**
 * Append whole-response signing evidence to an already emitted, completed JSON Response.
 * Preserves all other Response content and returns independent nested objects. Does not
 * emit a Response, read a clock, or verify COSE bytes, digests, identity or receipt claims.
 * Callers must provide a valid Response snapshot and provider evidence; validate the
 * resulting document against the Response schema before transport when required.
 */
export function attachAuthoredSignature(response, signature) {
    const snapshot = response;
    if (!snapshot || snapshot.$formspecResponse !== '1.0' || snapshot.status !== 'completed') {
        throw new Error('attachAuthoredSignature requires a completed Formspec Response');
    }
    const responseId = requireNonEmptyString(snapshot.id, 'Response.id');
    const definitionUrl = requireNonEmptyString(snapshot.definitionUrl, 'Response.definitionUrl');
    const definitionVersion = requireNonEmptyString(snapshot.definitionVersion, 'Response.definitionVersion');
    if (!signature || 'partyRole' in signature || 'coveredPaths' in signature) {
        throw new Error('attachAuthoredSignature accepts whole-response evidence only');
    }
    const prior = snapshot.authoredSignatures;
    if (prior !== undefined && !Array.isArray(prior)) {
        throw new Error('Response.authoredSignatures must be an array');
    }
    if (prior?.some((entry) => entry?.signatureId === signature.signatureId)) {
        throw new Error('Duplicate authored signature ID');
    }
    // Admission checks supplement the maintained emission normalizer. They do not
    // authenticate any claim; optional receipts remain provider-supplied evidence.
    const requiredText = ['signatureId', 'documentId', 'signerName', 'signatureValue',
        'consentTextRef', 'consentVersion', 'affirmationText', 'documentHash',
        'documentHashAlgorithm', 'signatureProvider', 'ceremonyId'];
    for (const field of requiredText)
        requireNonEmptyString(signature[field], `signature.${field}`);
    if (signature.consentAccepted !== true)
        throw new Error('signature.consentAccepted must be true');
    const requirePattern = (value, pattern, field) => {
        if (!pattern.test(value))
            throw new Error(`signature.${field} is invalid`);
    };
    const uri = /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]+$/;
    requirePattern(definitionUrl, uri, 'signedPayload.definitionUrl');
    requirePattern(signature.signingIntent, uri, 'signingIntent');
    requirePattern(signature.consentTextRef, uri, 'consentTextRef');
    requirePattern(signature.documentId, /^[a-zA-Z][a-zA-Z0-9_-]*$/, 'documentId');
    requirePattern(signature.signatureValue, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'signatureValue');
    requirePattern(signature.documentHash, /^[A-Fa-f0-9]{64,128}$/, 'documentHash');
    requirePattern(signature.documentHashAlgorithm, /^(sha-256|sha-384|sha-512|x-[a-z0-9][a-z0-9-]*)$/, 'documentHashAlgorithm');
    if (!signature.signedPayload || !/^[A-Fa-f0-9]{64}$/.test(signature.signedPayload.digest)) {
        throw new Error('signature.signedPayload.digest must be a SHA-256 hex digest');
    }
    requireNonEmptyString(signature.signedAt, 'signature.signedAt');
    requirePattern(signature.signedAt, /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/, 'signedAt');
    const calendarDate = typeof signature.signedAt === 'string' ? signature.signedAt.slice(0, 10) : '';
    const parsedDate = new Date(`${calendarDate}T00:00:00Z`);
    if (!Number.isFinite(Date.parse(signature.signedAt)) || !Number.isFinite(parsedDate.getTime())
        || parsedDate.toISOString().slice(0, 10) !== calendarDate) {
        throw new Error('signature.signedAt is invalid');
    }
    if (signature.signerEvidence !== undefined) {
        if (!['drawn', 'typed', 'provider-receipt'].includes(signature.signerEvidence.kind)) {
            throw new Error('signature.signerEvidence.kind is invalid');
        }
        requireNonEmptyString(signature.signerEvidence.value, 'signature.signerEvidence.value');
    }
    const normalized = toNormalizedAuthoredSignatureRecord(signature, (prior ?? []).length, responseId, definitionUrl, definitionVersion, undefined);
    const result = cloneValue(response);
    result.authoredSignatures = [...(result.authoredSignatures ?? []), cloneValue(normalized)];
    return result;
}
function prepareAuthoredSignaturesSection(meta, responsePins) {
    const signatures = meta?.authoredSignatures;
    if (!signatures || signatures.length === 0) {
        return { authoredSignatures: undefined, envelopeResponseId: meta?.id };
    }
    const responseId = resolveResponseId(meta?.id, signatures);
    if (!responseId) {
        throw new Error('authoredSignatures require a stable response id');
    }
    const normalized = signatures.map((sig, i) => toNormalizedAuthoredSignatureRecord(sig, i, responseId, responsePins.definitionUrl, responsePins.definitionVersion, meta));
    return { authoredSignatures: normalized, envelopeResponseId: responseId };
}
export function buildFormspecResponseEnvelope(options) {
    const definitionUrl = options.definition.url ?? 'http://example.org/form';
    const definitionVersion = options.definition.version ?? '1.0.0';
    const { authoredSignatures, envelopeResponseId } = prepareAuthoredSignaturesSection(options.meta, {
        definitionUrl,
        definitionVersion,
    });
    const response = {
        $formspecResponse: '1.0',
        definitionUrl,
        definitionVersion,
        status: options.completionEligible && options.report?.valid ? 'completed' : 'in-progress',
        data: options.data,
        authored: options.timestamp,
    };
    if (options.report) {
        response.validationResults = options.report.results;
    }
    if (envelopeResponseId) {
        response.id = envelopeResponseId;
    }
    if (options.meta?.author) {
        response.author = options.meta.author;
    }
    if (options.meta?.subject) {
        response.subject = options.meta.subject;
    }
    if (options.displayedIssuer) {
        response.displayedIssuer = options.displayedIssuer;
    }
    if (options.displayedLocale) {
        response.displayedLocale = options.displayedLocale;
    }
    if (authoredSignatures) {
        response.authoredSignatures = authoredSignatures;
    }
    return response;
}
/** Shape validations for a specific timing, from a WASM eval with the matching trigger. */
export function collectTimedShapeValidationResults(evalResult, shapeTiming, timing) {
    const results = [];
    for (const validation of evalResult.validations) {
        if (!validation.shapeId) {
            continue;
        }
        if ((shapeTiming.get(validation.shapeId) ?? 'continuous') === timing) {
            results.push(toValidationResult(validation));
        }
    }
    return results;
}
/** Strip optional cardinality `source`, compute counts, and wrap the spec envelope. */
export function buildValidationReportEnvelope(results, timestamp, definitionUrl, definitionVersion) {
    const finalResults = results.map((result) => {
        if (result.constraintKind === 'cardinality') {
            const { source: _source, ...rest } = result;
            return rest;
        }
        return result;
    });
    const counts = { error: 0, warning: 0, info: 0 };
    for (const result of finalResults) {
        counts[result.severity] += 1;
    }
    const report = {
        $formspecValidationReport: '1.0',
        valid: counts.error === 0,
        results: finalResults,
        counts,
        timestamp,
    };
    if (definitionUrl) {
        report.definitionUrl = definitionUrl;
    }
    if (definitionVersion) {
        report.definitionVersion = definitionVersion;
    }
    return report;
}
export function migrateResponseData(definition, responseData, fromVersion, options) {
    // Core §6.7: `migrations.from[<version>]` names the descriptor; no descriptor, no change.
    if (!definition.migrations?.from?.[fromVersion]) {
        return responseData;
    }
    return JSON.parse(wasmApplyMigrationsToResponseData(JSON.stringify(definition), JSON.stringify(responseData), fromVersion, options.nowIso));
}
export function resolvePinnedDefinition(response, definitions) {
    const exact = definitions.find((definition) => definition.url === response.definitionUrl
        && definition.version === response.definitionVersion);
    if (exact) {
        return exact;
    }
    const availableVersions = definitions
        .filter((definition) => definition.url === response.definitionUrl)
        .map((definition) => definition.version)
        .filter((version) => typeof version === 'string')
        .sort();
    let message = `No definition found for pinned response ${response.definitionUrl}@${response.definitionVersion}`;
    if (availableVersions.length > 0) {
        message += `; available versions: ${availableVersions.join(', ')}`;
    }
    throw new Error(message);
}
