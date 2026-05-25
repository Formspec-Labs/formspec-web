import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import { assertUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';
import type {
  Authorization,
  CaptureReceipt,
  Money,
  PaymentRailAdapter,
} from '../../ports/payment-rail-adapter.ts';

export type StubAuthorizationStatus = 'authorized' | 'captured' | 'voided';

export interface StubAuthorizationState {
  readonly status: StubAuthorizationStatus;
  readonly amount: Money;
  readonly methodToken: string;
}

export interface StubPaymentRailAdapter extends PaymentRailAdapter {
  /** Test-only: returns a snapshot of all authorization states this adapter has issued. */
  _internalAuthorizationStates(): ReadonlyMap<string, StubAuthorizationState>;
  /** Test-only: injects a thrown error on the next `authorize` call. Single-shot. */
  failNextAuthorize(error: unknown): void;
  /** Test-only: injects a thrown error on the next `capture` call. Single-shot. */
  failNextCapture(error: unknown): void;
  /** Test-only: injects a thrown error on the next `voidAuthorization` call. Single-shot. */
  failNextVoid(error: unknown): void;
}

export interface StubPaymentRailAdapterOptions {
  /**
   * Adopter-readable rail label echoed on every Authorization + CaptureReceipt.
   * Tests pin this to assert the confirmation panel's "Payment received via X"
   * sub-card.
   */
  readonly railLabel?: string;
}

/**
 * In-memory PaymentRailAdapter for demo + tests.
 *
 * - Authorizations live in a Map keyed by adapter-minted id.
 * - Idempotency: authorize/capture keys are tracked per-call-family; calling
 *   with the same key twice returns the previously-stored value (first-wins).
 * - Marked DEMO_STUB_ADAPTER per ADR-0011; the coherence assertion forbids
 *   this adapter in production mode.
 *
 * Production reference adapters (FW-0089 Stripe, FW-0090 W3C Payment Request,
 * FW-0091 Square, FW-0092 PayNearMe, FW-0093 in-person POS) replace the
 * in-memory map with rail-specific SDK calls; the port shape is unchanged.
 */
export function stubPaymentRailAdapter(
  options: StubPaymentRailAdapterOptions = {},
): StubPaymentRailAdapter {
  const railLabel = options.railLabel ?? 'Card';
  const states = new Map<string, StubAuthorizationState>();
  const authorizationsByKey = new Map<string, Authorization>();
  const capturesByKey = new Map<string, CaptureReceipt>();
  const voidsByKey = new Set<string>();
  // L-2: closure-local counter — each `stubPaymentRailAdapter()` instance
  // gets its own sequence, so parallel test compositions never collide on
  // adapter-minted ids. Tests that need to assert on the id format pin the
  // `stub-auth-NNNNNN` shape, not specific values.
  let nextId = 0;
  let pendingAuthorizeError: { error: unknown } | undefined;
  let pendingCaptureError: { error: unknown } | undefined;
  let pendingVoidError: { error: unknown } | undefined;

  const adapter: StubPaymentRailAdapter = {
    async authorize(amount, methodToken, idempotencyKey) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      assertWellFormedMoney(amount);
      const existing = authorizationsByKey.get(idempotencyKey);
      if (existing) {
        return existing;
      }
      if (pendingAuthorizeError) {
        const { error } = pendingAuthorizeError;
        pendingAuthorizeError = undefined;
        throw error instanceof Error ? error : new Error(String(error));
      }
      nextId += 1;
      const id = `stub-auth-${nextId.toString().padStart(6, '0')}`;
      const authorization: Authorization = {
        kind: 'payment-authorization',
        id,
        amount,
        railLabel,
      };
      authorizationsByKey.set(idempotencyKey, authorization);
      states.set(id, { status: 'authorized', amount, methodToken });
      return authorization;
    },

    async capture(authorization, idempotencyKey) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      const existing = capturesByKey.get(idempotencyKey);
      if (existing) {
        return existing;
      }
      const state = states.get(authorization.id);
      if (!state) {
        throw new Error(`Unknown authorization id: ${authorization.id}`);
      }
      if (state.status === 'captured') {
        throw new Error(`Authorization ${authorization.id} already captured`);
      }
      if (state.status === 'voided') {
        throw new Error(`Authorization ${authorization.id} already voided`);
      }
      if (pendingCaptureError) {
        const { error } = pendingCaptureError;
        pendingCaptureError = undefined;
        throw error instanceof Error ? error : new Error(String(error));
      }
      const receipt: CaptureReceipt = {
        kind: 'payment-capture-receipt',
        authorizationId: authorization.id,
        amount: authorization.amount,
        settledTransactionId: `stub-txn-${authorization.id}`,
        railLabel: authorization.railLabel,
      };
      capturesByKey.set(idempotencyKey, receipt);
      states.set(authorization.id, { ...state, status: 'captured' });
      return receipt;
    },

    async voidAuthorization(authorization, idempotencyKey) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      if (voidsByKey.has(idempotencyKey)) {
        return;
      }
      const state = states.get(authorization.id);
      if (!state) {
        // Port comment: SHOULD accept void against an unknown authorization
        // as a no-op (runtime calls void in a catch path).
        voidsByKey.add(idempotencyKey);
        return;
      }
      if (state.status === 'captured') {
        throw new Error(`Authorization ${authorization.id} already captured; use refund instead`);
      }
      if (pendingVoidError) {
        const { error } = pendingVoidError;
        pendingVoidError = undefined;
        throw error instanceof Error ? error : new Error(String(error));
      }
      voidsByKey.add(idempotencyKey);
      states.set(authorization.id, { ...state, status: 'voided' });
    },

    _internalAuthorizationStates() {
      return new Map(states);
    },

    failNextAuthorize(error) {
      pendingAuthorizeError = { error };
    },

    failNextCapture(error) {
      pendingCaptureError = { error };
    },

    failNextVoid(error) {
      pendingVoidError = { error };
    },
  };
  markDemoStubAdapter(adapter, {
    featureKey: 'payment',
    reason: 'in-memory payment rail; demo only — authorizations lost on page reload',
  });
  return adapter;
}

function assertWellFormedMoney(amount: Money): void {
  if (!Number.isInteger(amount.amountMinorUnits)) {
    throw new Error(
      `Money.amountMinorUnits must be an integer; received ${amount.amountMinorUnits}`,
    );
  }
  if (amount.amountMinorUnits < 0) {
    throw new Error(
      `Money.amountMinorUnits must be non-negative; received ${amount.amountMinorUnits}`,
    );
  }
  if (amount.currency.length === 0) {
    throw new Error('Money.currency must be a non-empty ISO-4217 code');
  }
}
