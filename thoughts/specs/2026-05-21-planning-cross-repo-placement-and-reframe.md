# formspec-web PLANNING.md — cross-repo placement and reframe context

**Date:** 2026-05-21
**Status:** SUPERSEDED 2026-05-22 by [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md), [web ADR-0006](../adr/0006-issuer-sidecar-spec-request.md), [web ADR-0007](../adr/0007-identity-auth-magic-link-and-oidc.md), and [`2026-05-22-upstream-extension-queue.md`](2026-05-22-upstream-extension-queue.md). Preserved for historical context — the analytical work that led to those decisions. Do NOT use this doc as the source of truth for current architecture, scope, or backlog; use the ADRs and the queue.
**Reader cold-start test:** open this six weeks from now and you should know what we're trying to do, why the current PLANNING.md isn't right yet, and what the next step is.

## What we are trying to do

`formspec-web/PLANNING.md` is the atomic backlog for the public reference UI repo. It's derived from `formspec-web/JOURNEYS.md` (47 journeys + 25 anti-patterns, person-centered, plain language). Every load-bearing journey should have at least one `FW-*` row backing it; lanes (`Now (alpha)` / `Now (parity)` / `Next` / `Later`) reflect strategic phasing.

We rewrote PLANNING.md once (senior-product-advisor agent fused with platform-strategist's strategic principles and solutions-architect-validator's anti-sycophancy discipline) and got a 62-row file. That rewrite raised two questions we haven't resolved:

1. **A hexagonal reframe.** The advisor self-critiqued its own output and proposed reshaping the planning around 14 named ports + 3 kernels — the "seams are the artifact" argument for a reference UI implementation.
2. **A placement / DI question.** Each row should ask not just *what* to build, but *which repo across the stack owns the primitive, which owns the UI, and which repos consume it.* Strict layering avoids inheritance smells.

Question 2 is the deeper one. Question 1 doesn't survive contact with the stack as proposed.

## Where things stand

- `formspec-web/JOURNEYS.md` — 47 journeys (J-001..J-047), 25 anti-patterns (AP-001..AP-025), 791 lines. Plain-language, person-centered. The corpus is stable.
- `formspec-web/PLANNING.md` — 62 rows (FW-0001..FW-0062), 661 lines. Lanes: 5 Now (alpha) + 5 Now (parity) + 41 Next + 11 Later. Written by senior-product-advisor agent. **Not yet aligned with the cross-repo placement lens described below.**
- `formspec-web/thoughts/adr/0001-public-reference-ui-separation.md` — exists. The next ADR (0002, 0003, or 0004) is what would carry the seam-map / placement table once the analysis lands.

## The advisor's self-critique (what it proposed, why it's wrong)

After writing the 62-row PLANNING, the advisor proposed a hexagonal reframe:

- 3 kernels (renderer kernel, verifier kernel, paper-render kernel) — pure, framework-free, data-in-data-out.
- ~14 ports (`IdentityProvider`, `ReceiptStore`, `DraftStore`, `DocumentVault`, `PaymentRail`, `BotProtection`, `AssistantBridge`, `TranslationSource`, `ObligationStream`, `AuditSink`, `Notifier`, `Clock`, `FormSource`, `ReceiptVerifier`).
- One reference adapter per port.
- Would collapse the PLANNING from 62 rows to ~45.

**Why it doesn't survive contact with the stack:** most of those kernels and ports already exist or are already specified elsewhere in the formspec stack. The reframe was reasoning in a vacuum about hexagonal architecture without checking what was already there. Mapping the advisor's proposal against the stack:

### Kernels — already exist

| Advisor's kernel | Already lives in |
|---|---|
| Renderer kernel | `formspec/packages/formspec-engine` (TS + Preact Signals over WASM-bridged FEL). `FormEngine` is the reactive state machine — `(definition, answers, events) → (next-state, ui-tree, validation, derivations)` is exactly what it does. |
| Verifier kernel | `trellis/crates/trellis-verify-wos` per ADR-0106, plus shared crypto primitives in `integrity-stack/`. |
| Paper-render kernel | Partial — Theme spec + Component spec carry the rendering specs; paper rendering is a derivation from structured Response. Not its own thing. |

### Ports — most are already specified, several are adopter-side

| Advisor's port | Status |
|---|---|
| `AssistantBridge` | **Already a spec** — `formspec/specs/assist/assist-spec.md`. Tool catalog, transport bindings, HITL profile workflow. |
| `TranslationSource` | **Already a spec** — `formspec/specs/locale/`. String keys, fallback cascade, FEL interpolation. |
| `AuditSink` | **Already a spec** — `formspec/specs/respondent-ledger/`. Envelope, event taxonomy, materiality, checkpoints. |
| `ReceiptVerifier` | **Already implemented** — `trellis-verify-wos` crate + `verification-receipt.schema.json` + signature method registry. |
| `FormSource` | **Already a schema** — `formspec/schemas/definition.schema.json`. Loading is host's. |
| `ObligationStream` | **Substrate exists** — WOS handles workflow obligations; `intake-handoff.schema.json` is the boundary. Cross-sender respondent-side aggregation (J-039) is the genuinely new surface. |
| `DocumentVault` | **Partial** — Response references + Trellis bundles + WOS case evidence compose into it. Respondent-side library (J-042) is the new front end. |
| `IdentityProvider` | Adopter-side. No formspec spec; Assist §6 describes the assurance-level claim model. |
| `PaymentRail` | Adopter-side. No formspec spec. |
| `BotProtection` | Adopter-side. No formspec spec. |
| `Notifier` | Substrate exists — `stack-common` has outbox; WOS handles workflow-driven notifications. No respondent-facing notification spec yet. |
| `DraftStore` | Engine has reactive state; persistence is host's. Response schema defines the persistent shape. |
| `Clock` | Trivial host concern. |

Of the 14 proposed ports: **6 are already specified**, 2 partially exist, 5 are adopter-side and should be thin per-feature adapters (not normative formspec ports), 1 is trivial. Of the 3 kernels: 2 exist, 1 is partial.

**Conclusion:** formspec-web is not the place to invent ports + kernels. The kernels and ports mostly already exist. formspec-web is the **respondent-facing shell** that consumes them.

## The placement / DI lens (the user's additional constraint)

Every PLANNING row should ask three questions, not one:

| Question | Answer determines |
|---|---|
| Where does the **primitive** live? | Which repo owns the spec / schema / kernel |
| Where does the **UI surface** live? | Almost always formspec-web for respondent-facing work |
| Which repos **consume** it? | Flags duplication smells if two same-level repos implement the same primitive |

**Rule:** if the primitive lives in the right repo and consumers reach down through narrow seams to grab it, that's good DI. If two repos at the same level both implement a primitive, that's a smell.

### Worked example — file upload (J-040 / FW-0033)

The user named this as a case where WOS may already have an upload primitive that should actually live in formspec, with WOS just consuming. Working it out:

| Piece | Right home |
|---|---|
| File-attachment **field type** (item declares it accepts a file) | **formspec** (definition spec, FT-03) — already exists |
| **Capture UI** (camera-first, deskew, redact, legibility check) | **formspec-web** — new |
| **File reference in Response** (URI/hash, not bytes) | **formspec** (response schema) — exists |
| **Object store** (chunked upload, retention, signed URLs) | **stack-common** — exists |
| **Integrity attestation** that file X was attached by Y at T | **trellis** + **integrity-stack** — exists |
| **Idempotency** on retry | **stack-common** — exists |
| **Bring-into-case** for downstream workflow | **work-spec / workspec-server** — should consume, not re-implement |
| **Respondent-side library** (J-042) | Open question — see "real smells" below |

So the upload work in formspec-web is almost entirely UI. Storage / integrity / idempotency / field-type spec / ledger event all exist in the right layers. **If WOS has its own evidence-attachment primitive that doesn't compose with formspec's file-attachment + trellis attestation + stack-common object store, that's the smell to fix — and the fix is in WOS, not in formspec-web.** Worth verifying.

## Per-journey placement analysis

Walking the JOURNEYS / PLANNING corpus with the placement lens.

### Likely correctly placed — formspec-web consumes existing primitives

- **Locale fallback / register (J-010)** — Locale spec owns; formspec-web renders.
- **Per-field "why are you asking" + rule citation (J-017)** — References spec + PKAF authority chains own.
- **Conversational AI mode + BYO assistant (J-011, J-046)** — Assist spec + References spec own; formspec-web hosts the tool surface.
- **Verifier (J-007)** — trellis-verify-wos + integrity-stack own; formspec-web renders the claim graph.
- **WYSIWYS signature ceremony (J-008)** — Signature Method Registry + integrity-stack + Trellis own the cryptography.
- **Pre-flight screener (J-047)** — Screener spec + determination schema own.
- **Receipt portability + paper rendering (J-009, J-038)** — Response + Trellis bundle + verification receipt own the artifact.
- **Amend / retract / dispute / honest correction (J-016, J-044)** — Respondent Ledger owns the event chain.
- **Audit log export (J-009 second half)** — Respondent Ledger + Trellis own.

### Real placement questions — worth checking against schemas before acting

- **Provenance per-value on Response (J-020 / AP-008)** — Does `response.schema.json` carry per-value provenance today? Journey demands "agency-prefilled vs user-attested" be visible in the receipt. If not, **formspec definition spec gap.** formspec-web cannot paper over this.
- **Irreversibility tag on items / steps (J-015)** — Per-item / per-step `irreversible` flag. Probably not in `definition.schema.json` today. **formspec spec gap.**
- **Field-level protectability for safe-address (J-037)** — Item-level `protected: true` flag plus receipt-level redaction. Selective disclosure exists in Trellis; the declaration is item metadata. **formspec definition extension.**
- **Duress signal on submission (J-027)** — A signed "this submission may not be freely given" event. Respondent Ledger already has an event taxonomy. Either an event-type addition to the ledger or out of scope; need to verify the existing taxonomy.
- **Tone-suppression for grief / hardship (J-025)** — Form-level "this is a hardship context." Probably Theme metadata (presentation-tier), not Definition.
- **Multi-party form definition (J-041)** — Per-party visibility scoping needs a definition-spec extension. Per-party state is workflow → WOS. **formspec spec extension + WOS workflow primitive.**
- **Derivation tree for show-the-math (J-023)** — Does `formspec-engine` expose `getDerivationTree(path)` today? If not, the primitive belongs in formspec-engine, not formspec-web. **formspec-engine API gap, possibly.**
- **Year-over-year outlier nudge (J-023 part)** — Where does prior-year comparison live? External validation injected at submit (VE-06 — formspec validation spec already supports) or UI-only nudge?
- **Cross-agency referral disclosure (J-028)** — Item-level metadata flagging "answer triggers referral to agency X." Probably a **formspec definition extension** (something like `triggersReferral: { agency, action }`). Receipt records consent. UI surfaces.

### Genuine likely smells to file follow-up in the owning repo

- **WOS evidence-attachment primitive** — If WOS has its own upload flow that doesn't compose with formspec's file-attachment field + trellis attestation + stack-common object store, that's the user's exact example. **File-able as a work-spec / workspec-server cleanup item.** Worth verifying.
- **Cross-form respondent-side document library (J-042)** — Not in any spec today. Likely placements:
  - A new formspec sidecar spec (like References / Locale / Ontology) — a "Respondent Library" spec. Strongest placement.
  - Or extend the verifiable-credentials wallet pattern References already gestures at.
  - **Should not be invented inside formspec-web** — would create a UI-side primitive other consumers can't reach.
- **Cross-sender obligations stream (J-039)** — Cross-issuer aggregation requires a contract for "what obligations does this Response trigger?" Per-form obligations live in WOS. Cross-sender aggregator isn't in any spec. Either a new formspec/WOS contract or formspec-web carries it as a non-portable UI feature. **Architecture decision worth an ADR before any rows ship.**
- **Personal credential wallet (J-013 wallet path)** — Ontology spec gestures at this but doesn't define respondent-controlled storage. Industry-standard W3C VC / OpenID4VP exists. **formspec spec extension to bind the wallet pattern formally, or accept it's adopter-side.**
- **Cross-agency referral declaration (J-028)** — Listed above under spec gaps, but it may also surface a smell in how external action consent is tracked. Worth checking how SAR / mandatory-reporter actions are modeled today.

## Strategic context (preserved from the advisor's pressure-tests)

The 62-row PLANNING is closer to right than the proposed hexagonal collapse, because the hexagonal collapse didn't check the stack. But three pressure-tests from the advisor's own self-review are still on the table:

1. **`Now (alpha)` could be 3 rows instead of 5**, with FW-0004/0005/0006/0007 demoted to acceptance criteria on FW-0001. Counter-argument: implicit coverage is how mobile parity and pre-submit consequences get lost in implementation.
2. **Three least-confident rows:** FW-0006 (trail-sign cover — depends on completion-time data that doesn't exist yet, risks vendor-estimate theater), FW-0009 (paper receipt — arguably ahead of where alpha needs to be), FW-0048 (coercion design row in Next — heavy threat-model work; could slip to Later but it's morally load-bearing).
3. **The thing the rewrite may have missed:** the Trust Center as a *working artifact graph* — every claim ("SOC 2 control X," "subprocessor change Y on date Z") as itself a verifiable artifact opened in the verifier. Would put Trust Center + verifier on the same evaluator surface. Could be a positioning multiplier in `Now (alpha)`.

These deserve resolution but they don't block the placement work.

## Proposed next steps

1. **Don't have the senior-product-advisor rewrite PLANNING.md yet.** The current 62 rows are good enough as a working draft; rewriting before resolving placement would lock in misplacements.
2. **Build a cross-repo placement table.** One row per major capability covered by JOURNEYS, columns for:
   - Primitive home (which repo owns the spec / schema / kernel)
   - UI home (almost always formspec-web)
   - Consumers (which repos reach for the primitive)
   - Status (exists / partial / spec gap / smell)
   - **Lives in a new web ADR** (likely ADR-0002 or 0003 — depending on what ADR-0002 holds when ratified). Replaces the advisor's proposed "ADR-0004 carries kernels + ports" — instead, the ADR maps existing seams formspec-web consumes.
3. **For each "spec gap" surfaced** (provenance per value, irreversibility tag, protectability tag, cross-agency referral declaration, derivation-tree API, multi-party visibility, possibly duress event) — file follow-up work in the *owning* repo (formspec / formspec-engine / Respondent Ledger). Not in formspec-web.
4. **For each "real smell" surfaced** (WOS evidence-attachment duplication, cross-form library placement, cross-sender obligations contract, wallet pattern formalization) — write a small ADR or planning row in the *owning* repo proposing the right placement.
5. **Verify hypotheses against schemas first.** Before acting, confirm by reading:
   - `formspec/schemas/response.schema.json` — does Response carry per-value provenance? Per-value attestation distinction (agency-prefilled vs user-attested)?
   - `formspec/schemas/definition.schema.json` — does Item carry `irreversible`, `protected`, `triggersReferral`-style flags?
   - WOS / workspec-server evidence-attachment surface — does it duplicate or compose?
   - `formspec/specs/respondent-ledger/` event taxonomy — does it admit a duress-signal event?
   - `formspec-engine` API — does it expose derivation tree introspection?
   - Could dispatch `formspec-specs:spec-expert` to nail these down rapidly.
6. **Then collapse PLANNING.md** with placement clarity. Most of the current 62 rows become either:
   - "Consume an existing primitive from repo X, render it as respondent surface here." Small rows.
   - "Surface a new respondent-side concern that needs an upstream spec extension in repo X first." Blocked rows.
   - "Pure UI shell concern (mobile, accessibility, framework choice)." formspec-web's own.

## Open decisions for the owner

Before any reshape:

1. **Verify the schema gaps before reshaping rows** — yes / hold off / dispatch spec-expert myself?
2. **Hexagonal `Kind` tag in PLANNING.md** — the advisor recommends *no* (keep PLANNING.md person-facing); the placement table goes in an ADR. Confirm or override.
3. **Trust Center as artifact graph (the thing missed)** — promote to `Now (alpha)` as a positioning multiplier, hold for later, or reject?
4. **Three pressure-test rows** (FW-0006 trail-sign, FW-0009 paper receipt, FW-0048 coercion design) — keep as written, demote, or restructure?
5. **Cross-sender obligations stream (J-039) and respondent-side document library (J-042)** — file as cross-repo ADRs (formspec sidecar spec proposals), or accept as formspec-web-only UI features for v1 and revisit later?

## File pointers

- `formspec-web/JOURNEYS.md` — source of person-need (47 journeys, 25 anti-patterns)
- `formspec-web/PLANNING.md` — current state (62 FW-* rows, written by senior-product-advisor agent)
- `formspec-web/CLAUDE.md` — repo framing, lane conventions, single positioning bet (J-007 verifier)
- `formspec-web/thoughts/adr/0001-public-reference-ui-separation.md` — why this repo exists separately from formspec-cloud
- Stack-root `CLAUDE.md` — layer table (which repo owns what); semantic-density and review-discipline rules
- `formspec/CLAUDE.md` — spec authoring contract; the `formspec-specs:spec-expert` skill is the authoritative spec lookup
- Stack `STACK.md` — public-facing layer framing
- The agent transcripts that produced the 62-row PLANNING and the hexagonal reframe self-critique are in the conversation history; the file outputs in `/private/tmp/.../tasks/` are not load-bearing (transcripts are non-canonical).
