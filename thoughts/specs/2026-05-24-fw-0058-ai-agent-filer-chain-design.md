# FW-0058 — AI-agent filer chain (non-human capacity): design proposal

**Date:** 2026-05-24
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q4 are open until accepted.
**Row:** [FW-0058 in `PLANNING.md:682`](../../PLANNING.md) (design).
**Journey:** [J-012 in `JOURNEYS.md:343`](../../JOURNEYS.md) — the AI-agent slice ("filer ≠ signer ≠ subject", four-party non-human chain).
**Anti-patterns:** [AP-014 (coercion) in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-024 (training consent) in `JOURNEYS.md:191`](../../JOURNEYS.md), [AP-023 (verified ≠ true) in `JOURNEYS.md:185`](../../JOURNEYS.md).
**Feature key (proposed; NOT yet enumerated):** `aiAgentFiler` — ADR-0011 extension proposed in §4.1.
**Source brief:** [`thoughts/sketches/2026-05-24-fw-0058-ai-agent-filer-research-brief.md`](../sketches/2026-05-24-fw-0058-ai-agent-filer-research-brief.md). Upstream-primitive inventory, threat scenarios, FW interactions, and external prior art live there; this doc decides over them.
**Substrate sources (load-bearing):**
- [WOS AI Integration Specification v1.0 — `work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) — `ActorKind::Agent`, `AgentInvoker`, `capabilityInvocation`, deontic constraints, autonomy caps, agent disclosure. The agent-as-actor substrate.
- [WOS ADR-0064 — `work-spec/thoughts/adr/0064-agent-actor-kind-and-invoker-port.md`](../../../work-spec/thoughts/adr/0064-agent-actor-kind-and-invoker-port.md) — substrate-neutral `AgentInvoker` port.
- [WOS Kernel §10.5 — `work-spec/specs/kernel/spec.md:2107`](../../../work-spec/specs/kernel/spec.md) — agent submission gate (`agentSubmitterUnauthorized` typed error).
- [EXT-3 in `thoughts/specs/2026-05-22-upstream-extension-queue.md:46`](2026-05-22-upstream-extension-queue.md) — `capacity` enum (with `ai-agent` pre-allocated) + `agentChain` block deferred to FW-0058.

Per [web ADR-0004 consume-not-invent](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web does not author the agent-as-actor or the agent-invocation substrate; WOS owns both. FW-0058 is a **consumer-side composition** — names the formspec-web `aiAgentFiler` posture, ratifies the deferred `agentChain` schema shape on `AuthoredSignature`, binds the WOS `capabilityInvocation` provenance to the receipt-rendering surface, writes the threat model, distinguishes firmly from FW-0051.

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for accepting submissions from non-human AI-agent actors filing on behalf of authorized humans/entities, with the receipt unambiguously naming the four-party chain (agent → operator → accountable human/entity → scope) ([FW-0058 Done](../../PLANNING.md)). **The substrate already exists**: WOS specifies `ActorKind::Agent` (§3.1), `AgentInvoker` port (ADR-0064), `capabilityInvocation` provenance (§3.3.1), deontic constraints + autonomy caps + fallback chains + agent disclosure (§§4–12); EXT-3 pre-allocates the `ai-agent` capacity enum value and defers the `agentChain` shape to this row. FW-0058's deliverables: framing decisions (Q1–Q4); the `aiAgentFiler` capability contract proposed under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md); the `agentChain` shape on `AuthoredSignature`; the verifier rendering contract for the four-party chain; the runtime invariants binding WOS substrate to the form-load failure surface; the composition seams with FW-0048 + FW-0049 + FW-0050 + FW-0034 + FW-0030 + FW-0051; the cross-stack confirmation ADR (XS-6) confirming the formspec + WOS + trellis composition is coherent; and the open questions that remain for the build row.

This is a **design row**. The deliverable is a doc plus follow-on cross-stack and spec items, not code. The build row is a future follow-on (not yet filed; expected to materialize when SC-4 + EXT-3 ratify + WOS reference adapter availability + an actual agent-filing use case drives a deployment).

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. A future build row owns the materialization.
- **Inventing a parallel agent-as-actor model.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), WOS IS the agent-as-actor model. This design composes the existing substrate; it does not author a sibling shape.
- **Inventing a parallel agent-invocation contract.** WOS `AgentInvoker` per ADR-0064 covers this. Same discipline.
- **Authoring the agent itself.** The agent's implementation is out of scope. The deployment chooses the agent.
- **Promoting WOS AI Integration Spec from `draft` to ratified.** Per its header it is `1.0.0-draft.1`. Promotion is upstream work; FW-0058 design proceeds against the draft. If WOS evolves in ratification, FW-0058 follows.
- **Specifying WOS workflow author choices.** The form-side `aiAgentFiler` gates capability; the WOS-side governance (deontic constraints, autonomy caps, agent disclosure) is the workflow author's responsibility. FW-0058 names the seams.
- **Solving the prompt-injection problem.** A compromised LLM filing under attacker control is structurally a coercion vector. WOS deontic constraints + autonomy caps + confidence floor + fallback chain provide structural defense; the residual risk is real. §8 documents.
- **Solving the capacity-spoofing problem.** An agent that signs with stolen or improperly-issued human credentials succeeds at the form layer. Substrate-layer (identity-provider integrity) concern; documented honestly. §8.
- **Specifying the agent-identity provider behavior.** The IdP MUST NOT issue human-class credentials to bots; the form trusts this invariant but cannot enforce it. SC-4 (presentation method registry) is the substrate-layer carrier; FW-0058 names the requirement, doesn't author the IdP.
- **Cross-form agent-identity portability.** An agent registered with one deployment may or may not be recognized by another deployment. SC-4 + EXT-8a generalize to agent identities; cross-deployment portability is the agent-identity-registry's concern, not FW-0058.
- **AI-as-helper-for-respondent.** That's FW-0051 (BYO-assistant). Vocabulary distinction is load-bearing — see §7.7.
- **The AI-fills-but-human-signs case.** The user reviewed and signed; capacity is `self`; the AI's contribution is per-field provenance per EXT-2. **Not FW-0058** — that's FW-0051 + EXT-2. The vocabulary discipline matters: until "AI fills" includes "agent IS the signer," it's FW-0051. §7.7.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Trust boundary

**The WOS workflow's governance is the trust anchor for the agent's capacity to act**; the agent itself is OUTSIDE the trust boundary (mirroring WOS §3.5). The form-side trust posture inherits:

- The **form** trusts the **WOS workflow's `actors[]` declaration** that the agent is an enumerated actor for the workflow.
- The **form** trusts the **WOS deontic-constraint pipeline** to enforce permission / prohibition / obligation / right at runtime per WOS §4.
- The **form** trusts the **agent-identity provider** to issue agent-class credentials only to agents (NOT to humans, NOT to undisclosed bots). The identity binding's `authMethod` discriminator names the IdP per SC-4.
- The **form** does NOT trust any specific agent implementation. Per WOS §3.5: "The WOS Processor — not the agent — enforces constraints, validates outputs, and controls workflow progression."
- The **agent** runs in its operator's substrate (cloud-hosted, on-prem, containerized — adapter-tier per WOS ADR-0064 `AgentInvoker`). The form has no visibility into nor control over the agent beyond the WOS-governed surface.

**What the agent surface SEES (when a workflow declares `agents[]`):** the Formspec Definition (the form's structure, validation rules, FEL expressions); the per-field help context (References + Ontology sidecars); the assigned WOS capabilities + their input/output contracts (per WOS §3.3); the WOS governance gates (deontic constraints + confidence requirements). **This is the same surface the human respondent sees**, with two differences: the agent reads programmatically (not via the rendered DOM); the agent's actions are gated by WOS deontics (a human's are gated by issuer-side policy + UI affordances).

**What the agent surface DOES NOT see:** plaintext values of safe-* fields filed by upstream parties (per FW-0049 §3.3 mask discipline — survives the agent's read identically); other-party data in multi-party flows (per FW-0050 §7.1 per-party scoping — applies to agent capacity identically); the issuer's deployment-internal configuration (`safetyTeamRecipients[]` per EXT-30, etc.); cryptographic material (signing keys other than the agent's own; HPKE recipient keys).

### 2.2 Attacker model

- **Attacker identity.** (a) A scraping-bot operator deploying an LLM-backed agent to fill forms without authorization. (b) A compromised LLM (prompt-injected by the form's content, by indirect injection via a reference document, or by direct injection from an upstream attacker). (c) An adversary using a stolen agent-identity credential. (d) An insider at an agent-operator who exfiltrates form content via the agent's data-handling pipeline.
- **Attacker goal.** Exfiltrate form data; cause unintended submissions; manipulate downstream determinations; impersonate authorized agents.
- **What the attacker observes.** Whatever the WOS-governed surface exposes (the form's Definition + sidecars are public; the per-field help context is public; the agent's own invocation history within its operator's tenancy). **NOT what other parties have filled** (per-party scoping), **NOT safe-* values** (FW-0049 mask), **NOT other agents' credentials**.
- **What the attacker cannot force.** (a) Submission without identity binding — the form's authentication gate rejects unidentified submissions. (b) Submission to a `aiAgentFiler: forbidden` form — the form-policy gate rejects with typed `FeaturePolicyConflictError`. (c) Bypass of WOS deontic constraints — the WOS Processor evaluates every agent output through permission/prohibition/obligation/right before commit (WOS §4.6 ordering). (d) Bypass of WOS autonomy cap — rights-impacting + safety-impacting workflows default-cap at `assistive`, requiring human review (WOS §5.3 (4)). (e) Bypass of confidence floor — outputs below the floor are invalidated (WOS §7.4). (f) Bypass of volume constraint — `maxAutonomousPerHour` / `maxAutonomousPerDay` escalate excess to human review (WOS §11.1).
- **What the attacker knows.** Kerckhoffs-style — the attacker has read this design + the WOS substrate + the form's Definition. **The defense rests on structural mechanisms (identity binding, form-policy gate, WOS deontics, autonomy cap, confidence floor, volume constraint, fallback chain)** rather than on any single secret.

### 2.3 Four grounded scenarios

Each scenario gives: the setup, what the FW-0058 mechanism must achieve, what this design's posture provides.

**2.3.1 Healthcare-form AI assists elderly user with delegated family authority (canonical scenario).** A hospital-system-deployed healthcare AI helps an at-risk elderly user with annual benefits-redetermination. Family member has POA; the AI files unattended under POA delegation.
- **Required:** the AI's `AuthoredSignature` carries `capacity: "ai-agent"` + `agentChain` walking AI → family member (with POA artifact) → patient; the verifier renders the four-party chain ("filed by AI agent under POA delegation from [family member] on behalf of [patient]"); WOS workflow declares `agents[]` with the hospital-system's AI as a registered actor; WOS deontic constraints bound the AI's output (e.g., cannot file a Medicaid-denial; cannot file outside the patient's known income range).
- **Design posture:** §3 framing decisions; §3.1 form-policy `allowed` (the form accepts either human or agent capacity); §3.2 `agentChain` shape; §3.3 verifier rendering; WOS substrate covers governance. **Canonical scenario; design optimizes for this.**

**2.3.2 Property-management corporate agent files tenant application (no human in loop for application; human in loop for lease).** A property-management firm's agent intakes prospective-tenant emails + files property-application forms; the lease itself requires human signature.
- **Required:** per-form policy granularity — the application form's `aiAgentFiler: allowed`; the lease form's `aiAgentFiler: forbidden`. Different forms in the same flow have different postures; the form-policy gate enforces.
- **Design posture:** §3.1 three-tier form-policy supports per-form differentiation; §3.4 staged delegation via `agentChain` for the corporate-officer → agent chain; the WOS workflow author declares per-form `aiAgentFiler` posture; the form-load gate enforces. **Canonical scenario for the per-form-granularity case; design supports directly.**

**2.3.3 Tax-prep AI fills 1040 + user reviews + signs (FW-0051 boundary case; NOT FW-0058).** A tax-prep AI fills the 1040; user reviews + signs.
- **Required:** the user is the signer (`capacity: "self"`); the AI's per-field contributions are EXT-2 provenance (`attestedBy: "ai-agent", sourceRef: "vendor-tax-ai"`). **NOT FW-0058 territory.**
- **Design posture:** §7.7 vocabulary distinction — until the AI is the signer (not the helper), this case routes through FW-0051 (BYO-assistant) + EXT-2 (per-field provenance). **Named honestly so the framing isn't confused.** Composition with FW-0058 (agent uses BYO assistant during its own fill) is deferred per FW-0051 §7.6.

**2.3.4 Adversarial — unauthorized scraping agent fills forms without permission.** A scraping-bot operator deploys an LLM-backed agent to fill rate-shopping insurance forms en masse via the public URL.
- **Required:** structural defenses that hold against an adversarial unregistered agent.
- **Design posture:** **layered defense.** (a) **Bot-protection per AP-019** — privacy-preserving attestation (WebAuthn user-present, Apple Private Access Tokens, Turnstile non-interactive) covers the bulk-submission baseline; an unregistered agent fails. (b) **Identity binding** — an agent attempting to file MUST present a registered agent-identity credential per SC-4 + EXT-8a; unregistered fails. (c) **Form-policy enforcement** — `aiAgentFiler: forbidden` refuses the agent with typed `FeaturePolicyConflictError`. (d) **WOS volume constraints** — registered + authorized agents are bounded by `maxAutonomousPerHour` / `maxAutonomousPerDay` (WOS §11.1); excess escalates to human review. (e) **Honest disclosure** — when the form policy is `forbidden` and the agent attempts to silently submit with forged `capacity: "self"`, the identity-binding chain MUST resolve to a human-class credential; an agent's credential cannot satisfy that. **Defenses hold at the structural level; the adversarial scraper can ONLY do what (i) bot-protection lets through, AND (ii) identity binding admits, AND (iii) form-policy allows. §8 documents the residual risk (forged credentials are an IdP integrity issue, NOT a FW-0058 gap).**

### 2.4 Out-of-scope threat patterns

Named explicitly so the design isn't read as covering them:

- **Compromise of the agent operator's substrate.** Once the agent operator handles the form content, the form's reach ends. Mitigation = the agent operator's data-handling commitment (AP-024 + per-deployment audit).
- **Compromise of the agent-identity provider.** An IdP that issues human-class credentials to bots, or agent-class credentials to undisclosed parties, breaks the trust model. Substrate-layer concern; mitigation rests on the IdP's integrity (SC-4 + EXT-8a + identity-provider audit).
- **Prompt-injection of the agent via the form's content.** An attacker who controls the Definition + References + Ontology could inject instructions that subvert the agent. **Out of any form-layer mechanism's reach** — the form's content is public per `(definitionUrl, definitionVersion)`. Mitigation rests on the agent operator's defenses (input filtering, indirect-injection detection, defense-in-depth per OWASP LLM Top 10).
- **Coercion-by-prompt-injection.** A prompt-injected agent IS structurally a coerced signer; the FW-0048 duress channel is available (composes per §7.3) but the agent doesn't have a conventional "duress affordance" — the agent operator's runtime would need to detect the injection. Substrate-layer concern.
- **Side-channel inference via timing or error patterns.** A determined attacker could infer information about other parties' filled fields via timing of validation responses or differential errors. Same out-of-scope discipline as FW-0049 §2.4 / FW-0051 §2.4.
- **Cross-deployment agent reputation.** An agent's behavior at deployment A does not bind its behavior at deployment B. Cross-deployment reputation tracking is an agent-registry concern, not FW-0058.

## 3. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 3.1 Q1 — Form-policy shape: three-tier `forbidden | allowed | required`

**PROPOSAL.** Form-policy carries the standard ADR-0011 three-tier shape:

| Tier | Semantics |
|---|---|
| `forbidden` | Form REJECTS agent capacity. Submissions claiming `capacity: "ai-agent"` are rejected at form-load (typed `FeaturePolicyConflictError`) OR at submit (typed `agentSubmitterUnauthorized` per WOS Kernel §10.5). Default for high-coercion / rights-impacting templates (healthcare consent, advance directive, marriage/divorce, custody, financial POA — the FW-0048 template set). |
| `allowed` | Form accepts EITHER human OR agent capacity per the deployment's WOS workflow declaration. Default for most forms; minimal disruption to existing flows. |
| `required` | Form REQUIRES agent capacity. Human submissions are rejected. Use case: procurement-automation forms designed exclusively for agent-only filing; ML-system-monitoring forms; agent-to-agent workflow handoff forms. Rare; explicit. |

**Justification.** Maps directly onto ADR-0011's existing form-policy enum and the existing typed-error rendering at form-load (§5.1). Mirrors FW-0049 (`safeAddress`) and FW-0050 (`multiParty`) three-tier shape directly. The form-policy tier composes with the WOS workflow's `agents[]` block and autonomy cap — `aiAgentFiler: allowed` + WOS `agents[]` declared + WOS autonomy cap `assistive` = the agent proposes; a human reviews + confirms; the human is the signer. `aiAgentFiler: allowed` + WOS `agents[]` declared + WOS autonomy cap `autonomous` = the agent IS the signer (FW-0058 canonical case).

**Alternative rejected: four-tier with `optional` floor.** Considered for backwards-compatibility with ADR-0011's `required | optional | forbidden`. Rejected: `allowed` already conveys the optional-acceptance semantic without adding a tier; FW-0049 and FW-0050 set the three-tier precedent. Adding `optional` would create drift between `aiAgentFiler` and sibling capability keys.

**Alternative rejected: per-capability-class granularity (e.g., `aiAgentFiler: { canFile: [...], cannotFile: [...] }`).** Considered for finer-grained control (e.g., "agents can fill personal-info fields but not declaration fields"). Rejected: the WOS deontic-constraint substrate already covers per-field gating (WOS §4.2 `Permission.allowedFields`); a sibling form-side gating mechanism would drift from WOS-side semantics. **Per-field gating lives in WOS substrate; per-form gating lives in `aiAgentFiler`.** Clean separation.

### 3.2 Q2 — `agentChain` shape: flat list with end-to-start authority order

**PROPOSAL.** `AuthoredSignature.agentChain` is a flat ordered list of `AgentChainEntry` records. Index 0 = the signer (the acting agent). Terminal entry's `delegatedBy` resolves to the accountable human or entity. Walked end-to-start renders the four-party chain.

```text
agentChain?: AgentChainEntry[]   // ordered, index-0 = signer
AgentChainEntry {
  agentId: string                 // URN naming the agent (e.g., "urn:wos:agent:procurement-bot-v3")
  agentClass: "automated" | "semi-autonomous" | "human-in-loop"  // mirrors WOS autonomy taxonomy
  modelIdentifier?: string        // for generative agents per WOS §3.1 (REQUIRED when agentClass == "automated" or "semi-autonomous" AND the agent is generative)
  modelVersion?: string           // for generative agents per WOS §3.1 (REQUIRED when modelIdentifier is present)
  delegatedBy: string             // URN of the delegating party (next-up authority); the terminal entry's value MUST resolve to a human or registered entity, NOT to another agent
  delegatedAt: string             // RFC 3339 timestamp; when this delegation was granted
  delegationScope: string         // FEL expression OR free-text describing the delegation bounds (e.g., "fileTenantApplications && property in: ['1234 Elm', '5678 Oak']")
  delegationArtifact?: {          // optional cryptographic delegation token / corporate resolution / POA artifact
    uri: string                   // URI to the artifact
    hash: string                  // SHA-256 hex; binds the URI fetch to the authority-establishment evidence
    type: string                  // taxonomy: "poa" | "corporate-resolution" | "machine-operator-token" | "verifiable-credential" | "other"
  }
  capabilityInvocationRef?: string // ref to WOS `capabilityInvocation` provenance record per ai-integration.md §3.3.1 (URN form)
  confidenceRef?: string          // ref to WOS `ConfidenceReport` for this fill per ai-integration.md §7.1 (URN form)
}
```

**Substrate justification.** The `agentChain` rides as a sibling block on the existing `AuthoredSignature` envelope (`formspec/schemas/response.schema.json` line 119+); the base envelope (signer, signedPayload, identityBinding, consentText, etc.) is **unchanged**. The agent's identity key signs the standard Formspec Signed Response Payload; `agentChain` is metadata the verifier walks to render the chain.

**Walk discipline.** The verifier walks end-to-start: entry N (terminal) `delegatedBy` resolves to the accountable human/entity; entry N's `agentId` IS entry N-1's `delegatedBy`; … entry 0's `agentId` IS the signer (the `AuthoredSignature.signerId`). **A break in the chain (broken reference, missing artifact, expired delegation, `delegatedBy` resolves to a non-human at the terminal entry) is a verification failure, NOT a soft warning.** Per AP-023, the verifier attests to capacity, NOT truth.

**Multi-hop chains.** A sub-agent acting on behalf of a parent agent acting on behalf of a corporate operator acting on behalf of a human renders as a 4-entry chain. The walk produces "filed by [sub-agent] acting under [parent agent] under [corporate operator] under [accountable human]." Renderers SHOULD clip excessively long chains (5+ entries) into a "see full delegation chain" expansion per Q6 in the brief; default render is the first 3 entries + the terminal.

**Identity binding interaction.** The `AuthoredSignature.identityBinding.authMethod` discriminator (provider-neutral per existing schema) extends to include agent-identity provider sources (e.g., `urn:formspec:identity-method:wos-agent-registry@1`, `urn:formspec:identity-method:did-key-agent@1`). The agent's identity key MUST resolve via this binding; the form does not authenticate the agent by other means.

**Alternative rejected: nested parent-child structure.** Considered for tree-like representation. Rejected: JSON Schema validation is harder; renderers walk a list trivially; multi-hop compose naturally without recursion; `$ref`-based composition with EXT-3's base envelope is cleaner with a flat list.

**Alternative rejected: signer-only chain with no per-entry delegation evidence.** Considered as a minimal shape (just name the chain of agent IDs). Rejected: without `delegationArtifact` + `delegationScope` + `delegatedAt`, the verifier cannot validate the chain's authority — it could render a chain that's structurally plausible but lacking evidence. Per AP-023, the verifier MUST attest to capacity with evidence. **The chain entry's full shape is the per-link evidence.**

**Alternative rejected: chain in WOS provenance only (not on the receipt).** Considered to avoid duplication with WOS `capabilityInvocation` records. Rejected: the receipt is the verifier's surface; downstream verifiers (separated from the WOS deployment) need the chain rendered ON the receipt to verify capacity. The `capabilityInvocationRef` + `confidenceRef` ARE the bridge to the WOS-side provenance, but the chain shape itself MUST live on the `AuthoredSignature`.

### 3.3 Q3 — Runtime detection: form trusts the WOS workflow's actor declaration

**PROPOSAL.** The form-side runtime accepts the submission based on the `capacity` declaration in the `AuthoredSignature` + the matching WOS `actors[].type == "agent"` record. The form does NOT independently fingerprint the submitter (User-Agent inspection, automation-detection heuristics, etc.).

**Substrate justification.** Mirrors the existing form-side trust posture (the form trusts the IdP's identity attestation); composition with WOS Kernel §10.5 ("If the actor is an agent, the actor MUST be registered through `actorExtension` and provenance MUST record `actorType: \"agent\"` plus agent identity, model/version, confidence/source metadata when available, and any `principalActorId` or `delegationRef`. … If these agent requirements fail, reject with `agentSubmitterUnauthorized`.") binds the WOS-side validation to the form-side acceptance.

**Form-side enforcement is policy-driven, not fingerprint-driven.** Form-policy `forbidden` + claimed `capacity: "ai-agent"` = typed `FeaturePolicyConflictError`. Form-policy `required` + claimed `capacity: "self"` = typed `FeaturePolicyConflictError`. Form-policy `allowed` + claimed `capacity: "ai-agent"` + WOS `actors[]` includes the agent + agent identity binding resolves = ACCEPT. Same shape for human capacity.

**Residual risk:** an agent that forges `capacity: "self"` AND presents a stolen or improperly-issued human-class identity binding succeeds at the form layer. The defense rests on the identity-provider's integrity (the IdP MUST NOT issue human-class credentials to bots) — substrate-layer concern, NOT form-layer. **§8 documents.**

**Alternative rejected: independent fingerprinting.** Considered for defense-in-depth. Rejected: agents can spoof User-Agent, request timing, and automation signals; fingerprinting drifts into an arms race and produces false positives (legitimate users on unusual configurations get rejected). The trust anchor is the WOS workflow governance + the agent-identity binding; fingerprinting would only catch undisclosed automation, which is bot-protection's responsibility (AP-019 covers via privacy-preserving attestation), not form-side capacity enforcement.

**Alternative rejected: form-side WOS workflow inspection at submit time.** Considered to have the form fetch the WOS workflow and verify the `actors[]` declaration matches. Rejected: the WOS workflow is the substrate; the form-side runtime trusts the WOS-side validation at submit dispatch. The form's responsibility is to dispatch the submission and surface the typed error; the WOS-side substrate evaluates the `agentSubmitterUnauthorized` gate.

### 3.4 Q4 — GDPR Article 22 surfaceability: implicit via `agentChain` (no separate field)

**PROPOSAL.** The receipt's GDPR Article 22 surfaceability (right to know if a decision was based solely on automated processing) is **implicit via the presence of `agentChain` on the receipt**. No separate `automatedDecisionMaking: boolean` field is added.

**Substrate justification.** When the receipt carries `capacity: "ai-agent"` + `agentChain`, the answer is unambiguous: yes, automated. A data subject querying the receipt sees the chain (per §3.3 verifier rendering) and can request human review through the deployment's case-correction channel (FW-0034 territory). Per WOS §12.2 the workflow-level `discloseThatAgentAssisted: true` flag MUST already be set for rights-impacting workflows; that's the WOS-side disclosure substrate. **The receipt's role is to render this so a downstream reader can act on Article 22; no new field needed.**

**Adding a separate field would create drift.** A receipt with `agentChain` present + `automatedDecisionMaking: false` is incoherent. A receipt with `agentChain` absent + `automatedDecisionMaking: true` is missing the chain that backs the claim. **Single source of truth is the chain's presence.**

**Future scope.** If the receipt's audience needs a flat-list summary (e.g., for accessibility — a screen-reader user wants a one-line "filed by an AI agent" before walking the chain), a derived render-time field can be computed from `capacity == "ai-agent"` without a new persisted field. Slice 1 doesn't ratify this; flagged.

**Alternative rejected: explicit `automatedDecisionMaking: boolean` at form-policy.** Considered for explicit Article 22 declaration. Rejected per drift concern above; also redundant with WOS §12.2 disclosure substrate.

**Alternative rejected: per-field automated-decision tracking.** Considered as a hybrid (some fields auto-filled, some human-filled in the same form). Rejected: that's the FW-0051 + EXT-2 case (per-field provenance with `attestedBy: "respondent", sourceRef: "assistant-suggested"`), not FW-0058. FW-0058 is signer-level; the agent IS the signer.

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011 — PROPOSED ADDITION

**PROPOSAL.** Add `aiAgentFiler` to the ADR-0011 [Feature Ownership Table at line 131](../adr/0011-runtime-feature-resolution-and-policy-gates.md). This is a **new entry**; the capability is not currently enumerated.

| Layer | What ADR-0011 names for `aiAgentFiler` |
|---|---|
| Instance capability | Adapter-backed: (a) WOS `AgentInvoker` adapter binding per WOS ADR-0064 (so the workflow can actually invoke an agent); (b) agent-identity provider / verifiable-credential resolver (so the receipt verifier can resolve the agent's identity key — substrate per SC-4); (c) WOS workflow runtime binding (so the form's submit dispatch can route to the WOS-governed workflow); (d) audit-trail render adapter (for the four-party chain display in the verifier). Instance declares which agent-identity providers it supports + which WOS adapter is wired. |
| Org policy | (a) Allowed agent classes / capability scopes per WOS deontic-constraint catalog; (b) per-form override gating (org may forbid `required` on rights-impacting template classes — `assistive` autonomy cap remains the WOS default for those); (c) human-accountability declarations (org names the human/entity accountable for any agent action under its tenancy policy); (d) data-residency declarations (org declares which agent-operator regions are permitted under its tenancy policy — relevant when agents transmit form content cross-border). |
| Form policy | Three-tier per §3.1: `forbidden` (form REJECTS agent capacity), `allowed` (form accepts EITHER human or agent capacity), `required` (form REQUIRES agent capacity). High-coercion / rights-impacting templates per FW-0048 §6.4 default to `forbidden` per §7.3 composition. Most forms default to `allowed`. |
| Resolved runtime profile | Enabled agent-identity providers + allowed agent classes + per-form posture tier + WOS workflow runtime binding (when the workflow declares `agents[]`). Form-load throws `UnsupportedRequiredFeatureError` per ADR-0011 if the form requires agent capacity but the instance lacks an `AgentInvoker` adapter OR an agent-identity provider; throws `FeaturePolicyConflictError` if the form FORBIDS agent capacity and the deployment is wired for agent-only operation. |

**Append-only key ordering.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts) the `RUNTIME_FEATURE_KEYS` tuple is append-only. Current order: `respondentPlace`, `status`, `documentPresentation`. **Coordination with FW-0033 (`fileUpload`) and FW-0051 (`bringYourOwnAssistant`):** all three are proposed extensions to the tuple. The append-only rule guarantees they can land independently; the build row for FW-0058 reads the current tuple at build time and appends.

**Locale-conditional set.** Per [`src/policy/feature-keys.ts`](../../src/policy/feature-keys.ts) `LOCALE_CONDITIONAL_FEATURE_KEYS`, this set is currently empty. `aiAgentFiler` is **NOT** locale-conditional — the per-form policy doesn't change with locale; the resolver doesn't recompute on locale change for this key.

### 4.2 Port shape — adopter contract now; port shape deferred to build row

Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md): post-MVP ports await consumer code. FW-0058 is a design row; build row is a future follow-on (not yet filed). The honest application is to specify the **adopter contract** here and let the port shape land with the build.

**Adopter contracts (what the build row must satisfy).**

| Adopter axis | What it implies |
|---|---|
| WOS workflow runtime binding | A binding from formspec-web's form-load / submit-dispatch surface to the WOS workflow runtime that declares the form's `agents[]` + governance + autonomy + disclosure substrate. The binding is the substrate that satisfies `aiAgentFiler` instance-capability requirement (a). |
| Agent-identity provider adapter | A binding to the substrate-layer agent-identity resolver per SC-4 / EXT-8a. Resolves an `AuthoredSignature.identityBinding` whose `authMethod` names an agent-identity provider; returns the agent's identity-key metadata (URN + public key + verifier handle). REQUIRED for agent submissions to validate. |
| `agentChain` resolver adapter | A binding that resolves each `AgentChainEntry`'s `delegatedBy` URN to a renderable entity (human name + role; entity name + jurisdiction; or another agent's chain segment). Verifier surface consumes this. |
| Verifier chain-render adapter | The verifier-side adapter that walks `agentChain` end-to-start and produces the rendered four-party chain string per §3.3. Adopter-styled per their UI conventions; the walk + escape semantics are the constant. |
| WOS `capabilityInvocation` resolver adapter (optional) | Resolves `AgentChainEntry.capabilityInvocationRef` to the WOS-side provenance record. Optional; enables the verifier's "see WOS audit trail" affordance. Cleanly degraded — when the WOS substrate isn't reachable (post-receipt, archival case), the chain still renders without it. |
| Agent-policy disclosure UI adapter | Renders the form-policy disclosure copy (e.g., "This form accepts AI-agent filings under workflow [name]") in an ambient pull-not-push panel per anti-Clippy discipline. Adopter-styled; the disclosure-presence + content are the constant. |

**Why not invent an `AgentSubmissionPort` here.** Per ADR-0009 §(b) the bar is consumer code, not predicted-need. The WOS-side binding + agent-identity binding + chain resolver are substantial implementations; their port shapes become obvious at build time when the adapters are co-implemented. **Build row picks the port shape at build time.** Lean: a single `AgentFilerComposition` slot bundling the WOS-runtime binding + identity-provider binding + chain resolver, OR three independent ports. The choice falls out at build time when the integration with the WOS reference adapter (`wos-agent-stub` for dev, `wos-agent-claude-sdk` / `wos-agent-anthropic` / `wos-agent-mcp` / `wos-agent-http` / `wos-agent-a2a` for production) is wired.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains an `aiAgentFiler` block:

```text
aiAgentFiler?: {
  posture: "forbidden" | "allowed" | "required"      // resolved per-form policy after org + instance
  agentIdentityProviders: Array<string>              // URN list of enabled agent-identity providers (per SC-4)
  allowedAgentClasses: Array<"automated" | "semi-autonomous" | "human-in-loop">  // org-policy filter on agent classes
  wosWorkflowBindingRef?: string                     // URN of the bound WOS workflow runtime (REQUIRED when posture != "forbidden")
  // Verifier surface state is NOT in the runtime profile —
  // the profile is immutable per form-load; verifier renders from the persisted receipt's agentChain.
}
```

The block is the resolver's read-only output. The shell consults `posture` at form-load (renders the disclosure copy unless `forbidden`); `agentIdentityProviders` (advertises supported agent-identity providers to the submission gate); `allowedAgentClasses` (filters incoming submissions); `wosWorkflowBindingRef` (the substrate the form-load surface trusts for `agents[]` declaration validation).

**Sensitive-data discipline:** the resolved profile contains no agent identity material, no in-flight submission data, no chain entries. The profile is recomputable from the instance + org + form policy without consulting any agent action.

## 5. Failure semantics

### 5.1 Form-load failures

| Condition | Error per ADR-0011 |
|---|---|
| Form requires `aiAgentFiler` but instance lacks any `AgentInvoker` adapter | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `aiAgentFiler` but instance lacks any agent-identity provider | `UnsupportedRequiredFeatureError` at form-load |
| Form requires `aiAgentFiler` but org policy forbids the feature for the form's template class | `FeaturePolicyConflictError` at form-load |
| Form forbids `aiAgentFiler` but org policy requires it | `FeaturePolicyConflictError` at form-load |
| Form policy declares `allowedAgentClasses` outside the instance's supported set | `InvalidRuntimePolicyError` at form-load |
| `wosWorkflowBindingRef` resolves to a workflow without an `agents[]` block AND the form requires agent capacity | `InvalidRuntimePolicyError` at form-load |

**Silent downgrade is forbidden.** A form requiring `aiAgentFiler` MUST fail-load on an instance without the substrate. Falling back to "no agent integration" silently would violate the form's required-capability contract and the deployment's expectation per J-012.

### 5.2 Submit-time failures

| Condition | Behavior |
|---|---|
| Form policy is `forbidden` + submission claims `capacity: "ai-agent"` | Form rejects with typed `agentSubmitterUnauthorized` per WOS Kernel §10.5; no provenance commit; no lifecycle advance |
| Form policy is `required` + submission claims `capacity: "self"` | Form rejects with typed `humanSubmitterUnauthorized` (analog to `agentSubmitterUnauthorized`; symmetric typed error); no provenance commit |
| Submission claims `capacity: "ai-agent"` + WOS `actors[]` does NOT include the named agent | Form rejects with `agentSubmitterUnauthorized` per WOS Kernel §10.5 |
| Submission claims `capacity: "ai-agent"` + WOS deontic constraint violation on the submitted output | WOS Processor rejects per WOS §4.6 enforcement ordering; the form surfaces the WOS-side rejection vocabulary back to the agent operator (NOT to the respondent — the agent IS the submitter; the agent operator owns the retry) |
| Submission claims `capacity: "ai-agent"` + confidence below WOS-declared floor | WOS Processor invalidates per WOS §7.4; fallback chain triggers (escalateToHuman / retry / alternateAgent / fail per WOS §8.3) |
| Submission claims `capacity: "ai-agent"` + WOS volume constraint exceeded | WOS Processor escalates to human review per WOS §11.1; the submission is NOT committed by the agent capacity — the human reviewer's confirmation becomes the operative submission |
| Submission claims `capacity: "ai-agent"` + `agentChain` broken (missing entry, terminal `delegatedBy` resolves to a non-human) | Form rejects with typed `InvalidAgentChainError` (FW-0058-specific); no provenance commit |
| Submission claims `capacity: "ai-agent"` + identity binding fails to resolve via any enabled agent-identity provider | Form rejects with typed `IdentityBindingError`; same shape as for human-identity failure |

### 5.3 Verification-time failures

| Condition | Behavior |
|---|---|
| Receipt carries `capacity: "ai-agent"` + `agentChain` is missing | Verifier reports `MissingAgentChain` — capacity claim cannot be substantiated; mark as unverifiable (NOT as forged; the verifier attests to capacity, NOT truth per AP-023) |
| Receipt carries `capacity: "ai-agent"` + `agentChain` walk encounters a broken reference | Verifier reports `BrokenAgentChain` — chain integrity failure; same render as `MissingAgentChain` |
| Receipt carries `capacity: "ai-agent"` + `agentChain` terminal `delegatedBy` resolves to another agent (not a human/entity) | Verifier reports `UngroundedAgentChain` — chain doesn't terminate at accountable authority; capacity claim cannot be substantiated |
| Receipt carries `capacity: "ai-agent"` + `agentChain` `delegationArtifact` hash mismatch | Verifier reports `InvalidDelegationArtifact` for the named entry; chain is structurally broken at that link |
| Receipt carries `capacity: "ai-agent"` + `capabilityInvocationRef` cannot be resolved (WOS substrate not reachable) | Verifier reports `WosProvenanceUnavailable` (informational, NOT a failure) + renders the chain WITHOUT the WOS-side audit trail expansion; the chain itself is still authoritative for capacity rendering |

### 5.4 Cross-stack failures

| Condition | Behavior |
|---|---|
| Multi-party flow: agent attempts to file on behalf of a party the agent is not authorized for per FW-0050 §7.1 | Form rejects with typed `PartyAuthorizationError` (FW-0050-derived); no provenance commit |
| Safe-* flow: agent attempts to read a safe-* field's plaintext value via its WOS-governed introspection | WOS-side surface returns masked value per FW-0049 §3.3 (same as for any other reader); the agent's submission proceeds without the plaintext (the agent fills the form WITHOUT seeing the safe-* value — the form's `valueClass: "ciphertext-only"` discipline holds) |

## 6. Cross-stack dependency chain

### 6.1 The chain

```
FW-0058 design (this doc)
    ↓
web ADR-0011 — propose addition of aiAgentFiler to Feature Ownership Table
    ↓
EXT-3 ratification — close the agentChain deferral with the shape per §3.2
    ↓
new XS-6 cross-stack ADR — confirm the formspec + WOS + trellis composition is coherent (§6.4)
    ↓
SC-4 + EXT-8a ratification — agent-identity binding substrate (already queued for FW-0030 / FW-0030 build)
    ↓
WOS reference adapter availability (wos-agent-claude-sdk / -anthropic / -mcp / -http / -a2a)
    ↓
FW-0058 build (formspec-web)
```

**This is a moderate cross-stack chain.** The WOS substrate is fully specified (the heaviest lifting); EXT-3 is already proposed; SC-4 + EXT-8a are queued. The new work is the `agentChain` schema shape (EXT-3 closes the deferral) + the XS-6 confirmation ADR + the verifier rendering contract.

### 6.2 EXT-3 ratification — closes the `agentChain` deferral

**Proposed for upstream extension queue closure.** EXT-3 currently states: "AI-agent variant gets a separate `agentChain` block — defer per FW-0058 split." This row closes that deferral with the §3.2 shape.

**Schema land:** `formspec/schemas/response.schema.json` `AuthoredSignature` `$def` gains an optional `agentChain: AgentChainEntry[]` block. `AgentChainEntry` is a new `$def`. Conditional: when `capacity == "ai-agent"`, `agentChain` is REQUIRED + non-empty + terminates at a non-agent `delegatedBy`. Schema rule (`if` / `then` clause on `capacity`).

**Fixture matrix:** the EXT-3 fixture set MUST include (per FW-0058 design §2.3):
1. Single-agent direct delegation (agent → human; 1-entry chain).
2. Two-hop delegation (agent → corporate operator → human; 2-entry chain).
3. Three-hop with sub-agent (sub-agent → parent agent → corporate operator → human; 3-entry chain).
4. Broken chain (missing entry; expected verifier reject).
5. Ungrounded chain (terminal `delegatedBy` resolves to another agent; expected verifier reject).
6. Invalid delegation artifact (hash mismatch; expected verifier reject).
7. Multi-party agent (per FW-0050 composition; agent fills one party's section).
8. Safe-* composition (per FW-0049; agent fills form WITHOUT seeing safe-* plaintext).
9. `capacity: "ai-agent"` + WOS deontic-constraint pass (positive case).
10. `capacity: "ai-agent"` + WOS deontic-constraint fail (negative case; submission rejected).

### 6.3 XS-6 (new) — formspec + WOS + trellis composition confirmation

**Proposed for upstream extension queue.** New cross-stack ADR confirming the FW-0058 composition is coherent across the three subsystems.

**Spans:** formspec (`AuthoredSignature.capacity == "ai-agent"` + `agentChain` per EXT-3) + work-spec (already specified — `ActorKind::Agent` per ADR-0064 + `AgentInvoker` port + `capabilityInvocation` provenance + deontic constraints + autonomy caps + agent disclosure) + trellis (Phase 1 byte-neutral — no envelope change; the agent's `AuthoredSignature` rides the standard Formspec Signed Response Payload through the standard chain).

**Closes:** J-012 (filer ≠ signer ≠ subject; the AI-agent slice) — confirms the substrate-mapping is coherent and that no new Trellis primitive is required.

**FW rows blocked:** FW-0058 (design — design dependency closed by this ADR's ratification), future FW build row.

**Recommended boundary:** at the `intake-handoff` plus the receipt-render surface. Formspec owns the `AuthoredSignature.capacity` + `agentChain` shape; WOS owns the governance-layer agent declaration + deontic enforcement + autonomy cap + disclosure; Trellis owns the chain integrity (unchanged byte-neutral envelope). Verifier rendering walks the `agentChain` from the persisted receipt; WOS audit trail is the optional bridge for case-investigation use.

**Shape:** per [FW-0058 design §3 + §5]:
1. **Capacity mapping.** Formspec `AuthoredSignature.capacity == "ai-agent"` maps onto WOS `actors[].type == "agent"` + `agents[].id` join (per WOS ADR-0064). Agent identity binding (per SC-4 + EXT-8a) is the third leg.
2. **Provenance bridge.** `AgentChainEntry.capabilityInvocationRef` resolves to a WOS `capabilityInvocation` provenance record per ai-integration.md §3.3.1. The bridge is OPTIONAL — the chain is authoritative for capacity rendering without the bridge; the bridge enables "see WOS audit trail" in the verifier.
3. **Trellis discipline.** No new Trellis primitive. The agent's `AuthoredSignature` rides the standard Formspec Signed Response Payload through the standard chain. Per Trellis Phase 1 byte-neutral discipline, the verifier doesn't distinguish agent-signed from human-signed at the substrate level — only at the receipt-render level where the `capacity` declaration drives the chain rendering.
4. **Verifier discipline.** Verifier walks `agentChain` end-to-start; renders four-party chain per §3.3; surfaces `WosProvenanceUnavailable` informational when the WOS substrate isn't reachable (post-receipt, archival case). Chain integrity failures (`MissingAgentChain` / `BrokenAgentChain` / `UngroundedAgentChain` / `InvalidDelegationArtifact`) per §5.3 are unverifiable-capacity, NOT forged-receipt per AP-023.
5. **WOS submission gate.** WOS Kernel §10.5's `agentSubmitterUnauthorized` typed error covers the form-side rejection path; symmetric `humanSubmitterUnauthorized` for the inverse case (form requires agent + human submits) is a small WOS-side addition.
6. **Multi-party composition.** Per [FW-0050 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md): per-party scoping per `partyRole` on `AuthoredSignature` applies to agent capacity identically. An agent filing as one party in a multi-party flow carries BOTH `capacity: "ai-agent"` + `agentChain` AND `partyRole: "asymmetricPrimary"` (or whatever role the party occupies).
7. **Safe-* composition.** Per [FW-0049 §3.3](2026-05-23-fw-0049-safe-address-handling-design.md): safe-* class fields render masked to the agent's introspection identically. The agent submits without seeing the plaintext; the receipt carries the safe-* class declaration unchanged.
8. **PKAF downstream.** When a downstream Rulespec assertion cites a value from an agent-filed form, the assertion's `rkaf:AILineage` per PKAF rkaf-core §5.3 carries the AI-involvement; the filer-side `agentChain` is upstream of assertion authoring (distinct scope per §1.4). **Vocabulary tokens are ILLUSTRATIVE pending Rulespec alignment row.**

**Subsystem-count honesty.** WOS already specifies its share of the substrate (the heaviest specification); Formspec ratifies the deferred `agentChain` shape; Trellis is byte-neutral. **XS-6 is primarily a confirmation + naming exercise rather than a new substrate commitment.** Lighter cross-stack work than XS-3 (FW-0048) or XS-4 (FW-0049) because the substrate is mature; comparable to XS-5 (FW-0034) in scope.

### 6.4 What FW-0058 ratifies standalone

**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `aiAgentFiler` capability shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the resolved-profile block in §4.3, the three-tier form-policy (§3.1), the failure-semantics binding (§5.1).
- The `agentChain` shape (§3.2) as a candidate for EXT-3 ratification (closes the deferral).
- The verifier rendering contract per §3.3 (end-to-start walk; capacity-not-truth discipline per AP-023).
- The runtime invariants binding WOS substrate to the form-load failure surface (§5.1 + §5.2 + §5.3).
- The composition rules with FW-0048 (§7.3), FW-0049 (§7.4), FW-0050 (§7.5), FW-0034 (§7.6), FW-0030 (§7.2), FW-0051 (§7.7).
- The adopter-contract pattern over the WOS workflow runtime binding + agent-identity provider + chain resolver + verifier render adapter (§4.2) — the conformance fixture pattern can be authored now even though the port shape lands with the build row.
- The form-policy + org-policy + instance-capability shape (§4.1 + §5.1) — failures fall directly into existing ADR-0011 typed-error paths.

**Waits on upstream:**

- ADR-0011 amendment to enumerate `aiAgentFiler` in the Feature Ownership Table (small edit; expected to land with this design's owner-ratification).
- EXT-3 ratification with the §3.2 `agentChain` shape.
- XS-6 cross-stack confirmation ADR ratification at stack-root.
- SC-4 + EXT-8a (agent-identity binding substrate; already queued for FW-0030).
- WOS reference adapter availability (per WOS ADR-0064; `wos-agent-stub` ships, production adapters are skeletons).

## 7. Hard binding to other FW rows

### 7.1 FW-0030 — Federated agent identity

When a form declares both `aiAgentFiler: allowed | required` AND `federatedIdentity` (assuming FW-0030 ratifies a `federatedIdentity` capability key), the agent's identity binding rides the same `urn:formspec:sig-method:*` + `urn:formspec:identity-method:*` registry framework as human signers. The `identityBinding.authMethod` discriminator extends to include agent-identity providers (e.g., `urn:formspec:identity-method:wos-agent-registry@1`, `urn:formspec:identity-method:did-key-agent@1`).

**No new cross-stack substrate.** SC-4 + EXT-8a generalize to agent identities without modification. **Cross-row touch is informational** — a small note in FW-0030's row body naming the agent-identity extension.

### 7.2 FW-0048 / FW-0059 — Coercion-aware signing (prompt-injection vector)

A compromised LLM / prompt-injected agent IS structurally a coercion vector. Per FW-0048 §3 threat model, coercion is "non-respondent influence on the signing act"; a prompt-injected agent that fills under attacker control is structurally identical to a coerced human signer.

**Recommended composition pattern.** Forms in the FW-0048 high-coercion-risk template set ([FW-0048 §6.4](2026-05-23-fw-0048-coercion-aware-signing-design.md) names: financial POA, immigration sponsorship, advance directive, marriage/divorce, custody, benefits-redirect) SHOULD declare `aiAgentFiler: forbidden` AND `duressAware: required`. The combined posture: no agent surface to be prompt-injected through, AND the duress channel is available if the (human) respondent is being coerced.

**For forms that declare both `aiAgentFiler: allowed` AND `duressAware: required`,** the duress channel substrate (per FW-0048 §3 + §5) is available to the agent's invocation surface — the agent's operator can emit a duress signal if its runtime detects an injection (analogous to a human signaling duress via the dual-credential mechanism). The receipt is byte-identical per FW-0048 §3.2 (chain-observer opacity holds for agent-signaled duress identically).

**Cross-row touch.** FW-0048 design's §7 (per-party composition) gets a sibling note for FW-0058 — prompt-injection as coercion vector; agent duress signaling via the same substrate. **Light touch; informational rather than load-bearing.**

### 7.3 FW-0049 / FW-0060 — Safe-address composition (agent acting on behalf of protected party)

A property-management agent filing on behalf of a survivor; a benefits-AI filing on behalf of a protected elder. **The agent itself doesn't gain visibility into the safe-* fields** — the safe-* mask survives the agent's read just as it survives the BYO assistant's read per FW-0049 §3.3.

**Composition pattern.** Safe-* class fields render masked to the agent's WOS-governed introspection; the agent submits the form WITHOUT seeing the underlying safe-* value; the receipt carries the safe-* class declaration unchanged. The agent operator may need additional inputs to fill safe-* fields (e.g., the protected party provides their safe-address out-of-band to the operator, who supplies it to the agent through a side channel); this is the operator's substrate concern, NOT FW-0058's.

**Verifier discipline.** The verifier renders the four-party chain ("filed by [agent]") AND the safe-* class declaration ("address protected per safe-class").  Both surfaces compose naturally — they're independent decorations on the receipt.

**Cross-row touch.** FW-0049 design's §7 gets a sibling note for FW-0058 — agent acting on behalf of protected party; safe-* mask survives the agent's read. **Light touch.**

### 7.4 FW-0050 / FW-0061 — Multi-party composition (agent as one party)

A corporate agent filing one party's portion of a joint corporate filing. The `partyRole` field per FW-0050 §6.3 composes with `agentChain` per FW-0058 — the agent's `AuthoredSignature` carries BOTH `capacity: "ai-agent"` + `agentChain` AND `partyRole: "asymmetricPrimary"`.

**Resolution.** Per FW-0050 §7.1 per-party scoping: the agent fills only its party's section; the form-side validation gates per-party `editableBy[]` identically for agent capacity. Per-party visibility per FW-0050 §7.1 applies to the agent's WOS-governed introspection identically — Party B's agent doesn't see Party A's fields.

**Cross-row touch.** FW-0050 design's §7.3 ("Other FW interactions") gets a sibling note for FW-0058 — agent as one party; `agentChain` + `partyRole` compose on the same `AuthoredSignature`. **No FW-0050 design `§7.x` extension required** — the existing per-party-visibility primitive covers; FW-0058 just rides.

### 7.5 FW-0034 / FW-0038 — Honest-correction (agent-issued correction)

An agent may discover a mistake in an earlier filing and issue a correction. The correction's `AuthoredSignature` carries the SAME `agentChain` as the original filing (or a refreshed chain if delegation changed). Per FW-0034 §3.2 substrate mapping: `response.correction-recorded` (or `response.amendment-opened` for substantive corrections) emits with the agent as the authoring signer.

**Cross-row touch.** EXT-5's `response.correction-recorded` + `response.withdrawn` + `response.dispute-attached` event types already carry the authoring signer reference; the `agentChain` rides naturally via the `AuthoredSignature` reference. **No new cross-row substrate needed**; FW-0034's existing per-party `partyRef` field generalizes to per-agent attribution via the signer-side `agentChain`. **Cross-row touch is informational (one cross-link in FW-0034 design's §7).**

### 7.6 AP-023 — Verified ≠ true (verifier discipline)

The verifier attests to **capacity** (the agent was acting under the named authority chain), NOT **truth** (the agent's claims about the case are accurate). The four-party chain renders as "X agent acting under Y operator under Z accountable human under W scope" — never as "this is a true statement."

**FW-0058 satisfies AP-023 by:**

1. **Capacity-rendering vocabulary.** The verifier's rendered chain string uses capacity vocabulary ("acting under", "delegated by", "with scope") — NOT truth vocabulary ("certified", "verified as accurate", "guaranteed").
2. **Chain-integrity failures map to unverifiable-capacity, not forged-receipt.** Per §5.3: `MissingAgentChain` / `BrokenAgentChain` / `UngroundedAgentChain` / `InvalidDelegationArtifact` report that the capacity claim cannot be substantiated — they do NOT report that the receipt is forged. The receipt's integrity (bytes unchanged + signed by named key) is independent of the capacity chain's resolvability.
3. **WOS provenance unavailability is informational.** Per §5.3: when the WOS substrate isn't reachable, the verifier surfaces this informationally and still renders the chain from the persisted receipt; the WOS audit trail is the bridge for case-investigation, NOT the primary capacity surface.

**Cross-row touch.** AP-023 is doc-only; no other-row update needed. FW-0058 design names AP-023 satisfaction inline.

### 7.7 FW-0051 — BYO-assistant (vocabulary clash; load-bearing distinction reciprocated)

**FW-0058 is AI-as-respondent; FW-0051 is AI-as-helper-for-respondent.** The two rows are easy to confuse but architecturally distinct. The vocabulary table mirrors FW-0051 §7.6 with inverted framing:

| Axis | FW-0058 (AI-agent filer) | FW-0051 (BYO-assistant) |
|---|---|---|
| Who fills the form | The AI agent (non-human capacity) | A human respondent |
| Substrate | WOS `actorExtension` adds `ActorKind::Agent`; `AgentInvoker` port per WOS ADR-0064; receipt has `agentChain` via EXT-3 + `capacity: "ai-agent"`; workflow provenance per `capabilityInvocation` | No actor-extension change; no signature shape change; the AI runs in the respondent's tools |
| Trust model | Agent is registered actor in workflow; deontic constraints from WOS AI Integration Spec apply; agent is OUTSIDE the trust boundary | Assistant is untrusted by form; runs in respondent's browser/tools; per-act consent from respondent |
| Capacity on AuthoredSignature | `capacity: "ai-agent"` + `agentChain` block (EXT-3) | None — respondent is the signer; capacity is `self` |
| Provenance surface | Workflow provenance record per `capabilityInvocation` per WOS ai-integration.md §3.3.1 | Field-level provenance per EXT-2 (`attestedBy: respondent, sourceRef: assistant-suggested`) |
| Form policy key | `aiAgentFiler` (this design) | `bringYourOwnAssistant` (per FW-0051 design) |
| Failure mode | WOS fallback chain (terminating in human review per WOS §5.3 (4)) | Per-act respondent rejects the suggestion; nothing applies |
| GDPR Article 22 | Implicit via `agentChain` presence on the receipt (§3.4) | Not applicable — the human respondent is making the decision; per-field AI-assistance lineage is incidental |

**The two rows compose.** A form filled by an AI agent (FW-0058) may consult an external assistant (FW-0051) during its own fill. The composition would be FW-0058 wrapping FW-0051 — the AI agent acts as the respondent-role-equivalent and the BYO-assistant runs in the agent's tools. **Out of scope for slice 1; flag for future, per FW-0051 §7.6 deferral.**

**The AI-fills-plus-human-signs case is FW-0051 + EXT-2, NOT FW-0058.** When the AI fills the form but the human reviews + signs, the signer is the human (`capacity: "self"`); the AI's contribution is per-field provenance (`attestedBy: "ai-agent", sourceRef: "vendor-ai-tool"` via EXT-2). This is the canonical FW-0051 case (Stage 2 mutation per FW-0051 §3.4 — assistant proposes, respondent confirms). **FW-0058 is the case where the AI IS the signer, not when it merely helps.**

**Cross-row touch.** FW-0051 design's §7.6 already names the FW-0058 distinction; FW-0058 design's §7.7 reciprocates with the inverted framing table. **PLANNING.md cross-link bilaterally updated.**

## 8. Open questions / deferrals

Honest list of what FW-0058 design does NOT resolve:

1. **The capacity-spoofing problem (forged human-class credentials).** An agent that signs with stolen or improperly-issued human credentials succeeds at the form layer. **Defense rests on the identity-provider's integrity** — substrate-layer concern, NOT form-layer. SC-4 + EXT-8a IdP discipline is the upstream substrate; FW-0058 names the requirement.
2. **The prompt-injection problem (compromised agent).** A compromised LLM filing under attacker control is structurally a coercion vector. **Mitigation = composition with WOS substrate (deontic constraints + autonomy caps + confidence floor + fallback chain) + composition with FW-0048's duress channel + agent-operator defenses (per OWASP LLM Top 10).** Slice 1 cannot eliminate; documented honestly.
3. **Cross-deployment agent reputation.** An agent's behavior at deployment A does not bind its behavior at deployment B. Cross-deployment reputation tracking is an agent-registry concern, not FW-0058. Out of scope.
4. **The FW-0051 composition (agent using BYO assistant during its own fill).** Per FW-0051 §7.6 + §7.7 here, flagged for future; not in slice 1 scope.
5. **WOS reference adapter production-readiness.** Per WOS ADR-0064, `wos-agent-stub` ships; production adapters (`wos-agent-anthropic` / `wos-agent-claude-sdk` / `wos-agent-mcp` / `wos-agent-a2a` / `wos-agent-http`) are skeletons. **Build row blocked on at least one production adapter** OR on stub-backed dev-only acceptance.
6. **SC-4 + EXT-8a ratification.** Agent-identity binding substrate. Already queued for FW-0030. **Build row blocked on SC-4 ratification.**
7. **Agent-operator data-handling commitment (AP-024 binding for the agent's data flow).** The agent operator's training / evaluation / retention commitment is the operator's responsibility, NOT the form's. **AP-024 binds the form's posture toward respondent content** (no training on respondent content); the agent operator's posture toward its own input/output is the operator's substrate. FW-0058 names the requirement (`agentClass` declaration in the chain entry carries the operator's commitment tier); enforcement is at the operator-audit layer.
8. **Long-chain rendering UX.** For chains with 5+ entries (deep delegation hierarchies), the verifier's inline rendering may overwhelm. Default render shows the first 3 entries + the terminal; expansion-to-full-chain is a UI affordance. Slice 1 defers the precise UX; build row chooses.
9. **`humanSubmitterUnauthorized` typed error.** Symmetric error for the `aiAgentFiler: required` + human-submits case. Proposed as a small WOS-side addition (analog to `agentSubmitterUnauthorized` per WOS Kernel §10.5). **Defer to WOS-side ratification.**
10. **WOS AI Integration Spec `draft` status.** Per its header, `1.0.0-draft.1`. Promotion to ratified is upstream work. FW-0058 design proceeds against the draft. **If WOS evolves in ratification, FW-0058 follows.**

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: three-tier `forbidden \| allowed \| required` form-policy | PROPOSAL | owner review + ADR-0011 evolution |
| Q2: flat list `AgentChainEntry[]` with end-to-start authority order | PROPOSAL | owner review + EXT-3 ratification |
| Q3: form-side runtime trusts WOS workflow's actor declaration (no independent fingerprinting) | PROPOSAL | owner review |
| Q4: GDPR Article 22 surfaceability is implicit via `agentChain` presence (no separate field) | PROPOSAL | owner review |
| `aiAgentFiler` capability addition to ADR-0011 Feature Ownership Table | PROPOSAL | owner review + ADR-0011 amendment |
| `agentChain` schema shape per §3.2 — EXT-3 deferral closure | PROPOSAL to formspec | formspec spec-expert review + EXT-3 ratification |
| Verifier rendering contract: end-to-start walk; capacity-not-truth per AP-023 | PROPOSAL | owner review |
| Form-load failure semantics: typed errors per ADR-0011 | PROPOSAL | owner review |
| Submit-time failure semantics: `agentSubmitterUnauthorized` (WOS Kernel §10.5) + symmetric `humanSubmitterUnauthorized` (proposed WOS addition) | PROPOSAL | owner review + WOS spec-expert review |
| Verification-time failures: `MissingAgentChain` / `BrokenAgentChain` / `UngroundedAgentChain` / `InvalidDelegationArtifact` / `WosProvenanceUnavailable` | PROPOSAL | owner review |
| Adopter contracts over WOS workflow binding + agent-identity provider + chain resolver + verifier render adapter; port shape deferred to build row per ADR-0009 §(b) | PROPOSAL | owner review |
| XS-6 (new) — formspec + WOS + trellis composition confirmation cross-stack ADR | PROPOSAL to stack-root | cross-stack expert review |
| Coercion composition per FW-0048 §6.4 (high-coercion templates default `forbidden`; agent duress via FW-0048 substrate when `allowed`) | PROPOSAL | owner review + FW-0048 design author |
| Safe-address composition per FW-0049 §3.3 (safe-* mask survives agent read) | PROPOSAL | owner review + FW-0049 design author |
| Multi-party composition per FW-0050 §7.1 (agent as one party; `agentChain` + `partyRole` compose on same `AuthoredSignature`) | PROPOSAL | owner review + FW-0050 design author |
| Correction composition per FW-0034 §3.2 (agent-issued correction rides `agentChain` naturally) | PROPOSAL | owner review + FW-0034 design author |
| FW-0030 composition (agent-identity rides SC-4 + EXT-8a substrate) | PROPOSAL | owner review |
| FW-0051 vocabulary distinction reciprocated (FW-0058 = AI-as-respondent; FW-0051 = AI-as-helper-for-respondent) | PROPOSAL | owner review + FW-0051 design author |
| AP-014 / AP-024 / AP-023 bindings codified | PROPOSAL | owner review |

**Row status change:** FW-0058 moves from `open` to `in design`. FW-0058 stays in design until this proposal is owner-ratified, ADR-0011 amends to include `aiAgentFiler`, EXT-3 ratifies with the `agentChain` shape, and XS-6 lands at stack-root.

## 10. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc; the WOS AI Integration Spec IS the agent-as-actor substrate)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`aiAgentFiler` is post-MVP; this design stages for post-MVP)
- [web ADR-0007](../adr/0007-identity-provider-port.md) — identity provider port (agent-identity binding rides the same port; FW-0058 names the agent-class extension)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §4.2 defers `AgentFilerComposition` port shape to build row per §(b))
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (the design proposes adding `aiAgentFiler` to the Feature Ownership Table)
- [WOS AI Integration Spec — `work-spec/specs/ai/ai-integration.md`](../../../work-spec/specs/ai/ai-integration.md) — **the canonical agent-as-actor + agent-invocation + governance substrate**
- [WOS Kernel §10.1 + §10.5 — `work-spec/specs/kernel/spec.md`](../../../work-spec/specs/kernel/spec.md) — `actorExtension` seam + agent submission gate
- [WOS ADR-0064 — `work-spec/thoughts/adr/0064-agent-actor-kind-and-invoker-port.md`](../../../work-spec/thoughts/adr/0064-agent-actor-kind-and-invoker-port.md) — agents as first-class `ActorKind`; `AgentInvoker` port
- [EXT-3 (`AuthoredSignature.capacity` + `agentChain`) — `thoughts/specs/2026-05-22-upstream-extension-queue.md:46`](2026-05-22-upstream-extension-queue.md) — closes deferral with §3.2 shape
- [FW-0048 design 2026-05-23](2026-05-23-fw-0048-coercion-aware-signing-design.md) — coercion-aware signing (composition seam at §7.3; prompt-injection as coercion vector)
- [FW-0049 design 2026-05-23](2026-05-23-fw-0049-safe-address-handling-design.md) — safe-address handling (composition seam at §7.4; safe-* mask survives agent read)
- [FW-0050 design 2026-05-23 §7.1](2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party (composition seam at §7.5; agent as one party)
- [FW-0034 design 2026-05-24](2026-05-24-fw-0034-honest-correction-path-design.md) — honest correction (composition seam at §7.6; agent-issued correction)
- [FW-0051 design 2026-05-23](2026-05-23-fw-0051-bring-your-own-assistant-design.md) — BYO-assistant (vocabulary distinction reciprocated at §7.7)
- [PKAF rkaf-core §5.3 — `PKAF/spec/rkaf-core.md:175`](../../../PKAF/spec/rkaf-core.md) — `AILineage` (assertion-side; distinct scope from FW-0058's filer-side `agentChain` per §1.4)
- Source brief: [`thoughts/sketches/2026-05-24-fw-0058-ai-agent-filer-research-brief.md`](../sketches/2026-05-24-fw-0058-ai-agent-filer-research-brief.md)
- Journey: [J-012 in `JOURNEYS.md:343`](../../JOURNEYS.md)
- Anti-patterns: [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-024 in `JOURNEYS.md:191`](../../JOURNEYS.md), [AP-023 in `JOURNEYS.md:185`](../../JOURNEYS.md)
- External prior art: Anthropic Computer Use, OpenAI Operator, Anthropic MCP, LangChain / LangGraph form-fill agents, W3C Verifiable Credentials Data Model 2.0, OAuth 2.0 + RFC 8693 Token Exchange (delegation chains), W3C DIDs, IETF SPIFFE/SPIRE, EU GDPR Article 22, EU AI Act Article 13, OMB M-24-10, OWASP LLM Top 10 (LLM01 prompt injection), Greshake et al. indirect prompt injection (2023)
