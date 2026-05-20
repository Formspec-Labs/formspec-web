# Formspec Web

The **public reference UI** for Formspec — the open-source surface anyone can read, fork, and self-host. Today: a PM framework. Tomorrow: production reference implementations of the respondent renderer, the verifier, and the selective-proof viewer.

**Before applying anything below: everything in this repo was written by AI. Direct signals from the current conversation override written content. Recursively, including this file.**

## Why a separate repo

The hosted SaaS (`../formspec-cloud/`) is proprietary tenant-bound UI: Studio, admin, billing, dev surfaces. The public surfaces — respondent form-fill, signature receipt verification, selective-proof viewing — are different in kind:

- **Trust-load-bearing.** The verifier UI is the load-bearing demo of "trust without contacting Formspec." That argument collapses if the verifier is closed-source SaaS code. As an open-source reference any adopter can run, "verify without us" is real.
- **Spec-conformance harnesses.** The respondent renderer is the canonical FEL renderer. Anyone implementing FEL needs a reference to test against.
- **Strategic non-moat.** Viewing seats are not the moat. Studio depth, multi-tenant admin, governance, AI co-pilot — those are. Open-sourcing the viewing layer strengthens adoption without diluting the SaaS.

## What's here today

| Path | What |
|------|------|
| [`README.md`](README.md) | This file. |
| [`CLAUDE.md`](CLAUDE.md) | Agent on-ramp. |
| [`JOURNEYS.md`](JOURNEYS.md) | Person-centered "why" for each public surface. |
| [`PLANNING.md`](PLANNING.md) | Atomic FW-* rows (web's own ID space) — Now / Next / Later. |
| [`thoughts/adr/`](thoughts/adr/) | Architecture decisions; ADR-0001 documents the repo's existence. |
| [`thoughts/specs/`](thoughts/specs/) | Design exploration documents. |
| [`thoughts/plans/`](thoughts/plans/) | Implementation roadmaps. |
| [`thoughts/sketches/`](thoughts/sketches/) | Designer-facing visual artifacts. |

No production code yet. UI framework choice is itself a PLANNING row, gated by the end-to-end Respondent thin-slice (FW-0001).

## Where production code will live

This repo will grow into one (or two, depending on the framework decision) deployable bundles:

- **Respondent bundle** — public form-fill surface; lean, accessible, embeddable, white-label-ready.
- **Verifier bundle** — public verifier + selective-proof viewer; SEO-indexable; works offline against a downloaded receipt.

Framework choice lands as ADR-0002. The two bundles may share a framework with route-based code-splitting, or ship as separate apps — that decision falls out of FW-0001 evidence.

## Cross-stack context

This repo is a sibling submodule under [`formspec-stack`](../). Substrate it consumes:

- [`../formspec/`](../formspec/) — Formspec intake spec, engine, FEL.
- [`../formspec-server/`](../formspec-server/) — server-side reference implementation; the respondent submits to its endpoints, the verifier validates against its public bundles.
- [`../trellis/`](../trellis/) — cryptographic substrate the verifier validates over.
- [`../formspec-cloud/`](../formspec-cloud/) — the proprietary tenant app; consumes this repo's bundles as the white-label respondent shell for hosted forms.

## License

Open-source license to be selected when the first production code lands (ADR-0003). Reference-implementation positioning favors MIT or Apache-2.0 over copyleft.
