import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_KEY_HEADER,
  assertUuidV7IdempotencyKey,
  deriveUuidV7FromString,
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

describe('deriveUuidV7FromString (FW-0027 H-1+H-2)', () => {
  it('produces a UUIDv7-shaped value that satisfies the port-side validator', async () => {
    const base = '01935dcb-9c41-7000-8000-000000000001';
    const key = await deriveUuidV7FromString(base, 'authorize');
    expect(isUuidV7IdempotencyKey(key)).toBe(true);
    expect(() => assertUuidV7IdempotencyKey(key)).not.toThrow();
  });

  it('is deterministic — same (base, suffix) yields the same UUIDv7 across calls (retry safety)', async () => {
    const base = '01935dcb-9c41-7000-8000-000000000002';
    const first = await deriveUuidV7FromString(base, 'capture');
    const second = await deriveUuidV7FromString(base, 'capture');
    expect(first).toBe(second);
  });

  it('separates the three suffix families — authorize / capture / void all differ for the same base', async () => {
    const base = '01935dcb-9c41-7000-8000-000000000003';
    const auth = await deriveUuidV7FromString(base, 'authorize');
    const cap = await deriveUuidV7FromString(base, 'capture');
    const vd = await deriveUuidV7FromString(base, 'void');
    expect(new Set([auth, cap, vd]).size).toBe(3);
  });

  it('separates bases — different base values yield different derived keys per suffix', async () => {
    const a = await deriveUuidV7FromString('01935dcb-9c41-7000-8000-00000000000a', 'authorize');
    const b = await deriveUuidV7FromString('01935dcb-9c41-7000-8000-00000000000b', 'authorize');
    expect(a).not.toBe(b);
  });
});
