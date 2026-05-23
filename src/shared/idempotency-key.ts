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
