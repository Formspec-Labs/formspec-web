/**
 * PaymentRailAdapter port — web ADR-0009 / ADR-0011 / FW-0027.
 *
 * Holds funds, settles holds, releases holds. The respondent-facing promise
 * is "pay and submit succeed or fail as one transaction" (FW-0027 row title);
 * that atomicity is composed at the runtime layer (authorize → submit →
 * capture-or-void), not collapsed onto a single port call. The port models
 * the rail-side lifecycle that real payment networks expose, not a fictional
 * atomic primitive.
 *
 * Separation from `SubmitTransport` (FW-0027 §"Decision on port shape"):
 *   - `SubmitTransport.submit(handoff, key)` is the form-intake path. Free
 *     forms exit through it unchanged.
 *   - `PaymentRailAdapter.authorize / capture / voidAuthorization` model
 *     rail-side hold lifecycle. The runtime composes them around
 *     `SubmitTransport.submit` for fee-bearing forms. The two ports are
 *     wired independently at composition time so adopters can mix
 *     rails (Stripe, Square, ACH, PayNearMe, in-person POS) with any
 *     submit transport.
 *
 * Atomicity discipline:
 *   1. `authorize(amount, methodToken, key)` HOLDS funds without charging.
 *      The user's statement may show a pending line; no money has moved.
 *   2. `SubmitTransport.submit(handoff, key)` runs as today.
 *   3a. On submit success: `capture(authorization, key)` CHARGES the held
 *       funds. The user's statement settles to a real charge.
 *   3b. On submit failure: `voidAuthorization(authorization, key)` RELEASES
 *       the hold. The pending line drops off the user's statement; no
 *       charge ever happened.
 *
 * The user's account sees ONLY a successful charge OR no charge — never
 * an orphan charge with a failed submission, never a successful submission
 * with no charge. The "atomic" promise is honored at the user-observable
 * level.
 *
 * Conformance contract — the executable shape lives in
 * `definePaymentRailAdapterConformance` in `src/adapter-conformance/conformance.ts`;
 * adopters MUST run that suite against their adapter. The contract families:
 *
 * - UUIDv7 idempotency keys — `authorize` / `capture` / `voidAuthorization`
 *   reject non-UUIDv7 values (queue EXT-14 convention; mirrors
 *   `SubmitTransport.submit` and `OfflineSubmitQueue.enqueue`).
 * - Authorize idempotency — calling `authorize(amount, methodToken, key)`
 *   twice with the same key returns the SAME `Authorization`.
 * - Capture idempotency — calling `capture(authorization, key)` twice with
 *   the same key returns the SAME `CaptureReceipt`.
 * - Void after authorize — `voidAuthorization` against an authorized
 *   (not-yet-captured) authorization resolves without throwing.
 * - Capture after void throws — releasing the hold then trying to charge
 *   it is a contract violation.
 * - Void after capture throws — the money has moved; release-after-charge
 *   is a refund (FW-0095), not a void.
 * - Capture against unknown authorization throws — the adapter MUST
 *   reject ids it did not produce.
 * - `Money.amountMinorUnits` integer enforcement — adapters MUST reject
 *   fractional minor units. The minor-units convention is the load-bearing
 *   discipline that keeps money out of floating-point.
 * - `Money.currency` non-empty enforcement — adapters MUST reject empty
 *   currency strings. (Adapters MAY further restrict to ISO-4217-shaped
 *   3-letter codes; the suite asserts shape, not adapter coverage.)
 *
 * Slice-1 production posture: NO production reference adapter ships. The OSS
 * reference deployment wires `unavailablePaymentRailAdapter()` + declares
 * `payment: 'unavailable'`. Adopters who want fee collection fork the
 * composition file and wire their own rail substrate (Stripe / Square /
 * W3C Payment Request API / PayNearMe / in-person POS). See
 * `docs/ports/payment-rail-adapter.md`.
 */

export interface Money {
  /**
   * Amount in minor currency units (cents for USD, pence for GBP, etc.).
   * MUST be a non-negative integer. The minor-units convention avoids
   * floating-point drift; never use Number for money in fractional form.
   */
  readonly amountMinorUnits: number;
  /**
   * ISO-4217 currency code (3-letter uppercase, e.g. 'USD', 'EUR', 'GBP').
   * Adapters MAY reject currencies they do not support; the conformance
   * suite asserts shape (non-empty), not adapter coverage.
   */
  readonly currency: string;
}

export interface Authorization {
  /**
   * Discriminator literal so server-side / verifier detection inside
   * arbitrary contexts is keyed off a non-empty field, not a heuristic.
   */
  readonly kind: 'payment-authorization';
  /** Adapter's canonical authorization reference (rail-specific opaque string). */
  readonly id: string;
  /** Money held under this authorization. */
  readonly amount: Money;
  /**
   * Adopter-readable rail label ("Card", "ACH bank transfer", "PayNearMe cash").
   * Surfaced verbatim in the respondent-facing "Payment captured" copy on
   * the confirmation panel. Vocabulary-firewall-safe per port; adapters
   * MUST keep this string respondent-readable (no rail-API internals).
   */
  readonly railLabel: string;
}

export interface CaptureReceipt {
  readonly kind: 'payment-capture-receipt';
  /** The authorization this capture settled. */
  readonly authorizationId: string;
  /**
   * Money actually charged. Equal to `authorization.amount` for slice 1;
   * partial-capture is FW-0099.
   */
  readonly amount: Money;
  /**
   * Rail-specific settled transaction identifier suitable for receipt
   * display. Mirrors the rail's settled-side reference (Stripe charge id,
   * Square payment id, etc.); opaque to the runtime.
   */
  readonly settledTransactionId: string;
  /** Echoes the authorization's railLabel for receipt display. */
  readonly railLabel: string;
}

export interface PaymentRailAdapter {
  /**
   * Place a HOLD on funds without charging. The user's statement may show
   * a pending line; no money has moved. Idempotent on (idempotencyKey):
   * same key MUST return the same Authorization. Reject non-UUIDv7 keys
   * with an `Error`.
   *
   * `methodToken` is an opaque, adopter-supplied identifier whose
   * secret-management is the adapter's concern (most real tokens are
   * server-vended ephemeral references — Stripe `pm_*`, Square nonce,
   * generic-card temporary id from the W3C Payment Request API). The port
   * does not inspect it.
   */
  authorize(
    amount: Money,
    methodToken: string,
    idempotencyKey: string,
  ): Promise<Authorization>;

  /**
   * Settle a prior authorization — actually move the money. Idempotent
   * on (idempotencyKey): same key MUST return the same CaptureReceipt.
   * Adapters MUST reject capture against an unknown authorization (an id
   * the adapter did not produce). Adapters MUST reject double-capture
   * (calling capture twice against the same authorization with two
   * different keys is a contract violation; the adapter throws).
   * Adapters MUST reject capture against a previously-voided
   * authorization.
   */
  capture(
    authorization: Authorization,
    idempotencyKey: string,
  ): Promise<CaptureReceipt>;

  /**
   * Release a prior authorization without charging. Idempotent on
   * (idempotencyKey): same key MUST resolve without throwing. Adapters
   * MUST reject void against an already-captured authorization (the
   * money has moved; release-after-charge is a refund, FW-0095, not a
   * void). Adapters SHOULD accept void against an unknown authorization
   * as a no-op (the runtime calls void in a catch path and may not know
   * whether authorize succeeded).
   */
  voidAuthorization(
    authorization: Authorization,
    idempotencyKey: string,
  ): Promise<void>;
}
