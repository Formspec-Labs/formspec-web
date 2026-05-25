# FW-0027 — Multi-rail payment with atomic submit (design)

**Date:** 2026-05-24
**Row:** [FW-0027](../../PLANNING.md#fw-0027--multi-rail-payment-with-atomic-submit)
**Journey:** [J-029](../../JOURNEYS.md#j-029--let-me-pay-the-way-i-actually-pay--and-through-any-channel-i-actually-use)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0011 (runtime feature resolution)
**Precedent (substrate shape):** [FW-0033 slice-1 design](2026-05-23-fw-0033-file-upload-design.md) — IN-FORM new-port + capability-key extension + definition-introspective form-policy extractor (REQUIRED mode). [FW-0044 slice-1 design](2026-05-24-fw-0044-offline-capable-fill-design.md) — IN-FORM new-port + runtime-orchestration-around-submit precedent. [FW-0064 design](2026-05-24-fw-0064-adapter-owned-draft-binding-design.md) — adapter-cohort transport-injection-at-construction discipline (payment authorize/capture/void compose alongside submit at the runtime layer).
**Authority:** ADR-0011 §"Feature Ownership Table" enumerates `payment` (instance capability: "payment rail adapter"; org policy: "merchant account and rail policy"; form policy: "fees required"). This row materializes the taxonomy entry. Adds a **new** `PaymentRailAdapter` port per web ADR-0009 (port what's adopter-shaped — authorize-then-capture lifecycle has a fundamentally different shape from synchronous `SubmitTransport`). Seventh extension of the closed `RuntimeFeatureKey` taxonomy.

## What FW-0027 actually needs (vs the row prose)

The PLANNING row frames the full vision: payment offers ACH, card, prepaid, cash-via-retail-partner, and in-person; the submit and the payment land or fail together; the user is never charged-but-unsubmitted or submitted-but-unpaid; the receipt names which rail was used. **Most of the surface is adopter-shaped.** The full multi-rail catalogue (ACH, prepaid, cash-via-retail-partner, in-person) is reference-adapter territory — Stripe / Square / generic-card / PayNearMe / point-of-sale slots that a public-agency adopter wires per their merchant relationships. The substrate gap is **the atomic pay-and-submit boundary**: today `RespondentRuntime.handleSubmit` calls `composition.submitTransport.submit(handoff, key)` unconditionally; if a form has a fee, there is no port to authorize against, no orchestration to void on submit failure, and no resolved-profile gate that stops a fee-bearing form from loading on an instance with no rail.

Four independently load-bearing gaps:

1. **No port for payment-rail interaction.** Submission is a sync request/response port today. Adopters who want fee collection have nowhere to declare a rail; the runtime cannot distinguish "the user pressed submit on a free form" from "the user pressed submit on a fee-bearing form and we need to charge them as part of the submission." The two surfaces need fundamentally different lifecycles (one-step submit vs authorize→submit→capture-or-void).
2. **No atomicity primitive.** Even if an adopter wires a charge-on-submit decorator out-of-band, there is no orchestration boundary that guarantees the user sees ONLY a successful charge OR no charge — never an orphan charge with a failed submission, never a successful submission with no charge. The authorize-then-capture / void-on-failure pattern is the standard rail-side primitive; without it the row's "succeed or fail as one transaction" promise is a lie.
3. **No runtime-feature gate.** A form whose author marked it fee-bearing loaded on an instance with no payment rail today silently submits with no charge; the upstream service either accepts the unpaid submission or rejects it at intake with a confusing error the respondent has no way to act on. That is the ADR-0011 §Rationale #1 ("reference deployments must be honest") violation — the form LOOKS like a free form on an instance that cannot charge, until the receipt comes back wrong (or never).
4. **No respondent-visible "authorizing payment…" affordance.** When the submit path becomes authorize→submit→capture, the UX must say so plainly — same fidelity as the "confirmed" panel, distinguished as "Authorizing payment… → Submitting… → Payment captured." Today's `SubmitNotice` has six states (`idle | submitting | invalid | error | queued | confirmed`); adding "authorizing" / "capturing" without a substrate behind them is the dishonest path.

Each gap is independently load-bearing. Gap 1 alone makes the feature unimplementable on production. Gap 2 makes it unimplementable end-to-end even when an adapter exists. Gap 3 makes the demo composition mislead respondents. Gap 4 hides what is happening from the person whose money it is.

## Decision: ship slice 1 (port + conformance + stub + unavailable sentinel + extractor + runtime authorize-submit-capture orchestration + UX); defer production rail adapters + multi-rail composition + refunds + cross-currency

Slice 1 lands:

- A new **`PaymentRailAdapter` port** with three operations: `authorize(amount, methodToken, idempotencyKey) → Promise<Authorization>`, `capture(authorization, idempotencyKey) → Promise<CaptureReceipt>`, `voidAuthorization(authorization, idempotencyKey) → Promise<void>`. The port is intentionally minimal — no `refund`, no `getStatus`, no `listMethods`. The respondent's act is "let the system charge me as part of submitting this form"; the system owns lifecycle from authorize through capture (or void). (Future rows add refunds, settlement inspection, and method enumeration — out of slice 1.)
- A new **`Money` value type** (`{ amountMinorUnits: number, currency: string }`) and **`Authorization`** + **`CaptureReceipt`** record types. The minor-units integer convention (cents for USD, pence for GBP) avoids floating-point drift; ISO-4217 currency code keeps the port currency-agnostic. The receipt's `railLabel` field carries a respondent-displayable rail name ("Card", "ACH bank transfer", "PayNearMe cash") for the confirmation panel — the row's "the receipt names which rail was used" promise.
- A new **conformance suite** (`definePaymentRailAdapterConformance`) covering: authorize idempotency (same key → same `Authorization`), capture preserves the authorize idempotency key requirement (the SAME idempotency key MUST authorize ONCE and capture ONCE; the adapter MUST reject capture against an unknown authorization), void-after-authorize releases without throwing, double-capture fails (a captured authorization cannot be captured again), void-after-capture fails (a captured authorization cannot be voided), rejection of non-UUIDv7 idempotency keys (mirrors `SubmitTransport` / `OfflineSubmitQueue` shape), `Money.amountMinorUnits` integer enforcement (the adapter MUST reject fractional minor units), `Money.currency` non-empty ISO-4217-shaped enforcement.
- A new **in-memory stub adapter** (`stubPaymentRailAdapter`) carrying the `DEMO_STUB_ADAPTER` marker; stores authorizations in a `Map<authorizationId, {money, status: 'authorized'|'captured'|'voided'}>`. Used by demo composition and the conformance suite. Test-only helpers expose authorization state (`_internalAuthorizationStates()`) and a `failNextAuthorize` / `failNextCapture` knob so the runtime test can drive the submit-fails-voids path deterministically.
- A new **unavailable sentinel** (`unavailablePaymentRailAdapter`) carrying the `UNAVAILABLE_ADAPTER` marker; `authorize` / `capture` / `voidAuthorization` throw with plain-language adopter-facing messages.
- A new **`payment` runtime-feature key** appended to the closed `RUNTIME_FEATURE_KEYS` tuple per ADR-0011 §"Feature Ownership Table" — **seventh extension** after `respondentPlace`, `status`, `documentPresentation`, `fileUpload`, `crossIssuerHistory`, `offlineSubmit`. Mapped 1:1 to a new `paymentRailAdapter` Composition slot in `FEATURE_PORT_MAP` — no transitional slot-sharing (the port IS the substrate AND the consumer; multi-rail composition lives at the adapter level via a future `CompositePaymentRailAdapter` analogous to FW-0028's `CompositeIdentityProvider`).
- A new **`PaymentRequirementExtractor`** `FormRuntimePolicyExtractor` adapter. Walks `definition.extensions['x-formspec-payment-required']`; when present and `=== true`, declares `payment: 'required'` — NOT `'optional'` (a fee-bearing form on an instance with no rail cannot be honestly submitted; declaring `'required'` is the FW-0033 shape, not the FW-0044 shape, and matches the row's "submit and payment land or fail together" semantics). Composed into the stub + default compositions' `CompositeFormRuntimePolicyExtractor` array.
- **`RespondentRuntime` payment integration.** A new `submitWithPayment(composition, runtimeProfile, ...args)` orchestration helper checks `runtimeProfile.enabled.has('payment')` AND the in-form payment-method-token availability (slice 1 fixture-pins a synthetic `methodToken: 'demo-method-stub'` payload extracted from the engine's form-extension fields; production adapters would surface a Stripe Elements / Payment Request API picker that produces a method token — that picker UX is post-slice). When payment is enabled AND a payment is needed, the runtime: (1) authorizes for the configured amount, (2) calls `submitTransport.submit(handoff, idempotencyKey)`, (3a) on submit success, captures the authorization; (3b) on submit failure, voids the authorization. The user sees `'authorizing-payment'` → `'submitting'` → `'capturing-payment'` → `'confirmed'` (success) OR `'authorizing-payment'` → `'submitting'` → `'voiding-payment'` → `'error'` (submit failed, charge released).
- **Idempotency-key discipline.** The submit idempotency key is the load-bearing identity for the whole transaction. The authorize call uses `${idempotencyKey}:authorize`; the capture call uses `${idempotencyKey}:capture`; the void call uses `${idempotencyKey}:void`. All three are derived deterministically from the submit key so a runtime retry that re-enters the orchestration re-uses the same triple. Adapters that honor the same-key contract suppress duplicate authorize / capture / void calls automatically.
- **`Money` derivation.** Slice 1 reads the amount from `definition.extensions['x-formspec-payment-amount']` (typed as `{ amountMinorUnits: number, currency: string }`) — fixture-pinned shape. Future rows (per-form fee calculation from response field values) will read from a FEL-evaluated amount expression; the slice-1 fixed-amount shape is the substrate. The extractor declares the requirement; the runtime reads the literal amount at submit time.
- **Honest deferred copy.** Below the "authorizing payment" panel: "Stripe, Square, ACH, and cash-via-retail-partner adapters are adopter-shipped — the OSS reference deployment does not include a production payment rail." Fixture-pinned.
- **Disabled-cause copy at form load.** When the form requires `payment` and the instance cannot satisfy it, the resolver throws `UnsupportedRequiredFeatureError` and the `RuntimePolicyErrorPage` renders fixture-pinned copy: "This form requires payment, but this site is not set up to accept payments." — adapter-shaped honest deferral, no broken charge mid-flow.
- **Production composition default**: `payment: 'unavailable'` + `unavailablePaymentRailAdapter()`. The OSS reference deployment does not ship a production-grade payment rail (the row's "no upstream block — adopter-side" framing in PLANNING).
- **Demo / stub composition**: `payment: 'demo-stub'` + `stubPaymentRailAdapter()`. The bundled demo form does NOT declare `x-formspec-payment-required: true` in slice 1 (the affordance is exercised via synthetic-definition tests and the conformance suite); see §"Demo form posture."

Slice 1 does **not** ship:

- **Production rail adapters.** Stripe (card + ACH + Apple Pay / Google Pay via Stripe Elements + Payment Request API), Square, generic-card (W3C Payment Request API direct), PayNearMe (cash-via-retail-partner), in-person POS — all adopter-side, each its own row. Filed as **FW-0089** (Stripe reference adapter), **FW-0090** (W3C Payment Request API reference adapter), **FW-0091** (Square reference adapter), **FW-0092** (PayNearMe cash-via-retail-partner reference adapter), **FW-0093** (in-person POS handoff reference adapter).
- **Multi-rail composition.** The row's "ACH, card, prepaid, cash-via-retail-partner, and in-person" framing wants the respondent to pick a rail per submit. The composition is a future `CompositePaymentRailAdapter` analogous to FW-0028's `CompositeIdentityProvider` — picks one underlying adapter at authorize time based on the user's chosen `methodToken`. Filed as **FW-0094** (multi-rail composition + picker UX; depends on at least FW-0089).
- **Refunds.** Different lifecycle than authorize+capture+void — a refund operates on a CAPTURED transaction. The port shape would add `refund(captureReceipt, amount?, idempotencyKey) → Refund`. Filed as **FW-0095** (refund lifecycle + receipt update).
- **Cross-currency / multi-currency.** Slice 1 fixes the currency per form at the extension declaration; the runtime never converts. Filed as **FW-0096** (cross-currency + locale-aware display).
- **FEL-evaluated dynamic amounts.** Slice 1's amount is a literal in the form extension; future rows allow a FEL expression that depends on response field values (e.g., fee = $50 base + $10 per dependent). Filed as **FW-0097** (FEL-evaluated payment amount).
- **Saved payment methods / wallet integration.** Apple Pay / Google Pay / Stripe Link / saved-card tokens — adopter-side; slice 1's `methodToken` shape is opaque enough to carry any of these but the picker UI is out of scope. Filed as **FW-0098** (saved-method picker + wallet integration).
- **Receipt portal payment-line rendering.** FW-0009 / FW-0010 / FW-0054 territory — when the receipt portal lands, the `CaptureReceipt`'s `railLabel` + amount need their own card. Out of slice 1 surface.
- **Partial payments / split tender.** "User pays $50 on card and $50 in cash" — out of scope. Filed as **FW-0099** (split-tender / partial-payment).
- **Webhook reconciliation.** Many rails fire async webhooks for authorization-expired / capture-settled / chargeback events. Adapter-side concern (the adapter's transport handles its own webhook listener and updates the durable record); the slice-1 port does not model webhook ingest. Filed under each rail's row (FW-0089 etc.).
- **At-rest encryption for in-flight payment payloads.** Slice-1 stub stores authorization state in process memory only and disappears on reload. Production rail adapters MUST address PCI-DSS scope themselves (mostly by tokenizing at the rail SDK boundary so no card PAN ever transits the web layer); the slice-1 port shape carries only the opaque `methodToken` and the `Authorization` reference, never raw card data.

## Decision on port shape: NEW `PaymentRailAdapter` port, NOT extending `SubmitTransport`

Alternatives considered:

| Option | Shape | Why rejected/accepted |
|---|---|---|
| **(a) New `PaymentRailAdapter` port** | Three methods: `authorize(amount, methodToken, key)`, `capture(authorization, key)`, `voidAuthorization(authorization, key)`. `SubmitTransport` unchanged. Atomicity composed at the runtime layer (authorize → submit → capture-or-void). | **ACCEPTED.** Single-responsibility port (web ADR-0009 §"port what's adopter-shaped"). Authorize-then-capture lifecycle has fundamentally different concerns from synchronous submit (authorize HOLDS funds without charging; capture CHARGES the held funds; void RELEASES the hold). Adopters wire one or many `PaymentRailAdapter` instances (per rail) independently of the submit transport. Matches the FW-0033 / FW-0044 / FW-0057 precedent of one port per adopter-shaped concern. The "atomic" claim in the row title is honored by composing the three calls at the runtime layer, not by collapsing the port surfaces. |
| **(b) Extend `SubmitTransport` with `submitWithPayment(handoff, payment) → SubmitOutcome`** | One port; payment is a payload on the submit call. Atomic single-call. | Rejected — couples two adopter concerns (submit transport + payment rail); forces every `SubmitTransport` implementation to either implement rail semantics or document "payment: not supported" on every adapter; the rail lifecycle (authorize / capture / void) has no natural home on a request-shaped port. The "single-call atomicity" promise is also a lie at the rail-API level — every real rail exposes authorize and capture as distinct operations, so collapsing them at the web port just pushes the lifecycle complexity into every transport implementation. Multi-rail composition becomes especially awkward (different rails on different submit endpoints?). |
| **(c) Wrap `SubmitTransport` in a `PaymentAwareSubmitTransport` decorator** | One port shape, decorated adapter implements the authorize/capture/void path internally. | Rejected — the payment lifecycle (authorize, capture, void) is not visible from the decorated `SubmitTransport` interface; consumers (`RespondentRuntime`) would need a side-channel to drive `voidAuthorization` after a failed submit, defeating the decorator pattern. The decorator obscures whether the composition's submit is "free submit" or "paid submit"; debug + telemetry get muddied. Same anti-pattern as FW-0044 considered-and-rejected option (c). |
| **(d) Two ports: `PaymentAuthorizer` + `PaymentCapturer`** | Authorize on one port, capture on another. | Rejected — the two operations are tightly coupled around a single rail-side transaction identity. Splitting them across ports forces adopters to coordinate two adapters per rail, but no rail SDK exposes them on separate transports. Single-port-per-rail is the correct grain. |

**Decision: (a).** Justified above; matches existing port discipline.

## Decision on atomicity: orchestrate at the runtime layer (authorize → submit → capture-or-void)

The row's title commits to "pay and submit succeed or fail as one transaction." Pressure-tested at the port level: NO single rail-API call can atomically charge AND submit, because the rail and the form intake are different services. The standard rail-side primitive that approximates the promise is **authorize-then-capture with void-on-failure**:

1. `authorize(amount, methodToken)` HOLDS funds against the user's account without charging. The user's statement may show a "pending" line; no money has moved.
2. The form's intake `submit(handoff, key)` runs as today.
3. If submit SUCCEEDS, `capture(authorization)` CHARGES the held funds. The user's statement settles to a real charge.
4. If submit FAILS, `voidAuthorization(authorization)` RELEASES the hold. The "pending" line drops off the user's statement (typically within minutes to hours, depending on the rail); no charge ever happened.

The user's account sees ONLY a successful charge OR no charge — never an orphan charge with a failed submission, never a successful submission with no charge. The "atomic" promise is honored at the user-observable level, which is the load-bearing surface.

**Why this is correct over alternatives:**

- **Submit-then-charge.** Rejected: if the charge fails after a successful submit, the upstream service has accepted a paid record but no money moved. The respondent has no recourse: their form is in the system, their card was not charged, and the issuer's reconciliation is broken.
- **Charge-then-submit.** Rejected: if the submit fails after a successful charge, the respondent has paid but their form was not received. The respondent has to call support to recover; the worst possible failure mode for the row's promise.
- **Authorize-then-submit-then-capture (this design).** ACCEPTED: voiding releases the hold cleanly; the respondent never sees a charge they cannot match to a successful submission.

**What this design does NOT promise:** absolute atomicity in the database-transaction sense. A network failure between authorize and submit can leave a hold on the user's account that the runtime never voids (the browser tab closed). The rail's hold-expiration mechanism (typically 7 days for card networks; rail-specific for ACH and others) is the safety net for that case. Slice 1 documents this explicitly in `docs/ports/payment-rail-adapter.md`. Production adapters MAY add a server-side reconciliation layer (a daily cron that voids stale authorizations); that is out of slice 1 scope.

## Decision on runtime feature key: add `payment` — seventh taxonomy extension

ADR-0011 §"Feature Ownership Table" already enumerates `payment` (instance capability: "payment rail adapter"; org-policy: "merchant account and rail policy"; form-policy: "fees required"). The decision materializes the taxonomy entry, not inventing a new one.

| Concern | Gated by | Slice 1 wiring |
|---|---|---|
| Charging the user as part of submit | `payment` | New key. Production: `unavailable`. Demo/stub: `demo-stub` (in-memory). |

Implications:

1. `src/policy/feature-keys.ts`: extend `RUNTIME_FEATURE_KEYS = [..., 'payment'] as const` (append-only ordering per the comment).
2. `src/policy/feature-port-map.ts`: add `payment: 'paymentRailAdapter'` — 1:1 mapping, no transitional slot-sharing.
3. `src/composition/types.ts`: add `paymentRailAdapter: PaymentRailAdapter` to `Composition`.
4. **Default compositions:** `payment: 'unavailable'` in production; `payment: 'demo-stub'` in demo/stub. Coherence assertion handles the new key/port pair automatically through the existing `RUNTIME_FEATURE_KEYS` loop.
5. **Narrowed-route compositions:** uniformly wire `unavailablePaymentRailAdapter()` + declare `payment: 'unavailable'` on every narrowed route. None of `/status`, `/obligations`, `/documents`, `/history` accepts submissions — payment is irrelevant. No descriptor adds `'payment'` to its `consumes` set today.
6. **Org-policy limits.** Slice 1 wires `orgRuntimePolicy.features.payment: 'allowed'`. Org-level limits (per-rail caps, accepted-methods allowlist, minimum / maximum charge amount) are slice-2 concerns (`orgRuntimePolicy.limits.payment`: typed but unconsumed in slice 1, with a fixture-pinned schema sketch).

## Decision: `required`, not `optional`

FW-0044's offline extractor declares `offlineSubmit: 'optional'` — a form that wants offline support works fine ONLINE without a queue. **Payment is different.** A fee-bearing form on an instance with no payment rail cannot be honestly submitted — the rail's absence is a HARD blocker, not a graceful enhancement. This matches the FW-0033 attachment-field walker shape (a form with an attachment field cannot be honestly rendered without an object store; the extractor declares `'required'`; production instances without an object store fail-load with `UnsupportedRequiredFeatureError`).

So the extractor declares `'required'`. The form fails-load with a typed runtime-policy error when the instance cannot satisfy it; the respondent sees the plain-language "This form requires payment, but this site is not set up to accept payments." copy at the form-load boundary, not a confused submit failure mid-flow. That is the honest disclosure ADR-0011 §Rationale #1 asks for.

The trade: an instance that genuinely cannot do payment cannot load a fee-bearing form. That is the correct behavior. If a future deployment posture needs "free-tier opt-out for fee-bearing forms" (e.g., a means-tested fee waiver that some respondents qualify for), the form-policy extractor would need access to identity / response data to decide between `'required'` and `'optional'` per-session — that is a slice-2 concern not in scope for the substrate.

## Decision on composition coordination: in-form only; route-narrowed factories noop

FW-0027 is **in-form, not standalone-route.** Payment IS part of the form-fill flow when the form has fees; there is no separate "/pay" page. The new `paymentRailAdapter` slot needs to be present on every Composition (full-app + every narrowed route) because the coherence assertion iterates over `RUNTIME_FEATURE_KEYS`, but:

- **Full-app composition (`createDefaultComposition` + `createStubComposition`):** wires the real / stub rail adapter.
- **Narrowed-route composition (`createRouteNarrowedComposition`):** wires `unavailablePaymentRailAdapter()` (production AND stub modes) + declares `payment: 'unavailable'`. None of `/status`, `/obligations`, `/documents`, `/history` submits — the rail is by definition not a form-fill surface. The coherence assertion accepts `unavailable` adapter + `unavailable` declaration as a coherent pair.

No descriptor adds `'payment'` to its `consumes` set today. Every shipped narrowed route is uniformly noop on the rail.

## Composition coordination — slot table

| Slot | Production (default) | Demo (stub) | Narrowed routes (all modes) | Notes |
|---|---|---|---|---|
| `paymentRailAdapter` | `unavailablePaymentRailAdapter()` | `stubPaymentRailAdapter()` | `unavailablePaymentRailAdapter()` | New slot. Adopters fork the production wiring per their merchant / rail stack. |
| `instanceCapabilities.payment` | `'unavailable'` | `'demo-stub'` | `'unavailable'` | New key. |
| `orgRuntimePolicy.features.payment` | `'allowed'` | `'allowed'` | `'allowed'` | Default org policy doesn't forbid payment; instances simply can't do it by default. |
| `formRuntimePolicyExtractor` | `CompositeFormRuntimePolicyExtractor([..., new PaymentRequirementExtractor()])` | `CompositeFormRuntimePolicyExtractor([..., new PaymentRequirementExtractor()])` | `new EmptyFormRuntimePolicyExtractor()` | New composite delegate appended; narrowed routes keep the empty extractor (no definition in scope). |

## Demo form posture

The bundled `sample-form.json` does NOT declare `extensions['x-formspec-payment-required']: true` in slice 1. The decision is to **leave the demo form unchanged** — the `payment` feature key is wired through the entire policy + coherence + extractor pipeline (exercised via test fixtures that synthesize payment-declared definitions), but the bundled demo doesn't show the payment affordance live. Reasons:

1. The slice-1 in-memory stub authorizes and captures without exercising a real rail; `npm run dev` users would see "Authorizing payment…" then "Payment captured" on the demo form, which leaks a payment metaphor into the OSS reference's "free demo" surface in a confusing way.
2. The slice-1 payment path requires a synthetic `methodToken: 'demo-method-stub'` payload; the demo experience has no method-picker UI to surface this naturally.
3. Adopters who want to see the payment affordance end-to-end can compose their own demo form with `x-formspec-payment-required: true` + verify via the synthetic-definition tests + the conformance suite.

A **follow-on row FW-0100** ("Demo form: add payment-required declaration once a method-picker UX ships") is filed; gated on FW-0089 + FW-0094 (production rail + multi-rail composition + picker), not on slice 1.

## Port boundaries — `PaymentRailAdapter` shape

```ts
// src/ports/payment-rail-adapter.ts

export interface Money {
  /**
   * Amount in minor currency units (cents for USD, pence for GBP, etc.).
   * MUST be a non-negative integer. The minor-units convention avoids
   * floating-point drift; never use Number for money in fractional form.
   */
  readonly amountMinorUnits: number;
  /**
   * ISO-4217 currency code (3-letter uppercase, e.g. 'USD', 'EUR', 'GBP').
   * The adapter MAY reject currencies it does not support; the conformance
   * suite asserts shape, not adapter coverage.
   */
  readonly currency: string;
}

export interface Authorization {
  /**
   * Discriminator literal so server-side / verifier detection inside
   * arbitrary contexts is keyed off a non-empty field.
   */
  readonly kind: 'payment-authorization';
  /** Adapter's canonical authorization reference (rail-specific opaque string). */
  readonly id: string;
  /** Money held under this authorization. */
  readonly amount: Money;
  /**
   * Adopter-readable rail label ("Card", "ACH bank transfer", "PayNearMe cash").
   * Used in the respondent-facing "Payment captured" confirmation copy.
   */
  readonly railLabel: string;
}

export interface CaptureReceipt {
  readonly kind: 'payment-capture-receipt';
  /** The authorization this capture settled. */
  readonly authorizationId: string;
  /** Money actually charged (always == authorization.amount for slice 1; partial-capture is FW-0099). */
  readonly amount: Money;
  /** Rail-specific settled transaction identifier (suitable for receipt display). */
  readonly settledTransactionId: string;
  /** Echoes the authorization's railLabel for receipt display. */
  readonly railLabel: string;
}

export interface PaymentRailAdapter {
  /**
   * Place a HOLD on funds without charging. The user's statement may show
   * a pending line; no money has moved. Idempotent on (idempotencyKey):
   * same key MUST return the same Authorization. Reject non-UUIDv7 keys.
   */
  authorize(
    amount: Money,
    methodToken: string,
    idempotencyKey: string,
  ): Promise<Authorization>;

  /**
   * Settle a prior authorization — actually move the money. Idempotent
   * on (idempotencyKey): same key MUST return the same CaptureReceipt.
   * Adapters MUST reject capture against an unknown authorization (id
   * the adapter did not produce). Adapters MUST reject double-capture
   * (calling capture twice against the same authorization with two
   * different keys is a contract violation; the adapter throws).
   */
  capture(
    authorization: Authorization,
    idempotencyKey: string,
  ): Promise<CaptureReceipt>;

  /**
   * Release a prior authorization without charging. Idempotent on
   * (idempotencyKey): same key MUST resolve without throwing. Adapters
   * MUST reject void against an already-captured authorization (the
   * money has moved; release-after-charge is a refund, not a void —
   * filed as FW-0095). Adapters SHOULD accept void against an unknown
   * authorization as a no-op (the runtime calls void in a catch path
   * and may not know whether authorize succeeded).
   */
  voidAuthorization(
    authorization: Authorization,
    idempotencyKey: string,
  ): Promise<void>;
}
```

The opaque `methodToken: string` is the slice-1 abstraction over per-rail method identifiers (a Stripe `pm_*` token, a Square nonce, a generic-card temporary id from the W3C Payment Request API). The runtime extracts the token from `definition.extensions['x-formspec-payment-method-token']` in slice 1 (literal fixture value `'demo-method-stub'` for the test cases); production rails surface their own pickers that produce the token. That picker UX is post-slice.

## Vocabulary firewall

Every visible string respects `formspec-web/CLAUDE.md` §Vocabulary firewall:

- **Respondent-facing copy:** "payment", "fee", "amount", "you'll be charged", "Authorizing payment…", "Capturing payment…", "Payment captured", "Payment released", "This form requires payment". Never "authorize", "capture", "void", "rail", "idempotency", "UUIDv7", "PaymentRailAdapter", "Authorization", "CaptureReceipt", "methodToken", "Money", "minor units", "ISO-4217".
- **Deferred-capability copy:** "Stripe, Square, ACH, and cash-via-retail-partner adapters are adopter-shipped — the OSS reference deployment does not include a production payment rail." — fixture-pinned.
- **Error copy on authorize failure:** "We could not start the payment. Please try again." + adopter-supplied detail when `Error.message` is plain enough; otherwise generic.
- **Error copy on submit-failed-payment-voided:** "Your form did not submit, and the payment was not charged. Please try submitting again." — fixture-pinned. This is the load-bearing user-protection copy: the respondent MUST know the charge was released.
- **Error copy on capture failure (submit succeeded but capture threw):** "Your form was submitted, but we had a problem with the payment. Please contact the sender about reference {referenceNumber}." — fixture-pinned. The submit IS in the system; the rail's settled-vs-pending reconciliation is the issuer's territory.
- **Confirmation copy with payment:** the existing `ConfirmationPanel` gains an optional "Payment received" sub-card showing the `railLabel`, formatted amount (in the user's locale), and `settledTransactionId`. Sub-card omitted when no payment was made.
- **Spec jargon `PaymentRailAdapter`, `paymentRailAdapter`, `payment` (the runtime feature key), `Authorization`, `CaptureReceipt`, `Money`** stays internal — never appears in DOM, never appears in user copy, never appears in adopter-facing error messages.

## Architectural surface — minimal new code

- `src/ports/payment-rail-adapter.ts` (new) — port interface + `Money` / `Authorization` / `CaptureReceipt` types.
- `src/ports/index.ts` (modify) — re-export the new port + types.
- `src/adapters/stub/payment-rail-adapter.ts` (new) — `stubPaymentRailAdapter()` in-memory adapter; marked `DEMO_STUB_ADAPTER`. Exposes test-only `_internalAuthorizationStates()`, `failNextAuthorize(error)`, `failNextCapture(error)` helpers.
- `src/adapters/unavailable/payment-rail-adapter.ts` (new) — `unavailablePaymentRailAdapter()` sentinel; throws; marked `UNAVAILABLE_ADAPTER`.
- `src/adapter-conformance/conformance.ts` (modify) — add `definePaymentRailAdapterConformance` + `PaymentRailAdapterConformanceSubject` type. Add `samplePaymentAmount()` fixture.
- `src/adapter-conformance/index.ts` (modify) — re-export.
- `src/adapter-conformance/fixtures.ts` (modify) — add `samplePaymentAmount` (Money) + `samplePaymentMethodToken` (`'demo-method-stub'`).
- `tests/adapter-conformance/_framework/conformance.ts` (modify) — re-export the new define.
- `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts` (new) — invokes the conformance suite against the stub adapter.
- `scripts/check-conformance-coverage.mjs` (modify) — add `PaymentRailAdapter` to `portSuites` + add the new stub adapter to `stubPortsByPath` + add the unavailable sentinel to `unavailableSentinelFactoriesByPath` + add `definePaymentRailAdapterConformance` to `requiredHarnessExports`.
- `src/policy/feature-keys.ts` (modify) — append `'payment'`.
- `src/policy/feature-keys.test.ts` (modify) — extend `RUNTIME_FEATURE_KEYS.toEqual(...)` assertion; flip the `'payment'` assertion from `false` to `true` and add a new sentinel `'fictional'`-style assertion.
- `src/policy/feature-port-map.ts` (modify) — add `payment: 'paymentRailAdapter'`.
- `src/policy/extract-form-policy.ts` (modify) — add `extractPaymentRequirement(definition)` pure walker; returns `'required' | undefined` based on `definition.extensions['x-formspec-payment-required'] === true`. Add `extractPaymentAmount(definition) → Money | undefined` for runtime consumption.
- `src/policy/extract-form-policy.test.ts` (modify) — add cases for payment opt-in (absent / present-true / present-false / present-non-boolean) + amount (absent / well-formed / fractional-minor-units / missing currency).
- `src/adapters/composing/form-runtime-policy-extractor.ts` (modify) — add `PaymentRequirementExtractor`; wrap `extractPaymentRequirement`.
- `src/composition/types.ts` (modify) — add `paymentRailAdapter: PaymentRailAdapter` slot.
- `src/composition/default.ts` (modify) — declare `payment: 'unavailable'` + wire `unavailablePaymentRailAdapter()` + append `new PaymentRequirementExtractor()` to the composite extractor; update org-policy features.
- `src/composition/stub.ts` (modify) — declare `payment: 'demo-stub'` + wire `stubPaymentRailAdapter()` + append `new PaymentRequirementExtractor()` to the composite extractor; update org-policy features.
- `src/composition/route-narrowing.ts` (modify) — add `paymentRailAdapter: unavailablePaymentRailAdapter()` to both narrowed-route branches; extend `instanceCapabilities` / `orgRuntimePolicy.features` declarations.
- `src/app/RespondentRuntime.tsx` (modify) — extend `SubmitState` with `'authorizing-payment'` / `'capturing-payment'` / `'voiding-payment'` cases; refactor `handleSubmit` to call a new `submitWithPayment(...)` helper. Extend `SubmitNotice` + `ConfirmationPanel` with payment sub-cards. Extend `runtimePolicyErrorCopy` with the `payment` row.
- `src/app/respondent-flow.ts` (modify) — add `submitWithPayment(...)` helper that encapsulates the authorize → submit → capture-or-void orchestration. Pure function over its dependencies → discriminated outcome `{kind: 'submitted-no-payment', confirmation} | {kind: 'submitted-with-payment', confirmation, captureReceipt} | {kind: 'submit-failed-payment-voided', error} | {kind: 'authorize-failed', error} | {kind: 'capture-failed', confirmation, error}`. Co-located here because the existing `buildIntakeHandoff` lives in the same module.
- `src/app/respondent-flow.test.ts` (modify) — unit-test the `submitWithPayment` decision matrix.
- `docs/ports/payment-rail-adapter.md` (new) — adopter doc per the other-port template.
- `docs/policy/runtime-feature-resolution.md` (modify) — add `payment` to the worked-key examples + the in-form atomic pay-and-submit worked example.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` (footer append, one bullet) — `payment` is the seventh feature key.
- `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts` (new) — runs the conformance suite against `stubPaymentRailAdapter`.
- `tests/adapters/payment-rail-adapter-stub.test.ts` (new) — stub-specific behavior: in-memory persistence, authorization lifecycle states, `_internalAuthorizationStates` matches, marker presence.
- `tests/adapters/payment-rail-adapter-unavailable.test.ts` (new) — sentinel-specific behavior: throws plain-language message.
- `tests/adapters/unavailable-sentinel.test.ts` (modify) — extend with the new sentinel.
- `tests/adapters/demo-stub-marker.test.ts` (modify) — extend with the new stub.
- `tests/app/respondent-runtime-payment.test.tsx` (new) — end-to-end through `RespondentRuntime`: render with the stub composition + a synthetic definition declaring `x-formspec-payment-required: true`; submit; assert state transitions through `'authorizing-payment'` → `'submitting'` → `'capturing-payment'` → `'confirmed'`; assert the captureReceipt appears in the confirmation panel; assert the stub's authorization state is `'captured'`.
- `tests/app/respondent-runtime-payment.test.tsx` (same file) — coverage for submit-fails-voids: configure the stub composition with a `SubmitTransport` that throws on submit; render with payment-required form; submit; assert state transitions through `'authorizing-payment'` → `'submitting'` → `'voiding-payment'` → `'error'`; assert the stub's authorization state is `'voided'`; assert rendered DOM has the "Your form did not submit, and the payment was not charged" copy.
- `tests/app/respondent-runtime-payment.test.tsx` (same file) — coverage for the disabled branches: form requires payment but composition is `unavailable` → `UnsupportedRequiredFeatureError` at form load → `RuntimePolicyErrorPage` renders "This form requires payment, but this site is not set up to accept payments." copy.
- `tests/app/respondent-runtime-payment.test.tsx` (same file) — coverage for vocabulary firewall: rendered DOM never contains "authorize", "capture", "void", "rail", "idempotency", "PaymentRailAdapter", "Authorization", "CaptureReceipt", "methodToken", "Money", "payment-rail", "paymentRailAdapter" as substrings.
- `tests/app/respondent-runtime-payment.test.tsx` (same file) — coverage for idempotency-key preservation: assert that the runtime's authorize / capture / void calls use deterministic keys derived from the submit key, so a runtime-level retry would re-use the triple.
- `tests/policy-resolution/cases/payment-required-unavailable-throws.json` (new) — resolver fixture: form required + instance unavailable → `UnsupportedRequiredFeature` throw.
- `tests/policy-resolution/cases/payment-demo-stub-satisfies-required.json` (new) — resolver fixture: demo + form required + demo-stub → enabled.
- `tests/policy-resolution/cases/payment-disabled-no-instance.json` (new) — resolver fixture: form silent + instance unavailable → `not-requested`.
- `tests/policy-resolution/cases/*.json` (modify all 24 pre-existing cases) — backfill the new `payment` key in `instance` / `org` / `expect.disabled` blocks per the append-only key contract.
- `tests/profiles/composition-coherence.test.ts` (modify if it enumerates ports) — descriptor matrix automatically covers the new slot.
- `tests/composition/route-narrowing.test.ts` (modify) — descriptor matrix coverage for the new slot (uniform `unavailable` across all descriptors); add `'payment'` to the "no descriptor consumes today" invariant.
- `src/policy/freeze-composition.test.ts` (modify) — extend the coherent + incoherent cases with the new slot.
- `tests/adapter-conformance/README.md` (modify) — list the new port suite.
- `PLANNING.md` (modify) — FW-0027 row → `live (slice 1)` with named release gaps + follow-on rows FW-0089 / FW-0090 / FW-0091 / FW-0092 / FW-0093 / FW-0094 / FW-0095 / FW-0096 / FW-0097 / FW-0098 / FW-0099 / FW-0100.

## Non-goals (explicit, to bound scope)

- **No production rail adapter.** Stripe, Square, W3C Payment Request API, PayNearMe, in-person POS — all adopter-side. Filed.
- **No multi-rail composition.** Single port wiring; future composition picks one rail per submit. Filed.
- **No refunds.** Different lifecycle (operates on captured transaction). Filed.
- **No cross-currency.** Fixed per form via the extension. Filed.
- **No FEL-evaluated dynamic amount.** Slice 1 uses a literal fixed amount from the extension. Filed.
- **No saved-method picker / wallet integration.** Adopter-side picker UX; the `methodToken` opacity is enough to carry these. Filed.
- **No webhook reconciliation.** Adapter-side; rail-specific. Filed per rail.
- **No receipt-portal payment-line.** Slice 1 surfaces the `railLabel` in the confirmation panel only; the receipt-portal payment card is FW-0009 / FW-0054 territory.
- **No partial / split-tender payment.** Filed.
- **No `IntakeHandoff` shape change.** The handoff stays as-is; the capture receipt is surfaced in the confirmation panel and persisted (slice-1 in-process only) but not embedded in the intake message. Slice-2 work may add an `extensions['x-formspec-payment-capture']` field to the handoff so the upstream service knows the rail's transaction id at intake time; out of slice 1 scope.
- **No new schema ratification.** The form-side `x-formspec-payment-required` + `x-formspec-payment-amount` + `x-formspec-payment-method-token` are stack-extension concerns (file EXT row if needed; web slice 1 fixture-pins the shape but does not ratify it).
- **No PCI-DSS scope expansion.** The slice-1 port carries opaque tokens only; raw card data never enters the web layer. Production rail adapters MUST tokenize at the rail SDK boundary.

## Test coverage matrix

| Behaviour | Test |
|---|---|
| Port conformance: authorize accepts a Money + opaque methodToken with a UUIDv7 idempotency key | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#authorize` |
| Port conformance: same idempotencyKey authorized twice returns the same `Authorization` | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#authorize idempotent` |
| Port conformance: `capture` settles the authorization and returns a `CaptureReceipt` | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#capture` |
| Port conformance: same idempotencyKey captured twice returns the same `CaptureReceipt` | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#capture idempotent` |
| Port conformance: `voidAuthorization` releases the hold without throwing | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#void` |
| Port conformance: void against a captured authorization throws | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#void after capture throws` |
| Port conformance: capture after void throws | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#capture after void throws` |
| Port conformance: capture against an unknown authorization throws | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#unknown authorization` |
| Port conformance: non-UUIDv7 idempotency key rejected on authorize / capture / void | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#rejects bad key` |
| Port conformance: fractional `amountMinorUnits` rejected | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#money integer` |
| Port conformance: empty currency rejected | `tests/adapter-conformance/payment-rail-adapter/conformance.test.ts#money currency` |
| Stub-specific: marker presence + featureKey | `tests/adapters/payment-rail-adapter-stub.test.ts#marker` |
| Stub-specific: `failNextAuthorize` injects a thrown authorize | `tests/adapters/payment-rail-adapter-stub.test.ts#failNextAuthorize` |
| Stub-specific: `failNextCapture` injects a thrown capture | `tests/adapters/payment-rail-adapter-stub.test.ts#failNextCapture` |
| Stub-specific: `_internalAuthorizationStates` reflects authorize → capture → voided transitions | `tests/adapters/payment-rail-adapter-stub.test.ts#states` |
| Sentinel-specific: throws plain-language message on authorize / capture / void | `tests/adapters/payment-rail-adapter-unavailable.test.ts#throws` |
| Sentinel registry extended | `tests/adapters/unavailable-sentinel.test.ts` + `tests/adapters/demo-stub-marker.test.ts` |
| Form-policy walker: absent → undefined | `src/policy/extract-form-policy.test.ts#payment absent` |
| Form-policy walker: `x-formspec-payment-required: true` → 'required' | `src/policy/extract-form-policy.test.ts#payment true` |
| Form-policy walker: `x-formspec-payment-required: false` → undefined | `src/policy/extract-form-policy.test.ts#payment false` |
| Form-policy walker: non-boolean ignored (returns undefined) | `src/policy/extract-form-policy.test.ts#payment non-boolean` |
| Amount walker: well-formed extension → Money | `src/policy/extract-form-policy.test.ts#amount well-formed` |
| Amount walker: missing → undefined | `src/policy/extract-form-policy.test.ts#amount absent` |
| Resolver: `payment` required + unavailable → `UnsupportedRequiredFeature` throw | `tests/policy-resolution/cases/payment-required-unavailable-throws.json` |
| Resolver: `payment` required + demo-stub satisfies | `tests/policy-resolution/cases/payment-demo-stub-satisfies-required.json` |
| Resolver: `payment` silent + unavailable → not-requested | `tests/policy-resolution/cases/payment-disabled-no-instance.json` |
| `RespondentRuntime`: payment-required form + demo stub → authorize → submit → capture → confirmed | `tests/app/respondent-runtime-payment.test.tsx#happy path` |
| `RespondentRuntime`: submit fails after authorize → void → error with user-protection copy | `tests/app/respondent-runtime-payment.test.tsx#submit fails voids` |
| `RespondentRuntime`: payment-required form + production unavailable → form-load error page with plain-language copy | `tests/app/respondent-runtime-payment.test.tsx#unavailable fails form load` |
| `RespondentRuntime`: idempotency-key derivation deterministic across authorize / capture / void | `tests/app/respondent-runtime-payment.test.tsx#idempotency derivation` |
| Vocabulary firewall: rendered DOM contains no `authorize`, `capture`, `void`, `rail`, `idempotency`, `PaymentRailAdapter`, `Authorization`, `CaptureReceipt`, `methodToken`, `Money`, `payment-rail`, `paymentRailAdapter` substrings | `tests/app/respondent-runtime-payment.test.tsx#vocabulary firewall` |
| Composition coherence: every existing factory + the new seventh key pass `assertCompositionCoherence` | `tests/profiles/composition-coherence.test.ts` + `src/policy/freeze-composition.test.ts` |
| Feature-key registry: `payment` is in `RUNTIME_FEATURE_KEYS` (append-only) | `src/policy/feature-keys.test.ts` |
| Conformance coverage script enumerates the new port | `tests/scripts/check-conformance-coverage.test.mjs` (via the script run by `npm run ci`) |
| `submitWithPayment` decision matrix: free / paid-success / paid-submit-fails / paid-capture-fails / paid-authorize-fails | `tests/app/respondent-flow.test.ts` |

## Risks and what catches them

- **Risk:** the new key extension breaks 24 policy-resolution fixtures + the `RUNTIME_FEATURE_KEYS.toEqual(...)` test simultaneously, making the PR uncommittable until every fixture is updated. **Catch:** mirror FW-0044's pattern — backfill all fixtures in a single test-only commit immediately after the policy module commit; verify via `npm run test:unit -- policy-resolution` before continuing.
- **Risk:** the runtime authorizes, submit succeeds, capture fails (network glitch between submit and capture) — the user is submitted but unpaid; the issuer's reconciliation is broken. **Catch:** the slice-1 design surfaces this explicitly as the `'capture-failed'` outcome with copy that names the reference number and tells the respondent to contact the sender. The right long-term shape is server-side reconciliation (a worker that re-captures stale authorizations); that is adapter-side and out of slice 1.
- **Risk:** the runtime authorizes, submit fails, void fails (network glitch between submit and void) — the user has a hold on their account that never clears via the runtime. **Catch:** card networks expire holds (typically 7 days); ACH and other rails have their own expiration. Adapter-side reconciliation can also help. The slice-1 design documents this in `docs/ports/payment-rail-adapter.md`; the user-facing copy on the `'error'` state after a failed void surfaces "If you see a pending charge on your account, it will be released automatically within a few days."
- **Risk:** the respondent retries submit after a `'capture-failed'` outcome and the runtime re-authorizes (double-hold). **Catch:** the runtime uses a STABLE idempotency key per submit attempt (the submit key derived from the engine response id) so re-clicking submit on the same browser tab re-uses the same authorize key — the rail's same-key contract returns the same authorization (no double-hold). A retry after a tab close + reopen would re-generate the submit key; that is the "user re-initiated payment" semantics, which is correct.
- **Risk:** the `methodToken` extracted from the form extension is a literal string with no security framing; an adopter could leak credentials in it. **Catch:** the slice-1 design treats `methodToken` as an opaque, adopter-supplied identifier whose secret-management is the adapter's concern (most real tokens are server-vended ephemeral references). The conformance suite asserts the port shape, not the token's content. Documented in `docs/ports/payment-rail-adapter.md`.
- **Risk:** the stub adapter's in-memory state leaks between tests via the demo composition. **Catch:** the stub adapter constructor returns a fresh adapter per call; each test that needs the stub composition gets a fresh instance via `createStubComposition()`. Existing pattern (matches `stubOfflineSubmitQueue`).
- **Risk:** the runtime's payment orchestration races with a `'queued'` offline-submit state (a fee-bearing form submitted offline). **Catch:** slice 1 forbids the composition `offlineSubmit + payment` BOTH enabled on the same form-policy decision in the runtime. If a form declares both `x-formspec-offline-submit: true` AND `x-formspec-payment-required: true`, the runtime takes the synchronous path (online or fail); offline payment queueing is a hard composability problem (the authorization expires before the user reconnects). The runtime asserts this combination throws `UnsupportedRequiredFeatureError` with a fixture-pinned message naming the conflict. Filed for future cross-feature work as **FW-0101** (offline + payment composition).
- **Risk:** the form-policy extractor reads `extensions['x-formspec-payment-required']` against a JS shape that's never schema-validated. **Catch:** the walker treats `=== true` as the truthy case and ignores anything else; any non-boolean falsy or non-`true` truthy returns `undefined`. The extract-form-policy test matrix pins these cases.

## What FW-0027 ships and what stays open

**Ships:**
- New `PaymentRailAdapter` port + `Money` / `Authorization` / `CaptureReceipt` types.
- Conformance suite + stub adapter (with failure-injection knobs) + unavailable sentinel.
- New `payment` runtime-feature key (seventh extension of the closed taxonomy).
- New form-policy extractor (`PaymentRequirementExtractor`) reading `extensions['x-formspec-payment-required']`.
- New `paymentRailAdapter` slot on `Composition`; wired in default + stub + narrowed-route factories.
- `RespondentRuntime` authorize → submit → capture-or-void orchestration + new `'authorizing-payment'` / `'capturing-payment'` / `'voiding-payment'` SubmitStates + payment sub-card on `ConfirmationPanel`.
- Honest "Authorizing payment…" + "Payment captured" + "Your form did not submit, and the payment was not charged" + "Stripe, Square, ACH, and cash-via-retail-partner adapters are adopter-shipped" copy.
- Adopter docs + ADR-0011 cross-reference + runtime-feature-resolution.md updates.
- Offline+payment hard-conflict assertion (FW-0101 filed).

**Stays open (named follow-on rows):**
- **FW-0089** — Stripe reference adapter (card + ACH via Stripe; Apple Pay / Google Pay via Stripe Elements + Payment Request API).
- **FW-0090** — W3C Payment Request API reference adapter (generic-card, browser-native).
- **FW-0091** — Square reference adapter.
- **FW-0092** — PayNearMe cash-via-retail-partner reference adapter.
- **FW-0093** — In-person POS handoff reference adapter.
- **FW-0094** — Multi-rail composition (`CompositePaymentRailAdapter` analogous to FW-0028 `CompositeIdentityProvider`) + per-submit picker UX.
- **FW-0095** — Refund lifecycle (`refund(captureReceipt, amount?, key) → Refund`) + receipt updates.
- **FW-0096** — Cross-currency / locale-aware money display.
- **FW-0097** — FEL-evaluated dynamic payment amount.
- **FW-0098** — Saved-method picker + wallet integration (Apple Pay / Google Pay / Stripe Link).
- **FW-0099** — Split-tender / partial-payment.
- **FW-0100** — Demo form: declare `x-formspec-payment-required: true` once a method-picker UX ships (gated on FW-0089 + FW-0094).
- **FW-0101** — Offline + payment composition (currently hard-rejected in slice 1; lift the restriction once a substrate exists for held-authorization-replay).

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — new `payment` capability key
- [FW-0033 design](2026-05-23-fw-0033-file-upload-design.md) — IN-FORM new-port + capability-key + REQUIRED extractor precedent (most analogous)
- [FW-0044 design](2026-05-24-fw-0044-offline-capable-fill-design.md) — IN-FORM new-port + runtime-orchestration-around-submit precedent (`submitWithPayment` mirrors `submitOrQueue`)
- [FW-0028 design](2026-05-24-fw-0028-multi-idp-picker-design.md) — composition pattern (`CompositePaymentRailAdapter` mirrors `CompositeIdentityProvider`; deferred to FW-0094)
- [FW-0066 design](2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md) — `FormRuntimePolicyExtractor` port the payment extractor implements
- [`docs/ports/payment-rail-adapter.md`](../../docs/ports/payment-rail-adapter.md) — adopter doc (new)
- [`docs/policy/runtime-feature-resolution.md`](../../docs/policy/runtime-feature-resolution.md) — worked example (modified)
