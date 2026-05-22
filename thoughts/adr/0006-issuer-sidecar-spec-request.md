# ADR-0006 — Why we requested the Issuer Sidecar Spec (retroactive)

**Date:** 2026-05-22
**Status:** accepted
**Relates to:** `formspec/specs/issuer/issuer-spec.md` v1.0.0-draft.1 (the resulting upstream spec)

## Context

Scoping FW-0004 (first-paint legitimacy: sender brand, what this is, who's asking) for the MVP (web ADR-0005) triggered a spec-expert verification of what `formspec/schemas/definition.schema.json` actually carries for issuer / sender / brand. The verdict was unambiguous: **issuer metadata gap is total**.

The only existing surface in any Formspec schema with adjacent intent:

| Field | Spec | Notes |
|---|---|---|
| `definition.title` | `definition.schema.json` | Required string. Form name, not issuer. |
| `definition.description` | `definition.schema.json` | Optional prose. Form purpose, not issuer. |
| `theme.tokens.color.*` | `theme.schema.json` | Brand colors yes; logo URL no. |
| `theme.tokens.typography.*` | `theme.schema.json` | Brand typography yes. |
| `definition.extensions["x-*"]` | `definition.schema.json` | Escape hatch with no contract, no portability. |
| `$form.title`, `$form.description` | `locale-spec.md` §3.1.5 | Only two `$form.*` keys reserved; no `$form.issuer.*`. |

Adopters needing structured issuer identity (legal name, department, jurisdiction, parent org, logo, support contact, hierarchy) had two non-options:

1. Roll a custom `x-issuer` shape under `definition.extensions` — no spec, no contract, not consumable by other renderers, not portable across deployments.
2. Hard-code issuer per deployment in renderer-specific config — no DI seam, no upgrade path, no white-label.

## Decision

File an upstream spec request in `formspec/`: a new sidecar — `formspec/specs/issuer/issuer-spec.md` + `formspec/schemas/issuer.schema.json`. The load-bearing architectural decisions are:

- **Sidecar pattern**, sibling to Locale / References / Ontology, but with **inverse cardinality**: one Issuer publishes many Definitions; `definition.issuer` points OUT (not IN).
- **`oneOf` inline | `{ url }` ref** binding on Definition — covers the individual / single-deployer case AND the organizational case where many Definitions share one Issuer URL.
- **Resolution cascade**: host override ≻ Definition declaration ≻ unbranded fallback. Two-chain rule prevents host and Definition Issuer chains from merging.
- **Receipt audit pin** via `response.displayedIssuer` (resolved primary Issuer URL + version captured at submit time, inside the signed-payload preimage by virtue of the existing authoredSignatures-only omission rule).
- **Shared `Party` base** in `common.schema.json` collapses Registry / Ontology Publisher duplication while keeping Issuer and Publisher roles distinct.

Field-level structure, conformance fixtures, LangMap shape, schema.org mapping, host-override transports, hierarchy mechanics, and security considerations are defined in `formspec/specs/issuer/issuer-spec.md` — the spec is the source of truth; this ADR captures *why* the request was made, not *what* the shape is.

Three placement alternatives were rejected:

| Approach | Why rejected |
|---|---|
| **Embed in Definition only (inline)** | Wrong for the 1:N case (one model form deployed by 50 cities). Every Definition repeats the same 30-line issuer block. Org renames force every Definition to be republished. No host-override path. White-label requires a Definition overlay mechanism that does not exist. |
| **Embed in Theme** | Mistypes the data. Theme is presentation-tier (colors, typography, spacing). Issuer identity is *data*: who is legally asking, jurisdiction, contact, parent org, identifier URI. Paper-render, verifier, and exporters would need to dig into Theme for non-presentational facts. Breaks the Theme/Definition bright line. Hierarchy in Theme is wrong shape. |
| **Sidecar spec (chosen)** | Matches existing Formspec idiom. Issuer evolves independently of Definition versioning. White-label = host injects different Issuer URL, zero Definition change. Hierarchy via reference, no duplication. Future-compatible with Trellis attestation. DI clean — one port, three adapters. |

The spec shipped as `v1.0.0-draft.1` on 2026-05-21 — explicitly draft per §1, with the warning that implementations MUST NOT treat it as stable until a 1.0.0 release. Schemas (`issuer.schema.json`, `definition.issuer` binding, `response.displayedIssuer`, shared `Party` base in `common.schema.json`), engine support, and conformance fixtures all landed alongside it. Fixture coverage is enumerated in `issuer-spec.md` §18; fixture cases live under `formspec/tests/fixtures/issuer/`.

## Rationale

1. **Cardinal asymmetry is real and load-bearing.** Locale / References / Ontology each describe one form. Many such sidecars exist per Definition. Issuer is inverted: one Issuer publishes many Definitions, and the Issuer exists before and after any individual Definition. Forcing Issuer into the same in-pointing pattern as Locale would have been wrong; the spec correctly inverts and Definition points OUT via `definition.issuer`.
2. **Cascade is the load-bearing DI seam.** A model form deployed by N issuers cannot have issuer hard-coded. A small nonprofit publishing one form should not need to operate a separate sidecar URL. The inline | URL-ref oneOf branch covers both extremes; the host-override path covers white-label / multi-tenant deployments without Definition forks. This is the cleanest DI shape available.
3. **Receipt audit pin closes a real ambiguity.** Without `response.displayedIssuer`, a long-running draft where the host override changes mid-session would produce a receipt where the *displayed* issuer (what the respondent saw) differs from the *declared* issuer (what the Definition stated) with no record of which was actually presented. The submit-time pin resolves this; placement inside the signed-payload preimage costs nothing because of the existing authoredSignatures-only omission rule.
4. **Shared Party base reduces duplication and seeds Verifiable Credentials interop.** Registry and Ontology already had near-duplicate Publisher shapes. The shared `Party` / `LangMap` / `ContactPoint` defs collapse the duplication. The field names (`url`, `identifier`, not `id` / `issuer`) avoid W3C VC reserved-term collisions, leaving room for future credential-tier work.
5. **Schema.org mapping future-proofs without locking the wire.** Government Issuers publishing structured org data, search engines, civic-tech aggregators benefit from JSON-LD compatibility. The mapping is via a published context document; consumers who do not care about JSON-LD see plain JSON.

## Consequences

- formspec-web hosts an `IssuerProvider` port with three reference adapters: `InlineIssuerAdapter` (extract from Definition), `UrlFetchIssuerAdapter` (HTTP fetch with `Cache-Control` / `ETag` / `+sha256-<hex>` integrity + cycle detection + depth cap), `HostInjectedIssuerAdapter` (white-label / multi-tenant override).
- formspec-web's cover-page render consumes a `ResolvedIssuer` from the port — neither knows nor cares which adapter resolved.
- Issuer Document is content-addressed by URL + version, hash-stable, signable. Future Trellis attestation of Issuer Documents is unblocked without spec change.
- Registry and Ontology Publisher shapes are scheduled for migration to the shared `Party` base. Migration window and shape are owned by formspec spec authors per `issuer-spec.md` §6.
- Trust Center (J-006 / FW-0002, post-MVP) gains a substrate: every Trust Center "claim" attaches to a verifiable Issuer Document via the same chain.
- The first worked example of the upstream-first pattern from web ADR-0004 has now been demonstrated end-to-end: gap diagnosed in formspec-web, spec authored in formspec (currently draft), schemas + fixtures + engine support shipped upstream, consumed via DI port in formspec-web. Stability for production use depends on the spec exiting draft.
