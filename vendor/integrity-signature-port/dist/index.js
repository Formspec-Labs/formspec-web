export function semVer(s) { return s; }
export function uri(s) { return s; }
export function kidOrThumbprint(s) { return s; }
/** Helper: build a `KeyRef.Kid` from raw bytes. */
export function keyRefKid(kid) {
    return { kind: 'kid', kid };
}
/** Helper: build a `KeyRef.RawPublicKey` from raw bytes. */
export function keyRefRawPublicKey(publicKey) {
    return { kind: 'rawPublicKey', publicKey };
}
export class KeyResolverError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'KeyResolverError';
    }
}
/**
 * `Map`-backed {@link KeyResolver} for tests and simple in-process composition.
 *
 * Resolves `KeyRef.kid` via direct lookup. `KeyRef.rawPublicKey` is rejected
 * with `unsupported_key_ref` — adapters never route `rawPublicKey` through
 * a resolver because the caller has already committed to those bytes.
 *
 * Production deployments substitute a real resolver (KMS, Trellis-managed
 * key bag, etc.) at the composition root.
 */
export class StaticKeyResolver {
    constructor(keys) {
        this.keys = new Map();
        if (keys) {
            const iterable = keys instanceof Map ? keys.entries() : keys;
            for (const [kid, publicKey] of iterable) {
                this.keys.set(byteKey(kid), publicKey);
            }
        }
    }
    /** Inserts a `kid → publicKey` binding. */
    insert(kid, publicKey) {
        this.keys.set(byteKey(kid), publicKey);
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    async resolve(keyRef) {
        if (keyRef.kind === 'kid') {
            const value = this.keys.get(byteKey(keyRef.kid));
            if (!value) {
                throw new KeyResolverError('key_not_found', `static resolver: kid not found (${keyRef.kid.length} bytes)`);
            }
            return value;
        }
        throw new KeyResolverError('unsupported_key_ref', 'rawPublicKey bypasses resolution; adapters must short-circuit');
    }
    resolverId() {
        return StaticKeyResolver.RESOLVER_ID;
    }
}
StaticKeyResolver.RESOLVER_ID = 'urn:integrity-stack:key-resolver:static@1';
/**
 * Encodes a `Uint8Array` as a `Map` key. `Uint8Array` identity is reference-
 * based, so we route lookups through a hex string. Internal to
 * {@link StaticKeyResolver}.
 */
function byteKey(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}
export class VerifierError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'VerifierError';
    }
}
/**
 * Sanitize an attacker-influenced reason string for inclusion in a
 * `VerificationReceipt.reason` (or `VerifierError.message`). Caps length,
 * collapses whitespace, strips ASCII control chars. Adapters MUST funnel
 * `String(e)` through this before surfacing it to callers.
 */
export function sanitizeReason(input, maxLen = 200) {
    // Replace ASCII control + DEL, bidi-overrides (LRE/RLE/PDF/LRO/RLO,
    // LRI/RLI/FSI/PDI), invisible joiners (ZWSP/ZWNJ/ZWJ + LRM/RLM),
    // BOM/ZWNBSP, and soft-hyphen with a single space; collapse runs of
    // whitespace; trim; cap length. Bidi/invisible chars don't bypass crypto
    // but let attacker-controlled bytes deceive humans reading the reason in
    // terminal / HTML log viewers.
    // eslint-disable-next-line no-control-regex
    const stripped = input.replace(/[\x00-\x1f\x7f­​-‏‪-‮⁦-⁩﻿]/g, ' ');
    const collapsed = stripped.replace(/\s+/g, ' ').trim();
    return collapsed.length > maxLen
        ? `${collapsed.slice(0, maxLen - 1)}…`
        : collapsed;
}
export function resolveRegistryEntry(registry, method) {
    return registry.entries.find((e) => e.id === method);
}
