# ADR-0009 — Hexagonal architecture: ports, adapters, and DI discipline

**Date:** 2026-05-22
**Status:** accepted (reshaped 2026-05-22 post code-scout review — port inventory narrowed to MVP only; engine-owned `IssuerStore` not duplicated; CI claims made implementable)
**Supersedes framing in:** web ADR-0007 (rewritten same day), web ADR-0008 (renamed + reframed same day)

## Context

formspec-web is the OSS reference frontend for the Formspec specs (web ADR-0001). Earlier ADRs in this batch (web ADR-0007 identity, web ADR-0008 upstream services) accidentally encoded specific backend services into architectural prose — naming `formspec-server` as the "primary backend," prescribing "magic-link + optional OIDC" as the MVP identity choice. That framing collapses two distinct concerns:

1. **Architecture** — what ports formspec-web defines, what invariants every adapter must hold, how the React shell stays adapter-agnostic.
2. **Deployment composition** — which specific reference adapters a given deployment wires.

The first is constitutional and changes rarely. The second is per-deployment and varies wildly by adopter: a US federal deployment wires login.gov; a small nonprofit wires Firebase; a healthcare adopter wires AWS Cognito with a BAA; an air-gapped deployment wires anonymous-only. None of these are "the architecture."

Mixing the two means adopters who don't use formspec-stack's services either fork the codebase or override architectural decisions — defeating the OSS reference-implementation charter (web ADR-0001 rationale §§2–3).

## Decision

formspec-web's architecture is **hexagonal**: the React shell is the core; every I/O concern crosses a typed port; reference adapters live in-tree but are illustrative, not committed.

### MVP port inventory (the contract)

| Port | Purpose | Conformance invariant |
|---|---|---|
| `DefinitionSource` | Fetch a `Definition` by URL + version | Returns a value conforming to `formspec/schemas/definition.schema.json` |
| `DraftStore` | Per-user draft persistence (load / save / list / delete) | Round-trips a `Response` per `response.schema.json` |
| `SubmitTransport` | Submit one validated response | Accepts `IntakeHandoff` per `intake-handoff.schema.json` (`initiationMode: "publicIntake"`); idempotent on retry (client-supplied UUIDv7) |
| `IdentityProvider` | Authenticate; produce normalized claim | Output mirrors `respondent-ledger-spec.md` §6.6 `identityAttestation` field set; never silently downgrades assurance |
| `NotificationDelivery` | Send a message via a channel (**transport only**) | Opaque to formspec-web; idempotency-key dedup; **does NOT shape templates, audience, or delivery semantics** — template authoring lives upstream (e.g., `work-spec/schemas/sidecars/wos-delivery.schema.json#/$defs/NotificationsBlock` for the formspec-stack composition) |

The port interfaces and their conformance-suite fixtures are what formspec-web ships. Specific adapters are *examples*.

**Normalization is special.** `IdentityProvider` is the only MVP port whose conformance invariant cannot be enforced by JSON-Schema validation alone — it requires absence-checks on provider-native vocabulary in custom-extension fields. A buggy adapter can pass naive schema conformance and still leak provider-specific shapes (raw OIDC `acr` strings, Firebase claims, etc.) downstream. The §6.6 normalization invariant per web ADR-0007 is the load-bearing trust instrument for this port.

### Not in the constitutional inventory (deliberately)

Three categories of seam are NOT listed as constitutional MVP ports here:

**(a) Issuer resolution lives upstream.** `formspec/packages/formspec-engine/src/issuer/IssuerStore.ts` ships the cascade + chain walk + cycle guard + ETag fetcher. formspec-web does NOT host a port for issuer resolution — that would re-invent an upstream primitive (the exact anti-pattern web ADR-0004 forbids). The composition root wires a `FetchIssuerFetcher` strategy into `IssuerStore` at boot (see web ADR-0008 for the formspec-stack fetcher choice). Adopters who need a different fetch strategy (proxy-cached, static-inline, direct browser fetch with CORS) provide a different fetcher; they do not implement a new port.

**(b) Post-MVP ports await consumer code.** `StatusReader` (post-submit status; consumer surface follows `work-spec/schemas/api/applicant.schema.json` shape), `BundleSource` (content-addressed bundle locator), `Verifier` (bundle verification, output follows `stack-common-proof::ProofReportVerdict`) are post-MVP per web ADR-0005. Each will be ratified as its own ADR when the consumer code lands. Front-loading speculative port contracts before real consumers exercise them is the anti-pattern web ADR-0006 documented retroactively (engine `IssuerStore` made our originally-conceived `IssuerProvider` port moot once the React surface landed). Don't repeat it.

**(c) Adopter-side seams per web ADR-0004 §exception** become ports as consumer code lands: `PaymentRail` (FW-0027 / J-029), `BotProtection` (FW-0036 / J-033), `EmbedTransport` (FW-0040 / J-018). The standing rule from ADR-0004 §exception applies — these are deployment-shaped and country/regulator-specific; their port shapes are determined when the consumer ships, not preemptively. (`AttachmentStore` is NOT in this list because per stack-root [ADR-0072](../../../thoughts/adr/0072-stack-evidence-integrity-and-attachment-binding.md), attachment handling is a composed primitive — Formspec `attachment` field + stack-common object store + Trellis attestation — not a single formspec-web port.)

**(d) Cross-stack TS shapes from `stack-common` and `integrity-stack` are upstream primitives.** Two-stack source: `stack-common/crates/` (Rust-only today — no `packages/` directory) owns wire shapes like `StackError` / Problem JSON envelope, TypeID parsing, idempotency-key conventions, `ProofReportVerdict`, request-id header. `integrity-stack/crates/` (which already follows the cross-language pattern with both `crates/` and `packages/`) owns COSE_Sign1, signatures, canonical bytes, CBOR, deterministic ZIP, HPKE, verifier orchestrator. Coverage today is partial: `@integrity-stack/cose` + `@integrity-stack/signature-port` + `@integrity-stack/signature-adapter-webcrypto` ship; 10 of 13 integrity crates have no TS mirror. The post-MVP verifier needs more.

**Hybrid TS/WASM principle for the cross-stack TS layer:**

- **Pure TS** for primitives that have proven TS reimplementation OR adoptable off-the-shelf packages AND don't carry signature-determinative byte-exactness risk: COSE_Sign1 (proven shipped), WebCrypto signature verify (proven shipped), event sequence helpers, verifier orchestration (composition only — no byte work), HPKE Base mode (RFC 9180; `hpke-js` mature).
- **WASM single-authority** for byte-exact primitives where JS-vs-Rust encoding drift would break signatures: JCS canonical bytes, CBOR encode/decode, deterministic ZIP read/write. Bundle these from the Rust workspace into one WASM target per package; the Rust crate split stays intact — bundling is a build target choice, not a crate-split refactor.
- **Adapter composition** is internal. When the `Verifier` port (post-MVP) is ratified, a single adapter encapsulates the WASM-bytes + TS-COSE + WebCrypto-signature + orchestration mix. Adopters who want to swap (e.g., `ServerProjectedAdapter` for heavy bundles) implement a different adapter — they do NOT compose sub-pieces themselves. Per the architectural rule: port what's adopter-shaped; encapsulate the rest.

The TS mirrors formspec-web ships are tracked in the upstream extension queue (`EXT-11`–`EXT-18`). They should be small and conformance-fixtured so cross-stack consolidation later is mechanical. **stack-common adopting the cross-language pattern, and integrity-stack expanding its TS coverage to close the verifier kernel gap, are stack-level architectural decisions; formspec-web's queue flags the dependencies without owning the fixes.**

### Composition root pattern

A single typed factory in `src/composition/` wires adapters into a `Composition` object that the React shell consumes via context. The default composition is documented in web ADR-0008 (one worked example — the formspec-stack reference deployment). Adopters fork only the composition file (typically < 100 lines). They do NOT fork the shell, the ports, or the reference adapters.

```ts
export interface Composition {
  definitionSource: DefinitionSource;
  draftStore: DraftStore;
  submitTransport: SubmitTransport;
  identityProvider: IdentityProvider;
  notificationDelivery?: NotificationDelivery;  // optional — only consumed by adapters that need it (e.g., MagicLinkAdapter)
  // Issuer resolution is engine-owned (formspec-engine IssuerStore); composition wires a FetchIssuerFetcher at boot — NOT a formspec-web port (see §"Not in the constitutional inventory" (a))
  // Post-MVP ports (StatusReader, BundleSource, Verifier) ratified per-port when consumer code lands (see (b))
  // Adopter-side seams (PaymentRail, BotProtection, EmbedTransport) per ADR-0004 §exception become ports when consumed (see (c))
}
```

### Composition lifecycle and cross-port coordination

- **Construction.** `Composition` is built at app boot via `createDefaultComposition(config: Config): Composition` — a typed factory in `src/composition/default.ts`. Built once per app instance; not lazy.
- **Distribution.** The React shell consumes `Composition` via a `<CompositionProvider value={composition}>` context. Components reach ports via `useComposition()` hooks, not via direct adapter imports.
- **Statefulness.** Ports are stateless **except**:
  - `IdentityProvider` exposes `subscribe(listener: (claim: IdentityClaim | null) => void) => Unsubscribe` for session-lifecycle events (login, logout, revoke).
  - `DraftStore` may maintain per-subject caches and listens for identity-change events forwarded by the shell.
- **Cross-port coordination lives in the React shell, NOT in adapters.** When `IdentityProvider.revoke()` fires, the shell listens via `subscribe()` and orchestrates: clears `DraftStore` subject cache, navigates to anonymous state, resets in-flight `SubmitTransport` retries. Adapters MUST NOT reach across ports via the `Composition`.
- **Cross-port composition in adapters is permitted but explicit and bounded.** Some reference adapters legitimately consume multiple ports — e.g., a `MagicLinkAdapter` (`IdentityProvider` adapter) needs `NotificationDelivery` to send the link. This is done via **constructor injection** (`new MagicLinkAdapter({ notificationDelivery })`), documented in the adapter's own contract, and bounded (no transitive `Composition` reference). The shell does not pass the entire Composition to adapters; only the specific dependencies they declare.

### Conformance suite per port

Every port has an executable conformance suite under `tests/adapter-conformance/<port>/`. Any adapter — first-party or third-party — MUST pass the suite to be considered conformant. Without the suite, port conformance is just trust.

**Minimum bar per port:**

- **One schema-validity round-trip** (input → adapter call → output → schema-validate against the port's normative shape).
- **One negative case per conformance invariant** (e.g., for `IdentityProvider`: stub provider returns native OIDC `acr` string; expect adapter to either normalize correctly or fail with a typed error — leaking the raw `acr` value through MUST fail).

Fixtures live as JSON cases under `tests/adapter-conformance/<port>/<case>/` mirroring the upstream `formspec/tests/fixtures/` pattern (see e.g., `formspec/tests/fixtures/issuer/` for the established structure).

The per-port suite *shape* is defined here; the per-port suite *content* (specific fixtures) lands alongside each port spec ADR.

### Discipline: no service-specific imports in core

Core code (`src/ports/`, `src/app/`, `src/composition/types.ts`) MUST NOT import from any specific backend SDK or name any backend service. Service-specific code lives only in `src/adapters/<adapter>/`. Architectural prose (ADRs, planning rows, CLAUDE.md) MUST NOT name specific backend services as load-bearing — service names appear only when documenting reference adapters or deployment compositions.

**Enforcement is layered** (decreasing precision, increasing coverage):

1. **CI hard-gate (boundary).** `eslint-plugin-import` `no-restricted-paths` rule preventing `src/ports/**` and `src/composition/types.ts` from importing `src/adapters/**`, and preventing `src/adapters/**` from importing anything besides ports + adapter-shared utilities. This is precisely what ESLint can catch — directory-boundary violations.
2. **Pre-commit grep (advisory).** Scans core paths for known vendor strings (`formspec-server`, `firebase`, `supabase`, `clerk`, etc.) and surfaces warnings. Heuristic; not authoritative; supports the human review but does not block merge on its own.
3. **Architectural review (the authoritative gate for prose).** Per stack `CLAUDE.md` §HIGH-PRIORITY discipline. A human reviewer (scout / expert agent or general-purpose with the review skill) treats any service name in core architectural prose as a BLOCKER finding. CI cannot reliably detect prose violations across `*.md` files at semantic accuracy; the review discipline is the gate.

CI cannot promise to catch every service-name leak. The promise: directory-boundary violations are caught hard by ESLint; vendor-string leaks are flagged advisorily by pre-commit; architectural review catches the rest. Three layers, different precision profiles.

## Rationale

1. **OSS charter is non-negotiable.** Web ADR-0001 commits to the reference-implementation role. An adopter wiring Firebase + Resend + Cloudflare Workers MUST deploy formspec-web without modification beyond the composition root. A service name in the architecture breaks this.
2. **Specs are the load-bearing contracts, not services.** Per web ADR-0004, formspec-web consumes the specs (`Definition`, `Response`, `IntakeHandoff`, `Issuer`, `respondent-ledger §6.6`, FEL semantics). Backend services are themselves consumers of the same specs — the relationship is symmetric, not parent-child.
3. **Adapters are interchangeable because the conformance suite makes them so.** Without conformance fixtures, "adapter pattern" is a slogan. With fixtures, swapping is verifiable.
4. **The composition pattern matches successful OSS analogues** — Backstage, Strapi, Keycloak, next-auth, Prisma/Drizzle converge on this shape because it works for adopter diversity.
5. **Reversibility.** Backends change. Companies fail. Specs evolve. Hexagonal architecture means a backend pivot is a composition-root edit, not a refactor.
6. **Don't speculate on port shapes before consumer code.** ADR-0006 made the case retroactively: an originally-conceived `IssuerProvider` port turned out to be moot once the React surface (`<Issuer>`) shipped and the engine `IssuerStore` was directly consumable. The constitutional inventory here is deliberately narrow to avoid re-walking that mistake.

## Consequences

- Reference adapters live in `src/adapters/`; each is a small, audited, idiomatic example. The default deployment composition wires specific ones; adopters wire whatever they use.
- Web ADR-0007 (Identity) is the port-spec model — drops the magic-link prescription, treats §6.6 normalization as the only architectural commitment.
- Web ADR-0008 is the formspec-stack composition — one worked example, not architecture.
- PLANNING rows are restated in port-shape terms for the 5 MVP ports. Post-MVP rows note that their port shape will be ratified when consumer code lands.
- CI enforcement is layered (ESLint boundary + pre-commit grep + architectural review) — implementable.
- Conformance suites have a minimum-bar shape defined here; per-port fixture content lands with each port's own spec ADR.
- Issuer resolution stays upstream — the composition wires a fetcher; no formspec-web port re-implements it.
- Post-MVP ports + adopter-side seams have a standing rule: per-port ADR when consumer code lands.
- ESLint config (`eslint.config.*`) is a follow-up scaffold task before FW-0001 ships; the no-restricted-paths rule is part of FW-0017's CI gate.

## What this does NOT preclude

- **The formspec-stack reference deployment.** formspec-server, workspec-server, and the Trellis substrate remain valid reference adapter targets, documented in web ADR-0008. They are illustrative, not committed.
- **First-party adapter quality.** Reference adapters can and should be production-grade — they ARE templates adopters will study and copy.
- **Per-adapter opinions.** A `FirebaseAuthAdapter` SHOULD be opinionated about Firebase patterns; the opinion lives in the adapter, not in the architecture.
- **Future port additions.** When `PaymentRail` / `BotProtection` / `EmbedTransport` / post-MVP ports land, each gets its own ADR; the constitutional discipline in this ADR (composition root, conformance suite, lifecycle pattern, CI enforcement) applies to all of them.

## Related decisions

- web ADR-0001 — repo charter (reference UI, trust-load-bearing)
- web ADR-0002 — React + Vite framework (the shell's runtime, not its architecture)
- web ADR-0004 — consume not invent (specs, not services); §exception names adopter-side seams
- web ADR-0006 — Issuer Sidecar (the engine ships `IssuerStore`; formspec-web wires a fetcher, not a port)
- web ADR-0007 — `IdentityProvider` port spec (the worked port-spec example)
- web ADR-0008 — reference deployment composition (the formspec-stack composition as a worked example)
- stack-root [ADR-0072](../../../thoughts/adr/0072-stack-evidence-integrity-and-attachment-binding.md) — attachment handling as composed primitive (why no `AttachmentStore` port)
- stack-root [ADR-0128](../../../thoughts/adr/0128-frontend-surface-architecture.md) — frontend surface architecture (this ADR is the formspec-web-specific implementation of the three-app principle)
