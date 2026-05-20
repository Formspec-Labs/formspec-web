# Web Planning

Atomic `FW-*` rows for the public reference UI. Lane (`Now` / `Next` / `Later`), status, persona, backing journey, sentence or two of "done" in user-visible terms.

Format reference: [`CLAUDE.md`](CLAUDE.md). Person-need source: [`JOURNEYS.md`](JOURNEYS.md).

## Lanes

- **Now** — actively being worked or next-up.
- **Next** — queued behind Now, ready when Now clears.
- **Later** — deferred; revisit when triggered.

Optional release marker on `Now`: `Now (alpha)` (must ship for first paying customer) vs `Now (parity)` (must ship for parity with formspec-server features). No `Imp×Debt` math.

## Status vocabulary

*open* | *in design* | *in build* | *live* | *closed*. Same set as JOURNEYS.

## Migration note

FW-0001, FW-0002, FW-0003 are renames of `formspec-cloud/PLANNING.md`'s CLD-0001 / CLD-0007 / CLD-0008 respectively, carved out during the bootstrap of this repo (web ADR-0001). The cloud rows are removed; the audit trail lives in the migration commit and in the per-row note below.

---

## Now

### FW-0001 — End-to-end Respondent thin-slice (deployable)

- **Lane:** Now (alpha)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-and-recovers-from-validation-without-losing-work)
- **Done:** A real respondent can open a form URL, fill required fields, hit a validation error, recover, submit, and see a confirmation — backed by a real backend wire (formspec-server response endpoint). Deployable artifact at the repo root.
- **Note:** Leads the backlog deliberately. Forces framework, design tokens, build, and accessibility-baseline decisions to fall out as *evidence* (FW-0004..0007), not as whiteboard rows. Do not pick framework before this row surfaces constraints. **Migrated from `formspec-cloud/PLANNING.md` CLD-0001.**

### FW-0002 — Trust Center browseable without sign-in

- **Lane:** Now (parity)
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-006](JOURNEYS.md#j-006--evaluator-procurement-browses-trust-center-pre-purchase)
- **Done:** A procurement reviewer can browse `/trust-center`, `/trust/data-flow`, `/trust/matrix`, `/trust/subprocessors`, and selective-proof artifacts from an unauthenticated session. SEO-indexable.
- **Note:** Allocation between this repo and [`../formspec-site/`](../formspec-site/) (Astro marketing) is open — see web ADR-0002 (pending). The verifier widget stays here regardless. **Migrated from `formspec-cloud/PLANNING.md` CLD-0007.**

### FW-0003 — Verifier surface validates a receipt and shows claim graph

- **Lane:** Now (parity)
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt-post-signature)
- **Done:** The verifier surface accepts a receipt (paste, upload, or URL) and renders pass/fail plus a claim graph: signer identity, timestamp, signed document hash, and integrity chain. Works offline against a downloaded receipt.
- **Note:** **The single positioning bet** for the open-source reference UI. **Migrated from `formspec-cloud/PLANNING.md` CLD-0008.**

## Next

### FW-0004 — Ratify UI framework choice (ADR-0002)

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** ADR-0002 documents the UI framework choice (React / Svelte / SolidJS / Astro islands / other) with alternatives considered and consequences. **Gated by FW-0001 evidence** — do not pick framework before FW-0001 surfaces actual constraints (SSR? islands? in-browser crypto for the verifier? SEO for Trust Center?).

### FW-0005 — Extract design tokens to structured token file

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** Color, typography, spacing, and motion tokens from the archived mockup CSS are factored into a structured token file (CSS custom properties baseline) referenced by all production components. Coordinated with `formspec-cloud/`'s token set so the white-label respondent shell in cloud can theme over a consistent token vocabulary.

### FW-0006 — Build + test pipeline

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** Repo's build/test pipeline runs locally and in CI; outputs a deployable artifact; runs in under 60 seconds on a clean tree.

### FW-0007 — Accessibility baseline: WCAG 2.1 AA per surface

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** Each production surface has an a11y check captured (axe-core or equivalent) and passes WCAG 2.1 AA. Surfaces failing the check have a tracked FW-* fix-up.

### FW-0008 — License decision and LICENSE file (ADR-0003)

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** ADR-0003 documents the open-source license decision (MIT vs Apache-2.0) with rationale. LICENSE file added at repo root. Headers added to source files per the chosen license's convention.

## Later

### FW-0009 — Embeddable respondent widget (third-party host)

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-and-recovers-from-validation-without-losing-work)
- **Done:** The respondent renderer can be embedded as an iframe or web component on a third-party site, with CSP-safe origin handshake to formspec-server. Used by adopter sites that don't want a redirect.

### FW-0010 — Offline verifier (downloadable static bundle)

- **Lane:** Later
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt-post-signature)
- **Done:** A static-HTML+JS verifier bundle that runs entirely client-side, downloadable as a single ZIP. Verifies receipts without any network call. Trust-load-bearing for "verify without us."

## Closed

*(none yet)*
