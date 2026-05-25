# FW-0051 — Bring-your-own-assistant: design proposal

**Date:** 2026-05-23
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q4 are open until accepted.
**Row:** [FW-0051 in `PLANNING.md:602`](../../PLANNING.md) (design); paired build row [FW-0062 in `PLANNING.md:699`](../../PLANNING.md).
**Journey:** [J-046 in `JOURNEYS.md:767`](../../JOURNEYS.md).
**Anti-patterns:** [AP-002 in `JOURNEYS.md:59`](../../JOURNEYS.md), [AP-007 in `JOURNEYS.md:89`](../../JOURNEYS.md), [AP-024 in `JOURNEYS.md:191`](../../JOURNEYS.md).
**Feature key (proposed; NOT yet enumerated):** `bringYourOwnAssistant` — ADR-0011 extension proposed in §4.1.
**Source brief:** [`thoughts/sketches/2026-05-23-fw-0051-bring-your-own-assistant-research-brief.md`](../sketches/2026-05-23-fw-0051-bring-your-own-assistant-research-brief.md). Upstream-primitive inventory, threat scenarios, FW interactions, and external prior art live there; this doc decides over them.
**Substrate source (load-bearing):** [Formspec Assist Specification v1.0 — `formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md). FW-0051 is a **consumer-side refactor of the assist-spec** — naming the formspec-web Assist Provider posture, the respondent-controlled consent affordance, the per-act invariants, and proposing the minimal upstream extensions where the spec leaves gaps. Per [web ADR-0004 consume-not-invent](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web does not author the structure-export contract; the assist-spec is it. This design ratifies the consumer posture.

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for letting the respondent's own AI assistant — whichever one they use — read this form's structure, propose values, and check answers, with every proposal landing as a visible suggestion the respondent confirms ([FW-0051 Done](../../PLANNING.md)). **The substrate already exists**: the [Formspec Assist Specification §3 tool catalog](../../../formspec/specs/assist/assist-spec.md) defines the introspection / mutation / validation / profile contract; §4.3 mutation rules forbid silent writes; §7 enumerates transport bindings (WebMCP, MCP, postMessage, HTTP); §8 declarative annotations enable passive discovery; §11 binds the security/privacy invariants. FW-0051's deliverables: framing decisions (Q1–Q4); the `bringYourOwnAssistant` capability contract proposed under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md); the per-form posture tier + per-act consent affordance; the value-masking + per-field-reveal discipline mirroring [FW-0049 §3.3](2026-05-23-fw-0049-safe-address-handling-design.md); the runtime invariants binding assist-spec §11 to the form-load failure surface; the composition seams with WOS Assist Governance Proxy + FW-0050 + FW-0048 + FW-0049; the cross-stack dependency chain (minimal — the assist-spec already covers the substrate); and the open questions that remain for the build row.

This is a **design row**. The deliverable is a doc plus follow-on cross-stack and spec items, not code. The build row is [FW-0062 in `PLANNING.md:699`](../../PLANNING.md).

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. FW-0062 owns build.
- **Inventing a parallel structure-export contract.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), the assist-spec IS the structure-export contract. This design refactors formspec-web's consumer posture against it; it does not author a sibling contract.
- **Inventing a parallel mutation contract.** Assist §3.3 + §4.3 already cover this. Same discipline as above.
- **Authoring the assistant itself.** FW-0051 is the form-side consent + structure-exposure contract; assistant implementations are out of scope. The respondent picks the assistant.
- **Promoting the assist-spec from `draft` to ratified.** Per the assist-spec header it is `1.0.0-draft.1`. Promotion is upstream work; FW-0051 design proceeds against the draft and the draft's invariants. If the assist-spec evolves in ratification, FW-0051 follows.
- **WOS Assist Governance Proxy implementation.** That's a WOS-side construct ([`work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) §14); FW-0051 names the composition seam at §7.5; the proxy itself is WOS substrate work.
- **Per-assistant identity / revocation model.** Browser's WebExtension permission model + WebMCP transport already mediate per-extension consent; FW-0051 trusts the browser's boundary. If a real need surfaces for cross-transport per-assistant identity, it's a follow-on row. §8 honest deferral.
- **Cloud-AI privacy guarantees.** When the respondent reveals values to a cloud AI, the form cannot bind the cloud provider's data handling. The form's role is to make the per-act reveal explicit; the respondent owns the cloud-provider-trust decision. §8 documents.
- **Adversarial-extension full mitigation.** A malicious browser extension installed by the respondent can exfiltrate values the respondent reveals to it via the per-act reveal mechanism. The defenses (per-act + per-field) hold structurally but a determined adversary with shell access to the browser wins. §8 documents.
- **Receipt / provenance recording of assistant authorship.** AP-007's Test rule names "per-field authorship lineage" in the receipt. That substrate is EXT-2 (`metadata.provenance[path]` — already queued). FW-0051 names the requirement; EXT-2 carries it. No FW-0051-specific provenance work.
- **AI-as-respondent.** That's FW-0058 (AI-agent filer chain). Vocabulary distinction is load-bearing — see §7.6.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Trust boundary

**The respondent's browser is the trust anchor.** This is the load-bearing posture inherited from the W3C Permissions API / WebExtensions model / accessibility-API tradition.

- The **form** trusts the **respondent**. The respondent picks their tools.
- The **form** trusts the **browser** to mediate consent (WebMCP `requestUserInteraction()` per Assist §7.2; postMessage isolation per Assist §7.4; OAuth-style flows for HTTP transports per Assist §7.5).
- The **form** does NOT trust any specific assistant. Per Assist §11.1 "MUST treat all tool input as untrusted." The Assist Provider validates every path + value before acting.
- The **assistant** runs in the respondent's tools — locally (browser extension, in-page widget, local MCP server) OR remotely (the respondent's choice of cloud AI). The form has no visibility into nor control over the assistant beyond the Assist tool surface.

**What the assistant SHOULD see (default introspection scope):** the form's Definition (per `formspec.form.describe`); the structural layout (per `formspec.field.list` returning `FieldSummary[]`); per-field metadata (per `formspec.field.describe` returning `FieldDescription` — **with `value` masked by default**, per §3.2 below); per-field help context resolved from References + Ontology sidecars (per `formspec.field.help` returning `FieldHelp`); progress state (per `formspec.form.progress`); validation state (per `formspec.form.validate` / `formspec.field.validate`).

**What the assistant MUST NOT see by default:** the respondent's filled-in plaintext values (returned masked in `FieldDescription.value`; the per-field reveal escalation is the unmask gate); the issuer's identity context (deployment configuration like `safetyTeamRecipients[]` per EXT-30); the respondent's identity (the form's `IdentityProvider`-bound identity is not exposed via Assist); other-party data in multi-party flows per FW-0050 §7.1 (per-party-scoping rule); cryptographic material (signing keys, HPKE recipients, audience keys).

**Per-field reveal escalation.** The respondent MAY grant the assistant scope to see a specific field's value via a respondent-controlled reveal affordance (e.g., "ask my assistant about this field"). The grant is per-field, per-session, explicit, and revocable. The reveal unmasks `FieldDescription.value` for that field for the duration of the session; closing the session or explicitly revoking ends the reveal.

### 2.2 Attacker model

- **Attacker identity.** A party seeking to extract the respondent's values, manipulate the respondent's submission, or instrumentalize the assistant against the respondent. Includes: malicious browser extension authors, hostile cloud-AI providers, coercers controlling the respondent's tools, prompt-injection attacks delivered via the assistant's responses.
- **Attacker goal.** Exfiltrate plaintext values; cause unintended writes; cause the respondent to submit a manipulated form without realizing.
- **What the attacker observes.** Whatever the Assist tool surface exposes (default introspection scope; revealed field values that the respondent has explicitly unmasked); the form's public Definition + sidecars (these are public per `(definitionUrl, definitionVersion)` per Assist §9); the rendered DOM (subject to Assist §8 passive annotations).
- **What the attacker cannot force.** Silent writes (Assist §4.3 (2), (3); §11.3); reads of fields the respondent has not unmasked (FW-0051 §3.2 default mask); reads of fields outside the per-party visibility set in multi-party flows (FW-0050 §7.1); reads of the form's cryptographic material; modification of validation rules (Assist §4.3 (4) MUST NOT suppress core validation).
- **What the attacker knows.** Kerckhoffs-style — the attacker has read this design + the assist-spec; knows the per-act + per-field-reveal model; knows the masked-by-default value semantics. **The defense rests on the per-act confirm gates + per-field reveal escalation + structural-defense against silent writes**, not on the affordance being secret.

### 2.3 Three grounded scenarios

Each scenario gives: the setup, what the BYO-assistant mechanism must achieve, what this design's posture provides.

**2.3.1 Respondent uses cloud-AI helper for a complex tax form.** Small-business owner filling a Schedule C. Confused by terminology. Uses a paid cloud-AI subscription. Wants the assistant to explain a field's meaning, propose a value, validate the proposal, suggest a fix.
- **Required:** the assistant reads Definition + per-field help (References + Ontology) + validation state, proposes a value via `formspec.field.set` with `confirm: true`, the form gates the apply behind a per-act confirm surface, the respondent reviews + confirms.
- **Design posture:** §3 framing decisions; §3.1 form-policy gate (`bringYourOwnAssistant: allowed | required`); §3.2 masked-by-default value semantics in introspection; §3.3 per-field reveal escalation for the "ask my assistant about THIS field's value" case; mutation discipline rides Assist §3.3 + §4.3 directly. **Canonical scenario; design optimizes for this.**

**2.3.2 Respondent uses a browser-extension assistant (WebMCP).** Blind user with a screen reader + a custom WebMCP-enabled assistant. Filing benefits. Wants the assistant to walk them field-by-field, propose values from their profile (cross-form, per Assist §6), notify validation errors in their preferred cadence.
- **Required:** the form registers the Assist Provider tools via `navigator.modelContext.registerTool()` (Assist §7.2); the extension discovers + invokes; `requestUserInteraction()` mediates confirms; accessibility semantics coexist (the screen reader continues to read the DOM; the assistant uses the tools — both work).
- **Design posture:** WebMCP is the canonical transport; the form's posture toggle activates the Provider; per-act confirm gates ride `requestUserInteraction()`; per-field reveal escalation is a respondent-side UI affordance the extension can trigger via tool invocation (FW-0051 §3.3 + §6.2 proposed upstream extension). **Canonical WebMCP scenario; design supports directly via Assist §7.2.**

**2.3.3 Adversarial extension — data exfiltration disguised as helper.** A malicious extension installs itself, discovers the form via Mode 2 fallback (Assist §10.2), enumerates fields, attempts to exfiltrate values, attempts to submit on the respondent's behalf without confirmation.
- **Required:** structural defenses that hold even against an adversarial Consumer with full Assist API access.
- **Design posture:** **layered defense.** (a) Default introspection surface masks values (§3.2); the assistant sees `FieldDescription.value` as a `"(protected)"` sentinel until per-field reveal (§3.3). (b) `formspec.field.set` requires confirm gate (§3.4 binds Assist §4.3 (5) SHOULD into a runtime invariant per FW-0051); the respondent reviews + confirms before any value applies. (c) `formspec.profile.apply` with `confirm: true` is structurally required for any bulk write (Assist §3.5). (d) Prompt-injection in the assistant's response text cannot escalate — the form acts only on structured `value` payloads via `formspec.field.set`, not on the assistant's free text. (e) Per-act consent for the form-level connection (§3.4 staged grant) means the assistant cannot bootstrap silently. **Defenses hold at the structural level; the adversarial extension can ONLY do what the respondent confirms it can do. §8 documents the residual risk.**

### 2.4 Out-of-scope threat patterns

Named explicitly so the design isn't read as covering them:

- **Compromise of the cloud-AI provider.** Once the respondent reveals a value to a cloud AI, the form's reach ends. Mitigation = the respondent's cloud-provider-trust decision (informed by per-act reveal copy that names the assistant's destination).
- **Coercer instructs the respondent to "ask the assistant to fill X."** A coercer instructing the respondent to invoke the assistant is a coercion vector independent of the assistant identity. The form's existing coercion-aware substrate (FW-0048 duress channel) remains available; FW-0051 cannot eliminate coercion-via-tool-manipulation. **Composition noted §7.4.**
- **Side-channel inference from masked surface.** A determined assistant could infer values from timing, validation-error patterns, or response timing of `formspec.field.validate`. Mitigation rests on the assistant's incentive structure (a legitimate helper is not adversarial); structural defense against side-channel inference is out of scope for slice 1.
- **Cross-form profile leak.** The assist-spec §6 profile-matching algorithm operates on user-controlled profile data; per §11.5 profile data MUST NOT transmit off-device without explicit user consent. Cross-form profile semantics are the assistant's concern; FW-0051 does not extend.

## 3. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 3.1 Q1 — Form-policy shape: three-tier `required | allowed | forbidden` with optional per-category restriction

**PROPOSAL.** Form-policy carries the standard ADR-0011 three-tier shape (`required` = form MUST expose Assist Provider; `allowed` = Passive Provider acceptable, Active Provider OPTIONAL per respondent consent; `forbidden` = form REJECTS Assist surface entirely — neither Active nor Passive metadata exposed), **plus an optional per-category restriction** `allowedToolCategories?: Array<"introspection" | "mutation" | "profile" | "navigation">` defaulting to all categories enabled per the assist-spec §3.

**Justification.** The base three-tier maps directly onto ADR-0011's existing form-policy enum (§"Form runtime policy"); reuses the existing typed-error rendering at form-load (§5.1). The per-category restriction lets high-sensitivity templates opt out of the mutation surface (read-only assistant) without forbidding the helpful introspection + help-lookup surface. Aligns with the safe-default + per-form-override pattern.

**The `forbidden` tier rejects BOTH Active Provider AND Passive metadata.** For high-coercion-risk flows per [AP-014](../../JOURNEYS.md) (financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect — the templates FW-0048 §6.4 names), the form may want zero exposure to any watching tool, including the passive Assist §8 metadata. The `forbidden` posture suppresses `data-formspec-form` + `data-formspec-title` + field-level `toolparamdescription`. This is the only path that removes the discoverability signal.

**Alternative rejected: three-tier only, no per-category restriction.** Considered for simplicity. Rejected because the read-only-helper case (a form that wants the assistant to explain fields but not modify them) is a real use case worth a typed expression — pushing it to per-field `readonly` declarations would force the form author to mark every field readonly-to-the-assistant-but-writable-to-the-respondent, an unwieldy carrier.

**Alternative rejected: richer policy carrying per-tool gating.** Considered (e.g., `allowedTools: Array<string>` naming specific tool names from the assist-spec catalog). Rejected as over-granular; the assist-spec's category boundaries (§3.2 introspection / §3.3 mutation / §3.4 validation / §3.5 profile / §3.6 navigation) are the natural seams, and per-tool gating drifts as the catalog evolves.

### 3.2 Q2 — Value masking in introspection: default masked + per-act reveal

**PROPOSAL.** `FieldDescription.value` returned from `formspec.field.describe` (Assist §4.4) is **masked by default** in the formspec-web Assist Provider implementation — the assistant sees a sentinel (e.g., `"(protected)"` or the locale's accessible-mask convention) rather than the plaintext value. The per-field reveal affordance (§3.3) is the unmask gate.

**Substrate justification.** The assist-spec §4.4 defines `FieldDescription.value: unknown` without constraining its semantics; FW-0051's runtime constant narrows the contract for the formspec-web Provider implementation. The masking discipline mirrors [FW-0049 §3.3](2026-05-23-fw-0049-safe-address-handling-design.md) (masked-by-default safe-address rendering on every respondent-facing surface, including the assist-spec introspection surface which is by definition a respondent-facing surface — the respondent's tools read it).

**What the assistant sees by default in `FieldDescription`:**

| Field | Default visibility |
|---|---|
| `path` | visible |
| `label` | visible |
| `hint` | visible |
| `dataType` | visible |
| `widget` | visible |
| `value` | **masked sentinel** (e.g., `"(protected)"`) — unmasked per-field by §3.3 reveal |
| `required` | visible |
| `relevant` | visible |
| `readonly` | visible |
| `valid` | visible |
| `validation` | visible (the validation result names what failed, not what the value is — `ValidationResult` per core spec carries severity + constraint kind, not plaintext) |
| `options` | visible (the option set is part of structure) |
| `calculated`, `expression` | visible (these are structural) |
| `repeatIndex`, `repeatCount`, `minRepeat`, `maxRepeat` | visible |
| `help` | visible (Refs + Ontology + summary are public per Assist §9 sidecar discovery) |

**What the assistant sees in `FieldSummary` per `formspec.field.list`:** all fields including `filled: boolean` (the assistant can tell that a value EXISTS without seeing the value). This is intentional — telling the assistant "this required field is empty" enables the assistant to prompt the respondent to fill it without revealing what the respondent has already entered elsewhere.

**ValidationReport semantics.** `formspec.form.validate` / `formspec.field.validate` return `ValidationReport` / `ValidationResult[]`. Per the core spec, validation results carry severity + path + constraint kind + message. The default mask discipline applies here too: validation messages MUST NOT echo the offending value back. The Provider implementation must scrub plaintext values from validation messages before returning to the Assist surface. This is a runtime invariant for the formspec-web Provider; the assist-spec doesn't constrain message content, but FW-0051 narrows.

**Alternative rejected: default plaintext.** Considered as the simpler reading of Assist §4.4. Rejected because the respondent's primary consent (connecting their assistant to the form) bundles too much: it would mean "let my assistant see this form" silently includes "let my assistant see every value I've ever entered." The staged-grant pattern (§3.4) requires the masked default to make the structure-only first step meaningful.

**Alternative rejected: opt-in plaintext per-field at form-author time.** Considered (form Definition declares which fields are auto-revealed). Rejected as authorial overreach into respondent privacy — the respondent should decide what to reveal, not the form author. The form author's declaration is "this form participates with assistants"; the per-field decision is the respondent's.

### 3.3 Q3 — Per-field reveal: per-act, per-session, explicit, revocable

**PROPOSAL.** The respondent's per-field reveal grant (the "ask my assistant about THIS field's value" affordance) is:

- **Per-act:** each reveal is a distinct user action (a single tap / click on a per-field reveal affordance). No bulk reveal.
- **Per-session:** the grant lasts for the current form-fill session. Closing the session or navigating away ends the grant. Reopening the form re-masks.
- **Explicit:** the respondent invokes; the form does not infer.
- **Revocable:** a per-field "stop revealing" affordance is available next to the reveal affordance after grant. Revocation re-masks for the rest of the session.

**Render discipline.** The reveal affordance is rendered next to the field's value in the form's own UI; the affordance toggles between "ask my assistant about this field" (mask state) and "stop sharing this field with my assistant" (reveal state). The affordance is keyboard-accessible (per [AP-019](../../JOURNEYS.md) accessible-alternative discipline + the anti-Clippy keyboard-first constraint that [`formspec-web/CLAUDE.md`](../../CLAUDE.md) inherits from cloud).

**Provider implementation.** When the respondent grants reveal for field `path`, the formspec-web Assist Provider updates an internal session-scoped grant set; subsequent `formspec.field.describe { path }` calls for that path return the plaintext `value`; calls for non-granted paths return the masked sentinel. The grant set is in-memory only; never persisted; never serialized off the device.

**No auditable record of per-act reveals.** The fact that the respondent revealed a specific field is NOT recorded in the receipt or any audience-disclosed artifact. Recording reveal-events would create a side channel exposing the respondent's privacy posture to the receiving agency. The form's respondent-private session-history view MAY record reveals locally for the respondent's own reference; that local record is not exported. Same discipline as FW-0049 §3.3 (per-act reveal is not auditable).

**No bulk "reveal all" affordance.** Forces per-act reveal decisions. Same discipline as FW-0049 §3.3.

**Alternative rejected: persistent grant across sessions.** Considered for usability (respondent doesn't have to re-reveal every session). Rejected: violates the per-session privacy posture; a grant that lasts across sessions silently re-extends past consent into future sessions. The respondent's decision to "let my assistant help today" should not bind tomorrow's session.

**Alternative rejected: single global reveal toggle.** Considered for simplicity. Rejected per the §3.4 staged-grant rationale: bundles too much consent; defeats the per-field discipline.

### 3.4 Q4 — Consent affordance: staged grant (structure-see → propose-values → per-field-value-reveal)

**PROPOSAL.** The respondent's primary consent surface is a **three-stage staged grant**:

| Stage | Grant scope | Effect |
|---|---|---|
| Stage 1 | Structure-see | The Assist Provider exposes the introspection tool catalog (Assist §3.2: `formspec.form.describe`, `formspec.field.list`, `formspec.field.describe` with masked values per FW-0051 §3.2, `formspec.field.help`, `formspec.form.progress`) + the validation tools (Assist §3.4) + the navigation tools (Assist §3.6). The assistant can READ the form's structure and help context; cannot propose values; cannot read filled values. |
| Stage 2 | Propose-values | Stage 1 + the mutation tool catalog (Assist §3.3: `formspec.field.set`, `formspec.field.bulkSet`) gated by per-act confirm (FW-0051 §3.4 Stage 2 below). The assistant can PROPOSE values; the respondent confirms each apply. The profile tools (Assist §3.5) are also enabled; `formspec.profile.apply` with `confirm: true` is required for any bulk-apply. |
| Stage 3 | Per-field value reveal | Stage 1 + (optionally) Stage 2 + per-field reveal grants per FW-0051 §3.3. The assistant can READ specific field values the respondent has revealed. |

The stages are independent toggles; a respondent may grant Stage 1 without Stage 2, or Stage 2 without any Stage 3 grants (the assistant can propose values without seeing existing values — e.g., proposing a value for a still-empty field based on the field's help context).

**UX shape.** The stage controls are rendered in an ambient pull-not-push panel (per the anti-Clippy discipline — no avatar, no persona, keyboard-first, never interruptive). The panel surfaces:

1. Stage 1 toggle: "Let my assistant see this form's structure."
2. Stage 2 toggle: "Let my assistant propose values (I'll confirm each one)."
3. Per-field Stage 3 reveal affordances: rendered next to fields per §3.3.
4. Revoke-all affordance: a single action that disables all stages and clears all per-field grants.

**Per-act confirm gate (Stage 2).** Per Assist §3.3 mutation tools + §4.3 (1)–(4) mutation rules, the Provider validates writability + relevance + non-suppression of core validation. The formspec-web Provider implementation MUST surface a confirm gate for every `formspec.field.set` invocation (even without `confirm: true` on the tool call) when the writes come from a Stage-2-granted assistant. The respondent reviews the proposed value + the field name + the help context, then confirms or rejects. Bulk operations (`formspec.field.bulkSet`, `formspec.profile.apply`) route through a single combined confirm surface listing all proposed changes.

**The Provider's confirm gate is a runtime invariant.** Assist §4.3 (5) says the Provider "SHOULD" support human-in-the-loop confirmation for bulk or profile-driven writes; FW-0051 narrows for the formspec-web implementation: the Provider MUST surface a confirm for every Stage-2 mutation (including single-field writes, not just bulk). This is more restrictive than the assist-spec's normative floor; FW-0051's tighter rule is justified by AP-002 (no auto-apply) — the spec's SHOULD is the floor for any Provider, FW-0051's MUST is the floor for formspec-web's Provider implementation. **The runtime invariant is documented here; the assist-spec is not amended.**

**Interop asymmetry — named honestly.** Consumers compliant with the assist-spec's lower SHOULD floor (§4.3 (5)) may expect some Provider implementations to apply single-field-set silently. Consumers interacting with formspec-web's Provider will encounter the stricter MUST behavior — a value never applies without per-act respondent confirmation. **This is intentional per AP-002 binding;** the asymmetry is named so adopters and Consumer authors don't read it as a bug. EXT-33 §6.2 (4) would codify the runtime-policy-aware tightening upstream.

**Alternative rejected: single toggle.** Bundles too much; defeats the layered consent model. Rejected per the brief's Q3 analysis.

**Alternative rejected: per-tool granularity (granular per-tool gating).** Considered (the respondent toggles each Assist tool individually). Rejected as too granular for respondent comprehension; the three stages map onto coarse mental models the respondent can hold (read / propose / reveal).

**Alternative rejected: implicit Stage 1 (always on if `bringYourOwnAssistant: allowed`).** Considered for the "watching extension" case (a passive consumer that wants to see the form exists). Rejected: Stage 1 still exposes the full introspection tool catalog; "watching extension" is the Passive Provider mode (Assist §2.3 + §8), which is structurally separate and only emits declarative metadata, no tool catalog. The form's `allowed` posture activates Passive Provider unconditionally (per §3.1 + Q4 below); Stage 1 is the gate to the Active Provider tool catalog.

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011 — PROPOSED ADDITION

**PROPOSAL.** Add `bringYourOwnAssistant` to the ADR-0011 [Feature Ownership Table at line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md). This is a **new entry**; the capability is not currently enumerated.

| Layer | What ADR-0011 names for `bringYourOwnAssistant` |
|---|---|
| Instance capability | Adapter-backed: (a) Assist Provider runtime per [`formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md) §2.1 — the formspec-web Provider implementation; (b) at least one transport binding per Assist §7 — WebMCP (§7.2), MCP (§7.3), postMessage (§7.4), HTTP (§7.5). Instance declares which transports it supports. Production: typically WebMCP + postMessage. Demo/stub: in-process polyfill. |
| Org policy | (a) Allowed assistant transports per Assist §7 (org may forbid HTTP transport but allow WebMCP — e.g., a tenant configured for strict client-side-only); (b) per-form override gating (org may forbid `required` on certain template classes — e.g., advance-directive templates default to `forbidden` org-wide); (c) data-residency declarations (org declares which assistant origins are permitted under its tenancy policy — relevant for HTTP transport). |
| Form policy | Three-tier per §3.1: `required` (form MUST expose Assist Provider), `allowed` (Passive Provider acceptable; Active Provider OPTIONAL per respondent consent), `forbidden` (form REJECTS Assist surface entirely). Optional `allowedToolCategories?: Array<"introspection" \| "mutation" \| "profile" \| "navigation">` for per-category restriction. |
| Resolved runtime profile | Enabled transports + allowed mutation scope + per-form posture tier + per-category restrictions. Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if the form requires assistant-friendliness but the instance lacks an Assist Provider transport binding. |

**Append-only key ordering.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts) the `RUNTIME_FEATURE_KEYS` tuple is append-only. Current order: `respondentPlace`, `status`, `documentPresentation`. **Coordination with FW-0033:** [FW-0033 design `thoughts/specs/2026-05-23-fw-0033-file-upload-design.md`](2026-05-23-fw-0033-file-upload-design.md) proposes appending `fileUpload` as the 4th key (its build row materializes the extension). If FW-0033 build lands first, FW-0062 build appends `bringYourOwnAssistant` as the 5th key. If FW-0062 build lands first, `bringYourOwnAssistant` is 4th and `fileUpload` is 5th. **The append-only ordering rule guarantees both can land independently without merge conflict;** FW-0062 reads the current tuple at build time and appends.

**Locale-conditional set.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts) `LOCALE_CONDITIONAL_FEATURE_KEYS`, this set is currently empty. `bringYourOwnAssistant` is **NOT** locale-conditional — the per-form policy doesn't change with locale; the resolver doesn't recompute on locale change for this key.

### 4.2 Port shape — adopter contract now; port shape deferred to FW-0062 build

Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md): post-MVP ports await consumer code. FW-0051 is a design row; FW-0062 is the build. The honest application is to specify the **adopter contract** here and let the port shape land with the build.

**Adopter contracts (what FW-0062 must satisfy).**

| Adopter axis | What it implies |
|---|---|
| Assist Provider runtime adapter | Implements the Assist §3 tool catalog over the formspec-engine `FormEngine` state. Returns `FieldDescription` with masked-by-default `value` per FW-0051 §3.2. Scrubs plaintext from `ValidationResult.message`. Mediates Stage 2 mutation through a confirm-gate dispatch into the adopter's UI shell. |
| WebMCP transport adapter (default) | Registers tools via `navigator.modelContext.registerTool()` per Assist §7.2; mediates confirms via `requestUserInteraction()`. SHOULD install a polyfill when native WebMCP is unavailable. |
| postMessage transport adapter (default for iframe-embedded forms) | `postMessage`-based binding per Assist §7.4; correlates with `callId`; isolates privileged extension APIs from injected page code. Composes with FW-0053 (embeddable widget) — the embed boundary is the Assist transport boundary. |
| MCP transport adapter (optional) | For server-mediated agents; preserves tool names + result envelopes per Assist §7.3; maps confirms to MCP user prompts. |
| HTTP transport adapter (optional) | For remote agents; per Assist §7.5; `GET /formspec/tools` + `POST /formspec/tools/{name}`. Subject to org policy data-residency restriction. |
| Consent affordance UI adapter | Renders the three-stage grant panel (§3.4) + per-field reveal affordances (§3.3). Anti-Clippy: ambient, pull-not-push, no persona, no avatar, keyboard-first. Adopter-styled per their UI conventions; consent semantics are the constant. |
| Per-field reveal grant store | In-memory session-scoped grant set; never persisted; never serialized off device. The Provider consults the grant set when answering `formspec.field.describe`. |

**Why not invent an `AssistProvider` port here.** Per ADR-0009 §(b) the bar is consumer code, not predicted-need. The Assist Provider is a substantial implementation; its port shape becomes obvious at build time when the adapter is co-implemented. **FW-0062 picks the port shape at build time.** Lean: a single `AssistProvider` port slot with transport-specific adapters, OR a port-per-transport surface with shared Provider state. The choice falls out at build time when the integration with `FormEngine` is wired.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a `bringYourOwnAssistant` block:

```text
bringYourOwnAssistant?: {
  posture: "required" | "allowed" | "forbidden"             // resolved per-form policy after org + instance
  enabledTransports: Array<"webmcp" | "mcp" | "postmessage" | "http">
  allowedToolCategories: Array<"introspection" | "mutation" | "profile" | "navigation">
  // Stage-state is session UI state, NOT in the runtime profile —
  // the profile is immutable per form-load; stage grants change at runtime.
}
```

The block is the resolver's read-only output. The shell consults `posture` at form-load (renders the consent affordance per §3.3 + §3.4 unless `forbidden`); `enabledTransports` (registers Provider with the supported transports); `allowedToolCategories` (filters the tool catalog before registration so out-of-policy tools never appear to the assistant in the first place).

**Sensitive-data discipline:** the resolved profile contains no plaintext, no per-field reveals, no session state. Stage grants live in the shell's session state, not the profile. The profile is recomputable from the instance + org + form policy without consulting any respondent action.

## 5. Failure semantics

### 5.1 Form-load failures

| Condition | Error per ADR-0011 |
|---|---|
| Form requires `bringYourOwnAssistant` but instance lacks any Assist Provider transport binding | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `bringYourOwnAssistant` with a specific transport requirement that the instance doesn't support | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `bringYourOwnAssistant` but org policy forbids the feature for the form's template class | `FeaturePolicyConflictError` at form-load |
| Form policy declares a transport restriction that conflicts with org policy | `InvalidRuntimePolicyError` at form-load |
| Form's `allowedToolCategories` includes a category not in the Assist §3 catalog | `InvalidRuntimePolicyError` at form-load |

**Silent downgrade is forbidden.** A form requiring `bringYourOwnAssistant` MUST fail-load on an instance without an Assist Provider. Falling back to "no assistant integration" silently would violate AP-007 (no degraded SLA for the assisted path) and the respondent's expectation per J-046.

### 5.2 Runtime failures

| Condition | Behavior |
|---|---|
| Assistant invokes a tool that's outside the resolved profile's `allowedToolCategories` | Provider returns `UNSUPPORTED` per Assist §4.2 with explanatory message; no policy-conflict surface to the respondent. |
| Assistant invokes `formspec.field.set` on a readonly or non-relevant field | Provider returns `READONLY` or `NOT_RELEVANT` per Assist §4.2; respondent is not bothered. |
| Assistant invokes `formspec.field.set` with `confirm: true` but the Provider has no confirm mechanism (transport limitation) | Provider returns `x-confirmation-required` per Assist §4.2; the assistant's invocation fails; no value applied. |
| Respondent revokes a per-field reveal mid-session | Subsequent `formspec.field.describe` for that path returns masked sentinel; the assistant sees the revoke take effect on its next read; no error surface needed. |
| Respondent revokes Stage 2 mid-session | Subsequent `formspec.field.set` returns `UNSUPPORTED` per Assist §4.2 with explanation; the Provider stops registering the mutation tools (or returns errors on each invocation; transport-specific). |
| Confirm gate is shown to respondent; respondent rejects | `formspec.field.set` returns `DECLINED` (per Assist §3.5 `ProfileApplyResult.skipped.reason`); no value applied. |

### 5.3 Cross-stack failures

| Condition | Behavior |
|---|---|
| WOS Assist Governance Proxy intercepts a tool invocation and rejects per deontic constraint | The proxy's rejection bubbles back as a per-tool error per Assist §4.2; respondent is not blocked; assistant adjusts. WOS owns the proxy's rejection vocabulary. |
| Multi-party flow: assistant attempts to introspect a field the requesting party cannot see per FW-0050 §7.1 | Provider returns `NOT_FOUND` per Assist §4.2 (the field is structurally invisible to this party; treat as if it doesn't exist) — same per-party-scoping discipline as the rest of the multi-party surface. |

## 6. Cross-stack dependency chain

### 6.1 The chain

```
FW-0051 design (this doc)
    ↓
web ADR-0011 — propose addition of bringYourOwnAssistant to Feature Ownership Table
    ↓
(no upstream-spec changes required — Formspec Assist Spec is sufficient at draft 1.0.0)
    ↓
(optional) EXT-33 — small assist-spec §6 / §11 clarifications (only if owner concurs; see §6.2)
    ↓
(no new cross-stack ADR required — XS-5 reserved for future need, see §6.4)
    ↓
FW-0062 build (formspec-web)
```

**This is the lightest cross-stack chain of the recent FW design rows.** The Formspec Assist Specification already covers the substrate; FW-0051 is a consumer-side refactor of formspec-web's posture against the existing contract. The asymmetry vs. FW-0048 (cross-stack XS-3 + EXT-5/EXT-30 substrate work) and FW-0049 (cross-stack XS-4 + EXT-31/EXT-32 + ADR-0074 promotion) is **the assist-spec's existence** — the team already did the upstream substrate authoring.

### 6.2 EXT-33 (proposed, optional) — assist-spec clarifications

**Proposed for upstream extension queue, OPTIONAL.** FW-0051 design proceeds without this; the assist-spec at draft 1.0.0 is sufficient. EXT-33 is a small-batch list of clarifications that would tighten the spec's normative floor in directions FW-0051 already runs. Land if owner concurs that upstream tightening is worth a small assist-spec revision.

**Candidate clarifications (uplift summary per architecture-review remediation 2026-05-23):**

1. **§4.4 `FieldDescription.value` masking semantics — RECOMMENDED uplift.** Add a non-normative note that Provider implementations MAY mask `value` by default and require explicit per-field reveal grant to unmask. Lets FW-0051's §3.2 discipline be cited as a recognized Provider posture rather than a private narrowing. **Uplift rationale:** the masked-default discipline is load-bearing for the staged-grant UX; without upstream codification, FW-0051's privacy posture has a soft floor — a different formspec-web Provider implementation (or a different Provider in another deployment of the spec) could ship plaintext-by-default and remain compliant with the spec. Promoted from OPTIONAL to RECOMMENDED.
2. **§11 security/privacy — add per-act + per-field reveal as a SHOULD pattern — RECOMMENDED uplift.** A new §11.8 SHOULD: "Providers serving forms whose runtime policy restricts default value-visibility SHOULD mask `FieldDescription.value` until the respondent invokes a per-field reveal affordance." Codifies FW-0051's §3.2 + §3.3 as a recognized pattern. **Uplift rationale: same as (1)** — without §11 codification, the privacy posture relies on a private narrowing the spec does not bind. Promoted from OPTIONAL to RECOMMENDED.
3. **§6 profile-matching — add a per-assistant scope hook (Q5 from research brief) — OPTIONAL.** If the assist-spec's §6 profile-matching is to support per-assistant grant + revocation (cross-form value reuse keyed per assistant), a per-assistant scope hook would land here. **NOT proposed for slice 1** — relies on browser's WebExtension permission model per §1.2 non-goal. Flagged for future.
4. **§3.3 mutation tools — runtime-policy-aware confirm-gate normative tightening — RECOMMENDED uplift.** A new §4.3 (6) MUST: "When the Provider's runtime policy declares a per-act confirm requirement for the mutation surface, the Provider MUST surface a confirm gate for every mutation invocation (regardless of `confirm: true` on the tool call)." Codifies FW-0051's §3.4 Stage 2 invariant as a recognized Provider posture. **Uplift rationale:** the interop asymmetry between FW-0051's MUST and the spec's §4.3 (5) SHOULD floor is honest only if codified upstream — without this clarification, FW-0051's stricter behavior reads as a private deviation from the spec rather than a recognized Provider posture. Promoted from OPTIONAL to RECOMMENDED.

**Status:** candidates (1) + (2) + (4) RECOMMENDED; candidate (3) OPTIONAL. FW-0051 design ratifies against the current assist-spec; EXT-33 RECOMMENDED items close the upstream codification gap. Land alongside (or shortly after) FW-0051 owner ratification.

### 6.3 No XS-N ratification required for slice 1

The substrate is in-spec at the Formspec layer; nothing in the Trellis envelope changes; WOS Assist Governance Proxy is an orthogonal composition surface that doesn't require FW-0051 to ratify a cross-stack ADR. **Slice 1 ships without an XS-N row.**

**XS-5 (reserved, not proposed) — future cross-stack scope.** If a future evolution requires cross-stack coordination (e.g., per-assistant audit-log entries flowing through Trellis, or WOS Assist Governance Proxy declaring a normative composition contract with the formspec-web Provider), XS-5 would land. **Not proposed in this design.** Numbered placeholder reservation so future references are unambiguous.

### 6.4 What FW-0051 ratifies standalone

**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `bringYourOwnAssistant` capability shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the resolved-profile block in §4.3, the three-tier form-policy + per-category restriction (§3.1), the failure-semantics binding.
- The masked-by-default + per-act reveal discipline per §3.2 + §3.3.
- The three-stage staged grant model per §3.4.
- The runtime invariants binding Assist §11 to formspec-web's Provider implementation (per-act confirm gate; plaintext scrub in validation messages; in-memory session-scoped grant store).
- The composition rules with FW-0050 (§7.1), FW-0049 (§7.2), FW-0048 (§7.3), FW-0058 (§7.6).
- The adopter-contract pattern over the `AssistProvider` runtime + transport adapters (§4.2) — the conformance fixture pattern can be authored now even though the port shape lands with FW-0062 build.
- The form-policy + org-policy + instance-capability shape (§4.1 + §5.1) — failures fall directly into existing ADR-0011 typed-error paths.

**Waits on upstream:**

- ADR-0011 amendment to enumerate `bringYourOwnAssistant` in the Feature Ownership Table (small edit; expected to land with this design's owner-ratification).
- (Optional) EXT-33 assist-spec clarifications. Land if owner concurs.
- Coordination with FW-0033's `RuntimeFeatureKey` extension order (append-only; no merge conflict per §4.1).

## 7. Hard binding to other FW rows

### 7.1 FW-0050 / FW-0061 — multi-party composition

When a form declares both `multiParty` AND `bringYourOwnAssistant`, the Assist Provider's tool catalog MUST be **per-party-scoped**. The introspection tools (`formspec.form.describe`, `formspec.field.list`, `formspec.field.describe`, `formspec.field.help`, `formspec.form.progress`) return data scoped to the requesting party's `visibleTo[]` per [FW-0050 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md). The mutation tools (`formspec.field.set`, `formspec.field.bulkSet`) reject writes to fields outside the requesting party's `editableBy[]` per FW-0050 §3.1 + Assist §4.3.

**Resolution.** The form-load resolver returns a per-party `bringYourOwnAssistant` block bound to the requesting party's identity. The Assist Provider implementation consults the per-party visibility when answering tool invocations; fields outside the party's visibility return `NOT_FOUND` per §5.3 (the field is structurally invisible to this party — treat as nonexistent). **No FW-0050 design `§7.x` extension required** — the FW-0050 §7.1 composition rule reads "a protectable field's `visibleTo[]` is intersected with the safe-address jurisdictional rule"; the same rule extends naturally: a field's `visibleTo[]` is intersected with the assistant's-per-party scope. FW-0050's substrate doesn't need a §7.x carve-out for FW-0051; the per-party-visibility primitive already covers it. **A small cross-row note is added to FW-0050's design's §7.3 "Other FW interactions" section to make the binding explicit.**

### 7.2 FW-0049 / FW-0060 — safe-address composition

Safe-*-class fields per [FW-0049 §3.3](2026-05-23-fw-0049-safe-address-handling-design.md) render masked across every respondent-facing surface; the Assist introspection surface is by definition a respondent-facing surface (the respondent's tool reads it). **The same masking discipline applies on the Assist surface**: `FieldDescription.value` for a safe-*-class field returns the masked sentinel even after a Stage 3 per-field reveal grant for that field. **The per-field reveal grant covers FW-0051's default mask (§3.2); the safe-*-class mask is a separate, higher-priority mask that survives the FW-0051 reveal.**

**Why:** FW-0049's mask exists for shoulder-surfing / screen-share defense; the respondent's own awareness of the value is mediated by their own UI's reveal (FW-0049 §3.3 "edit-mode IS reveal"). For the assistant case, the respondent revealing a safe-* value to the assistant is **a separate, stronger consent decision** than revealing a normal field's value. Slice 1 chooses the safer default: the Assist Provider NEVER unmasks safe-*-class fields, regardless of the respondent's per-field reveal grant. If a future use case demands safe-*-class fields be revealable to assistants (e.g., legal-aid software helping a survivor fill a benefits form), a follow-on row revisits with a stronger consent surface. **The discipline composes via "AND" not "OR": both masks must be lifted for unmask; the safe-* mask cannot be lifted by FW-0051's reveal.**

**Cross-row touch.** FW-0049 design's §7.3 "FW-0048 composition (coercion-adjacent)" section gets a sibling §7.x noting the FW-0051 composition. **A small update to FW-0049 design's §7 is added (or §7.x.5 sub-bullet under §7.3 noting cross-FW-row composition with FW-0051).**

### 7.3 FW-0048 / FW-0059 — coercion composition

A coercer who controls the respondent's assistant (malicious extension; coercer-installed tool; coercer sitting next to respondent instructing them) can use the assistant as a coercion amplifier. The per-act confirm gates + per-field reveals provide structural defense (the respondent still sees and confirms each value), but the social-engineering vector is real.

**Recommended composition pattern.** Forms in the FW-0048 high-coercion-risk template set ([FW-0048 §6.4](2026-05-23-fw-0048-coercion-aware-signing-design.md) names: financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect) SHOULD declare `bringYourOwnAssistant: forbidden` AND `duressAware: required`. The combined posture: no assistant surface to be coerced through, AND the duress channel is available if the respondent is being coerced through other means.

**Adopters MAY override.** The default recommendation for high-coercion templates is `forbidden`; a deployment that needs to support assistant-mediated fills for the same template class (e.g., immigration legal-aid that uses assistant tooling) can explicitly opt in by declaring `bringYourOwnAssistant: allowed` + accepting the increased coercion-vector residual risk.

**Cross-row touch.** FW-0048 design's §7 (per-party composition) gets a sibling note for FW-0051. **Light touch; informational rather than load-bearing.**

### 7.4 AP-002 — auto-apply prohibition

[AP-002](../../JOURNEYS.md) "MUST NOT auto-apply a signature from a single 'Adopt and Sign' click." The corresponding rule for assistant-mediated mutation: **the per-act confirm gate per §3.4 Stage 2 IS the satisfaction.** No assistant invocation applies a value silently; every mutation goes through the respondent's review. **Slice 1 enforces this as a runtime invariant** — the Provider's confirm gate is a MUST, not a SHOULD (tightening the assist-spec §4.3 (5) normative floor).

### 7.5 AP-007 — parity audit

[AP-007](../../JOURNEYS.md) "MUST NOT penalize the AI-decline or lower-AI path with worse SLA, fewer features, or scarier copy." The Test rule: "Parity audit on every branch — same fields, same fees, same SLA, same help text, same receipt. Differences are disclosed and justified. The receipt records *that* AI assistance occurred and per-field authorship lineage, but no aggregate 'AI score' is exposed to the receiving agency."

**FW-0051 satisfies AP-007 by:**

1. **No degraded path.** The respondent who declines all Stage 1+2+3 grants fills the form via the existing renderer with full functionality. No fields hide; no features disable; no copy turns scary; no SLA degrades.
2. **Per-field authorship lineage rides EXT-2.** When an assistant-suggested value is applied (after respondent confirm), the field's response-metadata provenance per [EXT-2 in `2026-05-22-upstream-extension-queue.md:36`](2026-05-22-upstream-extension-queue.md) records `attestedBy: "respondent"` + a source class like `sourceRef: "assistant-suggested"`. The exact provenance shape is EXT-2's authority; FW-0051 names the requirement. **The receipt records THAT AI assistance occurred at a per-field level (per AP-007 Test); no aggregate AI-score is computed or exposed.**
3. **No "AI score" exposed to the receiving agency.** The Assist tool surface does NOT compute, store, or expose any cross-field aggregate over assistant-suggested fields. The agency sees per-field provenance only (which they would also see for human-authored or prefilled values per EXT-2's same surface).

**Cross-row touch.** EXT-2 is queued; FW-0051 design references it as the provenance carrier. **EXT-2 documentation in the queue file gets a small note: "+ FW-0051 (per-field assistant-suggested provenance per AP-007 Test rule)."**

### 7.6 AP-024 — training consent

[AP-024](../../JOURNEYS.md) "MUST NOT train, evaluate, or improve models on respondent content without per-form, per-purpose, revocable consent." FW-0051 is the respondent's own assistant; the respondent's content flowing to the assistant is the respondent's own decision. **The form does NOT train, evaluate, or improve any model on respondent content** — the form has no model, no telemetry pipeline for respondent input, no aggregation. AP-024 binds the *form's* posture toward respondent content; FW-0051 doesn't change it.

**The respondent's cloud-AI choice IS subject to AP-024.** When the respondent chooses a cloud-AI assistant, the respondent's content transits to the cloud provider. The cloud provider may or may not satisfy AP-024 — that's the cloud provider's commitment, not the form's. The form's role per AP-024 is to **not surreptitiously route respondent content through ANY model** — confirmed; FW-0051 doesn't route through any model. The respondent's explicit per-act + per-field reveal IS the consent surface; the cloud provider's data-handling commitment is the respondent's evaluation. **FW-0051 satisfies AP-024 at the form-side; the cross-row touch is informational.**

### 7.7 FW-0058 — AI-agent filer (vocabulary clash; load-bearing distinction)

**FW-0058 is AI-as-respondent; FW-0051 is AI-as-helper-for-respondent.** The two rows are easy to confuse but architecturally distinct:

| Axis | FW-0058 (AI-agent filer) | FW-0051 (BYO-assistant) |
|---|---|---|
| Who fills the form | The AI agent (non-human capacity) | A human respondent |
| Substrate | WOS `actorExtension` adds `ActorKind::Agent`; `AgentInvoker` port per WOS ADR-0064; receipt has `agentChain` via EXT-3 capacity | No actor-extension change; no signature shape change; the AI runs in the respondent's tools |
| Trust model | The agent is a registered actor in the workflow; deontic constraints from WOS AI Integration Spec apply | The assistant is untrusted by the form; runs in the respondent's browser/tools; per-act consent from respondent |
| Capacity on AuthoredSignature | `capacity: "ai-agent"` + `agentChain` block (EXT-3) | None — the respondent is the signer; capacity is `self` |
| Provenance surface | Workflow provenance record per `capabilityInvocation` per WOS ai-integration.md §3.3.1 | Field-level provenance per EXT-2 (`attestedBy: respondent, sourceRef: assistant-suggested`) |
| Failure mode | WOS fallback chain (terminating in human review) | Per-act respondent rejects the suggestion; nothing applies |

**They can compose.** A form filled by an AI agent (FW-0058) may consult an external assistant (FW-0051) during its own fill. The composition would be FW-0058 wrapping FW-0051 — the AI agent acts as the respondent-role-equivalent and the BYO-assistant runs in the agent's tools. **Out of scope for slice 1; flag for future.**

**Cross-row touch — RESOLVED 2026-05-24.** [FW-0058 design landed](2026-05-24-fw-0058-ai-agent-filer-chain-design.md) with §7.7 reciprocating this vocabulary distinction in inverted framing (the symmetric mirror of this table). FW-0058 design also closes the EXT-3 `agentChain` deferral with the §3.2 10-property `AgentChainEntry` schema. The two-row composition (FW-0058 agent using FW-0051 BYO-assistant during its own fill) remains deferred per both rows; flagged for future when a real use case surfaces. PLANNING.md FW-0058 + FW-0051 cross-link bilaterally updated.

## 8. Open questions / deferrals

Honest list of what FW-0051 design does NOT resolve:

1. **The adversarial-extension full mitigation problem.** A malicious browser extension installed by the respondent CAN exfiltrate values the respondent reveals to it. Structural defenses (per-act + per-field) hold; a determined adversary with shell access to the user's browser wins. **Out of any form-layer mechanism's reach.** Documented; not mitigated by this design.
2. **Per-assistant identity / revocation across transports.** Browser-mediated per-extension consent covers WebMCP slice 1; postMessage / MCP / HTTP transports require per-transport per-assistant semantics that fall out at FW-0062 build time per the transport's native trust model — postMessage trust boundary is the iframe's origin (per FW-0053 embeddable widget composition); MCP trust binding is per-MCP-server-handshake; HTTP precedent is OAuth-style flow per the org-policy data-residency declaration. **Slice 1 trusts the browser's per-extension boundary for WebMCP; non-WebMCP transports inherit their native trust model at build time.** Per-assistant grant + revocation as a cross-transport identity surface is a follow-on if a real cross-transport use case demands it (research brief Q5).
3. **Cloud-AI provider data-handling guarantees.** When the respondent reveals to a cloud AI, the form's reach ends. The form makes the per-act reveal explicit; the cloud-provider-trust decision is the respondent's. **Out of any form-layer mechanism's reach.**
4. **Coercer instructs respondent via assistant.** Per §7.3 the composition pattern (high-coercion templates default to `forbidden`) provides defense; coercion-via-tool-manipulation is structurally adjacent to FW-0048's threat model. **Mitigation = composition with FW-0048's duress channel; not a FW-0051 design gap.**
5. **The FW-0058 composition (AI-agent filer using BYO-assistant).** Per §7.6 flagged for future; not in slice 1 scope.
6. **Cross-form assistant-mediated profile flow.** Assist §6 covers cross-form profile matching at the spec layer; per-assistant scoping on the profile is research brief Q5. **Out of FW-0051 slice 1.** Browser's WebExtension + Assist §6 + Assist §11.5 cover the slice 1 use cases.
7. **Receipt-side declaration that assistant was used.** Per AP-007 Test rule: per-field authorship lineage in the receipt. **Carried by EXT-2** (already queued). FW-0051 names the requirement; EXT-2 is the carrier. **No FW-0051-specific provenance work; the EXT-2 entry gets a note as cross-row touch.**
8. **Assist-spec `draft` status.** The assist-spec is `1.0.0-draft.1`. Promotion to ratified is upstream work. FW-0051 design proceeds against the draft. **If the assist-spec evolves in ratification, FW-0051 follows.**
9. **Side-channel inference via validation-error patterns or response timing.** Out of scope for slice 1; assistant's incentive structure is the practical mitigation.
10. **WOS Assist Governance Proxy implementation.** The composition seam is named (§7); the proxy itself is WOS substrate work.

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: three-tier `required\|allowed\|forbidden` + optional `allowedToolCategories[]` | PROPOSAL | owner review + ADR-0011 evolution |
| Q2: default-mask `FieldDescription.value` + per-field reveal as the unmask gate | PROPOSAL | owner review |
| Q3: per-act, per-session, explicit, revocable per-field reveal | PROPOSAL | owner review |
| Q4: three-stage staged grant (structure-see → propose-values → per-field-value-reveal) | PROPOSAL | owner review |
| `bringYourOwnAssistant` capability addition to ADR-0011 Feature Ownership Table | PROPOSAL | owner review + ADR-0011 amendment |
| Assist Provider runtime invariant: per-act confirm gate is MUST (tightens assist-spec §4.3 (5) SHOULD floor) | PROPOSAL | owner review |
| Adopter contracts over Assist transport adapters + consent UI adapter + per-field reveal grant store; port shape deferred to FW-0062 build per ADR-0009 §(b) | PROPOSAL | owner review |
| EXT-33 (new) — assist-spec clarifications: (1) `FieldDescription.value` masking note + (2) per-act + per-field-reveal §11 SHOULD + (4) runtime-policy-aware confirm-gate MUST = RECOMMENDED uplift (without (1) + (2), a different Provider could ship plaintext-by-default and remain spec-compliant; without (4), FW-0051's MUST reads as private deviation from §4.3 (5) SHOULD); (3) per-assistant scope hook stays OPTIONAL | PROPOSAL to formspec | formspec spec-expert review |
| No XS-N required for slice 1 (assist-spec covers substrate; nothing in Trellis envelope changes) | PROPOSAL | owner review |
| Multi-party composition per FW-0050 §7.1 (per-party scoping on Assist tool catalog) | PROPOSAL | owner review + FW-0050 design author |
| Safe-address composition per FW-0049 §3.3 (safe-* mask survives FW-0051 reveal) | PROPOSAL | owner review + FW-0049 design author |
| Coercion composition per FW-0048 §6.4 (high-coercion templates default `forbidden`) | PROPOSAL | owner review + FW-0048 design author |
| FW-0058 vocabulary distinction (FW-0058 = AI-as-respondent; FW-0051 = AI-as-helper-for-respondent) | PROPOSAL | owner review + FW-0058 row body |
| EXT-2 provenance binding for per-field assistant-suggested authorship (AP-007 Test rule) | PROPOSAL | owner review + EXT-2 queue annotation |

**Row status change:** FW-0051 moves from `open` to `in design`. FW-0051 stays open until this design is owner-ratified and ADR-0011 amends to include `bringYourOwnAssistant` in the Feature Ownership Table.

## 10. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc; the assist-spec IS the structure-export contract)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`bringYourOwnAssistant` is post-MVP; this design stages for post-MVP)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §4.2 defers `AssistProvider` port shape to FW-0062 build per §(b))
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (the design proposes adding `bringYourOwnAssistant` to the Feature Ownership Table)
- [Formspec Assist Specification v1.0 — `formspec/specs/assist/assist-spec.md`](../../../formspec/specs/assist/assist-spec.md) — **the canonical structure-export contract this design refactors formspec-web's posture against**
- [WOS AI Integration Spec §14 — `work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) — Assist Governance Proxy (orthogonal composition seam; §7 names)
- [FW-0048 design 2026-05-23](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-aware signing (composition seam at §7.3)
- [FW-0049 design 2026-05-23](2026-05-23-fw-0049-safe-address-handling-design.md) — safe-address handling (composition seam at §7.2; safe-* mask survives FW-0051 reveal)
- [FW-0050 design 2026-05-23 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party (composition seam at §7.1; per-party scoping on Assist tool catalog)
- [FW-0033 design 2026-05-23](2026-05-23-fw-0033-file-upload-design.md) — file upload (parallel design row also extending `RuntimeFeatureKey`; append-only coordination per §4.1)
- [EXT-2 (response metadata envelope) — `thoughts/specs/2026-05-22-upstream-extension-queue.md:36`](2026-05-22-upstream-extension-queue.md) — per-field provenance carrier for assistant-suggested values (AP-007 Test rule)
- Source brief: [`thoughts/sketches/2026-05-23-fw-0051-bring-your-own-assistant-research-brief.md`](../sketches/2026-05-23-fw-0051-bring-your-own-assistant-research-brief.md)
- Journey: [J-046 in `JOURNEYS.md:767`](../../JOURNEYS.md)
- Anti-patterns: [AP-002 in `JOURNEYS.md:59`](../../JOURNEYS.md), [AP-007 in `JOURNEYS.md:89`](../../JOURNEYS.md), [AP-024 in `JOURNEYS.md:191`](../../JOURNEYS.md)
- External prior art: W3C Permissions API, WebMCP (WICG-incubated), Anthropic MCP, WebExtensions API, OAuth 2.0 scopes, WAI-ARIA Accessibility Tree, EU AI Act Art. 13, GDPR Art. 7
