# Upstream extension queue

**Date opened:** 2026-05-22
**Status:** living — updated as proposals land or shift
**Owner:** formspec-web; entries derive from the cross-stack scout walk over `JOURNEYS.md` + `PLANNING.md`
**Authority:** web ADR-0004 (consume primitives, do not invent) is the governing policy

## What this is

formspec-web depends on a set of upstream spec extensions, new sidecars, and cross-stack ADRs in other repos. This file is the **catalog of those dependencies** — what is needed, where it lands, what journey or PLANNING row it unblocks, and current status.

Entries fall into three classes:

1. **Spec extensions** — small additive changes to existing schemas / specs.
2. **New sidecars** — net-new spec documents (analogous to the Issuer Sidecar, web ADR-0006).
3. **Cross-stack ADRs** — decisions spanning more than one submodule.

Per `formspec/CLAUDE.md` (the spec source-of-truth pipeline: ADR → spec → schema → feature → tools → runtimes), every entry carries a **Fixture status** field: `none` (no fixture work proposed yet), `planned` (named fixture cases authored in the proposing ADR/spec), `landed` (fixtures shipped in `formspec/tests/fixtures/` or sibling repo's test corpus). Without fixture discipline the queue is a wish list.

Entries are removed when the upstream work ships and formspec-web consumes it. Stale entries are pruned during planning cycles.

---

## Class 1 — Spec extensions

### EXT-1: Item-metadata sibling blocks on Definition

**Owning repo:** formspec
**File:** `formspec/schemas/definition.schema.json`
**Closes:** J-015 (irreversibility / consequences), J-017 (purpose + citation), J-028 (cross-agency referral), J-037 (safe-address protectability)
**FW rows blocked:** FW-0007, FW-0021, FW-0029, FW-0049
**Shape:** three sibling blocks on items — `consequences`, `purpose`, `privacy`. Not collapsed into one mega-block because different consumers read different blocks (privacy → renderer + verifier; consequences → submit-gate + ledger; purpose → inline disclosure surface). Authored as one ADR + one schema change.
**No name collision with existing `disabledDisplay`:** the `privacy` block adds `protectable: bool` (adjective declaring "this field IS protectable") and `class` enum (`"safe-address" | "contact" | "employer" | ...`). The existing `disabledDisplay` enum (lines 945–952 of `definition.schema.json`) — whose values are `"hidden" | "protected"` — remains untouched. `protectable` (adjective property) and `protected` (existing enum value) coexist; no rename needed.
**Fixture status:** none. Land with fixtures in `formspec/tests/fixtures/items/{consequences,purpose,privacy}/`.
**Status:** not yet filed.

### EXT-2: Response metadata envelope

**Owning repo:** formspec
**File:** `formspec/schemas/response.schema.json`
**Closes:** J-010 (narrative-translation provenance), J-011 (per-field AI authorship), J-017 (which disclosure was shown), J-020 (prefill provenance), J-023 (calculated-value derivation)
**FW rows blocked:** FW-0022, FW-0024
**Shape:** sibling blocks keyed by item path — `metadata.provenance[path]` `{class, sourceRef, capturedAt, attestedBy}`, `metadata.derivations[path]` (FEL trace via existing `evalFELWithTrace` at `formspec/packages/formspec-engine/src/fel/fel-api-runtime.ts:99`), `metadata.disclosuresShown[path]`. Opt-in at form level. Reuse `ChangeSetEntry.valueClass` enum from `respondent-ledger-event.schema.json` (property defined at line 320; enum begins at line 322) — promote to a shared `common.schema.json` def.
**Fixture status:** none. Land with fixtures in `formspec/tests/fixtures/response/{provenance,derivations,disclosures-shown}/`.
**Status:** not yet filed.

### EXT-3: Capacity + party-role on AuthoredSignature

**Owning repo:** formspec (+ binding to PKAF for authority chains)
**File:** `formspec/schemas/response.schema.json`
**Closes:** J-012 (filer-not-signer); foundation for J-041 (multi-party).
**FW rows blocked:** FW-0037, FW-0058
**Shape:** extend `AuthoredSignature` with `capacity` block (enum: `self | poa | guardian | executor | parent | licensed-professional | corporate-officer | ai-agent`), `principalRef` (urn party id, reuse `intake-handoff.schema.json:180` `urn:party:` convention), `authorityArtifact` (URI + hash + type). AI-agent variant gets a separate `agentChain` block — defer per FW-0058 split.
**Fixture status:** none. Land with capacity + authority-artifact fixture matrix.
**Status:** not yet filed.

### EXT-4: Engine API extensions for relevance + derivation introspection

**Owning repo:** formspec
**File:** `formspec/packages/formspec-engine/src/interfaces.ts`
**Closes:** J-003 (showing because…), J-023 (show the math), J-015 (forward-projected consequences)
**FW rows blocked:** FW-0011, FW-0024
**Shape:** new methods on the existing `IFormEngine` interface (not `EngineRuntime` — there is no such interface) — `whyRelevant(path): { bindId, expression, dependsOn[], evaluatedAs }`, `getDerivationTree(path): FelTraceStep[]` (caches the trace from `evalFELWithTrace` at `fel-api-runtime.ts:99`), `getDownstreamImpact(path): string[]`. Underlying dependency graph already exists in `formspec/packages/formspec-engine/src/reactivity/` — the gap is the public introspection API.
**Fixture status:** none. Land with engine-API conformance fixtures + Vitest unit tests.
**Status:** not yet filed.

### EXT-5: Respondent-ledger event taxonomy expansion

**Owning repo:** formspec
**File:** `formspec/schemas/respondent-ledger-event.schema.json` + `formspec/specs/audit/respondent-ledger-spec.md` §8.2 (the "optional events" section in the spec; the schema itself has no section markers)
**Closes:** J-016 (withdraw / dispute / consent revoke), J-026 (decline as a first-class event), J-027 (duress signal), J-030 (deletion receipt), J-033 (bot protection cleared), J-017 (disclosure presented)
**FW rows blocked:** FW-0007, FW-0026, FW-0036, FW-0038, FW-0043, FW-0048, FW-0049
**Events to add:** `response.declined` (with optional `clauseReferences[]`, `reason`), `response.withdrawn`, `response.dispute-attached`, `consent.revoked`, `submission.duress-signaled` (with private-sidecar discipline per `trellis-operational-companion.md` §13 Disclosure Manifest), `data.erased`, `disclosure.presented`, `field.flagged-by-respondent`, `bot-protection-cleared`. File as one combined PR.
**Fixture status:** none. Land each event-type with at least one fixture in `formspec/tests/fixtures/ledger/`.
**Status:** not yet filed.

### EXT-6: Definition metadata.register for hardship / tone suppression

**Owning repo:** formspec
**File:** `formspec/schemas/definition.schema.json`
**Closes:** J-025 (don't perform cheerfulness on hardship forms)
**FW rows blocked:** FW-0025
**Shape:** `metadata.register` enum (`neutral | hardship | celebratory`) + `metadata.context` `{kind, displayName, ofParty}`. Placement is **Definition**, not Theme — register is authorial meaning, must propagate through paper-render + verifier + every renderer, not be a theme-skin choice.
**Fixture status:** none. Land with register-propagation fixtures across paper-render + verifier.
**Status:** not yet filed.

### EXT-7: Definition metadata.preparation + fees (FEL-calculated)

**Owning repo:** formspec
**File:** `formspec/schemas/definition.schema.json`
**Closes:** J-024 (trail-sign cover — preparation + cost)
**FW rows blocked:** FW-0006
**Shape:** `metadata.preparation: { documents[], expectedAcquisitionWindows{} }` + `fees: { lineItems[] }` where line items use FEL `calculate` expressions so cost updates live as answers change. Reuses existing Bind `calculate` machinery — no new evaluator work.
**Fixture status:** none. Land with FEL-fees calculation fixtures.
**Status:** not yet filed.

### EXT-8: Definition assurance-level annotation

**Owning repo:** formspec
**File:** `formspec/schemas/definition.schema.json`
**Closes:** form-side declaration of required IAL / AAL (web ADR-0007 dependency)
**FW rows blocked:** FW-0028, FW-0030, FW-0063 (multi-IdP filtering path only; the magic-link default works without this)
**Shape:** `metadata.assurance: { ial?: enum, aal?: enum, jurisdiction?: string }`. Should mirror `respondent-ledger-spec.md` §6.6.1 four-level `assuranceLevel` taxonomy (`L1 | L2 | L3 | L4`) for consistency across spec surfaces.
**Fixture status:** none. Verification step is a prerequisite: confirm `definition.schema.json` doesn't already have an assurance annotation in some form. Dispatch `formspec-specs:spec-expert` before authoring.
**Status:** verification pending.

### EXT-10: Receipt-domain prose update (drift fix)

**Owning repo:** formspec
**File:** `formspec/specs/registry/signature-method-registry.md:99`
**Closes:** prose / Rust drift; not a journey, but blocks any verifier-grade work that cross-references the domain string.
**Shape:** spec says `formspec.verification.receipt.v1`; Rust at `integrity-stack/crates/integrity-signature/src/lib.rs:155` says `integrity.verification.receipt.v1`. Per trellis ADR-0004, Rust wins. Update the prose. Add a fixture vector locking the actual domain string.
**Fixture status:** none. Cheap fixture — one byte-level vector pinning the domain.
**Status:** not yet filed.

> **EXT-9 (WOS `LoginKind` magic-link extension) — REMOVED 2026-05-22.** Superseded by the proxy pattern in web ADR-0007 §"Reaching upstream services." formspec-web acts as an authenticated proxy to WOS; WOS continues to see only its existing `LoginKind` shapes; no WOS spec amendment needed.

---

## Class 2 — New sidecars (formspec)

### SC-1: Notification Template Sidecar

**Owning repo:** formspec
**Closes:** J-036 (pre-click trust — help senders write notifications recipients can verify)
**FW rows blocked:** FW-0032
**Shape:** `formspec/specs/notification/notification-spec.md` + `notification-template.schema.json`. Defines form-author-declared notification template: case-ref placeholder, sender-domain claim, QR payload format, "verify before clicking" copy. Binds to Definition via `$ref` like References. Renders via a pre-click verifier page at `/verify/notification/<id>` (consumes the same `<formspec-verifier>` widget as J-007 — post-MVP, gated on substrate).
**Fixture status:** none. ADR proposal in formspec/ needed before schema.
**Status:** not yet filed.

### SC-2: Deletion Receipt Sidecar

**Owning repo:** formspec
**Closes:** J-030 (abandon-and-erase with deletion receipt)
**FW rows blocked:** FW-0043
**Shape:** new `formspec/schemas/deletion-receipt.schema.json` (parallel to `verification-receipt.schema.json`) + new spec `formspec/specs/audit/deletion-receipt-spec.md`. Signer = issuer; payload = `{deletedDraftId, deletedAt, classesErased[], retentionWaived[], cryptographicMethod}`. Also adds `data.erased` event to respondent-ledger (covered in EXT-5).
**Prior-art pass required:** W3C / OASIS / GDPR-jurisprudence deletion-attestation work (per stack `CLAUDE.md` HIGH-PRIORITY).
**Fixture status:** none. Prior-art pass is a prerequisite.
**Status:** not yet filed.

### SC-3: Respondent Library Sidecar

**Owning repo:** formspec
**Closes:** J-039 (cross-sender obligations), J-042 (cross-form document library), J-043 (cross-issuer history)
**FW rows blocked:** FW-0047 (design row — the trio), FW-0055, FW-0056, FW-0057
**Shape:** `formspec/specs/respondent-library/library-spec.md` + `respondent-library.schema.json`. Document-kind taxonomy (passport, license, W-2, lease, medical record, professional credential). Per-presentation policy (`full / redacted / derived-claim-only`). Library export / portability format. Trust model (respondent-controlled — platform hosts on user's behalf, cannot read without authentication; client-side encryption with passkey-derived key via integrity-stack HPKE).
**Adopts:** W3C Verifiable Credentials Data Model 2.0; OpenID4VP for verifiable presentation.
**Hard constraint:** **must not** be invented inside formspec-web — would create a UI-side primitive other consumers cannot reach. Cross-tenant aggregation is structurally forbidden server-side per stack-root ADR-0068 D-1 + D-3 (tenant boundary at runtime + per-tenant identity attestation); aggregation must be client-side, in the wallet.
**Fixture status:** none. FW-0047 ADR-grade design row in formspec-web must produce a trust-model output before the sidecar can be authored.
**Status:** not yet filed.

### SC-4: Verifiable Presentation Profile / Identity Binding Profile

**Owning repo:** formspec
**Closes:** J-013 (don't re-prove identity — wallet path), J-031 (professional / pseudonymous signing — cryptographic side), J-035 (passkey-bound signing)
**FW rows blocked:** FW-0020, FW-0030, FW-0031, FW-0035
**Shape:** extends `formspec/specs/registry/signature-method-registry.md` with normative bindings: `urn:formspec:presentation-method:openid4vp@1` (W3C VC Data Model 2.0 + OpenID4VP), `urn:formspec:sig-method:webauthn-passkey-cose-sign1@1` (WebAuthn + COSE Sign1 with per-act challenge equal to canonical signed-bytes preimage). Adopts external standards verbatim. Anonymous mode (J-031) honest interim is contractual escrow until Trellis Phase-3 BBS+ / ECDSA-SD lands per `trellis-operational-companion.md` OC-31.
**Fixture status:** none. Post-MVP per web ADR-0005; tracked here for visibility.
**Status:** not yet filed.

### SC-5: WYSIWYS Ceremony Contract (annex to signature-method-registry)

**Owning repo:** formspec
**Closes:** J-008 (sign here — but first show me exactly what I'm signing)
**FW rows blocked:** FW-0008
**Shape:** small new spec section (annex to `formspec/specs/registry/signature-method-registry.md` or new file under `formspec/specs/registry/`) that normatively pins: rendering pipeline producing signed-bytes preimage, requirement that the same bytes be shown to signer pre-commit, per-field affirmative-action requirement (covers AP-002), prohibition of single-click adopt-and-sign (AP-011).
**Fixture status:** none. Post-MVP per web ADR-0005; needed to prevent ceremony drift across renderers.
**Status:** not yet filed.

---

## Class 3 — Cross-stack ADRs

### XS-1: Multi-party intake

**Spans:** formspec (per-party visibility on Definition) + work-spec (per-party state, merge semantics) + trellis (per-party signatures)
**Closes:** J-041 (multi-party forms)
**FW rows blocked:** FW-0050 (design), FW-0061 (build)
**Recommended boundary:** at `intake-handoff` — formspec owns per-party artifact contract, WOS owns per-party session orchestration.
**Shape:** formspec `definition.schema.json` gets `parties` block at form level + per-item `visibleTo[]` / `editableBy[]` / `signedBy[]`. work-spec gets multi-respondent intake workflow pattern. Response gets `partySignatures[]` extension of `authoredSignatures[]` (depends on EXT-3 capacity primitive).
**Fixture status:** none. Cross-stack ADR needed in `formspec-stack/thoughts/adr/`.
**Status:** post-MVP per web ADR-0005.

### XS-2: Respondent-side multi-tenant token bag

**Spans:** formspec-web (UI-side fan-out pattern)
**Closes:** J-039 (cross-sender obligations stream) — the client-side aggregation pattern.
**FW rows blocked:** FW-0055
**Shape:** new ADR in `formspec-web/thoughts/adr/` documenting that cross-tenant aggregation is structurally forbidden server-side (stack-root ADR-0068 D-1 + D-3, jointly: tenant boundary at runtime + per-tenant identity attestation), therefore must be client-side. Names the token-bag storage model, fan-out pattern, per-tenant failure modes, persistence of mute / batch / escalate preferences client-side (since no single tenant can store cross-tenant prefs).
**Fixture status:** n/a (architectural ADR, not a schema change).
**Status:** post-MVP; sequenced after the Respondent Library sidecar (SC-3) decides whether token bag lives in formspec-web session or in the wallet.

---

## How this list shrinks

- **When an extension lands upstream:** strike the entry, note the landing ADR / spec version, and update the consuming formspec-web row to "unblocked." Move fixture-status to `landed` with file pointers.
- **When the shape changes:** edit the entry in place; don't add a v2 line.
- **When a row is rejected upstream:** strike with a `**REJECTED**` annotation and a one-line reason. The consuming journey then needs a different path (re-classify as adopter-side or rescope the journey).
- **When prior-art surfaces a different placement:** edit the entry.

## Cross-references

- web ADR-0004 — placement lens (governs every entry here)
- web ADR-0005 — MVP scope (which entries are post-MVP)
- web ADR-0006 — Issuer Sidecar (worked example of an entry that landed)
- web ADR-0007 — Identity & auth (consumes EXT-8 form-side assurance annotation when verified; supersedes the removed EXT-9 with the proxy pattern)
- `JOURNEYS.md` — source of the journey IDs cited per entry
- `PLANNING.md` — source of the FW row IDs cited per entry
