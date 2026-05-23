# FW-0050 Multi-Party Submission — Research Brief

**Status:** Sketch / research artifact. Not a design proposal. Seeds the brainstorm conversation.
**FW row:** [FW-0050 in `PLANNING.md:574`](../../PLANNING.md) (design); paired build row [FW-0061 at `PLANNING.md:689`](../../PLANNING.md).
**Journey:** [J-041 in `JOURNEYS.md:703`](../../JOURNEYS.md).
**Feature key:** `multiParty` per [web ADR-0011 §"Feature Ownership Table" line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md).

The headline finding: **the stack has the building blocks, no native primitive.** Today every layer assumes a single principal per Response, per ledger event, per intake-handoff, per applicant case. Multi-party is not "add a few fields" — it is a cross-stack ADR (XS-1) that reshapes the intake-handoff contract, the WOS case-actor model, and the response-signature multiplicity.

---

## 1. Upstream Primitive Inventory

### 1.1 Formspec — partial pieces, no party model on Definition or Response

| Primitive | File:line | What it does | Multi-party reality |
|---|---|---|---|
| `Party` base shape | [`formspec/schemas/common.schema.json:81`](../../../formspec/schemas/common.schema.json) | Shared identity base for `Issuer` and `Publisher` — name, identifier URI, homepage, contactPoint. | **Authoring-side identity only.** No respondent/co-respondent semantics. Naming collision risk if reused for filer-side parties. |
| `urn:party:` convention | [`formspec/schemas/intake-handoff.schema.json:180`](../../../formspec/schemas/intake-handoff.schema.json), [`formspec/specs/core/spec.md:964`](../../../formspec/specs/core/spec.md) | URN convention for `subjectRef` (the person the intake concerns). Example: `urn:party:person:applicant-456`. | **Single subject per handoff.** No `subjects[]`. The intake-handoff binds one Response to one case. |
| `actorRef` on intake-handoff | [`formspec/schemas/intake-handoff.schema.json:167`](../../../formspec/schemas/intake-handoff.schema.json) | "Optional reference to the actor who submitted or caused the handoff." | **Single actor.** Submission is one event, one cause. |
| `authoredSignatures[]` on Response | [`formspec/schemas/response.schema.json:498`](../../../formspec/schemas/response.schema.json) | Array — already pluralized. Each `AuthoredSignature` (line 119) carries `signerId`, `signerName`, `signerEvidence`, `signedPayload`. | **The one place where multi-signer is structurally present today.** But: (a) no `partyRole` / `capacity` field, (b) no per-signer scope (signers all sign the same `signedPayload.digest` over the whole Response), (c) no per-party visibility model. |
| `signedPayload` digest stability | [`formspec/schemas/response.schema.json:54`](../../../formspec/schemas/response.schema.json) | "The digest remains stable when later co-signatures are appended." | **Co-signature mechanics are already conceptualized at the byte level** — appending a second signature does not invalidate the first. Sequential-sign is supported by the byte protocol. |
| `subjectBinding` on Respondent Ledger | [`formspec/specs/audit/respondent-ledger-spec.md:376`](../../../formspec/specs/audit/respondent-ledger-spec.md) | Identity attestations record "whether the attestation is about the respondent, subject, delegate, or another party." | **Closest existing taxonomy** — `respondent | subject | delegate | another party` — but no enumeration of party roles within "another party". |
| `delegate` actor type | [`formspec/specs/audit/respondent-ledger-spec.md:322`](../../../formspec/specs/audit/respondent-ledger-spec.md) | Actor type for delegated signing. | Supports filer-not-signer (J-012 / FW-0037), not joint-with-co-equal-party. |
| EXT-3 (queued) — capacity + party-role | [`thoughts/specs/2026-05-22-upstream-extension-queue.md:47`](../specs/2026-05-22-upstream-extension-queue.md) | Proposed: add `capacity` enum (`self | poa | guardian | executor | parent | licensed-professional | corporate-officer | ai-agent`) + `principalRef` + `authorityArtifact` to `AuthoredSignature`. | **Foundational dependency for FW-0050.** Closes J-012 (single-principal capacity) and is named as "foundation for J-041 (multi-party)". |
| XS-1 (queued) — multi-party intake cross-stack ADR | [`thoughts/specs/2026-05-22-upstream-extension-queue.md:253`](../specs/2026-05-22-upstream-extension-queue.md) | Proposed cross-stack ADR. Recommended boundary at `intake-handoff` — formspec owns per-party artifact contract, WOS owns per-party session orchestration. Adds `definition.schema.json` `parties` block + per-item `visibleTo[]` / `editableBy[]` / `signedBy[]`; WOS gets multi-respondent intake pattern; Response gets `partySignatures[]`. | **Not yet authored.** The boundary call is the brainstorm's central question. |

### 1.2 WOS — single-applicant by construction

| Primitive | File:line | Multi-party reality |
|---|---|---|
| `actors[]` on `$wosWorkflow` | [`work-spec/specs/kernel/spec.md:103`](../../../work-spec/specs/kernel/spec.md) | Closed actor types `human | system | agent` (Layer 2). Actors are workflow participants (caseworker, reviewer, agent), **not respondent-side parties**. Higher layers may register additional types via `actorExtension` (kernel S10.1). |
| `ApplicantCaseDetail` | [`work-spec/specs/api/applicant.md:27`](../../../work-spec/specs/api/applicant.md), [`work-spec/schemas/api/applicant.schema.json:3`](../../../work-spec/schemas/api/applicant.schema.json) | "Applicants are the case subjects (or their authorized agents)." **Singular**. No `coApplicants[]`. The applicant API is scoped to one applicant identity per query. |
| `ApplicantTaskSummary.kind` | [`work-spec/schemas/api/applicant.schema.json:100`](../../../work-spec/schemas/api/applicant.schema.json) | Task families: `intake | correspondence-response | signature | verification`. **No `co-signer-task` or `joint-intake` family.** Tasks are owed by an applicant identity, not by a role within a joint flow. |
| `correspondenceRole` | [`work-spec/specs/kernel/correspondence-metadata.md:57`](../../../work-spec/specs/kernel/correspondence-metadata.md) | Enum `applicant | representative | third-party | system | agency`. | **Closest WOS role taxonomy** for non-staff participants. `representative` is the closest existing slot for a second party. |
| ADR 0068 tenant + scope composition | (referenced from applicant API) | Per-tenant identity attestation; cross-tenant aggregation forbidden server-side. | **Tenancy and identity are scoped per-party** — a multi-party flow where each party authenticates against a different IdP is already implied as architecturally legal but not enumerated. |

**Takeaway:** WOS has no first-class joint-applicant primitive. The actor model is workflow-internal (who-does-the-work); the applicant model is single-subject. Multi-party intake either (a) registers a new `actorExtension` for `co-applicant`, or (b) lives entirely on the formspec side as a multi-respondent Response shape that lands as a single intake-handoff with a `subjects[]` array.

### 1.3 Trellis — single-signer envelopes, multi-event composition works

| Primitive | File:line | Multi-party reality |
|---|---|---|
| Event = single COSE_Sign1 | [`trellis/specs/trellis-core.md:227`](../../../trellis/specs/trellis-core.md) | One signature per event. `suite_id = 1` pinned to Ed25519. | **No multi-signature event format.** A second party signs by appending their own event, not by co-signing the first. |
| Multiple `authoredSignatures[]` already supported | [`formspec/schemas/response.schema.json:54`](../../../formspec/schemas/response.schema.json) | The Formspec Signed Response Payload digest is stable when co-signatures are appended. | **Sequential signers over the same Response payload work at the byte level today** — what's missing is the per-party intent/visibility model in Formspec, not the cryptographic substrate. |
| Witness cosignatures (Phase 4 federation) | [`trellis/specs/trellis-core.md:341`](../../../trellis/specs/trellis-core.md), `:2716` | `trellis.witness_signature.v1` — Phase 4 transparency cosignature slot. | **Witness-cosignature is a federation concept, not a joint-party concept.** Witnesses attest that the operator's append-head was seen; they are not co-signers of the underlying content. Do not conflate. |
| Certificate-of-completion multi-signer fixture | [`trellis/specs/trellis-operational-companion.md:1340`](../../../trellis/specs/trellis-operational-companion.md) | Core fixture `append/029` is "multi-signer countersigned" certificate-of-completion. | **Multi-signer composition has a fixture.** The byte protocol already covers the case where a presentation artifact (PDF/HTML) is bound to a chain that contains multiple signing events. |
| Multi-party custody (CM-D) | [`trellis/specs/trellis-operational-companion.md:301`](../../../trellis/specs/trellis-operational-companion.md), `:356` | Custody model where multiple parties hold key shares (quorum thresholds, dual attestation for posture-expanding transitions). | **Custody-side multi-party, not signing-side multi-party.** Different problem — but proves Trellis takes multi-party operational realities seriously elsewhere. |

**Takeaway:** Trellis does not need a new envelope format to support multi-party signing. Each party signs their own event over the (digest-stable) Formspec Signed Response Payload, and the bundle contains N events of `artifact_type = "event"`. The gap is upstream: Formspec needs to know what each party signed (full Response? a per-party slice?), and the verifier needs to render "Party A signed sections X+Y; Party B signed sections Y+Z."

### 1.4 PKAF / Rulespec — no party concept relevant to respondent-side joint flows

PKAF defines `rkaf:Assertion` with subject/predicate/object, `rkaf:Authority`, `rkaf:Finding`, `rkaf:verifiedBy` (party that performed reconfirmation — [`PKAF/spec/rkaf-vocabulary.md:113`](../../../PKAF/spec/rkaf-vocabulary.md)). These are authoring-side / evidence-side parties (regulators, attestation issuers, registries) — not respondent-side joint filers. **Out of scope for FW-0050.**

---

## 2. Adjacent FW Row Interactions

| Row | File:line | Interaction with FW-0050 |
|---|---|---|
| **FW-0008** Signer ceremony (per-field affirmative act) | [`PLANNING.md:237`](../../PLANNING.md) | Per-party signing means **per-party scroll-to-end gate, per-party WYSIWYS preimage**. If Party B only signs sections they're scoped to, do they see Party A's sections during the ceremony (privacy-leaking) or only their own (raising the question of whether they signed the "whole" record)? AP-002 binds. |
| **FW-0037** Filer-not-signer | [`PLANNING.md:443`](../../PLANNING.md) | **Overlaps but distinct.** FW-0037 = single principal, one filer + one signer (capacity model). FW-0050 = multiple principals, each their own filer/signer. EXT-3 (capacity primitive) is the shared dependency — FW-0050 extends it to N parties, FW-0037 is the N=1 case. |
| **FW-0030** Federated identity claim handoff | [`PLANNING.md:376`](../../PLANNING.md) | **Multi-party means N independent identity proofings**, potentially across different IdPs (Party A on Login.gov, Party B on ID.me). Per-party assurance composition. Joint flow may need a minimum-assurance-across-parties resolver. |
| **FW-0042** Share-draft-with-trusted-reviewer | [`PLANNING.md:494`](../../PLANNING.md) | **Adjacent but architecturally different.** Reviewer = read+comment, cannot sign. Co-party = read+edit-own-scope+sign-own-scope. Both need a sharing/role sidecar — open question whether one sidecar covers both or they are separate primitives. J-014 (reviewer) and J-041 (multi-party) explicitly intersect dangerously per the J-041 note. |
| **FW-0039** Post-submit status surface | [`PLANNING.md:462`](../../PLANNING.md) | **Does each party see the same status, or party-scoped status?** Most likely the latter for privacy — Party A should not see that Party B has been flagged for a compliance hold. Implies `StatusReader` becomes party-aware: `readStatus(caseId, partyId)`. |
| **FW-0049 / FW-0060** Safe-address handling | [`PLANNING.md:564`](../../PLANNING.md), `:679` | **Hard binding.** FW-0060 explicitly cites: "per-party visibility (per FW-0050) land across the form, the receipt, and the verifier." A survivor's address must be invisible to the co-respondent. Multi-party visibility is the prerequisite for safe-address-in-joint-flows. |
| **FW-0058** AI-agent filer chain | [`PLANNING.md:659`](../../PLANNING.md) | Same EXT-3 dependency. A party in a multi-party flow may itself be an AI-agent (e.g., corporate agent acting on behalf of one of the principals). FW-0050 design should not preclude AI-agent parties. |
| **FW-0059** Coercion-aware signing | [`PLANNING.md:669`](../../PLANNING.md) | **AP-014 cited by FW-0050.** J-041 explicitly names: "joint flows controlled by one party are the worst kind of coercion vector." Per-party duress channel — Party B's duress signal must not be observable to Party A. |

---

## 3. Real-World Scenarios with Sharp Boundary Questions

### 3.1 Joint US tax filing (married filing jointly)

- **Parties:** Two spouses. Both legally responsible for the entire return ("joint and several liability").
- **Signing:** Both sign the same document. No party-scoped sections — IRS Form 1040 has one signature block per spouse but the entire return is jointly attested.
- **Visibility:** Each spouse is legally entitled to see the entire return; in practice, employer income/withholding for each spouse appears on their own W-2s but both spouses see the combined return.
- **Sharp question:** Is this **N signers on one Response** (matches the existing `authoredSignatures[]` shape closely) or **N Responses merged**? If the former, the deviation from single-party is mostly the addition of an EXT-3 `partyRole` per signature and a `parties[]` block on the Definition; no per-section visibility model needed.

### 3.2 Immigration sponsorship (I-130 petitioner + I-485 beneficiary)

- **Parties:** Two — petitioner (US citizen/LPR) and beneficiary (intending immigrant). **Asymmetric roles.** Different signature blocks; different evidence obligations (petitioner attests to bona fide relationship; beneficiary attests to admissibility).
- **Signing:** Each signs their own attestations cryptographically separately. Petitioner cannot sign for beneficiary or vice versa (the receipt would be void).
- **Visibility:** Beneficiary can see the petitioner's biographic data; petitioner can see beneficiary's immigration history. **But** the beneficiary's prior visa denials, criminal history disclosures, etc. should be visible only to the beneficiary and USCIS — not to the petitioner.
- **Sharp question:** **Is "role" first-class or just a label on a signature?** I-130 has a petitioner role with required affirmations distinct from beneficiary's. This is the case where `definition.schema.json` needs a `parties` block enumerating roles and per-item `visibleTo[]` / `editableBy[]` / `signedBy[]` (the XS-1 shape).

### 3.3 Child custody filing (two co-parents, one minor subject)

- **Parties:** Three logical entities — two parent-respondents, one subject-child (not a respondent). Each parent has independent legal capacity. **The child is the subject, not a party** — they neither fill nor sign.
- **Signing:** Each parent signs their own consent/attestation. If the parents disagree on a fact, the filing carries the disagreement as a first-class state per J-041 ("If parties disagree on a fact, the disagreement is itself a first-class state, not a silent override.").
- **Visibility:** Each parent's address may be safe-address-protected from the other (FW-0049 / J-037 intersection). Each parent's submitted income is typically visible to the court but not to the other parent. **Per-section, per-party visibility is required.**
- **Sharp question:** **What does "disagreement" mean at the data layer?** A field with two values (one per party), or two separate Responses that merge with a conflict marker? Drives the merge-semantics design.

### 3.4 (Bonus) Household benefits application (SNAP / Medicaid)

- **Parties:** Head-of-household plus household members. Often a single applicant fills, but other adult members must attest to their own income/asset disclosures.
- **Signing:** Typically the head-of-household signs the application; other adults sign declarations attached as exhibits.
- **Sharp question:** Is this **multi-party** or **single-party-with-exhibits**? The line is whether the "exhibit signers" have any session continuity (own auth, own draft state) or just sign a document the lead respondent uploaded. The latter is FW-0037-shaped; the former is FW-0050.

---

## 4. Open Scope Questions for Brainstorm

Prioritized — ask the first 3-4 before the rest. The "ask first" rationale is: **each decision above forces or forbids large pieces of the design space below**.

### Top 4 to ask first

**Q1. Is FW-0050 designing a single canonical multi-party shape, or a taxonomy with two or three distinct shapes per scenario class?**

The three real-world scenarios above are structurally different: §3.1 (N co-equal signers on one Response) is mostly a signature-array extension; §3.2 (asymmetric roles with per-item visibility) is the full XS-1 shape; §3.4 (lead + exhibit-signers) is barely distinct from FW-0037. **If FW-0050 tries to cover all three with one shape, the contract becomes the union of all complexity.** If it picks one as canonical, the others may not fit.

→ Brainstorm answer drives whether XS-1 ships as one cross-stack ADR or three.

**Q2. Synchronous, asynchronous, or both?**

J-041 explicitly says "per-party signature ceremonies that don't require synchronous co-presence." But does Party B see Party A's contributions in real time, or only after Party A submits their slice? **Async-by-default has very different visibility implications than sync.** Async also raises: does Party A's draft get a "freeze" once shared with Party B? Can Party A still edit after Party B has signed their slice?

→ Drives the draft-coordination port shape and the signature-invalidation rule on later edits.

**Q3. Does the form Definition pre-enumerate parties, or do parties get added dynamically at runtime?**

Pre-enumerated (Definition-time): the form declares "this form has petitioner + beneficiary roles" and the runtime binds identities to roles. Predictable, validatable, but inflexible.

Dynamic (runtime): the lead respondent adds Party B by email/handle during fill, optionally selecting a role from an allowed-role list. Flexible, but the form Definition cannot enumerate per-party visibility on `visibleTo[]` if the parties aren't known at design time.

→ Drives the `definition.schema.json:parties` block shape. XS-1 currently assumes Definition-time enumeration; J-041 implies both ("Co-applicants on a rental application" is often Definition-time fixed; "household applying for SNAP" is runtime variable).

**Q4. Does multi-party submission necessarily mean WOS governance kicks in, or can it stay intake-only?**

A pure intake-only multi-party flow (Formspec-only, no WOS): the formspec layer collects per-party drafts, gathers per-party signatures, emits one intake-handoff with `subjects[]` and `signatures[]`. No case orchestration.

A WOS-orchestrated multi-party flow: each party is a workflow actor; WOS owns the session orchestration, task assignment per party, deadline tracking per party. This is the XS-1 recommended boundary (formspec owns artifact contract, WOS owns session orchestration).

→ Drives whether FW-0050 design can ship without `workspec-server` co-investment. Major scope decision — answering "intake-only viable" cuts the scope roughly in half.

### Next 4 (ask after the framing 4)

**Q5. Visibility model granularity — per-item, per-section, or per-party-scope-tag?**

Per-item `visibleTo[]` on every Definition node (XS-1's current proposal): maximum control, maximum authoring complexity, every form author has to reason about per-field visibility.

Per-section: visibility declared on group containers; descendants inherit. Simpler.

Per-party-scope-tag: items carry a `scope: "shared" | "private-to-petitioner" | "private-to-beneficiary"` and the visibility model is computed from the tag + party-to-role binding. Simplest for form authors; least flexible for edge cases.

→ Drives the schema shape and the form-authoring DX.

**Q6. Per-party identity continuity and federation — same IdP, different IdPs, or party choice?**

Most multi-party flows in the wild assume same-tenant SSO (both spouses log in via the same account). Joint legal/tax filings rarely cross IdP boundaries. **But** the harder cases (immigration sponsorship, mortgage co-borrowers, court filings) genuinely have parties at different identity providers.

→ Drives whether FW-0050 depends on FW-0030 (federated identity claim handoff) or only on FW-0028 (passkey/WebAuthn).

**Q7. Withdrawal / failure semantics — what if Party B never returns?**

If Party A signed and Party B abandons: is the submission a failure, a partial, or does it convert to single-party-with-failed-cosigner-record? What's the timeout? Who notifies whom? Can Party A withdraw their own signature unilaterally?

→ Drives the lifecycle ledger event taxonomy extension (likely EXT-5 has new events: `party.declined`, `party.timed-out`, `party.signature-revoked`).

**Q8. Coercion model per party (AP-014 binding from J-041)**

J-041 explicitly names joint flows as the worst coercion vector. Per-party duress channel is required, but Party A's duress signal must be invisible to Party B (else the coercer just verifies Party A didn't trigger duress). FW-0048 / FW-0059 designed the single-party duress channel; the multi-party shape is structurally different.

→ Drives a per-party private sidecar discipline that may not align with the existing `trellis-operational-companion.md` §13 disclosure-manifest shape.

---

## 5. Honesty Note: Where the Stack Has Zero Infrastructure

This row is **not consuming a primitive that exists upstream**. It is the upstream primitive that, if FW-0050 designs it well, gets ratified into the spec and then consumed. That's the inverse of every other FW-0050-class row in the planning sheet (FW-0039 consumes `StatusReader`; FW-0055 consumes `RespondentPlaceSource`).

Specifically:

1. **No `parties[]` on `definition.schema.json` today.** Multi-party is not a Definition-time concept. Closest existing: form-level `metadata.context.ofParty` (EXT-6 line 84) which is a single-party display context.
2. **No per-item `visibleTo[]` / `editableBy[]` / `signedBy[]` on Definition.** Field-level visibility is currently `relevant`/`when` (FEL expressions evaluating to a boolean), not party-scoped.
3. **No `partyRole` on `AuthoredSignature`.** EXT-3 (queued) adds capacity for the single-principal case; the multi-party case requires a strict superset (capacity + party-role + party-binding-back-to-Definition).
4. **No `parties[]` or `subjects[]` on `intake-handoff.schema.json`.** Only `subjectRef` (single, optional) and `actorRef` (single, optional) exist.
5. **No multi-applicant model in WOS.** Applicant API is single-applicant by construction (per `applicant.md:12` "Applicants are the case subjects (or their authorized agents)" — singular).
6. **No `co-applicant` actorExtension registered.** Could be added at the `actorExtension` seam (kernel S10.1), but no precedent.
7. **No multi-party draft coordination port in formspec-web.** Existing ports (`DraftStore`, `IdentityProvider`, `SubmitTransport` per web ADR-0009) are all single-respondent shaped. A multi-party flow needs at minimum: party-aware `DraftStore` (party-scoped reads/writes within one draft id), a `PartyInvitation` port (how Party A invites Party B), and a party-aware `SubmitTransport` (the submit waits for the N-th signature).

**The realistic outcome of FW-0050 is a cross-stack ADR (XS-1 in the queue) plus EXT-3 plus a new EXT-N for `definition.schema.json:parties`.** All three are upstream extensions; formspec-web consumes them, does not author them. Per [web ADR-0004](../adr/0004-cross-repo-placement.md), the formspec-web design row is the UI/orchestration design over those upstream primitives — but the primitives must land before the build row (FW-0061) can execute.

The lift in shipping order: **XS-1 cross-stack ADR → EXT-3 → new EXT-N for parties on Definition → FW-0050 design row → FW-0061 build row.** Skipping any step forces formspec-web to invent the missing primitive locally, which violates ADR-0004 and creates the worst kind of architectural debt — a private fork of a spec contract.

---

## 6. Quick-Reference Anchor List

For the brainstorm — open these in order if a question goes deep:

1. [Journey J-041 — `JOURNEYS.md:703`](../../JOURNEYS.md) — the user story
2. [FW-0050 row — `PLANNING.md:574`](../../PLANNING.md) — the current state
3. [XS-1 cross-stack ADR proposal — `thoughts/specs/2026-05-22-upstream-extension-queue.md:253`](../specs/2026-05-22-upstream-extension-queue.md) — the recommended boundary
4. [EXT-3 capacity + party-role — `thoughts/specs/2026-05-22-upstream-extension-queue.md:47`](../specs/2026-05-22-upstream-extension-queue.md) — the foundational dependency
5. [ADR-0011 multi-party row — `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md:138`](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the runtime feature contract
6. [`authoredSignatures[]` schema — `formspec/schemas/response.schema.json:498`](../../../formspec/schemas/response.schema.json) — what exists today
7. [WOS applicant API — `work-spec/specs/api/applicant.md:12`](../../../work-spec/specs/api/applicant.md) — the single-applicant ceiling
8. [Trellis multi-signer fixture — `trellis/specs/trellis-operational-companion.md:1340`](../../../trellis/specs/trellis-operational-companion.md) — proof the substrate already handles multi-signer composition at the byte level
