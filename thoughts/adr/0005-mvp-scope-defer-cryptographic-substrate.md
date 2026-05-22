# ADR-0005 — MVP scope: defer cryptographic substrate; ship respondent fill + validate first

**Date:** 2026-05-22
**Status:** accepted

## Context

`CLAUDE.md` identifies the public Verifier (J-007 / FW-0003) as the single positioning bet for formspec-web. The full respondent / signer / verifier triple is the load-bearing demo: drop a receipt onto the verifier, see a valid claim graph in under 30 seconds without contacting Formspec.

Realizing that triple end-to-end pulls in:

- WYSIWYS signer ceremony — narrows to a UI-annex over existing stack-root [ADR-0083](../../../thoughts/adr/0083-authored-signatures-document-hash.md) + [ADR-0136](../../../thoughts/adr/0136-signature-artifact-dependency-inversion.md) + [ADR-0141](../../../thoughts/adr/0141-rendering-service-architecture.md) (queue SC-5, narrowed 2026-05-22)
- Signature method registry binding for WebAuthn passkey-bound signing
- **Browser verifier:** the Phase-1 COSE_Sign1 verifier ships pure-TS, no WASM (`@integrity-stack/signature-adapter-webcrypto` + `@integrity-stack/cose` + Formspec wrappers `@formspec/signature-*`). The originally-feared "Trellis verifier WASM build + size budget" concern applies only to BBS+ / ECDSA-SD selective-disclosure cryptography, not to MVP-era verification.
- **Selective-proof viewer:** SD-JWT is the default per stack-root [ADR-0116 (selective disclosure: SD-JWT default, BBS+ profile)](../../../thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md), not BBS+ as initially framed. SD-JWT is tractable with existing libraries; BBS+ is trigger-gated and dormant. FW-0010 is closer to "vector landing" than "Phase-3 cryptography."
- Respondent Ledger event taxonomy expansion (withdrawn / dispute-attached / consent.revoked / duress-signaled — multiple gaps per scout walk)
- Receipt-domain prose disagreement (`signature-method-registry.md:99` vs `integrity-signature/src/lib.rs:155` — known drift, low-cost fix but not zero-cost)

A respondent who fills out a form and submits it is a *complete* user-value loop without any of the signing layer. Many regulated-buyer use cases (eligibility intake, notice acknowledgement, application submission, screener routing) deliver real value at "form fills, validates, submits, confirms" without a cryptographic receipt.

## Decision

The MVP slice of formspec-web ships:

| Row | What |
|---|---|
| FW-0001 | End-to-end Respondent thin-slice (deployable) |
| FW-0004 | First-paint legitimacy (Issuer-aware cover; unbranded fallback acceptable) |
| FW-0005 | Phone-first form-fill, one-handed |
| FW-0012 | WCAG 2.1 AA across surfaces |
| FW-0013 | Plain-language errors + typed problem detail (`stack-common` Problem JSON) |
| FW-0014 | Framework + runtime choice (web ADR-0002) |
| FW-0015 | Design tokens to structured file |
| FW-0016 | Build and test pipeline producing a deployable artifact |
| FW-0017 | A11y automation in CI (`axe-core`) |
| FW-0018 | License decision (web ADR-0003) |
| FW-0019 | Multilingual form (basic — no certified-translator attribution) |
| FW-0063 | Identity layer per web ADR-0007 (magic-link + optional OIDC via `IdentityProvider` port) |

The MVP slice **deliberately defers**:

- All cryptographic-substrate journeys: signer ceremony (FW-0008), signed receipts (FW-0009), public verifier (FW-0003), selective-proof viewer (FW-0010), passkey-bound signing (FW-0031), professional-credential signing (FW-0035), wallet pattern (J-013), WebAuthn binding.
- All multi-party (J-041 / FW-0050 / FW-0061), all safe-address (J-037 / FW-0049 / FW-0060), all coercion-aware signing (J-027 / FW-0048 / FW-0059).
- All amend / withdraw / dispute on signed records (J-016 / J-044 / FW-0034 / FW-0038).
- All offline-capable (J-045 / FW-0044).
- All cross-sender obligations (J-039 / FW-0055), all respondent-side library (J-042 / FW-0056), all cross-issuer history (J-043 / FW-0057).
- All conversational AI mode (J-011 / FW-0045), all BYO assistant build (J-046 / FW-0051 / FW-0062).
- Trust Center (J-006 / FW-0002).
- All AI-agent-as-filer (J-012 AI-chain variant / FW-0058).

Additionally **deferred for upstream-spec-extension reasons** (not cryptographic but blocked on schema work in formspec): trail-sign cover (FW-0006, blocked on EXT-7), pre-submit consequences (FW-0007, blocked on EXT-1 + EXT-5), branched-form "showing because" (FW-0011, blocked on EXT-4), and every other row in `PLANNING.md` carrying a `Blocked on:` annotation.

These are all **deferred, not rejected**. Each survives in `PLANNING.md` as an upstream-blocked row tracked against [`../specs/2026-05-22-upstream-extension-queue.md`](../specs/2026-05-22-upstream-extension-queue.md).

## Rationale

1. **Velocity.** Cryptographic substrate work spans three submodules (trellis, integrity-stack, formspec-trellis-bindings) and is partially gated on Phase-3 spec work that has not shipped. An MVP that requires it ships post-substrate; an MVP that does not, ships now.
2. **Real adopter value.** Government and nonprofit intake without cryptographic receipts is a useful product. Many adopters' current state is paper or PDF — anything that fills, validates, and submits structured data is already a meaningful upgrade.
3. **Architecture preservation.** Per web ADR-0004 (consume not invent), the deferred work is **upstream-blocked**, not architecturally precluded. The engine boundary, Response schema, Issuer pin (web ADR-0006), and identity port (web ADR-0007) are all designed so the cryptographic substrate slots in behind the same UI shell when ready. The MVP shell does not need refactoring later — it gains adapters.
4. **Honesty about Phase-3 dependencies.** True selective-disclosure cryptography (BBS+ / ECDSA-SD) is deferred per `trellis-operational-companion.md` OC-31. Promising verifier-grade UI in formspec-web today would be promising work the substrate has not delivered. The Phase-2 commitment-slot-only model is honest about what it can prove.
5. **Verifier bet is preserved, not killed.** The CLAUDE.md positioning bet remains intact — it becomes a post-MVP milestone. The MVP gets formspec-web to a deployable, demonstrable state that lets the verifier work proceed against a real consumer rather than in isolation.

## Consequences

- `CLAUDE.md` references to the Verifier positioning bet are annotated as **post-MVP** so contributors understand the intentional sequencing.
- `PLANNING.md` is restructured into two phases: **MVP** (the rows above) and **post-MVP** (everything else). The post-MVP rows carry explicit `blocked on:` annotations naming the upstream dependency (e.g., "blocked on Trellis Phase-3 BBS+", "blocked on `respondent-ledger-spec.md` decline event extension").
- The Trust Center (J-006) post-MVP placement is documented separately in web ADR-0002 (Trust Center placement) when written.
- Reviewers and contributors must resist scope-creep into substrate work during MVP. Any PR adding signature-method binding, verifier mechanics, or selective-disclosure UI is rejected during MVP phase with reference to this ADR.

### Shipped today, deferred for scope (not blocked on substrate)

Cross-stack inventory (2026-05-22) confirmed several substrate-adjacent primitives that already ship and could be consumed sooner if MVP scope expanded. These are deferred for **scope** (size of work + UX design), not for **substrate readiness**:

- **Browser COSE_Sign1 verifier** — `@integrity-stack/signature-adapter-webcrypto`, `@integrity-stack/cose`, plus Formspec wrappers `@formspec/signature-{port,cose,adapter-webcrypto}`. Production-grade: ed25519 / P-256 / RSA-PSS, kid binding (fs-skj0), method-URI binding ([ADR-0109](../../../thoughts/adr/0109-cose-protected-header-map3.md)), three-way outcome taxonomy, sanitized reasons. The post-MVP FW-0003 verifier consumes these directly; no new substrate work needed for Phase-1.
- **`@formspec-org/assist`** (BUSL-1.1) — 14-tool MCP-compatible surface, WebMCP shim, ProfileMatcher. Closes FW-0045 and FW-0062 substrate side. The BUSL-1.1 license is a flag: it collides with the permissive license preference for formspec-web (FW-0018 needs to factor this in).
- **`<FormspecScreener>`** in `@formspec-org/react` — closes FW-0046 substrate side; ships fully.
- **`stack-common-proof::ProofRelyingPartyResult`** — four-dimensional verifier verdict (`{cryptographic_integrity, projection_integrity, domain_admissibility, relying_party_result, blocking_reasons}`) is the rendering vocabulary the post-MVP verifier UI consumes. No new spec work; verdict shape already typed.

These shipped-but-deferred items are tracked in the upstream extension queue under "Shipped but deferred for MVP scope" — they are not new gaps.
