# Web Journeys

Person-centered journeys for the public reference UI. Use this document to understand **what a real person wants to do on the screen, and what "it works" feels like to them.**

[PLANNING.md](PLANNING.md) lists `FW-*` rows — atomic UI work items. This document is the "why" above them.

## Relation to formspec-server JOURNEYS

[`../formspec-server/JOURNEYS.md`](../formspec-server/JOURNEYS.md) is the authoritative product journey corpus across six prefix families: `FRM-*` (form author), `RSP-*` (respondent), `SIG-*` (signature), `ADM-*` (admin), `INT-*` (integrator), `OPS-*` (operator). This repo's `J-NNN` entries primarily back `RSP-*` and `SIG-*` family items, with one cloud-only Trust Center surface that has no server analog. When the two corpora disagree on substance, write an ADR. Never silent drift.

## Migration note

Three journeys (J-002, J-006, J-007) were carved out of `../formspec-cloud/JOURNEYS.md` during the bootstrap of this repo, on the architectural argument that public reference UI does not belong in the proprietary cloud repo (web ADR-0001). They retain their original cloud IDs to preserve the audit trail. New journeys here continue at the lowest free integer.

## Personas

1. **Respondent** — fills out a form on the public URL.
2. **Signer** — completes the public side of a signature ceremony (canonical reference signer UI; tenant-branded hosted variant lives in cloud).
3. **Evaluator** — external party validating trust artifacts. *(Procurement-reviewer pre-sale moment lives on the marketing site `../formspec-site/`; the verifier post-sale moment lives here.)*

## Journey row format

- **Who** — kind of person.
- **What they want** — the need, in their words.
- **Why it matters** — what happens if we get this wrong.
- **What "done" looks like** — the outcome the person would see.
- **Feel** — emotional register.
- **Surfaces** — paths to relevant surfaces. Cross-repo surface references during the archive-mockup phase point into `../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/`; once production code lands here, the link updates and the archive entry becomes historical.
- **Backs** — one or more server journey IDs (`FRM-*`, `RSP-*`, `SIG-*`, `ADM-*`, `INT-*`, `OPS-*`), or `(none — cloud-only surface family)`.
- **Status** — *open* | *in design* | *in build* | *live* | *closed*.

---

## J-002 — Respondent fills out a form and recovers from validation without losing work

- **Who:** Respondent on any device, partway through a form.
- **What they want:** When I hit a validation error or accidentally navigate away, my answers don't vanish.
- **Why it matters:** Lost form-fill work is the single most enraging UX failure; respondents abandon and don't come back.
- **What "done" looks like:** Validation errors appear inline next to the field, with focus and a screen-reader-friendly announce. Refreshing the page or losing connection preserves answers locally and restores on return.
- **Feel:** Trusted — the form respects my time.
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup, cross-repo archive)*.
- **Backs:** [RSP-002](../formspec-server/JOURNEYS.md#rsp-002) — "clear errors and a review step before I submit"; [RSP-003](../formspec-server/JOURNEYS.md#rsp-003) — "save progress and resume later"; [RSP-012](../formspec-server/JOURNEYS.md#rsp-012) — "my old answers to be there when I come back."
- **Status:** *in design*

## J-006 — Evaluator (procurement) browses Trust Center pre-purchase

- **Who:** Procurement reviewer evaluating whether to buy.
- **What they want:** Find data flow, capability matrix, subprocessors, and selective-proof artifacts without contacting sales.
- **Why it matters:** Self-service procurement is the modern buyer expectation. If the Trust Center is shallow or sales-gated, the evaluation stops and the buyer moves on.
- **What "done" looks like:** Trust Center is browseable without sign-in; data-flow diagram, capability matrix, subprocessor list, and selective-proof artifacts are all linked from a single index.
- **Feel:** Respected — Formspec trusts me to evaluate them on my own.
- **Surfaces:** [trust-center](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-center.html) *(mockup)*, [trust-data-flow](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-data-flow.html) *(mockup)*, [trust-matrix](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-matrix.html) *(mockup)*, [trust-subprocessors](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-subprocessors.html) *(mockup)*.
- **Backs:** `(none — public marketing surface family; Trust Center has no server journey analog)`.
- **Note:** The marketing-flavored pages (data-flow / matrix / subprocessors) may ultimately land in [`../formspec-site/`](../formspec-site/) as Astro content rather than this repo. The verifier widget that the Trust Center embeds stays here. Allocation decision: web ADR-0002 (pending).
- **Status:** *open*

## J-007 — Evaluator (verifier) validates a receipt post-signature

- **Who:** Recipient of a signed envelope, or an external auditor.
- **What they want:** Confirm that the receipt I was given is valid, signed by who it claims, and untampered.
- **Why it matters:** A receipt that can't be independently verified is theater. Trust collapses if verification requires re-contacting Formspec.
- **What "done" looks like:** Verifier surface accepts a receipt (paste, upload, or URL) and shows pass/fail plus the claim graph: who signed, when, what was signed, integrity chain. Works offline against a downloaded receipt.
- **Feel:** Convinced — this is real, not a screenshot.
- **Surfaces:** [verifier](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/verifier.html) *(mockup)*, [selective-proof](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/selective-proof.html) *(mockup)*, [receipt](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/receipt.html) *(mockup)*.
- **Backs:** [SIG-004](../formspec-server/JOURNEYS.md#sig-004) — "a certificate that proves who signed what" (the verifier consumes this); [RSP-005](../formspec-server/JOURNEYS.md#rsp-005) — "I want proof that I submitted."
- **Status:** *open*
- **Note:** This journey is the **single positioning bet** for the open-source reference UI (web CLAUDE.md). Treat any verifier-surface decision as high-stakes.
