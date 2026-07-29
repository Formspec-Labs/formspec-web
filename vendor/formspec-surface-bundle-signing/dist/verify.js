import canonicalize from 'canonicalize';
import { decodeCoseSign1 } from '@integrity-stack/cose';
import { uri, } from '@integrity-stack/signature-port';
import { printParseErrorCode, visit, } from 'jsonc-parser';
export const SURFACE_BUNDLE_PROFILE = 'formspec-surface-bundle-signing-v1';
export const SURFACE_BUNDLE_SIGNING_DOMAIN = 'formspec.surface-bundle.signed-payload.v1';
const DOMAIN_BYTES = new TextEncoder().encode(SURFACE_BUNDLE_SIGNING_DOMAIN);
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const JSON_OPTIONS = {
    allowTrailingComma: false,
    disallowComments: true,
};
const verifiedInternals = new WeakMap();
export class SurfaceBundleProfileError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SurfaceBundleProfileError';
    }
}
/**
 * Parses one candidate snapshot and returns its recursively frozen signed
 * payload plus copied COSE bytes. Callers cannot supply a pre-parsed object.
 */
export function parseSurfaceBundleCandidate(candidateBytes) {
    const snapshot = new Uint8Array(candidateBytes);
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot);
    }
    catch {
        throw new SurfaceBundleProfileError('candidate is not valid UTF-8');
    }
    assertNoDuplicateKeysOrJsonErrors(text);
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new SurfaceBundleProfileError('invalid JSON');
    }
    const artifact = requireRecord(parsed, 'candidate');
    requireExactKeys(artifact, ['signedPayload', 'signature'], 'candidate');
    const payload = parseSignedPayload(artifact.signedPayload);
    const signature = requireRecord(artifact.signature, 'candidate.signature');
    requireExactKeys(signature, ['format', 'value'], 'candidate.signature');
    if (signature.format !== 'COSE_Sign1') {
        throw new SurfaceBundleProfileError('candidate.signature.format must equal COSE_Sign1');
    }
    if (typeof signature.value !== 'string'
        || signature.value.length === 0
        || !BASE64URL.test(signature.value)) {
        throw new SurfaceBundleProfileError('candidate.signature.value must be non-empty unpadded base64url');
    }
    return Object.freeze({
        payload,
        signatureBytes: decodeBase64Url(signature.value),
    });
}
/**
 * Constructs `domain || NUL || JCS(payload)` after applying the complete
 * profile-level input checks.
 */
export function buildSurfaceBundlePreimage(payload) {
    const checked = parseSignedPayload(payload);
    const canonical = canonicalize(checked);
    if (typeof canonical !== 'string') {
        throw new SurfaceBundleProfileError('JCS canonicalization produced no bytes');
    }
    const canonicalBytes = new TextEncoder().encode(canonical);
    const result = new Uint8Array(DOMAIN_BYTES.length + 1 + canonicalBytes.length);
    result.set(DOMAIN_BYTES, 0);
    result[DOMAIN_BYTES.length] = 0;
    result.set(canonicalBytes, DOMAIN_BYTES.length + 1);
    return result;
}
export async function verifySurfaceBundleCandidate(input) {
    let trustPolicy;
    let releasePolicy;
    let methodRegistry;
    try {
        trustPolicy = snapshotTrustPolicy(input.trustPolicy);
    }
    catch (error) {
        return unverified('trust-configuration-invalid', `deployment trust cannot be snapshotted: ${safeReason(error)}`);
    }
    try {
        releasePolicy = snapshotReleasePolicy(input.releasePolicy);
    }
    catch (error) {
        return unverified('release-configuration-invalid', `release policy cannot be snapshotted: ${safeReason(error)}`);
    }
    try {
        methodRegistry = immutableCopy(input.methodRegistry);
    }
    catch (error) {
        return unverified('verifier-unavailable', `method registry cannot be snapshotted: ${safeReason(error)}`);
    }
    let checkedAt;
    try {
        const observed = (input.now ?? (() => new Date()))();
        if (!(observed instanceof Date)
            || !Number.isFinite(observed.getTime())) {
            throw new Error('clock returned an invalid Date');
        }
        checkedAt = observed.toISOString();
    }
    catch (error) {
        return unverified('clock-unavailable', `host clock unavailable: ${safeReason(error)}`);
    }
    let candidate;
    let signedBytes;
    let digest;
    try {
        candidate = parseSurfaceBundleCandidate(input.candidateBytes);
        signedBytes = buildSurfaceBundlePreimage(candidate.payload);
        digest = await sha256Hex(signedBytes);
    }
    catch (error) {
        return failed('candidate-invalid', safeReason(error), { checkedAt });
    }
    let methodUri;
    let kid;
    try {
        const cose = decodeCoseSign1(new Uint8Array(candidate.signatureBytes));
        if (cose.payload !== null) {
            throw new SurfaceBundleProfileError('COSE_Sign1 payload must be detached');
        }
        if (cose.methodUri === null) {
            throw new SurfaceBundleProfileError('COSE protected header has no method_uri');
        }
        if (cose.kid === null || cose.kid.length === 0) {
            throw new SurfaceBundleProfileError('COSE protected header has no non-empty kid');
        }
        methodUri = cose.methodUri;
        kid = new Uint8Array(cose.kid);
    }
    catch (error) {
        return failed('signature-invalid', safeReason(error), { checkedAt, digest });
    }
    let receipt;
    try {
        receipt = await input.verifier.verify({
            signedBytes: new Uint8Array(signedBytes),
            signatureBytes: new Uint8Array(candidate.signatureBytes),
            methodUri: uri(methodUri),
            keyRef: {
                kind: 'kid',
                kid: new Uint8Array(kid),
            },
        }, methodRegistry);
    }
    catch (error) {
        return unverified('verifier-unavailable', `integrity verifier unavailable: ${safeReason(error)}`, { checkedAt, digest });
    }
    const receiptSnapshot = immutableCopy(receipt);
    if (receiptSnapshot.method !== methodUri) {
        return unverified('verifier-unavailable', 'integrity receipt method does not match protected method_uri', {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    if (receiptSnapshot.result === 'unsupported') {
        return unverified('integrity-unsupported', receiptSnapshot.reason ?? 'integrity method is unsupported', {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    if (receiptSnapshot.result !== 'verified') {
        return failed('integrity-failed', receiptSnapshot.reason ?? 'integrity verification failed', {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    let trust;
    try {
        trust = evaluateTrust(trustPolicy.authorities, kid, methodUri, candidate.payload, checkedAt);
    }
    catch (error) {
        return unverified('trust-configuration-invalid', `deployment trust configuration is invalid: ${safeReason(error)}`, {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    if (trust.kind === 'failed') {
        return failed(trust.code, trust.reason, {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    if (trust.kind === 'unverified') {
        return unverified(trust.code, trust.reason, {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    let release;
    try {
        release = await evaluateRelease(releasePolicy, candidate.payload, digest);
    }
    catch (error) {
        return unverified('release-configuration-invalid', `release policy is invalid: ${safeReason(error)}`, {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    if (release.kind === 'failed') {
        return failed(release.code, release.reason, {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    if (release.kind === 'unverified') {
        return unverified(release.code, release.reason, {
            checkedAt,
            digest,
            integrityReceipt: receiptSnapshot,
        });
    }
    const result = deepFreeze({
        status: 'verified',
        payload: candidate.payload,
        digest,
        checkedAt,
        integrityReceipt: receiptSnapshot,
        trust: trust.evidence,
        release: release.evidence,
    });
    verifiedInternals.set(result, releasePolicy.mode === 'pinned'
        ? { releaseMode: 'pinned' }
        : {
            releaseMode: 'monotonic',
            store: releasePolicy.store,
            monotonicCandidate: {
                sequence: candidate.payload.release.sequence,
                digest,
                releaseId: candidate.payload.release.id,
            },
        });
    return result;
}
/**
 * Runs host-owned schema, graph, actor, entry, and dereference checks before
 * the final atomic release commit. It accepts only a verified result issued by
 * this module.
 */
export async function admitVerifiedSurfaceBundle(input) {
    const internal = verifiedInternals.get(input.verification);
    if (!internal) {
        return Object.freeze({
            status: 'unavailable',
            code: 'verified-candidate-unrecognized',
            reason: 'verified candidate was not issued by this verifier instance',
            verification: input.verification,
        });
    }
    let hostResult;
    try {
        hostResult = await input.hostChecks(input.verification.payload, {
            digest: input.verification.digest,
            checkedAt: input.verification.checkedAt,
            integrityReceipt: input.verification.integrityReceipt,
            trust: input.verification.trust,
            release: input.verification.release,
        });
    }
    catch (error) {
        return Object.freeze({
            status: 'unavailable',
            code: 'host-checks-unavailable',
            reason: `host admission checks unavailable: ${safeReason(error)}`,
            verification: input.verification,
        });
    }
    if (hostResult.status === 'refused') {
        return Object.freeze({
            status: 'refused',
            code: hostResult.code,
            reason: hostResult.reason,
            verification: input.verification,
        });
    }
    if (hostResult.status === 'unavailable') {
        return Object.freeze({
            status: 'unavailable',
            code: hostResult.code,
            reason: hostResult.reason,
            verification: input.verification,
        });
    }
    if (hostResult.status !== 'passed') {
        return Object.freeze({
            status: 'unavailable',
            code: 'host-checks-invalid-result',
            reason: 'host admission checks returned an invalid result',
            verification: input.verification,
        });
    }
    if (internal.releaseMode === 'pinned') {
        return Object.freeze({
            status: 'admitted',
            payload: input.verification.payload,
            verification: input.verification,
            releaseCommit: 'not-required',
        });
    }
    let commit;
    try {
        commit = await internal.store.commitAdmitted(input.verification.payload.manifest.id, internal.monotonicCandidate);
    }
    catch (error) {
        return Object.freeze({
            status: 'unavailable',
            code: 'release-store-unavailable',
            reason: `atomic release commit unavailable: ${safeReason(error)}`,
            verification: input.verification,
        });
    }
    if (commit.status === 'unavailable') {
        return Object.freeze({
            status: 'unavailable',
            code: 'release-store-unavailable',
            reason: commit.reason,
            verification: input.verification,
        });
    }
    if (commit.status === 'rejected') {
        return Object.freeze({
            status: 'refused',
            code: commit.code === 'stale'
                ? 'release-stale-after-verification'
                : 'release-sequence-conflict-after-verification',
            reason: commit.code === 'stale'
                ? 'a newer release was admitted before this candidate committed'
                : 'different bytes for this release sequence were admitted before this candidate committed',
            verification: input.verification,
        });
    }
    if (commit.status !== 'committed'
        && commit.status !== 'already-current') {
        return Object.freeze({
            status: 'unavailable',
            code: 'release-store-invalid-result',
            reason: 'atomic release commit returned an invalid result',
            verification: input.verification,
        });
    }
    if (commit.state.sequence !== internal.monotonicCandidate.sequence
        || commit.state.digest !== internal.monotonicCandidate.digest
        || commit.state.releaseId !== internal.monotonicCandidate.releaseId) {
        return Object.freeze({
            status: 'unavailable',
            code: 'release-store-invalid-result',
            reason: 'atomic release commit did not confirm the admitted candidate',
            verification: input.verification,
        });
    }
    return Object.freeze({
        status: 'admitted',
        payload: input.verification.payload,
        verification: input.verification,
        releaseCommit: commit.status,
    });
}
function parseSignedPayload(value) {
    let snapshot;
    try {
        snapshot = structuredClone(value);
    }
    catch (error) {
        throw new SurfaceBundleProfileError(`signedPayload cannot be snapshotted: ${safeReason(error)}`);
    }
    assertJcsValue(snapshot, 'signedPayload');
    const payload = requireRecord(snapshot, 'signedPayload');
    requireExactKeys(payload, ['profile', 'publisher', 'release', 'manifest', 'documents'], 'signedPayload');
    if (payload.profile !== SURFACE_BUNDLE_PROFILE) {
        throw new SurfaceBundleProfileError(`signedPayload.profile must equal ${SURFACE_BUNDLE_PROFILE}`);
    }
    const publisher = requireRecord(payload.publisher, 'signedPayload.publisher');
    requireExactKeys(publisher, ['id'], 'signedPayload.publisher');
    const publisherId = requireCanonicalAbsoluteUri(publisher.id, 'signedPayload.publisher.id');
    const release = requireRecord(payload.release, 'signedPayload.release');
    requireExactKeys(release, ['id', 'sequence'], 'signedPayload.release');
    if (typeof release.id !== 'string' || release.id.length === 0) {
        throw new SurfaceBundleProfileError('signedPayload.release.id must be a non-empty string');
    }
    if (typeof release.sequence !== 'number'
        || !Number.isSafeInteger(release.sequence)
        || release.sequence < 0) {
        throw new SurfaceBundleProfileError('signedPayload.release.sequence must be a non-negative safe integer');
    }
    const manifest = requireRecord(payload.manifest, 'signedPayload.manifest');
    const appId = requireCanonicalAbsoluteUri(manifest.id, 'signedPayload.manifest.id');
    const documents = requireRecord(payload.documents, 'signedPayload.documents');
    for (const [documentUrl, document] of Object.entries(documents)) {
        requireCanonicalAbsoluteUri(documentUrl, `signedPayload.documents key ${JSON.stringify(documentUrl)}`);
        requireRecord(document, `signedPayload.documents[${JSON.stringify(documentUrl)}]`);
    }
    const checked = {
        profile: SURFACE_BUNDLE_PROFILE,
        publisher: { id: publisherId },
        release: {
            id: release.id,
            sequence: release.sequence,
        },
        manifest: {
            ...manifest,
            id: appId,
        },
        documents: {
            ...documents,
        },
    };
    return deepFreeze(checked);
}
function snapshotTrustPolicy(policy) {
    return immutableCopy(policy);
}
function snapshotReleasePolicy(policy) {
    if (policy.mode === 'pinned') {
        return immutableCopy({
            mode: 'pinned',
            allowed: policy.allowed,
        });
    }
    if (policy.mode === 'monotonic') {
        // The store is a stateful injected port and cannot be structured-cloned.
        // Capture its exact reference and the mode in a new immutable record.
        return Object.freeze({
            mode: 'monotonic',
            store: policy.store,
        });
    }
    throw new SurfaceBundleProfileError('release policy mode is unsupported');
}
function assertNoDuplicateKeysOrJsonErrors(text) {
    const objectKeys = [];
    let firstError;
    visit(text, {
        onObjectBegin: () => {
            objectKeys.push(new Set());
        },
        onObjectProperty: (property) => {
            const keys = objectKeys[objectKeys.length - 1];
            if (!keys) {
                firstError ??= 'JSON parser reported a property outside an object';
                return;
            }
            if (keys.has(property)) {
                firstError ??= `duplicate object key: ${JSON.stringify(property)}`;
                return;
            }
            keys.add(property);
        },
        onObjectEnd: () => {
            objectKeys.pop();
        },
        onError: (error) => {
            firstError ??= `invalid JSON: ${printParseErrorCode(error)}`;
        },
    }, JSON_OPTIONS);
    if (firstError) {
        throw new SurfaceBundleProfileError(firstError);
    }
}
function assertJcsValue(value, path, seen = new Set()) {
    if (value === null || typeof value === 'boolean') {
        return;
    }
    if (typeof value === 'string') {
        if (hasLoneSurrogate(value)) {
            throw new SurfaceBundleProfileError(`${path} contains a lone Unicode surrogate`);
        }
        return;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new SurfaceBundleProfileError(`${path} contains a non-finite number`);
        }
        return;
    }
    if (typeof value !== 'object') {
        throw new SurfaceBundleProfileError(`${path} contains a value outside the JCS input domain`);
    }
    if (seen.has(value)) {
        throw new SurfaceBundleProfileError(`${path} contains a cycle`);
    }
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            assertJcsValue(item, `${path}[${index}]`, seen);
        });
    }
    else {
        const record = requireRecord(value, path);
        for (const [key, item] of Object.entries(record)) {
            if (hasLoneSurrogate(key)) {
                throw new SurfaceBundleProfileError(`${path} contains a property name with a lone Unicode surrogate`);
            }
            assertJcsValue(item, `${path}.${key}`, seen);
        }
    }
    seen.delete(value);
}
function evaluateTrust(authorities, kid, methodUri, payload, checkedAt) {
    if (!Array.isArray(authorities) || authorities.length === 0) {
        return {
            kind: 'unverified',
            code: 'trust-configuration-invalid',
            reason: 'deployment trust must contain at least one publisher authority',
        };
    }
    for (const authority of authorities) {
        const configurationError = validateAuthority(authority);
        if (configurationError) {
            return {
                kind: 'unverified',
                code: 'trust-configuration-invalid',
                reason: configurationError,
            };
        }
    }
    const matching = authorities.filter((authority) => bytesEqual(authority.kid, kid));
    if (matching.length === 0) {
        return {
            kind: 'failed',
            code: 'publisher-unauthorized',
            reason: 'protected kid has no publisher authority',
        };
    }
    if (matching.length !== 1) {
        return {
            kind: 'unverified',
            code: 'trust-configuration-invalid',
            reason: 'deployment trust has more than one authority for protected kid',
        };
    }
    const authority = matching[0];
    if (!authority) {
        return {
            kind: 'unverified',
            code: 'trust-configuration-invalid',
            reason: 'deployment trust lookup failed',
        };
    }
    if (authority.revoked) {
        return {
            kind: 'failed',
            code: 'authority-revoked',
            reason: 'publisher authority is revoked',
        };
    }
    const checkedMs = Date.parse(checkedAt);
    const validFromMs = Date.parse(authority.validFrom);
    const validUntilMs = Date.parse(authority.validUntil);
    if (checkedMs < validFromMs) {
        return {
            kind: 'failed',
            code: 'authority-not-yet-valid',
            reason: 'publisher authority is not yet valid',
        };
    }
    if (checkedMs >= validUntilMs) {
        return {
            kind: 'failed',
            code: 'authority-expired',
            reason: 'publisher authority has expired',
        };
    }
    if (payload.publisher.id !== authority.publisherId) {
        return {
            kind: 'failed',
            code: 'publisher-unauthorized',
            reason: 'signed publisher does not match deployment trust',
        };
    }
    if (!authority.methods.includes(methodUri)) {
        return {
            kind: 'failed',
            code: 'method-unauthorized',
            reason: 'protected method_uri is not allowed for this publisher authority',
        };
    }
    if (!appIsAuthorized(payload.manifest.id, authority)) {
        return {
            kind: 'failed',
            code: 'app-unauthorized',
            reason: 'publisher authority does not permit the signed app identity',
        };
    }
    return {
        kind: 'authorized',
        evidence: {
            status: 'authorized',
            kid: encodeBase64Url(kid),
            publisherId: authority.publisherId,
            publisherDisplayName: authority.publisherDisplayName,
            appId: payload.manifest.id,
            methodUri,
            validFrom: authority.validFrom,
            validUntil: authority.validUntil,
            revoked: false,
        },
    };
}
async function evaluateRelease(policy, payload, digest) {
    if (policy.mode === 'pinned') {
        if (policy.allowed.length === 0
            || policy.allowed.some((pin) => !HEX_SHA256.test(pin.digest)
                || (pin.releaseId !== undefined && pin.releaseId.length === 0))) {
            return {
                kind: 'unverified',
                code: 'release-configuration-invalid',
                reason: 'pinned release policy has no valid digest pins',
            };
        }
        const matched = policy.allowed.some((pin) => pin.digest === digest
            && (pin.releaseId === undefined || pin.releaseId === payload.release.id));
        if (!matched) {
            return {
                kind: 'failed',
                code: 'release-not-pinned',
                reason: 'signed release does not match a deployment pin',
            };
        }
        return {
            kind: 'current',
            evidence: {
                status: 'current',
                mode: 'pinned',
                releaseId: payload.release.id,
                sequence: payload.release.sequence,
                digest,
            },
        };
    }
    let current;
    try {
        current = await policy.store.read(payload.manifest.id);
    }
    catch (error) {
        return {
            kind: 'unverified',
            code: 'release-store-unavailable',
            reason: `cannot read monotonic release state: ${safeReason(error)}`,
        };
    }
    if (current !== null) {
        const stateError = validateReleaseState(current);
        if (stateError) {
            return {
                kind: 'unverified',
                code: 'release-store-unavailable',
                reason: stateError,
            };
        }
        if (payload.release.sequence < current.sequence) {
            return {
                kind: 'failed',
                code: 'release-stale',
                reason: 'signed release sequence is below the admitted high-water mark',
            };
        }
        if (payload.release.sequence === current.sequence
            && digest !== current.digest) {
            return {
                kind: 'failed',
                code: 'release-sequence-conflict',
                reason: 'signed release reuses the admitted sequence with different bytes',
            };
        }
    }
    return {
        kind: 'current',
        evidence: {
            status: 'current',
            mode: 'monotonic',
            releaseId: payload.release.id,
            sequence: payload.release.sequence,
            digest,
            previous: current === null ? null : { ...current },
        },
    };
}
function validateAuthority(authority) {
    if (authority === null || typeof authority !== 'object') {
        return 'publisher authority must be an object';
    }
    if (!(authority.kid instanceof Uint8Array) || authority.kid.length === 0) {
        return 'publisher authority kid must contain bytes';
    }
    try {
        requireCanonicalAbsoluteUri(authority.publisherId, 'publisher authority publisherId');
    }
    catch (error) {
        return safeReason(error);
    }
    if (typeof authority.publisherDisplayName !== 'string'
        || authority.publisherDisplayName.trim().length === 0) {
        return 'publisher authority display name must be non-empty';
    }
    if (!Array.isArray(authority.methods) || authority.methods.length === 0) {
        return 'publisher authority must allow at least one method';
    }
    for (const method of authority.methods) {
        try {
            requireCanonicalAbsoluteUri(method, 'publisher authority method');
        }
        catch (error) {
            return safeReason(error);
        }
    }
    if (authority.appIds !== undefined
        && !Array.isArray(authority.appIds)) {
        return 'publisher authority appIds must be an array';
    }
    if (authority.appNamespaces !== undefined
        && !Array.isArray(authority.appNamespaces)) {
        return 'publisher authority appNamespaces must be an array';
    }
    const appIds = authority.appIds ?? [];
    const namespaces = authority.appNamespaces ?? [];
    if (appIds.length === 0 && namespaces.length === 0) {
        return 'publisher authority must permit an app ID or namespace';
    }
    for (const appId of appIds) {
        try {
            requireCanonicalAbsoluteUri(appId, 'publisher authority app ID');
        }
        catch (error) {
            return safeReason(error);
        }
    }
    for (const namespace of namespaces) {
        try {
            const parsed = new URL(namespace);
            if (parsed.protocol !== 'https:'
                || parsed.href !== namespace
                || !namespace.endsWith('/')
                || parsed.search !== ''
                || parsed.hash !== '') {
                return 'publisher authority namespace must be a canonical HTTPS URL ending in /';
            }
        }
        catch {
            return 'publisher authority namespace must be a canonical HTTPS URL ending in /';
        }
    }
    if (typeof authority.revoked !== 'boolean') {
        return 'publisher authority revoked must be a boolean';
    }
    const validFrom = parseRfc3339(authority.validFrom);
    const validUntil = parseRfc3339(authority.validUntil);
    if (validFrom === null
        || validUntil === null
        || validFrom >= validUntil) {
        return 'publisher authority validity interval is invalid';
    }
    return null;
}
function parseRfc3339(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
        .exec(value);
    if (!match) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthLengths = [
        31,
        leap ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    const maxDay = monthLengths[month - 1] ?? 0;
    if (month < 1
        || month > 12
        || day < 1
        || day > maxDay
        || hour > 23
        || minute > 59
        || second > 59) {
        return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function appIsAuthorized(appId, authority) {
    if ((authority.appIds ?? []).includes(appId)) {
        return true;
    }
    return (authority.appNamespaces ?? []).some((namespace) => appId.startsWith(namespace));
}
function validateReleaseState(state) {
    if (!Number.isSafeInteger(state.sequence) || state.sequence < 0) {
        return 'monotonic release store returned an invalid sequence';
    }
    if (!HEX_SHA256.test(state.digest)) {
        return 'monotonic release store returned an invalid digest';
    }
    if (state.releaseId.length === 0) {
        return 'monotonic release store returned an empty release ID';
    }
    return null;
}
function requireRecord(value, path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new SurfaceBundleProfileError(`${path} must be an object`);
    }
    return value;
}
function requireExactKeys(value, expected, path) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        throw new SurfaceBundleProfileError(`${path} must contain exactly: ${wanted.join(', ')}`);
    }
}
function requireCanonicalAbsoluteUri(value, path) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new SurfaceBundleProfileError(`${path} must be a canonical absolute URI`);
    }
    try {
        const parsed = new URL(value);
        if (parsed.href !== value) {
            throw new Error('not canonical');
        }
    }
    catch {
        throw new SurfaceBundleProfileError(`${path} must be a canonical absolute URI`);
    }
    return value;
}
function hasLoneSurrogate(value) {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (index + 1 >= value.length
                || next < 0xdc00
                || next > 0xdfff) {
                return true;
            }
            index += 1;
        }
        else if (code >= 0xdc00 && code <= 0xdfff) {
            return true;
        }
    }
    return false;
}
function decodeBase64Url(value) {
    if (value.length % 4 === 1) {
        throw new SurfaceBundleProfileError('candidate.signature.value is not valid base64url');
    }
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')
        + '='.repeat((4 - (value.length % 4)) % 4);
    let binary;
    try {
        binary = atob(padded);
    }
    catch {
        throw new SurfaceBundleProfileError('candidate.signature.value is not valid base64url');
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (encodeBase64Url(bytes) !== value) {
        throw new SurfaceBundleProfileError('candidate.signature.value is not canonical base64url');
    }
    return bytes;
}
function encodeBase64Url(bytes) {
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/u, '');
}
async function sha256Hex(bytes) {
    const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(result)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
function bytesEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
    }
    return difference === 0;
}
function deepFreeze(value) {
    if (ArrayBuffer.isView(value)) {
        // Typed arrays cannot be frozen in JavaScript. Every security-sensitive
        // byte array is copied before reaching this helper and remains private.
        return value;
    }
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function immutableCopy(value) {
    return deepFreeze(structuredClone(value));
}
function safeReason(error) {
    const raw = error instanceof Error ? error.message : String(error);
    // Keep adapter and parser errors safe for logs and person-facing refusal UI.
    // eslint-disable-next-line no-control-regex
    const cleaned = raw
        .replace(/[\x00-\x1f\x7f\u00ad\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    return cleaned.length > 200 ? `${cleaned.slice(0, 199)}…` : cleaned;
}
function failed(code, reason, evidence = {}) {
    return deepFreeze({
        status: 'failed',
        code,
        reason: safeReason(reason),
        ...evidence,
    });
}
function unverified(code, reason, evidence = {}) {
    return deepFreeze({
        status: 'unverified',
        code,
        reason: safeReason(reason),
        ...evidence,
    });
}
