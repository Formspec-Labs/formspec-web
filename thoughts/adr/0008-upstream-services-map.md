# ADR-0008 — Upstream services map: formspec-server primary, WOS secondary

**Date:** 2026-05-22
**Status:** accepted
**Builds on:** web ADR-0005, web ADR-0007

## Context

MVP scope (web ADR-0005) ships submit + login + a11y. ADR-0007 names the identity adapter shape but is silent on which upstream services formspec-web actually calls. Cross-stack inventory (2026-05-22) surfaced `formspec-server` as a sibling backend repo with crates that map directly to MVP and post-MVP HTTP boundaries:

| Crate | What it owns |
|---|---|
| `formspec-server-email` | Email delivery (magic-link send, notifications) |
| `formspec-server-ports` | Port traits the formspec-web shell calls against (auth, signature, idempotency, outbox, proof) |
| `formspec-server-verifier-integrity` | Server-side proof projection (per stack-root ADR-0107) for heavy bundle verifications |
| `formspec-server-substrate-trellis` | Trellis integration for signed envelopes |
| `formspec-server-pdf` | PDF rendering (per stack-root ADR-0141 rendering service) |
| `formspec-server-object-s3`, `-postgres`, `-worker-pg`, `-common`, `-auth-jwt` | Infrastructure |

ADR-0007 mentioned WOS proxy. WOS / workspec-server is the secondary backend for applicant-status reads (per `work-spec/specs/api/applicant.md`). The split needs to be normative so the MVP build sequence is unambiguous: where does the form submit go? where does magic-link email send come from? where does the post-submit status read come from?

## Decision

formspec-web's HTTP boundary lands at **two upstream services**.

### formspec-server (primary)

Every MVP backend interaction:

- **Form definition fetch** (or static-bundled per deployment).
- **Draft persistence** (cross-session / cross-device resume per FW-0001 / J-002).
- **Submit** — produces an `IntakeHandoff` per `formspec/schemas/intake-handoff.schema.json`, `initiationMode: "publicIntake"`. Lands the response in the ledger, returns the reference number.
- **Validation report** on submit.
- **Magic-link send** (per web ADR-0007, via `formspec-server-email`).
- **OIDC callback handling** (server-side token exchange so client never holds raw IdP tokens).
- **Issuer document fetch** (via formspec-server's caching layer — avoids browser-side CORS issues with arbitrary issuer URLs).

Post-MVP:

- **Signature ceremony** + signed receipts (`formspec-server-substrate-trellis`).
- **PDF rendering** for trail-sign cover (FW-0006), signed receipt paper (FW-0009), deletion receipt (FW-0043) — via `formspec-server-pdf`, per stack-root [ADR-0141](../../../thoughts/adr/0141-rendering-service-architecture.md).
- **Verifier projection** — heavy bundle verifications offloaded to `formspec-server-verifier-integrity` per stack-root ADR-0107. Browser-side `@integrity-stack/signature-adapter-webcrypto` handles the lightweight COSE_Sign1 path; large bundles route to the server projector.

### WOS / workspec-server (secondary, post-MVP)

Applicant-status reads only:

- `GET /api/v1/applicant/cases/{id}` (FW-0039 / J-021 post-submit status)
- `GET /api/v1/applicant/notifications`
- `GET /api/v1/applicant/cases` (list)

**These reads proxy through formspec-server**, not directly browser-to-WOS. The proxy enforces:
- formspec-web's session (magic-link or OIDC) translates server-side into the OIDC-compatible token WOS's existing `LoginKind` enum already accepts.
- No WOS spec amendment is needed (EXT-9 is removed).
- Cross-tenant boundary enforcement per stack-root ADR-0068 D-1 + D-3 stays at WOS — formspec-server proxies one tenant at a time.

## Rationale

1. **`formspec-server` already owns the form-side backend.** The `SAAS-UI-HANDOFF.md`, `ARCH.md`, and the crate cluster name it as the form-side backend explicitly. Inventing a separate backend for formspec-web would duplicate `formspec-server-email`, `formspec-server-ports`, `formspec-server-substrate-trellis`. Per web ADR-0004 (consume, don't invent).
2. **WOS proxy is the right split for respondent-side reads.** ADR-0007's proxy pattern keeps formspec-web's auth methods (magic-link, OIDC) from leaking into WOS's `LoginKind` contract. The proxy ALSO scopes formspec-web's WOS surface to the read endpoints — no respondent-side write path against WOS in MVP.
3. **PDF and heavy verification offload.** Stack-root [ADR-0141 (rendering service architecture)](../../../thoughts/adr/0141-rendering-service-architecture.md) names a rendering-service port with center-declared I/O. Chromium-based headless renderer is the seed; formspec-web does not invent a UI-side PDF renderer. Per stack-root [ADR-0131 (verifier distribution)](../../../thoughts/adr/0131-verifier-distribution.md), browser is one of four verification modes — heavy bundles legitimately offload server-side.
4. **Authorization engine choice.** Stack-root [ADR-0117 (authorization engine selection)](../../../thoughts/adr/0117-authorization-engine-selection.md) names OpenFGA as the seed adapter for the auth port. `formspec-server-ports`' auth port is what formspec-web's session calls against; formspec-web does not implement Zanzibar checks directly.
5. **Frontend surface architecture.** Per stack-root [ADR-0128 (frontend surface architecture)](../../../thoughts/adr/0128-frontend-surface-architecture.md), formspec-web is one of multiple frontend surfaces (Studio, Caseworker, Admin live elsewhere). The upstream-services split here is consistent with the three-app model — formspec-web is the public form-shell, and its backend boundary is formspec-server.

## Consequences

- formspec-web has TWO HTTP base URLs at deploy time: `FORMSPEC_SERVER_URL` (primary), `WORKSPEC_SERVER_URL` (secondary, post-MVP). Reference dev deployment co-locates them.
- The submit boundary is the `IntakeHandoff` schema (`formspec/schemas/intake-handoff.schema.json`). FW-0001 cites this as its submit contract.
- The Issuer fetch path goes through formspec-server's cache (configurable in the engine's `IssuerStore.FetchIssuerFetcher`) — avoids browser-side CORS issues and the browser's lack of integrity validation on arbitrary issuer URLs.
- Magic-link delivery is via `formspec-server-email`'s reference adapter. Production deployments swap the email backend per `formspec-server`'s adapter shape (Twilio / SES / SendGrid / etc.), not per formspec-web's.
- The four-dimensional verifier verdict from `stack-common-proof::ProofRelyingPartyResult` (`{cryptographic_integrity, projection_integrity, domain_admissibility, relying_party_result, blocking_reasons}`) is what formspec-web renders for FW-0003 (post-MVP).
- PDF rendering for FW-0006 / FW-0009 / FW-0043 all go through `formspec-server-pdf` per stack-root ADR-0141.
- formspec-web does NOT have a direct database. It is a browser shell + (optional) thin BFF talking to formspec-server + (post-MVP) WOS through the proxy.
- The MVP build sequence is unambiguous: FW-0001 (thin-slice) is wired to `formspec-server`; FW-0063 (identity) consumes `formspec-server-email` for magic-link send and `formspec-server-ports` auth port; FW-0039 (post-submit status) is wired to the WOS proxy at formspec-server.

## Related decisions

- web ADR-0004 — placement lens (formspec-server is the consumed backend, not a new primitive)
- web ADR-0005 — MVP scope (defers signature / verifier; formspec-server-substrate-trellis lands then)
- web ADR-0007 — identity adapter (consumes `formspec-server-email` + `formspec-server-ports` auth port)
- stack-root [ADR-0117](../../../thoughts/adr/0117-authorization-engine-selection.md) — authorization engine selection (OpenFGA)
- stack-root [ADR-0128](../../../thoughts/adr/0128-frontend-surface-architecture.md) — frontend surface architecture (three-app model; formspec-web is the public form-shell)
- stack-root [ADR-0131](../../../thoughts/adr/0131-verifier-distribution.md) — verifier distribution (browser is one of four modes; offload is legitimate)
- stack-root [ADR-0141](../../../thoughts/adr/0141-rendering-service-architecture.md) — rendering service architecture (PDF via port, not invented)
