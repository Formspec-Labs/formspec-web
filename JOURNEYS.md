# Web Journeys

Person-centered journeys for the public reference UI, plus a constraint list of anti-patterns the surface must not adopt. Use this document to understand **what a real person wants to do on the screen, what "it works" feels like to them, and what kinds of behavior would actively betray them.**

[PLANNING.md](PLANNING.md) lists `FW-*` rows — atomic UI work items. This document is the "why" above them.

## Relation to formspec-server JOURNEYS

[`../formspec-server/JOURNEYS.md`](../formspec-server/JOURNEYS.md) is the authoritative product journey corpus across six prefix families: `FRM-*` (form author), `RSP-*` (respondent), `SIG-*` (signature), `ADM-*` (admin), `INT-*` (integrator), `OPS-*` (operator). This repo's `J-NNN` entries primarily back `RSP-*` and `SIG-*` family items, plus a few public surfaces with no server analog. When the two corpora disagree on substance, write an ADR. Never silent drift.

## Provenance

J-002, J-006, J-007 were carved out of `../formspec-cloud/JOURNEYS.md` during the bootstrap of this repo (web ADR-0001); they retain their original cloud IDs to preserve the audit trail. The remaining journeys and the anti-patterns were synthesized 2026-05-20 from a multi-pass outside-view exercise: one competitor-grounded web-research pass (Jotform / Typeform / DocuSign / sigstore / USCIS / Stripe Checkout / airline booking), three open-ended gut-instinct passes, and five lens-specific gut passes (DocuSign signer, complex Jotform, government/TurboTax, financial PDF replacement, AI-native form framework). Authoring-side, admin-side, and pure marketing journeys were removed; they belong in `../formspec-cloud/` or `../formspec-site/`.

## Document structure

Two sections do different work:

- **Anti-patterns (`AP-NNN`)** describe behaviors the surface must not adopt. Each draws the boundary of what bad looks like and names how a reader can detect a violation. Journeys reference relevant anti-patterns inline.
- **Journeys (`J-NNN`)** describe what a real person wants to do and what "it works" feels like. Each carries the standard person-centered shape plus an "Anti-patterns" field listing any `AP-NNN` it touches.

The anti-pattern shape is intentionally complaint-flavored ("MUST NOT," "SHOULD NOT") because the failure modes were named by people imagining themselves on the receiving end of bad systems, and naming them that way preserves the moral weight.

## Personas

1. **Respondent** — fills out a form on the public URL, but increasingly inhabits the platform as a *persistent respondent-side place* across forms, senders, and time. Variants: filer-on-behalf (preparer, family member, paralegal, social worker, AI agent under a human's authority); draft-collaborator (lawyer or trusted reader brought in mid-flight); co-respondent (one of multiple parties on a joint form); returning user with documents, drafts, submissions, and obligations to track across senders.
2. **Signer** — completes the public side of a signature ceremony (canonical reference signer UI; tenant-branded hosted variant lives in cloud). Includes capacity variants: principal, agent-under-power-of-attorney, executor, professional under license, corporate officer.
3. **Evaluator** — external party validating trust artifacts. *(Procurement-reviewer pre-sale moment may live on the marketing site `../formspec-site/`; the verifier post-sale moment lives here.)*

## Journey row format

- **Who** — kind of person.
- **What they want** — the need, in their words.
- **Why it matters** — what happens if we get this wrong.
- **What "done" looks like** — the outcome the person would see.
- **Feel** — emotional register.
- **Anti-patterns** — `AP-NNN` references that bound this journey, if any.
- **Surfaces** — paths to relevant surfaces.
- **Backs** — server journey IDs or `(none — public surface family)` or `(TBD — server backlink not yet cross-referenced)`.
- **Status** — *open* | *in design* | *in build* | *live* | *closed*.

## Anti-pattern row format

- **Title** — short complaint-shaped statement.
- **Why** — what breaks when the surface violates this.
- **Test** — how a reader can detect a violation in a running system.
- **Related journeys** — `J-NNN` references where this anti-pattern applies.

---

# Anti-patterns

## AP-001 — MUST NOT autosave high-sensitivity fields to the server on keystroke

- **Why:** Every keystroke autosave of an SSN, account number, government ID number, or biometric is a partial-PII incident waiting to happen — exposed in logs, in backups, in WAF audit trails, in analytics replay, and in any AI co-pilot context window the form opens.
- **Test:** Field-class taxonomy (`sensitivity: high`) gates the autosave path. The network panel shows zero PII traffic until commit. The receipt records *which fields were committed when*, not a keystroke stream.
- **Related journeys:** J-002, J-019, J-020.

## AP-002 — MUST NOT auto-apply a signature from a single "Adopt and Sign" click

- **Why:** Bundling signature *creation* with signature *application* across every initial-here and sign-here field is the original sin of e-signature UX. It produces signed documents the signer demonstrably never saw — including pages they never scrolled past.
- **Test:** Each signature/initial field is an individual affirmative act. Bulk-apply requires document scroll-through first, is opt-in per document, and the receipt records per-field apply timestamps rather than one global stamp.
- **Related journeys:** J-008.

## AP-003 — MUST NOT report reading behavior to the sender

- **Why:** "Engagement analytics" on a signing surface — dwell time per page, hover heatmaps, scroll depth — is surveillance dressed as product metrics. Senders use it to time follow-up pressure and argue in disputes that "the signer spent X seconds on the clause, therefore read it." Reading behavior is not consent evidence.
- **Test:** The sender's telemetry surface shows only: invited / opened / signed / declined / timestamp. The boundary is publicly documented and third-party verifiable.
- **Related journeys:** J-007, J-008.

## AP-004 — MUST NOT make declining harder than signing

- **Why:** Asymmetric friction between accept and decline is a dark pattern. "Click to sign" versus "click decline, then explain in 200 characters, then confirm twice" is not a neutral interface.
- **Test:** Click and required-field count on the decline path equals the click and required-field count on the sign path. Decline produces a receipt with the same fidelity as a signature receipt.
- **Related journeys:** J-015, J-027.

## AP-005 — MUST NOT silently migrate an in-progress draft to a newer form version

- **Why:** Silent migration destroys the chain of custody of consent. The respondent attested to questions A/B/C; the system now has them on the hook for A'/B'/C'. In a regulated context this is a due-process violation, not a UX paper cut.
- **Test:** Every draft is bound to a form-version hash. Reopening a draft against a newer published version triggers a structured diff UI. The receipt carries both the version the human saw and the version the issuer accepted, and they reconcile.
- **Related journeys:** J-022.

## AP-006 — MUST NOT require account creation to read one's own signed record

- **Why:** Account walls in front of one's own attested record are a soft form of capture. Read-access to one's own signed bundle is a property right; authentication should be proportionate to write, not to read.
- **Test:** A receipt URL plus one possession factor (the original email, a printable code, biometric on the issuing device) opens the bundle without any account creation gate.
- **Related journeys:** J-009, J-019.

## AP-007 — MUST NOT penalize the AI-decline or lower-AI path with worse SLA, fewer features, or scarier copy

- **Why:** "You can opt out, but…" framing is opt-out theater. Coerced consent via degraded alternatives is a known dark pattern, and AI-assisted submissions becoming a downgrade flag in agency triage turns an accessibility feature into a class marker.
- **Test:** Parity audit on every branch — same fields, same fees, same SLA, same help text, same receipt. Differences are disclosed and justified. The receipt records *that* AI assistance occurred and per-field authorship lineage, but no aggregate "AI score" is exposed to the receiving agency.
- **Related journeys:** J-011, J-012.

## AP-008 — MUST NOT collect facts the issuing authority already holds

- **Why:** Re-keying ten data points the agency captured eleven months ago is the loudest signal that the back office is held together with string. It also invites transcription errors the respondent is then punished for downstream.
- **Test:** Authoritative-source prefill is the default where the legal basis exists; each prefilled value carries a provenance chip with source and date; the receipt distinguishes "agency-prefilled, not user-attested" from "user-attested."
- **Related journeys:** J-020.

## AP-009 — MUST NOT collapse multiple legal regimes into one upfront "I agree"

- **Why:** Wall-of-consent is a dark pattern wearing a compliance hat. One click cannot satisfy distinct legal regimes (e-sign disclosure, HIPAA acknowledgment, privacy notice, arbitration clause). The result is uninformed consent — the opposite of what the wall claims to provide.
- **Test:** Disclosures bind per-section or per-field at the moment they become relevant. The receipt records *which disclosures were presented and acknowledged at which step*, not a single boolean.
- **Related journeys:** J-015, J-017.

## AP-010 — MUST NOT trigger external actions without explicit per-action consent at the moment of the action

- **Why:** Hard credit pulls, agency referrals, mandatory reports, and SAR filings are externally-visible actions with real downstream consequences. A buried "by clicking Continue you authorize…" is consent in name only.
- **Test:** External-action gates are discrete consent moments, named on screen, at the moment of the action. Each produces a signed authorization receipt the respondent can later cite, dispute, or revoke.
- **Related journeys:** J-015, J-029.

## AP-011 — MUST NOT use cursive-font "type your name" as the signature affordance

- **Why:** Skeuomorphic cursive telegraphs that the institution treats signatures as UI flourishes rather than acts of consent. Even when the cryptography underneath is sound, the surface contradicts the substance and lowers the gravity of the act.
- **Test:** The signature surface names what the act actually is — a cryptographic operation tied to a verified identity at a verified time — and does not present a fake-handwriting render as if the glyph itself were the signature.
- **Related journeys:** J-008.

## AP-012 — MUST NOT send the respondent to a PDF as the answer to "fill this out"

- **Why:** The print-fill-scan-email loop produces unreadable scans, no validation, no audit trail, no accessibility, no mobile path, no agent path. It is the failure mode the entire category exists to eliminate, and yet half of "online forms" are still this.
- **Test:** Every published form is natively interactive. If a PDF artifact is needed for archive or legal-presentment reasons, it is *generated from* the structured submission; the receipt and bundle are the system of record, the PDF is a view.
- **Related journeys:** All respondent-facing journeys.

## AP-013 — MUST NOT use generic "something went wrong" error messages

- **Why:** Ambiguity between "I did something wrong" and "the system is broken" leaves respondents unable to act. The rational response is to retry, producing duplicates, double-charges, or wedged drafts.
- **Test:** Errors are typed (problem-JSON-shaped, per stack-common), map to plain-language guidance, distinguish filer-correctable from server-side, and carry a resolvable reference ID. "Something went wrong" never appears in the rendered UI.
- **Related journeys:** J-002, J-021.

## AP-014 — MUST NOT pretend coercion doesn't exist on high-stakes forms

- **Why:** A meaningful fraction of binding filings happen under duress — employees signing arbitration agreements at onboarding while HR watches, financial-abuse victims being made to sign loan applications, elders walked through benefits-redirects by predatory "helpers." A surface that has no representation of this reality becomes an instrument of the coercion.
- **Test:** Specific high-risk templates (financial POA, immigration sponsorship, benefits-redirect, advance directive, marriage/divorce) include an opt-in duress-channel primitive that is non-obvious to a shoulder-surfer and that does not halt the form in a way that tips off the coercer.
- **Related journeys:** J-008, J-012, J-028.

## AP-015 — MUST NOT time out a session in a way that discards work

- **Why:** Aggressive timeouts penalize the most diligent respondents — the ones reading carefully, composing narrative fields, or returning after stepping away for documents or grief. Discarded work is a second harm on top of whatever made the form hard in the first place.
- **Test:** Idle locks the view but never the data. Read-only states are timeout-immune. Any timeout that could discard data warns with enough lead to save and offers a one-click extend. Re-auth restores the exact cursor position and unsaved keystrokes.
- **Related journeys:** J-002.

## AP-016 — MUST NOT use trick phrasing, double negatives, or compound propositions in attestation fields

- **Why:** Adversarial intake weaponizes the form against the respondent. Trick phrasing converts wrong answers into legal liability the respondent didn't earn.
- **Test:** The authoring linter flags double negatives, compound propositions, and ambiguous quantifiers. Published forms ride with a plain-language conformance level. Respondents can flag any field as confusing; the signal feeds back to the authority.
- **Related journeys:** J-017.

## AP-017 — MUST NOT default to a single payment rail

- **Why:** Card-only payment is regressive. The population that most needs rights-impacting forms is the population least likely to have a credit card on file. Single-rail payment is a regressive filter dressed as a checkout flow.
- **Test:** Multiple payment rails with parity in user experience — ACH, card, prepaid, cash via retail partner (PayNearMe / MoneyGram), in-person at a counter. Receipt records the rail used; no rail produces a degraded SLA.
- **Related journeys:** J-019, J-032.

## AP-018 — MUST NOT ask for the same fact in three different fields under different names

- **Why:** Redundant capture invites inconsistency the respondent is then punished for downstream. It announces that the back office hasn't unified its data model and forces the user to pay the cost.
- **Test:** One canonical field per fact, with multiple downstream consumers shown ("this address is sent to: tax, DMV, voter registration"). Variants only when the *semantics* genuinely differ (mailing vs. residence vs. service-of-process), and the difference is explained.
- **Related journeys:** J-020.

## AP-019 — MUST NOT default to puzzle CAPTCHAs (drag-the-piece, identify-the-traffic-lights, audio puzzles as primary)

- **Why:** Puzzle CAPTCHAs are a regressive filter. They disproportionately reject disabled users, low-end-device users, shared-IP users, and anyone whose risk score is "high" for reasons they can't see. Determined adversaries bypass them with paid solving services anyway. The filter punishes humans and lets bots through.
- **Test:** Bot protection uses privacy-preserving attestation first (Apple Private Access Tokens, Cloudflare Turnstile non-interactive, WebAuthn user-present assertions). Puzzle challenges are last-resort and always accompanied by at least one accessible alternative (audio + visual + WebAuthn + magic-link-to-verified-email). The user is never trapped on a single inaccessible path.
- **Related journeys:** J-033, J-005.

## AP-020 — MUST NOT force a single identity provider when alternatives meet the required assurance level

- **Why:** Vendor lock-in dressed as security. Excludes users whose proofing history is with a different provider. Rewards the issuer's commercial relationship with the IdP over the user's existing trusted identity. Forces oversharing when one IdP demands scopes (contact list, profile, social graph) that have nothing to do with the form's actual need.
- **Test:** When more than one IdP can satisfy the assurance requirement, the hosting org's configured list presents all of them. Users can decline any IdP that overshares and still authenticate via another path. The form names which IdPs meet which assurance level and lets the user pick on that basis, not on which one the issuer prefers.
- **Related journeys:** J-032, J-034.

## AP-021 — MUST NOT use SMS OTP as the only second factor when phishing-resistant alternatives exist on the device

- **Why:** SMS is SIM-swappable. SMS is observable to a co-located coercer. SMS is tied to a phone number the user may not control after a divorce, a job loss, a move, or domestic abuse. WebAuthn / passkeys are mature, widely supported, and resist all of these. Forms that rest on real legal weight should authenticate at least as strongly as they sign.
- **Test:** Sign-in and signing offer a phishing-resistant option (passkey, security key) wherever the device supports it. SMS is a fallback, never the primary path. When the user enrolls a passkey, the system encourages it over SMS rather than the reverse.
- **Related journeys:** J-035, J-027.

## AP-022 — MUST NOT silently downgrade the assurance level

- **Why:** A form that declares "IAL2 required" but accepts an IAL1 session without saying so is lying about what the receipt represents. Downstream adjudication then proceeds on a falsely-stamped assurance claim. When the receipt is later challenged, the actual level matters; the requested level is irrelevant.
- **Test:** The form declares its required assurance level upfront. If the user's session can't meet it, the step-up is explicit, named, and reasoned ("you'll need to verify your ID — this takes about 5 minutes; here's why this form requires it"). The receipt records the *actual* assurance level at signing, never the requested level. A form whose receipt always reads "IAL2" regardless of the underlying session is broken.
- **Related journeys:** J-013, J-034.

## AP-023 — MUST NOT confuse "verified" with "true"

- **Why:** The platform can verify that a document was signed by a particular key, at a particular time, with a particular receipt. It cannot verify that the signer was truthful, sane, sober, uncoerced, or correct about the facts they attested. Marketing pressure pushes "verified" toward "trustworthy" — and that overclaim is what burns credibility in court, in journalism, and in audit. The verifier and the Trust Center must be precise about what verification actually means.
- **Test:** Read every public-facing claim the verifier or Trust Center makes. Replace "verified" with "we observed the following provenance facts." Does the claim still hold? If not, this AP fires. The verifier UI must distinguish *integrity* (bytes unchanged), *attribution* (this key signed it), *capacity* (the signer was acting in this role), and *truth* (the underlying facts are accurate). It can attest to the first three; it cannot attest to the fourth.
- **Related journeys:** J-006, J-007.

## AP-024 — MUST NOT train, evaluate, or improve models on respondent content without per-form, per-purpose, revocable consent

- **Why:** AI-native is a positioning bet for the regulated side of this product. The fastest way to forfeit that bet is to leak respondent content into training pipelines. Regulated respondents — asylum applicants, healthcare patients, finance applicants, custody petitioners — cannot tolerate even the *appearance* that "your answers improved our model." Once trust is forfeit here, no anti-Clippy discipline elsewhere can restore it.
- **Test:** For any respondent input — form answer, uploaded document, conversational AI exchange, library item — can the respondent name (a) the systems that touched it, (b) the purpose each touched it for, (c) the retention horizon, and (d) the revocation path? If any link is hand-wavy, this AP fires. Default is no training, no evaluation, no aggregation; consent is per-form, per-purpose, revocable; revocation triggers deletion or de-identification on a documented horizon.
- **Related journeys:** J-011, J-035, J-042.

## AP-025 — MUST NOT collapse "no answer," "declined," "not applicable," "unknown," and "never shown" into a single null

- **Why:** Regulated regimes distinguish these states. A null on a benefits form that means "I declined to answer" is legally different from a null that means "this question wasn't shown to me" which is different from "not applicable to my situation" which is different from "I don't know." Silently collapsing them is a small lie that compounds into denied benefits, immigration adjudications based on phantom answers, and insurance underwriting decisions on inferred values the respondent never made.
- **Test:** For every nullable field in a receipt or submission, can a reader tell which of {answered-no, declined-to-answer, not-applicable, unknown, never-shown-to-respondent} produced the null? If not, this AP fires. The form captures the *kind* of null, not just the absence of a value.
- **Related journeys:** J-017.
- **Note:** This is FEL's null-propagation discipline surfacing at the UI layer — same idea, different surface, and a defensible product differentiator.

---

# Journeys

## J-001 — First impression: "Is this legitimate, and can I trust it for the next ten minutes?"

- **Who:** Anyone clicking a form link they were sent — applicant, signer, recipient. Could be a working parent, a small landlord, an asylum applicant on a borrowed phone.
- **What they want:** On first paint, see something that *looks* legitimate — sender's brand front and center, platform brand subordinate; a clear statement of who's asking and why; no popups, no dark patterns, no "verify your humanity" gauntlet before they've seen the form.
- **Why it matters:** Trust on first paint is the whole product. If the first 200ms feel sketchy, every later design decision is wasted. People who bounce here don't come back, and they tell the sender "just email me a PDF."
- **What "done" looks like:** The form feels like the sender's form, not a third party's. The legitimacy signal — who, what for, how long — is visible above the fold without scrolling.
- **Feel:** Calm, unremarkable, trustworthy.
- **Anti-patterns:** AP-012.
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup, cross-repo archive)*.
- **Backs:** (TBD — server backlink not yet cross-referenced)
- **Status:** *open*

## J-002 — Respondent fills out a form, recovers from validation, and never loses work

- **Who:** Respondent on any device — phone on a bus, library computer with a 20-minute timer, laptop at the kitchen table over multiple evenings.
- **What they want:** Answers survive — a dropped connection, a crashed tab, a closed browser, a switch to a different device, an emailed magic-link resume the next day. Validation errors appear inline, explain themselves in human terms including cross-field contradictions, focus jumps to the broken field, and screen readers announce them. No "your session has expired."
- **Why it matters:** Lost form-fill work is the single most enraging UX failure. Account-walls at minute 3 are the #1 abandonment cause on long forms. Mobile users *will* lose tabs; the form must assume hostile conditions and treat the draft as a first-class object before identity is.
- **What "done" looks like:** Open the link, fill some, navigate away, return tomorrow on a different device — every answer is there, on the same field. Hit submit, get a cross-field error in plain English ("Your dependent's birthdate makes them 19, but you claimed them as a child under 17. Either the birthdate is wrong, or the dependency category should change."), fix it in seconds, submit cleanly.
- **Feel:** Trusted. Respected.
- **Anti-patterns:** AP-001, AP-013, AP-015.
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup)*.
- **Backs:** [RSP-002](../formspec-server/JOURNEYS.md#rsp-002), [RSP-003](../formspec-server/JOURNEYS.md#rsp-003), [RSP-012](../formspec-server/JOURNEYS.md#rsp-012).
- **Status:** *in design*

## J-003 — "Why is the form asking me this now? Oh — because of what I said earlier."

- **Who:** Anyone filling out a form where early answers reshape later questions: permits, insurance quotes, triage intakes, benefits, grants.
- **What they want:** See only what's relevant to them. No skipping past "if not applicable, leave blank." No surprise sections. If an earlier answer reroutes the form, a clear diff: what was cleared, what was kept, what's new.
- **Why it matters:** Irrelevant questions read as suspicion or incompetence. Silent branch changes destroy trust in the result.
- **What "done" looks like:** When a new section appears, a one-line "showing because…" tells the respondent why. When an answer is revised, a diff banner reads "These 4 questions no longer apply and were cleared. These 11 still apply and were kept. These 3 are new — please answer."
- **Feel:** Considered. The form feels designed for them specifically.
- **Anti-patterns:** —
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-004 — Filling it out on a phone, one-handed, on the bus

- **Who:** Anyone, but especially parents, commuters, shift workers, and respondents without a laptop.
- **What they want:** Tap-sized targets. The right keyboard for the right field. No pinch-zoom. No surprise modals. Primary buttons reachable with the thumb.
- **Why it matters:** Most respondents are on phones; most phone use is one-handed. A form that ignores this loses people who would have finished. They never tell the sender why.
- **What "done" looks like:** Numeric keypad for numbers. Date wheel for dates. Continue button where the thumb is. The form was made for the phone first, not adapted from desktop.
- **Feel:** The product met the respondent where they actually are.
- **Anti-patterns:** —
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup — responsive baseline)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-005 — "I use a screen reader. I have low vision. My hands shake. The form needs to work."

- **Who:** A blind respondent on NVDA / JAWS / VoiceOver. A low-vision respondent using zoom. A respondent navigating by keyboard because tremor makes a mouse unreliable. An older respondent whose hand isn't steady on small targets.
- **What they want:** Every field labeled aloud. Every required field announced as required. Errors read out the moment they appear, with a way to jump straight to the broken field. Tab order matching reading order. No mystery icons. Plain-language mode with inline glosses of legal terms.
- **Why it matters:** Accessibility on a public regulated surface is not a checkbox; it is the population the form is supposed to serve. The 2026 WebAIM Million report puts WCAG-2 failure rates above 95% across the top million sites.
- **What "done" looks like:** The respondent finishes their benefits renewal alone, without sighted help, on whatever assistive tech they already trust.
- **Feel:** Respected. Independent. Not patronized.
- **Anti-patterns:** —
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup — a11y instrumentation to land in FW-0007)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-006 — Evaluator (procurement) browses Trust Center pre-purchase

- **Who:** Procurement reviewer evaluating whether to buy.
- **What they want:** Find data flow, capability matrix, subprocessors, and selective-proof artifacts without contacting sales.
- **Why it matters:** Self-service procurement is the modern buyer expectation. If the Trust Center is shallow or sales-gated, the evaluation stops and the buyer moves on.
- **What "done" looks like:** Trust Center is browseable without sign-in; data-flow diagram, capability matrix, subprocessor list, and selective-proof artifacts are all linked from a single index.
- **Feel:** Respected — Formspec trusts me to evaluate them on my own.
- **Anti-patterns:** —
- **Surfaces:** [trust-center](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-center.html) *(mockup)*, [trust-data-flow](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-data-flow.html) *(mockup)*, [trust-matrix](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-matrix.html) *(mockup)*, [trust-subprocessors](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/trust-subprocessors.html) *(mockup)*.
- **Backs:** `(none — public marketing surface family)`.
- **Note:** Marketing-flavored pages may ultimately land in [`../formspec-site/`](../formspec-site/). The verifier widget stays here. Allocation: web ADR-0002 (pending).
- **Status:** *open*

## J-007 — Evaluator (verifier) validates a receipt — without an account, without trusting us

- **Who:** Auditor, opposing counsel, county clerk, journalist, future tenant's prospective landlord, the signer's own lawyer five years later, the signer themselves after losing the email. Crucially: someone who doesn't trust the sender and shouldn't have to.
- **What they want:** Paste in the file, drag-drop the receipt, or follow a link from a signed document. See plainly: who signed, when, what they signed (verbatim), whether anything has been changed since, and the chain of custody. No login. No account. No tracking. Works offline against a downloaded receipt.
- **Why it matters:** This is the load-bearing trust surface. If verification requires an account on our platform, it's not verification — it's vendor lock-in dressed up as trust. The platform's credibility is decided on a page used by people who didn't choose this platform.
- **What "done" looks like:** Drop file, see green check, see signer name and time, see nothing has been changed, explain it to a boss in one sentence. Optionally drill into the cryptographic primitives if curious.
- **Feel:** Suspicious-but-convinced. The page lets the skeptic stay skeptical while still arriving at certainty.
- **Anti-patterns:** AP-003, AP-006.
- **Surfaces:** [verifier](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/verifier.html) *(mockup)*, [selective-proof](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/selective-proof.html) *(mockup)*, [receipt](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/receipt.html) *(mockup)*.
- **Backs:** [SIG-004](../formspec-server/JOURNEYS.md#sig-004), [RSP-005](../formspec-server/JOURNEYS.md#rsp-005).
- **Note:** **Single positioning bet** for the open-source reference UI. Treat any verifier-surface decision as high-stakes.
- **Status:** *open*

## J-008 — "Sign here. But first, show me exactly what I'm signing."

- **Who:** A new tenant, an employee on day one, a patient consenting to treatment, a parent authorizing a school trip, a contractor signing a lien waiver, an immigration applicant filing a notice of appeal from a bus.
- **What they want:** Before commit, see a rendered, frozen, scrollable view of the *exact bytes that will be hashed and signed*. Each signature field is a deliberate act, not a side effect. Identity confirmation and explicit intent capture happen before signature, not buried in a footer.
- **Why it matters:** A signature obtained without comprehension is a signature that gets repudiated. WYSIWYS — *what you see is what you sign* — is the principle behind digital signatures; most products violate it casually.
- **What "done" looks like:** Final rendering, every value visible, hash shown. Scroll to the bottom to enable sign. Each signature field requires its own affirmative action. After signing, the receipt includes that same rendering verbatim and the identity step's outcome.
- **Feel:** Sober. Deliberate. Not rushed.
- **Anti-patterns:** AP-002, AP-003, AP-011, AP-014.
- **Surfaces:** [signature-ceremony](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/signature-ceremony.html) *(mockup)*, [certificate](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/certificate.html) *(mockup)*.
- **Backs:** [SIG-002](../formspec-server/JOURNEYS.md#sig-002), [SIG-005](../formspec-server/JOURNEYS.md#sig-005).
- **Status:** *open*

## J-009 — The receipt is an object I own — and I can prove this years later

- **Who:** Anyone who just hit "Finish Signing." Or anyone five years later when a dispute starts, an audit lands, or a debt collector produces a contract they claim was signed.
- **What they want:** A receipt delivered now (downloadable PDF + a separate cryptographic artifact), retrievable later without needing an account, verifiable on a public verifier without our company existing. A complete activity log if audited — when they started, what they answered, what they changed, what version they signed, when they submitted — exportable as signed JSON and PDF.
- **Why it matters:** A receipt that only verifies on the issuer's site is theater. Survivability of the artifact independent of vendor is the deepest promise the platform can make.
- **What "done" looks like:** Email arrives with the signed document and a one-page human-readable receipt. A long-lived link works five years later. The verifier accepts the receipt and renders the same claim graph. The auditor verifies independently and moves on.
- **Feel:** Reassured at signing time. Vindicated years later.
- **Anti-patterns:** AP-006.
- **Surfaces:** [receipt](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/receipt.html) *(mockup)*, [certificate](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/certificate.html) *(mockup)*.
- **Backs:** [SIG-004](../formspec-server/JOURNEYS.md#sig-004), [RSP-005](../formspec-server/JOURNEYS.md#rsp-005).
- **Status:** *open*

## J-010 — "Translate this form into my language without bending the legal meaning"

- **Who:** A naturalization applicant whose third language is English. A worker filing a wage complaint in their primary language. A Canadian respondent on a bilingual municipal form. Anyone composing a narrative field (incident description, asylum claim, civil-rights complaint) in their native language while reviewers read only English.
- **What they want:** Read the form, help text, and attestation language in their language — with a clear marker showing the legally controlling text. The respondent's authored text preserved verbatim, with translation attached and attributed (filer-provided, machine, certified human). A bilingual receipt the receiving agency accepts. Multi-script name capture.
- **Why it matters:** Bad translation of legal forms is how people accidentally commit perjury. The "Full Legal Name" field is American provincialism; names in multiple scripts are reality. Machine-translating silently on capture is worse than not translating, because reviewers then adjudicate on the translation as if it were the respondent's words.
- **What "done" looks like:** Language toggle on the form. Side-by-side legal text where it matters. Labels read the right way for where they appear — a short version in sidebars and on phones, a full version on the main surface, same meaning, contextually appropriate. When a phrase hasn't been translated yet, the form falls back to a closely related dialect rather than silently dropping to English, and tells the respondent when that happened for anything legally consequential. The agency accepts the bilingual filing.
- **Feel:** Cautious dignity. The respondent isn't asked to pretend their English is better than it is.
- **Anti-patterns:** —
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup — i18n layer designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-011 — "Talk me through it like a person would"

- **Who:** A 71-year-old veteran applying for disability benefits, not a form person. A first-time applicant overwhelmed by program acronyms who can describe their situation in plain English but not navigate field grids.
- **What they want:** A conversational front-end that asks one question at a time, in plain language, and fills out the underlying form behind the scenes. An intake assistant that triages — *"this looks like Program X plus a medical attestation; I'll walk you through it"* — and only then enters the form proper. The conversation produces the same validated, branched, submitted, signed form an expert user would have produced manually.
- **Why it matters:** The form UI serves people comfortable with forms. The conversational layer serves everyone else. Without it, the platform recapitulates the bureaucracy it's supposed to replace.
- **What "done" looks like:** Three sentences in, the assistant has identified the right form bundle. The respondent answers one question at a time and reaches submission without ever seeing a field grid. Receipt names that AI assistance occurred and records per-field authorship lineage; *what gets submitted* reads as the human's, not the AI's.
- **Feel:** Like calling a knowledgeable cousin who's done this before.
- **Anti-patterns:** AP-007.
- **Surfaces:** *(no archive mockup — surface designed from scratch when implementation lands; same underlying form definition as J-002)*.
- **Backs:** (TBD)
- **Note:** Conversational mode is not a separate product; it is a different rendering of the same form definition. Anti-Clippy constraints from web CLAUDE.md apply.
- **Status:** *open*

## J-012 — "I'm filing this for someone else — or as a non-human agent — and the receipt must say so"

- **Who:** An adult daughter with power of attorney signing a hospice admission for her parent with dementia. An executor filing the final tax return of a deceased parent. A paralegal filing for a client. A social worker helping an applicant. A licensed physician signing a prescription. A corporate officer signing on behalf of an entity. An automated AI agent submitting a procurement form on behalf of a compliance team.
- **What they want:** A clear "filing or signing on behalf of someone else" mode with documented authority (POA, guardianship, letters testamentary, professional license, corporate resolution, machine-operator chain). Signatures recorded against the correct party. The receipt distinguishes filer ≠ signer ≠ subject — and for the non-human case, names the agent, the operator, the human accountable, and the scope of authority.
- **Why it matters:** Most form products silently treat the typer as the signer. For families, caregivers, paralegals, social workers, licensed professionals, corporate signers, *and the next decade of AI agents*, this is wrong and dangerous. Signing as the principal is fraud; signing as oneself without role capture invalidates the filing. Authority is a first-class field, not a checkbox.
- **What "done" looks like:** "Filing on behalf of" toggle at start. Capacity field is structured (POA / executor / guardian / parent / licensed-professional / corporate-officer / AI-agent). Authority artifact attached (POA document, court order, license, corporate resolution, machine-delegation token). Receipt names every role. For decedent filings, no liveness check on the subject. For AI-agent filings, the verifier displays the four-party chain (agent → operator → accountable human → scope).
- **Feel:** Carrying weight for two parties, knowing the system understands the distinction.
- **Anti-patterns:** AP-014.
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup — preparer-mode designed from scratch)*; [signature-ceremony](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/signature-ceremony.html) *(mockup — role-distinguished signature)*.
- **Backs:** (TBD)
- **Note:** Filer ≠ signer ≠ subject is a three-role (four with the non-human agent, sometimes five with the licensing authority) distinction most products collapse. PKAF authority-chain vocabulary is the underlying model. The decedent case is a worked example with its own grammar: no liveness check on the subject, authority document required, generated text reads "the estate of…".
- **Status:** *open*

## J-013 — "Don't make me re-prove who I am every time"

- **Who:** An elderly Medicaid applicant working with her social worker over three sessions. A returning respondent on a multi-stage filing. A signer mid-ceremony who already passed an ID check in session 1. A professional whose verifiable credential wallet can present the required attributes without re-uploading a license.
- **What they want:** Verify identity once at the level the form requires. Carry that verification across sessions and across this respondent's other interactions with the issuer. Step up only when the next field requires a higher assurance level than the current session has. Where a verifiable-credential wallet can present the needed attributes (W3C VC / OpenID4VP-shaped), accept the presentation rather than demand a new document upload.
- **Why it matters:** Each repeated identity step is a chance to make an error, get locked out, or give up. Most regulated portals treat identity as a binary "logged in" rather than a measured assurance level. Real regulated workflows need both. Re-uploading the same diploma to seven agencies widens the breach surface for no benefit.
- **What "done" looks like:** Identity verified at session 1. Sessions 2 and 3 show "identity confirmed [date], expires [date]." No re-verification unless the next field's assurance requirement exceeds the current level. Where a credential wallet is present, the form requests the specific attribute and the wallet selectively discloses only what's needed.
- **Feel:** "They remember me — without being creepy about it."
- **Anti-patterns:** AP-020, AP-022.
- **Surfaces:** *(no archive mockup — surface designed from scratch)*; touches [auth](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/auth.html) *(mockup)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-014 — "Let me share this draft with my lawyer mid-flight"

- **Who:** A respondent filing a wrongful-termination complaint, an asylum applicant, a small business owner submitting a regulated filing — anyone who wants a knowledgeable second pair of eyes before submission.
- **What they want:** Send a link that lets a trusted reviewer (lawyer, accountant, advocate, family member) see the live draft, leave field-level comments, and suggest edits — without that reviewer creating an account and without the respondent handing over a login. Reviewer role is structurally distinct from signer role.
- **Why it matters:** Today respondents screenshot every page and email them. The screenshots lose branching context, lose help-text, and create a discoverable email trail. Collaboration on legal forms is the unbuilt market.
- **What "done" looks like:** "Share for review" → magic-link to reviewer → reviewer sees the live form, leaves field-anchored comments, the draft updates in place, the comment thread is visible per field, the respondent decides what to accept. Bundle carries reviewer attestations without granting them signing authority.
- **Feel:** Like a Google Doc, but the doc is a legal instrument.
- **Anti-patterns:** —
- **Surfaces:** *(no archive mockup — surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-015 — "Show me the consequences before I submit — including what becomes irreversible"

- **Who:** A respondent about to submit an asylum-application support letter, a tax-credit filing, a benefits claim, a workers' comp form, a refinance application — any one-way door. Anyone at a step that triggers a hard credit pull, an agency referral, a payment, or a benefit waiver that can't be unelected.
- **What they want:** Before hitting submit, a clear summary that reads like a flight itinerary: who receives this, what it triggers, what deadlines now apply, what fields lock, what remains editable, what changes can't be undone. Irreversible steps named explicitly in plain language. Per-action consent at the moment external actions fire — credit pulls, cross-agency referrals, mandatory reports, payment processing.
- **Why it matters:** "Submit" on a regulated form is often irreversible. The category is full of one-way doors disguised as Next buttons. Hidden authorizations for hard credit pulls or agency referrals are consent in name only.
- **What "done" looks like:** Pre-submit screen names the receiving agency, the response window, the case ID, the locked vs editable fields. Each external action is a discrete consent moment producing its own signed authorization receipt. Irreversibility tag on the step triggers a deliberate confirm rather than a single click.
- **Feel:** Informed. Calm. Submit is a contract handoff, not a transition.
- **Anti-patterns:** AP-004, AP-009, AP-010.
- **Surfaces:** *(no archive mockup — surface designed from scratch as a pre-submit gate)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-016 — "Let me amend if I made a mistake — or withdraw if I changed my mind"

- **Who:** A respondent who transposed two digits on their SSN ten minutes after submission. A tenant who signed a renewal addendum at 11pm and woke up regretting it. A whistleblower who filed a complaint and wants to retract before review. A petitioner who signed a form they now believe was deceptive. Anyone with a consent that the underlying law makes revocable (GDPR, HIPAA, BIPA, CCPA).
- **What they want:** A clear, time-bounded amendment path. The receipt itself names the withdrawal window if one exists. Retraction is a new signed event that supersedes the prior, not a delete. Disputes against the signed form can be attached by the signer, signed by them, undeletable by the counterparty. A standing portal where I can see every consent I've granted and revoke the revocable ones.
- **Why it matters:** A signature with no honest withdrawal story is coercive design. Submission is a one-way door, but a humane system has a small reversal window for clerical errors. The signer is a stakeholder in the long life of the receipt. Consent that can't be withdrawn isn't consent.
- **What "done" looks like:** "Amend submission" available for the window the receiving agency allows. Amendment chains, never overwrites. Retractions land as new events on the same chain. Signer-side dispute notes attach to the receipt with their own signature. Revoking a revocable consent triggers a structured notification to the sender with a regulatory clock.
- **Feel:** Forgiveness, formalized. "I have options" replacing panic.
- **Anti-patterns:** —
- **Surfaces:** *(no archive mockup — surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-017 — "Tell me why you're asking — for every sensitive field, with citation"

- **Who:** A hardship-grant applicant being asked for bank statements who's been burned before. A patient on a medical intake suspicious of why the form needs an SSN. A naturalization applicant asked for their mother's maiden name. A skeptical KYC subject who wants to see the actual regulation that drives the question.
- **What they want:** A one-line, plain-English "why" attached to every sensitive field. What the question is for. Who sees the answer. How long it's kept. And, where the question is mandatory, a citation to the specific rule, statute, or institutional policy at the version in effect for this filing date.
- **Why it matters:** Silence on a sensitive field reads as a trap. "Because we have to" is corrosive; "Because 31 CFR 1020.220(a)(2)(ii) requires us to collect this for customer identification" is verifiable, contestable, and respects the respondent as a citizen. Field-level citation is also how the form proves it hasn't drifted from the underlying law.
- **What "done" looks like:** Each sensitive field carries a one-line purpose plus a structured purpose tag (reporting / eligibility / pricing / sharing). Mandatory fields carry an authority citation that opens the actual rule text. Respondents can flag any field as confusing or contested; the signal feeds back to the authority. The receipt records which disclosures were presented to the respondent.
- **Feel:** Wary turning into cautious cooperation.
- **Anti-patterns:** AP-009, AP-016.
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup — inline microcopy)*.
- **Backs:** (TBD)
- **Note:** PKAF authority-chain vocabulary is the underlying model. Field-level citation is the consumer surface of the policy-knowledge layer.
- **Status:** *open*

## J-018 — "I'm filling this out on a site I came to for something else"

- **Who:** A visitor to a small business, a nonprofit, a city department, or a clinic website who encounters a form embedded in the page.
- **What they want:** The form feels like the host's form. No redirect to a third-party URL. No "powered by" chrome demanding attention. No surprise sign-in to anyone's account. The host's site doesn't break around the form.
- **Why it matters:** Browser changes to cookie and referrer policy have made naive iframes brittle. Respondents read iframe chrome as "this host couldn't be bothered to build it." Trust on a legal-aid or nonprofit portal flows through the host's brand, not ours.
- **What "done" looks like:** Filled out on the host's page, never left, got the confirmation from the host, never noticed there was a platform behind it. Receipt names the host as issuer; verifier remains public and provider-neutral.
- **Feel:** Seamless. Native. The host's reputation extends to the form without dilution.
- **Anti-patterns:** —
- **Surfaces:** *(no archive mockup — embed surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-019 — "I'm on a public library terminal with twenty minutes and no email"

- **Who:** An unhoused job applicant. An elderly respondent without a personal inbox. A worker between jobs whose phone plan lapsed. Anyone the surface's defaults are hostile to.
- **What they want:** Submit, receive a receipt via a channel they actually control (SMS, printable confirmation with a short verifier code, one-time-download link). Sign out and leave nothing behind on the machine. No autofill memory. No browser session that the next library user inherits.
- **Why it matters:** "Where do we send the confirmation?" is a class question disguised as a UX question. Email-as-identity assumes a class of person. Public-terminal hygiene is an accessibility feature. The benefit form is *for* exactly the people the form's defaults exclude.
- **What "done" looks like:** Submission complete. SMS or printable receipt in hand with a verifier code. Browser session wiped. Walked out with proof.
- **Feel:** Practiced at being temporary, finally met by a system that respected it.
- **Anti-patterns:** AP-001, AP-006, AP-017.
- **Surfaces:** *(no archive mockup — alternate-delivery surfaces designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-020 — "Stop pretending you don't already know this — and show me where every prefilled value came from"

- **Who:** A returning filer whose information the agency already holds. A new filer whose data the system inferred from a sibling product or a connected wallet. Anyone who notices the form has pre-populated their employer, address, or household size from "context."
- **What they want:** Authoritative prefill where the legal basis exists, with every prefilled value carrying a visible provenance chip — "from your 2025 filing," "from DMV record verified 2026-03," "from your connected credential wallet." One-click confirm-all; per-field correct-and-explain. Silent autofill is forbidden.
- **Why it matters:** Re-keying data the agency already holds is the single largest source of transcription error in regulated filings — and the loudest signal the back office is held together with string. But unannotated prefill is worse: silent autofill launders provenance, and the respondent signs something they didn't author. The right answer is prefill *with provenance*, both directions visible.
- **What "done" looks like:** Each prefilled value shows source and date; unconfirmed prefills are not submittable; one canonical field per fact (the same address isn't asked three times under three names); the receipt distinguishes agency-prefilled values from user-attested ones. When more than a few values are proposed at once — from a prior filing, from an assistant, from a connected wallet — the respondent sees all of them in a preview before any of them apply, and accepts or rejects each individually. Nothing lands silently.
- **Feel:** Recognized, not surveilled. "Oh — it told me where that came from, and asked before filling it in."
- **Anti-patterns:** AP-001, AP-008, AP-018.
- **Surfaces:** [respondent-form](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/respondent-form.html) *(mockup — provenance chip designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-021 — "I hit submit. Where is it now, and what do I owe next?"

- **Who:** Any respondent in the post-submit gap — the form is gone, the page says "thank you," and they have no idea what's happening on the other side. Especially: someone applying for asylum waiting for a hearing date, a permit applicant tracking review, a benefits applicant waiting on eligibility, a signer of a recurring-payment authorization who doesn't know when they'll be charged.
- **What they want:** A real status surface: queued, under review by which unit, decision drafted, issued — with realistic time estimates from actual recent throughput, not optimistic SLAs. Explicit "who reads this" disclosure: automated screen vs. human reviewer. Notification preferences default to event-driven (no marketing, no engagement dumps). Post-submission obligations rendered as a timeline: deadlines, things the respondent must do, things the agency will do, calendar export.
- **Why it matters:** The post-submit gap is where respondent trust evaporates and call-center load explodes. "Where is it?" is the single most common inbound question. A form product that ends at submit has solved 60% of the problem and left the painful 40% on the floor. For high-anxiety filings (asylum, benefits), opaque silence is worse than no application.
- **What "done" looks like:** Every submission has a status surface re-checkable without account creation (magic link or OTP). Status transitions are structured. Each notification names the event, the source, the new state, and the next action. The respondent knows the difference between "received" and "actually moving."
- **Feel:** Reassured momentum. Package tracking, not "your call is important to us."
- **Anti-patterns:** AP-006, AP-013.
- **Surfaces:** *(no archive mockup — status surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-022 — "The form changed underneath me while I was in it — show me the diff or leave my version alone"

- **Who:** A grant applicant who started the form Monday and came back Friday. A returning filer noticing a field is phrased differently this year. A signer who started reviewing yesterday, got interrupted, and came back today to a different document.
- **What they want:** The draft is pinned to the version they started on. If the issuer publishes a newer version, the system surfaces a structured diff — what fields were added, what was removed, what was reworded, what validation changed — with the issuer's stated rationale. The respondent chooses: continue on v1.4 until it expires, or migrate to v1.5 (and their answers are re-validated).
- **Why it matters:** Silent migration destroys the chain of consent. The respondent attested to one set of questions and is bound by a different set. Mid-draft version drift is the silent killer of complex filings — the user finishes a flow that no longer matches the published rules, the back office rejects it without explanation, the user has no idea why. Forms are policy in disguise; silently reworded forms are silently reworded policy.
- **What "done" looks like:** Per-draft form-version pin. A "what changed since your last submission" view for repeat filers, drawn from a public signed changelog. Receipt records the form version submitted under, content-addressed.
- **Feel:** Treated like a participant, not a row. A long-running software install that knows it's a long-running install, not a webpage that resets when you reload.
- **Anti-patterns:** AP-005.
- **Surfaces:** *(no archive mockup — surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-023 — "Show me the math — for every calculated field"

- **Who:** A respondent staring at a calculated field — tax owed, premium, benefit amount, support obligation, eligibility score, dependency-adjusted credit. A landlord filing a rent-stabilization registration where the form quietly knows their entered rent is an outlier for the building.
- **What they want:** A "show calculation" affordance on every derived field that opens the *actual* derivation tree — these inputs, this rule, this version, this result. Outlier nudges that are informational, not blocking, and let the respondent attach an anticipatory explanation.
- **Why it matters:** Calculated outputs are the highest-stakes part of most regulated forms and the part respondents have zero ability to challenge if it's a black box. A wrong calculation propagates downstream and the respondent carries the cost. "Show the math" is also the audit defense for the issuer when the respondent disputes. This is the single most defensible thing FEL + Formspec can do that a free-text form-builder cannot.
- **What "done" looks like:** Every derived field renders with a disclosure showing input dependencies, rule applied with version, and result. Disclosure is part of the receipt, not just the UI. Forward-projected constraints surface as inline foresight cards ("choosing this here will prevent you from also claiming X later").
- **Feel:** A form that thinks ahead with the respondent.
- **Anti-patterns:** —
- **Surfaces:** *(no archive mockup — surface designed from scratch; depends on FEL dependency-tracking)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-024 — "Tell me up front how long this will actually take, and what I need ready"

- **Who:** A respondent landing on a form deciding whether to start now or come back later. A small-business owner deciding whether to file the permit themselves or pay $400 to a paralegal. A first-time filer with no idea what "good" looks like.
- **What they want:** A truthful upfront time estimate — not "5 minutes" theater, but real numbers from actual recent completion times. A required-document checklist with expected acquisition time. The total cost — base fee, surcharges, expedite, card processing, notary — visible at the start and pinned, updating live with answers and showing why. Optional: a redacted, annotated exemplar of a completed filing. Optional: a sandbox / practice mode that runs the full logic without submitting.
- **Why it matters:** Filer underestimates kill completion rates and trust simultaneously. "This will take 5 minutes" followed by 90 minutes of forms produces a worse outcome than "this will take 60-90 minutes, here's what you need ready." Hidden fees revealed at checkout double the trust cost when the seller is the government. Most abandonments aren't from form length; they're from "oh I need my W-2 and I don't have it on me."
- **What "done" looks like:** Trail-sign cover page: median completion time, 90th-percentile time, required documents with expected acquisition windows, total cost itemized and live. Optional "see a completed example" and "try it without submitting" affordances.
- **Feel:** A trail sign at a trailhead. Distance, elevation, what to bring.
- **Anti-patterns:** —
- **Surfaces:** *(no archive mockup — cover surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-025 — "Don't perform cheerfulness when I'm doing the hardest paperwork of my life"

- **Who:** A grieving relative filing a death benefit / estate / final tax return. An asylum applicant. A domestic-violence survivor filing a restraining order. A whistleblower filing a complaint. A parent filing a child-protection report. Anyone whose paperwork is the artifact of a crisis.
- **What they want:** The form to *not flinch*. No "welcome back!" copy. No progress confetti. No "you're almost done!" hype. No emoji. The death-context or hardship-context surfaced once at top, never re-asked, propagated to every downstream "as of" field. Pronouns and tense adjusted ("the estate of…"). Crisp, dignified, present-tense neutral.
- **Why it matters:** Bereavement, crisis, and trauma are the contexts of the hardest paperwork a normal person ever does. A form that adopts SaaS-cheerful voice in this state is a categorical insult — and the respondent will remember it forever. They'll also tell their family.
- **What "done" looks like:** A form-level context banner ("estate of X," "emergency claim," "protective order petition"). Tone-suppressed chrome — no emoji, no exclamation, no streaks. Generated text reads with the appropriate weight. The receipt reads in the same register.
- **Feel:** A funeral director's intake desk. Quiet. Competent. Does not waste your time and does not pretend this is fun.
- **Anti-patterns:** AP-014.
- **Surfaces:** *(no archive mockup — surface designed from scratch; form-level tone setting)*.
- **Backs:** (TBD)
- **Note:** Highest-leverage tone test in the product. If the form behaves correctly here, it will behave correctly everywhere. Most builders never test this state because their demo data is always a living adult applying for themselves.
- **Status:** *open*

## J-026 — "Refusing must be as easy as accepting"

- **Who:** Any respondent who wants to say no — to the form, to a clause, to receiving the request at all. Especially: someone repeatedly sent harassment-shaped signature requests by an ex-spouse, an employee declining an arbitration clause at onboarding, a tenant counter-offering on a lease term.
- **What they want:** The decline path requires no more clicks or fields than the accept path. Per-clause decline-with-reason on documents that permit it (creating a counter-offer state the sender must affirmatively accept). Platform-level refusal of senders ("I do not consent to receive signature requests from this sender") that is honored at the platform layer, not just by ignoring emails.
- **Why it matters:** Asymmetric friction is coercive. The "you can opt out, but…" framing is a known dark pattern. Signing platforms can be vectors for harassment; the platform must be accountable for who it lets contact the respondent, not just for what happens once contacted.
- **What "done" looks like:** Click and field count parity audited and published. Decline produces a receipt with the same fidelity as a signature. Per-clause strike-with-reason creates a counter-offer; sender must accept, counter, or refuse. Platform-layer sender block; harassment-pattern detection across senders.
- **Feel:** "No" is a real option, not a gauntlet.
- **Anti-patterns:** AP-004.
- **Surfaces:** *(no archive mockup — decline-path surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-027 — "When I'm being coerced, give me a back channel that doesn't tip off the coercer"

- **Who:** An employee handed a tablet at the end of their shift to sign a new arbitration clause while a supervisor watches. A financial-abuse victim being made to sign a loan application. A trafficking victim filing immigration paperwork under a handler's direction. An elder walked through a benefits-redirect by a predatory "helper." A tenant signing a renewal in the landlord's office.
- **What they want:** A coercion-aware signing flow. The option to take the document home, sign privately, with a minimum cool-off window the sender cannot disable. A discreet, non-obvious duress affordance — a duress code, a hidden "I am not filling this freely" signal, a routing to victim-services — that doesn't tip off a coercer watching the screen and that doesn't halt the form in a way that tips them off either.
- **Why it matters:** A meaningful percentage of high-stakes filings happen under duress. The category's standard response is to ignore this and pretend every signature is freely given, which makes the form an instrument of the coercion. A product that owns the rights-impacting filing space cannot ignore this and claim moral standing.
- **What "done" looks like:** Specific high-risk templates (financial POA, immigration sponsorship, benefits-redirect, advance directive, marriage / divorce) include an opt-in duress-channel primitive defined at the form-template level. Activation is non-visible to a shoulder-surfer. Activation routes to issuer-defined victim-services without halting the form. The activation is recorded in the submission's private audit trail, not the public receipt. Receipts also record whether the signature was completed under observation or in a private session.
- **Feel:** A bank teller's silent alarm. The robber doesn't know it fired. The system is on the respondent's side when the room isn't.
- **Anti-patterns:** AP-014, AP-021.
- **Surfaces:** *(no archive mockup — surface designed from scratch with extreme care)*.
- **Backs:** (TBD)
- **Note:** The hardest journey in the corpus and the one most builders refuse to engage. It is also the one that distinguishes a serious rights-impacting form platform from a fancier Jotform. The threat model is real, the population is real, and the primitive — a hidden, structured, form-level signal that the submission may not be freely given — is small. The cowardly move is to call it out-of-scope.
- **Planning (2026-05-26):** [FW-0048](../PLANNING.md) design row and stack-root [ADR-0156](../../../thoughts/adr/0156-coercion-aware-signing-pipeline.md) withdrawn — the particular design framing retired, not the person-need. Re-file from observed adopter requirements.
- **Status:** *open*

## J-028 — "Warn me before my answer triggers a referral to a different agency"

- **Who:** Anyone whose answer to a specific question will, by law, generate a referral to child welfare, immigration enforcement, licensing discipline, law enforcement, or another regulatory body. Anyone whose form will trigger a hard credit pull, a SAR filing, or a mandatory reporter notification.
- **What they want:** A pre-commit disclosure on triggering fields: "Selecting this will generate a report to [agency]. That agency will [action]. You may [option: consult counsel, withdraw, proceed]." Per-action consent on external actions — credit pulls, agency referrals, mandatory reports — at the moment of the action, not buried in a footer.
- **Why it matters:** Mandatory-reporting and cross-referral pipelines are invisible to the respondent and life-altering downstream. A truthful answer given without that disclosure is informed-consent failure. Hidden authorizations for hard credit pulls cost real credit-score points. These actions on external systems are first-class consequences and need first-class consent.
- **What "done" looks like:** Triggering fields surface a pre-commit modal naming the agency, the action, and the options. External-action gates as discrete consent moments producing signed authorization receipts the respondent can later cite, dispute, or revoke.
- **Feel:** Miranda-warning calm, not scare-modal.
- **Anti-patterns:** AP-010.
- **Surfaces:** *(no archive mockup — surface designed from scratch)*.
- **Backs:** (TBD)
- **Note:** Agencies will resist this because it reduces reporting volume. The respondent's right to know wins.
- **Status:** *open*

## J-029 — "Let me pay the way I actually pay — and through any channel I actually use"

- **Who:** A respondent whose bank account is at a credit union. Whose card is a prepaid debit. Who uses cash. Who has no card at all. Anyone the platform's payment defaults exclude.
- **What they want:** Payment options matching the population — ACH, card, prepaid, cash via retail partner (PayNearMe / MoneyGram), in-person at a counter — not just a card field. Payment and form submission atomic: either both happen, or neither, with the receipt linking the payment transaction and the signed submission.
- **Why it matters:** Unbanked and underbanked respondents are exactly the population most likely to need the service and least likely to have a credit card on file. Single-rail payment is a regressive filter. Form-then-payment and payment-then-form both have failure modes where the respondent is charged but unsubmitted, or submitted but unpaid — both nightmares to unwind.
- **What "done" looks like:** Multiple payment rails with parity in user experience. Cash-at-retail generates a barcode; ACH supports micro-deposit verification; card is one option among several. Atomic submit-and-pay with idempotent retry. Receipt names rail and links the payment artifact to the submission artifact.
- **Feel:** Utility-bill payment counter, not e-commerce checkout.
- **Anti-patterns:** AP-013, AP-017.
- **Surfaces:** *(no archive mockup — surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-030 — "Let me nope out without leaving a trail"

- **Who:** A respondent who started a sensitive form (restraining order, asylum, whistleblower complaint, addiction-treatment intake) and decides not to submit. For these populations a half-finished draft on the issuer's server is itself a threat surface.
- **What they want:** A genuine "delete this draft and forget me" path. Not "we'll retain anonymized analytics." Not "your draft is preserved for 90 days for your convenience." Actually gone — and the respondent gets a signed receipt of the deletion, exactly the way they'd have gotten a signed receipt of a submission.
- **Why it matters:** "Trust me, it's gone" is not credible. "Here is a signed attestation that the draft with id X was destroyed at time Y" is. For the populations who most need this affordance, draft retention is a betrayal of the population the form ostensibly serves.
- **What "done" looks like:** First-class abandon-and-erase action. Deletion is verifiable (signed receipt). Analytics are aggregate-only and never reconstruct a draft. The privacy notice states this in plain language. Retention policy is exposed per data-class, not as boilerplate.
- **Feel:** A shredder, not a recycle bin.
- **Anti-patterns:** —
- **Surfaces:** *(no archive mockup — surface designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-031 — "Sign with my professional license, not my personal identity — and let me sign anonymously when the law allows"

- **Who:** A physician signing a prescription. A licensed attorney signing a filing. A notary executing an acknowledgment. A professional engineer stamping a drawing. A CPA attesting financials. Separately: a whistleblower filing a regulatory complaint, an anonymous survey respondent in a research protocol, an anonymous victim statement in a permitted forum.
- **What they want:** A signature that binds the *act* to the appropriate identity primitive — for professionals, a credential (license, issuing authority, scope, current status, expiration). For protected reporting, a verified-but-pseudonymous signature with identity escrowed under defined legal process and not disclosed to the recipient.
- **Why it matters:** Professional signatures are not personal signatures. The license is the authority; expiration, suspension, and scope limits are part of the signature's meaning. Today's tools collapse this into a name typed in a box. Conversely, anonymous-but-verified signing is the load-bearing primitive behind whistleblower protections — and most signing platforms refuse to provide it because their business model assumes attribution.
- **What "done" looks like:** Credential integration — license lookup at signature time, status snapshot bound to the artifact, scope assertion. Verifier can confirm "this professional was licensed in this state at this moment for this scope." For anonymous mode: verifier asserts the required attributes (real person, verified at this time) without disclosing the underlying identity to the sender; identity escrowed with a neutral party releasable only under defined legal process.
- **Feel:** The signature carries the weight of what it actually represents — not a name, but a role with its authority chain. For anonymous mode: safe. The system understands that "signed" and "identified" are separable.
- **Anti-patterns:** —
- **Surfaces:** [signature-ceremony](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/signature-ceremony.html) *(mockup — credential and pseudonym variants designed from scratch)*.
- **Backs:** (TBD)
- **Note:** Both modes are PKAF authority-chain instances. Selective disclosure is the technical primitive behind anonymous mode and behind J-013's wallet path; same machinery, different applications.
- **Status:** *open*

## J-032 — "Sign in with something I already have, not yet another password"

- **Who:** Someone who's already created 47 accounts this year. An elderly user with one functional email login and an exhausted password-discipline budget. A federal benefits applicant whose state's mandated identity provider is login.gov. A corporate employee whose org has SSO. Anyone whose identity has already been proven elsewhere — login.gov, ID.me, NHS login, gov.uk, EU eID, a state portal, the hosting org's own SSO.
- **What they want:** Sign in using an identity provider the hosting org has configured to accept. Pick from a list (Google, Apple, Microsoft, login.gov, ID.me, NHS, the hosting org's SSO, an EU eID, a verifiable-credential wallet). Decline any IdP that overshares (asks for contact list, social graph, profile scopes the form doesn't need). The chosen IdP's claims flow through to satisfy the form's assurance level.
- **Why it matters:** Account proliferation is both a security failure (weak reused passwords, abandoned accounts as honeypots) and an access failure (forgotten credentials, locked accounts). Forcing yet-another-password on a regulated form is hostile to the population least equipped to manage credentials — and unnecessary when the user already has a trusted identity that satisfies the assurance need. Government forms that mandate login.gov are right to mandate it; forms that ignore federation force re-proofing every single time.
- **What "done" looks like:** The sign-in surface offers the hosting org's configured IdP list, ordered by likely fit (with the user's preferred IdP remembered locally without a server-side account). The respondent picks one. The IdP returns claims that match the form's required assurance level. The receipt records *which IdP attested identity at which assurance level on which date*. Disconnecting the IdP later is a first-class action that doesn't orphan the signed record.
- **Feel:** "Oh, I already have that — done." Account creation moves from a gate to an opt-in choice.
- **Anti-patterns:** AP-020.
- **Surfaces:** [auth](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/auth.html) *(mockup — multi-IdP picker designed from scratch)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-033 — "Let me prove I'm a person without making me prove I'm a robot"

- **Who:** A normal user who keeps failing reCAPTCHA's blurry traffic-light puzzles. A blind user the audio CAPTCHA still defeats. A motor-impaired user who can't drag the puzzle piece into the slot. A person on a VPN whose risk score is "high" for reasons they can't see. A person on a low-end Android whose JavaScript challenge times out. An elderly respondent for whom every CAPTCHA is a new gauntlet.
- **What they want:** Bot protection that's invisible when they're a normal human — never a puzzle as the default. When the system genuinely can't tell, multiple accessible verification paths (device-attested user-present, magic-link to a verified email, a phone call, a passkey assertion) instead of a single inaccessible challenge.
- **Why it matters:** Puzzle CAPTCHAs disproportionately reject disabled users, low-end-device users, and shared-IP users while determined adversaries bypass them with paid solving services anyway. The filter punishes humans and lets bots through. For a public regulated surface, this is not bot protection — it is a participation barrier.
- **What "done" looks like:** Privacy-preserving attestation runs first (Apple Private Access Tokens, Cloudflare Turnstile's non-interactive mode, a WebAuthn "user-present" assertion). Most humans see nothing at all. When the risk signal demands escalation, the system offers multiple paths — audio, visual, WebAuthn, magic-link, voice — and never traps the user on one. The reason for the challenge is honestly explained when it fires.
- **Feel:** Most users never see anything. The users who do see something see a respectful option, not a wall.
- **Anti-patterns:** AP-019.
- **Surfaces:** *(no archive mockup — bot-protection surface designed from scratch; layered behavior under the existing auth surface)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-034 — "I already proved who I am to login.gov / ID.me / NHS — don't make me do it again"

- **Who:** A federal benefits applicant whose state IdP is login.gov at IAL2. A user with a verified ID.me account from a prior form. A UK NHS user whose identity is proven via NHS login. An EU citizen with a national eID. A professional whose verifiable-credential wallet can present the needed attributes. Anyone whose identity was proofed last week and is about to be asked to upload the same documents again.
- **What they want:** Use their existing identity-proofing claim to satisfy the form's assurance requirement. If the form needs IAL2 and the IdP returns an IAL2 session, that's the answer — no fresh selfie capture, no re-upload of the same ID document. If the form needs IAL3 and the IdP is at IAL2, the step-up is targeted to the missing factor; not a fresh re-proof from zero.
- **Why it matters:** Identity proofing is invasive (document upload, selfie match, sometimes biometric video) and slow (minutes to hours). The OIDC `acr` and `amr` claims exist exactly so federated proofing can flow across forms. Re-doing proofing for every form is hostile to the user and defeats the entire purpose of federation. Equally important: a form that *claims* to require IAL2 but silently accepts an IAL1 session is lying about what its receipts represent.
- **What "done" looks like:** The form declares its required IAL/AAL upfront. The presenting IdP returns matching `acr` / `amr` claims. The respondent doesn't repeat document upload or selfie match when the level is already met. Step-up is explicit and targeted ("you'll need to verify your government ID — about 5 minutes — because this form requires IAL3"). The receipt records the *actual* assurance level achieved at signing, sourced from the IdP, with the IdP's identity and the date of proofing.
- **Feel:** "I already did that. The system just trusted that."
- **Anti-patterns:** AP-020, AP-022.
- **Surfaces:** *(no archive mockup — IdP claim handoff surface designed from scratch)*.
- **Backs:** (TBD)
- **Note:** This is J-013's federated cousin. J-013 covers *don't re-prove within this issuer*; J-034 covers *don't re-prove across issuers when a trusted IdP already did it*. Same primitive (assurance-level claims), different scope.
- **Status:** *open*

## J-035 — "Sign in with my phone's biometric — and let the same gesture cryptographically sign the document"

- **Who:** Anyone with a passkey-capable device (most modern phones, laptops, and tablets manufactured after ~2022). Especially: anyone whose password discipline is shaky, anyone targeted by phishing or business-email-compromise, anyone signing something with real legal weight where SIM-swap or credential theft would cause material harm. Older respondents who can use Face ID and can't remember passwords. Households with shared devices where biometric distinguishes who's actually signing.
- **What they want:** Sign in with the device's biometric (Face ID, fingerprint, Windows Hello) or PIN — no password, no SMS code. When the signing ceremony asks for a fresh authentication, the same biometric provides cryptographic proof that the registered user authenticated at this moment. The everyday gesture (touch the sensor, look at the camera) becomes the cryptographic act. Recovery is documented and humane: a second enrolled passkey on a different device, plus a verified-channel backup path.
- **Why it matters:** Passwords are phished. SMS OTP is SIM-swapped and observable to a co-located coercer. WebAuthn / passkeys are mature, widely supported, phishing-resistant by construction, and hardware-backed by the device's secure enclave. For forms that carry real legal weight (anything signed), the authentication gating the signature should be at least as strong as the signature itself. Falling back to a password or SMS code at the signature step is silently weakening the legal artifact.
- **What "done" looks like:** Sign-in offers passkey first when one exists for the user. New users can register a passkey inline during the signing flow. The signing ceremony binds cryptographically to a passkey assertion that proves the registered user authenticated at this exact moment, on this exact device, for this exact challenge. The receipt records the cryptographic primitive (WebAuthn assertion type, authenticator attestation level, signed challenge). Recovery: enrolled second passkey + verified-channel backup. No silent fallback to weaker primitives. For high-stakes flows, the platform refuses to authenticate via SMS-OTP-only when a passkey is available.
- **Feel:** Touching a fingerprint sensor and being signed in — and a moment later, the same gesture has produced a legally-binding signature. The everyday act is the cryptographic act.
- **Anti-patterns:** AP-002, AP-011, AP-021.
- **Surfaces:** [auth](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/auth.html) *(mockup — passkey-first surface designed from scratch)*; [signature-ceremony](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/signature-ceremony.html) *(mockup — passkey-bound ceremony designed from scratch)*.
- **Backs:** (TBD)
- **Note:** Passkeys also strengthen J-008 (WYSIWYS — the assertion is per-action, naturally satisfying AP-002), J-027 (coercion — passkeys can require user-presence each time and resist remote attestation), and J-031 (professional credential signing — a passkey enrolled with a credential-issuing authority becomes part of the credential chain).
- **Status:** *open*

## J-036 — "Is this link even for me?"

- **Who:** Recipient of an email, SMS, or paper letter with a form or signing link, *before* they've clicked anything. Especially: someone who's been phished before, an elderly user who's been told never to click anything, a person who got two letters from different senders within an hour and isn't sure which is which, a tenant whose landlord's "lease renewal" arrived from an unfamiliar domain.
- **What they want:** Confirm the link is genuinely for *them* — right name, right case number, right matter — and from the sender it claims to be from, *before* exposing any identifying information by clicking. An out-of-band confirmation path: call the office, scan a code on a paper letter, look up the case number on a public verifier (without authentication), check that the sender's domain is the one the issuer publishes.
- **Why it matters:** Phishing imitates exactly this surface. The current corpus opens at J-001 ("is this legitimate?") but assumes the page is already loaded. The decision to load happens earlier — in the email body, the SMS text, the paper letter — and is the highest-leverage trust moment. By the time J-001 fires, the user has already exposed device, location, IP, and possibly identity.
- **What "done" looks like:** The platform helps senders write recognizable, verifiable notifications: case reference visible on the *outside* of the email, sender domain matching the case, a paper-letter QR resolving to a sender-attested confirmation on the public verifier *before* any form is loaded. The user can verify before clicking.
- **Feel:** "Okay — this lines up with the letter I have in my hand."
- **Anti-patterns:** —
- **Surfaces:** *(no archive mockup — pre-click trust surface designed from scratch; cross-references the public verifier J-007)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-037 — Safe-address handling for survivors and protected parties

- **Who:** A domestic-violence survivor filing a court petition. A judge or police officer participating in a public process whose home address must remain confidential. A trafficking victim filing immigration paperwork. A protected witness. A person enrolled in a state Address Confidentiality Program (ACP). Anyone whose truthful answer to "what's your address?" would endanger them.
- **What they want:** Complete the regulated process — court filing, benefits application, custody paperwork, immigration filing — without their physical address, phone, or employer appearing in any artifact the counterparty can see. Truthful answers protected by substitution: ACP substitute address recognized by the form, receipt redaction that's verifiable but not location-revealing, no metadata leak via the verifier.
- **Why it matters:** Address-confidentiality programs exist in 40+ US states for exactly this. Generic form platforms route around them — "address" is one box and the truthful answer endangers the respondent. A form that has no representation of this reality is an instrument of the danger. The threat model is concrete, the population is real, and the existing corpus has no row for "the truthful answer to this field would endanger me."
- **What "done" looks like:** Fields are tagged as protectable. Substitute-address pathways are recognized at the field level. Receipts and verifier views redact location-bearing data while remaining cryptographically verifiable. The *existence* of redaction is itself not a tell — the receipt structure is consistent whether or not the respondent is in an ACP, so an attacker can't infer "she's hiding" from receipt shape alone.
- **Feel:** "I can be a real party to this process without him finding me."
- **Anti-patterns:** AP-014.
- **Surfaces:** *(no archive mockup — protected-fields surface designed from scratch with extreme care)*.
- **Backs:** (TBD)
- **Note:** Distinct from J-027 (coercion — presence of an attacker) and J-031 (anonymous-but-verified — full pseudonymity to the recipient). This is *partial* disclosure: the respondent is identified to the process, but location-bearing data is structurally suppressed from the artifact the counterparty sees.
- **Status:** *open*

## J-038 — "I need a paper version the offline clerk will accept on its face"

- **Who:** A respondent whose receipt has to be handed to a landlord, immigration officer, school registrar, court clerk, insurance adjuster, or DMV official who will not visit a verifier URL and may not even be permitted to. Anyone whose process intersects a physical desk where the human across from them has never heard of this platform.
- **What they want:** A printable artifact the offline counterparty accepts on first glance — readable layout, dignified typography, all parties and dates legible, official-feeling without being forged-feeling. A verification path *present* (QR, phone number, short verifier code) for those who choose to check, but not *required* for acceptance.
- **Why it matters:** Real-world acceptance is bimodal: machine-verified or recognized-on-sight by a human. The corpus has J-009 (portable receipt — cryptographic) and J-007 (public verifier — anyone can check) but no row for "the counterparty will never check, and the paper has to stand alone." AP-012 forbids *sending* the respondent to a PDF as the answer to "fill this out"; this journey inverts that — sometimes the *output* must be a PDF the human world expects, and that PDF must be excellent.
- **What "done" looks like:** Receipts can be rendered as a printable, dignified, paper-first artifact: every fact legible, all parties and dates named, a QR for verification, no marketing chrome. The clerk doesn't ask "what is this thing?" The respondent walks out with proof that works in the room they're in.
- **Feel:** Holding a real document, not a screenshot.
- **Anti-patterns:** —
- **Surfaces:** [receipt](../formspec-cloud/thoughts/concepts/claude-design-handoff/project/surfaces/receipt.html) *(mockup — paper-render variant designed from scratch)*.
- **Backs:** (TBD)
- **Note:** AP-012 is about not sending the respondent *to* a PDF as the answer to "fill this out." This journey is about generating an excellent PDF *from* a structured submission, as a presentation view for the offline world. The two are complementary, not in tension.
- **Status:** *open*

## J-039 — "Show me what I owe whom, across every form I've ever filled out"

- **Who:** A respondent with fifteen open matters across landlord, school, IRS, immigration, hospital billing, and a class action. A small-business owner tracking compliance deadlines across half a dozen agencies. A repeat respondent whose paperwork life is *the relationship*, not any single form. Anyone whose lived experience is "what's due next?"
- **What they want:** A single legible view of *what do I owe whom by when*, across senders, across forms, *owned by the respondent* — not yet another notification stream from each sender independently. Per-matter mute, batch, or escalate. The forward-looking face of the respondent-side place.
- **Why it matters:** J-021 (post-submit status + obligations timeline) is per-form. The lived experience is cross-form. The platform either becomes part of the notification noise — yet another email per sender — or it becomes the place that *quiets* the noise. This is also a structural defense against AP-014 (coercion): when the respondent owns the obligations view, no single sender can manufacture artificial urgency by yelling louder than the others.
- **What "done" looks like:** Cross-sender inbox / timeline the respondent owns. Each entry: form, sender, what's due, when, what action the respondent needs to take. Sender-side notification budgets visible. Subscribe / mute / batch per matter. Calendar export. Sender attempts to circumvent the respondent's notification preferences are surfaced to the respondent as a signal.
- **Feel:** "I see my whole paperwork life in one place, and the senders can't bury me."
- **Anti-patterns:** AP-006.
- **Surfaces:** *(no archive mockup — respondent-side dashboard designed from scratch)*.
- **Backs:** (TBD)
- **Note:** Architecturally significant: the platform becomes a persistent respondent-side place, not just a transit between issuer and respondent. The forward-looking surface of a triplet with J-042 (static documents) and J-043 (backward-looking history). Together these constitute *the respondent's place*.
- **Status:** *open*

## J-040 — File upload as a primary act, not a side door (load-bearing for regulated work)

- **Who:** A respondent asked to upload a passport scan, a paystub, a lease, a medical record, an Explanation of Benefits, a child's birth certificate, a death certificate, a 90-day bank statement, a notarized affidavit, a marriage license, a court order. Anyone whose form's value depends on a document they have to capture, scan, photograph, or attach.
- **What they want:** Capture cleanly on a phone — camera-first, edge detection, deskew, brightness correction, glare suppression. *See what was captured.* Redact what shouldn't be shared: account numbers on a bank statement, dependents' SSNs on a tax form, third-party names on a medical record, addresses on a document where J-037 applies. Confirm legibility *before* submitting (the platform reads it back and asks "did we get this right?"). Retain the original locally until the respondent confirms transmission. Know which document is for which question and why. Get a specific, actionable error when something fails, never a "upload failed."
- **Why it matters:** Document upload is the single most failure-prone step in regulated intake — and the most-cited grievance in benefits, immigration, healthcare, and financial intake. "Upload failed" with no diagnostic, illegible photos rejected weeks later, accidental over-disclosure of unrelated PII visible in a scanned bank statement margin — these abandonments never reach the sender as feedback, so they compound silently. File upload is also the surface that exposes the most PII *per second of user attention*; it deserves first-class design, not an afterthought icon next to a text field.
- **What "done" looks like:** Camera-first capture with deskew, edge detection, glare correction, and legibility-score feedback. Per-document client-side redaction tooling (block out fields that don't belong to this form, suppress location-bearing data per J-037). A confirmation view rendering the document as the receiver will see it, before transmission. Original retained client-side until the respondent confirms — and optionally saved to the personal library (J-042) for re-use. Each upload labeled with *which question it satisfies and why* (cross-references J-017 per-field "why are you asking"). Server-side virus scan, format check, and content extraction produce specific, actionable error messages that name the failed rule.
- **Feel:** "I sent exactly the thing they needed — and nothing else."
- **Anti-patterns:** AP-001, AP-008, AP-013.
- **Surfaces:** *(no archive mockup — upload surface designed from scratch; one of the most load-bearing surfaces in the regulated-form category)*.
- **Backs:** (TBD)
- **Note:** Document upload is where every "AI-native" form platform either earns or forfeits its claim. The platform that handles this with dignity — capture, redact, confirm, label, error-with-precision — wins the regulated buyer outright. The platform that ships a generic file picker loses to the photocopy-and-fax incumbent.
- **Status:** *open*

## J-041 — Multi-party forms: many respondents, one submission (load-bearing for joint legal, tax, immigration, custody, and financial work)

- **Who:** Two spouses on a joint tax filing. Three co-parents on a custody filing. Four corporate officers on a board resolution. A household applying for SNAP, Medicaid, or housing assistance. Co-applicants on a rental application or mortgage. Multiple beneficiaries on an estate filing. Joint authors of a regulatory submission. A landlord and tenant signing a lease together. Two parents authorizing a school enrollment. A patient and their healthcare proxy on a complex consent.
- **What they want:** A flow that genuinely models *multiple respondents* — not one person filling for the group, not a parade of sequential single-respondent forms with email back-and-forth between steps. Each party has their own draft, their own authenticated session, their own signature, their own visibility into the parts that are theirs and the parts that aren't. Sections can be designated as private-to-one-party (a survivor's address need not be visible to the co-respondent under J-037), partial-overlap (some fields shared and editable by either), or fully joint (each party attests separately). Orchestration is deterministic, merge is auditable, the resulting receipt names every participant and their role with timestamps and signatures.
- **Why it matters:** J-012 (filer ≠ signer ≠ subject) handles capacity variants but assumes a *single* principal. Joint flows are a structurally different shape: *many principals, each with their own draft and consent*. This is also where J-014 (share-draft-with-reviewer) and J-027 (coercion) intersect dangerously — a "joint" flow controlled by one party is the coercion vector. Multi-party orchestration done badly is *worse* than no multi-party support, because it produces signed documents that look joint but were authored by one party with the other's name typed in. Most form platforms fake this with email round-trips; almost none model it natively. The legal, tax, immigration, custody, and financial domains all run on joint submissions — owning this primitive is owning those markets.
- **What "done" looks like:** Joint sessions where each party authenticates independently (J-032/J-035), each fills their own sections, each sees the joint state only to the extent the form's privacy model allows, each signs their own attestations cryptographically separately, and the resulting bundle names all parties with roles, timestamps, and individual signatures. Per-party draft state. Per-party visibility scoping including protected-field handling (J-037 must work *per party*, not per form). Per-party signature ceremonies that don't require synchronous co-presence. Merge is deterministic and re-verifiable on the public verifier (J-007). No single party can submit on behalf of another. Sessions can be paused, resumed, and handed off cleanly. If parties disagree on a fact, the disagreement is itself a first-class state, not a silent override.
- **Feel:** Both of us contributed. Both of us are accountable. The receipt names both. The system understood that our paperwork is a real shared thing, not a single-author document with two name lines at the bottom.
- **Anti-patterns:** AP-002, AP-014.
- **Surfaces:** *(no archive mockup — multi-party orchestration designed from scratch; architecturally substantial primitive)*.
- **Backs:** (TBD)
- **Note:** This is one of the most architecturally significant journeys in the corpus. Multi-party orchestration is its own primitive — not a reusable extension of the single-respondent flow. Per-party state, per-party visibility scoping, per-party signature timing, deterministic merge across the parties' contributions — all need to be modeled from the start, not retrofitted. Pairs with J-014 (reviewer collaboration) and J-027 (coercion-aware signing). Joint flows controlled by one party are the worst kind of coercion vector — get this right or don't ship multi-party at all.
- **Status:** *open*

## J-042 — "My documents are in my library — I share them with each form on my terms"

- **Who:** A returning respondent who's uploaded the same passport scan to four forms this year. A small-business owner whose tax documents get re-uploaded each quarter. A patient whose insurance card and medical history get re-keyed to every new provider. A licensed professional whose credentials are presented to every license renewal and continuing-education registration. Anyone whose interaction with regulated forms includes the same documents over and over.
- **What they want:** A respondent-side library of documents — passport, driver's license, W-2, bank statement, medical record, lease, professional license, court orders — that *persists across forms and senders*. The library recognizes documents by *what they are* — a passport, a tax form, a license — not by the local name a particular form happened to give the field. A passport scan shared with one form is recognized as a passport when the next form asks for one, even if the two forms call the field different things. When a new form asks for a document, the library offers to provide it. The respondent chooses *per presentation* what to disclose: full document, redacted fields, or just the answer the form actually needs ("is 18 or older" rather than the full birthdate; "household income above $X" rather than the W-2 itself). Provenance, retention, and last-presented-to are visible per document. The library is the respondent's — exportable, deletable, portable to another platform.
- **Why it matters:** Re-uploading identity documents to every form widens the breach surface for no benefit. Today, each issuer holds its own copy of the same passport; the respondent has no control over how many copies exist or where. A respondent-side library inverts this: one canonical copy on the respondent's side, presented selectively per form. *Variable permissioning per presentation* is the load-bearing detail — the same passport can satisfy form A's IAL2 need (full disclosure to the IdP) and form B's age-check need ("is 18+" derived, no document shared). This is the consumer-side counterpart to J-013's verifiable-credentials wallet: wallets handle attestation-grade credentials issued by an authority; the library handles *any document the respondent has uploaded and may need to present again*.
- **What "done" looks like:** After any upload (J-040), the respondent can choose "save to my library" with a visible retention horizon and per-document tagging (type, issuer, expiry, source-of-truth). The library is encrypted client-side or on the respondent's behalf — the platform can't read it without the respondent's authentication. Future forms can *request* documents by type; the respondent sees the request, chooses what to disclose at what fidelity (full / redacted / derived-claim-only), and the form receipt records *what was disclosed at what fidelity to whom*. Per-document permissions can be revoked, scoped to a time window, or scoped to a single presentation. Export and bulk-delete are first-class actions. The library survives the respondent leaving any particular issuer.
- **Feel:** "I own my own documents. I share them on my terms. I don't lose track of who has copies of what."
- **Anti-patterns:** AP-006, AP-024.
- **Surfaces:** *(no archive mockup — library surface designed from scratch; respondent-side primitive)*.
- **Backs:** (TBD)
- **Note:** Architecturally significant: the platform now holds *respondent-controlled* data, not just *issuer-controlled* data. The trust model has to be honest about this — the respondent's library is theirs, the platform is hosting on their behalf, the issuer cannot read it without explicit per-presentation consent. Pairs with J-013 (verifiable-credentials wallet) — the library handles any document, the wallet handles attestation-grade ones; same selective-disclosure machinery, different artifact types.
- **Status:** *open*

## J-043 — "Show me every form I've ever submitted, started, or signed"

- **Who:** A repeat respondent — annual filer, ongoing case, someone in the middle of a multi-year process — who needs to see their own history. A respondent who started a benefits application months ago and can't remember what stage it's at. An immigration applicant tracking multiple petitions. A small-business owner reconstructing compliance history for an audit. Anyone whose paperwork life is more than a single form and needs to look *backward*, not just forward.
- **What they want:** A respondent-side timeline of all their drafts, submissions, signed records, receipts — searchable by sender, status, date, or form type. Each entry links to its receipt (J-009), its verifier path (J-007), the obligations it created (J-039), and the documents that backed it (J-042). Drafts are listed alongside submissions, with clear status — abandoned, saved-for-later, in-progress, submitted, signed. Export to standard formats. Deletion is honest: drafts can be deleted (J-030), submissions cannot, and the surface is precise about which is which.
- **Why it matters:** Today this is fragmented across email inboxes, separate portals, scattered PDF folders, and the respondent's memory. The respondent's interest is continuity; the platform's instinct is per-issuer silos. Owning the backward-looking view is owning the relationship — and is also the surface that lets respondents *prove* their own history without depending on the issuer's email archive (which may have been deleted, lost in a job change, or never delivered). For multi-year processes — asylum, custody, immigration, ongoing benefits — the history view *is* the case file.
- **What "done" looks like:** A "my forms" view across every issuer using this platform. Filterable. Exportable. Linked to receipts and verifier paths. Status shown per entry. Drafts visible alongside submissions, with each draft's last-edited timestamp and the form-version it was started on (cross-references J-022). The respondent can prove their own history without re-contacting any issuer. Records survive the issuer changing platforms or going out of business — because the respondent has signed receipts that verify independently.
- **Feel:** "My paperwork life is mine to see, not scattered across thirty email threads."
- **Anti-patterns:** AP-006.
- **Surfaces:** *(no archive mockup — history dashboard designed from scratch)*.
- **Backs:** (TBD)
- **Note:** The backward-looking complement to J-039 (forward obligations) and J-042 (static documents). Together they constitute *the respondent-side place* — what was, what is, what's coming. Architecturally, J-039 + J-042 + J-043 reframe the platform from "transit between issuer and respondent" to "the respondent's own place that issuers can post to and read from with consent."
- **Status:** *open*

## J-044 — "I made an honest mistake — let me correct without being treated as fraud"

- **Who:** A respondent who answered honestly, was wrong about a fact, and discovered the error after submission. A misspelled name. A wrong year of entry on an immigration form. A transposed SSN digit. A misremembered date. A box checked in the wrong column. The friendly correction case — neither adversarial nor consent-revoking.
- **What they want:** Correct the record without it being treated as fraud. Without losing the prior submission's place in queue. With a clear path to provide evidence of the corrected fact. Not the adversarial path of J-016 (dispute / retract / withdraw) — that reads as conflict. The honest correction has a different shape: cooperative, factual, evidenced.
- **Why it matters:** J-016 (amend / retract / dispute) reads as revocation of consent or assertion of an opposing position. The honest-typo case is neither. It's "the system asked me X, I answered honestly, I was wrong about the fact, here's the right fact and the evidence." Most platforms make correction more punishing than getting it wrong silently — which trains respondents toward dishonesty and silent error rather than transparency. The form-side of due process requires that *honest* correction be routine, not a special pleading.
- **What "done" looks like:** Correction is a recognized act on the same receipt chain. The receipt links the original and corrected versions with the evidence for the correction. The issuer surface treats correction-with-evidence as routine, not suspicious. Queue position and effective date follow the original submission, not the correction. The correction is itself signed by the respondent — the corrected fact is attested, the original isn't deleted.
- **Feel:** "Fixed it. The record knows the truth now, and I'm not flagged as fraudulent for caring enough to correct."
- **Anti-patterns:** AP-013.
- **Surfaces:** *(no archive mockup — correction surface designed from scratch)*.
- **Backs:** (TBD)
- **Note:** Distinct from J-016 (adversarial: revoke / dispute / withdraw). This is *cooperative* correction with evidence. Both paths must exist; conflating them is what makes existing platforms hostile to honesty.
- **Status:** *open*

## J-045 — "I have no signal — let me finish the form anyway, and let it submit itself when I'm back online"

- **Who:** A disaster-relief intake worker on a tablet in a shelter where the WiFi is overwhelmed or absent. A rural respondent on a phone with one or two bars in the best of conditions. A field-service technician in a building basement. An asylum applicant on an embassy's restricted network. A court clerk in a courthouse where networks are spotty. A respondent in a developing region where cellular data is metered and rationed. Anyone whose connectivity is unreliable or genuinely absent for the duration of the form.
- **What they want:** Open the form once with a signal (or load it ahead of time), then complete it entirely offline — every field, every "show this only if" branch, every validation message, every help text, every rule reference, every signature step. Drafts save on the device. When the respondent hits submit, the system queues the upload and fires it the moment connectivity comes back, without creating duplicates. A receipt is produced that the respondent can show to anyone, anywhere, without needing to be online to prove it's real.
- **Why it matters:** J-002 (save-resume + validation recovery) handles network blips during a connected flow. This is different: the entire flow happens *without* network. Disaster zones, field service, embassies, courthouse basements, rural villages, prisons, and developing regions are not edge cases — they are exactly the populations whose interactions with regulated forms have the highest stakes and the worst connectivity. A platform that requires always-on internet for completion excludes them by design, regardless of the issuer's stated equity goals.
- **What "done" looks like:** The respondent loads the form once, then disconnects for hours or days. Everything works — fields appear and disappear as their answers demand, errors explain themselves, calculated values update, signatures happen, drafts persist on the device. When the device gets a signal again, the submission goes out automatically; if the respondent hit submit twice during the dead zone, only one copy lands at the agency. The receipt in their hand can be shown to anyone, anywhere, even if the platform's servers are unreachable.
- **Feel:** The form doesn't care whether the respondent has signal. The respondent doesn't have to make decisions about connectivity — they make decisions about the form.
- **Anti-patterns:** AP-001, AP-013, AP-015.
- **Surfaces:** *(no archive mockup — offline-capable surface designed from scratch; cross-cuts every other respondent surface that must work end-to-end without network)*.
- **Backs:** (TBD)
- **Status:** *open*

## J-046 — "Let me use the assistant I already use, not whatever this form ships"

- **Who:** A respondent who already uses an AI assistant every day — and who'd rather keep using it than learn a new one on every form. A blind user with a screen reader they've configured and trust. Someone whose password manager and form-fill extension have been quietly helping them for years. Someone with a paid assistant subscription and a thoughtful privacy posture. Anyone whose tools already work for them on the rest of the web.
- **What they want:** Bring those tools to this form. The assistant they trust, with the context it already has, helping them on this form the same way it helps them everywhere else. The respondent shouldn't have to pick between *this form's AI* and *no AI* — they should be able to use the AI they actually use.
- **Why it matters:** Today, almost every regulated form makes the same offer: use our built-in helper, or struggle through alone. That means the respondent's trust, their privacy posture, and their working context are locked to whoever shipped the form. A respondent who already trusts Claude doesn't want to switch to a generic helper; a screen-reader user with a carefully-tuned setup doesn't want a generic accessibility overlay; a password manager that's been syncing across the rest of the web shouldn't suddenly stop at the agency's door. Open the door, and the respondent's existing trust comes with them.
- **What "done" looks like:** The respondent's chosen assistant — whatever it is — can see the form's structure, look up help for a field, propose values, check whether an answer would clear validation, point at the next thing that needs attention. Every change the assistant proposes shows up to the respondent first; nothing lands without the respondent's explicit go-ahead. The "no assistant" path is exactly as good as the assisted one — same fields, same fees, same receipt, no degraded service for the respondent who declined help. Whichever way the respondent works, the form behaves the same.
- **Feel:** My tools work here. The form didn't make me change anything about how I already work.
- **Anti-patterns:** AP-002, AP-007, AP-024.
- **Surfaces:** *(no archive mockup — the surface is the form itself, plus a stable structure any tool can read)*.
- **Backs:** (TBD)
- **Note:** Distinct from J-011, which is the platform shipping its own conversational mode. J-011 is the *form's* assistant; J-046 is the *respondent's* assistant. Both should exist. Neither should require the other.
- **Status:** *open*

## J-047 — "Three questions instead of four hundred — figure out which form I actually need"

- **Who:** A first-time applicant who doesn't know which of the agency's six forms applies to their situation. A returning respondent whose eligibility was checked three months ago. A caseworker triaging a client across programs. An advocate routing several people in an afternoon. Anyone facing a menu of forms with no good way to know which one is theirs.
- **What they want:** A short pre-flight check — three to ten plain questions — that figures out which form actually applies, sends them to it, and remembers the answer for a reasonable window so they don't have to redo the check on every visit. If their situation changes, let them redo it; their prior answers come back as a starting point. If they want to see *why* they were sent to a particular form, show them — the questions, their answers, the reasoning. No black box.
- **Why it matters:** Filling out the wrong form is a hidden tax — forty minutes lost discovering it doesn't apply, another forty finding the right one, often a missed deadline at the end. The pre-flight check exists exactly so the respondent doesn't pay that tax. But running the check every single visit is the same tax inverted — eligibility doesn't change daily, and demanding a fresh check on every return burns the respondent's time for no information gained. Opaque routing — "you've been directed to Form X" with no reason given — is the third failure, leaving the respondent unable to challenge a wrong decision.
- **What "done" looks like:** The respondent answers a small handful of routing questions, sees the result plainly — "Form X is the one for you," or "based on your answers, no current program applies, and here's what changed your eligibility" — and walks away with a record. The record says: this is the form, this was the check, these were the answers, here's why this result followed. Within the validity window, return visits skip straight to the form. After the window, or after a situation change, the check runs again with prior answers as defaults. The respondent can ask, at any time, "why was I sent here?" and get a real answer.
- **Feel:** The system valued my time enough to ask me three questions instead of four hundred — and remembered.
- **Anti-patterns:** AP-006, AP-008, AP-022.
- **Surfaces:** *(no archive mockup — pre-flight routing surface designed from scratch; precedes any specific form)*.
- **Backs:** (TBD)
- **Note:** Distinct from J-011 (a conversational mode of an existing form). J-047 runs *before* any form is chosen and produces its own keepable record; J-011 is one of several ways to fill a form once chosen. Sister to J-013 (don't re-prove who I am) — same anti-redundancy principle applied to eligibility instead of identity.
- **Status:** *open*
