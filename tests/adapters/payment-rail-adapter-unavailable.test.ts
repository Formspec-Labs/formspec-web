import { describe, expect, it } from 'vitest';
import { unavailablePaymentRailAdapter } from '../../src/adapters/unavailable/payment-rail-adapter.ts';
import {
  samplePaymentAmount,
  samplePaymentMethodToken,
} from '../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { isUnavailableAdapter, UNAVAILABLE_ADAPTER } from '../../src/policy/sentinel.ts';

describe('unavailablePaymentRailAdapter', () => {
  it('carries the unavailable marker pinned to "payment"', () => {
    const adapter = unavailablePaymentRailAdapter();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('payment');
  });

  it('authorize throws with the adopter-facing message', async () => {
    const adapter = unavailablePaymentRailAdapter();
    await expect(
      adapter.authorize(samplePaymentAmount, samplePaymentMethodToken, generateIdempotencyKey()),
    ).rejects.toThrow(/not configured/i);
  });

  it('capture throws', async () => {
    const adapter = unavailablePaymentRailAdapter();
    await expect(
      adapter.capture(
        {
          kind: 'payment-authorization',
          id: 'x',
          amount: samplePaymentAmount,
          railLabel: 'Card',
        },
        generateIdempotencyKey(),
      ),
    ).rejects.toThrow(/not configured/i);
  });

  it('voidAuthorization throws', async () => {
    const adapter = unavailablePaymentRailAdapter();
    await expect(
      adapter.voidAuthorization(
        {
          kind: 'payment-authorization',
          id: 'x',
          amount: samplePaymentAmount,
          railLabel: 'Card',
        },
        generateIdempotencyKey(),
      ),
    ).rejects.toThrow(/not configured/i);
  });

  it('honors a custom adopter-supplied message', async () => {
    const adapter = unavailablePaymentRailAdapter('Wire your Stripe adapter here.');
    await expect(
      adapter.authorize(samplePaymentAmount, samplePaymentMethodToken, generateIdempotencyKey()),
    ).rejects.toThrow('Wire your Stripe adapter here.');
  });
});
