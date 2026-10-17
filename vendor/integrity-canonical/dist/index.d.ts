/**
 * Builds the Rust-authoritative domain, NUL, and RFC 8785 JCS handoff bytes.
 *
 * Preserves the complete JSON object, including authoredSignatures. The caller
 * hashes these bytes using genuine SHA-256; this function performs no crypto or
 * Response schema validation. Requires TextEncoder and String.isWellFormed.
 *
 * @throws TypeError for a non-object root or non-JSON runtime values. The
 * maintained canonicalizer also rejects invalid Unicode strings and keys.
 */
export declare function canonicalResponseHandoffBytes(response: unknown): Uint8Array<ArrayBuffer>;
/**
 * Builds the formspec-response-signing-v1 preimage matching the Rust authority.
 *
 * Validates the complete JSON input, then omits only top-level authoredSignatures.
 * Preserves every other member, including nested members of that name. The caller
 * hashes these bytes using genuine SHA-256 for signedPayload.digest (plain hex).
 * Performs no hashing, signing, verification or Response schema validation.
 *
 * @throws TypeError for a non-object root, non-JSON runtime data or malformed Unicode.
 */
export declare function canonicalResponseSignedPayloadBytes(response: unknown): Uint8Array<ArrayBuffer>;
/**
 * Serializes any JSON value with RFC 8785 JCS, matching Rust `canonical_json_bytes`.
 *
 * Applies the same admission rules as the Response profiles (no accessors, hooks, cycles, sparse
 * arrays or malformed Unicode) and adds no domain framing. The root may be any JSON value.
 *
 * @throws TypeError for non-JSON runtime values or malformed Unicode.
 */
export declare function canonicalJsonBytes(value: unknown): Uint8Array<ArrayBuffer>;
