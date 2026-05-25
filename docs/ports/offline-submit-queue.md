# OfflineSubmitQueue

`OfflineSubmitQueue` persists submission handoffs that could not be sent
synchronously (typically because the device is offline) and drains them when
connectivity returns, preserving the original UUIDv7 idempotency key so the
server's same-key contract suppresses duplicates. Without this port, a form
loaded on a flaky network silently fails at submit with no recovery path:
the bytes are produced, the user sees "We could not submit this form", and
nothing replays.

Adapter contract:

- `enqueue(handoff, idempotencyKey)` accepts an `IntakeHandoff` per
  `formspec/schemas/intake-handoff.schema.json` and a UUIDv7
  idempotency key. Idempotent: calling with the same key twice returns the
  SAME `QueuedSubmit` and `pending()` length stays at 1. Reject non-UUIDv7
  keys (queue EXT-14 convention, same shape as `SubmitTransport.submit`).
- `replay()` drains pending entries by submitting each through the
  injected `SubmitTransport`, preserving each entry's original
  idempotency key. FIFO order. Returns a `ReplayOutcome[]` of the same
  length as the pre-drain pending set. Successful entries are removed;
  failed entries remain for the next replay.
- `pending()` returns a snapshot of currently-pending entries. Empty
  when nothing is queued.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/offline-submit-queue
```

## Why a separate port from `SubmitTransport`

Storage-and-replay and synchronous request-response are orthogonal adopter
concerns. The submit transport's idempotency-key generation,
response-shape contract, and inline retry semantics are different from a
durable queue's enqueue / replay / pending lifecycle. Bolting queue
operations onto `SubmitTransport` would force every adapter to either
implement queue semantics or document "queue: not supported"; the queue
lifecycle has no natural home on a request-shaped port. Adopters compose
both (queue + transport) as a unit at construction time, mirroring the
FW-0064 HTTP adapter cohort discipline.

## Transport-injection-at-construction

The injected `SubmitTransport` is the adapter's constructor concern, not a
port-level argument. The slice-1 stub is `stubOfflineSubmitQueue({
transport })`. Adopters wiring an HTTP submit transport plus an IndexedDB
queue pair them once at the composition root; the runtime never picks a
transport for the queue at call time.

## Optional `pending()` consumer

The slice-1 React shell does NOT render `pending()` on a per-submission
basis — the "Saved for later" panel is per-submit-state, not a global
queue inspector. The port exposes `pending()` for future diagnostic
surfaces (developer-view "pending queue" inspector) and to let adopter
tests assert state transitions without dispatching events. Treat the
slice-1 use of `pending()` in the runtime tests as the minimum consumer.

## Composition wiring

The full-app composition exposes the slot:

```ts
const composition: Composition = freezeComposition({
  // ...
  submitTransport: yourHttpSubmitTransport(),
  offlineSubmitQueue: yourIndexedDbQueue({ transport: yourHttpSubmitTransport() }),
  instanceCapabilities: { /* ... */ offlineSubmit: 'available' },
  // ...
});
```

The OSS reference deployment declares `offlineSubmit: 'unavailable'` and
wires `unavailableOfflineSubmitQueue()` until an adopter forks. The
narrowed-route factories (`/status`, `/obligations`, `/documents`,
`/history`) declare `unavailable` uniformly — those surfaces do not
submit.

## Form-policy gate

The default + stub composition's `formRuntimePolicyExtractor` (specifically
the `OfflineSubmitRequirementExtractor` reference adapter, composed into
the `CompositeFormRuntimePolicyExtractor` array) reads
`definition.extensions['x-formspec-offline-submit']`. When the value is
strictly `=== true`, the form's policy declares `offlineSubmit: 'optional'`.
The resolver enables the feature when the instance can satisfy it; when it
cannot, the resolver records `optional-no-instance` and the form loads
normally — offline is a graceful enhancement, not a hard requirement.

Any non-boolean / non-`true` value (false, "yes", undefined, omitted)
declines the opt-in.

## Why `optional`, not `required`

A form whose author wants offline support works fine ONLINE without a
queue — the existing synchronous submit path is the happy path; offline
is the fallback when the network drops. Declaring `'required'` would
fail-load the form on every instance without a queue, preventing more
users from filling it than it would help. If a future deployment posture
needs hard-required offline (e.g., a field-survey app that never loads on
online instances), file a follow-on row to introduce a per-form
`'requireOffline': true` flag with a separate failure path.

## Vocabulary firewall

The port name, the `offlineSubmit` capability key, the `OfflineSubmitQueue`
type, and the queue lifecycle terms (`enqueue`, `replay`, `pending`) never
appear in respondent-facing UI text. The respondent-facing copy is
"Saved for later" + "We'll send it when you reconnect" plus the
fixture-pinned `OFFLINE_DEFERRED_CAPABILITY_COPY` string ("Offline submit
support is experimental. Production deployments do not currently keep
your draft across browser restarts or across other devices.").

## What slice 1 does not ship

- Service-worker registration + lifecycle UX (FW-0081).
- Production IndexedDB queue adapter with at-rest encryption via the
  EXT-18 HPKE TS wrapper (FW-0082).
- Background Sync API integration for transparent flush when the tab is
  closed (FW-0083; depends on FW-0081 + FW-0082).
- Multi-tab queue coordination via BroadcastChannel or Web Locks (FW-0084).
- Cross-device queue migration via the wallet substrate (FW-0085; depends
  on FW-0078 production wallet + XS-2 token bag).
- Definition-drift detection on offline replay (FW-0086).
- A production reference adapter for any specific queue substrate.
  Adopters fork the composition file (<100 lines) and wire their own.
- A canonical wire-format ratification for the
  `x-formspec-offline-submit` definition extension. The slice-1 web work
  fixture-pins the shape; the cross-stack ratification follows in a
  stack-extension queue row.

## Slice-1 imperfection: `navigator.onLine` accuracy

The runtime reads `typeof navigator !== 'undefined' && navigator.onLine`
to decide whether to route through the queue. Modern browsers cache stale
online status (a tab in the background may report `onLine === true`
minutes after the network has actually dropped). The synchronous-submit
path's inline `fetch` failure is still the safety net for that case —
when the runtime decides "online" but the network is actually
unreachable, the existing error path surfaces "We could not submit this
form" and the user can retry. FW-0081 (service worker) addresses the
discrepancy more cleanly by intercepting the submit fetch and routing to
the queue at the network boundary.
