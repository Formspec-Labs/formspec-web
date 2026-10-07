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
