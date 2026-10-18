/**
 * Parses JSON text without losing number digits.
 *
 * A number stays a plain JS number whenever its canonical form is that number's
 * own text, so `1.50` reads as 1.5 and `1e2` as 100, and UI code can treat it as
 * a number. Only a number whose canonical form differs becomes
 * `JSON.rawJSON(canonical form)`, which the canonical byte functions write with
 * every digit: digits a double cannot hold, such as a 19-digit decimal, or an
 * integer written in full past 2^53. Either way the canonical bytes are the
 * same. A number outside the binary64 range is kept as written, for the byte
 * functions to refuse. `JSON.parse` keeps the last of repeated member names;
 * Rust's text functions refuse them.
 *
 * @throws SyntaxError for invalid JSON; TypeError where the runtime lacks source text access.
 */
export declare function parseJsonExact(text: string): unknown;
/**
 * Builds the Rust-authoritative domain, NUL, and canonical JSON handoff bytes.
 *
 * Preserves the complete JSON object, including authoredSignatures. The caller
 * hashes these bytes using genuine SHA-256; this function performs no crypto or
 * Response schema validation. Requires TextEncoder and String.isWellFormed.
 * Matches Rust `canonical_response_handoff_bytes` on the same JSON text
 * when the object comes from {@link parseJsonExact}.
 *
 * @throws TypeError for a non-object root, non-JSON runtime values, invalid
 * Unicode strings or keys, or a number outside the binary64 range.
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
 * Serializes any JSON value as canonical JSON, matching Rust `canonical_json_from_bytes`.
 *
 * Applies the same admission rules as the Response profiles (no accessors, hooks, cycles, sparse
 * arrays or malformed Unicode) and adds no domain framing. The root may be any JSON value.
 *
 * @throws TypeError for non-JSON runtime values or malformed Unicode.
 */
export declare function canonicalJsonBytes(value: unknown): Uint8Array<ArrayBuffer>;
