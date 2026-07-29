# ADR-0012 — `SurfaceBundleSource` port: acquire an opaque candidate before admission

**Date:** 2026-07-28
**Status:** accepted
**Subordinate to:** web ADR-0001, web ADR-0004, web ADR-0005, web ADR-0009, stack ADR-0162
**Applies to:** named post-MVP signed Surface bundle admission slice
**Implementation state:** interface, HTTP/raw/unavailable adapters, composition
wiring, conformance suite, and admission host committed locally in `739cc60`;
respondent consumer committed locally in `d16cbaa`; deployment activation
committed locally in `30076a2`; not pushed, released, or deployed

## Context

The post-MVP respondent Surface needs a signed bundle before it can compose
routes. The bundle may come from a static deployment asset, a network location,
local storage, or another adopter-selected source. That location is
deployment-shaped, so formspec-web needs a port for acquisition.

The existing `DefinitionSource` is the wrong seam. It returns a parsed
Definition and optional sidecars for the form-first runtime. Extending it to
return a signed multi-document app would mix two trust states: an ordinary
Definition result and a bundle whose bytes must earn admission before any
document is read or rendered.

The Surface Shell requires the host to verify a signed export before the core
or a binding receives any bundle-derived input. Source acquisition must
therefore preserve the candidate without treating its contents, signature,
publisher, or release as trusted.

## Decision

formspec-web ratifies a post-MVP `SurfaceBundleSource` port. It has one job:
acquire the exact signed-bundle candidate selected by deployment configuration
and return it, unchanged, to the host admission flow as one immutable candidate
snapshot.

The implementation MUST consume the candidate type owned by stack ADR-0162 and
the signed-bundle profile. formspec-web MUST NOT define another bundle,
signature-record, canonicalization, or release shape.

### Port responsibility

| Input | What the port does | Output |
|---|---|---|
| A host-selected locator, cancellation signal, and deployment acquisition limits | Acquires one candidate, enforces transport limits, and records source observations | One immutable snapshot containing the exact candidate bytes, byte/digest identity, and host-observed acquisition evidence |

The host-selected locator comes from deployment configuration or an explicit
user acquisition action in a separately named verifier surface. It never comes
from a bundle field that has not passed verification.

Source observations may include the requested and resolved locator, acquisition
time, byte count, cache identity, and adapter identity. They are host evidence,
not signed publisher claims. UI MUST NOT present them as proof of who published
the bundle.

The snapshot identity covers every byte that can affect profile verification or
document interpretation. The same snapshot flows through verification,
AppGraph validation, dereference, and render. Downstream code may create parsed
views of that snapshot, but each view remains bound to its byte/digest identity.
It MUST NOT refetch the locator, replace a document, or reserialize and treat
the result as the verified candidate. Any identity change restarts the flow at
acquisition.

### What the port does not own

`SurfaceBundleSource` does not:

- parse the App Manifest or any bundle document for application use;
- reconstruct canonical signed bytes;
- select a signature method;
- verify a signature or resolve a key;
- decide publisher authority, permitted app identity, revocation, or release
  currency;
- validate the AppGraph, dereference documents, compose routes, or render;
- turn transport success into a `verified` result; or
- cache a prior admission result as a substitute for a fresh admission check.

Those boundaries keep acquisition replaceable and prevent a source adapter from
becoming a second verifier.

### Composition and lifecycle

The composition root constructs the source once and injects it into the
post-MVP Surface host. App code reaches it through composition, never through a
specific adapter import. An adapter receives only its declared dependencies,
not the full `Composition`.

The current MVP Definition runtime remains unchanged. A Verifying Surface Shell
deployment MUST NOT fall back from an unavailable `SurfaceBundleSource` to
`DefinitionSource`, demo data, an unsigned embedded bundle, or a previously
parsed document. A missing production source makes the signed Surface
unavailable.

Reference adapters are examples. Adopters may use static, network, local-file,
or content-addressed acquisition without changing the port or the React shell.

### Failure before render

Acquisition failure stops the admission flow. The host renders only fixed,
host-owned checking, unavailable, or error UI. It MUST NOT use a bundle title,
publisher label, Theme, Locale string, route, image, or widget in that UI, and
it MUST NOT change the document title from bundle data.

The port defines typed acquisition failures at least for:

- unavailable or not found;
- configured acquisition deadline exceeded;
- configured size limit exceeded;
- disallowed redirect or location;
- malformed transport response;
- cancellation; and
- adapter-internal failure.

These failures are acquisition evidence. They are not cryptographic `failed`
or `unverified` verdicts. If acquisition returns a candidate whose signed
profile is absent, unsupported, or malformed, `SurfaceBundleVerifier` owns the
canonical verification outcome.

### Conformance

Every adapter MUST pass
`tests/adapter-conformance/surface-bundle-source/`. The suite must prove:

1. byte-for-byte preservation of the candidate;
2. no normalization through parse-and-reserialize;
3. enforcement of configured byte, location, redirect, and deadline limits;
4. cancellation and typed failure behavior;
5. accurate separation of host observations from bundle claims;
6. a cache hit still enters `SurfaceBundleVerifier` and release-policy checks;
7. verification of candidate A cannot authorize a refetched, mutated, or
   reserialized candidate B;
8. no bundle-derived output appears before verification; and
9. the adapter does not import or implement signature, key-resolution,
   publishing-authority, release-policy, AppGraph, or renderer logic.

## Rationale

1. **Trust remains independent of transport.** A secure location does not prove
   who signed a bundle, and an untrusted location may still carry a valid
   bundle.
2. **The port is adopter-shaped.** Deployments choose how they acquire bytes;
   the upstream profile owns what those bytes mean.
3. **Exact bytes preserve falsifiability.** Parse-and-reserialize can change
   signed input or hide a mutation before the verifier sees it.
4. **Failure is honest.** A source outage cannot silently reopen the old,
   unsigned form path.

## Consequences

- Local commit `739cc60` adds the required source to Surface composition and
  the admission host; `d16cbaa` adds its respondent consumer; and `30076a2`
  adds deployment activation. None has been pushed, released, or deployed.
- The default composition uses an unavailable sentinel until deployment
  configures a real source adapter and policy.
- Source metadata may support diagnostics, but it never supplies trusted
  publisher chrome.
- `DefinitionSource` retains its existing form-first responsibility.
- ADR-0013 owns the distinct verification and publishing-policy decision.

## Related decisions

- [web ADR-0001](0001-public-reference-ui-separation.md) — open public UI
  boundary
- [web ADR-0004](0004-cross-repo-placement-consume-not-invent.md) — consume
  upstream bundle meaning; own only the deployment port
- [web ADR-0005](0005-mvp-scope-defer-cryptographic-substrate.md) — named
  post-MVP admission slice
- [web ADR-0009](0009-hexagonal-architecture-ports-and-adapters.md) — composition
  and per-port conformance rules
- [web ADR-0013](0013-surface-bundle-verifier-port.md) — verification,
  publisher authority, app identity, and release policy
- [stack ADR-0162](../../../thoughts/adr/0162-surface-bundle-admission-and-v10-contract-closure.md)
  — signed-bundle profile and cross-stack ownership
- [Surface Shell §6](../../../formspec/specs/surface/surface-shell-spec.md#6-verification-before-render)
  — verification before any bundle-derived output
- [archived v10 gap-closure plan](../../../formspec/thoughts/archive/plans/2026-07-28-surface-render-v10-gap-closure.md)
  — implementation and evidence order
