# FW-0058 AI-agent filer chain — Research Brief

**Status:** Sketch / research artifact. Not a design proposal. Seeds the design conversation.
**FW row:** [FW-0058 in `PLANNING.md:682`](../../PLANNING.md) (design).
**Journey:** [J-012 in `JOURNEYS.md:343`](../../JOURNEYS.md) — the AI-agent slice ("filer ≠ signer ≠ subject", four-party non-human chain).
**Anti-patterns:** [AP-014 (coercion) in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-024 (training consent) in `JOURNEYS.md:191`](../../JOURNEYS.md).
**Feature key (proposed):** `aiAgentFiler` — would be a new entry in [web ADR-0011 Feature Ownership Table line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md); currently NOT enumerated.

The headline finding: **the substrate is already in place across WOS + Formspec — FW-0058 is a consumer-side composition that names the formspec-web posture and proposes one schema extension and one cross-stack confirmation ADR.** WOS already specifies agents as first-class actors (ADR-0064 `ActorKind::Agent`, `AgentInvoker` port, `capabilityInvocation` provenance per ai-integration.md §3.3.1, deontic constraints + autonomy caps + fallback chains, agent disclosure per §12 for rights-impacting workflows). Formspec already pre-allocated `ai-agent` as a `capacity` enum value in EXT-3 with `agentChain` flagged for FW-0058 split. Trellis is byte-neutral — signatures are signatures. The work is: name `aiAgentFiler` as a capability key, ratify the `agentChain` shape on `AuthoredSignature`, bind the WOS `capabilityInvocation` provenance to the receipt-rendering surface, write the threat model, distinguish FW-0058 firmly from FW-0051.

The hardest finding: **identification is the load-bearing primitive**, not authorization. The receipt MUST be unable to be confused with a human-authored receipt — that is the J-012 promise ("the receipt must say so"). Authorization (does this agent have authority to file?) and audit (was the agent actually invoked at the claimed time?) ride above identification. The cryptographic substrate is *unchanged*: the agent's identity key signs a standard Formspec Signed Response Payload; the `agentChain` is metadata on the `AuthoredSignature` that the verifier walks to render the four-party chain (agent → operator → accountable human → scope). **GDPR Article 22 surfaceability is then a consequence of identification done right** — a downstream data subject can ask "was this decision substantially automated?" and the receipt answers definitively.

---

## 1. Upstream Primitive Inventory

### 1.1 WOS — first-class agents already specified

[`work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) v1.0.0-draft.1. Already specifies:

| Primitive | Section | FW-0058 relevance |
|---|---|---|
| `ActorKind::Agent` via `actorExtension` seam | §3.1 + Kernel §10.1 | **The agent is a first-class actor** in the workflow envelope. Joined to `agents[]` runtime declaration by `id` per ADR-0064. Not a synthesized role; an enumerated actor type. |
| `AgentInvoker` port (substrate-neutral) | §1.4 + ADR-0064 | Discriminator selects adapter (Anthropic SDK / Claude Agent SDK / MCP / A2A / HTTP / stub). **WOS specifies the governance contract; the substrate is adapter-tier.** This is precisely the "narrow port, swap implementations" pattern the stack-root CLAUDE.md HIGH-PRIORITY rule mandates. |
| `capabilityInvocation` provenance | §3.3.1 | Every capability call MUST produce a `recordKind: "capabilityInvocation"` provenance record. **This is the audit primitive**: when the receipt says "agent filed at T," the WOS-side `capabilityInvocation` record is the load-bearing artifact. |
| Deontic constraints (permission / prohibition / obligation / right) | §4 | OASIS LegalRuleML-derived. **The form-side `aiAgentFiler` posture composes with WOS-side deontics**: a form that allows agent filing AND a WOS workflow that prohibits agent submission of a specific field both apply. |
| Autonomy levels (autonomous / supervisory / assistive / manual) | §5 | **Rights-impacting and safety-impacting workflows default-cap at `assistive`** (§5.3 (4)) — i.e., the agent proposes; a human reviews + confirms. **This is the WOS-side substrate for the "human-in-loop required" form-policy tier.** |
| Confidence framework (floor + decay + cumulative) | §7 | Every agent output carries a `ConfidenceReport`; floor enforcement is in the deontic ordering (S4.6 step 4). **FW-0058's role: name the recommended floor for rights-impacting forms; defer to WOS for the runtime enforcement.** |
| Fallback chains | §8 | MUST terminate in `escalateToHuman` or `fail`. **Graceful degradation is a WOS invariant; FW-0058 does NOT need to specify fallback substrate.** |
| Agent disclosure per `lifecycleHook` on `adverse-decision` tags | §12 | **For rights-impacting workflows, `discloseThatAgentAssisted` MUST be `true`** (§12.2). Consistent with OMB M-24-10 + EU AI Act Art. 13. **This is the upstream substrate for the receipt-disclosure surface FW-0058 names.** |
| Trust boundary: agent is OUTSIDE the trust boundary | §3.5 | The WOS Processor (not the agent) enforces constraints. **Form-side analogue: the form trusts the WOS workflow's governance, NOT the agent itself.** |
| Kernel §10.5 agent submission gate | Kernel spec.md:2107 | "If the actor is an agent, the actor MUST be registered through `actorExtension` and provenance MUST record `actorType: \"agent\"` plus agent identity, model/version, confidence/source metadata when available, and any `principalActorId` or `delegationRef`. Rights-impacting and safety-impacting respondent submissions still require a human or legally delegated authority. If these agent requirements fail, reject with `agentSubmitterUnauthorized`." **THIS is the WOS-side primitive for the form-side rejection path** (form requires human submission + agent submits → typed error). |

**Takeaway.** The WOS substrate is sufficient for the agent-as-actor + invocation-provenance + governance-constraint pipeline. FW-0058's work is to (a) compose this substrate at the formspec-web layer (the `aiAgentFiler` posture toggle + receipt rendering), (b) name the `agentChain` shape that EXT-3 deferred, (c) propose the cross-stack confirmation ADR (XS-6) confirming the formspec + WOS + trellis composition is coherent.

### 1.2 Formspec — `ai-agent` capacity pre-allocated; `agentChain` deferred to FW-0058

[`formspec-web/thoughts/specs/2026-05-22-upstream-extension-queue.md:46` EXT-3](2026-05-22-upstream-extension-queue.md). Already specifies:

| Element | Status | FW-0058 relevance |
|---|---|---|
| `AuthoredSignature.capacity` enum | EXT-3 proposed, NOT yet ratified | Enum includes `self | poa | guardian | executor | parent | licensed-professional | corporate-officer | ai-agent`. **The `ai-agent` value is pre-allocated.** |
| `AuthoredSignature.principalRef` | EXT-3 proposed | URN party identifier. For agent capacity, this names the accountable human/entity the agent acts on behalf of. |
| `AuthoredSignature.authorityArtifact` | EXT-3 proposed | URI + hash + type. For agent capacity, this names the delegation token / corporate resolution / machine-operator chain. |
| `agentChain` block | **DEFERRED to FW-0058** per EXT-3 row body | "AI-agent variant gets a separate `agentChain` block — defer per FW-0058 split." **This is the schema work FW-0058 owns.** |
| `partyRole` (multi-party composition) | EXT-3 multi-party extension proposed by FW-0050 §6.3 | Closed enum `coEqual | asymmetricPrimary | asymmetricSecondary | guardianFor`. **Composes with `agentChain`** — an agent can fill as one party in a multi-party flow. |

**Existing `AuthoredSignature` envelope** ([`formspec/schemas/response.schema.json`](../../../formspec/schemas/response.schema.json) line 119+) carries `signerName`, `signerId`, `signerEvidence`, `signedPayload`, `documentHash`, `identityBinding`, `consentText`, etc. **The base envelope is unchanged for agent capacity** — the agent's identity key signs the same Formspec Signed Response Payload. The agent-specific surface is metadata.

**Existing per-field provenance carrier:** EXT-2 (`metadata.provenance[path]` with `{class, sourceRef, capturedAt, attestedBy}`). **For FW-0058**, an agent-filed field SHOULD carry `attestedBy: "ai-agent"` + `sourceRef` naming the agent identifier (e.g., `"ai-agent:urn:wos:agent:procurement-helper-v3"`). This rides EXT-2; no FW-0058-specific provenance work needed at the field level. **The agent-side audit trail at the field level is EXT-2's responsibility; FW-0058 owns the signature-level chain.**

### 1.3 Trellis — byte-neutral, signatures are signatures

[`trellis/specs/`](../../../trellis/specs/). No special primitive expected. The case ledger / COSE envelope / HPKE wrap operate identically whether the signer is a human or an agent — bytes are bytes; signatures are signatures. The `AuthoredSignature.identityBinding` already encodes the auth method used (provider-neutral per the existing schema); for agent capacity, the binding names the agent's identity-key registration source (e.g., a WOS-registered agent identity provider).

**The Trellis substrate change is ZERO.** XS-6 (the cross-stack ADR FW-0058 proposes) confirms this explicitly so downstream readers don't search for an agent-specific Trellis primitive that does not need to exist.

### 1.4 PKAF — `AILineage` is the assertion-side AI tracking, NOT the filer chain

[`PKAF/spec/rkaf-core.md:175`](../../../PKAF/spec/rkaf-core.md) §5.3. `rkaf:AILineage` requires `modelId`, `modelVersion`, `promptTemplateRef`, `temperature`, `seed`, `inputContextHash`, `humanApprover`, `humanRationale` (when `aiPromoted` or `humanQualified`). **Scope:** an Assertion with `assertionOrigin ∈ {aiSuggested, aiPromoted, humanQualified, humanRevalidation}` MUST carry `hasAILineage`.

**The vocabulary clash:** `AILineage` is assertion-side AI provenance — it tracks AI involvement in producing a *policy knowledge claim* (e.g., "this case satisfies eligibility rule X" generated by AI). FW-0058's `agentChain` is filer-side AI provenance — it tracks AI involvement in *filing a form*. **Different scopes, different concerns**. They compose downstream (an agent that files a form may later produce a Rulespec assertion citing the filed value; the assertion carries `AILineage` describing the agent → human-approver path). **FW-0058 design does NOT extend `AILineage`; PKAF stays out of the FW-0058 substrate.**

Per the substrate-ownership rule: filer-chain identification is upstream of assertion authoring; `AILineage` is downstream of assertion authoring. FW-0058 owns the upstream; PKAF owns the downstream; no overlap.

### 1.5 web ADR-0011 — `aiAgentFiler` NOT enumerated

[Feature Ownership Table at line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Compared to FW-0049's `safeAddress` (already enumerated at line 149) and FW-0050's `multiParty` (already enumerated at line 148), **`aiAgentFiler` is absent.** FW-0058 proposes the addition as part of this design.

Proposed shape (analogous to existing `safeAddress` entry):

| Layer | What ADR-0011 would name for `aiAgentFiler` |
|---|---|
| Instance capability | Adapter-backed: (a) WOS `AgentInvoker` adapter binding per WOS ADR-0064 (so the workflow can actually invoke an agent); (b) agent identity provider / verifiable-credential resolver (so the receipt verifier can resolve the agent's identity key); (c) audit-trail render adapter (for the four-party chain display). |
| Org policy | (a) Allowed agent classes / capability scopes per WOS deontic-constraint catalog; (b) per-form override gating (org may forbid `required` on rights-impacting template classes — `assistive` autonomy cap remains the WOS default); (c) human-accountability declarations (org names the human/entity accountable for any agent action under its tenancy policy). |
| Form policy | Three-tier `forbidden | allowed | required` with a fourth `optional` floor for backwards compatibility. `required` = form REQUIRES agent capacity (e.g., procurement-automation form designed for agent-only filing). `allowed` = form accepts either human or agent capacity per the deployment. `forbidden` = form REJECTS agent capacity (e.g., a healthcare consent form requiring human signature). |
| Resolved runtime profile | Enabled agent identity providers + allowed agent classes + per-form posture tier + WOS workflow-governance reference (when the workflow declares `agents[]`). Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if the form requires agent capacity but the instance lacks an `AgentInvoker` adapter, OR `FeaturePolicyConflictError` if the form FORBIDS agent capacity and the deployment is wired for agent-only operation. |

**Failure surface confirms the ADR-0011 typed-error pattern applies directly.** No FW-0058-specific failure surface needed beyond the standard typed-error → plain-language render path.

### 1.6 EXT-3 — `agentChain` is the schema work FW-0058 owns

Per EXT-3 row body: "AI-agent variant gets a separate `agentChain` block — defer per FW-0058 split." FW-0058 design's substrate work is to name this shape. Proposed:

```text
agentChain?: AgentChainEntry[]   // ordered, root-most-authority first
AgentChainEntry {
  agentId: string                 // URN naming the agent (e.g., "urn:wos:agent:procurement-bot-v3")
  agentClass: "automated" | "semi-autonomous" | "human-in-loop"  // mirrors WOS autonomy taxonomy
  modelIdentifier?: string        // for generative agents per WOS §3.1
  modelVersion?: string           // for generative agents per WOS §3.1
  delegatedBy: string             // URN of the delegating party (next-up authority)
  delegatedAt: string             // RFC 3339; when this delegation was granted
  delegationScope: string         // FEL expression OR free-text describing the delegation bounds
  delegationArtifact?: {          // optional cryptographic delegation token
    uri: string
    hash: string
    type: string
  }
  capabilityInvocationRef?: string // ref to WOS `capabilityInvocation` provenance record
  confidenceRef?: string          // ref to WOS `ConfidenceReport` for this fill
}
```

**Walked from end to start = the four-party chain J-012 names.** The terminal entry's `delegatedBy` resolves to the **accountable human or entity** (e.g., `"urn:formspec:entity:acme-corp"`). The signer's `AuthoredSignature.signerId` IS the first entry's `agentId` (the agent that physically signed). The chain is composable for multi-hop scenarios (sub-agent acting on behalf of a parent agent acting on behalf of a corporate operator acting on behalf of a human).

**Verifier discipline.** The verifier walks the chain end-to-start, resolves each `delegatedBy` to the next entry's `agentId` (or the terminal accountable entity), and renders the four-party chain. **A break in the chain (broken reference, missing artifact, expired delegation) is a verification failure, not a soft warning.** AP-023's "MUST distinguish integrity / attribution / capacity / truth" rule: the verifier attests to *capacity* (the agent was acting in this role on the named authority chain), NOT *truth* (the underlying facts).

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0058 |
|---|---|---|
| **FW-0051** BYO-assistant | [`PLANNING.md:636`](../../PLANNING.md) | **Vocabulary distinction (load-bearing).** FW-0051 = AI helps a human respondent fill; FW-0058 = AI fills the form as a non-human actor. Already documented in FW-0051 design §7.6. FW-0058 design's §7.6 reciprocates with the inverted framing. **Composition (deferred):** a FW-0058 agent may consult a FW-0051 BYO assistant during its own fill; both rows defer this composition to a future row. |
| **FW-0048 / FW-0059** Coercion-aware signing | [`PLANNING.md:598`](../../PLANNING.md), [`PLANNING.md:693`](../../PLANNING.md) | **A compromised LLM / prompt-injected agent IS a coercion vector.** Per FW-0048 §3 threat model: coercion is "non-respondent influence on the signing act." A prompt-injected agent that fills under attacker control is structurally identical to a coerced human signer. **Composition rule:** when both `aiAgentFiler` AND `duressAware` are declared, the duress-channel primitive ports over (an agent's WOS-side `capabilityInvocation` record can carry a duress flag; the receipt is byte-identical per FW-0048 §3.2). **Cross-row touch needed.** |
| **FW-0049 / FW-0060** Safe-address | [`PLANNING.md:611`](../../PLANNING.md), [`PLANNING.md:704`](../../PLANNING.md) | **Agent acting on behalf of a protected party.** A property-management agent filing a tenant application on behalf of a survivor; a benefits-AI filing on behalf of a protected elder. The agent itself doesn't gain visibility into the safe-* fields (the safe-* mask survives the agent's read just as it survives the BYO assistant's read per FW-0049 §3.3). **Composition pattern:** safe-* class fields render masked to the agent's introspection surface; the agent submits the form WITHOUT seeing the underlying safe-* value; the receipt carries the safe-* class declaration unchanged. **Cross-row touch needed.** |
| **FW-0050 / FW-0061** Multi-party | [`PLANNING.md:624`](../../PLANNING.md), [`PLANNING.md:715`](../../PLANNING.md) | **Agent as one party.** A corporate agent filing one party's portion of a joint corporate filing. The `partyRole` field per FW-0050 §6.3 composes with the `agentChain` per FW-0058 — the agent's `AuthoredSignature` carries BOTH `capacity: "ai-agent"` + `agentChain` AND `partyRole: "asymmetricPrimary"`. **Composition rule:** per-party visibility per FW-0050 §7.1 applies to the agent's introspection surface identically. **Cross-row touch needed.** |
| **FW-0034 / FW-0038** Honest-correction | [`PLANNING.md:468`](../../PLANNING.md), [`PLANNING.md:505`](../../PLANNING.md) | **Agent-issued correction.** An agent may discover a mistake in an earlier filing and issue a correction. The correction's `AuthoredSignature` carries the SAME `agentChain` as the original filing (or a refreshed chain if delegation changed). **Per-row composition:** EXT-5's `response.correction-recorded` event already carries the authoring signer; the `agentChain` rides naturally. **No new cross-row substrate needed**; FW-0034's existing per-party `partyRef` field generalizes to per-agent attribution via the signer-side `agentChain`. **Cross-row touch is informational (one cross-link).** |
| **FW-0030** Federated identity | [`PLANNING.md:437`](../../PLANNING.md) | **Agent identities federated from external trust roots.** The agent's identity key SHOULD be registered with an external trust root (corporate-managed identity provider, WOS-deployment's agent registry, verifiable-credentials wallet). Per SC-4 (presentation method registry) the agent identity binding rides the same `urn:formspec:sig-method:*` framework as human signatures; the `identityBinding.authMethod` discriminator extends to include agent-identity providers. **Cross-row touch is informational** — FW-0030's substrate (identity federation per ADR-0007 + EXT-8a + SC-4) generalizes to agent identities without modification. |
| **AP-014** Coercion | [`JOURNEYS.md:131`](../../JOURNEYS.md) | **The prompt-injection vector.** Agent under prompt-injection attack is a coercion vector that the human-coercion threat model didn't anticipate. **Mitigation:** WOS deontic constraints + autonomy caps + confidence floor + fallback chain (WOS substrate). FW-0058 names the threat; the substrate mitigation is WOS-side. **Composition pattern:** for rights-impacting forms, the form policy SHOULD set `aiAgentFiler: allowed` (not `required`) AND the WOS workflow SHOULD cap effective autonomy at `assistive` (a human reviewer confirms the agent's fill). Combined: agent proposes; human reviews; receipt records both. |
| **AP-024** Training consent | [`JOURNEYS.md:191`](../../JOURNEYS.md) | **The data-flow concern.** An agent that files a form may transmit the form content to its inference backend. The respondent (the accountable human at the chain's tail) MUST have visibility into this data flow. **Composition pattern:** the `agentChain` chain entry's `agentClass` declares the agent's data-handling tier; the receipt rendering surfaces this for downstream review. **The form does NOT train on agent-filed content** (same rule as for BYO assistant); the agent's data-handling is the agent operator's responsibility, NOT the form's. |
| **AP-023** Verified ≠ true | [`JOURNEYS.md:185`](../../JOURNEYS.md) | **The verifier discipline.** The verifier attests to capacity (the agent was acting under the named authority chain), NOT truth (the agent's claims about the case are accurate). **The four-party chain renders as "X agent acting under Y operator under Z accountable human under W scope" — never as "this is a true statement."** Same discipline as for human signers; just extended to the agent case. |

---

## 3. Threat Model — Four Grounded Scenarios

Each scenario gives: the setup, what the FW-0058 mechanism must achieve, what this row's posture provides.

### 3.1 Tax-prep AI fills 1040 on user behalf; user reviews + signs

- **Setting.** A tax-prep AI (cloud-hosted, vendor-operated) reads the user's documents, fills Form 1040, submits via the IRS portal. The user authorized the AI's filing capacity in a vendor agreement; reviews the filled form pre-submission; signs it.
- **Filing capacity.** **`capacity: "self"`** — the user reviewed and signed. The AI's contribution is per-field provenance (`attestedBy: "ai-agent", sourceRef: "vendor-tax-ai"` via EXT-2). **This is NOT a FW-0058 case** — the user is the signer. **It's a FW-0051 case** (BYO-assistant during fill) plus EXT-2 (per-field attribution).
- **Why this is the boundary case to name.** Until "AI fills" includes "human signs," it's FW-0051. The FW-0058 case is when the agent IS the signer. **Vocabulary discipline matters here.**

### 3.2 Healthcare-form AI assists elderly user with delegated family authority

- **Setting.** A healthcare-form AI (deployed by a hospital system) helps an elderly user (or files unattended with delegated family authority) complete an annual benefits-redetermination form. The user is at-risk for inattention; the family member has POA; the AI acts under the POA delegation.
- **Filing capacity.** **`capacity: "ai-agent"`** (when the AI files unattended under POA) OR **`capacity: "self"` with AI-attribution per EXT-2** (when the user is present + signs). The non-trivial case is the unattended one: the AI's `AuthoredSignature` carries `capacity: "ai-agent"` + `agentChain` walking AI → family member (with POA artifact) → patient.
- **Required FW-0058 features.** (a) `agentChain` schema (FW-0058 §3 design output). (b) Verifier renders four-party chain ("filed by AI agent under POA delegation from [family member] on behalf of [patient]"). (c) WOS workflow governance gate (`agents[]` declaration in the benefits-redetermination workflow) confirms the AI is authorized for this capability. (d) The receipt is unambiguous about who acted.

### 3.3 Property-management corporate agent files tenant application (no human in loop)

- **Setting.** A property-management firm has an agent (LLM-backed; semi-autonomous) that intakes prospective-tenant emails and submits property-application forms to the building-management company. No human reviews each filing; the firm's compliance officer reviews periodic audit logs. The receiving system (building-management) accepts agent submissions for non-rights-impacting fields (contact info, move-in date) but requires human signature for the lease itself.
- **Filing capacity.** **`capacity: "ai-agent"`** with `agentChain` walking the agent → the property-management firm's authorized operator → the firm itself. The receiving form's `aiAgentFiler: allowed` declaration permits the agent capacity; the form's downstream lease step declares `aiAgentFiler: forbidden` (forcing the human-signature requirement).
- **Required FW-0058 features.** (a) Per-form-policy capability tier — the application-form accepts agents; the lease-form rejects them. (b) WOS workflow governance — the receiving workflow's `agents[]` block declares which capabilities are agent-authorized; the deontic constraints declare per-field scope (e.g., "agent MAY produce contact-info; agent MAY NOT produce signature for the lease"). (c) Receipt clearly says "filed by agent" for the application; the lease cannot be filed by the agent in the first place.

### 3.4 Adversarial — unauthorized scraping agent fills forms without permission

- **Setting.** A scraping-bot operator deploys an LLM-backed agent to fill rate-shopping insurance forms on behalf of consumers (who didn't authorize this). The agent submits forms en masse via the public form URL.
- **Required FW-0058 features.** Defenses that hold against an adversarial agent operating without authorization.
- **Design posture.** **Layered defense.** (a) **Bot-protection per AP-019** — privacy-preserving attestation (WebAuthn user-present assertion, Apple Private Access Tokens, Cloudflare Turnstile non-interactive) covers the bulk-submission baseline; an agent without a registered identity FAILS at this layer. (b) **Identity binding** — an agent attempting to file MUST present a registered agent-identity binding (per SC-4 + EXT-8a); an unregistered agent fails. (c) **Form-policy enforcement** — a form declaring `aiAgentFiler: forbidden` refuses the agent's submission with a typed `FeaturePolicyConflictError`. (d) **Volume constraints per WOS §11.1** — if the agent IS registered AND the form allows agent filing, the WOS-side volume limits apply (`maxAutonomousPerHour`, `maxAutonomousPerDay`); excess is escalated to human review. (e) **Honest disclosure** — when the form policy is `forbidden` and an agent attempts to submit, the form returns an explicit "this form requires a human signer" error in the API response; the agent operator cannot silently retry with a forged human-capacity declaration (the `capacity: "self"` claim would require the identity binding to resolve to a human-class identity, which a registered agent identity cannot satisfy).

**Implication for the design:** FW-0058 design's posture is **optimized for scenarios 3.2 + 3.3** (legitimate authorized-agent filings) **with structural defenses adequate for 3.4** (adversarial unregistered agent cannot pass identity + bot-protection gates; adversarial registered agent is bounded by WOS deontic + volume substrate). **Scenario 3.1 (AI fills + human signs) is explicitly NOT FW-0058's territory** — that's FW-0051 + EXT-2; vocabulary discipline matters.

---

## 4. Open Scope Questions for the Design

Prioritized — ask the first 3-4 before the rest.

### Top 4 to ask first

**Q1. Form-policy shape — three-tier `forbidden | allowed | required` or four-tier with `optional` floor?**

The ADR-0011 form-policy enum is `required | optional | forbidden`. For `aiAgentFiler`:

- **Three-tier `forbidden | allowed | required`.** `required` = form REQUIRES agent capacity (procurement-automation form). `allowed` = form accepts either human or agent capacity. `forbidden` = form REJECTS agent capacity (healthcare consent, advance directive, marriage/divorce).
- **Four-tier including `optional` floor.** Adds an `optional` tier between `allowed` and `required` for backwards-compatibility with existing ADR-0011 patterns.

**→ Drives the resolved-profile shape.** Lean: **three-tier `forbidden | allowed | required`**. Mirrors FW-0049 (`safeAddress`) and FW-0050 (`multiParty`) three-tier shape directly. The `optional` tier doesn't carry distinct meaning for `aiAgentFiler` (allowing the agent IS optional acceptance; the form policy doesn't need a softer floor).

**Q2. `agentChain` shape — flat list with end-to-start authority order, or nested parent-child structure?**

The four-party chain can be encoded two ways:

- **Flat list.** Ordered array of `AgentChainEntry` records; index 0 = signer (the acting agent); terminal entry's `delegatedBy` resolves to the accountable human/entity. Walked end-to-start renders the chain.
- **Nested structure.** Each entry contains a `delegatedBy: AgentChainEntry`. Recursive structure mirrors the actual delegation tree.

**→ Drives the verifier rendering surface + the JSON Schema shape.** Lean: **flat list**. JSON Schema validation is simpler; renderers walk a list trivially; multi-hop (agent → sub-agent → operator → human) compose naturally. Nested structures would require a recursive `$defs` reference and complicate `$ref`-based composition with EXT-3's base envelope. **Flat list with end-to-start ordering is the closed-set discipline.**

**Q3. Runtime detection — does the form-side runtime detect agent-vs-human at submit time, or trust the WOS workflow's `actors[]` declaration?**

The form's submit endpoint receives a signed Response. **Two options:**

- **Form trusts the WOS workflow's actor declaration.** The form-side runtime accepts the submission based on the `capacity` declaration in the `AuthoredSignature` + the matching WOS `actors[].type == "agent"` record. The form does NOT independently fingerprint the submitter. Mirrors the existing form-side trust posture (the form trusts the IdP's identity attestation).
- **Form independently fingerprints the submitter.** The form-side runtime inspects User-Agent strings, request timing, automation-detection heuristics, and rejects if it suspects an undisclosed agent.

**→ Lean: option 1 (form trusts the declaration)**. Independent fingerprinting is fragile (agents can spoof User-Agent), and the form's enforcement surface is the wrong place for it. The trust anchor is the WOS workflow governance (which declares actors[] + their types) AND the agent-identity binding (which proves the agent is who it claims to be). **The form-side enforcement is policy-driven**: form-policy `forbidden` + claimed `capacity: "ai-agent"` = typed `FeaturePolicyConflictError`. The form does NOT try to detect undisclosed agents; that's a substrate-layer concern.

**Honest residual risk:** an agent that forges `capacity: "self"` AND presents a stolen or improperly-issued human-class identity binding succeeds at the form layer. The defense rests on the identity-provider's integrity (the IdP MUST NOT issue human-class credentials to bots) — a substrate-layer concern, NOT form-layer. Documented in design §8.

**Q4. GDPR Article 22 surfaceability — does the receipt explicitly declare "this decision was substantially automated"?**

EU GDPR Article 22: data subject has the right to know if a decision concerning them was based solely on automated processing, including profiling.

- **Implicit via `agentChain`.** When the receipt carries `capacity: "ai-agent"` + `agentChain`, the answer is implicit: yes, automated. A data subject querying the receipt sees the chain and can request human review.
- **Explicit declaration.** Add an `automatedDecisionMaking: boolean` field at the form-policy level (not on AuthoredSignature) declaring whether the form's downstream processing involves automated decision-making.

**→ Lean: implicit via `agentChain` for slice 1**. The `agentChain` IS the Article 22 surface — its presence is the disclosure. Adding a separate field would duplicate the signal and create drift opportunities. Per WOS §12.2 the workflow-level `discloseThatAgentAssisted: true` flag MUST already be set for rights-impacting workflows; that's the WOS-side disclosure substrate. **The receipt's role is to render this so a downstream reader can act on Article 22; no new field needed.** Future row may add an explicit `automatedDecisionMaking` declaration if the receipt's audience needs a flat-list summary; flagged as future scope.

### Next 4 (ask after the framing 4)

**Q5. Agent identity-key registration — does FW-0058 specify the registration path, or defer to SC-4 + EXT-8a?**

SC-4 (presentation method registry, post-MVP) + EXT-8a (IdentityClaim alignment) already cover human identity. For agents, the same substrate generalizes — the agent's identity key is registered via an identity provider that issues agent-class credentials.

**→ Lean: defer to SC-4 + EXT-8a.** FW-0058 names the requirement (the agent's identity binding MUST resolve via the same identity registry as human signers); the substrate-layer registration path is SC-4's territory. Per [web ADR-0004 consume-not-invent](../adr/0004-cross-repo-placement-consume-not-invent.md), FW-0058 doesn't author a parallel identity-registry.

**Q6. Receipt rendering — does the verifier render the four-party chain inline, or link out to an "audit trail" surface?**

The receipt is the verifier's surface. **Two options:**

- **Inline chain rendering.** The receipt body displays the chain ("filed by [agent name] acting under [operator] for [accountable human] within [scope]"). Maximum visibility; maximum cognitive load on the verifier user.
- **Link to audit-trail surface.** Receipt shows "filed by agent" prominently with a "see audit trail" affordance that opens the chain in detail.

**→ Lean: inline chain rendering for slice 1**. The chain is short (typically 3–4 entries); rendering inline keeps the verifier's surface honest about who acted. The "audit trail" surface is a future enhancement if chains grow long (5+ entries in deep delegation hierarchies). **Anti-Clippy applies** — the inline rendering is ambient (no avatar, no persona) per `formspec-web/CLAUDE.md` discipline.

**Q7. Form-load failure semantics — when `aiAgentFiler: required` + instance lacks `AgentInvoker`?**

Per ADR-0011: `UnsupportedRequiredFeatureError` at form-load → shell renders plain-language unavailable page. **Confirms ADR-0011 pattern applies directly**; no FW-0058-specific failure surface beyond standard typed-error → plain-language path.

**Q8. Anti-Clippy — do agent surfaces inherit anti-Clippy constraints?**

The form's own AI surfaces are subject to anti-Clippy per `formspec-web/CLAUDE.md`. FW-0058's surfaces include: (a) the form's agent-policy disclosure copy ("This form accepts AI-agent filings"), (b) the verifier's chain rendering ("filed by [agent]"), (c) the receipt's audit summary. **All subject to anti-Clippy** — ambient, pull-not-push, no persona, no avatar, keyboard-first. The AGENT itself is NOT subject to anti-Clippy (the agent is the respondent's tool; the form doesn't control the agent's UX); only the form's surfaces about the agent.

---

## 5. Honesty Note: What This Row Can and Cannot Do

**Can:**

- Specify the `aiAgentFiler` capability key under web ADR-0011.
- Specify the `agentChain` block shape on `AuthoredSignature` (EXT-3 deferral closed).
- Specify the form-policy three-tier `forbidden | allowed | required` + failure semantics.
- Specify the verifier-rendering contract for the four-party chain.
- Name the composition seams with WOS `actorExtension` + `AgentInvoker` + `capabilityInvocation` + deontic constraints + autonomy caps + disclosure.
- Name the composition seams with FW-0048 (prompt-injection as coercion), FW-0049 (safe-* survives agent read), FW-0050 (agent as one party), FW-0034 (agent-issued correction), FW-0030 (federated agent identity).
- Codify the AP-014 / AP-024 / AP-023 bindings.
- Distinguish clearly from FW-0051 (AI-as-helper-for-respondent vs AI-as-respondent).
- Propose XS-6 cross-stack confirmation ADR spanning formspec + WOS + trellis.

**Cannot:**

- **Mandate agent-identity provider behavior.** The IdP MUST NOT issue human-class credentials to bots; the form trusts this invariant but cannot enforce it. Out of any form-layer mechanism's reach.
- **Detect undisclosed agents (capacity-spoofing).** An agent that signs with stolen or improperly-issued human credentials succeeds at the form layer. Substrate-layer concern; documented honestly.
- **Solve the prompt-injection problem fully.** A compromised LLM filing under attacker control is structurally a coercion vector; WOS deontic constraints + autonomy caps + confidence floor + fallback chain provide structural defense; the residual risk is real.
- **Bind the WOS workflow author's choices.** The form-side `aiAgentFiler` policy gates capability; the WOS-side governance (deontic constraints, autonomy caps, agent disclosure) is the workflow author's responsibility. FW-0058 names the seams; does NOT specify the workflow.
- **Author the WOS AI Integration Spec amendments.** WOS substrate is sufficient at draft 1.0.0; no upstream amendments proposed. If the design surfaces a gap, that's a separate WOS-side row.
- **Ship the build.** A future build row materializes the runtime invariants and adapter contracts.
- **Specify the agent itself.** The agent's implementation is out of scope; the deployment chooses.
- **Cover the FW-0051 composition (agent using BYO assistant during its own fill).** Per FW-0051 §7.6 — deferred.

The honest split: FW-0058 covers **(a) capability key**, **(b) `agentChain` schema shape**, **(c) form-policy three-tier**, **(d) verifier rendering contract**, **(e) cross-row composition seams**, **(f) XS-6 cross-stack confirmation ADR**. It does NOT cover **(g) WOS substrate** (already specified), **(h) agent implementation**, **(i) identity-provider integrity** (substrate-layer), **(j) prompt-injection full mitigation** (substrate-layer + WOS-layer), **(k) AI fills + human signs case** (FW-0051 territory).

---

## 6. External Prior Art

Cited so the design is grounded in real prior art, not invented in isolation. **All references load-bearing for design §3; verify before relying.**

### 6.1 Computer-use AI and form-filling agents

- **Anthropic Computer Use (Claude 3.5 Sonnet).** [`https://www.anthropic.com/news/3-5-models-and-computer-use`](https://www.anthropic.com/news/3-5-models-and-computer-use). LLM-driven browser automation; takes screenshots, identifies elements, types and clicks. **Direct precedent for the unauthorized-scraping-agent threat model (§3.4).** Defense: identity binding + bot protection + form-policy enforcement.
- **OpenAI Operator.** [`https://openai.com/index/introducing-operator/`](https://openai.com/index/introducing-operator/). Cloud-AI product that drives a browser to fill forms via screen-reading + click-synthesis. **Direct precedent for the §3.4 threat and the §3.1 boundary case (AI fills + human signs).**
- **Anthropic Claude Code + MCP agent patterns.** [`https://modelcontextprotocol.io/`](https://modelcontextprotocol.io/). The MCP protocol's tool-invocation envelope is the substrate primitive WOS `AgentInvoker` adapters compose with. **Direct precedent for the agent-as-tool-caller pattern.**
- **LangChain / LangGraph form-filling agents.** [`https://python.langchain.com/`](https://python.langchain.com/), [`https://langchain-ai.github.io/langgraph/`](https://langchain-ai.github.io/langgraph/). Open-source frameworks with form-completion examples. **Reference for the structured-tool-invocation model.**

### 6.2 Delegation chain precedent

- **W3C Verifiable Credentials Data Model 2.0.** [`https://www.w3.org/TR/vc-data-model-2.0/`](https://www.w3.org/TR/vc-data-model-2.0/). Credential subject + issuer + proof chain. **Direct precedent for the `agentChain` four-party structure.** Each `AgentChainEntry` is structurally a Verifiable Credential about the delegation event; the chain is the credential graph.
- **OAuth 2.0 + RFC 8693 Token Exchange.** [`https://www.rfc-editor.org/rfc/rfc8693`](https://www.rfc-editor.org/rfc/rfc8693). Defines the `actor` claim for impersonation/delegation in JWT-based access tokens. **Direct precedent for the chain-of-actors representation.**
- **Capability-based security (CaMeL pattern in WOS §3.6).** Privileged controller validates whether an untrusted capability model's output should commit. Maps directly onto WOS Processor (controller) + agent (capability model). **Already cited in WOS §3.6 informative reference.**
- **PKAF Authority chain.** [`PKAF/spec/rkaf-core.md`](../../../PKAF/spec/rkaf-core.md) §6 (Authority, Attestation, LocalAdoption). Mature delegation-chain representation in the assertion-side substrate. **Vocabulary borrowable** (LocalAdoption ↔ delegationScope; Attestation ↔ delegationArtifact) but the substrate is distinct (assertion vs filer). Document the parallel; don't conflate.

### 6.3 Regulatory framing for automated decision-making

- **EU GDPR Article 22.** [`https://gdpr-info.eu/art-22-gdpr/`](https://gdpr-info.eu/art-22-gdpr/). Right not to be subject to a decision based solely on automated processing. **Direct precedent for the Q4 surfaceability question; design honors via implicit `agentChain` disclosure.**
- **EU AI Act Article 13.** [`https://artificialintelligenceact.eu/article/13/`](https://artificialintelligenceact.eu/article/13/). Transparency: deployers of high-risk AI systems must inform affected persons. **Already cited in WOS §12 for the disclosure substrate.**
- **OMB M-24-10.** [`https://www.whitehouse.gov/wp-content/uploads/2024/03/M-24-10-Advancing-Governance-Innovation-and-Risk-Management-for-Agency-Use-of-Artificial-Intelligence.pdf`](https://www.whitehouse.gov/wp-content/uploads/2024/03/M-24-10-Advancing-Governance-Innovation-and-Risk-Management-for-Agency-Use-of-Artificial-Intelligence.pdf). US federal-agency AI governance memo. **Already cited in WOS §12.**

### 6.4 Prompt injection and agent-coercion threat models

- **OWASP LLM Top 10 — LLM01 Prompt Injection.** [`https://owasp.org/www-project-top-10-for-large-language-model-applications/`](https://owasp.org/www-project-top-10-for-large-language-model-applications/). Industry consensus on the threat. **Direct precedent for the §3 threat model's prompt-injection vector; mitigation rests on WOS deontic-constraint substrate (§4) + autonomy caps (§5) + confidence floor (§7) + fallback chain (§8).**
- **Greshake et al., "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection" (2023).** [`https://arxiv.org/abs/2302.12173`](https://arxiv.org/abs/2302.12173). Indirect prompt-injection via untrusted data the agent processes. **Direct precedent for the threat that an agent reading a form's content (definition + references + ontology) could be injected — substrate defense rests on form-side validation that's already mature; agent-side is the agent operator's responsibility.**
- **Anthropic Constitutional AI.** [`https://www.anthropic.com/news/constitutional-ai-harmlessness-from-ai-feedback`](https://www.anthropic.com/news/constitutional-ai-harmlessness-from-ai-feedback). RLHF-derived guardrails. **Informative — substrate-layer mitigation that the agent operator may or may not deploy; FW-0058 cannot mandate.**

### 6.5 Identity binding for non-human actors

- **W3C Decentralized Identifiers (DIDs).** [`https://www.w3.org/TR/did-core/`](https://www.w3.org/TR/did-core/). Identifier format that works equally for human and non-human entities. **Direct precedent for the agent-identity binding shape.**
- **IETF SPIFFE/SPIRE.** [`https://spiffe.io/`](https://spiffe.io/). Workload identity in distributed systems; agents-as-workloads. **Operational precedent for agent-identity attestation in deployed environments.**

---

## 7. Quick-Reference Anchor List

For the design pass — open these in order if a question goes deep:

1. [Journey J-012 — `JOURNEYS.md:343`](../../JOURNEYS.md) — the user story (the AI-agent slice)
2. [Anti-patterns AP-014 / AP-024 / AP-023 — `JOURNEYS.md:131` / `:191` / `:185`](../../JOURNEYS.md) — the prohibitions
3. [FW-0058 row — `PLANNING.md:682`](../../PLANNING.md) — current state
4. [FW-0051 design §7.6 — `thoughts/specs/2026-05-23-fw-0051-bring-your-own-assistant-design.md`](../specs/2026-05-23-fw-0051-bring-your-own-assistant-design.md) — vocabulary distinction reciprocated
5. [WOS AI Integration Spec — `work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) — `ActorKind::Agent`, `AgentInvoker`, `capabilityInvocation`, deontic constraints, autonomy caps, disclosure (the substrate)
6. [WOS Kernel §10.1 + §10.5 — `work-spec/specs/kernel/spec.md`](../../../work-spec/specs/kernel/spec.md) — `actorExtension` seam + agent submission gate
7. [WOS ADR-0064 — `work-spec/thoughts/adr/0064-agent-actor-kind-and-invoker-port.md`](../../../work-spec/thoughts/adr/0064-agent-actor-kind-and-invoker-port.md) — agents as first-class `ActorKind`; `AgentInvoker` port
8. [EXT-3 — `thoughts/specs/2026-05-22-upstream-extension-queue.md:46`](../specs/2026-05-22-upstream-extension-queue.md) — `capacity` + `agentChain` deferred to FW-0058
9. [web ADR-0011 Feature Ownership Table — `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md:131`](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `aiAgentFiler` proposed addition home
10. [FW-0048 design — `thoughts/specs/2026-05-23-fw-0048-coercion-aware-signing-design.md`](../specs/2026-05-23-fw-0048-coercion-aware-signing-design.md) — prompt-injection as coercion
11. [FW-0049 design — `thoughts/specs/2026-05-23-fw-0049-safe-address-handling-design.md`](../specs/2026-05-23-fw-0049-safe-address-handling-design.md) — safe-* survives agent read
12. [FW-0050 design — `thoughts/specs/2026-05-23-fw-0050-multi-party-submission-design.md`](../specs/2026-05-23-fw-0050-multi-party-submission-design.md) — agent as one party
13. [FW-0034 design — `thoughts/specs/2026-05-24-fw-0034-honest-correction-path-design.md`](../specs/2026-05-24-fw-0034-honest-correction-path-design.md) — agent-issued correction
14. [PKAF rkaf-core §5.3 — `PKAF/spec/rkaf-core.md:175`](../../../PKAF/spec/rkaf-core.md) — `AILineage` (assertion-side; distinct from filer-side)
