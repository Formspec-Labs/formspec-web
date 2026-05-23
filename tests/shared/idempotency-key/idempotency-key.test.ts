import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_KEY_HEADER,
  assertUuidV7IdempotencyKey,
  generateIdempotencyKey,
  isUuidV7IdempotencyKey,
} from '../../../src/shared/idempotency-key.ts';

describe('idempotency key utilities', () => {
  it('generates UUIDv7 values for the stack-common idempotency header', () => {
    const key = generateIdempotencyKey();
    expect(IDEMPOTENCY_KEY_HEADER).toBe('idempotency-key');
    expect(isUuidV7IdempotencyKey(key)).toBe(true);
  });

  it('rejects non-UUIDv7 values', () => {
    expect(() => assertUuidV7IdempotencyKey('not-a-uuid-v7')).toThrow();
  });
});
