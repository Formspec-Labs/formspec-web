export type SemVer = string & {
    readonly __brand: 'SemVer';
};
export type Uri = string & {
    readonly __brand: 'Uri';
};
/**
 * Receipt-side identifier for the key the verification was performed against.
 *
 * Kept on `KeyInfo.ref` (audit / display) where a stringly-typed marker is
 * the right shape — the verifier has already settled the identifier vs
 * key-material question at that point. The *request* side migrated off this
 * type to the typed {@link KeyRef} union (fs-0gzb / fs-skj0).
 */
export type KidOrThumbprint = string & {
    readonly __brand: 'KidOrThumbprint';
};
export declare function semVer(s: string): SemVer;
export declare function uri(s: string): Uri;
export declare function kidOrThumbprint(s: string): KidOrThumbprint;
/**
 * Typed key reference passed to {@link Verifier}.
 *
 * Replaces the stringly-typed `KidOrThumbprint` that previously rode in
 * `VerifyRequest.keyRef` (fs-0gzb). The old shape conflated *identifier*
 * (kid) with *key material* (raw bytes); the adapter base64-decoded the
 * string and used the result as both. That kept a kid-swap vector live: a
 * COSE envelope could claim `kid = A` while the caller resolved key bytes
 * for a different identifier. The two cases are now disjoint variants and
 * the adapter binds `cose.kid == KeyRef.kid` before any signature primitive
 * runs.
 *
 * Minimal viable set — `Did`, `Urn`, and `Thumbprint` variants are deferred
 * until a concrete resolver lands.
 */
export type KeyRef = {
    /** COSE `kid` bytes. The verifier resolves key material via the configured {@link KeyResolver}. */
    kind: 'kid';
    kid: Uint8Array;
} | {
    /**
     * Raw public-key bytes. Bypasses resolution — the caller has already
     * committed to this exact key. The `cose.kid` ↔ `keyRef` binding check
     * is skipped because there is no identifier to bind.
     */
    kind: 'rawPublicKey';
    publicKey: Uint8Array;
};
/** Helper: build a `KeyRef.Kid` from raw bytes. */
export declare function keyRefKid(kid: Uint8Array): KeyRef;
/** Helper: build a `KeyRef.RawPublicKey` from raw bytes. */
export declare function keyRefRawPublicKey(publicKey: Uint8Array): KeyRef;
export type VerificationResult = 'verified' | 'failed' | 'unsupported';
export interface AdapterInfo {
    id: Uri;
    version: SemVer;
}
export interface KeyInfo {
    ref: KidOrThumbprint;
    version?: string;
    snapshot?: string;
}
export interface RevocationContext {
    kind: 'ocsp' | 'crl' | 'witness';
    responseHash: string;
}
export interface TimestampingContext {
    authority: Uri;
    receiptHash: string;
}
export interface WitnessContext {
    anchor: {
        eventHash: string;
        ledgerScope: string;
    };
}
export interface VerificationContext {
    revocation?: RevocationContext;
    timestamping?: TimestampingContext;
    witness?: WitnessContext;
}
export interface VerificationReceipt {
    result: VerificationResult;
    method: Uri;
    methodRegistryVersion: SemVer;
    adapter: AdapterInfo;
    key: KeyInfo;
    verifiedAt: string;
    /**
     * Human-readable diagnostic for non-`verified` verdicts. Always sanitized
     * (length-capped, control chars stripped) — attacker-controlled bytes from
     * COSE decoders / WebCrypto exceptions flow through this field. Never
     * present on `verified` receipts. Adapter-internal errors do NOT use this
     * field; they throw `VerifierError` with code `'internal'` instead.
     */
    reason?: string;
    context?: VerificationContext;
    receiptBytes?: string;
}
export interface VerifyRequest {
    signedBytes: Uint8Array;
    signatureBytes: Uint8Array;
    methodUri: Uri;
    keyRef: KeyRef;
}
/**
 * Resolves a {@link KeyRef} to raw public-key bytes.
 *
 * Adapters consume this port via constructor injection (e.g.
 * `new WebCryptoVerifier({ keyResolver })`). The default constructor wires
 * an empty {@link StaticKeyResolver} — any `KeyRef.kid` resolution returns
 * `KeyResolverError('key_not_found')`, leaving only the `rawPublicKey` path
 * live for tests and direct-key callers.
 *
 * Async — WebCrypto-backed resolvers are async, so the port is async on the
 * TS side. The Rust twin is sync.
 */
export interface KeyResolver {
    /**
     * Returns raw public-key bytes for the given reference.
     * @throws {KeyResolverError} when the reference is unknown, unsupported,
     * or the resolver itself errors.
     */
    resolve(keyRef: KeyRef): Promise<Uint8Array>;
    /** Stable adapter identifier (URN-shaped) for telemetry / audit. */
    resolverId(): string;
}
export type KeyResolverErrorCode = 'key_not_found' | 'unsupported_key_ref' | 'internal';
export declare class KeyResolverError extends Error {
    code: KeyResolverErrorCode;
    constructor(code: KeyResolverErrorCode, message: string);
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
export declare class StaticKeyResolver implements KeyResolver {
    static readonly RESOLVER_ID = "urn:integrity-stack:key-resolver:static@1";
    private readonly keys;
    constructor(keys?: Map<Uint8Array, Uint8Array> | ReadonlyArray<[Uint8Array, Uint8Array]>);
    /** Inserts a `kid → publicKey` binding. */
    insert(kid: Uint8Array, publicKey: Uint8Array): void;
    resolve(keyRef: KeyRef): Promise<Uint8Array>;
    resolverId(): string;
}
export interface RegistryEntry {
    id: Uri;
    suite: string;
    wire: string;
    alg: number | null;
    status: 'registered' | 'deprecated';
    deprecationNotice?: string;
}
export interface SignatureMethodRegistry {
    version: SemVer;
    entries: RegistryEntry[];
}
export type VerifierErrorCode = 'method_unsupported' | 'verification_failed' | 'invalid_cose' | 'internal';
export declare class VerifierError extends Error {
    code: VerifierErrorCode;
    constructor(message: string, code: VerifierErrorCode);
}
/**
 * Sanitize an attacker-influenced reason string for inclusion in a
 * `VerificationReceipt.reason` (or `VerifierError.message`). Caps length,
 * collapses whitespace, strips ASCII control chars. Adapters MUST funnel
 * `String(e)` through this before surfacing it to callers.
 */
export declare function sanitizeReason(input: string, maxLen?: number): string;
export interface Verifier {
    verify(request: VerifyRequest, registry: SignatureMethodRegistry): Promise<VerificationReceipt>;
}
export declare function resolveRegistryEntry(registry: SignatureMethodRegistry, method: Uri): RegistryEntry | undefined;
