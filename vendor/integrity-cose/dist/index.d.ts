/** @filedesc Shared TypeScript COSE_Sign1 byte helpers. */
export declare const COSE_LABEL_ALG = 1;
export declare const COSE_LABEL_KID = 4;
export declare const COSE_LABEL_SUITE_ID = -65537;
export declare const COSE_LABEL_ARTIFACT_TYPE = -65538;
/**
 * Consumer detached-signature `method_uri` protected-header label (ADR 0109).
 *
 * Carries a URI-shaped tstr that selects the consumer adapter via prefix
 * lookup → exact-value check. Lives in `integrity-cose` per ADR 0109 §Registry;
 * Trellis substrate envelopes never carry it.
 */
export declare const COSE_LABEL_METHOD_URI = -65540;
export declare const COSE_SIGN1_TAG = 18;
export declare const SUITE_ID_PHASE_1 = 1;
export declare const MAX_METHOD_URI_LEN = 512;
export interface CoseSign1 {
    protectedHeader: Map<number, unknown>;
    protectedHeaderBytes: Uint8Array;
    unprotectedHeader: Map<number, unknown>;
    payload: Uint8Array | null;
    signature: Uint8Array;
    alg: number | null;
    kid: Uint8Array | null;
    suiteId: number | null;
    artifactType: string | null;
    /**
     * Consumer detached-signature method URI (COSE label `-65540`, ADR 0109).
     * `null` on substrate envelopes, which use `suite_id` and `artifact_type`.
     */
    methodUri: string | null;
}
export declare class CoseError extends Error {
    constructor(message: string);
}
export declare function decodeCoseSign1(bytes: Uint8Array): CoseSign1;
/**
 * Decodes a consumer detached-signature envelope (ADR 0109) and validates that
 * the protected-header `method_uri` value starts with `expectedPrefix`.
 *
 * Mirrors `formspec_signature_cose::decode_cose_sign1_with_method_uri` in
 * Rust — same prefix-validating discipline, same error shapes. Caller-side
 * dispatch (which adapter to invoke) routes on the URI prefix; this primitive
 * is the byte-level gate that proves the envelope claims a prefix the caller
 * is willing to verify, before any signature primitive runs.
 *
 * @throws {CoseError} when COSE decoding fails, when `method_uri` is absent
 * (label `-65540` missing from the protected header), or when the URI value
 * does not start with `expectedPrefix`.
 */
export declare function decodeCoseSign1WithMethodUri(bytes: Uint8Array, expectedPrefix: string): {
    cose: CoseSign1;
    methodUri: string;
};
/**
 * Returns the `method_uri` value from a consumer detached-signature envelope
 * (ADR 0109), validated against `expectedPrefix`. Routing / inspection
 * shortcut over {@link decodeCoseSign1WithMethodUri}.
 *
 * @throws {CoseError} under the same conditions as
 * {@link decodeCoseSign1WithMethodUri}.
 */
export declare function extractMethodUri(bytes: Uint8Array, expectedPrefix: string): string;
export declare function resolvePayload(cose: CoseSign1, detachedPayload?: Uint8Array): Uint8Array;
export declare function sigStructureBytes(protectedHeader: Uint8Array, payload: Uint8Array): Uint8Array;
export declare function protectedHeaderBytesForAlg(alg: number, kid?: Uint8Array): Uint8Array;
/**
 * Consumer detached-signature protected-header builder (ADR 0109).
 *
 * Emits a `MAP_3` with `alg` (label 1), `kid` (label 4), and `method_uri`
 * (label `-65540`). The `method_uri` value is a URI-shaped tstr; callers
 * select the consumer subspace by choosing the URI prefix
 * (`urn:formspec:sig-method:*`, `urn:formspec:receipt-method:*`, ...). This
 * helper does not enforce the prefix — verifiers reject values outside the
 * expected prefix via {@link decodeCoseSign1WithMethodUri}.
 *
 * Mirrors `integrity_cose::detached_signature_protected_header` in Rust;
 * cross-runtime byte-for-byte parity with the ring adapter's golden vectors.
 */
export declare function detachedSignatureProtectedHeader(alg: number, kid: Uint8Array, methodUri: string): Uint8Array;
export declare function protectedHeaderBytesWithSuiteId(kid: Uint8Array, suiteId?: number): Uint8Array;
export declare function substrateProtectedHeader(alg: number, kid: Uint8Array, suiteId: number, artifactType: string): Uint8Array;
export declare function encodeCoseSign1(protectedHeader: Uint8Array, payload: Uint8Array | null, signature: Uint8Array): Uint8Array;
export declare function deriveKid(suiteId: number, publicKey: Uint8Array): Promise<Uint8Array>;
