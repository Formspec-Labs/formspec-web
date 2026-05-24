# FW-0048 — Coercion-aware signing: design proposal

**Date:** 2026-05-23
**Status:** PROPOSAL (not ratified). Owner pushback expected during review; framing decisions Q1–Q4 are open until accepted. **Safety-critical row** — review discipline strict.
**Row:** [FW-0048 in `PLANNING.md:566`](../../PLANNING.md) (design); paired build row [FW-0059 in `PLANNING.md:673`](../../PLANNING.md).
**Journey:** [J-027 in `JOURNEYS.md:526`](../../JOURNEYS.md).
**Anti-patterns:** [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-021 in `JOURNEYS.md:173`](../../JOURNEYS.md).
**Feature key (proposed):** `duressAware` per [web ADR-0011 Feature Ownership Table line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md).
**Source brief:** [`thoughts/sketches/2026-05-23-fw-0048-coercion-aware-signing-research-brief.md`](../sketches/2026-05-23-fw-0048-coercion-aware-signing-research-brief.md). Upstream-primitive inventory, threat scenarios, FW interactions, and external prior art live there; this doc decides over them.
**Multi-party hook:** [FW-0050 design §7.2](2026-05-23-fw-0050-multi-party-submission-design.md) explicitly delegates the per-party duress sidecar shape to this row. §7 below satisfies that delegation.

## 1. Goal and non-goals

### 1.1 Goal

Decide the formspec-web shape for coercion-aware signing on the high-risk template set (financial POA, immigration sponsorship, benefits redirect, advance directive, marriage / divorce, custody) per [FW-0048 Done](../../PLANNING.md). Deliverables: framing decisions (Q1–Q4), the `duressAware` capability contract under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md), the per-party sidecar shape FW-0050 / FW-0061 will compose with, the threat model, the routing semantics, the failure semantics, and the cross-stack dependency chain. This is a **design row**; the build is [FW-0059 in `PLANNING.md:673`](../../PLANNING.md).

### 1.2 Non-goals

- **Implementation.** No code, no port-conformance fixtures, no React shell. FW-0059 owns build.
- **Authoring the upstream spec.** Per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md), formspec-web consumes upstream primitives, does not invent them. This doc proposes EXT-5-payload content and a possible new XS-3 cross-stack ADR from the consumer perspective, does not author either.
- **Jurisdiction-specific evidentiary admissibility.** Whether a duress-signaled signature is voidable, valid-pending-investigation, or subject to additional procedure varies by jurisdiction. **Legal-counsel work; out of scope.** The design produces the artifact; the issuer's compliance posture decides what to do with it.
- **All classes of coercion.** Per §2 the design covers (a) signing-time coercion and (b) pre-signing coercion the signature is the moment to signal. It does NOT cover (c) post-signing coercion (FW-0038 amend / withdraw / dispute) or (d) informational coercion / consent failure (separate row — cool-off windows, secondary confirmation).
- **Coercer-present-at-enrollment defeat.** Some coercion scenarios are fundamentally out of reach of any device-bound duress affordance; §8 names them and stops there.
- **Production routing endpoints.** The design names the routing-target abstraction (issuer-side webhook, victim-services contact, internal safety team); the issuer's deployment supplies the actual endpoints. Reference adapters land with FW-0059.

## 2. Threat model

The threat model is the load-bearing input. Stated explicitly so the design's success criteria are unambiguous.

### 2.1 Coverage classes

Three coercion-class boundaries:

| Class | Description | Owned by |
|---|---|---|
| **(a) Coercion at signing time** | The signer is under duress at the moment of the signature ceremony. The form may or may not contain coerced content; the *signature* is the coerced act. | **FW-0048 (this row)**. Canonical case. |
| **(b) Coercion before signing** | The form was filled under duress (the coercer dictated answers); the signature is the signer's first private moment to flag. | **FW-0048 (this row)**. Same in-flow surface as (a); same sidecar; same routing. |
| **(c) Coercion after signing** | The signature exists; the signaler wants to retroactively repudiate (under coercion or after escape). | **[FW-0038](../../PLANNING.md) (amend / withdraw / dispute)**. Out of scope here. |
| **(d) Informational coercion** | The signer doesn't understand what they're signing; "coerced" by misrepresentation, not by force. | **Separate FW row (proposed)** covering cool-off windows + secondary confirmation. Out of scope here. |

### 2.2 Attacker model

- **Attacker identity.** A party present at the signing — abuser, trafficker, predatory "helper," supervisor, landlord. Has physical proximity to the device. May own the device.
- **Attacker goal.** A valid-appearing signed submission whose content benefits the attacker (POA over a joint account, immigration sponsorship asymmetry exploited, benefits redirect to a fraudulent payee).
- **What the attacker observes.** The full device screen, the kept tab order, any modals or status copy, network activity (in some cases — e.g., shoulder-surfing the URL bar or watching the receipt arrive in email). The respondent's phone notifications, if the phone is present and unlocked.
- **What the attacker can force.** The respondent's overt actions during the ceremony — entering a PIN, pressing a button, completing a passkey ceremony with biometric / PIN. The respondent's verbal confirmation. The selection of any visible affordance.
- **What the attacker cannot force.** A per-act WebAuthn authentication's *secret* (the biometric, the OS-level PIN) — the attacker can compel the *act* of authenticating, not the *secret value*. The contents of the receipt the respondent receives, *if the receipt is byte-identical between duress-signaled and non-duress paths*. Out-of-device confirmations on devices the respondent controls separately (often unavailable in trafficking).
- **What the attacker knows.** The attacker is assumed to have read the FW-0048 design doc. The threat model is **Kerckhoffs-style**: the affordance's existence is public; only the per-respondent secret (PIN value, passkey enrollment) is private. Any design whose security depends on the attacker not knowing the duress affordance exists is rejected.

### 2.3 Three grounded scenarios

Each scenario gives: the setup, what the duress signal must achieve, what this design's posture provides.

**2.3.1 Domestic-abuse POA.** Survivor at home, abuser present, financial POA on a bank's intake portal. Abuser observes the screen.
- **Required:** duress signal that fires invisibly, produces a byte-identical receipt, routes to the bank's safety team (not visible in the public ledger / receipt the abuser sees).
- **Design posture:** §3 detection primitive — dual-passkey (Q1 candidate 5) for instances supporting `duressAware`; §4 byte-identical receipt with §5.2 HPKE-wrapped payload (DEK wrapped in `key_bag`; ciphertext in `payload_ref`) to the safety team; §5.3 quarantine semantics. **Canonical scenario; design optimizes for this.**

**2.3.2 Trafficking — immigration sponsorship beneficiary.** Trafficked person, handler present, on handler's device. Handler controls the device fully.
- **Required:** a way to signal duress that does not require the survivor to operate the handler's device unattended.
- **Design posture:** **partial coverage.** The in-flow duress affordance works in the rare moments the handler steps away or doesn't watch closely; an in-flow signal during a passkey ceremony with the handler watching is not reliably available. The design honestly cites this as a gap (§8). Recovery-channel routing (a separate, off-device "I am being trafficked" path) is **out of scope** — it belongs to FW-0030 federated-identity recovery / external safety services, not FW-0048. **Half-coverage scenario; design acknowledges and bounds.**

**2.3.3 Elder coercion — benefits redirect.** Elder, predatory "helper" present, real government form on a real government portal. The coercion is informational (the elder doesn't realize the payee is fraudulent) at least as much as it is physical.
- **Required:** the elder needs a way to slow the ceremony down (cool-off, secondary confirmation), not a way to fire a silent alarm — they wouldn't know to fire one.
- **Design posture:** **out of scope per §1.2(d).** The elder-coercion-by-misrepresentation scenario belongs to a separate row covering cool-off windows + secondary confirmation. FW-0048's in-flow duress affordance does not help an elder who doesn't realize they need to use it.

**Implication for the design:** FW-0048's posture is **optimized for scenario 2.3.1, partial for 2.3.2, declines 2.3.3.** That split is the honest scope; the design says so in §1.2 and §8 rather than papering over with false claims.

### 2.4 Out-of-scope coercion patterns

Named explicitly so the design isn't read as covering them:

- **Coercer present during pre-enrollment of the duress affordance.** If the abuser was present when the respondent enrolled their duress PIN, the abuser knows the duress PIN; the affordance is defeated. **No device-bound design can solve this**; the only mitigation is enrollment in a separate trusted session (e.g., via victim-services counselor). **Out of FW-0048's reach; out-of-band enrollment is a deployment concern.**
- **Adversarial OS / firmware.** A device whose OS or firmware is hostile to the respondent (rooted phone an abuser controls) can read inputs before any WebAuthn API does. **Out of FW-0048's reach; out of every web-form's reach.**
- **Coercion by misrepresentation (scenario 2.3.3 above).** Covered by a separate FW row.
- **Coercion to use a recovery path that exfiltrates secrets.** A coercer who knows the duress affordance exists can demand the respondent take a recovery path (forgot-PIN, identity-challenge) and observe the result. **Mitigated** by routing recovery paths through external services the coercer cannot observe; **not eliminated**.

## 3. Framing decisions (Q1–Q4)

Each decision: the answer first, then the rationale, then the alternative considered and why rejected. All four are PROPOSALS pending owner review.

### 3.1 Q1 — Detection surface: dual-credential (passkey-bound or PIN-bound), with a single-credential PIN-second-entry fallback

**PROPOSAL.** The canonical detection surface is **dual-credential**: two enrolled signing credentials, one normal and one duress. The signing ceremony invites the respondent to authenticate with whichever credential they choose. Both succeed at the WebAuthn / signing API; the duress credential additionally fires the `submission.duress-signaled` event downstream.

Two implementation tiers under web ADR-0011, both produced by the same `duressAware` capability with a `mechanism` policy axis:

- **`mechanism: "dual-passkey"`** (preferred). Respondent enrolls two WebAuthn passkeys against the issuer (one normal, one duress). The ceremony's `userVerification: required` invocation completes against whichever credential the respondent chooses. Cryptographically clean; survives WebAuthn protocol evolution; works cross-device with passkey sync.
- **`mechanism: "dual-pin"`** (fallback). Respondent enrolls two PINs at a signing-PIN provisioning step (separate session from the form fill). The signing PIN entry surface accepts either; both pass; the duress one fires the signal. Available on instances without passkey enrollment; weaker per the Kerckhoffs-attacker-knows model (PIN entropy is bounded).

**Single-credential PIN-second-entry fallback** (final tier). When the issuer's deployment supports neither passkey nor pre-enrolled signing PIN, the affordance is a deliberate **second-entry-of-PIN-twice** convention: respondent enters their signing PIN; the system asks them to confirm by re-entering it; the *second* entry is the duress slot (re-entered identically = normal; entered as a pre-registered alternate = duress). Weakest tier; signaled in the resolved profile so the shell can warn the issuer's safety-team-routing pipeline of weaker assurance.

**Justification.** The Kerckhoffs model (§2.2) forbids any "secret affordance" that depends on the attacker not knowing the affordance exists. **Dual-credential is the only model that survives a Kerckhoffs-aware attacker:** the attacker sees two valid-looking credentials, knows duress is one of them, but cannot tell which. Picking the duress one is the respondent's per-act decision; the attacker cannot detect the choice without breaking the credential's secrecy.

**Alternative rejected: single-credential with a "wrong" button as duress signal.** Brief candidate #3 in the research brief. Rejected: the attacker reads the docs, knows which button is the duress button, and physically blocks the respondent from pressing it. Defeats Kerckhoffs.

**Alternative rejected: long-press / hold-to-sign duration.** Brief candidate #2. Rejected: accessibility-hostile (motor-impairment users can't reliably distinguish hold times), discoverable in source, defeats Kerckhoffs (attacker watches the hold time).

**Alternative rejected: out-of-band only (recovery channel during signing).** Brief candidate #4. Rejected: doesn't work for the canonical scenario 2.3.1 where the respondent is on the abuser's device with no separate channel. Scoped into the trafficking-scenario partial coverage in §2.3.2 but not the primary affordance.

**Composition with FW-0031 (passkey-first sign-in and signature binding).** The `dual-passkey` mechanism composes with FW-0031's WebAuthn discipline. WebAuthn protocol does not natively distinguish credentials at the ceremony layer; the duress mark is a **convention on top of WebAuthn**: the issuer's signing-PIN-provisioning step labels each enrolled credential `(normal | duress)` in its server-side credential registry. The ceremony accepts any credential; the dispatcher consults the registry post-ceremony and decides whether to fire the duress event. **No WebAuthn protocol extension required.**

**Composition with FW-0031 (passkey enrollment surface).** Duress-credential enrollment must happen in a **separate trusted session** — the canonical pattern is enrollment-with-a-victim-services-counselor, or enrollment from a known-safe device the respondent owns alone. FW-0048 specifies the slot for the duress credential; the *enrollment surface* is FW-0031's design space (with a load-bearing constraint that the second enrollment must be invocable from a different session / device than the first).

**Composition with FW-0028 (multi-IdP sign-in with no oversharing).** When `duressAware` is required by the form, the multi-IdP picker MUST NOT list IdPs that fail to satisfy the form's `duressAware` requirement — an IdP path that cannot deliver the dual-passkey / dual-pin / pin-second-entry mechanism resolves the form to `UnsupportedRequiredFeatureError` under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md), so listing it would be a dead end. FW-0028's picker logic consumes the resolved `duressAware` profile and filters accordingly.

### 3.2 Q2 — Activation visibility: byte-identical success-path

**PROPOSAL.** Byte-identical success-path between duress-signaled and non-duress flows. The respondent's receipt, the visible status copy, the email-confirmation if any, the URL-bar state, the network-tab timing (modulo random jitter), the redirect chain — **all identical** to a shoulder-surfer.

The duress fact lives **only** in the `submission.duress-signaled` event's HPKE-wrapped plaintext (decryptable only by the safety-team recipient registered in the issuer-sidecar). The respondent's downloadable receipt contains the event envelope (signed, with `payload_ref` ciphertext + `key_bag` entry per Trellis Core §6.4 + §9.4) but no party other than the safety-team recipient can recover the plaintext duress fact.

**Justification.** J-027's metaphor is the bank-teller silent alarm; the alarm rings at the security desk, not the teller's counter. AP-014's test: "non-obvious to a shoulder-surfer and does not halt the form in a way that tips off the coercer." Any deviation from byte-identical-success-path violates AP-014.

**Trellis event-level uniform-shape binding (Core §6.4 + §9.4; event registry per OC-26).** Every high-risk-template submission emits the `submission.duress-signaled` event whether or not duress was signaled — the event's *presence* is uniform; the event's *plaintext* (decryptable only by the safety-team recipient) is what carries the signal (§3.4 + §5.2 substrate path). The Disclosure Manifest mechanism (OC-26 → OC-31) is a Phase 2+ overlay for *later* selective disclosure of public-by-default fields; it does not govern HPKE-wrapped payloads on Phase 1 events, which are already opaque-by-default to anyone without the safety-team private key.

**Alternative rejected: differentiated-success-path with delay or different copy.** Detectable by an observant coercer (the coercer notices the email took longer to arrive, or the copy differs from a non-duress submission they've seen before). Rejected.

**Alternative rejected: omit the `submission.duress-signaled` event when no duress is signaled.** Leaks the duress fact by event presence — a chain observer who knows the event_type signature for `submission.duress-signaled` would learn the binary signal by event-existence alone. Event-level uniform shape (§3.4 + §5.2) emits the event on every submission with byte-shape-uniform envelope; only the safety-team recipient can recover the plaintext.

**Honest consequence.** Byte-identical-success-path means a malicious respondent could *falsely* signal duress to delay or invalidate a legitimate counterparty's reliance on the receipt. Mitigation: §5.3 quarantine semantics are issuer-side decisions, not respondent-visible state changes; a false duress signal results in safety-team review at the issuer, which the issuer's processes can disposition. The receipt itself remains cryptographically valid pending the issuer's downstream disposition.

### 3.3 Q3 — Routing: issuer-side webhook (MVP-tier); WOS-actor extension (asymmetric-tier)

**PROPOSAL.** Two routing tiers under the `duressAware` capability with a `routingTier` policy axis:

- **`routingTier: "issuer-webhook"`** (MVP-tier). The duress signal fires an issuer-configured webhook to a pre-declared safety-routing target — NCADV hotline, internal safety team, victim-services coordinator, lawyer-on-call, jurisdiction-specific protective-services. The endpoint is opaque to formspec-web; the issuer declares it; formspec-web POSTs an HPKE-wrapped payload (§5.2). **No WOS dependency.**
- **`routingTier: "wos-task"`** (asymmetric-tier). The duress signal enqueues a WOS task for a registered `safety-reviewer` actorExtension. Adds WOS-side state supporting cross-team workflow, audit-trail integration, escalation policies. Requires WOS co-investment and a `safety-reviewer` actorExtension registration at WOS layer.
- **Form-policy axis.** The form declares which routing tier it requires. Forms requiring `wos-task` fail-closed under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md)'s `UnsupportedRequiredFeatureError` on instances that don't wire the WOS-tier adapter.

**Trigger boundary, stated precisely.** `issuer-webhook` suffices when the issuer's safety-routing process is *external to WOS* (a phone tree at NCADV, an internal Slack channel, an external CRM). `wos-task` is required when the safety review must integrate with WOS case state (e.g., a court's intake process that handles safety review as a workflow stage).

**Risk: WOS-tier surface increases observability.** A coercer with caseworker access could query WOS task lists. Mitigation: `safety-reviewer` actorExtension MUST be a closed-membership role at the WOS layer, with per-tenant ACL preventing rank-and-file caseworkers from observing safety-reviewer task counts. The composition with FW-0050 §7.2 per-party-scoped status reads applies: the duress signal MUST NOT be visible in any respondent-facing status surface (FW-0021, FW-0039) — `readStatus(caseId)` and `readStatus(caseId, partyId)` return identical results for duress-signaled and non-duress submissions.

**Alternative rejected: WOS-only routing across the board.** Forces every adopter wanting `duressAware` to deploy WOS for a flow whose actual routing target is often an external phone tree. Defeats [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md)'s adopter-diversity charter.

**Alternative rejected: respondent-side recovery-flow only.** Doesn't reach the canonical scenario 2.3.1 where the respondent is on the coercer's device.

### 3.4 Q4 — Receipt-side semantics: HPKE-wrapped payload via the standard Trellis envelope (DEK in `key_bag`, ciphertext in `payload_ref`)

**PROPOSAL.** The duress payload rides Trellis's standard payload-encryption mechanism per Trellis Core §6.4 + §9.4. There is **no commitment-slot ciphertext**: Core §13 commitment slots are scheme-specific cryptographic commitments (Pedersen / Merkle / BBS+) reserved for Phase 2+ selective-disclosure, not HPKE ciphertext containers. The duress signal flows the documented HPKE path:

1. **Plaintext payload** (see §5.2 for shape) is encrypted under a fresh content-encryption key (DEK) using ChaCha20-Poly1305 per Core §6.4. The ciphertext lives in the event's `payload_ref` (`PayloadInline` or `PayloadExternal`).
2. **DEK wrap** for the safety-team recipient lives in the event's `key_bag` per Core §9.4: one `KeyBagEntry` whose `recipient` names the safety-team recipient (registered per-issuer in the issuer-sidecar, EXT-30 / §6.4 below), `suite = 1` (`DHKEM(X25519, HKDF-SHA256)` / `HKDF-SHA256` / `ChaCha20-Poly1305`), `wrapped_dek` produced by RFC 9180 `SetupBaseS` / `Seal` with `info = h''` and `aad = h''`. Only the holder of the safety-team private key can unwrap the DEK and decrypt the ciphertext.
3. **No `commitments` population required.** Per Core §13.3, Phase 1 producers MUST emit `commitments` as `null` or `[]` (Phase 1 verifiers MUST accept either). The duress-payload opacity is delivered by the §9.4 key_bag wrap, not by a §13 commitment.

**Re-anchored uniform-shape story (event-level, not slot-level).** The uniform-shape posture lives at the **event level**: every high-risk-template signing ceremony emits a `submission.duress-signaled` event with a byte-shape-uniform envelope (uniform-sized padded `payload_ref` ciphertext; uniform `key_bag` entry to the safety-team recipient). The plaintext distinguishes the duress vs non-duress case (`duressSignaled: true | false` in §5.2). A shoulder-surfing observer of the chain sees one `submission.duress-signaled` event per high-risk-template submission; the event's *presence* is uniform, the event's *plaintext* (decryptable only by the safety-team recipient) is what carries the signal. This is consistent with Core §13.2's identity-value rule for *unused* commitment slots: shape uniformity is the universal Trellis defence against presence-as-leak.

**Justification.** Routing the duress payload through the standard `payload_ref` + `key_bag` HPKE path is the only structurally-correct option in Trellis Phase 1, and it preserves the canonical opacity guarantee (only the safety-team private-key holder can read the plaintext). The §9.4 wrap targets a recipient public key registered per-issuer in the issuer-sidecar (web ADR-0006 + EXT-30). Trellis Phase 1 mechanisms suffice; no Phase 2 commitment work is required for the base pattern (see §6.5 + §6.6 for the Phase 2 advanced-disclosure dependency surfaced separately).

**HPKE suite per Trellis Core §9.4 suite 1.** `DHKEM(X25519, HKDF-SHA256)` / `HKDF-SHA256` / `ChaCha20-Poly1305` — same suite as Trellis per-class DEK wrapping (ADR-0074 inheritance per `trellis/CLAUDE.md`). **Depends on EXT-18 (`@integrity-stack/hpke` — TS wrapper around `hpke-js`)**, already queued for FW-0056. Stacking the duress-payload onto the same TS wrapper amortizes the integration.

**Severity band semantics.** Three-band closed enum: `flag-for-review | active-concern | immediate-intervention`. The respondent-facing affordance does not expose the band choice; the band is determined by the activation surface — `dual-passkey` ceremony with the duress credential = `active-concern` by default; instance-configured policy may map to other bands. **Open question** in §8 (band selection by respondent vs by system) deferred to FW-0059 build.

**Alternative rejected: encode duress payload into a §13 commitment slot.** Structurally wrong: Core §13 commitments are Pedersen / Merkle / BBS+ cryptographic commitments scheme-bound per §13.3 (all Phase 2+ Reserved); Phase 1 producers MUST emit `commitments` as `null` or `[]`. A commitment is not an HPKE ciphertext container. Rejected.

**Alternative rejected: plain boolean in the plaintext with no encryption.** Reduces opacity; any party with payload-read access learns whether each submission was duress-signaled. Rejected.

**Alternative rejected: per-routing-target plaintext signal.** Defeats the HPKE wrap's purpose.

**Alternative rejected: omit the Trellis event entirely; signal duress via out-of-band channel only.** Loses cryptographic auditability — the issuer's safety team has no proof the duress signal originated from a verified signing ceremony. Rejected.

## 4. Capability key and port shape

### 4.1 Capability key under web ADR-0011

The proposal: add `duressAware` to the [Feature Ownership Table at line 138](../adr/0011-runtime-feature-resolution-and-policy-gates.md).

| Layer | What it carries for `duressAware` |
|---|---|
| Instance capability | Adapter-backed duress-signal pipeline: dual-credential enrollment registry + HPKE wrap to safety-team recipient + routing-target dispatch (webhook or WOS task). Instance declares the highest tier it can serve. |
| Org policy | `allowed mechanisms` (closed enum subset of `{dual-passkey, dual-pin, pin-second-entry}`), `routingTier` allow-list (`{issuer-webhook, wos-task}`), per-template safety-team-recipient public-key registry, per-jurisdiction policy floor (some jurisdictions may mandate `wos-task` for legal admissibility). |
| Form policy | Form declares required `duressAware` tier (`mechanism: dual-passkey | dual-pin | pin-second-entry`, `routingTier: issuer-webhook | wos-task`) as a first-class authoring declaration. High-risk templates (financial POA, immigration, advance directive, marriage / divorce, custody) declare `duressAware` required. |
| Resolved runtime profile | Enabled mechanism + routing tier + recipient public-key handle + ceremony-side configuration. Form-load throws `UnsupportedRequiredFeatureError` if the instance tier doesn't satisfy the form's required tier. |

**Tier is a first-class form-policy declaration, not a runtime-derived value** — same discipline as `multiParty.tier` in [FW-0050 §3.1](2026-05-23-fw-0050-multi-party-submission-design.md). The mechanism/routing axes are orthogonal to the form's per-template risk classification; the form author declares both explicitly; the resolver does not infer.

**Rejected alternative: derive tier from template-class.** Considered because the high-risk template enumeration is already known (J-027 enumerates them). Rejected because (a) the template enumeration is jurisdictionally variable, and (b) explicit declaration surfaces the orchestration choice at the form-authoring edit boundary.

### 4.2 Port shape — adopter contract now; port shape deferred to FW-0059 build

Per [web ADR-0009 §"Not in the constitutional inventory" (b)](../adr/0009-hexagonal-architecture-ports-and-adapters.md): post-MVP ports await consumer code; front-loading speculative port contracts before real consumers exercise them is the anti-pattern web ADR-0006 documented retroactively (the originally-conceived `IssuerProvider` port turned out moot once the React surface landed and the engine `IssuerStore` was directly consumable). FW-0048 is a design row; FW-0059 is the build. The honest application of ADR-0009 §(b) is to specify the **adopter contract** here and let the port shape land with the build.

**Adopter contract (what FW-0059 must satisfy).** The dispatch concern is adopter-shaped along two axes:

| Adopter axis | What it implies |
|---|---|
| Issuer-webhook adapter | Posts HPKE-wrapped bytes (the ciphertext + recipient handle that resolved at form-load) to an issuer-configured endpoint (NCADV hotline integration, internal Slack channel webhook, lawyer-on-call CRM). Retry + dead-letter semantics owned by the adapter. |
| WOS-task adapter | Enqueues a task for a `safety-reviewer` actorExtension in the issuer's WOS deployment. Per-tenant ACL closed-membership enforcement at the WOS layer. |

Both adapters need: (a) the HPKE-wrapped bytes from §5.2, (b) the resolved `routingTargetId` from the issuer-sidecar `safetyTeamRecipients[]`, (c) failure semantics distinct from `SubmitTransport` (the dispatch can succeed when submit fails — the safety team must still be alerted — and vice versa; the submit can succeed while the dispatch retry lags). **FW-0059 picks the port shape at build time** when both reference adapters are co-implemented; the spec-of-the-port emerges from the actual adapter pair, not from speculation. The minimal extensions to `IdentityProvider` (web ADR-0007) and `SubmitTransport` (the §5.2 event lives in the canonical Response envelope per EXT-5) are mechanical and land with the build.

**Why not invent a `SafetyRouting` port here.** It is tempting to pin a `dispatch(signal: HPKE_wrapped_bytes, target: opaque) → void` shape now, but per ADR-0009 §(b) the bar is consumer code, not predicted-need: two real adapters (issuer-webhook + WOS-task) need to be reduced together for the port shape to be load-bearing. Until then, naming the port without two real adapters reduced against it is the same pre-consumer port speculation ADR-0006 retroactively flagged.

**Why not a `DuressCredentialStore` port.** The dual-credential registry is *server-side* per §3.1; the formspec-web client never sees the registry. The credential-registration step happens at FW-0031's signing-PIN / passkey-enrollment surface, which is itself a port (`IdentityProvider`). No new port needed at the credential-store layer.

### 4.3 Resolution contract addition

The `ResolvedRuntimeProfile` consumed by the React shell per [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) gains a `duressAware` block:

```text
duressAware?: {
  mechanism: "dual-passkey" | "dual-pin" | "pin-second-entry"
  routingTier: "issuer-webhook" | "wos-task"
  recipientPublicKeyRef: string              // handle into the issuer-sidecar key registry
  severityBandDefault: "flag-for-review" | "active-concern" | "immediate-intervention"
  ceremonyHints?: {
    enrollmentSurfaceUrl?: string            // for the FW-0021 dual-enrollment guidance
    safetyRoutingDescription?: string        // plain-language for issuer-side use, NEVER respondent-visible
  }
}
```

The block is the resolver's read-only output. Adapters do not consume it directly; the shell does, and orchestrates the existing `IdentityProvider` + `SubmitTransport` ports plus the FW-0059-build safety-routing adapter (port shape to be picked at build time per §4.2) against it.

**Sensitive-data discipline:** the `ceremonyHints.safetyRoutingDescription` field is for **issuer-side configuration display only** (used in admin / Studio surfaces, not in respondent surfaces). The respondent's view MUST NOT render any duress-related copy. The shell enforces this by rendering the same ceremony UI regardless of `duressAware` presence; the duress affordance is the *additional credential* the respondent can choose to authenticate with, not an additional visible button.

## 5. Sidecar shape — load-bearing per FW-0050 §7.2 delegation

This is the section FW-0050 §7.2 explicitly delegates to. FW-0061 (multi-party build) reads this section and knows what shape to wire per-party.

### 5.1 EXT-5 `submission.duress-signaled` event payload

The respondent-ledger event `submission.duress-signaled` (queued in EXT-5, [`thoughts/specs/2026-05-22-upstream-extension-queue.md:73`](2026-05-22-upstream-extension-queue.md)) carries this payload as its event-specific extension. **Payload shape (proposed for EXT-5 ratification):**

```text
extensions["formspec.submission.duress-signal.v1"]: {
  signalId:                    string                  // stable URN identifying the signal event
  responseId:                  string                  // the Response this signal binds to
  authoredSignatureRef?:       string                  // optional ref to the AuthoredSignature; the signal can fire alongside any AuthoredSignature in the Response (per-party scope per §7.1)
  partyRef?:                   string                  // for multi-party (FW-0050) — urn:party:<roleId>:<sessionId>; absent for single-party
  capturedAt:                  timestamp               // RFC 3339, when the duress detection surface fired
  mechanismUsed:               "dual-passkey" | "dual-pin" | "pin-second-entry"
  payloadRef:                  string                  // reference to the event's PayloadRef (Trellis Core §6.4) carrying the ChaCha20-Poly1305 ciphertext of the §5.2 plaintext
  keyBagRecipientHandle:       string                  // handle naming the KeyBagEntry recipient (Trellis Core §9.4) whose wrapped_dek unwraps the payload DEK; resolves to the safety-team recipient registered in the issuer-sidecar safetyTeamRecipients[] (EXT-30)
}
```

**Honesty constraint (event-level uniform shape).** Every submission of a `duressAware`-enabled form emits one `submission.duress-signaled` event with the byte-shape-uniform envelope per §3.4: padded `payload_ref` ciphertext, single `key_bag` entry naming the safety-team recipient, plaintext distinguishes duress vs non-duress (`duressSignaled: true | false` per §5.2). The event's *presence* is uniform across all submissions; the event's *plaintext* is what the safety-team recipient decrypts to detect the signal. formspec-web's submit adapter ensures uniformity by routing both `(duressSignaled = true)` and `(duressSignaled = false)` through the same code path with identical envelope shape. **No §13 commitment-slot population is required** — per Trellis Core §13.3, Phase 1 producers MUST emit `commitments` as `null` or `[]`. The OC-26 selective-disclosure slot-population rule applies only to records subject to later selective disclosure (Phase 2+) and is orthogonal to the duress payload's HPKE wrap.

### 5.2 HPKE-wrapped payload (the plaintext the safety-team recipient decrypts)

**Plaintext shape** (held only by the safety-team recipient after `key_bag` unwrap + `payload_ref` decrypt):

```text
{
  schemaVersion:    "1"
  duressSignaled:   boolean                              // true if respondent fired the duress affordance; false in the uniform-shape non-duress case
  severityBand:     "flag-for-review" | "active-concern" | "immediate-intervention" | null  // null in the non-duress case
  routingTargetId:  string                               // issuer-configured target; opaque to formspec-web
  capturedAt:       timestamp                            // RFC 3339
  contextMetadata?: {                                    // OPTIONAL — only when issuer's policy permits
    sessionUserAgentClass?: string                       // e.g. "desktop-chrome" — bucketed, never raw UA
    geoRegionRough?:        string                       // e.g. "US-CA" — never coordinates
  }
}
```

**Substrate path per Trellis Core (no commitment-slot use).** The plaintext is encrypted under a fresh DEK with ChaCha20-Poly1305; the ciphertext lives in the event's `payload_ref` (`PayloadInline` per §6.4). The DEK is wrapped for the safety-team recipient via a single `key_bag` `KeyBagEntry` per §9.4 — `suite = 1` (`DHKEM(X25519, HKDF-SHA256)` / `HKDF-SHA256` / `ChaCha20-Poly1305`), recipient public key registered in the issuer-sidecar's `safetyTeamRecipients[]` block (EXT-30; see §6.4), `info = h''`, `aad = h''`, fresh X25519 ephemeral per wrap. The `submission.duress-signaled` event signature (Ed25519 over COSE_Sign1, §6.6) covers the envelope including `payload_ref` and `key_bag`; any modification invalidates the signature.

**Uniform-shape non-duress case (event-level).** When the respondent did not signal duress, the same event is still emitted, the same plaintext shape is still wrapped — the plaintext just carries `{ duressSignaled: false, severityBand: null, ... }`. The ciphertext bytes are padded to a fixed envelope size at the formspec-web wrap step before HPKE seal (formspec-web pre-pads the plaintext to a fixed length; HPKE Base mode supports `aad = h''`, so the padding lives in the plaintext bytes, not in HPKE associated data). The safety team's decrypt of every submission yields `{ duressSignaled: false }` for the vast majority and `{ duressSignaled: true }` for the rare signal. **This means the safety team must decrypt every submission to detect duress** — an honest tradeoff: the cost is decryption-per-submission; the benefit is the event's *presence* and envelope shape are uniform and a chain-observer cannot infer the duress state.

**Alternative rejected: omit the `submission.duress-signaled` event when no duress was signaled.** Leaks duress fact by event presence. Rejected — the event-level uniform-shape posture (§3.4) requires the event to be emitted whether or not duress was signaled.

**Alternative rejected: encode the payload into a §13 commitment slot.** Trellis Core §13 commitments are scheme-specific cryptographic commitments (Pedersen / Merkle / BBS+) reserved for Phase 2+; per §13.3 Phase 1 producers MUST emit `commitments` as `null` or `[]`. A commitment is not an HPKE ciphertext container. Rejected.

### 5.3 Recovery / failure semantics

The duress signal is **never a renderer-level error.** The respondent's ceremony succeeds; the receipt is byte-identical to the non-duress path (§3.2). The recovery semantics are issuer-side:

1. **Quarantine for issuer review (default).** The duress signal triggers an issuer-side hold on downstream processing. The form's `intake-handoff` is admitted to Trellis (the canonical record remains intact); the issuer's safety-routing adapter delivers the HPKE-wrapped payload to the safety-team recipient; the safety team reviews and disposition the submission per the issuer's safety protocol. **No silent invalidation.** The respondent is *not* told a quarantine occurred (telling them would tip off the coercer if the coercer is reading their email).
2. **Conflicting evidence.** A duress signal fires even if form content does not visibly corroborate (the form looks pristine). Per Q6 of the brief: **the duress signal is authoritative; the issuer does not get to dismiss it based on form content.** The safety team's disposition is the issuer's call, but the signal's existence triggers the disposition unconditionally.
3. **Missing duress signal does NOT mean safe.** Absence of signal means the respondent did not fire the affordance; it does NOT mean coercion did not occur. Issuers MUST NOT treat "no duress signal" as positive evidence of free signing. Receipt rendering MUST NOT include any "this submission was confirmed not under duress" attestation.

**Receipt rendering discipline (consumed by FW-0009 verifier when post-MVP):** the verifier surface MUST NOT distinguish duress-signaled and non-duress submissions in any user-visible way. The verifier's positive cryptographic verdict is the same in both cases; the duress fact is not in the receipt's disclosed payload.

## 6. Cross-stack dependency chain

### 6.1 The chain

```
FW-0048 design (this doc)
    ↓
EXT-5 ratification (formspec — `submission.duress-signaled` event payload per §5.1)
+ EXT-18 (integrity-stack — `@integrity-stack/hpke` TS wrapper; queued for FW-0056)
+ EXT-30 (new — proposed below: issuer-sidecar `safetyTeamRecipients[]` block)
+ web ADR-0011 (Feature Ownership Table addition for `duressAware`)
    ↓
XS-3 ratification (new cross-stack ADR proposed below; spans formspec + WOS + trellis)
    ↓
FW-0059 build (formspec-web)
```

### 6.2 EXT-5 — `submission.duress-signaled` payload shape (extension of existing queued entry)

EXT-5 ([`thoughts/specs/2026-05-22-upstream-extension-queue.md:67`](2026-05-22-upstream-extension-queue.md)) already names `submission.duress-signaled` as a Phase-1 ledger event with "private-sidecar discipline per `trellis-operational-companion.md` §13." This design adds the **payload shape** specified in §5.1 above. EXT-5 ratification at formspec must carry the payload-shape extension.

### 6.3 EXT-18 — `@integrity-stack/hpke` TS wrapper (existing queued entry; new consumer)

EXT-18 ([`thoughts/specs/2026-05-22-upstream-extension-queue.md:143`](2026-05-22-upstream-extension-queue.md)) is queued for FW-0056 (respondent-side document library). FW-0048 design adds a second consumer: HPKE Base-mode wrap of the duress-signal plaintext to the safety-team recipient public key. **Same suite parameters; no new EXT-18 work** — formspec-web wires the existing wrapper.

### 6.4 EXT-30 (new) — Issuer-sidecar `safetyTeamRecipients[]` block

**Proposed for upstream extension queue.** The issuer-sidecar (web ADR-0006) gains a `safetyTeamRecipients[]` block declaring per-template recipient public-key handles:

```text
issuerSidecar.safetyTeamRecipients: Array<{
  templateClassRef:      string                       // closed enum: "financial-poa" | "immigration-sponsorship" | "advance-directive" | "marriage-divorce" | "custody" | "benefits-redirect"
  recipientPublicKeyB64: string                       // X25519 public key per Trellis Core §9.4 suite 1
  routingTargetId:       string                       // opaque ID dispatched to the safety-routing adapter (§4.2)
  jurisdictions:         Array<string>                // ISO 3166-2 codes the recipient covers; empty = global default
  validFromAt:           timestamp                    // RFC 3339
  validUntilAt?:         timestamp                    // RFC 3339 — for key rotation
}>
```

**Why a sidecar block, not a separate sidecar:** the issuer-sidecar already owns issuer-side configuration (web ADR-0006); the safety-team recipient registry is one more issuer-side concern. A separate sidecar would fragment the issuer's configuration surface unnecessarily.

**Privacy discipline.** The block is NEVER exposed to the respondent; it is consumed at form-load to identify the recipient public key the duress wrap targets. The shell does not render the recipient list or jurisdiction list.

### 6.5 XS-3 (new) — Cross-stack ADR for duress-signal pipeline

**Proposed for stack-root.** Spans formspec (`submission.duress-signaled` event + payload shape), WOS (`safety-reviewer` actorExtension for the `wos-task` routing tier), and trellis (no envelope change; binding the §13 Disclosure Manifest discipline to the duress payload).

**XS-3 proposed content (consumer perspective):**

1. **Boundary:** at `intake-handoff` plus the optional WOS-task dispatch. Formspec owns the per-event payload shape; Trellis carries the standard envelope (signed event with `payload_ref` ciphertext + `key_bag` wrap per Core §6.4 + §9.4); WOS optionally owns the `safety-reviewer` actorExtension; the safety-routing adapter is an adopter-shaped dispatch layer that targets either an issuer-side webhook or a WOS task (port shape picked at FW-0059 build time per §4.2).
2. **Trellis discipline (base pattern, works in Phase 1):** Core §6.4 (`payload_ref` carries the ChaCha20-Poly1305 ciphertext), §9.4 (`key_bag` carries the HPKE Base-mode DEK wrap to the safety-team recipient), §6.6 (Ed25519 over COSE_Sign1 signs the envelope). **No new Trellis substrate primitive required for the base duress pipeline.** The only Trellis-side work is event-type registration: per Core §6.7 + §14 the `submission.duress-signaled` event_type must be registered in the bound registry so the verifier obligation under §14.4 resolves at signing time and §13.2 fixed-position vector declarations (if any) are pinned for the event type. Event-type registration is Phase 1 work.
3. **Phase 2+ advanced disclosure (deferred, surfaced honestly).** Any advanced post-hoc selective-disclosure manifest over the duress payload (e.g., disclosing a subset of the plaintext fields to an appellate-court audience while withholding others from FOIA) would require Trellis Phase 2+: OC-26 commitment-slot population at admit time + OC-27 Disclosure Manifest structure + OC-30 independent auditability + a Phase 2+ commitment scheme registered under Core §13.3. **FW-0048 does NOT require any of this for the base pattern** — the safety-team recipient receives the full plaintext via §9.4 unwrap; no selective-disclosure carve-out is needed for the MVP routing. The Phase 2+ dependency is surfaced here only so a future row scoping post-hoc selective disclosure over the duress payload knows the substrate gap.
4. **WOS actorExtension:** `safety-reviewer` per S10.1, closed-membership-role at the WOS layer with per-tenant ACL preventing observability by rank-and-file caseworkers. **Optional** — `issuer-webhook` routing tier doesn't require WOS at all.
5. **Receipt discipline:** the verifier surface MUST NOT distinguish duress-signaled and non-duress submissions. Verifier conformance suite must include fixtures covering both cases producing identical user-visible verdicts.
6. **Per-party scoping (FW-0050 §7.2 binding):** when `duressAware` composes with `multiParty`, the event is per-party — Party B's duress signal is per-party-scoped, never visible to Party A through any surface (status reads, ceremony state, receipt). See §7 below.

**Without XS-3 ratification, FW-0048 design cannot be acted on by FW-0059.** The dependency is hard. XS-3 itself is achievable on Trellis Phase 1 (the base HPKE-via-key_bag pattern is documented Phase 1 mechanism); only the optional post-hoc selective-disclosure-manifest feature (item 3 above) waits on Phase 2.

### 6.6 What FW-0048 ratifies standalone

**Standalone ratifiable today (no upstream dependency):**

- The Q1–Q4 framing decisions, scoped to formspec-web's consumer perspective.
- The `duressAware` capability shape under [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — the resolver block in §4.3, the tier axes, the failure-semantics binding.
- The safety-routing adopter contract (§4.2) — the conformance fixture pattern over the adopter axes (issuer-webhook + WOS-task) can be authored now even though the port shape lands with FW-0059 build.
- The per-party composition rule with FW-0050 (§7).

**Waits on upstream:**

- The EXT-5 payload shape extension (formspec ratification).
- The issuer-sidecar `safetyTeamRecipients[]` block (EXT-30 — proposed).
- The XS-3 cross-stack ADR (spans formspec + WOS + trellis).
- Trellis Phase 1 event-type registration of `submission.duress-signaled` in the bound registry (per Core §6.7 + §14) so the verifier obligation under §14.4 resolves at signing time. Required for the base pipeline.
- The WOS `safety-reviewer` actorExtension (per XS-3 §6.5 (4) — only for `wos-task` routing tier).
- **Trellis Phase 2** — required ONLY for post-hoc selective-disclosure manifests over the duress payload (XS-3 §6.5 (3) above). The base pipeline (event with `payload_ref` ciphertext + `key_bag` HPKE wrap → safety-team recipient) does NOT require Phase 2 and is achievable on Phase 1 substrate.

## 7. Multi-party composition (FW-0050 §7.2 satisfaction)

This is the section [FW-0050 design §7.2](2026-05-23-fw-0050-multi-party-submission-design.md) explicitly delegates to. FW-0061 (multi-party build) reads this section.

### 7.1 Per-party sidecar scope

The single-party sidecar shape from §5.1 carries a `partyRef?` field that is absent in single-party flows and present in multi-party flows:

- **Single-party:** `partyRef` absent; the duress signal binds to the single `AuthoredSignature` in the Response.
- **Multi-party:** `partyRef` present, carrying an extended `urn:party:<roleId>:<sessionId>` URN built on the upstream `urn:party:` convention used in [`intake-handoff.schema.json:180`](../../../formspec/schemas/intake-handoff.schema.json) (`urn:party:person:applicant-456`-style). FW-0048 extends that convention with two additional axes — `roleId` (matches `Definition.parties[*].roleId`) and `sessionId` (per-party `IdentityProvider` session identifier) — so the duress signal binds to a specific party's `AuthoredSignature` and is scoped to that party's view only. The extended URN composition is filed as a new queue entry (proposed addition to EXT-30 framing or a sibling EXT-* row) so the upstream `urn:party:` family ratifies the extension explicitly per [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) (consume primitives, propose extensions explicitly).

**Per-party invisibility guarantee.** Per FW-0050 §7.2: "Party B's duress signal must not be observable to Party A." This binds at three surfaces:

1. **Receipt:** the multi-party receipt's per-party `partySignatures[]` entries do NOT disclose any party's duress signal to any other party. The receipt is byte-identical regardless of which party (if any) signaled duress.
2. **Status reads:** per the FW-0050 §7.2 binding, `readStatus(caseId, partyId)` returns the requesting party's own status. The duress signal is NEVER visible in any party's status surface (including their own — telling the survivor "your duress signal was received" would tip off a coercer reading the survivor's email).
3. **Ceremony surface:** when Party B authenticates and runs their signing ceremony, the ceremony state MUST NOT reveal whether Party A signaled duress (information leak in either direction is forbidden).

### 7.2 Per-party HPKE wrap

Each party's duress payload is HPKE-wrapped independently. The safety-team recipient (per the issuer-sidecar `safetyTeamRecipients[]` block) may be the same across parties (one recipient for all parties' duress signals) or different per role (e.g., immigration sponsorship may route the petitioner's duress to one team and the beneficiary's to a different team — the trafficking-survivor pipeline is structurally distinct).

The per-party `partyRef` is part of the HPKE plaintext (inside the §5.2 plaintext block, encrypted by the per-event DEK before key_bag wrap), so even an observer of the chain cannot determine which party signaled duress.

### 7.3 FW-0061 build constraints (consumed by FW-0061 author directly)

The FW-0061 build is responsible for:

1. **Per-party safety-routing dispatch invocations.** Each party's `IdentityProvider` session, after the signing ceremony, fires its own duress-detection step server-side, producing one HPKE-wrapped payload per party (uniform shape per §3.4 — emitted whether or not duress was signaled). The safety-routing adapter dispatches each independently (per-party retry semantics; one party's dispatch failure MUST NOT block another party's dispatch). The port shape lands with FW-0059 build per §4.2.
2. **Per-party event-level uniform shape.** Each party's signing ceremony emits a `submission.duress-signaled` event with byte-shape-uniform envelope (padded `payload_ref` ciphertext + `key_bag` entry to the safety-team recipient) per §3.4 + §5.2, whether or not that party signaled duress.
3. **Cross-party visibility enforcement.** Per §7.1 above: receipts, status reads, and ceremony state MUST be byte-identical across all combinations of which parties signaled duress.
4. **Multi-party fixture coverage.** FW-0061 conformance fixtures MUST include: (a) co-equal flow where Party A signaled duress, Party B did not; (b) co-equal flow where both parties signaled duress; (c) asymmetric flow where the asymmetricSecondary party signaled duress; (d) all corresponding "no party signaled duress" baselines. Receipts in (a)-(c) MUST be byte-identical to (d) modulo the HPKE-wrapped `payload_ref` ciphertext bytes (which differ in plaintext but match in shape).

## 8. Open questions / deferrals

Honest list of what FW-0048 design does NOT resolve:

1. **Severity band selection (Q4 deferral).** Whether the respondent picks the severity band at ceremony time (more agency; more cognitive load under duress) or whether the system picks the band from instance-configured policy (less agency; better predictability). **FW-0059 build's call.** Default in this design: system picks `active-concern` by default; respondent override is post-MVP.
2. **Out-of-band recovery channel (scenario 2.3.2 partial coverage).** A second affordance for survivors who cannot operate the coercer's device: a recovery-flow that triggers safety routing without requiring the respondent to fire the in-flow signal. Belongs to **FW-0030 federated-identity recovery** or a separate row; not FW-0048's scope.
3. **Cool-off windows / secondary confirmation (scenario 2.3.3 deferral).** The elder-coercion-by-misrepresentation scenario class needs a different design (cool-off windows, secondary confirmation, fraud-pattern detection at issuer). Proposed as a separate FW row; **not FW-0048's scope.**
4. **Jurisdictional admissibility.** Whether a duress-signaled signature is voidable, valid-pending-investigation, or subject to additional procedure varies by jurisdiction. **Legal-counsel work.** FW-0048 produces the artifact; admissibility is the issuer's compliance posture.
5. **Post-signing repudiation.** Per §2.1 class (c): a respondent who escaped coercion and wants to retroactively repudiate a signed document uses **FW-0038 (amend / withdraw / dispute)**, not FW-0048. FW-0038's lifecycle event for `response.dispute-attached` (EXT-5 queued) is the canonical surface; whether `response.dispute-attached` should be HPKE-wrapped when the dispute reason is coercion is FW-0038's design question.
6. **Webhook delivery reliability.** The safety-routing adapter's retry / dead-letter semantics when the issuer's webhook endpoint is unreachable. **FW-0059 build's call.** Default: at-least-once with exponential backoff; permanent failures escalate via an alerting channel the issuer configures separately.
7. **Duress signal during a federated-identity flow.** When the respondent authenticates via a federated IdP (Login.gov, ID.me) that does NOT expose a duress channel, the `dual-passkey` mechanism is unavailable — only `dual-pin` or `pin-second-entry` tiers apply. **Composition with FW-0030 is partial**; instances supporting federated IdP MUST also support at least one non-passkey duress mechanism if `duressAware` is required.
8. **Issuer-side safety-team enrollment / key rotation.** How issuers register `safetyTeamRecipients[]` recipients, rotate keys, sunset old recipients. **Operational concern for FW-0059 build + issuer-side admin surface.** This design specifies the schema; the operational lifecycle is out of scope.
9. **Bidirectional confirm-to-victim-services pattern.** Whether the safety-team recipient acknowledges receipt and routes the acknowledgement back through any surface to the respondent. **Risk: any respondent-visible acknowledgement defeats §3.2 invisibility.** Default: no acknowledgement surface; the safety team's intervention is the acknowledgement.

## 9. Decision summary

| Decision | Status | Owner of any pushback |
|---|---|---|
| Q1: dual-credential primary mechanism with PIN-second-entry fallback tiers | PROPOSAL | owner review |
| Q2: byte-identical success-path; duress fact only in issuer-side sidecar | PROPOSAL | owner review |
| Q3: issuer-webhook routing (MVP-tier) + WOS-task (asymmetric-tier) | PROPOSAL | owner review |
| Q4: HPKE-wrapped payload via Trellis Core §6.4 `payload_ref` + §9.4 `key_bag` (no §13 commitment-slot use; Phase 1) | PROPOSAL | owner review |
| `duressAware` capability tier under ADR-0011 (mechanism × routingTier axes) | PROPOSAL | owner review + ADR-0011 evolution |
| Safety-routing adopter contract now; port shape deferred to FW-0059 build per ADR-0009 §(b) (extend `IdentityProvider` + `SubmitTransport`; no new credential-store port) | PROPOSAL | owner review |
| EXT-5 payload shape per §5.1 (extension of queued entry) | PROPOSAL to formspec | formspec spec-expert review |
| EXT-30 (new) — issuer-sidecar `safetyTeamRecipients[]` block | PROPOSAL to formspec | formspec spec-expert review |
| XS-3 (new) — cross-stack ADR for duress-signal pipeline | PROPOSAL to stack-root | stack-root architecture review |
| Per-party duress sidecar shape satisfies FW-0050 §7.2 delegation (§7 above) | PROPOSAL | owner review + FW-0061 build consumer |

**Row status change:** FW-0048 moves from `open` to `in design`. FW-0048 stays open until this design is owner-ratified and the upstream chain (EXT-5 payload + EXT-30 + XS-3) has at least proposed shapes.

## 10. Related decisions

- [web ADR-0004](../adr/0004-cross-repo-placement-consume-not-invent.md) — consume not invent (governs every upstream-dependency call in this doc)
- [web ADR-0005](../adr/0005-mvp-scope-defer-cryptographic-substrate.md) — MVP scope (`duressAware` is post-MVP; this design is staging for post-MVP)
- [web ADR-0006](../adr/0006-issuer-sidecar-spec-request.md) — issuer sidecar (EXT-30 lands as a block on this sidecar)
- [web ADR-0007](../adr/0007-identity-provider-port.md) — IdentityProvider port (the credential-classification touchpoint per §4.2)
- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal architecture (port-shape discipline; §(b) defers safety-routing port shape to FW-0059 build per §4.2)
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — runtime feature resolution (the `duressAware` capability the design instantiates)
- [FW-0050 design 2026-05-23](2026-05-23-fw-0050-multi-party-submission-design.md) — multi-party (§7.2 delegates per-party duress sidecar to this row; §7 above satisfies)
- [Trellis Core §6.4](../../../trellis/specs/trellis-core.md) — `PayloadRef` shape (where the duress ciphertext lives per §5.2)
- [Trellis Core §9.4](../../../trellis/specs/trellis-core.md) — Key bag + HPKE Base-mode wrap (where the safety-team DEK wrap lives per §5.2)
- [Trellis Core §13](../../../trellis/specs/trellis-core.md) — Commitment slots reserved (Phase 2+; NOT used by the duress base pattern per §3.4)
- [trellis-operational-companion §13](../../../trellis/specs/trellis-operational-companion.md) — Disclosure Manifest discipline (Phase 2+ overlay; relevant only for the deferred post-hoc selective-disclosure feature per §6.5 (3))
- [stack-root ADR-0074](../../../thoughts/adr/0074-formspec-native-field-level-transparency.md) — per-class DEK wrapping inheritance (HPKE suite parity)
- Source brief: [`thoughts/sketches/2026-05-23-fw-0048-coercion-aware-signing-research-brief.md`](../sketches/2026-05-23-fw-0048-coercion-aware-signing-research-brief.md)
- Journey: [J-027 in `JOURNEYS.md:526`](../../JOURNEYS.md)
- Anti-patterns: [AP-014 in `JOURNEYS.md:131`](../../JOURNEYS.md), [AP-021 in `JOURNEYS.md:173`](../../JOURNEYS.md)
