# PaymentRailAdapter

`PaymentRailAdapter` is the seam between the form-fill runtime and a
real payment network (Stripe, Square, ACH, PayNearMe, in-person POS,
W3C Payment Request API, etc.). It models the rail-side hold lifecycle
that every real payment network exposes; the FW-0027 row title
("pay and submit succeed or fail as one transaction") is honored by
composing authorize → submit → capture-or-void at the runtime layer,
not by collapsing the rail and submit ports into one call.

Without this port, a fee-bearing form on an instance with no rail
silently submits with no charge (or whatever the upstream service
decides to do with an unpaid intake). The form-load boundary's runtime-
feature gate catches this honestly: a payment-required form on an
instance with `payment: 'unavailable'` fails-load with
`UnsupportedRequiredFeatureError` and the plain-language
"This form requires payment, but this site is not set up to accept
payments." copy.

## Atomicity discipline

The runtime orchestration:

1. `authorize(amount, methodToken, key)` HOLDS funds against the user's
   account without charging. The user's statement may show a "pending"
   line; no money has moved.
2. `SubmitTransport.submit(handoff, key)` runs as today.
3. **On submit success**: `capture(authorization, key)` CHARGES the
   held funds. The user's statement settles to a real charge.
4. **On submit failure**: `voidAuthorization(authorization, key)`
   RELEASES the hold. The pending line drops off the user's statement
   (typically within minutes to hours, rail-dependent); no charge ever
   happened.

The user's account sees ONLY a successful charge OR no charge — never
an orphan charge with a failed submission, never a successful
submission with no charge.

## Adapter contract

- `authorize(amount, methodToken, idempotencyKey)` accepts a `Money`
  with integer `amountMinorUnits` + non-empty `currency`, an opaque
  adopter-supplied `methodToken`, and a UUIDv7 idempotency key.
  Idempotent: same key returns the same `Authorization`. Reject
  non-UUIDv7 keys, fractional `amountMinorUnits`, negative amounts,
  and empty currency strings.
- `capture(authorization, idempotencyKey)` settles a prior
  authorization into a `CaptureReceipt`. Idempotent on the capture
  key. Reject capture against an unknown authorization, double-
  capture (two different keys), and capture against a voided
  authorization.
- `voidAuthorization(authorization, idempotencyKey)` releases a prior
  hold. Idempotent on the void key. Reject void against an already-
  captured authorization (use refund — FW-0095 — instead). Accept
  void against an unknown authorization as a no-op so the runtime's
  catch-path safety is preserved.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/payment-rail-adapter
```

## Why a separate port from `SubmitTransport`

Authorize-then-capture and request-response submit are orthogonal
adopter concerns. The submit transport's idempotency-key generation,
response-shape contract, and inline retry semantics are different
from a rail's authorize / capture / void lifecycle. Bolting rail
operations onto `SubmitTransport` would force every adapter to either
implement rail semantics or document "payment: not supported"; the
rail lifecycle has no natural home on a request-shaped port.

Multi-rail composition (`CompositePaymentRailAdapter` analogous to
FW-0028's `CompositeIdentityProvider`) is FW-0094; slice 1 wires one
adapter per composition.

## Money discipline

`Money.amountMinorUnits` is an integer (cents for USD, pence for
GBP, etc.). Never use a fractional `Number` for money: floating-point
drift produces real reconciliation bugs. The conformance suite rejects
fractional amounts at the port boundary. `Money.currency` is an ISO-
4217 3-letter code; adapters MAY further restrict to currencies they
support.

The runtime formats the amount with `Intl.NumberFormat` for display in
the "Authorizing payment…" / "Payment received" panels; the locale is
the user's (per `navigator.language`).

## Method token

`methodToken` is an opaque, adopter-supplied identifier whose secret-
management is the adapter's concern. Real tokens are typically server-
vended ephemeral references (Stripe `pm_*`, Square nonce, W3C Payment
Request API id, etc.). The port does not inspect it; the runtime
reads it from `definition.extensions['x-formspec-payment-method-token']`
in slice 1 (literal fixture value `'demo-method-stub'` for the test
cases). Production rails surface their own pickers that produce the
token; that picker UX is FW-0094.

## Form-policy gate

The default + stub composition's `formRuntimePolicyExtractor`
(specifically the `PaymentRequirementExtractor` reference adapter,
composed into the `CompositeFormRuntimePolicyExtractor` array) reads
`definition.extensions['x-formspec-payment-required']`. When the value
is strictly `=== true`, the form's policy declares `payment: 'required'`.
The resolver enables the feature when the instance can satisfy it;
when it cannot, the resolver throws `UnsupportedRequiredFeatureError`
and the React shell renders the plain-language unavailable copy at
the form-load boundary.

Slice 1 reads the literal amount from
`definition.extensions['x-formspec-payment-amount']` (typed as
`{ amountMinorUnits: number, currency: string }`). FEL-evaluated
dynamic amounts that depend on response field values are FW-0097.

## Why `required`, not `optional`

A fee-bearing form on an instance with no payment rail cannot be
honestly submitted — the rail's absence is a HARD blocker, not a
graceful enhancement. This matches the FW-0033 attachment shape
(a form with an attachment field cannot be honestly rendered without
an object store; the extractor declares `'required'`; production
instances without an object store fail-load).

If a future deployment posture needs "free-tier opt-out for fee-
bearing forms" (e.g., a means-tested fee waiver that some respondents
qualify for), the form-policy extractor would need access to identity
/ response data to decide between `'required'` and `'optional'` per-
session — a slice-2 concern not in scope for the substrate.

## Composition wiring

The full-app composition exposes the slot:

```ts
const composition: Composition = freezeComposition({
  // ...
  submitTransport: yourHttpSubmitTransport(),
  paymentRailAdapter: yourStripeAdapter({ /* merchant config */ }),
  instanceCapabilities: { /* ... */ payment: 'available' },
  // ...
});
```

The OSS reference deployment declares `payment: 'unavailable'` and
wires `unavailablePaymentRailAdapter()` until an adopter forks. The
narrowed-route factories (`/status`, `/obligations`, `/documents`,
`/history`) declare `unavailable` uniformly — those surfaces do not
submit.

## Vocabulary firewall

The port name, the `payment` capability key, the `PaymentRailAdapter`
type, and the lifecycle terms (`authorize`, `capture`,
`voidAuthorization`, `methodToken`, `Money`, `minor units`,
`ISO-4217`) never appear in respondent-facing UI text. The
respondent-facing copy is "payment", "fee", "Authorizing payment…",
"Payment captured", "Your form did not submit, and the payment was
not charged", plus the fixture-pinned
`PAYMENT_DEFERRED_CAPABILITY_COPY` string ("If you see a pending
charge on your account, it will be released automatically within a
few days.").

## What slice 1 does not ship

- Production rail adapters (Stripe FW-0089 / W3C Payment Request
  FW-0090 / Square FW-0091 / PayNearMe FW-0092 / in-person POS
  FW-0093). The OSS reference deployment declares `unavailable`.
- Multi-rail composition + per-submit picker UX (FW-0094).
- Refund lifecycle (`refund(captureReceipt, amount?, key)`) — FW-0095.
- Cross-currency / locale-aware money display (FW-0096).
- FEL-evaluated dynamic payment amount (FW-0097).
- Saved-method picker + wallet integration (Apple Pay / Google Pay /
  Stripe Link) — FW-0098.
- Split-tender / partial-payment (FW-0099).
- Demo form: `x-formspec-payment-required: true` declaration once a
  method-picker UX ships (FW-0100; gated on FW-0089 + FW-0094).
- Offline + payment composition (FW-0101); currently hard-rejected
  at the runtime layer when both keys are enabled.
- Webhook reconciliation for async settlement / chargeback events.
  Adapter-side; rail-specific. Filed per rail.
- A canonical wire-format ratification for the
  `x-formspec-payment-*` definition extensions. The slice-1 web work
  fixture-pins the shape; the cross-stack ratification follows in a
  stack-extension queue row.

## Slice-1 imperfections (documented)

- **The authorize→submit→void path is not transactionally atomic.** A
  network failure between authorize and submit can leave a hold on
  the user's account that the runtime never voids (browser tab
  closed, process killed). The rail's hold-expiration mechanism
  (typically 7 days for card networks) is the safety net for that
  case. The runtime surfaces the documented copy ("If you see a
  pending charge on your account, it will be released automatically
  within a few days.") on the
  `payment-voided-after-submit-failure` and
  `void-failed-after-submit-failure` states.
- **The submit→capture path has a similar gap.** If submit succeeds
  and the runtime's capture call fails (network glitch, settlement
  service throw), the form IS in the upstream service and the rail
  has a pending hold. The runtime surfaces the
  `capture-failed` state with copy that names the reference number
  and tells the respondent to contact the sender. The right long-term
  shape is server-side reconciliation (a worker that re-captures
  stale authorizations); that is adapter-side and out of slice 1.
- **PCI-DSS scope is the adapter's concern.** The slice-1 port carries
  opaque tokens only; raw card data never enters the web layer.
  Production rail adapters MUST tokenize at the rail SDK boundary so
  no card PAN ever transits this port.
