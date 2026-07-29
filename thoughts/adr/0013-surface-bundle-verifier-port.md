# ADR-0013 — `SurfaceBundleVerifier` port: authorize a current signed app before render

**Date:** 2026-07-28
**Status:** accepted
**Subordinate to:** web ADR-0001, web ADR-0004, web ADR-0005, web ADR-0009, stack ADR-0162
**Applies to:** named post-MVP signed Surface bundle admission slice
**Implementation state:** port, reference adapter, conformance suite, and
admission host committed locally in `739cc60`; verified respondent runtime
committed locally in `d16cbaa`; deployment trust configuration and activation
committed locally in `30076a2`; not pushed, released, or deployed

## Context

`SurfaceBundleSource` can acquire exact bytes, but transport success says
nothing about whether a deployment should render them. The host must establish
four facts before a signed Surface app can proceed:

1. the signature covers the canonical bundle bytes;
2. an independently configured trust source recognizes the signing key and
   publisher;
3. that publisher may publish the expected app with the claimed method; and
4. the release is current under the deployment's pin or monotonic-release rule.

The v10 spike proved browser signature verification but trusted public-key bytes
shipped beside the bundle, displayed unsigned signer metadata, and had no
rollback rule. Those choices made the spike falsifiable; they do not establish
production trust.

The generic post-MVP `Verifier` discussed in web ADR-0009 has a different job:
walk a receipt and claim graph and produce a multi-part proof verdict.
Surface-bundle admission is smaller and occurs before the respondent app
exists. Giving both jobs one port would make the pre-render path depend on the
full receipt verifier and would blur two trust domains.

## Decision

formspec-web ratifies a post-MVP `SurfaceBundleVerifier` port. It decides whether
one acquired candidate is authentic, authorized for the configured app, and
current. It returns the Surface Shell's canonical result:
`verified`, `failed`, or `unverified`.

The port is a host admission boundary, not a new signature primitive. Its
reference adapter MUST compose the signed-bundle profile, Signature Method
Registry, integrity signature `Verifier`, and `KeyResolver` owned upstream.
formspec-web MUST NOT reimplement COSE, canonical JSON bytes, method dispatch,
or key resolution.

### Inputs and injected authority

The verification call receives only the immutable candidate snapshot from
`SurfaceBundleSource`. The result binds to that snapshot's exact byte/digest
identity. The composition root injects all authority independently:

- the registered signature methods and supported adapters;
- a `KeyResolver`;
- publishing-authority policy binding a `kid` to publisher identity, permitted
  app identities or namespaces, allowed methods, validity interval, and
  revocation state;
- the deployment's expected app identity; and
- release policy and state: either an allowed digest/release pin or a monotonic
  signed release sequence.

The adapter receives these explicit dependencies through construction. It does
not receive the whole formspec-web `Composition`.

Production bundle admission requires `KeyRef` kind `kid`. Although the upstream
integrity port supports `rawPublicKey` for tests and direct-key callers,
formspec-web MUST NOT use that bypass for production admission. Bundle-supplied
public-key bytes are untrusted input.

### Verification sequence

For each candidate, the adapter:

1. reads the upstream `SurfaceBundleSignedPayloadV1`, requires profile
   `formspec-surface-bundle-signing-v1`, and reconstructs the
   `formspec.surface-bundle.signed-payload.v1` domain-separated canonical
   preimage defined by stack ADR-0162;
2. reads `method_uri` from the COSE protected header and rejects a conflicting
   sibling selector;
3. resolves the protected `kid` through the injected `KeyResolver`;
4. invokes the upstream integrity signature `Verifier`;
5. checks publisher authority for the authenticated app and method;
6. checks validity and revocation;
7. evaluates the deployment's release or digest rule against its current
   state; and
8. returns one canonical result with separated provenance and, for monotonic
   policy, an opaque compare-and-set precondition for final admission.

A cryptographically valid signature is necessary but insufficient. Wrong
publisher, wrong app, expired authority, revocation, and a stale-but-valid
release all refuse admission.

### Result and provenance

The outcome preserves the upstream `VerificationReceipt` and adds the
bundle-specific digest, publishing-authority result, release-policy result, and
host check time. It keeps these fact classes separate:

| Fact class | Examples | May appear as verified chrome? |
|---|---|---|
| Signed claims that passed every check | app identity, release identifier, publisher identifier included in the signed profile | Yes, with their authenticated meaning |
| Trust-store facts | publisher display name, authorized namespace, key validity or revocation state | Yes, when linked to the verified `kid` |
| Host observations | checked-at time, source location, adapter version, recomputed digest | Yes, labeled as host evidence |
| Unauthenticated bundle or sidecar text | `signerName`, affirmation text, sibling method selector, bundled public key | No |

Only `verified` makes the candidate eligible for graph validation. It does not
assert that the AppGraph is structurally valid. The host still runs the
upstream validator and admits the app only after both the verification result
and validation report pass.

For monotonic release policy, `verified` is provisional until the host has also
passed schema, AppGraph, actor, and entry-Surface checks. The host then asks the
verifier adapter to commit the authenticated release using the opaque
precondition returned by verification. That commit compares and sets the app's
high-water mark atomically. A concurrent state change causes a fresh
release-policy evaluation; it never permits a blind overwrite. A signed
candidate that fails a later admission check cannot advance release state and
lock out the last valid release. Pinned policy requires no mutable commit.

The host proves that the validated documents dereference and that the selected
Surface is renderable before it advances release state. After the release
commit succeeds, the host enters `admitted`; it does not mint a second
cryptographic verdict for graph validity. The order is:

`acquire → verify → validate/AppGraph → actor and entry checks → dereference
and prove renderability → commit release → admit and render the same snapshot`.

Every step consumes the same immutable snapshot. A verifier result for
candidate A MUST NOT authorize a refetched, reparsed-and-reserialized, mutated,
or partly replaced candidate B. Parsed views used by validation and dereference
carry the snapshot identity. A mismatch discards the verdict and restarts at
acquisition.

### Canonical failure behavior

- Malformed input that claims the recognized profile, signature mismatch,
  wrong domain, wrong publisher, wrong app, expired or revoked authority, and
  release-policy refusal return `failed`.
- Missing signature, unsupported profile, unsupported method, or unavailable
  primitive return `unverified`.
- Adapter faults throw a typed internal error. The host records adapter
  provenance and renders fixed error UI; it does not convert the fault into
  `verified`.
- Malformed attacker-controlled input never reaches default error text without
  sanitization.

On every result other than `verified`, and on every thrown error, the host
renders no bundle-derived output. No route, title, Theme, Locale string,
publisher label, image, or widget may reach the document. The host MUST NOT
render optimistically, render a partial app, or offer a warning-and-continue
path.

### Port boundaries

`SurfaceBundleVerifier` does not:

- acquire a candidate;
- define the bundle profile or signature method registry;
- validate the AppGraph or dereference documents;
- execute Response Actions, load widget data, or route;
- verify receipts, Trellis chains, selective-disclosure proofs, or claim
  graphs; or
- sign or publish a bundle.

The future full receipt/claim-graph verifier therefore receives its own name,
port ADR, result vocabulary, and application entry point. It MUST NOT replace
`SurfaceBundleVerifier` merely because both use signature primitives.

### Publishing and actor boundaries

Bundle publishing keys and release authority belong to an authorized publishing
process, never the respondent browser. The respondent runtime receives public
trust material and policy only. It cannot sign, republish, bless, or advance a
release.

Web ADR-0001 still places the public signer ceremony in formspec-web. That
ceremony is a separate signer application slice with its own composition and
signature domain. It MUST NOT appear as a respondent Surface route, supply
bundle-publishing authority, or share respondent runtime state by convenience.

Staff routes, staff identity, staff data, and staff release controls stay out of
formspec-web's public respondent runtime. An authorized operator host owns
those concerns.

### Conformance

Every adapter MUST pass
`tests/adapter-conformance/surface-bundle-verifier/`. The suite must include:

1. an authorized current bundle;
2. one-byte bundle mutation;
3. wrong signature domain;
4. missing and conflicting protected `method_uri`;
5. unsupported method and unavailable primitive;
6. unknown `kid`;
7. forged bundle plus replacement sidecar key;
8. altered unsigned signer metadata;
9. wrong publisher and wrong app;
10. expired and revoked authority;
11. stale but correctly signed release;
12. release/digest pin mismatch;
13. malformed input and sanitized diagnostics;
14. adapter-internal failure;
15. a verify-A/render-B substitution, including refetch and single-document
    replacement;
16. schema- or graph-invalid signed input does not advance monotonic release
    state, and a concurrent state change cannot be overwritten; and
17. proof that no bundle-derived DOM or document title appears before a fully
    authorized `verified` result and successful final admission.

Conformance also proves that the adapter uses the machine-readable Signature
Method Registry and injected `KeyResolver`, rejects production
`rawPublicKey`, preserves the upstream receipt, and leaves AppGraph validation
to its owner.

## Rationale

1. **The name matches the job.** A narrow bundle gate cannot be confused with
   the full receipt/claim-graph verifier.
2. **Trust comes from outside the candidate.** Replacing the bundle, signature,
   and bundled key cannot create a trusted publisher.
3. **Rollback is part of admission.** A valid old release can still restore a
   known vulnerability or obsolete form.
4. **The browser holds no publishing authority.** Compromise of the respondent
   runtime cannot mint a trusted app release.
5. **Verification remains falsifiable.** Permanent adversarial vectors cover
   cryptography, authority, app binding, and release policy separately.

## Consequences

- Local commit `739cc60` adds this verifier, the upstream profile and policy
  bindings, conformance fixtures, and admission host; `d16cbaa` adds the
  verified respondent runtime; and `30076a2` adds deployment trust
  configuration and activation. None has been pushed, released, or deployed.
- The verification status component may show authenticated and
  provenance-labeled facts after `verified`; it shows fixed host text
  otherwise.
- The full receipt/claim-graph verifier remains a separate deferred product
  slice.
- Public signer and respondent runtimes remain separate even though both live
  in formspec-web.
- Staff functionality remains outside the public respondent host.

## Related decisions and sources

- [web ADR-0001](0001-public-reference-ui-separation.md) — respondent, signer,
  and evaluator ownership
- [web ADR-0004](0004-cross-repo-placement-consume-not-invent.md) — consume
  upstream cryptographic primitives
- [web ADR-0005](0005-mvp-scope-defer-cryptographic-substrate.md) — named
  post-MVP admission slice and exclusions
- [web ADR-0009](0009-hexagonal-architecture-ports-and-adapters.md) — composition
  and conformance rules
- [web ADR-0012](0012-surface-bundle-source-port.md) — opaque candidate
  acquisition
- [stack ADR-0162](../../../thoughts/adr/0162-surface-bundle-admission-and-v10-contract-closure.md)
  — signed-bundle, publishing-authority, app, release, and actor decisions
- [Surface Shell §6](../../../formspec/specs/surface/surface-shell-spec.md#6-verification-before-render)
  and [§8.4](../../../formspec/specs/surface/surface-shell-spec.md#84-verifying-surface-shell)
  — canonical verdict and pre-render gate
- [Signature Method Registry](../../../formspec/specs/registry/signature-method-registry.md)
  — protected `method_uri` and registered methods
- [`integrity-signature-port`](../../../integrity-stack/packages/integrity-signature-port/src/index.ts)
  — `Verifier`, `VerificationReceipt`, `KeyRef`, and `KeyResolver`
- [archived v10 gap-closure plan](../../../formspec/thoughts/archive/plans/2026-07-28-surface-render-v10-gap-closure.md)
  — implementation and adversarial-evidence order
