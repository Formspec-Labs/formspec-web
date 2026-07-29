# SurfaceBundleVerifier

`SurfaceBundleVerifier` decides whether one acquired candidate is authentic,
authorized for this deployment's app, and current under its release policy.
It is separate from the future receipt and claim-graph verifier.

What goes in: only the immutable `SurfaceBundleSnapshot`. The adapter receives
the expected app identity, Signature Method Registry, `KeyResolver`,
publisher-authority policy, clock, and pin or monotonic release policy through
construction.

What happens: `IntegritySurfaceBundleVerifier` delegates canonical bytes,
COSE processing, method dispatch, key lookup, signature verification,
publisher authority, and rollback checks to the vendored upstream packages.
It always constructs `WebCryptoVerifier` from the configured `KeyResolver`;
the public configuration has no verifier override. It accepts production key
references only through the protected `kid` and injected resolver.
Bundle-supplied key sidecars and extra JavaScript configuration keys cannot
replace deployment trust.

What comes out: `verified`, `failed`, or `unverified`, with source,
cryptographic, trust, release, and host-time evidence kept separate.
`verified` requires the integrity receipt, trust decision, release decision,
check time, signed-payload digest, and an opaque release precondition. It does
not claim the AppGraph is valid.

How to check it: run `npm run test:conformance -- surface-bundle-verifier`,
the focused adapter tests, and `npm run check:surface-bundle-vendor`. After the
host validates schema, AppGraph, actor, and entry rules against the same
snapshot, it calls `commitRelease`. That call performs the upstream atomic
monotonic write or reports that a pinned release needs no write.

Production composition currently wires `unavailableSurfaceBundleVerifier()`.
Hosts that supply a production verifier can use `VerifyingSurfaceHost` for the
complete admission and render sequence described in
`docs/verifying-surface.md`. The existing respondent runtime remains separate.
