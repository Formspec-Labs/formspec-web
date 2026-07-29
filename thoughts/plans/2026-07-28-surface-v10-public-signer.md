---
name: Surface v10 public signing ceremony
date: 2026-07-28
status: ready-for-decision
tracking_item: fs-5g59
parent_plan: ../../../formspec/thoughts/archive/plans/2026-07-28-surface-render-v10-gap-closure.md
prerequisites_completed:
  - Surface 0.2 widget action bindings
  - Registry 1.1 widget action outputs
  - canonical widget action runtime
decision_gate: accept the signer app and bundle identity, ADR-0162 admission policy, ceremony port, custody model, durable attempt recovery, and supported signature methods
---

# Surface v10 public signing ceremony plan

## Result

Deliver the public signing ceremony as its own `formspec-web` product slice,
consistent with ADR 0001. It will not be hidden inside the respondent runtime
or moved into the staff host.

Completion means a signer reviews the exact referenced signature surface,
performs every required affirmative act, consents to the named intent, and
produces a canonical Response `AuthoredSignature`. The host saves that evidence
before one declared widget output invokes one exact Response Action and
navigates. A static ceremony route or a submit transition alone does not meet
this result.

## Decision gate

The current local stack contains the three prerequisites recorded above.
Implementation has not started. Before implementation, an accepted architecture
decision must define the signer app and bundle identity, the ADR-0162 admission
policy, the public ceremony port, signer authentication, custody model, durable
attempt recovery, and supported signature methods. This plan does not authorize
implementation, an implementation commit, a release, or a deployment.

## Existing authority

This slice reuses, rather than replaces:

- the WYSIWYS Ceremony 1.0 sidecar for exact-preimage display, scroll gates,
  per-field affirmative action, and forbidden bulk or single-click signing;
- ADR-0136 `SignatureSurface` and `DocumentArtifact` identities and hashes;
- the Formspec Signed Response Payload domain
  `formspec.response.signed-payload.v1`;
- Response `AuthoredSignature` for signer, consent, signed-payload, provider,
  and signature evidence;
- the Signature Method Registry, protected COSE `method_uri`, and injected key
  or provider adapters; and
- Surface 0.2 and Registry 1.1 action declarations.

An ADR must still ratify the browser ceremony port, signer app identity,
signed-bundle admission policy, custody model, recovery behavior, and which
signature methods the public reference implementation supports before
implementation starts.

## Signer app and signed-bundle admission

The signer is a separate app deployment, not a respondent route. The ADR must
name its canonical App Manifest `id`, signed-bundle location, entry Surface,
signer actor, publisher authority, expected-app policy, and pinned or monotonic
release policy. It must use a signer-specific app ID and bundle; it cannot reuse
the respondent or operator app identity, artifact location, or release state.

The host reuses stack ADR-0162's complete admission order over one immutable
candidate:

1. acquire one candidate snapshot;
2. verify its signature, publisher, app, method, validity, revocation, and
   release precondition;
3. schema-validate and AppGraph-validate its manifest and documents;
4. check the signer actor and select the declared entry Surface;
5. dereference the signed documents and prove structural renderability;
6. atomically commit release state for the signer app; and
7. admit and render that same snapshot.

Before admission, the document may contain only fixed host-owned checking,
refusal, unsupported, or unavailable text. No signer bundle title, WYSIWYS
content, Theme, Locale, widget, route, or diagnostic may reach the document.
Ceremony state starts only after the signer bundle is admitted.

## Concrete control and action path

The first conforming slice uses these stable authored identities:

- module: `x-formspec-signature`;
- Registry widget: `WysiwysSigner`;
- declared widget output: `signatureCompleted`;
- Surface mapping:
  `actionBindings.signatureCompleted.actionRef = "advance-after-signature"`;
- Response Action: `advance-after-signature`.

The host-owned `WysiwysSigner` adapter receives neither a route table nor direct
navigation. It displays the referenced WYSIWYS ceremony, invokes an injected
public-signature ceremony port, validates the returned evidence, and persists a
canonical `AuthoredSignature` on the Response. Only after that durable write
succeeds may it call `emitAction("signatureCompleted")`.

The mapped Response Action records the completed signature reference in the
host action ledger and makes the post-signature transition eligible. It does
not create or repair signature evidence. Navigation occurs once only after the
action reaches a successful terminal result and exactly one current-route
transition matches.

## Durable ceremony attempt and crash recovery

One host-created `ceremonyAttemptId` identifies the entire attempt. The host
persists it before contacting a provider and reuses it for:

- provider idempotency, redirect correlation, and result recovery;
- the idempotent Response write that stores one `AuthoredSignature`;
- the `advance-after-signature` action-ledger invocation; and
- the durable navigation-completion marker for the selected transition.

The persisted attempt advances through
`prepared → provider-pending → provider-completed → signature-persisted →
action-completed → navigation-pending → navigation-completed`. Each transition
compares the prior state and is idempotent. A retry with the same attempt may
replay the same result; it may not create a second provider ceremony,
signature, action invocation, or route-history entry.

Recovery checks the durable attempt before doing work:

- after provider completion but before the Response write, recover the provider
  result by `ceremonyAttemptId`, validate it, and resume the same idempotent
  `AuthoredSignature` write without asking the signer to sign again;
- after the Response write but before action emission, confirm the stored
  signature matches the attempt and emit the existing action invocation;
- after action emission but before navigation, replay the ledger outcome and
  persist its one eligible source-to-target transition as
  `navigation-pending`. If the current route is already the target, mark it
  complete. If it is still the recorded source, apply the target with
  idempotent replacement semantics and mark it complete. Refuse any other
  current route as stale; and
- when provider status is unknown, query or resume the provider attempt. Do not
  start another signature request until the prior attempt is definitively
  cancelled or failed under the accepted recovery policy.

## What goes in, what happens, and what comes out

### Inputs

- the current Response and immutable Definition version pin;
- a WYSIWYS Ceremony document and referenced `SignatureSurface` /
  `DocumentArtifact`;
- signer identity or provider session, where the selected method requires it;
- the displayed consent text, version, affirmation, and signing intent; and
- an injected ceremony adapter selected through the existing signature method
  registry.

### Processing

1. Admit the signer bundle in the ADR-0162 order above, including the atomic
   release-state commit.
2. Validate the admitted WYSIWYS sidecar, artifact references, and current
   signer route.
3. Display the exact referenced preimage and enforce the scroll and per-field
   affirmative-action gates.
4. Create and durably persist one `ceremonyAttemptId`.
5. Build the canonical Signed Response Payload with
   `authoredSignatures` omitted and bind its digest, response ID, Definition
   pin, signing time, and signing intent.
6. Ask the injected ceremony adapter to sign or obtain provider evidence,
   keyed by that attempt.
7. Persist provider completion, validate the resulting `AuthoredSignature`,
   including protected method identity and consent fields, then write it
   idempotently to the Response.
8. Emit `signatureCompleted` using that attempt as the stable action invocation
   identity.
9. Replay a durable prior outcome when needed and claim navigation once for a
   current successful result.

### Outputs

- a canonical Response `AuthoredSignature`, not a UI-only signature image;
- one durable ceremony attempt joining provider, Response, action-ledger, and
  navigation state;
- an explicit receipt or provider reference suitable for later verification;
  and
- a post-signature route reached through the mapped Response Action.

## Work packages

### S1 — Ratify app admission, custody, and recovery

- [ ] Accept an ADR that names the signer App Manifest `id`, bundle location,
  entry Surface, actor, publisher authority, expected-app policy, release
  policy, public ceremony port, and supported custody models.
- [ ] Reuse ADR-0162's immutable-snapshot admission order and atomic release
  commit; define fixed pre-admission UI.
- [ ] Define signer authentication, session expiry, cancellation, provider
  redirect recovery, and identity-evidence requirements.
- [ ] Define `ceremonyAttemptId`, its durable state machine, provider recovery,
  Response-write idempotency, action-ledger identity, and navigation marker.
- [ ] Define which fields the signer controls, which the host observes, and
  which the signature or provider response authenticates.

### S2 — Author the graph

- [ ] Register `WysiwysSigner` and its closed `signatureCompleted` output.
- [ ] Package the signer graph as the separately identified signed app bundle;
  do not place it in the respondent bundle.
- [ ] Bind the output to `advance-after-signature` in Surface 0.2.
- [ ] Add the exact Response Action and one eligible post-signature transition.
- [ ] Reject missing sidecars, unresolved artifacts, undeclared outputs,
  unresolved actions, and ambiguous transitions before signing.

### S3 — Implement the ceremony adapter

- [ ] Define the narrow public-signature ceremony port and conformance suite.
- [ ] Add one real supported adapter; keep private signing keys out of generic
  React and Surface packages.
- [ ] Validate and idempotently save `AuthoredSignature` under the durable
  attempt before emitting completion with that same identity.
- [ ] Resume provider completion, Response persistence, action emission, and
  navigation from the last durable attempt state; never infer completion from
  route state alone or ask for a second signature after a recoverable crash.

### S4 — Prove behavior and separation

- [ ] Test exact preimage, scroll gate, per-field acts, consent, cancellation,
  expiry, wrong intent, changed Response, invalid method, and invalid evidence.
- [ ] Test double-click coalescing, durable retry replay, late-result rejection,
  ambiguous-transition refusal, and at-most-once navigation.
- [ ] Crash after provider completion, after Response persistence, and after
  action emission; prove each restart resumes the same attempt without
  re-signing or duplicating a durable side effect.
- [ ] Prove a wrong signer app, publisher, actor, entry Surface, stale release,
  or non-renderable bundle fails before bundle-derived output.
- [ ] Prove the signer slice introduces no staff authority or queue source and
  is absent from the respondent MVP composition unless explicitly enabled.
- [ ] Run browser accessibility, keyboard, mobile, unit, conformance, vendor,
  dependency, build, and bundle-budget gates.

## Acceptance

- A real control, not route entry, initiates the ceremony.
- A separately identified signer bundle passes the full ADR-0162 admission
  sequence and atomic release commit before any signer content renders.
- The signer sees the exact artifact committed by the authored signature.
- The result is a schema-valid, verifiable `AuthoredSignature` with explicit
  intent and consent, persisted before navigation.
- Only the declared `signatureCompleted` output can invoke
  `advance-after-signature`.
- Retries are idempotent, stale completion cannot navigate, and one successful
  current result navigates at most once.
- The same durable attempt resumes across every provider, Response, action, and
  navigation crash window without asking for another signature.
- No operator permission, route, or data source enters this public slice.

## Release boundary

This plan and tracker establish the separate public-signer slice. They do not
claim that a ceremony, adapter, or legal-signature profile is implemented.
Publishing or deploying it requires an accepted ADR, conformance evidence, a
supported real adapter, and explicit release authorization.
