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
**FW rows blocked:** FW-0028, FW-0030, FW-0063 (multi-IdP filtering path only; any single-adapter composition works without this annotation)
**Shape:** `metadata.assurance: { ial?: enum, aal?: enum, jurisdiction?: string }`. Should mirror `respondent-ledger-spec.md` §6.6.1 four-level `assuranceLevel` taxonomy (`L1 | L2 | L3 | L4`) for consistency across spec surfaces.
**Fixture status:** none. Verification step is a prerequisite: confirm `definition.schema.json` doesn't already have an assurance annotation in some form. Dispatch `formspec-specs:spec-expert` before authoring.
**Status:** verification pending.

### EXT-8a: Align IdentityClaim TS shape with `wos-events::IdentityAttestation` (ADR-0140)

**Owning repo:** formspec-web (consumer side); upstream source is `work-spec/crates/wos-events/`
**Closes:** alignment between web ADR-0007's `IdentityClaim` and stack-root [ADR-0140 (identity-attestation shape)](../../../thoughts/adr/0140-identity-attestation-shape.md) (the cross-stack identity-attestation record with NIST IAL / AAL / FAL axes)
**FW rows blocked:** none directly; aligning the TS shape now prevents drift when PLN-0384 (wos-events identity schema) closes.
**Shape:** extend `IdentityClaim` (web ADR-0007 §Decision) with a `nistAssurance: { ial?, aal?, fal? }` block. Mirror `wos-events::IdentityAttestationInput` field-for-field. The current `respondent-ledger-spec.md` §6.6 L1–L4 taxonomy remains the formspec-side fallback for MVP; the NIST-axis block is the cross-stack alignment.
**Fixture status:** none. Awaiting `wos-events` PLN-0384 close; until then, the alignment shape is provisional.
**Status:** awaiting upstream.

### EXT-14: Client-side UUIDv7 idempotency-key convention for `SubmitTransport`

**Owning repo:** formspec-web (consumer); upstream contract is `stack-common/crates/stack-common-idempotency/`
**Closes:** the client-side idempotency-key generation contract `SubmitTransport` adapters must honor (per web ADR-0009: "idempotent on retry — client-supplied UUIDv7"). Without explicit conventions, two adapters may generate incompatible key formats / scoping and server-side dedup via `stack-common-idempotency` HTTP replay store will fail or misfire.
**FW rows blocked:** FW-0001 (thin-slice submit retry semantics) — implementation can proceed without it but adapter conformance suite needs the convention to test against
**Shape:** small documentation entry + a one-file TS util (`src/shared/idempotency-key.ts`) generating UUIDv7 client-side via the `uuid` npm package (v9+ has v7 support) or a tiny standalone polyfill. Adapter conformance contract: same key on retry; different key per fresh submit; key passed via the header convention `stack-common-idempotency` expects (verify header name with stack-common-idempotency source).
**Fixture status:** none. Land alongside the `SubmitTransport` conformance suite (per ADR-0009 conformance-suite minimum bar).
**Status:** not yet filed.

### EXT-13: TS parser for `stack-common-typeid` URN format

**Owning repo:** formspec-web (consumer); upstream source is `stack-common/crates/stack-common-typeid/`
**Closes:** parsing + display of `{tenant}_{family}_{uuidv7_base32}` URN format for case IDs and other respondent-visible identifiers (e.g., FW-0021 post-submit status page showing "Case `default_case_01J...`")
**FW rows blocked:** FW-0039 (post-submit status — URN parsing + display); FW-0001 (reference number display if the format flows through)
**Shape:** small TS parser (~50 lines) mirroring stack-common-typeid grammar + reserved family prefixes (`case`, `process`, `prov`, `gov`, `ai`, `assurance`) + `urn:wos:` helper. Validates UUIDv7 tail per TypeID spec.
**Fixture status:** none. Conformance fixtures should mirror stack-common-typeid's Rust test corpus when one exists.
**Status:** not yet filed.

### EXT-12: TS mirror for `stack-common-error::StackError` / Problem JSON envelope

**Owning repo:** formspec-web (consumer); upstream source is `stack-common/crates/stack-common-error/`
**Closes:** typed-error envelope consumption in formspec-web's error chrome (FW-0013 plain-language errors + typed problem detail). Without a TS mirror, the error-rendering layer either hand-parses JSON or shapes its own envelope — both regress against the cross-stack contract.
**FW rows blocked:** FW-0013
**Shape:** TS type mirroring `StackError` field set (`code`, `status`, `title`, `detail?`, `type_url`, `instance?`, `context`). Two implementation options: (a) schema-derived codegen from `stack-common-error`'s utoipa OpenAPI output (preferred — stack-common-error already has `utoipa` + `schemars` deps; verify whether the projection is exposed); (b) hand-mirror with conformance fixtures pinning the field set against the Rust struct.
**Fixture status:** none. Land alongside FW-0013 build; one round-trip fixture per `ErrorCode` variant is a reasonable minimum.
**Status:** not yet filed.

### EXT-11: TS mirror for `stack-common-proof::ProofReportVerdict`

**Owning repo:** formspec-web (consumer side); upstream source is `stack-common/crates/stack-common-proof/`
**Closes:** the cross-language gap between the Rust `ProofReportVerdict` struct (`{cryptographic_integrity, projection_integrity, domain_admissibility, relying_party_result, blocking_reasons}`) and the post-MVP TypeScript `Verifier` port (per web ADR-0009 §"Not in the constitutional inventory" (b))
**FW rows blocked:** FW-0003 (verifier UI renders the verdict)
**Shape:** TS type mirroring the Rust struct, plus at least one fixture vector pinning the field set. Two options: (a) schema-derived codegen (preferred if `stack-common-proof` exposes a JSON Schema or OpenAPI projection); (b) hand-mirror with conformance fixtures keeping the two in sync.
**Fixture status:** none. Resolution sequenced with FW-0003 implementation; without it, the post-MVP verifier port spec is incomplete.
**Status:** not yet filed.

### EXT-10: Receipt-domain prose update (drift fix)

**Owning repo:** formspec
**File:** `formspec/specs/registry/signature-method-registry.md:99`
**Closes:** prose / Rust drift; not a journey, but blocks any verifier-grade work that cross-references the domain string.
**Shape:** spec says `formspec.verification.receipt.v1`; Rust at `integrity-stack/crates/integrity-signature/src/lib.rs:155` says `integrity.verification.receipt.v1`. Per trellis ADR-0004, Rust wins. Update the prose. Add a fixture vector locking the actual domain string.
**Fixture status:** none. Cheap fixture — one byte-level vector pinning the domain.
**Status:** not yet filed.

> **EXT-9 (WOS `LoginKind` magic-link extension) — REMOVED 2026-05-22.** Per [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) the architecture is the `IdentityProvider` port; how a given composition reaches an upstream service (proxy, direct, or otherwise) is per-composition (see [web ADR-0008](../adr/0008-reference-deployment-composition.md) for the formspec-stack composition). WOS continues to see only its existing `LoginKind` shapes per the WOS spec; no WOS spec amendment needed.

---

## Class 2 — New sidecars (formspec)

> **SC-1 (Notification Template Sidecar) — REMOVED 2026-05-22.** The notification-template surface already ships at `work-spec/schemas/sidecars/wos-delivery.schema.json#/$defs/NotificationsBlock`, absorbed into the WOS delivery sidecar per WOS ADR-0076 D-3. FW-0032 (J-036 pre-click trust) consumes a notifications block via the `NotificationDelivery` port — how a given composition reaches that block is a per-composition decision (see [web ADR-0008](../adr/0008-reference-deployment-composition.md) for the formspec-stack composition). The remaining formspec-web work is the pre-click verifier rendering surface, a UI build over the existing substrate, not a new spec.

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
**Shape:** extends `formspec/specs/registry/signature-method-registry.md` with normative bindings: `urn:formspec:presentation-method:openid4vp@1` (W3C VC Data Model 2.0 + OpenID4VP), `urn:formspec:sig-method:webauthn-passkey-cose-sign1@1` (WebAuthn + COSE Sign1 with per-act challenge equal to canonical signed-bytes preimage). Adopts external standards verbatim. **Selective disclosure is SD-JWT-first per stack-root [ADR-0116](../../../thoughts/adr/0116-selective-disclosure-sd-jwt-default-and-bbs-profile.md)** — SD-JWT is the default path, tractable today with `sd-jwt-rs` / `@sd-jwt/core`-class libraries; BBS+ is profile-gated and dormant per ADR-0116. The earlier "Phase-3 BBS+ / ECDSA-SD" framing in ADR-0005 was wrong. Anonymous mode (J-031) interim is contractual escrow only when the SD-JWT route doesn't satisfy the unlinkability requirement.
**Fixture status:** none. Post-MVP per web ADR-0005; tracked here for visibility.
**Status:** not yet filed.

### SC-5: WYSIWYS Ceremony UI Annex (narrowed)

**Owning repo:** formspec
**Closes:** J-008 (sign here — but first show me exactly what I'm signing)
**FW rows blocked:** FW-0008
**Shape:** **narrowed 2026-05-22.** The signed-bytes preimage discipline already exists upstream: stack-root [ADR-0083](../../../thoughts/adr/0083-authored-signatures-document-hash.md) defines `authoredSignatures[*].documentHash`; [ADR-0136](../../../thoughts/adr/0136-signature-artifact-dependency-inversion.md) defines `SignatureArtifact` / `ValidationArtifact` / `DocumentArtifact` / `SignatureSurface` as center types; [ADR-0141](../../../thoughts/adr/0141-rendering-service-architecture.md) defines the rendering-service port (Chromium-based headless renderer is the seed) that produces the bytes the signer commits to. The remaining gap is a small UI-requirements annex over those center contracts: per-field affirmative-action requirement (covers AP-002), prohibition of single-click adopt-and-sign (AP-011), scroll-to-end gate, signature-surface naming. Authored as an annex to `formspec/specs/registry/signature-method-registry.md` or a small new file under `formspec/specs/registry/`.
**Fixture status:** none (the byte-level discipline already has fixture coverage upstream; new annex needs fixture cases for the UI requirements).
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
- web ADR-0006 — Issuer Sidecar (worked example of an entry that landed; engine ships IssuerStore + React `<Issuer>` per cross-stack inventory 2026-05-22)
- web ADR-0007 — `IdentityProvider` port spec (consumes EXT-8 form-side assurance annotation when verified; aligned with stack-root ADR-0140 via EXT-8a)
- web ADR-0008 — Reference deployment composition (one worked example of the formspec-stack adapter wiring)
- web ADR-0009 — Hexagonal architecture (constitutional; ports + adapters + conformance discipline)
- `JOURNEYS.md` — source of the journey IDs cited per entry
- `PLANNING.md` — source of the FW row IDs cited per entry

## Operational notes

- **Reference-map regen needed.** `validation-mapping.md` + `validation-mapping.schema.json` landed 2026-05-22 and `experience-spec.md` landed 2026-05-21. Neither is yet in `.claude-plugin/skills/formspec-specs/references/`. Until regenerated (`make` target in `.claude-plugin/skills/formspec-specs/`), the `formspec-specs:spec-expert` agent may give incomplete answers about submit-gate semantics and step/unit organization. Action lives in formspec/ — flag for the next stack-side maintenance pass.

- **stack-common needs a TS package family.** stack-common ships Rust crates only (`stack-common/crates/`) — no `stack-common/packages/` for TS wire-shape mirrors. The integrity-stack precedent (which ships both `crates/` and `packages/` like `@integrity-stack/cose`, `@integrity-stack/signature-port`) is the model. Without TS mirrors, every TS client of stack-common's wire shapes (formspec-web, formspec-cloud, formspec-studio, formspec-react) hand-mirrors independently with drift risk. Queue entries EXT-11 / EXT-12 / EXT-13 / EXT-14 are formspec-web's per-need mirrors; they should be consolidated when stack-common adopts the integrity-stack pattern. **Not formspec-web's to own** — flag for stack-level architecture conversation.
