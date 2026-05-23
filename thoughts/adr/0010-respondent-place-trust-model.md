# ADR-0010 — Respondent place trust model and DI consumption

**Date:** 2026-05-23
**Status:** accepted
**Subordinate to:** web ADR-0004, web ADR-0009
**Closes design row:** FW-0047
**Unblocks upstream primitive:** SC-3 Respondent Library Sidecar

## Context

FW-0047 asks for an ADR-grade design output for the respondent-side place: obligations, documents, and history across issuers. The upstream extension queue also said SC-3 (the Respondent Library Sidecar) blocked FW-0047 while FW-0047 had to produce the trust model before SC-3 could be authored. That was a circular gate.

The correct sequence is:

1. formspec-web records the trust model and consumer boundary here.
2. `formspec/specs/respondent-library/library-spec.md` and `formspec/schemas/respondent-library.schema.json` define the portable primitive.
3. formspec-web consumes that primitive through DI ports, stubs, and reference adapters.

## Decision

formspec-web treats the respondent-side place as a **consumer surface**, not a primitive owner.

The respondent library primitive belongs in `formspec`. The web app may render obligations, documents, submissions, and applicant-status projections, but its code MUST NOT define a competing document-kind taxonomy, selective-presentation policy, status vocabulary, or cross-issuer aggregation model.

### Trust model

- The library is respondent-held. It may be backed by browser storage, an OS wallet, an encrypted sync service, or a portable export.
- Cross-issuer aggregation is client-side only. A server may store encrypted material for the respondent, but it MUST NOT readably aggregate obligations, documents, or history across tenants or issuers.
- Production storage is client-encrypted. The intended production path is passkey-derived key material with integrity-stack HPKE primitives.
- Presentation is deny-by-default / explicit-consent. OpenID4VP and W3C VC Data Model 2.0 are protocol/data-model profiles, not implicit grants.
- Applicant status remains WOS-owned. formspec-web `StatusReader` consumes WOS applicant API resource shapes; the respondent library may reference or cache a projection, but it does not redefine its vocabulary.

### DI shape

formspec-web adds respondent-place ports only where consumer code lands:

- `RespondentPlaceSource` reads respondent-held obligations, document metadata, submission history, presentation policies, and applicant-status projections.
- `StatusReader` reads WOS applicant API shaped status for a submitted item.

Both ports follow web ADR-0009: typed interfaces, stub adapters, conformance suites, composition-root wiring, and no direct adapter imports from app code. Stub adapters are allowed for demo and development; production adapters remain explicit deployment choices.

### Token bag

The multi-tenant token bag lives at the wallet / respondent-place boundary, not as global server state. A formspec-web composition may keep per-issuer access handles in memory or client storage as an adapter detail, but no tenant can store cross-tenant mute, batch, escalate, or preference state for the respondent. Those preferences belong to the client-held respondent place.

## Consequences

- FW-0047 is complete when this ADR lands and the upstream sidecar spec consumes its trust-model output.
- FW-0055, FW-0056, and FW-0057 may proceed only through the sidecar-backed DI ports.
- FW-0039 proceeds through `StatusReader`, whose returned data conforms to the WOS applicant API contract; any respondent-library status field must be a projection reference/cache, not a second status contract.
- FW-0033 upload capture remains decoupled. "Save to my library" is sidecar-backed; local upload preview, redaction, and labeling can compose the existing attachment primitive.
- Reviewers should reject web-only respondent library semantics even if backed by stubs.

## Related decisions

- web ADR-0004 — consume primitives, do not invent them
- web ADR-0008 — reference deployment composition
- web ADR-0009 — hexagonal architecture, ports, adapters, and conformance suites
- stack-root ADR-0068 — tenant and scope composition
- formspec Respondent Library Sidecar — `formspec/specs/respondent-library/library-spec.md`
