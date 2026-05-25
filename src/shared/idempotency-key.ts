import { v7 as uuidv7, validate as validateUuid, version as uuidVersion } from 'uuid';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

export type IdempotencyKey = string & { readonly __idempotencyKey: unique symbol };

export function generateIdempotencyKey(): IdempotencyKey {
  return uuidv7() as IdempotencyKey;
}

export function isUuidV7IdempotencyKey(value: string): value is IdempotencyKey {
  return validateUuid(value) && uuidVersion(value) === 7;
}

export function assertUuidV7IdempotencyKey(value: string): asserts value is IdempotencyKey {
  if (!isUuidV7IdempotencyKey(value)) {
    throw new Error(`Expected ${IDEMPOTENCY_KEY_HEADER} to be a UUIDv7 value`);
  }
}

/**
 * FW-0027 H-1+H-2 root-domino fix. Deterministically derives a UUIDv7-shaped
 * value from `${base}:${suffix}` so a runtime retry of the payment
 * orchestration reuses the SAME authorize/capture/void key triple — the
 * rail's same-key contract then suppresses duplicates (no second hold, no
 * double-charge). The derivation hashes the input with SHA-256, truncates to
 * 16 bytes, then sets the UUIDv7 version (bits 48-51 = 0111) and RFC-4122
 * variant (bits 64-65 = 10) bits so `assertUuidV7IdempotencyKey` accepts the
 * result.
 *
 * The 48-bit "timestamp" prefix is not a real timestamp — it carries the
 * top 48 bits of the SHA-256 digest. Acceptable because the port validator
 * checks UUIDv7 shape, not whether the embedded time monotonically advances
 * (we have no monotonicity invariant to honor on a derived key; the rail's
 * idempotency contract is keyed on the bytewise value).
 */
export async function deriveUuidV7FromString(
  base: string,
  suffix: 'authorize' | 'capture' | 'void',
): Promise<IdempotencyKey> {
  const input = `${base}:${suffix}`;
  const bytes = new TextEncoder().encode(input);
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', bytes),
  );
  const uuid = new Uint8Array(16);
  uuid.set(digest.subarray(0, 16));
  // Version: top nibble of byte 6 set to 0111 (v7).
  uuid[6] = (uuid[6] & 0x0f) | 0x70;
  // Variant: top two bits of byte 8 set to 10 (RFC-4122).
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = Array.from(uuid, (b) => b.toString(16).padStart(2, '0')).join('');
  const formatted = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  assertUuidV7IdempotencyKey(formatted);
  return formatted;
}
