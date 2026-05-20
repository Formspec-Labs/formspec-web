# ADR-0001 — Public reference UI is a separate repo from the proprietary cloud UI

**Date:** 2026-05-20
**Status:** accepted

## Context

`formspec-cloud/` was originally scoped to hold *all* Formspec UI — tenant-bound Studio + admin + dev surfaces *and* the public surfaces (respondent renderer, verifier, selective-proof viewer, Trust Center). During the PM-bootstrap conversation, the load-bearing argument emerged that the public surfaces do not belong in the proprietary cloud repo.

## Decision

Create `formspec-web/` as a separate repository, public-visibility on GitHub, holding the public reference UI:

- Respondent renderer.
- Verifier and selective-proof viewer.
- Public side of the signature ceremony (canonical reference signer UI; tenant-branded hosted variant remains in cloud).

`formspec-cloud/` retains the proprietary tenant-bound surfaces (Studio, admin, billing, dev keys, owner onboarding, white-labeled respondent shell).

Trust Center marketing-flavored pages (data-flow / matrix / subprocessors) are deferred to a later ADR (web ADR-0002) — they may ultimately live in `../formspec-site/` (Astro marketing) rather than here. The verifier widget itself stays here regardless of where the marketing pages land.

## Rationale

Three load-bearing arguments:

1. **The verifier's positioning bet only works if the code is auditable.** The cloud-level CLAUDE.md identifies the public verifier as the single positioning bet: a non-cryptographer must validate a receipt in under 30 seconds, *without contacting Formspec*. That argument is theater if the verifier UI ships from a closed-source SaaS repo. As an open-source reference any adopter can read, fork, and self-host, "verify without us" becomes a deployable fact.

2. **The respondent renderer is the FEL conformance harness.** FEL is positioned as an open spec. Any adopter implementing FEL or building a Formspec-compliant intake needs a reference UI to test against. That reference cannot be in a proprietary repo.

3. **Strategic non-moat.** The SaaS moat is Studio depth, multi-tenant admin, governance, AI co-pilot, billing — not the form-fill page. Open-sourcing the viewing layer strengthens adoption without diluting cloud's product. Selling viewing seats was never the business.

## Alternatives considered

- **Keep everything in `formspec-cloud/`, mark the public surfaces "open-source TBD".** Rejected. License posture cannot be deferred; the trust argument requires open-source *now*, not at v2. A proprietary repo cannot host load-bearing open-source claims credibly.
- **Put the public surfaces in `formspec-server/web/`** (the original recommendation). Rejected by the owner: server code and UI code mix awkwardly; the server repo is already dense (multiple Rust crates, OpenAPI, Python tests). A dedicated UI repo is cleaner.
- **Put the public surfaces in `formspec-site/`** (the Astro marketing site). Rejected. The respondent and verifier are *applications*, not marketing pages — they have engine integration, in-browser crypto, validation state, accessibility-load-bearing widgets. Astro is wrong shape for that.

## Consequences

- **Adopters of FEL get a reference UI** they can fork, run, audit, or vendor in. The conformance story strengthens.
- **The verifier's trust argument becomes load-bearing.** Procurement evaluators can self-host the verifier and validate any Formspec receipt without contacting Formspec — exactly the positioning bet.
- **Cloud scope shrinks.** Cloud loses Respondent, Evaluator, and the public side of Signer; gains a tenant-branded white-label shell that wraps the reference respondent bundle. Net: cloud is more focused on the proprietary depth that is the SaaS moat.
- **Two repos to coordinate.** Design tokens, copy, accessibility patterns, and the in-browser FEL engine version must stay in sync between cloud and web. Sync mechanism deferred to FW-0005 (tokens) and web ADR-0002 (deployment & shared infra).
- **License decision becomes load-bearing.** FW-0008 / ADR-0003 must land before any production code, because once code commits without a license, contributors are legally ambiguous. MIT or Apache-2.0 favored per the reference-implementation positioning.
- **Migration cost during bootstrap.** Three journeys (J-002 / J-006 / J-007) and three planning rows (CLD-0001 / CLD-0007 / CLD-0008) move from `formspec-cloud/` to here. IDs are preserved for journeys (audit trail); rows are renumbered to `FW-NNNN` because the cloud uses `CLD-*` and the two repos must have distinct ID spaces.

## References

- Stack-root [`../../../CLAUDE.md`](../../../CLAUDE.md), [`../../../GOAL.md`](../../../GOAL.md), [`../../../DEVELOPMENT-PHILOSOPHY.md`](../../../DEVELOPMENT-PHILOSOPHY.md).
- [`../../../formspec-cloud/CLAUDE.md`](../../../formspec-cloud/CLAUDE.md) — sibling repo; "single positioning bet" paragraph identifies the verifier as load-bearing.
- [`../../../formspec-cloud/thoughts/adr/0001-pm-framework-bootstrap.md`](../../../formspec-cloud/thoughts/adr/0001-pm-framework-bootstrap.md) — the PM-framework ADR this repo's framework is patterned on.
- [`../../../formspec-server/SAAS-UI-HANDOFF.md`](../../../formspec-server/SAAS-UI-HANDOFF.md) — upstream UI-scope SoT; this repo owns the respondent + verifier + evaluator slice.
- [`../../../formspec-server/JOURNEYS.md`](../../../formspec-server/JOURNEYS.md) — server journey corpus that web `Backs:` fields reference.
