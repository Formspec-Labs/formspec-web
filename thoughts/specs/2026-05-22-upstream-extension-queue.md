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
**Closes:** J-015 (irreversibility / consequences), J-017 (purpose + citation), J-028 (cross-agency referral). **J-037 reassigned 2026-05-23 to EXT-31 + EXT-32 per FW-0049 design** — the `privacy` block is retired in favor of `accessControl.class` per stack-root ADR-0074.
**FW rows blocked:** FW-0007, FW-0021, FW-0029. **FW-0049 no longer blocks on EXT-1 per the scope reduction** — `accessControl.class` is the canonical safe-address mechanism (EXT-31 registers the safe-* class tokens; EXT-32 supplies the Privacy Profile audience policy).
**Shape:** two sibling blocks on items — `consequences`, `purpose`. **The originally-proposed `privacy` block is retired 2026-05-23** per [FW-0049 design §3.2 + §6.2](2026-05-23-fw-0049-safe-address-handling-design.md): safe-address handling lives on `accessControl.class` per [stack-root ADR-0074](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), not on a parallel `privacy` property. Two schema properties with overlapping semantics drift; one canonical mechanism per ADR-0074 §"Five decisions" line 41–45. The `consequences` and `purpose` blocks are unaffected. Authored as one ADR + one schema change.
**Fixture status:** none. Land with fixtures in `formspec/tests/fixtures/items/{consequences,purpose}/`.
**Status:** not yet filed. Scope reduced 2026-05-23 by FW-0049 design (the `privacy` block is gone; safe-address moves to EXT-31 + EXT-32).

### EXT-2: Response metadata envelope

**Owning repo:** formspec
**File:** `formspec/schemas/response.schema.json`
**Closes:** J-010 (narrative-translation provenance), J-011 (per-field AI authorship), J-017 (which disclosure was shown), J-020 (prefill provenance), J-023 (calculated-value derivation), **J-046 (per-field assistant-suggested authorship lineage per AP-007 Test rule)**.
**FW rows blocked:** FW-0022, FW-0024, **FW-0051 (per-field assistant-suggested provenance per FW-0051 §7.5 AP-007 binding — `attestedBy: respondent, sourceRef: assistant-suggested` shape)**
**Shape:** sibling blocks keyed by item path — `metadata.provenance[path]` `{class, sourceRef, capturedAt, attestedBy}`, `metadata.derivations[path]` (FEL trace via existing `evalFELWithTrace` at `formspec/packages/formspec-engine/src/fel/fel-api-runtime.ts:99`), `metadata.disclosuresShown[path]`. Opt-in at form level. Reuse `ChangeSetEntry.valueClass` enum from `respondent-ledger-event.schema.json` (property defined at line 320; enum begins at line 322) — promote to a shared `common.schema.json` def. **FW-0051 addition (2026-05-23):** the `sourceRef` field SHOULD carry the value `"assistant-suggested"` (or a more specific transport-keyed value like `"assistant-suggested:webmcp"`) when the value was proposed by a BYO-assistant tool invocation and confirmed by the respondent; no aggregate "AI score" is computed or exposed (AP-007 Test rule).
**Fixture status:** none. Land with fixtures in `formspec/tests/fixtures/response/{provenance,derivations,disclosures-shown}/`. **FW-0051 addition (2026-05-23):** include an `assistant-suggested` provenance fixture in `provenance/`.
**Status:** not yet filed. Scope extended 2026-05-23 by FW-0051 design (per-field assistant-suggested provenance carrier; no new EXT row needed).

### EXT-3: Capacity + party-role on AuthoredSignature

**Owning repo:** formspec (+ binding to PKAF for authority chains)
**File:** `formspec/schemas/response.schema.json`
**Closes:** J-012 (filer-not-signer; including the AI-agent slice per FW-0058); foundation for J-041 (multi-party).
**FW rows blocked:** FW-0037, FW-0058, FW-0050/FW-0061 (extended scope below)
**Shape:** extend `AuthoredSignature` with `capacity` block (enum: `self | poa | guardian | executor | parent | licensed-professional | corporate-officer | ai-agent`), `principalRef` (urn party id, reuse `intake-handoff.schema.json:180` `urn:party:` convention), `authorityArtifact` (URI + hash + type). **Multi-party extension:** add `partyRole` field bound to `definition.schema.json.parties[*].roleId` (closed enum `coEqual | asymmetricPrimary | asymmetricSecondary | guardianFor` per FW-0050 §2.1). Land EXT-3 + multi-party `partyRole` + AI-agent `agentChain` together — same `AuthoredSignature` extension surface; three passes is three breaks for one schema.
**`agentChain` shape — closed 2026-05-24 by [FW-0058 design §3.2](2026-05-24-fw-0058-ai-agent-filer-chain-design.md).** Flat ordered `AgentChainEntry[]` array on `AuthoredSignature`; index-0 = signer (the acting agent); terminal entry's `delegatedBy` resolves to the accountable human/entity (NOT to another agent). Walked end-to-start renders the four-party chain (J-012 promise). Conditional schema rule: when `capacity == "ai-agent"`, `agentChain` is REQUIRED + non-empty + terminates at a non-agent `delegatedBy`. Each `AgentChainEntry` shape:

```text
AgentChainEntry {
  agentId: string                 // URN naming the agent (e.g., "urn:wos:agent:procurement-bot-v3")
  agentClass: "automated" | "semi-autonomous" | "human-in-loop"  // mirrors WOS autonomy taxonomy
  modelIdentifier?: string        // REQUIRED when agentClass != "human-in-loop" AND agent is generative (per WOS §3.1)
  modelVersion?: string           // REQUIRED when modelIdentifier present
  delegatedBy: string             // URN; terminal entry's value MUST resolve to a human/entity
  delegatedAt: string             // RFC 3339
  delegationScope: string         // FEL expression OR free-text describing delegation bounds
  delegationArtifact?: {          // optional cryptographic delegation token / corporate resolution / POA artifact
    uri: string
    hash: string                  // SHA-256 hex
    type: string                  // taxonomy: "poa" | "corporate-resolution" | "machine-operator-token" | "verifiable-credential" | "other"
  }
  capabilityInvocationRef?: string // ref to WOS `capabilityInvocation` provenance record per ai-integration.md §3.3.1
  confidenceRef?: string          // ref to WOS `ConfidenceReport` for this fill
}
```

**Fixture status:** none. Land with capacity + authority-artifact + partyRole + `agentChain` fixture matrix. **FW-0058 §6.2 fixture set (10 scenarios) is the canonical agentChain fixture matrix:** single-agent direct delegation; two-hop delegation; three-hop with sub-agent; broken chain (negative); ungrounded chain — terminal `delegatedBy` resolves to another agent (negative); invalid `delegationArtifact` hash (negative); multi-party agent (per FW-0050 composition); safe-* composition (per FW-0049 — agent fills without seeing plaintext); `capacity: "ai-agent"` + WOS deontic-constraint pass (positive); `capacity: "ai-agent"` + WOS deontic-constraint fail (negative).
**Cross-stack:** the agent-side path also lands as part of XS-6 ratification (see below).
**Status:** not yet filed. Multi-party `partyRole` extension proposed by [FW-0050 design 2026-05-23 §6.3](2026-05-23-fw-0050-multi-party-submission-design.md); AI-agent `agentChain` shape proposed by [FW-0058 design 2026-05-24 §3.2](2026-05-24-fw-0058-ai-agent-filer-chain-design.md) — closes the prior deferral.

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
**`response.withdrawn` / `response.dispute-attached` per-party scope — extended 2026-05-24 by [FW-0034 design §6.2](2026-05-24-fw-0034-honest-correction-path-design.md).** Both event types MUST accept an optional `partyRef` field naming which party in a multi-party flow authored the act (per FW-0050 §7.1 composition). Single-party flows omit `partyRef`; multi-party flows populate it. The shape mirrors the `response.correction-recorded` event's `data.partyRef?` convention (proposed analogously by FW-0034 design for the correction event when in multi-party flows). Fixture coverage: the EXT-5 fixture set for the two event types MUST include both single-party (no `partyRef`) and multi-party (`partyRef` populated) cases.
**`submission.duress-signaled` payload shape — extended 2026-05-23 by [FW-0048 design §5.1](2026-05-23-fw-0048-coercion-aware-signing-design.md).** Carries `extensions["formspec.submission.duress-signal.v1"]` block: `{signalId, responseId, authoredSignatureRef?, partyRef? (for FW-0050 multi-party composition), capturedAt, mechanismUsed (dual-passkey | dual-pin | pin-second-entry), payloadRef (reference to the event's Trellis Core §6.4 PayloadRef carrying the ChaCha20-Poly1305 ciphertext), keyBagRecipientHandle (handle naming the Trellis Core §9.4 KeyBagEntry recipient whose wrapped_dek unwraps the payload DEK; resolves to the safety-team recipient registered in the issuer-sidecar safetyTeamRecipients[] block, EXT-30)}`. The plaintext encrypted under the DEK (which the recipient unwraps from key_bag) carries `{schemaVersion, duressSignaled, severityBand, routingTargetId, capturedAt, contextMetadata?}` per HPKE Base mode + Trellis Core §9.4 suite 1. No Trellis Core §13 commitment-slot use — per Core §13.3, Phase 1 producers MUST emit `commitments` as `null` or `[]`. Event-level uniform shape (every high-risk-template submission emits the event whether or not duress was signaled; plaintext distinguishes the cases) is the chain-observer-opacity discipline; no §13 slot population is required for the base pipeline.
**Fixture status:** none. Land each event-type with at least one fixture in `formspec/tests/fixtures/ledger/`. `submission.duress-signaled` fixtures must include the uniform-shape non-duress case (event emitted with same envelope shape; plaintext `duressSignaled: false`) so the fixture corpus exercises event-level uniform-presence discipline per FW-0048 §3.4.
**Status:** not yet filed. Payload-shape extension proposed 2026-05-23 by FW-0048 design.

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

### EXT-18: `@integrity-stack/hpke` — TS wrapper around `hpke-js`

**Owning repo:** integrity-stack (TS package addition); formspec-web (consumer)
**Closes:** RFC 9180 HPKE Base mode wrap/unwrap for client-side encryption (J-042 respondent-library: clients encrypt library contents with a passkey-derived key before upload; only the respondent can decrypt). Mirror of `integrity-stack/crates/integrity-hpke` (Trellis Core §9.4 suite 1: `DHKEM(X25519, HKDF-SHA256)` / `HKDF-SHA256` / `ChaCha20-Poly1305`).
**FW rows blocked:** FW-0056 (respondent-side document library build); FW-0059 (coercion-aware signing build) — both consume the same wrapper per [FW-0048 design §5.2 + §6.3](2026-05-23-fw-0048-coercion-aware-signing-design.md).
**Shape:** thin TS wrapper around [`hpke-js`](https://github.com/dajiaji/hpke-js) (mature, RFC 9180-spec'd, ChaCha20-Poly1305 support). Wrapper matches `integrity-hpke` API surface (`wrap(plaintext, recipient_public_key) → ciphertext`; `unwrap(ciphertext, recipient_private_key) → plaintext`). Conformance fixtures pulled from `integrity-bundle-fixtures` Rust corpus.
**Per ADR-0009 §(d) hybrid principle:** pure TS path because (a) `hpke-js` is mature and RFC-spec'd, (b) HPKE Base mode is well-tested across implementations, (c) no signature-determinative byte-exactness risk.
**Fixture status:** none. Sequenced with FW-0047 design (respondent-library trust model) ahead of FW-0056 build; FW-0059 consumes the same wrapper for duress-payload wrap to safety-team recipient.
**Status:** not yet filed.

### EXT-17: `@integrity-stack/event` — TS event-sequence mirror

**Owning repo:** integrity-stack (TS package addition); formspec-web (consumer)
**Closes:** TS mirror for `integrity-stack/crates/integrity-event` — domain-neutral event sequence number primitives consumed by the verifier orchestrator (EXT-16) when walking the Trellis chain.
**FW rows blocked:** FW-0003 (verifier — depends on EXT-16 which depends on this)
**Shape:** tiny TS package (~30 lines) mirroring the Rust event-sequence helpers. Pure TS — no byte-exact risk; composition primitive only.
**Per ADR-0009 §(d) hybrid principle:** pure TS — composition primitive, no byte-exactness.
**Fixture status:** none. One round-trip test against Rust corpus is sufficient.
**Status:** not yet filed.

### EXT-16: `@integrity-stack/verify` — TS verifier orchestrator

**Owning repo:** integrity-stack (TS package addition); formspec-web (consumer)
**Closes:** the post-MVP universal verifier orchestrator that composes (a) WASM byte primitives (EXT-15), (b) TS COSE decode (`@integrity-stack/cose`, shipped), (c) WebCrypto signature verify (`@integrity-stack/signature-adapter-webcrypto`, shipped), (d) chain-hash continuity walking, (e) bundle structural checks, (f) profile-verifier dispatch. Mirror of `integrity-stack/crates/integrity-verify` orchestrator role. Outputs conform to `stack-common-proof::ProofReportVerdict` (TS mirror per EXT-11).
**FW rows blocked:** FW-0003 (verifier UI consumer), FW-0010 (selective-proof viewer — adds SD-JWT profile dispatch per ADR-0116), FW-0052 (offline verifier bundle)
**Shape:** pure TS package that imports `@integrity-stack/bytes-wasm` (EXT-15), `@integrity-stack/cose`, `@integrity-stack/signature-port` + adapter. Exposes `verifyBundle(bytes, profileRegistry) → ProofReportVerdict`. Mirrors the Rust `integrity-verify` Surface (universal phase + profile dispatch). Profile verifiers (WOS event vocabularies, Formspec response shapes, Trellis posture transitions, FactsTier overlays) register against a `ProfileRegistry`.
**Per ADR-0009 §(d) hybrid principle:** pure TS — composition only, no byte work in this layer; calls into WASM for byte-exact primitives.
**Fixture status:** none. Conformance via `integrity-bundle-fixtures` corpus + `integrity-verify-parity` harness extended TS-side.
**Status:** not yet filed.

### EXT-15: `@integrity-stack/bytes-wasm` — WASM bundle for byte-exact primitives

**Owning repo:** integrity-stack (TS package addition with WASM build); formspec-web (consumer via EXT-16)
**Closes:** the byte-exact-encoding gap for the post-MVP verifier. WASM-bundles `integrity-stack/crates/integrity-canonical` (RFC 8785 JCS + `domain ‖ NUL ‖ json` framing), `integrity-stack/crates/integrity-cbor` (CBOR encode/decode + map lookup + byte-digest), `integrity-stack/crates/integrity-bundle` (deterministic ZIP read/write — fixed version 20, fixed time, STORED compression, sorted entries) into a single WASM build target.
**FW rows blocked:** FW-0003, FW-0010, FW-0052 (via EXT-16 dependency)
**Shape:** Rust workspace gains a WASM build target consolidating the three byte-exact crates (the crates themselves are NOT combined — bundling is a build choice). TS package exposes typed helpers calling into WASM: `canonicalizeJson(value, domain?) → Uint8Array`, `cborEncode(value) → Uint8Array` / `cborDecode(bytes) → value`, `readZipEntries(bytes) → Map<string, Uint8Array>` / `writeZipDeterministic(entries) → Uint8Array`.
**Per ADR-0009 §(d) hybrid principle:** WASM single-authority because (a) JS-vs-Rust numerical encoding drift would break signatures (decimal floats, key sort order, integer width are all byte-exact), (b) CBOR has many valid encoding choices and pure-TS libs vary, (c) deterministic ZIP requires bit-exact output for hash equality, (d) the Rust crates are the authority — a second TS authority would mean ongoing drift cost via the existing `integrity-verify-parity` harness pattern.
**Why bundle three crates into one WASM target:** they're always consumed together by the verifier; one WASM payload amortizes load cost; the Rust crate split stays intact for Rust-side consumers (cleaner modular reuse).
**Fixture status:** none. WASM target should pass `integrity-verify-parity` byte-exact harness against the Rust integrity-canonical / integrity-cbor / integrity-bundle reference outputs.
**Status:** not yet filed.

### EXT-11: TS mirror for `stack-common-proof::ProofReportVerdict`

**Owning repo:** formspec-web (consumer side); upstream source is `stack-common/crates/stack-common-proof/`
**Closes:** the cross-language gap between the Rust `ProofReportVerdict` struct (`{cryptographic_integrity, projection_integrity, domain_admissibility, relying_party_result, blocking_reasons}`) and the post-MVP TypeScript `Verifier` port (per web ADR-0009 §"Not in the constitutional inventory" (b))
**FW rows blocked:** FW-0003 (verifier UI renders the verdict)
**Shape:** TS type mirroring the Rust struct, plus at least one fixture vector pinning the field set. Two options: (a) schema-derived codegen (preferred if `stack-common-proof` exposes a JSON Schema or OpenAPI projection); (b) hand-mirror with conformance fixtures keeping the two in sync.
**Fixture status:** none. Resolution sequenced with FW-0003 implementation; without it, the post-MVP verifier port spec is incomplete.
**Status:** not yet filed.

### EXT-28: Definition `parties` block + per-item party-scoped visibility (multi-party)

**Owning repo:** formspec
**File:** `formspec/schemas/definition.schema.json`
**Closes:** J-041 (multi-party forms — Definition-time party-role declaration)
**FW rows blocked:** FW-0050 (design dependency), FW-0061 (build)
**Shape:** form-level `parties: PartyRole[]` declaring role slots with `{roleId, role: "coEqual" | "asymmetricPrimary" | "asymmetricSecondary" | "guardianFor", cardinality: {min, max}, assuranceFloor?, visibilityScope}`; plus per-item (or per-section — XS-1 ratifies the granularity) `visibleTo[]` / `editableBy[]` / `signedBy[]` referencing `roleId` values. Per [FW-0050 design 2026-05-23 §2.3](2026-05-23-fw-0050-multi-party-submission-design.md) Q3 is Definition-time party-role declaration; runtime binds party identities to role slots. Variable cardinality at runtime is supported; ad-hoc role invention at runtime is forbidden.
**Cross-stack:** lands as part of XS-1 ratification spanning formspec + WOS + trellis. Trellis substrate is unchanged (sequential per-party signing over digest-stable Formspec Signed Response Payload already works). XS-1 also carries a paired `response.schema.json` extension for disagreement-as-state (per FW-0050 design §5.4 + §6.2 (5)) so conflicting per-party field values can be carried with party attribution instead of silently merged.
**Fixture status:** none. Land with `coEqual` joint-tax fixture + `asymmetric` immigration-sponsorship fixture + `coEqual` child-custody-with-disagreement fixture (per FW-0050 design §4 worked scenarios).
**Status:** proposed 2026-05-23 by FW-0050 design; pending XS-1 ratification at stack-root.

### EXT-30: Issuer-sidecar `safetyTeamRecipients[]` block (duress routing)

**Owning repo:** formspec
**File:** `formspec/schemas/issuer-sidecar.schema.json` (extends the issuer-sidecar per web ADR-0006)
**Closes:** J-027 (issuer-side duress signal routing target registry)
**FW rows blocked:** FW-0048 (design dependency), FW-0059 (build)
**Shape:** add `safetyTeamRecipients: Array<{templateClassRef (closed enum: financial-poa | immigration-sponsorship | advance-directive | marriage-divorce | custody | benefits-redirect), recipientPublicKeyB64 (X25519 per Trellis Core §9.4 suite 1), routingTargetId (opaque), jurisdictions (Array<ISO 3166-2>), validFromAt, validUntilAt?}>` per [FW-0048 design §6.4](2026-05-23-fw-0048-coercion-aware-signing-design.md). NEVER exposed to respondents; consumed at form-load to identify the HPKE recipient public key the duress wrap targets. Privacy discipline binds: shell does not render the recipient list or jurisdiction list under any condition.
**Cross-stack:** lands as part of XS-3 ratification (see below). Trellis substrate is unchanged for the base duress pipeline — the documented Phase 1 envelope (Core §6.4 `payload_ref` + §9.4 `key_bag` HPKE Base-mode wrap to per-recipient public keys, suite 1) carries the duress payload directly; no §13 commitment-slot use is required (per Core §13.3 Phase 1 producers MUST emit `commitments` as null/[]).
**Fixture status:** none. Land with per-template recipient + key-rotation fixtures (`validUntilAt` set with overlapping windows + cutover semantics).
**Status:** proposed 2026-05-23 by FW-0048 design; pending XS-3 ratification at stack-root.

### EXT-31: Access-Class Registry entries for safe-* (safe-address handling)

**Owning repo:** formspec
**File:** `formspec/specs/registry/access-class-registry.md` — the Access-Class Registry companion proposed in [stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), **not yet authored** (verified 2026-05-23 — `formspec/specs/registry/` contains only `changelog-spec`, `extension-registry`, `signature-method-registry`).
**Closes:** J-037 (safe-address handling)
**FW rows blocked:** FW-0049 (design dependency), FW-0060 (build)
**Shape:** three new class entries per [FW-0049 design §3.1 + §6.3](2026-05-23-fw-0049-safe-address-handling-design.md): `safe-address`, `safe-contact`, `safe-employer`, all under the `safe-*` namespace prefix. Each entry carries `defaultAudience` (the audience(s) that receive plaintext — snake_case per Trellis OC §13.3 + ADR-0074 §1 convention), `excludedAudiences`, and `substitutionRule` (deployment-resolved validator port reference). **Derived-field handling relies on ADR-0074 §"Five decisions" line 44 cross-class FEL definition-error discipline + §"Profile-driven relaxation" `flClassCompatibility` — no new "cascade" mechanism is introduced.** Per ADR-0074 §"Five decisions" line 41–45 the registry is the canonical home for cross-form class vocabulary; Core treats class tokens as opaque.
**Cross-stack:** lands as part of XS-4 ratification (see below). Requires ADR-0074 promotion from Proposed to Accepted AND the Access-Class Registry companion file to be authored (currently neither has landed). FW-0049 design assumes both happen via ADR-0074's promotion path.
**Fixture status:** none. Land with one fixture per class covering the canonical scenarios per FW-0049 §2.3 (DV-survivor / witness-protection / multi-party-custody).
**Status:** proposed 2026-05-23 by FW-0049 design; pending XS-4 ratification at stack-root + ADR-0074 promotion + parent companion file authoring.

### EXT-32: Privacy Profile default audience policy for safe-* (safe-address handling)

**Owning repo:** formspec
**File:** `formspec/specs/privacy/privacy-profile.md` — the Privacy Profile sidecar proposed in [stack-root ADR-0074 §"Companion artifacts"](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md), **not yet authored** (verified 2026-05-23 — `formspec/specs/privacy/` does not exist).
**Closes:** J-037 (safe-address handling)
**FW rows blocked:** FW-0049 (design dependency), FW-0060 (build)
**Shape:** default audience-policy entry for the `safe-*` namespace per [FW-0049 design §6.4](2026-05-23-fw-0049-safe-address-handling-design.md). The defaults (snake_case audience tokens per Trellis OC §13.3 + ADR-0074 §1 convention): `safe-*` classes have `issuer_verification` as the only plaintext audience; `respondent_public_receipt`, `verifier_public_output`, and `foia_public` audiences are excluded by default. Per-jurisdiction overrides land as Privacy Profile additions per deployment (FOIA carve-outs for specific elected-official disclosure rules, etc.). Per ADR-0074 §"Five decisions" line 45 the Privacy Profile sidecar is the home for deployment-level audience policy + audience-name registration; FW-0049 supplies the cross-deployment default. **The audience tokens above are proposed defaults, not settled vocabulary.**
**Cross-stack:** lands as part of XS-4 ratification (see below). Requires ADR-0074 promotion + Privacy Profile sidecar file to be authored (currently neither has landed).
**Fixture status:** none. Land with default-policy fixtures + per-jurisdiction-override fixtures (CA-ACP, WA-ACP, USMS-WitSec).
**Status:** proposed 2026-05-23 by FW-0049 design; pending XS-4 ratification at stack-root + ADR-0074 promotion + parent companion file authoring.

### EXT-33: Formspec Assist Spec clarifications (BYO-assistant runtime postures)

**Owning repo:** formspec
**File:** `formspec/specs/assist/assist-spec.md` (small clarifications to draft 1.0.0)
**Closes:** J-046 (codifies the FW-0051 §3.2 + §3.3 + §3.4 disciplines as recognized Provider postures in the upstream spec)
**FW rows blocked:** none directly (FW-0051 design proceeds against the current draft 1.0.0). **However**, candidates (1) + (2) + (4) are RECOMMENDED upstream codification per FW-0051 §6.2 — without them, FW-0051's privacy posture (a different Provider could ship plaintext-by-default and remain spec-compliant) and AP-002 interop asymmetry (FW-0051's MUST reads as private deviation from the §4.3 (5) SHOULD floor rather than recognized posture) rest on a soft floor.
**Shape:** four candidate clarifications per [FW-0051 design §6.2](2026-05-23-fw-0051-bring-your-own-assistant-design.md):
1. **§4.4 `FieldDescription.value` masking semantics — RECOMMENDED uplift.** Add a non-normative note that Provider implementations MAY mask `value` by default and require explicit per-field reveal grant to unmask. Closes the soft-floor gap (a different Provider could ship plaintext-by-default and remain compliant).
2. **§11 security/privacy — add per-act + per-field reveal as a SHOULD pattern — RECOMMENDED uplift.** New §11.8 SHOULD per FW-0051 §6.2 (2). Same soft-floor gap as (1).
3. **§6 profile-matching — per-assistant scope hook — OPTIONAL.** NOT proposed for slice 1; relies on browser's WebExtension permission model per FW-0051 §1.2 non-goal.
4. **§3.3 mutation tools — runtime-policy-aware confirm-gate normative tightening — RECOMMENDED uplift.** New §4.3 (6) MUST per FW-0051 §6.2 (4). Codifies FW-0051's §3.4 Stage 2 MUST and closes the interop-asymmetry-honest-only-if-codified gap (FW-0051's stricter behavior reads as private deviation from the §4.3 (5) SHOULD floor without this).
**Cross-stack:** none. Single-spec upstream tightening; no cross-stack ratification required.
**Fixture status:** none. The upstream tightening lands with fixture cases for the new normative floors when (1) + (2) + (4) ratify.
**Status:** candidates (1) + (2) + (4) RECOMMENDED; (3) OPTIONAL — proposed 2026-05-23 by FW-0051 design. Not blocking FW-0051 or FW-0062 build; land alongside (or shortly after) FW-0051 owner ratification.

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
**FW rows affected:** FW-0047 (design row — delivered), FW-0055, FW-0056, FW-0057. The sidecar no longer blocks the stub-backed DI slice; production rows remain blocked on wallet/storage adapters, selective presentation, durable persistence, and XS-2 token-bag implementation.
**Shape:** `formspec/specs/respondent-library/library-spec.md` + `respondent-library.schema.json`. Document-kind taxonomy; per-presentation policy; library export / portability format. Trust model from [web ADR-0010](../adr/0010-respondent-place-trust-model.md): respondent-held, client-side aggregation only, server readable cross-tenant aggregation forbidden, production client-side encryption with passkey-derived key via integrity-stack HPKE. Applicant status is a WOS applicant API projection reference/cache, not a new Formspec status vocabulary.
**Adopts:** W3C Verifiable Credentials Data Model 2.0; OpenID4VP for verifiable presentation.
**Hard constraint:** **must not** be invented inside formspec-web — would create a UI-side primitive other consumers cannot reach. Cross-tenant aggregation is structurally forbidden server-side per stack-root ADR-0068 D-1 + D-3 (tenant boundary at runtime + per-tenant identity attestation); aggregation must be client-side, in the wallet.
**Fixture status:** authored in `formspec/tests/conformance/fixtures/respondent-library/` with positive library, selective-presentation, and export fixtures plus negative schema cases.
**Status:** filed 2026-05-23; consumed by formspec-web via ADR-0010, `RespondentPlaceSource`, stub conformance, and the visible respondent-place panel.

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

### XS-3: Coercion-aware signing pipeline (duress signal)

**Spans:** formspec (`submission.duress-signaled` event payload + issuer-sidecar `safetyTeamRecipients[]`) + work-spec (optional `safety-reviewer` actorExtension for the `wos-task` routing tier) + trellis (no envelope change; base duress pipeline rides Core §6.4 `payload_ref` + §9.4 `key_bag` HPKE Base-mode wrap; only post-hoc selective-disclosure manifests over the payload would require Phase 2+ OC-26/27/30)
**Closes:** J-027 (coercion-aware signing)
**FW rows blocked:** FW-0048 (design — design dependency closed by this ADR's ratification), FW-0059 (build)
**Recommended boundary:** at `intake-handoff` plus the optional WOS-task dispatch. Formspec owns the per-event payload shape; Trellis carries the standard envelope (signed `submission.duress-signaled` event with `payload_ref` ciphertext + `key_bag` HPKE wrap to the safety-team recipient per Core §6.4 + §9.4); WOS optionally owns the `safety-reviewer` actorExtension; the safety-routing adapter (formspec-web; port shape deferred to FW-0059 build per FW-0048 §4.2) targets either an issuer-side webhook or a WOS task.
**Shape:** per [FW-0048 design §6.5](2026-05-23-fw-0048-coercion-aware-signing-design.md): (1) Trellis Core §6.4 + §9.4 carry the base envelope unchanged (signed event, `payload_ref` ciphertext, `key_bag` HPKE wrap to safety-team recipient) — no new substrate primitive required; (2) event-type registration of `submission.duress-signaled` in the bound registry per Core §6.7 + §14 is the only Trellis-side Phase 1 work; (3) advanced post-hoc selective-disclosure manifests over the duress payload would require Phase 2+ (OC-26 + OC-27 + OC-30 + Phase 2 commitment scheme) — explicitly deferred, base pipeline does not depend on it; (4) WOS `safety-reviewer` actorExtension is OPTIONAL — `issuer-webhook` routing doesn't require WOS at all; (5) receipt discipline — verifier MUST NOT distinguish duress-signaled and non-duress submissions in any user-visible way (byte-identical receipt path per §3.2); (6) per-party scoping per [FW-0050 §7.2](2026-05-23-fw-0050-multi-party-submission-design.md) and [FW-0048 §7](2026-05-23-fw-0048-coercion-aware-signing-design.md) — Party B's duress signal MUST NOT be observable to Party A through any surface (status / receipt / ceremony).
**Fixture status:** none. Cross-stack ADR needed in `formspec-stack/thoughts/adr/`. Per [FW-0048 §7.3 (4)] multi-party fixture matrix lives in FW-0061 build.
**Status:** proposed 2026-05-23 by FW-0048 design; pending stack-root ratification.

### XS-4: Safe-address pipeline (cross-stack)

**Spans:** formspec (Access-Class Registry safe-* entries per EXT-31 + Privacy Profile default audience per EXT-32) + work-spec (per-actor audience policy for safe-* in applicant API + governance projections when WOS is the deployment's governance layer) + trellis (Phase 2+ OC-26 commitment-slot population + OC-27 Disclosure Manifest binding for safe-* fields; base bucketed-Response per ADR-0074 works Phase 1)
**Closes:** J-037 (safe-address handling)
**FW rows blocked:** FW-0049 (design — design dependency closed by this ADR's ratification), FW-0060 (build)
**Recommended boundary:** at `intake-handoff` plus the Trellis admit step. Formspec owns the field-level class declaration + bucketed-Response shape; Trellis carries the Phase 2 commitment slots + Disclosure Manifest; WOS owns per-actor audience policy when WOS is the deployment's governance layer.
**Shape:** per [FW-0049 design §6.5](2026-05-23-fw-0049-safe-address-handling-design.md): (1) Phase 1 — ADR-0074 bucketed-Response delivers at-rest/in-transit confidentiality (safe-* class fields land in a separate bucket wrapped to the issuer-verification audience); receipt-side semantics are full-omit-with-structural-tell (insufficient for J-037 canonical scenarios). (2) Phase 2 — OC-26 uniform commitment-slot population (slot present whether or not the respondent invoked safe-address) + OC-27 Disclosure Manifest per audience (`committed_only_fields` for public-receipt; `disclosed_fields` for issuer-verification) + OC-30 independent auditability (verifier validates the eligibility-predicate-satisfaction commitment proof without plaintext); REQUIRED for the verifier-grade tier. (3) WOS audience policy — applicant API + governance projections honor the Privacy Profile audience policy before rendering safe-* fields per requesting actor; composition with FW-0050 §7.1 per-party scoping applies. (4) Receipt discipline — verifier MUST NOT distinguish safe-address-redacted receipts from non-redacted at the structural level (uniform commitment slots; differs only in manifest openings). (5) PKAF downstream — when a safe-*-protected value is referenced by a downstream Rulespec assertion, the assertion's `rkaf:AccessScope` MUST inherit a regulatory-restricted scope reflecting the upstream `accessControl.class` (specific DPV composition per deployment).
**Fixture status:** none. Cross-stack ADR needed in `formspec-stack/thoughts/adr/`. Per FW-0049 §7.4 fixture matrix lives in FW-0060 build (single-party DV-survivor / single-party witness-protection / multi-party child-custody scenarios).
**Status:** proposed 2026-05-23 by FW-0049 design; pending stack-root ratification + Trellis Phase 2 substrate availability for the verifier-grade tier (Phase 1 fallback path is achievable without).

### XS-5: Record-lifecycle three-act mapping (cross-stack)

**Spans:** formspec (Respondent Ledger event taxonomy — existing `response.correction-recorded` per §11.4 + EXT-5 queued `response.withdrawn` / `response.dispute-attached`) + work-spec (Kernel §13.9 five-mode amendment taxonomy + `TerminateInstanceRequest` per `work-spec/specs/api/instance.md:131`) + trellis (Phase 1 linear chain per Core §10.1 + ADR 0066 `correctionAuthorized`/`responseCorrection` correction-preservation reporting per Core §27.4 — already specified)
**Closes:** J-044 (cooperative correction) + J-016 (adversarial withdraw / dispute) — confirms the substrate-mapping is coherent across the three subsystems and that the respondent's three user-acts route to upstream primitives deterministically.
**FW rows blocked:** FW-0034 (design — design dependency closed by this ADR's ratification), FW-0038 (build).
**Recommended boundary:** at the Respondent Ledger event-emit plus the WOS Instance API termination call. Formspec owns the respondent-ledger event semantics; WOS owns the governance-layer determination/termination flow; Trellis owns the chain integrity + correction-preservation report.
**Shape:** per [FW-0034 design §6.4](2026-05-24-fw-0034-honest-correction-path-design.md):
1. **Three-act mapping table:** `correct` → Formspec `response.correction-recorded` (narrow subset per `correctableFieldSet[]`) OR `response.amendment-opened` (substantive overflow) + WOS Kernel §13.9 `correction` OR `amendment` mode; `withdraw` → Formspec EXT-5 `response.withdrawn` + WOS `TerminateInstanceRequest { terminationKind: "applicant-withdrawn" }` (no determination) OR WOS Kernel §13.9 `rescission` mode (determination exists); `dispute` → Formspec EXT-5 `response.dispute-attached` + no WOS lifecycle transition (counter-attestation only).
2. **Trellis discipline.** Every lifecycle event lives on the same response-ledger chain as the original submission, linked via `prev_hash`. Cross-chain supersession (`trellis.supersedes-chain-id.v1` extension) is used ONLY when WOS Kernel §13.9 `supersession` mode produces a new case/chain — not for the basic correct/withdraw/dispute path. **No Phase 2+ Trellis substrate is required for the basic correction chain.**
3. **Verifier discipline.** Existing correction-preservation report per Trellis Core §27.4 surfaces `CorrectionPreservationOutcome` rows with `correction_event_hash`. The FW-0034 verifier-public-output renders these per FW-0034 §5; the withdrawal + dispute event types (EXT-5) extend the same report shape — verifier surfaces "withdrawn-by-applicant on [event_hash]" and "disputed-by-signer on [event_hash]" rows analogously.
4. **WOS actor scope (when WOS is the governance layer).** The applicant API + governance projections MUST surface the lifecycle events on the case timeline per `work-spec/specs/api/applicant.md:74` `ApplicantStatusTimelineEntry`. The reserved-literal `lifecycle-changed` covers all three acts; a more-specific stage label distinguishes them ("correction-recorded" / "withdrawn-by-applicant" / "dispute-attached") in the timeline-entry detail.
5. **Multi-party composition.** Per [FW-0050 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md): lifecycle events carry optional `partyRef`; shared-field corrections require all-party co-signature; per-party withdrawal defaults to `all-parties-must-agree`; signer-only dispute scoped per signer.
6. **Safe-* composition.** Per [FW-0049 §7](2026-05-23-fw-0049-safe-address-handling-design.md): correction event payloads inherit field `accessControl.class`; correction `reason` and dispute `statement` text carry their own class declaration; receipt-chain renderer honors mask discipline.
7. **PKAF downstream.** When a corrected/withdrawn/disputed record is referenced by a downstream PKAF assertion, the assertion's lifecycle MUST track via `rkaf:supersedesAssertion` + `rkaf:lifecycleEvent`. **Vocabulary tokens are ILLUSTRATIVE pending Rulespec alignment row.**

**Subsystem-count honesty.** Each subsystem already specifies its share of the substrate; XS-5 confirms the three-act mapping is coherent and that no new primitive is required. Lighter cross-stack work than XS-4 (FW-0049) because the substrate is mature; the ADR is primarily a confirmation + naming exercise rather than a new substrate commitment.
**Fixture status:** none. Cross-stack ADR needed in `formspec-stack/thoughts/adr/`. Per FW-0034 §5 the fixture matrix lives in FW-0038 build (three-act scenarios + the multi-party + safe-* composition variants).
**Status:** proposed 2026-05-24 by [FW-0034 design](2026-05-24-fw-0034-honest-correction-path-design.md); pending stack-root ratification + EXT-5 ratification + EXT-35 ratification.

### XS-6: AI-agent filer chain composition (cross-stack)

**Spans:** formspec (`AuthoredSignature.capacity == "ai-agent"` + `agentChain` per EXT-3 closure) + work-spec (already specified — `ActorKind::Agent` per ADR-0064 + `AgentInvoker` port + `capabilityInvocation` provenance per ai-integration.md §3.3.1 + deontic constraints per §4 + autonomy caps per §5 + agent disclosure per §12 + Kernel §10.5 `agentSubmitterUnauthorized` submission gate) + trellis (Phase 1 byte-neutral — no envelope change; the agent's `AuthoredSignature` rides the standard Formspec Signed Response Payload through the standard chain)
**Closes:** J-012 (filer-not-signer; the AI-agent slice) — confirms the substrate-mapping is coherent and that no new Trellis primitive is required.
**FW rows blocked:** FW-0058 (design — design dependency closed by this ADR's ratification), future FW build row.
**Recommended boundary:** at the `intake-handoff` plus the receipt-render surface. Formspec owns the `AuthoredSignature.capacity` + `agentChain` shape; WOS owns the governance-layer agent declaration + deontic enforcement + autonomy cap + disclosure; Trellis owns the chain integrity (unchanged byte-neutral envelope). Verifier rendering walks the `agentChain` from the persisted receipt; WOS audit trail is the optional bridge for case-investigation use.
**Shape:** per [FW-0058 design §6.3](2026-05-24-fw-0058-ai-agent-filer-chain-design.md):
1. **Capacity mapping.** Formspec `AuthoredSignature.capacity == "ai-agent"` maps onto WOS `actors[].type == "agent"` + `agents[].id` join (per WOS ADR-0064). Agent identity binding (per SC-4 + EXT-8a) is the third leg.
2. **Provenance bridge.** `AgentChainEntry.capabilityInvocationRef` resolves to a WOS `capabilityInvocation` provenance record per ai-integration.md §3.3.1. The bridge is OPTIONAL — the chain is authoritative for capacity rendering without it; the bridge enables "see WOS audit trail" in the verifier.
3. **Trellis discipline.** No new Trellis primitive. The agent's `AuthoredSignature` rides the standard Formspec Signed Response Payload through the standard chain. Per Trellis Phase 1 byte-neutral discipline, the verifier doesn't distinguish agent-signed from human-signed at the substrate level — only at the receipt-render level where the `capacity` declaration drives the chain rendering.
4. **Verifier discipline.** Verifier walks `agentChain` end-to-start; renders four-party chain ("filed by [agent] acting under [operator] under [accountable human/entity] within [scope]"); surfaces `WosProvenanceUnavailable` informational when the WOS substrate isn't reachable (post-receipt, archival case). Chain-integrity failures (`MissingAgentChain` / `BrokenAgentChain` / `UngroundedAgentChain` / `InvalidDelegationArtifact`) per FW-0058 §5.3 are unverifiable-capacity, NOT forged-receipt per AP-023.
5. **WOS submission gate.** WOS Kernel §10.5's `agentSubmitterUnauthorized` typed error covers the form-side rejection path; symmetric `humanSubmitterUnauthorized` for the inverse case (form requires agent + human submits) is a small WOS-side addition proposed by FW-0058 §9. **Registered EXPLICITLY here for tracking** (to avoid getting lost in XS-6 ratification noise per FW-0058 verifier LOW-2): file-pointer is [`work-spec/specs/kernel/spec.md` §10.5](../../../work-spec/specs/kernel/spec.md) for placement; sibling-error semantics to `agentSubmitterUnauthorized`; trigger is form-policy `aiAgentFiler: required` + submitter capacity `self`. Lands in same WOS edit cycle as the XS-6 ratification.
6. **Multi-party composition.** Per [FW-0050 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md): per-party scoping per `partyRole` on `AuthoredSignature` applies to agent capacity identically. An agent filing as one party in a multi-party flow carries BOTH `capacity: "ai-agent"` + `agentChain` AND `partyRole`.
7. **Safe-* composition.** Per [FW-0049 §3.3](2026-05-23-fw-0049-safe-address-handling-design.md): safe-* class fields render masked to the agent's introspection identically. The agent submits without seeing the plaintext; the receipt carries the safe-* class declaration unchanged.
8. **PKAF downstream.** When a downstream Rulespec assertion cites a value from an agent-filed form, the assertion's `rkaf:AILineage` per [PKAF rkaf-core §5.3](../../../PKAF/spec/rkaf-core.md) carries the AI-involvement; the filer-side `agentChain` is upstream of assertion authoring (distinct scope per FW-0058 §1.4). **Vocabulary tokens are ILLUSTRATIVE pending Rulespec alignment row.**

**Subsystem-count honesty.** WOS already specifies its share of the substrate (the heaviest specification); Formspec ratifies the deferred `agentChain` shape via EXT-3 closure; Trellis is byte-neutral. **XS-6 is primarily a confirmation + naming exercise rather than a new substrate commitment.** Lighter cross-stack work than XS-3 (FW-0048) or XS-4 (FW-0049) because the substrate is mature; comparable to XS-5 (FW-0034) in scope.
**Fixture status:** none. Cross-stack ADR needed in `formspec-stack/thoughts/adr/`. Fixture matrix lives in FW-0058 §6.2 (10 scenarios) and rides EXT-3 closure.
**Status:** proposed 2026-05-24 by [FW-0058 design](2026-05-24-fw-0058-ai-agent-filer-chain-design.md); pending stack-root ratification + EXT-3 ratification + SC-4 + EXT-8a + WOS reference adapter availability (`wos-agent-stub` ships; production `wos-agent-{anthropic,claude-sdk,mcp,a2a,http}` are skeletons per WOS ADR-0064).

### XS-2: Respondent-side multi-tenant token bag

**Spans:** formspec-web (UI-side fan-out pattern)
**Closes:** J-039 (cross-sender obligations stream) — the client-side aggregation pattern.
**FW rows blocked:** FW-0055
**Shape:** [web ADR-0010](../adr/0010-respondent-place-trust-model.md) documents that cross-tenant aggregation is structurally forbidden server-side (stack-root ADR-0068 D-1 + D-3, jointly: tenant boundary at runtime + per-tenant identity attestation), therefore must be client-side. Token-bag and cross-issuer preferences live at the wallet/respondent-place boundary; formspec-web adapters may keep per-issuer handles only as deployment details.
**Fixture status:** n/a (architectural ADR, not a schema change).
**Status:** decided 2026-05-23 by web ADR-0010; implementation remains post-MVP and follows the respondent-place DI ports.

---

## Class 4 — Reference deployment and server gaps

### EXT-19: Notifications endpoint for magic-link delivery

**Owning repo:** formspec-server
**Closes:** production magic-link delivery from the formspec-stack reference composition.
**FW rows blocked:** FW-0063 (magic-link production adapter path)
**Shape:** `POST /notifications` or equivalent server route that accepts the message envelope required by `NotificationDelivery` without embedding template semantics in formspec-web.
**Fixture status:** none.
**Status:** not yet filed.

### EXT-20: Runtime URL to form-id resolution

**Owning repo:** formspec-server
**Closes:** canonical form URLs for respondent entry.
**FW rows blocked:** FW-0001 (production URL ergonomics)
**Shape:** server-side resolver from Formspec Definition URL/version to the runtime `form_id` used by `/runtime/forms/{form_id}`.
**Fixture status:** none.
**Status:** not yet filed.

### EXT-21: Delete draft route

**Owning repo:** formspec-server
**Closes:** true remote draft deletion.
**FW rows blocked:** FW-0043 (abandon-and-erase) and production cleanup semantics for FW-0001.
**Shape:** `DELETE /drafts/{draft_id}` scoped by tenant and respondent identity. MVP `HttpDraftStore.delete()` only soft-deletes the local binding.
**Fixture status:** none.
**Status:** not yet filed.

### EXT-26: Server-backed draft state read and resume

**Owning repo:** formspec-server
**Closes:** cross-reload and cross-device draft hydration for the formspec-stack reference composition.
**FW rows blocked:** FW-0001 (server-backed draft resume) and production release sign-off for the M6 draft-hydration claim.
**Shape:** expand the draft read surface so web can recover a draft without an in-memory key-to-`draft_id` binding. Acceptable shapes include `DraftView` carrying `draft_state`, a dedicated `GET /drafts/{draft_id}/state`, plus a scoped lookup/list route by form and verified subject. The route must preserve tenant scope and anonymous-session verification.
**Fixture status:** none.
**Status:** not yet filed. Re-verified absent 2026-05-23: `DraftView` still carries metadata only and omits `draft_state`; no scoped lookup/list route exists for web draft resume.

### EXT-27: Session-bound anonymous draft update

**Owning repo:** formspec-server
**Closes:** in-place anonymous draft updates for the formspec-stack reference composition.
**FW rows blocked:** storage-efficient anonymous autosave for FW-0001 and external-audit sign-off of anonymous draft update semantics.
**Shape:** extend `PATCH /drafts/{draft_id}` or add an equivalent update route that accepts `anonymous_session_token`, verifies it against the draft's form and subject, and rejects mismatches. Until this lands, `HttpDraftStore` creates a fresh anonymous server draft on each save and submits the latest binding instead of using the unbound PATCH route.
**Fixture status:** none.
**Status:** not yet filed. Re-verified absent 2026-05-23: `UpdateDraftCommand` carries `draft_state` and optional version only; no `anonymous_session_token` is accepted on the update path.

### EXT-22: Nested-path draft hydration

**Owning repo:** formspec
**Closes:** complete draft restore for repeat groups and conditional nested groups.
**FW rows blocked:** FW-0001 (deep draft-resume fidelity)
**Shape:** engine/API support for restoring nested response paths without formspec-web hand-rolling path grammar beyond the current best-effort `engine.setValue()` loop.
**Fixture status:** none.
**Status:** not yet filed.

### EXT-23: Per-tenant OIDC trusted issuer and JWKS validation

**Owning repo:** formspec-server
**Closes:** direct token trust decision for the formspec-stack OIDC reference composition.
**FW rows blocked:** FW-0063 (full M7/M7b production identity close)
**Shape:** per-tenant trusted issuer config, JWKS client, RS256 verifier, and middleware path that accepts `Authorization: Bearer ...` from formspec-web. The web-side access-token bridge has landed; server validation remains the gating work.
**Fixture status:** none.
**Status:** filed; gates M7. Re-verified absent 2026-05-23: `formspec-server-auth-jwt` still constructs HS256 issuers/verifiers, `composition.rs` still passes `jwks_url: None`, and no JWKS/RS256 trusted-issuer path exists.

### EXT-24: Per-form tenant resolution for public portal forms

**Owning repo:** formspec-server
**Closes:** public portal tenant resolution without sentinel tenant headers.
**FW rows blocked:** FW-0001 (public-portal production ergonomics)
**Shape:** resolve tenant scope from `form_id` or published runtime metadata so `publicPortalProfile` can move from `headerMode: "sentinel-until-ext24"` to `headerMode: "omit-post-ext24"`.
**Fixture status:** none.
**Status:** not yet filed.

### EXT-25: Production formspec-server image

**Owning repo:** formspec-server
**Closes:** local and hosted full-stack compose without bind-mounted `cargo run` server startup.
**FW rows blocked:** M8 hosted/full-stack demo hardening
**Shape:** production server Dockerfile/image plus documented runtime env for database/object-store dependencies.
**Fixture status:** n/a.
**Status:** not yet filed.

### EXT-35: WOS `governance.recordLifecycle` form-policy block (record lifecycle actions)

**Owning repo:** work-spec
**File:** `work-spec/schemas/wos-workflow.schema.json` — extends the existing `Governance.amendmentTaxonomy` ([`work-spec/specs/kernel/spec.md:2168`](../../../work-spec/specs/kernel/spec.md)) with a sibling `recordLifecycle` block carrying the per-act respondent-facing lifecycle-action configuration per [FW-0034 design §3.3 + §6.3](2026-05-24-fw-0034-honest-correction-path-design.md).
**Closes:** J-044 (cooperative correction) + J-016 (adversarial withdraw / dispute) — the form-policy declaration shape that maps respondent's three user-acts (`correct` / `withdraw` / `dispute`) onto the WOS Kernel §13.9 amendment taxonomy literals.
**FW rows blocked:** FW-0034 (design — design dependency closed by this EXT's ratification), FW-0038 (build).
**Shape:** per [FW-0034 design §6.3](2026-05-24-fw-0034-honest-correction-path-design.md):

```text
governance.recordLifecycle?: {
  correctable?: {
    enabled: boolean
    correctableFieldSet: Array<string>                    // RFC 6901 pointers; required when enabled = true
    window?: { closesAt: string }                         // e.g., "determination" | "issuance+30d" | "submission+Nd" | "never"
    requiresEvidence?: boolean
    requiresReason?: boolean                              // default true
    kernelMode: "correction"                              // routes to amendmentTaxonomy literal
    reasonField?: { accessControl: { class: string } }    // safe-* class declaration per FW-0049 composition
  }
  withdrawable?: {
    enabled: boolean
    window?: { closesAt: string }
    requiresReason?: boolean                              // default true
    preDeterminationKernelMode: "applicant-withdrawn"     // formspec-web emits TerminateInstanceRequest; applicant authority
    postDeterminationIntent?: "rescission-requested"      // formspec-web emits response.withdrawn with rescissionRequested:true; ISSUER decides whether to emit the kernel `rescission` event (issuer authority, not respondent). Authority-ladder distinction.
    requiresIssuerAcceptance?: boolean                    // MUST be true when postDeterminationIntent is configured
    partyScope?: "any-party" | "all-parties-must-agree"   // case-level multi-party withdraw composition per FW-0034 §7.4; default all-parties-must-agree. DISTINCT from FW-0050 §5.2 per-signature withdraw which is per-party always (substrate rule, no partyScope axis).
  }
  disputable?: {
    enabled: boolean
    signerOnly?: boolean                                  // default true
    requiresReason?: boolean                              // default true
    statementField?: { accessControl: { class: string } } // safe-* class declaration per FW-0049 composition
    // No kernelMode binding — dispute is counter-attestation, not lifecycle state transition
  }
}
```

The block sits alongside the existing `governance.amendmentTaxonomy[]` — the taxonomy declares which kernel modes are PERMITTED on the workflow; the `recordLifecycle` block declares the respondent-facing affordances + their per-act configuration. The two blocks compose: a `correctable.enabled: true` declaration MUST be paired with `amendmentTaxonomy` containing `"correction"` (or `"amendment"` for substantive overflow per FW-0034 §3.2); a `withdrawable.enabled: true` declaration MUST be paired with `"rescission"` when determination-after-issuance withdrawal is supported.
**Cross-stack:** see XS-5 below — confirms the three-act mapping across formspec + WOS + trellis.
**Fixture status:** none. Land with fixtures in `work-spec/tests/fixtures/governance/recordLifecycle/` covering the three-act matrix + the window-closed / disabled / per-party-scope variants.
**Status:** proposed 2026-05-24 by [FW-0034 design](2026-05-24-fw-0034-honest-correction-path-design.md); pending XS-5 ratification at stack-root.

### EXT-34: `AttachmentRef` wire-format ratification inside `IntakeHandoff`

**Owning repo:** formspec (canonical IntakeHandoff schema + response-data field shapes) + stack-common (TS mirror) + formspec-server (server-side resolver)
**Closes:** the FW-0033 slice 1 implementation fixture-pins an `AttachmentRef` shape — `{ kind: 'attachment-ref', uri, hash, size, mimeType, filename }` — and writes it into the engine value at every `dataType === 'attachment'` field. `buildIntakeHandoff` JSON-serializes the response into `extensions['x-formspec-response-data']`, carrying the ref through unchanged. The upstream service has no ratified contract for the ref shape — today the fixture-pinned web shape is the only authority, so a server-side resolver must mirror it from the formspec-web test fixtures. Ratify the wire shape (JSON Schema or CDDL) inside the canonical formspec response schema so adopters on both ends can validate interoperably.
**FW rows blocked:** FW-0033 slice 2 (production resolver requires the shape; slice 1 is web-only so the gap is fixture-pinned, not blocking).
**Shape:** add an `AttachmentRef` definition to `formspec/schemas/response.schema.json` (or a sidecar) so the response data schema can declare a `dataType: 'attachment'` field's value-shape as `AttachmentRef | AttachmentRef[]` (per single vs multiple mode). Mirror TS shape in `stack-common/packages/` per the integrity-stack precedent noted in the operational notes below. Server-side resolver consumes the ref's `uri` and resolves against the configured object store; `hash` + `size` enable adopter-side bytes-vs-metadata integrity checks before the service trusts the bytes the ref points at.
**Honesty constraint:** the upstream ratification MUST NOT add a parallel `AttachmentRef` shape that is different from the slice-1 fixture-pinned shape; if changes are needed, evolve the existing shape (slice 1's discriminator `kind: 'attachment-ref'` is the load-bearing seam — it lets the server detect attachment values inside arbitrary response data without a heuristic) rather than fork. Slice 1 deliberately leaves no parallel sidecar plumbing — the ref IS the response value at the attachment path — so an upstream ratification that introduces a parallel envelope would force a slice-1 rewrite.
**Fixture status:** none upstream; the web shape lives in `src/ports/attachment-store.ts` + `src/adapter-conformance/assertions.ts` + the stub adapter's deterministic URI scheme.
**Status:** not yet filed.

### EXT-29: WOS applicant API recent-throughput projection

**Owning repo:** work-spec (schema) + formspec-server (proxy)
**Closes:** the "actual recent throughput" half of J-021. Today the WOS `ApplicantStatusTimelineEntry[]` (`work-spec/schemas/api/applicant.schema.json#/$defs/ApplicantStatusTimelineEntry`) exposes per-case event history; there is no projection of cross-case stage-duration statistics (e.g., "median time from `applicant-task-submitted` to `decision-reached` for cases on this workflow in the last 90 days"). Without it, FW-0039 slice 1 shows only per-case timing and cannot satisfy the J-021 "realistic time estimates from actual recent throughput, not vendor estimates" claim.
**FW rows blocked:** FW-0067 (consumer slice — render the workflow-scoped throughput strip on the `/status` page).
**Shape:** new applicant-scoped subresource — likely `GET /api/v1/applicant/workflows/{workflowUrlOrHash}/throughput` returning `{ workflowUrl, sampleWindow: { fromAt, toAt, sampleCount }, stageDurations: [{ fromEvent, toEvent, p50, p75, p90 }] }`. Closed `fromEvent` / `toEvent` enum reuses `ApplicantStatusTimelineEntry.event`. Server-side filters: sample window, minimum sample count (no projection if sample is too small to be honest), tenant scope respected per ADR-0010.
**Open question for upstream:** the placeholder path segment `{workflowUrlOrHash}` glues two identity schemes — `workflowUrl` (form URL identifier, mutable by republish) and `workflowHash` (content-addressed, identifies the exact workflow definition) — with "Or". Upstream needs to pick one before this lands. Tradeoff: URL-keyed throughput aggregates across all versions of a workflow (broader sample, blurs definition changes); hash-keyed isolates to a single workflow content-hash (tighter signal, smaller sample). Flagged from FW-0039 closeout independent architecture review N-1 — placeholder kept here pending the upstream design call.
**Honesty constraint:** when sample is below the minimum (the workflow is too new, or the issuer is too low-volume), the projection MUST return an empty `stageDurations[]` rather than synthesizing percentiles from a tiny sample. The consumer slice (FW-0067) renders the "Timing for similar applications is not yet available" copy (already pinned in `tests/app/status-runtime.test.tsx`) in both the no-projection and empty-projection cases — that is the load-bearing honesty seam.
**Why not a formspec-web client-side aggregate over many cases the wallet has cached:** ADR-0010 forbids server-side cross-tenant aggregation; client-side aggregation over the respondent's own cases is per-respondent, not per-workflow — meaningless for "throughput for cases like yours."
**Fixture status:** none. Land with sample-window + minimum-sample fixtures + a fixture for tenant-isolation correctness.
**Status:** not yet filed.

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
