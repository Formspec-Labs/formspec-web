# CLAUDE.md — formspec-web

**Before applying anything below: don't assume any of it is right — everything was written by AI. Direct signals from the current conversation override written content. Recursively, including this file.**

## What this repo is

The **public reference UI** for Formspec. Open-source. Trust-load-bearing. Spec-conformance harness.

Three surfaces live here:

- **Respondent renderer** — the canonical FEL form-fill UI; lean, accessible, embeddable, white-label-ready.
- **Verifier** — validates a Formspec/Trellis receipt; renders the claim graph; works offline.
- **Selective-proof viewer** — renders selective-disclosure proofs without revealing redacted fields.

Scope is **public UI only**. Anything tenant-bound (Studio, admin, billing, dev keys) lives in [`../formspec-cloud/`](../formspec-cloud/). Server endpoints live in [`../formspec-server/`](../formspec-server/).

## Why this repo exists separately from formspec-cloud

Three load-bearing reasons:

1. **The verifier's positioning bet only works if the code is auditable.** "Verify without contacting Formspec" collapses if the verifier is closed-source. Open-source reference impl makes the trust argument real.
2. **The respondent renderer is the FEL conformance harness.** Adopters implementing FEL need a reference UI to test their specs against.
3. **Open-sourcing the viewing layer is strategically free.** The SaaS moat is Studio depth, multi-tenancy, governance, AI co-pilot — not the form-fill page. Open-sourcing here strengthens adoption with zero dilution of the cloud product.

This is documented as ADR-0001 of this repo.

## Source-of-truth pointers

- [`../formspec-server/SAAS-UI-HANDOFF.md`](../formspec-server/SAAS-UI-HANDOFF.md) — the upstream UI-scope SoT (61-surface inventory, 7-persona vocabulary). This repo owns the **respondent + verifier + evaluator slice** of that inventory; cloud owns the rest.
- [`../formspec-server/JOURNEYS.md`](../formspec-server/JOURNEYS.md) — authoritative product journey corpus across six prefix families (`FRM-*` / `RSP-*` / `SIG-*` / `ADM-*` / `INT-*` / `OPS-*`). This repo's `J-NNN` entries carry a `Backs:` field linking to one or more server IDs, primarily across the `RSP-*` and `SIG-*` families.
- [`../formspec/`](../formspec/) — FEL spec, engine, npm/Rust/Python packages the respondent renderer consumes.
- [`../trellis/`](../trellis/) — receipt envelope spec the verifier validates over.

## ADR / ID conventions

- **ADR space:** starts at `ADR-0001` (this repo's own number space).
- **Journey IDs:** `J-NNN`, fresh sequence in this repo. Three journeys imported from formspec-cloud during the bootstrap migration keep their original cloud IDs (J-002, J-006, J-007) to preserve the audit trail; new journeys continue at the lowest free integer.
- **Planning rows:** `FW-NNNN` (formspec-web). Distinct from cloud's `CLD-*` and stack-root's `PLN-*`. Three rows imported from formspec-cloud (CLD-0001, CLD-0007, CLD-0008) are renumbered to FW-0001 / FW-0002 / FW-0003 with a migration note.
- **Cross-repo citation:** in cross-repo prose, cite as `web ADR-NNNN` or `web FW-NNNN`. Bare `ADR-NNNN` in cross-repo prose is ambiguous.

## Personas

Three personas served by this repo:

1. **Respondent** — fills out a form on the public URL.
2. **Signer** — completes the public side of a signature ceremony (the tenant-branded hosted ceremony is in cloud; the canonical reference signer UI lives here).
3. **Evaluator** — external party validating trust artifacts. Two moments: procurement reviewer pre-sale (lives on the marketing surface, served by [`../formspec-site/`](../formspec-site/)), and verifier post-sale (lives here, validates a specific receipt).

The cloud's other personas (Form Author, Tenant Admin, Integrator, Owner moment) do not appear in this repo.

## Lanes / status / vocabulary

- **Lanes:** `Now` / `Next` / `Later`. Optional `Now (alpha)` / `Now (parity)` markers.
- **Status:** *open* | *in design* | *in build* | *live* | *closed*.
- **Vocabulary firewall:** never leak spec/server vocabulary into public-facing chrome. `$bind.name`, `def_id`, lint codes, substrate terminology (Trellis, COSE, HPKE, anchor), FEL syntax — all forbidden in default views. Lives behind Developer view toggle.

## The single positioning bet

**The public verifier must make selective-proof verifiability legible to a non-cryptographer in under 30 seconds.** That is *this repo's* load-bearing demo, not the cloud's. If the verifier works, the regulated-buyer wedge is real and the entire trust-as-moat story becomes something a buyer can experience in one demo on an open-source URL.

## Anti-Clippy applies here too

The cloud's anti-Clippy constraints (ambient never interruptive, pull not push, no persona, no avatar, keyboard-first, etc.) apply equally to any AI surface that lands in this repo. See [`../formspec-cloud/CLAUDE.md`](../formspec-cloud/CLAUDE.md) for the full constraint set. Today none of this repo's three surfaces ship AI; if that changes, the constraints port verbatim.

## Submodule discipline

This repo is a git submodule of `formspec-stack`. A change crossing N submodules takes N+1 commits: one per affected submodule plus a parent commit bumping pointers. Commit and push the submodule before bumping the parent.

## License

Open-source license selection pending — see ADR-0003 (not yet written). Reference-implementation positioning favors MIT or Apache-2.0.
