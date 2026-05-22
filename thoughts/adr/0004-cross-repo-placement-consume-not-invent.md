# ADR-0004 — Cross-repo placement lens: consume primitives, do not invent them

**Date:** 2026-05-22
**Status:** accepted

## Context

A 47-journey / 25-anti-pattern audit (`JOURNEYS.md`) drove a 62-row `PLANNING.md`. An agent-authored re-shape then proposed a hexagonal collapse — 14 "ports" + 3 "kernels" invented inside formspec-web. A cross-stack scout walk against the live stack (formspec / fel-core / formspec-engine / trellis / integrity-stack / work-spec / stack-common) found that most of the proposed primitives already exist:

| Proposed inside formspec-web | Already exists in |
|---|---|
| Renderer kernel | `formspec/packages/formspec-engine` (FormEngine over WASM-bridged FEL) |
| Verifier kernel | `trellis/crates/trellis-verify-wos` + `integrity-stack/` |
| Assist provider | `formspec/specs/assist/` |
| Locale resolution | `formspec/specs/locale/` |
| Authority citation | `formspec/specs/core/references-spec.md` + `PKAF/` |
| Audit sink | `formspec/specs/audit/respondent-ledger-spec.md` |
| Verification receipt | `formspec/schemas/verification-receipt.schema.json` |
| Attachment binding | `thoughts/adr/0072-stack-evidence-integrity-and-attachment-binding.md` |
| Identity attestation | `formspec/specs/audit/respondent-ledger-spec.md` §6, §10 |
| Form-version diff | `formspec/schemas/changelog.schema.json` |
| Pre-flight screener | `formspec/specs/screener/` |
| Honest correction | `respondent-ledger-spec.md` §11.4 (`response.correction-recorded`) |

The smell the proposal would have created: UI-only primitives that other consumers of the formspec stack (formspec-cloud's white-label respondent shell, third-party FEL renderers, future native clients) cannot reach.

## Decision

Every `PLANNING.md` row and every implementation in formspec-web MUST answer three questions before code is written:

1. **Where does the primitive live?** Which repo owns the spec / schema / kernel.
2. **Where does the UI live?** Almost always formspec-web for respondent-facing work.
3. **Which other repos consume it?** Flags duplication smells when two same-level repos would implement the same primitive.

If the primitive is missing, the work is **upstream-first**: file an ADR or spec extension in the owning repo (formspec, work-spec, trellis, integrity-stack, stack-common, fel-core), then consume it in formspec-web. "Build it here and back-port later" is rejected — back-port rarely happens, and the UI-side version forks the architecture.

formspec-web is the canonical *consumer* of the formspec stack, not a new producer of stack-level primitives.

**Adopter-side ports are excepted.** Identity providers, payment rails, bot protection, notification delivery, and embed transports are deployment-shaped (country-specific, regulator-specific, infrastructure-specific). They live inside formspec-web as narrow ports with reference adapters; they are NOT upstream-spec candidates because there is no portable primitive to spec — only the port shape. The distinction is **primitive vs. port**: primitives describe what the form means (Definition, Response, Issuer, Locale, References, Ontology); ports describe deployment seams formspec-web crosses (identity, payment, notification). The consume-not-invent rule applies to primitives; ports are formspec-web's by construction. See web ADR-0007 for the worked example.

## Rationale

1. **Reference-impl integrity.** formspec-web is the open-source FEL conformance harness (web ADR-0001). UI-side primitives that other implementations cannot reach mean the "feature" is not actually part of the spec — it's a fork.
2. **Composability.** Identity, attachments, signatures, ledger events, locale, references, screener, and changelog already compose cleanly through their owning specs. UI-side reinvention severs the composability and bloats the surface.
3. **Documented near-smell.** The cross-stack scout flagged J-040 (file upload) as a potential WOS/Formspec duplication. Investigation confirmed it was a naming collision, not duplication — ADR-0072 already specifies the cross-layer attachment-binding contract correctly. The exercise validated the placement lens: without the lens, an invented WOS upload primitive would have been the actual smell.
4. **Genuinely-adopter-side concerns are excepted.** Identity providers, payment rails, bot protection, notification delivery, embed transports are deployment-shaped and country/regulator-specific. They live as narrow ports inside formspec-web with reference adapters — they are NOT candidates for upstream formspec specs (web ADR-0007 documents this for identity).

## Consequences

- `PLANNING.md` rows that need a primitive that does not exist upstream are marked **blocked on `<owning-repo> ADR X`** rather than scheduled for build in formspec-web.
- A living catalog of upstream extension proposals tracks the dependencies: [`../specs/2026-05-22-upstream-extension-queue.md`](../specs/2026-05-22-upstream-extension-queue.md).
- The Issuer Sidecar spec request (web ADR-0006) is the worked example of the upstream-first pattern: the gap was diagnosed in formspec-web, the spec was authored in formspec, and formspec-web consumes via an `IssuerProvider` port.
- Reviewers (scout / expert agents) MUST refuse PRs that introduce new UI-side primitives without an upstream spec, except for adopter-side ports listed above.
