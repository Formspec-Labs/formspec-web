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
decision_gate: accept the public ceremony ADR, custody model, recovery behavior, and supported signature methods
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
decision must define the public ceremony port, signer authentication, custody
model, recovery behavior, and supported signature methods. This plan does not
authorize a commit, release, or deployment.

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

An ADR must still ratify the browser ceremony port, custody model, recovery
behavior, and which signature methods the public reference implementation
supports before implementation starts.

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

1. Validate the app graph, WYSIWYS sidecar, artifact references, and route.
2. Display the exact referenced preimage and enforce the scroll and per-field
   affirmative-action gates.
3. Build the canonical Signed Response Payload with
   `authoredSignatures` omitted and bind its digest, response ID, Definition
   pin, signing time, and signing intent.
4. Ask the injected ceremony adapter to sign or obtain provider evidence.
5. Validate the resulting `AuthoredSignature`, including protected method
   identity and consent fields, then persist it on the Response.
6. Emit `signatureCompleted` with one stable invocation ID.
7. Coalesce duplicate in-flight emission, replay a durable prior outcome, and
   navigate once only for a current successful result.

### Outputs

- a canonical Response `AuthoredSignature`, not a UI-only signature image;
- durable response and action-ledger state;
- an explicit receipt or provider reference suitable for later verification;
  and
- a post-signature route reached through the mapped Response Action.

## Work packages

### S1 — Ratify actor, custody, and recovery

- [ ] Accept an ADR for the public ceremony port and supported custody models.
- [ ] Define signer authentication, session expiry, cancellation, provider
  redirect recovery, and identity-evidence requirements.
- [ ] Define which fields the signer controls, which the host observes, and
  which the signature or provider response authenticates.

### S2 — Author the graph

- [ ] Register `WysiwysSigner` and its closed `signatureCompleted` output.
- [ ] Bind the output to `advance-after-signature` in Surface 0.2.
- [ ] Add the exact Response Action and one eligible post-signature transition.
- [ ] Reject missing sidecars, unresolved artifacts, undeclared outputs,
  unresolved actions, and ambiguous transitions before signing.

### S3 — Implement the ceremony adapter

- [ ] Define the narrow public-signature ceremony port and conformance suite.
- [ ] Add one real supported adapter; keep private signing keys out of generic
  React and Surface packages.
- [ ] Validate and durably save `AuthoredSignature` before emitting completion.
- [ ] Resume a safe provider redirect or show an explicit unavailable state;
  never infer completion from route state alone.

### S4 — Prove behavior and separation

- [ ] Test exact preimage, scroll gate, per-field acts, consent, cancellation,
  expiry, wrong intent, changed Response, invalid method, and invalid evidence.
- [ ] Test double-click coalescing, durable retry replay, late-result rejection,
  ambiguous-transition refusal, and exactly-once navigation.
- [ ] Prove the signer slice introduces no staff authority or queue source and
  is absent from the respondent MVP composition unless explicitly enabled.
- [ ] Run browser accessibility, keyboard, mobile, unit, conformance, vendor,
  dependency, build, and bundle-budget gates.

## Acceptance

- A real control, not route entry, initiates the ceremony.
- The signer sees the exact artifact committed by the authored signature.
- The result is a schema-valid, verifiable `AuthoredSignature` with explicit
  intent and consent, persisted before navigation.
- Only the declared `signatureCompleted` output can invoke
  `advance-after-signature`.
- Retries are idempotent, stale completion cannot navigate, and one successful
  current result navigates at most once.
- No operator permission, route, or data source enters this public slice.

## Release boundary

This plan and tracker establish the separate public-signer slice. They do not
claim that a ceremony, adapter, or legal-signature profile is implemented.
Publishing or deploying it requires an accepted ADR, conformance evidence, a
supported real adapter, and explicit release authorization.
