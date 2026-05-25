import { describe, expect, it } from 'vitest';
import { stubPaymentRailAdapter } from '../../src/adapters/stub/payment-rail-adapter.ts';
import {
  samplePaymentAmount,
  samplePaymentMethodToken,
} from '../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { DEMO_STUB_ADAPTER, isDemoStubAdapter } from '../../src/policy/sentinel.ts';

describe('stubPaymentRailAdapter', () => {
  it('carries the demo-stub provenance marker pinned to "payment"', () => {
    const adapter = stubPaymentRailAdapter();
    expect(isDemoStubAdapter(adapter)).toBe(true);
    if (!isDemoStubAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[DEMO_STUB_ADAPTER].featureKey).toBe('payment');
  });

  it('echoes the configured rail label on Authorization and CaptureReceipt', async () => {
    const adapter = stubPaymentRailAdapter({ railLabel: 'ACH bank transfer' });
    const auth = await adapter.authorize(
      samplePaymentAmount,
      samplePaymentMethodToken,
      generateIdempotencyKey(),
    );
    expect(auth.railLabel).toBe('ACH bank transfer');
    const receipt = await adapter.capture(auth, generateIdempotencyKey());
    expect(receipt.railLabel).toBe('ACH bank transfer');
  });

  it('_internalAuthorizationStates reflects authorize → captured transitions', async () => {
    const adapter = stubPaymentRailAdapter();
    const auth = await adapter.authorize(
      samplePaymentAmount,
      samplePaymentMethodToken,
      generateIdempotencyKey(),
    );
    expect(adapter._internalAuthorizationStates().get(auth.id)?.status).toBe('authorized');
    await adapter.capture(auth, generateIdempotencyKey());
    expect(adapter._internalAuthorizationStates().get(auth.id)?.status).toBe('captured');
  });

  it('_internalAuthorizationStates reflects authorize → voided transitions', async () => {
    const adapter = stubPaymentRailAdapter();
    const auth = await adapter.authorize(
      samplePaymentAmount,
      samplePaymentMethodToken,
      generateIdempotencyKey(),
    );
    await adapter.voidAuthorization(auth, generateIdempotencyKey());
    expect(adapter._internalAuthorizationStates().get(auth.id)?.status).toBe('voided');
  });

  it('failNextAuthorize injects a thrown error on the next authorize call only', async () => {
    const adapter = stubPaymentRailAdapter();
    adapter.failNextAuthorize(new Error('rail unreachable'));
    await expect(
      adapter.authorize(samplePaymentAmount, samplePaymentMethodToken, generateIdempotencyKey()),
    ).rejects.toThrow('rail unreachable');
    // Next call succeeds — single-shot.
    const auth = await adapter.authorize(
      samplePaymentAmount,
      samplePaymentMethodToken,
      generateIdempotencyKey(),
    );
    expect(auth.kind).toBe('payment-authorization');
  });

  it('failNextCapture injects a thrown error on the next capture call only', async () => {
    const adapter = stubPaymentRailAdapter();
    const auth = await adapter.authorize(
      samplePaymentAmount,
      samplePaymentMethodToken,
      generateIdempotencyKey(),
    );
    adapter.failNextCapture(new Error('settlement service down'));
    await expect(
      adapter.capture(auth, generateIdempotencyKey()),
    ).rejects.toThrow('settlement service down');
    // The authorization stays in 'authorized' state — capture did not move it.
    expect(adapter._internalAuthorizationStates().get(auth.id)?.status).toBe('authorized');
  });

  it('failNextVoid injects a thrown error on the next void call only', async () => {
    const adapter = stubPaymentRailAdapter();
    const auth = await adapter.authorize(
      samplePaymentAmount,
      samplePaymentMethodToken,
      generateIdempotencyKey(),
    );
    adapter.failNextVoid(new Error('void service down'));
    await expect(
      adapter.voidAuthorization(auth, generateIdempotencyKey()),
    ).rejects.toThrow('void service down');
    expect(adapter._internalAuthorizationStates().get(auth.id)?.status).toBe('authorized');
  });

  it('voidAuthorization against an unknown authorization resolves as a no-op (runtime catch-path safety)', async () => {
    const adapter = stubPaymentRailAdapter();
    await expect(
      adapter.voidAuthorization(
        {
          kind: 'payment-authorization',
          id: 'never-authorized',
          amount: samplePaymentAmount,
          railLabel: 'Card',
        },
        generateIdempotencyKey(),
      ),
    ).resolves.toBeUndefined();
  });
});
