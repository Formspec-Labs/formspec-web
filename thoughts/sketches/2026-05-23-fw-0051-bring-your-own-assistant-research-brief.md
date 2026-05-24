# FW-0051 Bring-your-own-assistant — Research Brief

**Status:** Sketch / research artifact. Not a design proposal. Seeds the design conversation.
**FW row:** [FW-0051 in `PLANNING.md:602`](../../PLANNING.md) (design); paired build row [FW-0062 in `PLANNING.md:699`](../../PLANNING.md).
**Journey:** [J-046 in `JOURNEYS.md:767`](../../JOURNEYS.md).
**Anti-patterns:** [AP-002 in `JOURNEYS.md:59`](../../JOURNEYS.md), [AP-007 in `JOURNEYS.md:89`](../../JOURNEYS.md), [AP-024 in `JOURNEYS.md:191`](../../JOURNEYS.md).
**Feature key (proposed):** `bringYourOwnAssistant` — **NOT yet enumerated** in [web ADR-0011 Feature Ownership Table line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md). FW-0051 proposes the extension (would be the 4th `RuntimeFeatureKey`, after `respondentPlace` / `status` / `documentPresentation`; ordering depends on whether FW-0033's `fileUpload` lands first).

The headline finding: **the protocol exists; the consent UX does not.** The Formspec Assist Specification ([`formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md)) already defines the canonical structure-exposure contract — `formspec.form.describe` / `formspec.field.list` / `formspec.field.describe` / `formspec.field.help` for introspection; `formspec.field.set` / `formspec.field.bulkSet` for mutation, with hard rules against silent writes to readonly / non-relevant fields (§4.3, §11) and required human-in-the-loop confirmation for high-impact writes (§7.1, §11). **FW-0051's design work is not inventing a structure-export contract — it is naming the per-form policy gate, the respondent-controlled consent affordance, the per-field reveal scoping, and the runtime invariants that ensure no plaintext value leaves the form without explicit per-act consent.** External prior art is mature: WebMCP (`navigator.modelContext`) is shipping in Chromium; accessibility APIs have decades of structure-exposure precedent; consent-frame patterns from OAuth scopes / browser permissions are the operational template.

The hardest finding: **the respondent's browser is the trust anchor, not the form.** Per J-046 "the respondent shouldn't have to pick between *this form's AI* and *no AI*" — the form delegates assistant choice to the respondent and trusts no specific assistant. Defense rests on (a) the assistant only sees what the respondent grants it, (b) per-field value access is per-act and revocable, (c) assistant-proposed mutations land as suggestions the respondent confirms (Assist §4.3 + §11), (d) parity rule (AP-007) — the no-assistant path is exactly as good as the assisted path, no SLA / feature / copy degradation. **The cryptographic substrate does not change.** Receipts, signatures, validation pipelines are unchanged — the assistant operates strictly above the response-construction layer, never on the wire.

---

## 1. Upstream Primitive Inventory

### 1.1 Formspec Assist Spec — the canonical contract

[`formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md). v1.0.0-draft.1. Already specifies:

| Primitive | Section | BYO-assistant relevance |
|---|---|---|
| Assist Provider role | §2.1 | **The form's role.** Exposes the tool catalog for the live form. formspec-web (when `bringYourOwnAssistant: required\|allowed`) wears this hat. |
| Assist Consumer role | §2.2 | **The respondent's assistant.** Any third-party tool — browser extension, MCP-enabled chat client, in-page widget. Untrusted by the form; the form treats consumer input as untrusted (§11.1). |
| Passive Provider role | §2.3 | **The fallback role.** Renderer that only emits declarative metadata (`data-formspec-*` per §8.1 + §8.2) without an active tool catalog. The "I told my browser this form exists" tier. |
| Required core introspection tools | §3.2 | `formspec.form.describe`, `formspec.field.list`, `formspec.field.describe`, `formspec.field.help`, `formspec.form.progress`. **This is the structure-export surface.** No `value` leaves the form via introspection — `FieldDescription` carries `value: unknown` (§4.4) only for fields whose values the respondent has already entered, and field-help / progress carry no values. |
| Required core mutation tools | §3.3 | `formspec.field.set`, `formspec.field.bulkSet`. **Hard rules** (§4.3): MUST validate writable, MUST NOT silently write readonly / non-relevant, MUST NOT suppress core validation. SHOULD support human-in-the-loop. |
| Optional profile tools | §3.5 | `formspec.profile.match`, `formspec.profile.apply`, `formspec.profile.learn`. `confirm: true` requires human-in-the-loop (§3.5); silent apply forbidden when confirm requested (returns `x-confirmation-required`). **Profile data MUST NOT transmit off-device without explicit user consent** (§11.5, §6.3). |
| Transport: WebMCP binding | §7.2 | `navigator.modelContext.registerTool()` + `requestUserInteraction()` for confirmation. **Browser-mediated confirmation.** The browser is the trust anchor. |
| Transport: MCP / HTTP / postMessage | §7.3, §7.4, §7.5 | Alternate bindings: server-mediated agents, browser extensions, remote agents. **All transports preserve the §4 envelope and the consent rules.** |
| Declarative browser annotations | §8 | `data-formspec-form`, `data-formspec-title`, field-level `toolparamdescription`, `autocomplete`. **The passive-mode signal** — a watching assistant sees the form exists and partial structure even when no active provider is exposed. |
| Sidecar discovery | §9 | `<link rel="formspec-references">`, `<link rel="formspec-ontology">`, `<link rel="formspec-registry">`. **Sidecars are public per-Definition data**, immutable for `(definitionUrl, definitionVersion)`. |
| Extension integration modes | §10 | Mode 1 (active provider exists), Mode 2 (Formspec form without Assist — extension MAY bootstrap one), Mode 3 (plain HTML — heuristic fallback, explicitly non-authoritative). |
| Security / privacy | §11 | (1) MUST treat all consumer input as untrusted. (2) MUST validate paths and values. (3) MUST NOT bypass readonly or relevance. (4) MUST NOT block persistence solely for validation. (5) MUST NOT transmit profile data without explicit user consent. (6) SHOULD encrypt profile storage at rest. (7) SHOULD isolate privileged extension capabilities from page-context code. |

**Takeaway:** The assist-spec is the structure-export contract FW-0051 needs. FW-0051 design's Formspec-side work is **zero** — the spec is sufficient. The work is on the formspec-web consumer side: a per-form policy gate (does this form expose the Assist surface?), a respondent-facing consent affordance (the "let my assistant see this form" toggle), per-field reveal escalation (the "ask my assistant about this field" affordance), and the runtime invariants that match the form-load resolver to those surfaces. Plus a small possible §6 extension to the assist-spec if per-assistant consent / revocation isn't already covered there — pending §1.5 verification.

### 1.2 Formspec Definition — already machine-readable

[`formspec/schemas/definition.schema.json`](../../../formspec/schemas/definition.schema.json) + spec [`formspec/specs/core/spec.md`](../../../formspec/specs/core/spec.md). The Definition document is structurally a JSON specification — the form's questions, types, validation rules, instructions, FEL expressions, item metadata. **An assistant that reads the Definition reads the form.** No new export shape needed; the existing Definition is the export. The assist-spec's `formspec.form.describe` returns a `FormDescription` (§4.4) summary; a richer "give me the whole Definition" tool would be an optional extension, but the core introspection already covers the help / validation / progress / per-field-context use cases that drive an assistant.

**Implication.** The "structure export" half of J-046 is **substrate-complete today**. The Definition is open; the assist-spec is open; an assistant can read both. The only thing missing is the respondent's affordance to **point their assistant at this form** with explicit consent, and the form's posture toggle (`bringYourOwnAssistant: required | allowed | forbidden`) declaring whether the form will participate.

### 1.3 WOS — Assist Governance Proxy + agent-as-actor; orthogonal but composes

[`work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) §14. WOS specifies an "Assist Governance Proxy" — a WOS-defined construct that sits between an Assist Consumer and an Assist Provider, intercepting tool invocations and applying the WOS deontic-constraint framework (permission, prohibition, obligation, right). The proxy MUST NOT modify either role's Assist conformance; MUST apply deontic constraints; MUST produce provenance records for each governed tool invocation; supports per-tool-category governance.

| Distinction | What FW-0051 owns | What WOS Assist Governance Proxy owns |
|---|---|---|
| Trust anchor | Respondent's browser | Issuer's WOS-orchestrated workflow |
| Substrate | formspec-web runtime + Assist Spec | WOS deontic-constraint framework + `agents[]` declarations |
| Consent model | Per-act, per-field, respondent-controlled | Governance constraints declared by the workflow author |
| Provenance | None (the assistant runs locally; nothing crosses Trellis for J-046 slice 1) | Provenance records per governed invocation (`recordKind: "capabilityInvocation"` per §3.3.1) |
| When it applies | Always — the respondent's assistant is always BYO | Only when the deployment is WOS-orchestrated AND the workflow declares an Assist Governance Proxy binding |

**Composition.** When a WOS-orchestrated deployment runs the formspec-web respondent renderer AND the workflow declares an Assist Governance Proxy, the respondent's assistant invocations pass through the WOS proxy. **This composes additively** — the proxy adds governance on top; FW-0051's respondent-side consent + per-act discipline are unchanged. The WOS layer is **orthogonal** for the FW-0051 slice 1 design; FW-0051 names the composition seam, doesn't bind it.

**The WOS "agent as actor" framework ([ai-integration.md §3](../../../work-spec/specs/ai/ai-integration.md))** is for AI-as-respondent-party — `ActorKind::Agent` filing the form. That's **FW-0058 territory** (AI-agent filer chain), NOT FW-0051. The vocabulary clash matters: FW-0058's agent is a *filer*; FW-0051's assistant is a *helper for a human filer*. Different actors, different trust models, different substrate paths.

### 1.4 Trellis — out of scope for slice 1

The assistant runs locally (browser extension, in-page widget, local MCP server) OR remotely (the respondent's choice of cloud AI) but never crosses the Trellis substrate. The respondent's interactions with the assistant are private to the respondent's browser session. **Nothing in the Trellis envelope changes for J-046.** The form's signed response is unchanged; the receipt is unchanged; the verifier sees the same artifacts.

**Honest exception.** If a Phase 2+ form policy required *auditing* that an assistant was used (which it does NOT today, and which would itself be an AP-007 / AP-024 violation if exposed to the receiving agency), then a Trellis-side event-type would land. **Not in FW-0051's scope.** Slice 1 explicitly does not surface "the respondent used an assistant" in any receipt or status artifact (per AP-007's parity-audit rule that the receipt records *that* AI assistance occurred but the issuer doesn't get an aggregate AI-score). Whether per-field assistant authorship lineage lands in receipt provenance (per AP-007 test) is **EXT-2 territory** (`metadata.provenance` per response.schema.json — already queued). FW-0051 does not extend EXT-2; relies on it.

### 1.5 PKAF — no direct dependency

`rkaf:AccessScope` ([`PKAF/spec/rkaf-core.md:140`](../../../PKAF/spec/rkaf-core.md)) governs Assertion / EvidenceBinding / SourceFragment scopes at the policy-knowledge layer — upstream of Formspec values. The respondent's grant-of-scope-to-their-own-assistant is a **session-local, browser-local consent record**, not a PKAF-tier artifact. The grant doesn't compose with `rkaf:AccessScope` because no PKAF assertion is being authored; the assistant is reading the form's structure, not authoring a downstream assertion.

**The seam exists** for future scope: if a downstream assertion eventually cites "this answer was assistant-suggested," the assertion's provenance could record the consent grant. **Out of FW-0051 scope; flag for future Rulespec alignment row.**

### 1.6 web ADR-0011 capability table — `bringYourOwnAssistant` NOT enumerated

[Feature Ownership Table at line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Compared to FW-0049's `safeAddress` (already enumerated at line 147 — FW-0049 codified the shape) and FW-0050's `multiParty` (already enumerated at line 138), **`bringYourOwnAssistant` is absent.** FW-0051 design must propose the addition as part of the design, then ADR-0011 evolves to include it. Per [web ADR-0011 §"Follow-on Work"](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — "Update future feature ADRs to name their instance capability key, org policy controls, form policy controls, and failure semantics." FW-0051 is one of those future feature ADRs.

Proposed shape (analogous to existing `safeAddress` entry at line 147):

| Layer | What ADR-0011 would name for `bringYourOwnAssistant` |
|---|---|
| Instance capability | Adapter-backed: (a) Assist Provider runtime per [`formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md) §2.1; (b) at least one transport binding per Assist §7 (WebMCP / MCP / postMessage / HTTP). The instance declares which transports it supports. |
| Org policy | (a) Allowed assistant transports per Assist §7 (org may forbid HTTP transport but allow WebMCP); (b) per-form override gating (org may forbid `required` on certain template classes); (c) data-residency declarations (org declares which assistant origins are permitted under its tenancy policy). |
| Form policy | (a) `required` (form MUST be assistant-friendly — Active Assist Provider mode); `allowed` (Passive Provider mode acceptable; assistant integration optional per-respondent); `forbidden` (high-coercion-risk flows per AP-014, e.g., duress-channel paths where an assistant-mediated coercion vector is unacceptable). (b) Per-feature-category gating (form may allow `formspec.field.help` but forbid `formspec.field.set` / `formspec.field.bulkSet` — pure-read assistant). |
| Resolved runtime profile | Enabled assistant transports + allowed mutation scope + per-form posture tier. Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if the form requires assistant-friendliness but the instance lacks an Assist Provider transport binding. |

**Conclusion:** FW-0051 design instantiates a not-yet-named capability key. The shape work is: (1) name `bringYourOwnAssistant` in ADR-0011's table; (2) the respondent-side consent affordance + posture toggle; (3) the per-field reveal escalation discipline; (4) the runtime invariants matching Assist §11 to the form-load failure surface; (5) the composition seam with WOS Assist Governance Proxy + FW-0050 multi-party + FW-0048 coercion.

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0051 |
|---|---|---|
| **FW-0062** BYO-assistant build | [`PLANNING.md:699`](../../PLANNING.md) | **Direct downstream.** FW-0051 design output is the canonical shape FW-0062 wires. FW-0062 blocked on FW-0051 design + existing assist-spec WebMCP binding. |
| **FW-0058** AI-agent filer chain (non-human capacity) | [`PLANNING.md:657`](../../PLANNING.md) | **Vocabulary clash.** FW-0058 = AI fills the form; FW-0051 = AI helps the respondent fill. Different actors, different trust models. Distinguish clearly in the design. FW-0058 carries `actorKind: agent` per WOS `actorExtension` + `agentChain` capacity on `AuthoredSignature` (EXT-3); FW-0051 carries no signature shape change. **The two rows can compose** — a form filled by an AI agent (FW-0058) may use the respondent's BYO-assistant (FW-0051) to consult during its own fill — but that's an edge case; the canonical FW-0051 case is a human respondent. |
| **FW-0050 / FW-0061** Multi-party | [`PLANNING.md:591`](../../PLANNING.md), [`PLANNING.md:689`](../../PLANNING.md) | **Per-party visibility composition.** In a multi-party flow, party 2's assistant MUST NOT see party 1's fields. The Assist Provider's introspection tools (`formspec.field.list` / `field.describe`) MUST be scoped to the requesting party's visible field set per [FW-0050 design §7.1](../specs/2026-05-23-fw-0050-multi-party-submission-design.md). Composition rule: when both `multiParty` and `bringYourOwnAssistant` are required, the Assist Provider's tool catalog is per-party-scoped; the resolver derives the introspectable field set from the per-party `visibleTo[]`. **FW-0050 §7.x extension proposed for the cross-row update.** |
| **FW-0048 / FW-0059** Coercion-aware signing | [`PLANNING.md:567`](../../PLANNING.md), [`PLANNING.md:667`](../../PLANNING.md) | **Coercion vector.** A coercer who controls the respondent's assistant (e.g., installs a malicious browser extension, or sits next to the respondent and instructs them to ask the assistant) can use the assistant as a coercion amplifier. **Mitigation rests on the per-act consent model** — the respondent must explicitly invoke each grant, and the assistant cannot exfiltrate values without per-field reveal. Documented in FW-0051 design's threat model; cited as a known residual risk. **FW-0048 cross-row touch is light**: a noted composition (form declaring both `duressAware` AND `bringYourOwnAssistant: forbidden` is a sensible high-risk posture). |
| **FW-0049 / FW-0060** Safe-address | [`PLANNING.md:579`](../../PLANNING.md), [`PLANNING.md:678`](../../PLANNING.md) | **Per-field reveal interaction.** Safe-*-class fields render masked per FW-0049 §3.3; the assistant SHOULD NOT see safe-* values via introspection unless the respondent grants per-field reveal — same per-act discipline as the respondent's own screen. The Assist Provider's `formspec.field.describe` MUST mask safe-* field values in `FieldDescription.value` by default; the respondent's reveal affordance covers both their own screen view AND any current-session assistant grant. Cross-row touch is light; flagged for FW-0049 design `§7.x` if owner concurs. |
| **FW-0007** Pre-submit consequences screen | [`PLANNING.md:252`](../../PLANNING.md) | **Adjacent.** The consequences screen is per-action consent (AP-010); the assistant-mediated invocation of `formspec.field.set` MUST surface through the same consequences gate when the field's consequences block (EXT-1) declares it. Assistant CAN propose; respondent confirms via the existing consequences flow. **Composition handled by Assist §3.5 `confirm: true` + §11.4 persistence rule.** No FW-0007 cross-row touch needed. |
| **FW-0011** Branched form "showing because" | [`PLANNING.md:292`](../../PLANNING.md) | **Adjacent.** The assistant SHOULD see the relevance state (`FieldSummary.relevant` per Assist §4.4) so its suggestions don't apply to non-relevant fields (Assist §4.3 (3) forbids silent writes to non-relevant fields). Existing assist-spec covers; no FW-0011 cross-row touch needed. |
| **FW-0021** Field-level "why are you asking this?" | [`PLANNING.md:311`](../../PLANNING.md) | **Adjacent.** `formspec.field.help` already surfaces References + Ontology context; the FW-0021 surface is the respondent-visible "why" copy. The assistant consumes the same `FieldHelp` shape. No FW-0021 cross-row touch needed. |

---

## 3. Threat Model — Three Grounded Scenarios

Each scenario gives: the setup, what the BYO-assistant mechanism must achieve, what FW-0051's posture provides.

### 3.1 Respondent uses cloud-AI helper for a complex tax form

- **Setting.** A small-business owner filling out a long tax form. Confused by Schedule C terminology. Has a paid subscription to a cloud AI (call it $assistant). Wants to ask the assistant to explain a specific field's meaning + the validation rules + whether their draft answer would clear validation.
- **What the respondent needs.** Point the assistant at this form, have the assistant read the field's question + the field's References doc context, propose a value, run it past validation, suggest a fix if validation rejects it. Confirm-then-apply.
- **What the assistant CAN see (design posture).** Definition (the form's questions, types, validation rules, references). Per-field help (`formspec.field.help` returning `FieldHelp` with References + Ontology bindings + summary). Current relevance state + validity state (which fields are required, which are filled, which have errors). **No filled-in values by default.**
- **What the assistant CANNOT see by default.** The respondent's filled-in answers. The issuer's identity context (the deployment-specific configuration like `safetyTeamRecipients[]`). Other-party data in multi-party flows. Cryptographic material (signing keys, HPKE recipients, audience keys).
- **Per-field reveal escalation.** The respondent invokes "ask my assistant about field X" — this MAY reveal field X's current value (if filled) to the assistant for that interaction only. The grant is per-field, per-session, explicit, revocable.
- **Mutation discipline.** The assistant proposes a value via `formspec.field.set` with `confirm: true`; the form surfaces a per-act confirm gate (Assist §3.5 + §7.2 `requestUserInteraction()`); the respondent reviews + confirms-or-rejects; on confirm, the engine applies the value and runs validation (Assist §4.3 (4) — provider MUST NOT suppress core validation). On reject, nothing changes. **Canonical scenario; design optimizes for this.**

### 3.2 Respondent uses browser-extension assistant (WebMCP)

- **Setting.** A blind user with a screen reader + a custom WebMCP-enabled assistant extension that the user has spent years configuring to match their working style. Filing a benefits application. Wants the assistant to walk them through field-by-field, propose values from their profile (drawn from prior form-fills), and notify them of validation errors in their preferred audio cadence.
- **What the respondent needs.** The form must (a) declare itself an Assist Provider via WebMCP (`navigator.modelContext`); (b) expose the full introspection tool catalog; (c) let the assistant invoke profile-match (`formspec.profile.match`) + profile-apply (`formspec.profile.apply` with `confirm: true`); (d) preserve accessibility semantics in parallel (the assistant is an addition, not a replacement, for the screen reader — Assist §8 Passive annotations and standard accessibility metadata MUST coexist).
- **Design posture.** WebMCP is the canonical transport (Assist §7.2). The form's runtime registers tools via `registerTool()`; the extension discovers + invokes; `requestUserInteraction()` mediates confirms. **The browser is the trust anchor.** The extension is privileged-browser-context per Assist §11.7; isolated from page-context code. The form trusts the browser's mediation; the form does not trust the extension's identity beyond what WebMCP exposes. **Canonical scenario for the WebMCP path; design supports this directly via Assist §7.2.**

### 3.3 Respondent uses MCP-server-backed assistant with structured form export

- **Setting.** A respondent who runs a local MCP server backing their AI workflow. Wants to consume the form as an MCP tool catalog, manipulate state programmatically in their own toolchain, then apply final values back to the form. Power-user variant; also covers the "advocate filing for many clients in one afternoon" J-046 sub-case.
- **What the respondent needs.** A way to export the form's Definition + current state to their local MCP toolchain; receive proposals; apply them back via per-act confirms.
- **Design posture.** Assist §7.3 (MCP binding) covers transport; tool names and result envelopes are preserved. Plus a deployment-level affordance — "export this form's structure to my MCP toolchain" — which is effectively the Definition + current Response sub-set the respondent has authority to expose. **Implementation seam:** the export is the same Assist introspection surface, plus a respondent-controlled "publish current state to local MCP server" trigger. The form trusts the respondent's browser to wire the transport. **Canonical scenario for the MCP path; design supports via Assist §7.3.**

### 3.4 Adversarial assistant — data-exfiltration disguised as helper

- **Setting.** A malicious browser extension presents itself as a form-fill assistant. The respondent installs it without realizing. The extension discovers the form via the Mode 2 fallback (Assist §10.2), bootstraps an Assist Consumer role, attempts to enumerate all fields, exfiltrate filled values, and submit on the respondent's behalf without explicit confirmation.
- **What the respondent needs.** Defenses that hold even against an adversarial Consumer.
- **Design posture.** (a) **The default introspection surface does NOT include filled values.** `FieldSummary.filled: boolean` (Assist §4.4) tells the assistant whether a value exists; the value itself is not returned by `formspec.field.list`. `FieldDescription.value` (Assist §4.4) IS returned by `formspec.field.describe`, BUT FW-0051's design proposes that values are masked by default in the consumer-facing introspection surface (substrate-mirroring the FW-0049 §3.3 masked-by-default discipline). The per-field reveal affordance is what unmasks. (b) **Mutation requires confirm.** Per Assist §3.3 + §4.3 + §11.4, the Provider MUST NOT silently apply writes. `formspec.field.set` from an untrusted consumer SHOULD surface a confirm gate; `formspec.profile.apply` with `confirm: true` MUST surface one. Adopters wire the WebMCP `requestUserInteraction()` path. (c) **Prompt-injection in assistant responses cannot escalate.** The assistant's response text never executes form-side code; the form only acts on structured `value` payloads from `formspec.field.set`, which the respondent confirms before apply. **Defense holds at the structural level**; the adversarial-extension threat is real but bounded — the extension can ONLY do what the respondent confirms it can do.

**Implication for the design:** FW-0051's posture is **optimized for scenarios 3.1 + 3.2 + 3.3** (legitimate respondent-chosen assistants on three transport paths) **with structural defenses adequate for 3.4** (adversarial assistant cannot escalate beyond per-act confirms). Honest gaps in §5.

---

## 4. Open Scope Questions for the Design

Prioritized — ask the first 3-4 before the rest.

### Top 4 to ask first

**Q1. Form-policy tier shape — three-tier `required | allowed | forbidden`, or richer per-tool-category gating?**

ADR-0011's form-policy enum is `required | optional | forbidden` (§"Form runtime policy"). For BYO-assistant, three-tier maps directly: `required` = form MUST expose Assist Provider; `allowed` (≈`optional`) = Passive Provider acceptable; `forbidden` = high-coercion-risk flows reject Assist surface entirely. **But:** the assist-spec carries finer-grained tool categories (introspection / mutation / profile / navigation per §3.2–3.6). Does FW-0051's form-policy carry per-category gating (e.g., "this form allows introspection but forbids mutation"), or is mutation-gating a render-time policy that doesn't need ADR-0011 expression?

- **Three-tier only.** Simple; mutation-gating lives in the form's Definition (per-field `readonly`) and the Assist Provider's §4.3 rules; form-policy doesn't need per-category gating.
- **Three-tier + per-category override.** Richer; lets a form declare "assistant can read structure but cannot propose values."

**→ Drives the resolved-profile shape.** Lean: **three-tier with an optional per-category restriction (`allowedToolCategories?: Array<"introspection" | "mutation" | "profile" | "navigation">`)**. Default is all categories enabled per the assist-spec; the override lets read-only assistant forms (high-sensitivity templates) opt out of the mutation surface. Aligns with the safe-default pattern.

**Q2. Per-field value masking in introspection — default masked, or default plaintext?**

When an assistant invokes `formspec.field.describe`, the returned `FieldDescription.value` (Assist §4.4) MAY carry the field's current value. **Two options:**

1. **Default plaintext.** The assistant sees the value if the field is filled. Respondent controls whether the form is connected to an assistant; once connected, the assistant sees all filled values. **Simpler;** matches the assist-spec's default reading.
2. **Default masked + per-field reveal.** The assistant sees `value: "(protected)"` (or similar sentinel) by default; the per-field reveal affordance unmasks. **Stronger;** mirrors FW-0049 §3.3.

**→ Drives the consent UX surface.** Lean: **default masked + per-field reveal** for FW-0051. The "I let my assistant see this form" toggle is consent-to-structure; "I let my assistant see this field's value" is a separate per-field consent. The pattern is consistent with FW-0049, mature in banking-app account masking, and gives the respondent meaningful control. **The Assist Provider implementation lives in formspec-web; the masking discipline is a runtime constant** — adopters do not toggle it. The introspection surface from the assist-spec doesn't constrain `value` semantics (it's just `unknown`); FW-0051 narrows it.

**Q3. Consent affordance shape — single toggle, or staged grant?**

The respondent's primary consent surface — connecting their assistant to this form. **Two options:**

1. **Single toggle.** "Let my assistant help with this form" — on / off. When on, the Assist Provider registers; when off, no Assist surface.
2. **Staged grant.** First step: "Let my assistant SEE this form's structure" (introspection scope). Second step: "Let my assistant PROPOSE values" (mutation scope). Third (per-field): "Let my assistant see THIS field's value."

**→ Drives the consent UX.** Lean: **staged grant**. Aligns with OAuth scopes / browser permissions pattern. The respondent's first decision (structure-see) is low-risk; subsequent decisions (mutation, per-field-value) escalate with the user's understanding. Single-toggle bundles too much; staged is the mature pattern. **The implementation cost is modest** — three UI states instead of one — and the security gain is significant.

**Q4. DOM signal for passive-mode discovery — adopter-configurable, or default-on, or default-off?**

Assist §8 (Declarative Browser Annotations) specifies `data-formspec-form`, `data-formspec-title`, etc. — the passive metadata that lets a watching extension know a Formspec form exists even with no active Assist Provider. **Three options:**

1. **Default-on.** Every formspec-web-rendered form emits the data-attributes. Maximum discoverability; respondent's existing tools work out of the box.
2. **Default-off; adopter opts in.** Adopters explicitly enable per deployment. Maximum control; minimum default discoverability.
3. **Default-on, per-form override.** Adopters can disable per form via `bringYourOwnAssistant: forbidden`. Sensible default + form-level escape.

**→ Drives the runtime invariants.** Lean: **option 3 (default-on, per-form override via `bringYourOwnAssistant: forbidden`)**. The Passive Provider surface is informative metadata, not a tool catalog — it doesn't expose any value or grant any capability; it only says "this is a Formspec form, here's its title and version." The discoverability win is real; the surveillance risk is minimal (the form's URL + title are already in the browser's tab). A `forbidden` form omits the metadata; a `required` or `allowed` form includes it. **Adopter-configurable for the active-mode Assist Provider; default-on for the Passive metadata; respect AP-007 parity.**

### Next 4 (ask after the framing 4)

**Q5. Per-assistant identity / revocation — does the assist-spec §6 (Profile Matching) need extension?**

The assist-spec §6 covers profile matching (cross-form value reuse). For BYO-assistant, the respondent may want **per-assistant** consent (grant Assistant A but not Assistant B), and **per-assistant revocation** (revoke Assistant A's grant). The assist-spec §11.5 covers "profile data MUST NOT transmit off-device without explicit user consent" but doesn't specify a per-assistant identity model.

**Two options:**

1. **Out-of-scope for FW-0051.** The browser's WebExtension permission model + the WebMCP `navigator.modelContext` API already mediate per-extension consent; FW-0051 trusts the browser's per-extension boundary. Per-assistant revocation = uninstall the extension.
2. **Small extension to assist-spec §6.** Add a normative shape for per-assistant grant + revocation records, with the form's Assist Provider tracking which assistants have which scope. **Larger surface; needs upstream coordination.**

**→ Lean: option 1 for FW-0051 slice 1.** Browser-mediated per-extension consent is mature; FW-0051's responsibility is the form's per-act + per-field discipline, not the per-assistant identity model. **Out-of-scope; flag for assist-spec §6 evolution row if a real need surfaces.**

**Q6. Receipt / provenance — does an assistant-assisted value land with per-field provenance per AP-007?**

AP-007's "Test" rule: "Parity audit on every branch — same fields, same fees, same SLA, same help text, same receipt. Differences are disclosed and justified. The receipt records *that* AI assistance occurred and per-field authorship lineage, but no aggregate 'AI score' is exposed to the receiving agency."

**Question:** does FW-0051 land per-field authorship lineage in the receipt? EXT-2 (`metadata.provenance[path]` per response.schema.json — already queued) specifies the substrate. **Lean: yes, but via EXT-2 — FW-0051 declares the requirement; EXT-2 carries it.** The per-field `attestedBy` value can include an `"assistant-suggested"` source class; the existing `class | sourceRef | capturedAt | attestedBy` shape suffices. **No new EXT row needed; the dependency on EXT-2 is noted.**

**Q7. Form-load failure semantics — how does the form behave when `bringYourOwnAssistant: required` is declared on a deployment that lacks the Assist transport?**

Per ADR-0011's typed errors: `UnsupportedRequiredFeatureError` at form-load. The shell catches and renders a plain-language unavailable page. **Confirms ADR-0011 pattern applies directly.** No FW-0051-specific failure surface needed beyond the standard typed-error → plain-language render path.

**Q8. Anti-Clippy applies — does FW-0051 inherit the form's-own-AI constraints (ambient never interruptive, pull not push, no persona, no avatar)?**

The form's own AI (J-011 territory) carries the anti-Clippy constraints per [`formspec-web/CLAUDE.md`](../../CLAUDE.md) §"Anti-Clippy applies here too" + [`formspec-cloud/CLAUDE.md`](../../../formspec-cloud/CLAUDE.md). The respondent's BYO assistant runs in the respondent's tools and is NOT subject to the form's anti-Clippy discipline — that's the respondent's choice. **But:** the form's *consent affordance* IS subject to anti-Clippy (it's a form surface). The "let my assistant help" toggle SHOULD be ambient, pull-not-push, no persona, no avatar. **Confirmed: the form's consent UI is anti-Clippy; the assistant itself is not.**

---

## 5. Honesty Note: What This Row Can and Cannot Do

**Can:**

- Specify the per-form policy gate (`bringYourOwnAssistant` capability key) under web ADR-0011.
- Specify the respondent-facing staged consent affordance (structure-see → propose-values → per-field-value-reveal).
- Specify the per-field reveal escalation discipline (masked-by-default introspection surface; per-act reveal).
- Specify the runtime invariants tying Assist §11 security/privacy rules to the form-load failure surface.
- Name the composition seams with WOS Assist Governance Proxy + FW-0050 multi-party + FW-0048 coercion + FW-0049 safe-address.
- Codify the AP-002 / AP-007 / AP-024 bindings (no auto-apply, parity, training-consent).
- Distinguish clearly from FW-0058 (AI-as-respondent vs AI-as-helper).

**Cannot:**

- **Solve the adversarial-extension problem fully.** A malicious browser extension installed by the respondent CAN exfiltrate values the respondent reveals to it. **Out of any form-layer mechanism's reach** — the form trusts the respondent's browser; the browser trusts the user's extension-install decisions. Mitigation rests on per-act consent + per-field reveal, but a determined adversary with shell access to the user's browser wins. Document honestly.
- **Solve the coercion-via-assistant problem fully.** A coercer instructing the respondent to "ask the assistant to fill X" is a coercion vector independent of the assistant identity. Mitigation rests on the per-act confirm gates + FW-0048 duress channel (the form's existing coercion-aware substrate is still available); but FW-0051 cannot eliminate coercion-via-tool-manipulation.
- **Solve the cloud-AI privacy problem.** When the respondent uses a cloud AI, the respondent's revealed values transit to the cloud provider. The form has no control over the cloud provider's data handling. **Out of any form-layer mechanism's reach.** The form's role is to make the per-act reveal explicit; the respondent owns the cloud-provider-trust decision.
- **Specify the assistant itself.** FW-0051 is the consent + structure-exposure contract from the form's side. Assistant implementations are out of scope; the spec consumer chooses the assistant.
- **Ship the build.** FW-0062 owns build.
- **Author the upstream spec extensions.** The assist-spec already covers the contract; FW-0051 verifies coverage and proposes a small §6 extension only if Q5 surfaces a real gap.

The honest split: FW-0051 covers **(a) per-form policy gate**, **(b) staged consent affordance**, **(c) per-field reveal discipline**, **(d) runtime invariants linking Assist §11 to ADR-0011 failure semantics**, **(e) cross-row composition seams**. It does NOT cover **(f) the assistant implementation**, **(g) cloud-AI privacy guarantees**, **(h) adversarial-extension full mitigation**, **(i) per-assistant identity / revocation** (defers to browser's WebExtension model).

---

## 6. External Prior Art

Cited so the design is grounded in real prior art, not invented in isolation. **All references load-bearing for design §3; verify before relying.**

### 6.1 WebMCP — `navigator.modelContext`

- **WebMCP draft / WICG-incubated proposal.** [`https://github.com/webmachinelearning/webmcp`](https://github.com/webmachinelearning/webmcp) — W3C Web Machine Learning CG incubation of `navigator.modelContext` as a browser-native MCP-style transport. Chromium implementation in progress. **Direct binding** for Assist §7.2.
- **Anthropic MCP (Model Context Protocol).** [`https://modelcontextprotocol.io/`](https://modelcontextprotocol.io/) — Anthropic-led open standard for AI tool integration via JSON-RPC over stdio / SSE. **Direct binding** for Assist §7.3.

### 6.2 Browser-extension precedent for form interaction

- **WebExtensions API content-scripts model.** [`https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) — Mozilla's content-script API + permission model. Per-origin host_permissions; user grants on install. **The browser is the trust anchor** template that FW-0051 inherits.
- **1Password / Bitwarden / LastPass autofill UX.** Mature pattern: extension detects form, surfaces a hover/inline affordance, user confirms per-field. **Direct UX precedent** for the per-field reveal escalation in Q3 + Q2.
- **`autocomplete` attribute and password-manager hints.** [`https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete`](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete) — the HTML standard for declaring field semantics. Assist §8.3 maps ontology URIs to autocomplete tokens. **Precedent for the passive-mode discoverability** (Q4 lean).

### 6.3 Accessibility-API precedent — structure exposure to assistive tools

- **WAI-ARIA + Accessibility Tree.** [`https://www.w3.org/TR/wai-aria-1.2/`](https://www.w3.org/TR/wai-aria-1.2/) — W3C standard for exposing semantic structure to assistive technologies. Screen readers, voice-control software, switch interfaces all consume the accessibility tree. **BYO-assistant is structurally the same shape, generalized:** instead of "the user has chosen a screen reader," it's "the user has chosen any assistive tool, including AI." The privacy posture follows: the structure is exposed (it must be, for accessibility); the values are present (the user is filling them) but the assistive tool's access to them is mediated by the user's tool selection. **FW-0051 leans on this precedent for legitimacy** — accessibility APIs have decades of "structure exposure to user-chosen tools" without it being controversial; AI assistants are a continuation, not a departure.
- **macOS / Windows / Linux Accessibility APIs.** Each OS has a structure-exposure API consumed by assistive tools. **The pattern is universal.** FW-0051 is the form's contribution to this pattern.

### 6.4 LLM / agent form-fill — civic-tech and commercial precedent

- **LangChain / LangGraph form-fill agents.** [`https://python.langchain.com/`](https://python.langchain.com/) + [`https://langchain-ai.github.io/langgraph/`](https://langchain-ai.github.io/langgraph/) — open-source frameworks with form-completion examples and tool-binding patterns. **Reference for the structured-tool-invocation model.**
- **OpenAI Operator / Computer-Use Anthropic.** [`https://openai.com/index/introducing-operator/`](https://openai.com/index/introducing-operator/), [`https://www.anthropic.com/news/3-5-models-and-computer-use`](https://www.anthropic.com/news/3-5-models-and-computer-use) — cloud-AI products that drive a browser to fill forms via screen-reading + click-synthesis. **The Mode 3 fallback (Assist §10.3) anticipates these:** when no Assist Provider is exposed, the agent falls back to heuristic HTML interpretation. FW-0051's Active Provider path is the upgrade — structured tools instead of screen scraping. **Direct prior art for the structure-exposure value proposition.**
- **Cluely (former Interview Coder) / Chat-with-RFP class tools.** [`https://cluely.com/`](https://cluely.com/) — commercial AI assistants designed to help users complete structured documents. **Use case parity with J-046** but typically with proprietary form-handling; FW-0051 makes the open contract.

### 6.5 Consent-frame precedent — OAuth scopes, browser permissions, GDPR

- **OAuth 2.0 scope model.** [RFC 6749 §3.3](https://www.rfc-editor.org/rfc/rfc6749#section-3.3). Per-scope grant; user reviews scopes at consent screen; revocation per-grant. **Direct precedent for Q3 staged grant.**
- **W3C Permissions API.** [`https://www.w3.org/TR/permissions/`](https://www.w3.org/TR/permissions/) — browser permission model: `prompt | granted | denied`. Per-permission, per-origin. **Direct precedent** for the consent state machine.
- **EU AI Act + GDPR data-processing consent.** [AI Act Article 13 (transparency)](https://artificialintelligenceact.eu/article/13/), [GDPR Article 7](https://gdpr-info.eu/art-7-gdpr/). The legal-compliance template for explicit consent + revocation + purpose-limitation. **AP-024 is the formspec-web instantiation of this rule;** FW-0051 inherits it.

---

## 7. Quick-Reference Anchor List

For the design pass — open these in order if a question goes deep:

1. [Journey J-046 — `JOURNEYS.md:767`](../../JOURNEYS.md) — the user story
2. [Anti-patterns AP-002 / AP-007 / AP-024 — `JOURNEYS.md:59` / `:89` / `:191`](../../JOURNEYS.md) — the prohibitions
3. [FW-0051 row — `PLANNING.md:602`](../../PLANNING.md) — current state
4. [FW-0062 build row — `PLANNING.md:699`](../../PLANNING.md) — what this design feeds
5. [FW-0058 row — `PLANNING.md:657`](../../PLANNING.md) — AI-as-respondent (distinguish clearly)
6. [Formspec Assist Spec — `formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md) — the canonical structure-export contract (§2.1 roles, §3 tool catalog, §4.3 mutation rules, §7 transports, §8 passive annotations, §10 extension integration, §11 security/privacy)
7. [WOS AI Integration Spec §14 — `work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) — Assist Governance Proxy (orthogonal composition seam)
8. [FW-0050 design §7.1 — `thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md`](../specs/2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party composition (per-party scoping for Assist tool catalog)
9. [FW-0049 design §3.3 — `thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md`](../specs/2026-05-23-fw-0049-safe-address-handling-design.md) — masked-by-default + per-act reveal precedent (mirrored here for value masking)
10. [FW-0048 design — `thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md`](../specs/2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-vector composition (BYO-assistant as coercion amplifier)
11. [web ADR-0011 Feature Ownership Table — `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md:131`](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `bringYourOwnAssistant` proposed addition home
12. [EXT-2 (response metadata provenance) — `thoughts/specs/2026-05-22-upstream-extension-queue.md:36`](../specs/2026-05-22-upstream-extension-queue.md) — per-field assistant-suggested provenance carrier (AP-007 Test rule)
13. [`formspec-web/src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts) — append-only `RuntimeFeatureKey` taxonomy
