# FW-0050 — Multi-party submission: design proposal

**Date:** 2026-05-23
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q4 are open until accepted.
**Row:** [FW-0050 in `PLANNING.md:574`](../../PLANNING.md) (design); paired build row [FW-0061 in `PLANNING.md:689`](../../PLANNING.md).
**Journey:** [J-041 in `JOURNEYS.md:703`](../../JOURNEYS.md).
**Feature key:** `multiParty` per [web ADR-0011 Feature Ownership Table line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md).
**Source brief:** [`thoughts/sketches/2026-05-23-fw-0050-multi-party-research-brief.md`](../sketches/2026-05-23-fw-0050-multi-party-research-brief.md). Upstream-primitive inventory, FW interactions, and scenario boundary questions live there; this doc decides over them.

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for joint-submission flows where each party authenticates independently, holds their own draft, sees only the parts the form's privacy model says they should see, and signs their own attestations cryptographically separately ([FW-0050 Done](../../PLANNING.md)). The deliverables are: framing decisions (Q1–Q4), the `multiParty` capability contract under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md), the port shape (or the explicit decision not to add one), the cross-stack dependency chain, and the open questions that remain for the build row.

This is a **design row**. The deliverable is a doc plus follow-on cross-stack and spec items, not code. The build row is [FW-0061 in `PLANNING.md:689`](../../PLANNING.md).

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. FW-0061 owns build.
- **Authoring the upstream spec.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web consumes upstream primitives, does not invent them. This doc proposes XS-1 content from the consumer perspective but does not author the stack-root ADR or the formspec schema change.
- **Synchronous co-fill.** Real-time co-presence editing is out of scope here per Q2; if pulled forward, it lands as its own design row, not as scope creep on FW-0061.
- **Studio-side multi-actor editing.** That is the authoring-time problem solved by [stack-root ADR-0151 (multi-actor editing via Automerge)](../../../thoughts/adr/0151-multi-actor-editing-automerge.md). Respondent-time multi-party submission is a structurally different problem (N principals, each with their own signed attestation, not N authors converging on one document). Do not import Automerge framing.
- **AI-agent party.** EXT-3 carves the AI-agent variant out via `agentChain` (deferred per [FW-0058 in `PLANNING.md:659`](../../PLANNING.md)); this doc treats an AI-agent party as a future extension along the same role taxonomy, not as a separate shape.
- **Cross-IdP federation specifics.** Per-party identity proofing across IdPs is a real concern (research brief Q6) but lands through [FW-0030 federated identity claim handoff](../../PLANNING.md). This design declares the dependency; it does not solve it.

## 2. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 2.1 Q1 — One canonical multi-party shape with a role taxonomy

**PROPOSAL.** FW-0050 designs **one parameterized shape** with a closed `partyRole` taxonomy: `coEqual`, `asymmetricPrimary`, `asymmetricSecondary`, `guardianFor`. Joint tax (two `coEqual`), immigration sponsorship (`asymmetricPrimary` petitioner + `asymmetricSecondary` beneficiary), child custody (two `coEqual` parents over a non-party child subject), household benefits (one `asymmetricPrimary` head-of-household + N `asymmetricSecondary` adult attestants) all fall out as configurations.

**Rationale.** One port surface, one conformance suite, one resolved-runtime-profile shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Three separate shapes would force three separate capability keys (`multiPartyCoEqual` / `multiPartyAsymmetric` / `multiPartyGuardian`), three policy resolutions, three sets of conformance fixtures, and three failure-semantic taxonomies — a 3× duplication of the same architectural shape. The taxonomy pattern is the one [web ADR-0011 Feature Ownership Table line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md) already uses for `allowed party roles` as an org-policy axis; this decision instantiates that slot rather than inventing a new axis.

**Alternative rejected: three shapes per scenario class (research brief Q1).** Cleaner per-case mental model; loses on conformance surface area and on the [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) discipline (one upstream primitive vs three). The research brief's `§3.1`–`§3.4` scenarios differ in role asymmetry and visibility scoping, not in shape; collapsing them into role-parameter values keeps the contract narrow.

**Counter-argument addressed (child-custody disagreement-as-state).** The brief flags that custody's "disagreement is a first-class state, not a silent override" ([JOURNEYS.md:708](../../JOURNEYS.md)) may not parameterize cleanly. It does, when the disagreement is modeled at the **field-level merge layer**, not at the party-role layer: roles declare who-can-edit-what; merge semantics declare what-happens-when-edits-conflict. Two `coEqual` parents editing the same field can both write; the merge result records both authored values with party attribution, not a winner. Disagreement-as-state is a merge-semantics property under §5, not a separate role.

### 2.2 Q2 — Async-first; sync as a later, separate design row

**PROPOSAL.** Multi-party submission is **async by default**. Party A fills, signs their slice, hands off. Party B authenticates separately, sees the post-handoff snapshot, fills their slice, signs theirs. No real-time co-presence required. Sync (real-time co-fill, two browsers updating the same draft live) is **explicitly deferred** to a separate design row.

**Rationale.** Async matches the existing solo-fill mental model: one respondent session, one draft, one signature, then handoff. Sync introduces a substantial substrate commitment (websocket transport, OT/CRDT convergence, presence indicators, concurrency-aware conflict resolution) that fan-outs across `DraftStore`, the engine reactive state, every adapter, and every conformance fixture. The research brief's J-041 evidence ([JOURNEYS.md:708](../../JOURNEYS.md)) names "per-party signature ceremonies that don't require synchronous co-presence" — async is the explicit user-value target. Sync is a nice-to-have, not on the J-041 critical path.

**Alternative rejected: sync-first or both.** Sync-first builds the harder thing first and discovers the async use cases anyway. Both-at-once doubles the port surface and the conformance burden for a capability where the async path covers every J-041 scenario.

**Consequence noted.** Async means the signature on Party A's slice may freeze before Party B has signed theirs. The byte protocol supports this — research brief `§1.3` cites that the Formspec Signed Response Payload digest is stable when co-signatures are appended ([`formspec/schemas/response.schema.json:54`](../../../formspec/schemas/response.schema.json)). Whether **edits** are frozen post-Party-A-signature is a merge-semantics decision (§5.3), not a sync/async decision.

### 2.3 Q3 — Definition-time party-role declaration; runtime party-binding

**PROPOSAL.** The form Definition pre-enumerates **party roles** (e.g., "petitioner", "beneficiary"); the runtime binds actual identities to those role slots. Dynamic per-form addition of new role types is out of scope; runtime-known parties bind to design-time-known roles only.

**Rationale.** Matches Formspec's spec-first discipline: the Definition is the authoritative declaration of what the form is, and "who-signs-what" is a property of the form, not of the runtime. Definition-time declaration is validatable (the engine can refuse to render a form with conflicting role/visibility declarations), discoverable (the resolved runtime profile per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) can answer "does this form need multi-party?" before any party authenticates), and stable (a downstream verifier checking a multi-party receipt knows from the Definition version which roles were structurally legal).

**Alternative rejected: dynamic runtime party-addition.** The research brief Q3 flags this as the household-benefits case where the lead respondent invites N adult attestants whose count isn't known at design time. Two answers:

1. Variable **count** at runtime is supported: a role can be declared with cardinality (`{role: "adultAttestant", cardinality: "1..N"}`) and the runtime binds 1 to N identities to that role slot. The Definition still declares the role type.
2. Variable **role types** at runtime — the lead respondent inventing a new role on the fly — is forbidden. If the form's authoring side didn't anticipate a role, the form is not modeling it; ad hoc role invention defeats per-role visibility/signing declarations.

This split keeps the SNAP / Medicaid household-attestant case in scope without giving up Definition-time validation.

### 2.4 Q4 — Intake-only viable for `coEqual` only; WOS governance required for asymmetric roles

**PROPOSAL.** The **intake-only path** (formspec-web + formspec engine + intake-handoff, no `workspec-server` co-investment) is viable for the simplest case: two-or-more `coEqual` parties signing the same payload, no per-party state-machine differences, no governance branching. Joint tax filing fits.

The **WOS-orchestrated path** kicks in when **any of** the following is true:

1. Any party role is `asymmetricPrimary` or `asymmetricSecondary` (the roles trigger different downstream obligations).
2. Any party role is `guardianFor` (the legal-capacity check is a governance step, not a renderer step).
3. The form's runtime policy under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) declares per-party deadlines, per-party reminders, or per-party invitation orchestration.
4. The form requires per-party post-submission case-state visibility (per-party `StatusReader` results — see §6.3).

**Trigger boundary, stated precisely.** Intake-only is viable when all parties play the **same role** with the **same downstream obligations** and the orchestration is entirely client-side (no server needs to track "Party B has not signed yet"). Anything else routes through WOS.

**Rationale.** Per [web ADR-0011 line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md), `multiParty` is one instance capability with a single org-policy axis (`allowed party roles`). The runtime feature resolver can produce a resolved profile that says "this form needs `multiParty` at the `asymmetric` tier" — and the absence of a WOS-backed adapter fails closed per ADR-0011's `UnsupportedRequiredFeatureError`. This pattern lets the joint-tax case ship over a small intake-only adapter while the asymmetric cases wait for WOS co-investment.

**Alternative rejected: intake-only across the board.** Loses immigration-sponsorship and custody cases — exactly the J-041 markets where the architectural significance argument lives ([JOURNEYS.md:707](../../JOURNEYS.md)).

**Alternative rejected: WOS-always.** Forces every joint-tax adopter to deploy `workspec-server` for a case where client-side orchestration suffices. Defeats [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md)'s adopter-diversity charter.

## 3. Capability key and port shape

### 3.1 Capability key under web ADR-0011

The `multiParty` instance-capability row from [web ADR-0011 Feature Ownership Table line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md) is the contract this design instantiates. The resolution layers per ADR-0011:

| Layer | What it carries for `multiParty` |
|---|---|
| Instance capability | Adapter-backed party/session orchestration; tier (`coEqual` / `asymmetric`) is part of the capability evidence |
| Org policy | `allowed party roles` (closed enum subset of the Q1 taxonomy) plus per-party assurance floors, deadline policy, invitation channel allow-list |
| Form policy | Form declares required `multiParty` tier (`coEqual` or `asymmetric`) and the per-role assurance floor required for each declared role |
| Resolved runtime profile | Enabled features + per-role policy resolution; the form-load boundary throws `UnsupportedRequiredFeatureError` if the instance tier doesn't satisfy the form's required tier |

The `tier` axis is the load-bearing addition. Without it, an instance with intake-only `coEqual`-capable orchestration looks like it can serve an immigration-sponsorship form; the resolver would let the form load and the failure would surface at signature time. Tiered capability fails closed at form-load per ADR-0011's failure-semantics discipline.

### 3.2 Port shape — proposal: no new port, conditional

Per [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) the discipline is "don't speculate on port shapes before consumer code" and "port what's adopter-shaped; encapsulate the rest." Applying that discipline to multi-party:

**Proposal: extend three existing ports rather than add a new `MultiPartyOrchestrator` port.**

| Existing port | What multi-party adds |
|---|---|
| `DraftStore` | Per-party draft scope. The same draft id resolves to N party-scoped slices; reads/writes are scoped by `(draftId, partyId)`. Round-trip invariant per ADR-0009 still holds (a `Response` per party slice). |
| `IdentityProvider` | No shape change. Each party authenticates through its own session; the shell holds N `IdentityClaim` values rather than 1. Cross-port coordination (whose claim is "current") lives in the shell per ADR-0009. |
| `SubmitTransport` | The submit envelope carries the merged multi-party `Response` (with per-party `authoredSignatures[]` entries depending on EXT-3); idempotency-key convention unchanged. |

**Why not a new port.** A `MultiPartyOrchestrator` port would either (a) be a thin wrapper over `DraftStore` + `IdentityProvider` (in which case it's a leak), or (b) own party-invitation, deadline-tracking, and per-party state — which is exactly what WOS already owns under Q4's asymmetric tier. Adding a port whose production implementation is "call WOS" creates the kind of architectural seam web ADR-0009 §"Not in the constitutional inventory" warns against. The intake-only `coEqual` tier can be served by the three extended ports above; the WOS-orchestrated asymmetric tier consumes WOS through `SubmitTransport`'s intake-handoff path plus an extension of the WOS applicant API (§6.2) — not a new client-side port.

**Conditional clause.** If FW-0061's build surfaces a real per-party-invitation flow that doesn't fit `DraftStore` / `IdentityProvider` / `SubmitTransport`, the build row may ratify a new port at that point. The discipline is to defer the port shape decision until the consumer code forces it, per [web ADR-0006](../adr/0006-issuer-sidecar-spec-request.md)'s retroactive lesson.

### 3.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a `multiParty` block:

```text
multiParty?: {
  tier: "coEqual" | "asymmetric"
  parties: Array<{
    roleId: string                      // matches Definition.parties[*].roleId
    role: "coEqual" | "asymmetricPrimary" | "asymmetricSecondary" | "guardianFor"
    cardinality: { min: number, max: number | "unbounded" }
    assuranceFloor: { ial?, aal? }      // per-role minimum, ADR-0011 + ADR-0140
    visibilityScope: "shared" | "scoped" // §5 governs scoping rules
  }>
  invitationChannel: "magic-link" | "wos-task" | "out-of-band"
  deadlinePolicy?: { perPartyDeadline?: Duration, expirationAction: "void-submission" | "convert-to-partial" }
}
```

The block is the resolver's read-only output. Adapters do not consume it directly; the shell does, and orchestrates ports against it. This keeps the port-extension surface narrow per [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md).

## 4. Three worked scenarios

Each scenario shows: party-role bindings, the resolved runtime profile, which ports get exercised, what ships in MVP-tier vs WOS-tier.

### 4.1 Joint US tax filing (research brief §3.1) — intake-only

- **Roles:** Two `coEqual` parties, no per-party scope split (entire return is jointly authored and jointly attested per IRS Form 1040).
- **Resolved profile:** `multiParty.tier = "coEqual"`, two `coEqual` party slots with cardinality `{min:2, max:2}`, `visibilityScope: "shared"`.
- **Ports exercised:** `DraftStore` (single shared draft, two `authoredSignatures[]` entries), `IdentityProvider` (two sessions over time), `SubmitTransport` (one merged Response). No WOS dependency required for the minimum path.
- **MVP-tier viable:** yes, for adopters whose `multiParty` instance capability is intake-only `coEqual`. The submit is one Response with two `AuthoredSignature` entries; EXT-3's `capacity = "self"` + new `partyRole = "coEqual"` field identify each signer's role.

### 4.2 Immigration sponsorship I-130 + I-485 (research brief §3.2) — WOS-tier

- **Roles:** One `asymmetricPrimary` (petitioner) + one `asymmetricSecondary` (beneficiary). Different signature blocks, different attestation obligations, asymmetric per-section visibility (petitioner does not see beneficiary's prior visa denials).
- **Resolved profile:** `multiParty.tier = "asymmetric"`, two distinct role slots, `visibilityScope: "scoped"` with per-section visibility per `definition.schema.json` `visibleTo[]` (XS-1 dependency).
- **Ports exercised:** `DraftStore` (per-party scoped slices keyed by `(draftId, partyId)`), `IdentityProvider` (separate sessions, separate assurance floors per role), `SubmitTransport` (intake-handoff to WOS with `subjects[]` carrying both parties, per XS-1 `parties` block + `partySignatures[]`).
- **MVP-tier blocked:** the asymmetric tier requires WOS co-investment for per-party task assignment, per-party deadlines, and per-party post-submission status. Form-load fails closed with `UnsupportedRequiredFeatureError` per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) on instances that don't wire the WOS-tier adapter.

### 4.3 Child custody filing (research brief §3.3) — WOS-tier with merge-semantics requirements

- **Roles:** Two `coEqual` parents (the child is the **subject**, not a party — per research brief `§3.3`, the child neither fills nor signs; modeled as `intake-handoff.subjectRef` not as a party-role slot).
- **Resolved profile:** `multiParty.tier = "asymmetric"` (because of the per-party visibility and the disagreement-merge semantics, even though the roles are `coEqual`-symmetric — the **tier** axis tracks orchestration complexity, the **role** axis tracks signature semantics).
- **Ports exercised:** `DraftStore` (per-party scoped slices with overlap), `IdentityProvider` (two sessions), `SubmitTransport` (merged Response carrying disagreement-as-state per §5).
- **MVP-tier blocked.** Safe-address per-party visibility (§6.1 dependency on FW-0049/FW-0060) is the hard prerequisite; without it, a survivor's address could leak to the co-parent through the joint receipt.

## 5. Failure semantics and merge

### 5.1 Party 2 never returns (timeout / abandonment)

Two sub-cases driven by the resolved-profile `deadlinePolicy.expirationAction`:

- **`void-submission`** (default for asymmetric tier and for any safe-address-affected form): the submission is voided; Party A's signature is recorded as `partySignature.status = "revoked-on-expiration"` via an EXT-5-extended ledger event; no intake-handoff lands. Party A is notified that their signature did not result in a submission.
- **`convert-to-partial`** (legal for `coEqual` tier where the form explicitly declares partial submissions as valid — rare; SNAP-style household applications with a "if cohabitant declines, mark as single-applicant variant" rule): the intake-handoff lands with `partySignatures[]` carrying only Party A's entry and an `EXT-5 partyMissing` ledger event annotating the missing role slot.

**Default is `void-submission`.** Adopters opt into `convert-to-partial` per form-policy and only if the form's authoring side declares the partial-submission shape — silent downgrade is forbidden per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md)'s failure-semantics rule.

### 5.2 Party 1 withdraws after Party 2 signed

Three lifecycle ledger events covered by EXT-5 are required (research brief `§1.1` `respondent-ledger-spec.md:322` already has the `delegate` actor type to extend):

- `partySignature.requested` — when Party A invites Party B
- `partySignature.received` — when Party B signs their slice
- `partySignature.revoked` — when any party withdraws their signature post-receipt-of-another-party's-signature

The merged Response carries the surviving signatures plus the revocation event in the ledger sidecar. The receipt rendering surface (FW-0009, post-MVP) shows the chain: "Party B signed at T1; Party A revoked at T2; submission state = `multi-party-revoked`." No silent overwrite of Party B's signature.

**Constraint:** a party can withdraw only their **own** signature. No party can revoke another party's signature. The party-role contract is asymmetric in this direction even for `coEqual` roles.

### 5.3 Signature replay across parties

Each party signs over a `signedPayload.digest` per `formspec/schemas/response.schema.json:54`. Per the research brief `§1.1`, "the digest remains stable when later co-signatures are appended" — but only when the **content** doesn't change. Two protections:

1. **Per-party digest binding.** Each `AuthoredSignature` in the merged Response binds a specific `signedPayload.digest` value at the moment that party signed. If Party A's edit changes the digest after Party B signed, Party B's signature's `signedPayload.digest` no longer matches the current merged Response — verifier surfaces "Party B's signature is over a prior version of this submission." This is a verifier requirement, not a renderer one, and lives downstream of MVP per [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md).
2. **Edit-freeze after second-party signature.** Once any party other than Party A has signed, Party A's slice is **read-only** until either (a) Party A revokes their signature (§5.2) and all post-Party-A signatures revoke with it (cascade), or (b) all parties re-sign. This is a UI affordance the React shell enforces over the `DraftStore` extension; the substrate enforcement is the digest-binding above.

Cascade revocation policy: when a party revokes, every downstream party signature that depended on the revoked content (every signature in the merged Response with `signedPayload.digest` referencing pre-revocation state) is marked `dependent-revocation` in the ledger. The intake-handoff either re-opens for re-signature or transitions to voided per the form's `deadlinePolicy`.

### 5.4 Disagreement as first-class state (Q1 follow-through)

For `coEqual` roles editing a shared field (child custody §4.3), if both parties write different values, the field carries both values with party attribution in the merged Response. Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) the schema shape is **upstream-owned**; this design proposes the shape for XS-1 (§6.2 (5) below) and notes it as a hard dependency. The illustrative shape (subject to upstream ratification):

```text
"answers": {
  "primaryCaregiver": {
    "_multiPartyDisagreement": true,
    "values": [
      { "value": "Party A", "byParty": "parent-1", "attestedAt": "T1" },
      { "value": "Party B", "byParty": "parent-2", "attestedAt": "T2" }
    ]
  }
}
```

The renderer surfaces the disagreement to both parties before signature ceremony. The submitted Response carries the disagreement; the downstream consumer (court, in the custody case) sees both attested values. **No silent merge winner.** Without a Response-schema mechanism carrying both attested values, J-041's "disagreement is a first-class state, not a silent override" ([JOURNEYS.md:708](../../JOURNEYS.md)) is not modeled. The actual field name and structure are XS-1's call (§6.2 (5)); the load-bearing requirement is that the mechanism exist.

## 6. Cross-stack dependency chain

Honest about which parts of this design FW-0050 can ratify standalone vs which parts wait on upstream ratification.

### 6.1 The chain

```
FW-0050 design (this doc)
    ↓
XS-1 ratification (stack-root ADR — not yet authored)
    ↓
EXT-3 spec change (formspec — capacity + party-role on AuthoredSignature)
+ new EXT for definition.schema.json `parties` block + per-item `visibleTo[]`
    ↓
FW-0061 build (formspec-web)
```

### 6.2 XS-1 — multi-party intake cross-stack ADR (not yet authored)

The research brief flagged XS-1 as queued; this design verifies it is **not yet authored** at stack-root (checked `formspec-stack/thoughts/adr/` 2026-05-23 — no multi-party intake ADR present; ADR-0151 and ADR-0152 are the closest, but they cover Studio authoring-time multi-actor, not respondent-time multi-party — see §1.2). FW-0050's design proposes XS-1 content from the formspec-web perspective:

**XS-1 proposed content (consumer perspective):**

1. **Boundary:** at `intake-handoff`. Formspec owns the per-party artifact contract (Definition `parties` block, Response `partySignatures[]`); WOS owns per-party session orchestration above the asymmetric-tier threshold (Q4); Trellis substrate is unchanged (multi-signer composition already supported per research brief `§1.3` `trellis-operational-companion.md:1340` `append/029` fixture).
2. **Tier axis:** XS-1 ratifies the `coEqual` vs `asymmetric` tier split (Q1 + Q4) as the spec-level distinction that drives both the schema and the orchestration boundary.
3. **WOS extension:** the applicant API ([`work-spec/specs/api/applicant.md:27`](../../../work-spec/specs/api/applicant.md)) gains a multi-applicant projection. The cleanest shape is an `actorExtension` for `co-applicant` per kernel S10.1 (research brief `§1.2`), with per-party `ApplicantTaskSummary` slots and per-party status reads.
4. **Per-party visibility model:** per-item `visibleTo[]` on the Definition (research brief Q5 prefers per-section over per-item; this design defers the per-item vs per-section decision to XS-1 ratification — both are spec-author calls, not formspec-web's). Whichever shape ratifies, the resolver pattern from §3.1 carries it through.
5. **Disagreement-as-state mechanism on Response:** a Response-schema extension that lets a field carry multiple attested values with per-party attribution and per-party timestamps (illustrative shape in §5.4). Required so J-041's "disagreement is a first-class state, not a silent override" ([JOURNEYS.md:708](../../JOURNEYS.md)) is structurally modeled rather than authored ad-hoc per consumer. The exact field name and shape are XS-1 / formspec spec-author calls; the load-bearing requirement is the mechanism's existence.
6. **Trellis no-op:** XS-1 does not introduce new envelope formats; per the research brief `§1.3`, sequential per-party signing over a digest-stable Formspec Signed Response Payload already works at the byte level.

**Without XS-1 ratification, FW-0050 design cannot be acted on by FW-0061.** The dependency is hard.

### 6.3 EXT-3 — capacity + party-role on AuthoredSignature (queued)

Per [`thoughts/specs/2026-05-22-upstream-extension-queue.md:47`](2026-05-22-upstream-extension-queue.md). EXT-3 currently proposes adding `capacity` + `principalRef` + `authorityArtifact` to support FW-0037 (filer-not-signer). FW-0050 requires EXT-3 plus a strict superset: a `partyRole` field bound to `definition.schema.json.parties[*].roleId` so the receipt can render "Party A signed in role `petitioner` with capacity `self`."

**This is one EXT-3 extension, not two.** The capacity primitive (FW-0037) and the party-role primitive (FW-0050) share the `AuthoredSignature` extension surface; landing them together avoids two passes over the same schema.

### 6.4 New EXT — Definition `parties` block

Not yet in the upstream extension queue. This design proposes:

- **EXT-N (`parties` block on `definition.schema.json`)** — form-level `parties: PartyRole[]` declaring role slots with cardinality, plus per-item `visibleTo[]` / `editableBy[]` / `signedBy[]` (or per-section equivalent — XS-1 decides). Closes the per-party visibility model the FW-0050 design depends on.

This entry should be added to [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](2026-05-22-upstream-extension-queue.md) as part of FW-0050's design landing.

### 6.5 What FW-0050 ratifies standalone

**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `multiParty` capability shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the resolver block in §3.3, the tier axis, the failure-semantics binding.
- The decision **not** to add a `MultiPartyOrchestrator` port (§3.2).
- The per-party draft-scope extension to `DraftStore` (§3.2) — the conformance fixture pattern can be authored now even if the build waits.
- The merge-semantics shape (§5) — proposed for inclusion in XS-1.

**Waits on upstream:**

- The Definition `parties` block + per-item visibility (EXT-N).
- The `partyRole` field on `AuthoredSignature` (EXT-3 extension).
- The `subjects[]` and `partySignatures[]` shapes on `intake-handoff` (XS-1).
- The WOS applicant API extension for multi-applicant projection (XS-1 + WOS ADR).
- The receipt rendering surface for multi-party (post-MVP per [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md)).

## 7. Hard binding to other FW rows

### 7.1 FW-0049 / FW-0060 — safe-address (load-bearing)

FW-0060 explicitly cites: "per-party visibility (per FW-0050) land across the form, the receipt, and the verifier" ([`PLANNING.md:685`](../../PLANNING.md)). The dependency is bidirectional:

- FW-0050 depends on FW-0049's privacy-class taxonomy ([EXT-1 in `2026-05-22-upstream-extension-queue.md:26`](2026-05-22-upstream-extension-queue.md)) for marking which fields are protectable.
- FW-0060 depends on FW-0050's per-party visibility model for determining which co-party should not see the protected field.

**Composition rule:** when a form declares both `multiParty` and `safeAddress` features, the resolved runtime profile composes them: a protectable field's `visibleTo[]` is intersected with the safe-address jurisdictional rule. If the intersection is empty (no party can legally see the protected value), the form-load surfaces an `InvalidRuntimePolicyError` per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md). Silent leak forbidden.

The child-custody scenario (§4.3) is the canonical instance: survivor parent's safe-address-protected home address must not be visible to the co-parent. This composition is the architectural requirement; the design does not ship FW-0060 (that's FW-0049's design row) but does declare the seam.

### 7.2 AP-014 — coercion (J-041 explicit binding)

J-041 names AP-014 ([`JOURNEYS.md:710`](../../JOURNEYS.md)) and explicitly: "joint flows controlled by one party are the worst kind of coercion vector." The design implications:

1. **No party can submit on Party B's behalf.** Each party's signature is authenticated by their own `IdentityProvider` session; the shell rejects any path where one party's session signs another party's slice. Enforced by per-party draft-scope under §3.2.
2. **Per-party duress channel** (FW-0048 design dependency; FW-0059 build dependency). Party B's duress signal must not be observable to Party A. The `submission.duress-signaled` event from [EXT-5 in `2026-05-22-upstream-extension-queue.md:73`](2026-05-22-upstream-extension-queue.md) lands in a private-sidecar per `trellis-operational-companion.md` §13 — for multi-party, the per-party-private sidecar discipline must be **per-party**, not per-form. [FW-0048 design row in `PLANNING.md:553`](../../PLANNING.md) owns the canonical sidecar shape; this design declares the multi-party composition requirement (per-party scoping of an FW-0048-shaped sidecar) and depends on FW-0048 landing before FW-0061 can build the per-party duress flow. If FW-0048 has not designed the single-party sidecar shape by the time FW-0061 starts, the dependency is hard — flagged in §8 (3a).
3. **No party-visible "Party B has not signed yet" surface that Party A can poll.** The post-submit status surface (FW-0039) becomes party-scoped: `readStatus(caseId, partyId)` returns the requesting party's own status, not the other party's progress. This prevents Party A from using the status surface to coerce Party B.

The design surface that addresses AP-014 is **per-party invisibility of the duress channel**, **per-party-scope on status reads**, and **no party-to-party signature-on-behalf-of**.

### 7.3 Other FW interactions (deferred to follow-on rows)

Per the research brief `§2`:

- **FW-0008 (signer ceremony):** per-party scroll-to-end gate, per-party WYSIWYS preimage. The current FW-0008 design assumes single-party; the multi-party extension is a FW-0008 follow-on, not in FW-0050's scope.
- **FW-0030 (federated identity):** per-party identity proofing across IdPs is an N=N extension of the single-party identity contract. Defer to FW-0030.
- **FW-0042 (share-draft-with-trusted-reviewer):** reviewer ≠ co-party. The reviewer is read+comment, the co-party is read+edit-own-scope+sign-own-scope. Per the research brief, whether one sharing-sidecar covers both or they are separate is a follow-on design question; this design treats them as separate.
- **FW-0039 (post-submit status):** the party-scoped `StatusReader` extension above. Owned by FW-0039's evolution, not by FW-0050.
- **FW-0058 (AI-agent filer chain):** a party in a multi-party flow may be an AI-agent; the role taxonomy in Q1 does not preclude `agentChain` on a party's `AuthoredSignature`. FW-0058 owns the AI-agent shape; FW-0050 ensures the multi-party design does not foreclose it.

## 8. Open questions deferred to follow-on rows

These are real, called out so FW-0061 has a known surface to address (or so a follow-on design row absorbs them):

1. **Per-item vs per-section visibility (research brief Q5).** XS-1 ratifies the schema shape. This design accepts either; the resolved-profile pattern in §3.1 carries through.
2. **Per-party identity assurance composition (research brief Q6, FW-0030 binding).** When parties authenticate via different IdPs with different assurance levels, what's the form's effective assurance? Minimum-across-parties is the safe default; FW-0030 owns the actual rule.
3. **Withdrawal cascade semantics (§5.2 extension).** The dependent-revocation cascade is proposed; XS-1 must ratify the ledger event taxonomy that supports it (extension of EXT-5).
3a. **FW-0048 timing on per-party duress sidecar (§7.2 dependency).** Multi-party per-party duress channel composes FW-0048's canonical single-party sidecar shape with per-party scoping. If FW-0048 design has not landed by the time FW-0061 starts, the per-party duress flow is blocked; FW-0061 either waits for FW-0048 or descopes the duress affordance from the initial multi-party build.
4. **Sync co-fill** (Q2 deferral). Separate design row when pulled forward.
5. **AI-agent co-party** (FW-0058 deferral). The taxonomy extension is straightforward; the ceremony semantics are not. FW-0058 owns.
6. **Per-party post-submission lifecycle actions** (amend / withdraw / dispute scoped per-party). [Web ADR-0011's `recordLifecycle`](../adr/0011-runtime-feature-resolution-and-policy-gates.md) capability composes with `multiParty`; the composition rules are a FW-0061 build concern.
7. **Definition-time validation of role configuration.** Whether the formspec engine refuses to render a form whose `parties` block has conflicting role/visibility declarations. Engine-side concern, follow-on to EXT-N.
8. **Reviewer-vs-party single-sidecar question (FW-0042 interaction).** Two separate sharing primitives, or one? Owner of the decision is unclear; flag for FW-0042's design row.

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: one parameterized shape with closed role taxonomy | PROPOSAL | owner review |
| Q2: async-first; sync deferred | PROPOSAL | owner review |
| Q3: Definition-time role declaration + runtime party binding | PROPOSAL | owner review |
| Q4: intake-only for `coEqual`; WOS-required for asymmetric | PROPOSAL | owner review |
| `multiParty` capability tier axis (§3.1) | PROPOSAL | owner review + ADR-0011 evolution |
| No new `MultiPartyOrchestrator` port (§3.2) | PROPOSAL | owner review |
| Extend `DraftStore` + `IdentityProvider` + `SubmitTransport` (§3.2) | PROPOSAL | owner review |
| XS-1 boundary at `intake-handoff` (§6.2) | PROPOSAL to stack-root | stack-root architecture review |
| EXT-3 extends to carry `partyRole` (§6.3) | PROPOSAL to formspec | formspec spec-expert review |
| New EXT for Definition `parties` block (§6.4) | PROPOSAL to formspec | formspec spec-expert review |
| Disagreement-as-state at field-merge layer (§5.4) | PROPOSAL | owner review + XS-1 ratification |

**Row status change:** FW-0050 moves from `open` to `in design`. FW-0050 stays open until this design is owner-ratified and the upstream chain (XS-1 → EXT-3 → EXT-N) has at least proposed shapes.

## 10. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (multi-party is post-MVP; this design is staging for post-MVP)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §3.2 conditional)
- [web ADR-0010](../adr/0010-respondent-place-trust-model.md) — respondent place trust model (per-party history concerns)
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (the `multiParty` capability the design instantiates)
- [stack-root ADR-0151](../../../thoughts/adr/0151-multi-actor-editing-automerge.md) — multi-actor authoring via Automerge (disambiguated: that ADR is Studio authoring-time, this design is respondent-time)
- [stack-root ADR-0152](../../../thoughts/adr/0152-multi-actor-authorization-scope.md) — per-class authorization scope (deferred; relevant if per-party scope ratifies through WOS coordination)
- [stack-root ADR-0140](../../../thoughts/adr/0140-identity-attestation-shape.md) — identity-attestation shape (per-party assurance composition relies on this)
- Source brief: [`thoughts/sketches/2026-05-23-fw-0050-multi-party-research-brief.md`](../sketches/2026-05-23-fw-0050-multi-party-research-brief.md)
- Journey: [J-041 in `JOURNEYS.md:703`](../../JOURNEYS.md)
- Anti-patterns: [AP-002 in `JOURNEYS.md:59`](../../JOURNEYS.md), [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md)
