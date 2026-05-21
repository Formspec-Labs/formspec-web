# Web Planning

Atomic `FW-*` rows for the public reference UI. Lane (`Now` / `Next` / `Later`), status, persona, backing journey, sentence or two of "done" in user-visible terms.

Format reference: [`CLAUDE.md`](CLAUDE.md). Person-need source: [`JOURNEYS.md`](JOURNEYS.md).

## Lanes

- **Now** — actively being worked or next-up.
- **Next** — queued behind Now, ready when Now clears.
- **Later** — deferred; revisit when triggered.

Optional release marker on `Now`: `Now (alpha)` (must ship for first paying customer) vs `Now (parity)` (must ship for parity with formspec-server features in the public surface). No `Imp×Debt` math.

## Status vocabulary

*open* | *in design* | *in build* | *live* | *closed*. Same set as JOURNEYS.

## Migration note

FW-0001, FW-0002, FW-0003 are renames of `formspec-cloud/PLANNING.md`'s CLD-0001 / CLD-0007 / CLD-0008 respectively, carved out during the bootstrap of this repo (web ADR-0001). The cloud rows are removed; the audit trail lives in the migration commit and in the per-row note. Numbering after FW-0003 is freshly assigned in this rewrite; no prior FW-* IDs are reused or shifted.

## How this document was sized

Person-need source has 47 journeys and 25 anti-patterns. Each load-bearing journey gets at least one FW-* row. Architecturally substantial journeys — J-041 multi-party, J-042 library, J-043 history, J-039 obligations, J-046 bring-your-own-assistant — are explicitly decomposed: a `Next`-lane research/design row and a `Later`-lane build cluster, called out per journey. Most journeys belong in `Next` or `Later`; `Now` is the tightest ring around the wedge.

---

## Now

### FW-0001 — End-to-end Respondent thin-slice (deployable)

- **Lane:** Now (alpha)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-recovers-from-validation-and-never-loses-work)
- **Done:** A real respondent can open a form URL, fill required fields, hit a validation error, recover, submit, and see a confirmation — backed by a real backend wire. Closing the tab and returning later (on the same or a different device) leaves every answer where it was. Errors read in plain English with a reference number the user can quote to support, never "something went wrong."
- **Anti-patterns:** AP-001, AP-013, AP-015.
- **Note:** Leads the backlog deliberately. Forces framework, design tokens, build, and accessibility-baseline decisions to fall out as evidence (FW-0014..0018), not as whiteboard rows. Do not pick framework before this row surfaces constraints. Migrated from `formspec-cloud/PLANNING.md` CLD-0001.

### FW-0002 — Trust Center browseable without sign-in

- **Lane:** Now (parity)
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-006](JOURNEYS.md#j-006--evaluator-procurement-browses-trust-center-pre-purchase)
- **Done:** A procurement reviewer can browse the Trust Center — data flow, capability matrix, subprocessor list, selective-proof artifacts — from an unauthenticated session. Pages are indexable by search engines. No sales gate, no popup, no contact form between the buyer and the answer to their question.
- **Anti-patterns:** AP-023.
- **Note:** Page-by-page allocation between this repo and the marketing site is open — web ADR-0002 (pending). The verifier widget stays here regardless. Migrated from CLD-0007.

### FW-0003 — Verifier validates a receipt and shows the claim graph

- **Lane:** Now (parity)
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt--without-an-account-without-trusting-us)
- **Done:** Drag-drop, paste, or follow-a-link gets the receipt onto the page. Within seconds the page shows pass or fail, who signed, when, what they signed (verbatim), and whether anything has been changed since. No login, no account, no tracking. A skeptic can explain it to their boss in one sentence and drill deeper if they want to.
- **Anti-patterns:** AP-003, AP-006, AP-023.
- **Note:** **The single positioning bet** for the open-source reference UI. Any verifier-surface decision is high-stakes by default. Migrated from CLD-0008. Offline-bundle version is FW-0024 (Later); plain-paper version is FW-0009.

### FW-0004 — First-paint legitimacy: the sender's brand, what this is, who's asking

- **Lane:** Now (alpha)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-001](JOURNEYS.md#j-001--first-impression-is-this-legitimate-and-can-i-trust-it-for-the-next-ten-minutes)
- **Done:** First paint shows the sender's brand front and center, the platform's brand subordinate, and a one-line statement of who is asking and why — all above the fold on a phone, with no popup, no consent wall, and no humanity gauntlet between the click and the form. The user can decide "this is legitimate" without scrolling.
- **Anti-patterns:** AP-012.
- **Note:** Trust-on-first-paint is a hard prerequisite for every later journey. Worth its own row so it doesn't get lost inside FW-0001's "make it work" framing.

### FW-0005 — Phone-first form-fill, one-handed

- **Lane:** Now (alpha)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-004](JOURNEYS.md#j-004--filling-it-out-on-a-phone-one-handed-on-the-bus)
- **Done:** The form works on a phone in one hand: tap targets reachable with the thumb, the right keyboard for the right field (numbers, dates, email), no pinch-zoom, primary buttons in reach. The form was designed for the phone first; the desktop layout is a wider variant, not the other way around.
- **Anti-patterns:** —
- **Note:** Phone parity is the largest single addressable-population unlock and the cheapest one to forfeit by accident. Audit it from FW-0001 onward, not after.

### FW-0006 — Trail-sign cover page: time, cost, what to bring

- **Lane:** Now (alpha)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-024](JOURNEYS.md#j-024--tell-me-up-front-how-long-this-will-actually-take-and-what-i-need-ready)
- **Done:** Before any field, the respondent sees a trailhead page: realistic time to complete (drawn from real prior completions, not vendor optimism), what documents to have ready, the total cost itemized — base fee, surcharges, processing — pinned and visible. The user can decide "now or later" before they invest the first minute.
- **Anti-patterns:** —
- **Note:** Reduces mid-flow abandonment more than any other single row. Sells the meeting alongside the verifier.

### FW-0007 — Pre-submit consequences screen with per-action consent

- **Lane:** Now (alpha)
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-015](JOURNEYS.md#j-015--show-me-the-consequences-before-i-submit--including-what-becomes-irreversible)
- **Done:** The step before submit reads like a flight itinerary: who receives the submission, what gets triggered, what deadlines now apply, which fields lock, what cannot be undone. Anything that fires an external action — credit check, cross-agency referral, mandatory report, payment — is its own deliberate consent moment with its own confirmation, not a buried checkbox. Each external action produces its own signed authorization the respondent can later cite.
- **Anti-patterns:** AP-004, AP-009, AP-010.
- **Note:** Regulated submissions are one-way doors. Treating submit as "Next" is the category's signature failure. Pairs with FW-0029 (cross-agency referral warning) for the named-agency case.

### FW-0008 — Signer ceremony: per-field affirmative act, scroll-to-end gate

- **Lane:** Now (parity)
- **Status:** open
- **Persona:** Signer
- **Journey:** [J-008](JOURNEYS.md#j-008--sign-here-but-first-show-me-exactly-what-im-signing)
- **Done:** Before signing, the signer sees the exact document that will be signed, scrollable, with every value visible — the bytes they sign are the bytes they saw. Each signature and initial field is its own deliberate tap, never a bulk apply. No cursive-font name-stamping; the signature surface names what the act actually is.
- **Anti-patterns:** AP-002, AP-003, AP-011.
- **Note:** Parity-load-bearing. The verifier (FW-0003) and the ceremony (FW-0008) together carry the trust story — one without the other is incomplete.

### FW-0009 — Signed receipt the respondent owns, online and on paper

- **Lane:** Now (parity)
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-009](JOURNEYS.md#j-009--the-receipt-is-an-object-i-own--and-i-can-prove-this-years-later) and [J-038](JOURNEYS.md#j-038--i-need-a-paper-version-the-offline-clerk-will-accept-on-its-face)
- **Done:** At submit, the respondent receives a downloadable receipt with a long-lived public link. The same receipt prints onto a single page that an offline clerk — landlord, court, registrar, DMV — accepts on first glance: all parties named, dates legible, dignified typography, a verification code or QR for those who want to check, no marketing chrome. Five years from now the link still works and the verifier (FW-0003) still validates the file.
- **Anti-patterns:** AP-006.
- **Note:** "Verifier without us" only matters if the artifact survives "us." Paper acceptance is what makes the receipt real in the rooms where the respondent actually has to use it.

### FW-0010 — Selective-proof viewer

- **Lane:** Now (parity)
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt--without-an-account-without-trusting-us)
- **Done:** The viewer renders a selective-disclosure proof — "this signer is 18 or older," "this household income exceeds the threshold" — without revealing the underlying facts. The page is clear that some fields are intentionally redacted, that the redaction is verifiable, and that nothing has been tampered with. A non-cryptographer leaves the page understanding what was attested and what was not.
- **Anti-patterns:** AP-023.
- **Note:** Decomposes J-007 — the verifier (FW-0003) shows the full claim graph; the selective-proof viewer (FW-0010) is its sibling for partial disclosure. Both are part of the positioning bet.

## Next

### FW-0011 — Branched form: "showing because…" and diff on revision

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-003](JOURNEYS.md#j-003--why-is-the-form-asking-me-this-now-oh--because-of-what-i-said-earlier)
- **Done:** When new questions appear because of an earlier answer, a one-line note tells the user why. When an earlier answer is revised and the form re-routes, the user sees what was cleared, what was kept, and what is new — never a silent change underfoot.
- **Anti-patterns:** —

### FW-0012 — Accessibility: WCAG 2.1 AA across every production surface

- **Lane:** Next
- **Status:** open
- **Persona:** Platform / Respondent
- **Journey:** [J-005](JOURNEYS.md#j-005--i-use-a-screen-reader-i-have-low-vision-my-hands-shake-the-form-needs-to-work)
- **Done:** A blind respondent on a screen reader, a low-vision respondent at 400% zoom, a respondent who navigates by keyboard, an older respondent on a shaky touch — each can finish the form alone, on their own tools. Every surface has an automated a11y check captured in CI; failing surfaces have a tracked fix row.
- **Anti-patterns:** —
- **Note:** This is both a platform discipline (FW-0017) and a journey commitment. The two are kept in one row so the discipline never drifts away from the lived experience.

### FW-0013 — Plain-language errors and typed problem detail

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-recovers-from-validation-and-never-loses-work) (deep cut)
- **Done:** Every error the user sees says what went wrong in plain English, names whether it's something they need to fix or something the system needs to fix, and carries a short reference ID the user can quote. Cross-field contradictions ("your dependent's birthdate makes them 19 but you marked them as a child under 17") are stated in those terms, not as code names.
- **Anti-patterns:** AP-013.
- **Note:** FW-0001 carries the minimum bar. This row carries the depth — every error class catalogued, every message reviewed for plain language.

### FW-0014 — Ratify UI framework choice (ADR-0002)

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** ADR-0002 documents the UI framework decision with alternatives considered and consequences. **Gated by FW-0001 evidence** — do not pick framework before FW-0001 surfaces actual constraints (server-side rendering need, islands, in-browser cryptography for the verifier, search indexing for the Trust Center).

### FW-0015 — Design tokens to a structured token file

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** Color, typography, spacing, and motion tokens are extracted to a single structured token file referenced by every production surface. Cloud's white-label respondent shell can theme over the same vocabulary without per-component rework.

### FW-0016 — Build and test pipeline producing a deployable artifact

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** The build runs locally and in CI, produces a deployable artifact, and finishes a clean-tree build in under 60 seconds.

### FW-0017 — Accessibility automation in CI

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform; supports FW-0012)
- **Done:** Each production surface has an automated accessibility check running in CI. Regressions block merge. The check report is human-readable and links to the failing element.

### FW-0018 — License decision and LICENSE file (ADR-0003)

- **Lane:** Next
- **Status:** open
- **Persona:** Platform
- **Journey:** (none — platform)
- **Done:** ADR-0003 documents the open-source license choice (MIT vs Apache-2.0) with rationale. LICENSE file added at repo root; per-file headers added per the chosen convention. Reference-implementation positioning favors permissive.

### FW-0019 — Multilingual form: respondent's language with the legally controlling text marked

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-010](JOURNEYS.md#j-010--translate-this-form-into-my-language-without-bending-the-legal-meaning)
- **Done:** The respondent reads the form in their language, sees the legally controlling text marked plainly, and writes narrative fields in their own words. Translations attached to a narrative are labelled by source — the respondent themselves, a machine, a certified human — and the receiver sees both the original and the translation. Names in multiple scripts are first-class.
- **Anti-patterns:** —
- **Note:** Worked from scratch — no in-place retrofit of an English-only form layer.

### FW-0020 — Identity continuity within an issuer

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-013](JOURNEYS.md#j-013--dont-make-me-re-prove-who-i-am-every-time)
- **Done:** A respondent who proved their identity in session one does not re-prove it in sessions two and three. The form shows "identity confirmed on [date]" with a clear expiry. A step-up happens only when the next field genuinely needs a higher assurance level than the user already has — and when it happens, it's named and reasoned, never silent.
- **Anti-patterns:** AP-020, AP-022.

### FW-0021 — Field-level "why are you asking this?"

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-017](JOURNEYS.md#j-017--tell-me-why-youre-asking--for-every-sensitive-field-with-citation)
- **Done:** Every sensitive field carries a one-line, plain-English explanation: what the question is for, who sees the answer, how long it's kept, and — where the question is required by rule — a link to the rule. The user can flag a question as confusing; the signal feeds back to the issuer. The receipt records which explanations were shown.
- **Anti-patterns:** AP-009, AP-016.

### FW-0022 — Prefill with visible provenance

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-020](JOURNEYS.md#j-020--stop-pretending-you-dont-already-know-this--and-show-me-where-every-prefilled-value-came-from)
- **Done:** When the form prefills a value, the user sees where it came from and when. "From your 2025 filing." "From DMV record verified 2026-03." "From your connected credential." Nothing lands silently. Multi-value prefill is previewed in one screen before any value applies; the user accepts or rejects each one. The receipt distinguishes agency-prefilled from user-attested.
- **Anti-patterns:** AP-001, AP-008, AP-018.

### FW-0023 — Form-version pin and structured diff on republish

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-022](JOURNEYS.md#j-022--the-form-changed-underneath-me-while-i-was-in-it--show-me-the-diff-or-leave-my-version-alone)
- **Done:** A draft is bound to the form version the user started on. If the issuer publishes a new version, the user sees a clear "what changed" page — fields added, fields removed, wording changed, validation changed — with the issuer's reason. The user chooses to continue on the old version (while it's still accepted) or migrate to the new one. The receipt records which version was submitted.
- **Anti-patterns:** AP-005.

### FW-0024 — Show the math: derivation on every calculated field

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-023](JOURNEYS.md#j-023--show-me-the-math--for-every-calculated-field)
- **Done:** Every calculated value — tax owed, premium, eligibility, support amount — has a "show the math" affordance that opens the actual derivation: these inputs, this rule, this version, this result. The derivation is part of the receipt, not just the screen. Forward-projected constraints surface as inline foresight ("choosing this here will block you from also claiming X later").
- **Anti-patterns:** —
- **Note:** The single most defensible respondent-facing thing FEL + Formspec can do that a free-text form-builder cannot. Worth treating as a marketing surface as much as a feature surface.

### FW-0025 — Quiet voice for hardship and bereavement forms

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-025](JOURNEYS.md#j-025--dont-perform-cheerfulness-when-im-doing-the-hardest-paperwork-of-my-life)
- **Done:** When the form's context is hardship — an estate filing, a restraining order, a disability claim — the chrome adjusts: no welcome-back copy, no progress confetti, no "almost done," no emoji, no streaks. The context (estate of, emergency claim, protective order) is named once at the top and carried through to the receipt. Generated text reads with the right weight.
- **Anti-patterns:** AP-014.
- **Note:** Highest-leverage tone test in the product. A form that gets this right will get everything else right. A form that fails this gets remembered as cruel forever.

### FW-0026 — Decline path with parity to the accept path

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-026](JOURNEYS.md#j-026--refusing-must-be-as-easy-as-accepting)
- **Done:** Saying no takes no more clicks and no more required fields than saying yes. Declining produces a receipt of the same fidelity as signing. Per-clause strike-with-reason creates a counter-offer the sender must affirmatively answer. The user can refuse future requests from a specific sender at the platform layer, not just by ignoring email.
- **Anti-patterns:** AP-004.

### FW-0027 — Multi-rail payment with atomic submit

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-029](JOURNEYS.md#j-029--let-me-pay-the-way-i-actually-pay--and-through-any-channel-i-actually-use)
- **Done:** Payment offers ACH, card, prepaid, cash-via-retail-partner, and in-person — not card-only. The submit and the payment land or fail together; the user is never charged-but-unsubmitted or submitted-but-unpaid. The receipt names which rail was used. No rail produces a slower or worse outcome than another.
- **Anti-patterns:** AP-013, AP-017.

### FW-0028 — Multi-IdP sign-in with no oversharing

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-032](JOURNEYS.md#j-032--sign-in-with-something-i-already-have-not-yet-another-password)
- **Done:** When more than one identity provider can satisfy the form's required assurance, the user picks from the issuer's configured list. The user can decline a provider that asks for more than the form actually needs (contact list, social graph) and pick a different one that still meets the bar. The receipt records which provider attested identity at which level on which date.
- **Anti-patterns:** AP-020.

### FW-0029 — Cross-agency referral warning at the moment it fires

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-028](JOURNEYS.md#j-028--warn-me-before-my-answer-triggers-a-referral-to-a-different-agency)
- **Done:** When an answer will, by law, generate a report or referral to another agency, the user sees that fact at the moment of the answer: who gets a copy, what that agency will do, what the user's options are. The consent for the referral is its own signed step.
- **Anti-patterns:** AP-010.
- **Note:** Agencies will push back on this. The respondent's right to know wins.

### FW-0030 — Federated identity claim handoff

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-034](JOURNEYS.md#j-034--i-already-proved-who-i-am-to-logingov--idme--nhs--dont-make-me-do-it-again)
- **Done:** When the user's existing identity provider already meets the form's assurance level, the form trusts it and doesn't ask them to re-prove. If a step-up is needed, it's targeted to the missing factor only — not a fresh re-proof from zero. The receipt records the actual assurance achieved at signing, with the provider named and the proofing date.
- **Anti-patterns:** AP-020, AP-022.
- **Note:** Federated cousin of FW-0020. Same assurance discipline, different scope.

### FW-0031 — Passkey-first sign-in and signature binding

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-035](JOURNEYS.md#j-035--sign-in-with-my-phones-biometric--and-let-the-same-gesture-cryptographically-sign-the-document)
- **Done:** When the device supports a passkey, the form offers it first — for sign-in and for signing. The fingerprint touch or face match becomes the cryptographic act, bound to the specific document being signed. SMS one-time codes are a fallback, never the default. Recovery is documented and uses a second enrolled device.
- **Anti-patterns:** AP-002, AP-011, AP-021.

### FW-0032 — Pre-click trust: help the sender write a verifiable letter

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-036](JOURNEYS.md#j-036--is-this-link-even-for-me)
- **Done:** The platform gives senders the means to write notifications a recipient can verify before clicking — case reference visible in the email body, paper-letter QR resolving to a sender-attested confirmation page on the public verifier, sender domain matching the issuer's published list. A phished-aware recipient can confirm "this is mine" without exposing their device to whatever the link actually points at.
- **Anti-patterns:** —

### FW-0033 — File upload as a primary act

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-040](JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
- **Done:** Capture from the phone camera with deskew, edge detection, and a legibility check. The user sees what the receiver will see *before* it sends. The user can redact fields that don't belong to this form — account numbers in a bank statement, dependents on a tax page, an address where safety requires it. Each upload is labeled with which question it answers and why. Errors are specific: "this image is too dark to read," not "upload failed."
- **Anti-patterns:** AP-001, AP-008, AP-013.
- **Note:** Document upload is where every "AI-native" form platform either earns or forfeits its claim. Worth treating as a tentpole surface, not a side door.

### FW-0034 — Honest-correction path on the receipt chain

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-044](JOURNEYS.md#j-044--i-made-an-honest-mistake--let-me-correct-without-being-treated-as-fraud)
- **Done:** When a user discovers they answered something honestly but wrong, they can correct it on a friendly path — not the adversarial dispute/retract path. The correction is itself signed, attaches evidence, links to the original on the same receipt chain, and keeps the original's queue position and effective date. The corrected fact replaces the wrong one in the record without deleting it.
- **Anti-patterns:** AP-013.
- **Note:** Distinct from FW-0042 (dispute / retract / withdraw — adversarial). Both must exist.

### FW-0035 — Professional and pseudonymous signing modes

- **Lane:** Next
- **Status:** open
- **Persona:** Signer
- **Journey:** [J-031](JOURNEYS.md#j-031--sign-with-my-professional-license-not-my-personal-identity--and-let-me-sign-anonymously-when-the-law-allows)
- **Done:** A physician signs as a physician, with license, issuing authority, scope, and current status bound to the signature. The verifier shows "this professional held this license in this state at this moment." Where the law permits anonymous-but-verified signing — whistleblowing, protected reporting, certain research — the user signs with a verified pseudonym; the verifier confirms the required attributes without revealing the real identity.
- **Anti-patterns:** —

### FW-0036 — Humane bot protection: no puzzles as default

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-033](JOURNEYS.md#j-033--let-me-prove-im-a-person-without-making-me-prove-im-a-robot)
- **Done:** Bot protection is invisible to most humans. When the system genuinely can't tell, the user gets multiple accessible paths — audio, visual, passkey assertion, magic link, voice — and is never trapped on a single inaccessible challenge. Traffic-light puzzles are not the default and not the only option.
- **Anti-patterns:** AP-019.

### FW-0037 — Filer-not-signer mode (preparer, family, professional, agent)

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-012](JOURNEYS.md#j-012--im-filing-this-for-someone-else--or-as-a-non-human-agent--and-the-receipt-must-say-so) (the human-capacity slice)
- **Done:** A toggle at the start says "I'm filling this for someone else." The user picks their capacity — power of attorney, guardian, executor, licensed professional, corporate officer — and attaches the document that proves it. The signature is recorded against the right party. The receipt names everyone: filer, signer, subject, capacity, authority document. For a decedent, no liveness check on the subject; the language adapts to "the estate of…".
- **Anti-patterns:** AP-014.
- **Note:** Covers the human-capacity variants. The AI-agent / four-party-chain variant is FW-0058 (Later); split deliberately to keep this row shippable.

### FW-0038 — Amend, withdraw, dispute on signed records

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-016](JOURNEYS.md#j-016--let-me-amend-if-i-made-a-mistake--or-withdraw-if-i-changed-my-mind)
- **Done:** Amending a submission is a recognized act on the same receipt chain — not a delete, not a silent overwrite. Withdrawals are first-class within the window the receiving agency permits, with the receipt itself naming the window. A signer can attach a dispute note to a record they signed, undeletable by the counterparty. A standing view lists every consent the user has granted and which of them are revocable.
- **Anti-patterns:** —

### FW-0039 — Post-submit status surface with realistic timing

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-021](JOURNEYS.md#j-021--i-hit-submit-where-is-it-now-and-what-do-i-owe-next)
- **Done:** After submit, the user has a real status page: received, queued, in review with which unit, decision drafted, issued — with timing drawn from actual recent throughput, not vendor estimates. Reachable without an account, by magic link or one-time code. Each status change names the event, the source, the new state, and what the user should do next, if anything.
- **Anti-patterns:** AP-006, AP-013.

### FW-0040 — Embed: form lives in the host's page

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-018](JOURNEYS.md#j-018--im-filling-this-out-on-a-site-i-came-to-for-something-else)
- **Done:** A nonprofit, clinic, or city department can put the form on their own page. The respondent never leaves the host's site, never sees "powered by" chrome, never gets bounced to an unfamiliar domain. The receipt names the host as issuer. The verifier (FW-0003) remains neutral and unbranded.
- **Anti-patterns:** —
- **Note:** Architectural cousin of FW-0009 (embeddable widget for third-party hosts) was removed; this row carries the use case. The shared-component design lives in the same place.

### FW-0041 — Public-terminal hygiene

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-019](JOURNEYS.md#j-019--im-on-a-public-library-terminal-with-twenty-minutes-and-no-email)
- **Done:** A user on a library or shelter terminal can finish a form, receive a receipt by SMS or print a confirmation with a short verifier code, and sign out leaving no autofill memory and no session for the next user to inherit. The receipt is theirs to walk out with. The "where do we send the confirmation?" question doesn't assume email.
- **Anti-patterns:** AP-001, AP-006, AP-017.

### FW-0042 — Share-draft-with-a-trusted-reviewer

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-014](JOURNEYS.md#j-014--let-me-share-this-draft-with-my-lawyer-mid-flight)
- **Done:** The user can send a link that lets a lawyer, accountant, advocate, or family member see the live draft, leave field-anchored comments, and suggest edits — without that reviewer making an account and without the user handing over their login. The reviewer cannot sign on the user's behalf; their role is structurally distinct. The respondent decides what to accept.
- **Anti-patterns:** —

### FW-0043 — Abandon-and-erase with a deletion receipt

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-030](JOURNEYS.md#j-030--let-me-nope-out-without-leaving-a-trail)
- **Done:** A first-class "delete this draft and forget me" action. Deletion is real — not "anonymized analytics," not "preserved for your convenience." The user gets a signed deletion receipt with the same fidelity as a submission receipt. The privacy notice describes this plainly.
- **Anti-patterns:** —

### FW-0044 — Offline-capable form-fill with deferred submit

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-045](JOURNEYS.md#j-045--i-have-no-signal--let-me-finish-the-form-anyway-and-let-it-submit-itself-when-im-back-online)
- **Done:** A respondent can load the form once with a signal, then complete it entirely offline — every branch, every validation, every help text, every signature step. Drafts save on the device. Submit queues and fires the moment connectivity returns, with no duplicates. The receipt in their hand is real and verifiable, even if the platform's servers are unreachable.
- **Anti-patterns:** AP-001, AP-013, AP-015.

### FW-0045 — Platform conversational mode (anti-Clippy)

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-011](JOURNEYS.md#j-011--talk-me-through-it-like-a-person-would)
- **Done:** A respondent who'd rather talk through the form than navigate a field grid can choose a conversational mode: one question at a time, in plain language, producing the same validated, branched, signed submission an expert user would have produced manually. The receipt records that assistance occurred and which fields were AI-authored, but the receiving agency never sees an aggregate "AI score." The non-AI path has the same fields, the same fees, the same SLA, the same help text — no penalty for declining.
- **Anti-patterns:** AP-007.
- **Note:** Anti-Clippy constraints — ambient never interruptive, pull not push, no persona, keyboard-first — apply verbatim. Distinct from FW-0057 (bring-your-own-assistant).

### FW-0046 — Pre-flight routing: three questions, not four hundred

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-047](JOURNEYS.md#j-047--three-questions-instead-of-four-hundred--figure-out-which-form-i-actually-need)
- **Done:** A respondent who doesn't know which form applies answers a short, plain-language check — three to ten questions — and gets sent to the right one. The decision is shown to them: these questions, these answers, this reasoning. The result has a sensible memory window so a return visit doesn't redo the whole check. If their situation has changed, they can redo it; prior answers come back as defaults.
- **Anti-patterns:** AP-006, AP-008, AP-022.

### FW-0047 — Respondent-side place: design investigation

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Platform
- **Journey:** [J-039](JOURNEYS.md#j-039--show-me-what-i-owe-whom-across-every-form-ive-ever-filled-out), [J-042](JOURNEYS.md#j-042--my-documents-are-in-my-library--i-share-them-with-each-form-on-my-terms), [J-043](JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
- **Done:** An ADR-grade design output that names how the platform would host a respondent-controlled view across all senders — what's coming (obligations), what I have (documents), what I've done (history). Trust model, data ownership, encryption-at-rest posture, export and deletion guarantees, who-can-read-what defaults, and an honest accounting of the architectural shift from "transit between issuer and respondent" to "the respondent's own place." Builds (FW-0055..0057) are downstream.
- **Anti-patterns:** AP-006, AP-024.
- **Note:** This trio is architecturally substantial enough that the design work is its own row. Building any of them without this design row is how you ship something that locks the respondent out of their own data later. The trust model is the load-bearing artifact.

### FW-0048 — Coercion-aware signing: research and threat-model row

- **Lane:** Next
- **Status:** open
- **Persona:** Signer / Platform
- **Journey:** [J-027](JOURNEYS.md#j-027--when-im-being-coerced-give-me-a-back-channel-that-doesnt-tip-off-the-coercer)
- **Done:** A worked threat-model and design output for coercion-aware signing on the high-risk template set — financial powers of attorney, immigration sponsorship, benefits redirection, advance directives, marriage and divorce filings. The output names the discreet duress affordance, the routing target (typically issuer-defined victim services), how the activation stays invisible to a shoulder-surfer and to a coercer watching the screen, how the public receipt records nothing that tips off the coercer, and what the platform records privately. The build is downstream (FW-0058).
- **Anti-patterns:** AP-014, AP-021.
- **Note:** The hardest journey in the corpus. The cowardly move is to call it out of scope. The careless move is to ship it without a threat model. This row commits to the design work without yet committing the build.

### FW-0049 — Safe-address handling: research and design row

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer / Platform
- **Journey:** [J-037](JOURNEYS.md#j-037--safe-address-handling-for-survivors-and-protected-parties)
- **Done:** Design output naming how protectable fields (home address, phone, employer) are substituted with state Address Confidentiality Program equivalents at the field, receipt, and verifier layer, while keeping the artifact cryptographically verifiable and structurally indistinguishable from a non-redacted one (so the *existence* of redaction is not a tell). Names which surfaces are touched, what the form-author opt-in looks like, and what the per-party variant looks like (so multi-party filings respect one party's address protection without leaking it to the others).
- **Anti-patterns:** AP-014.

### FW-0050 — Multi-party submission: research and design row

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Signer / Platform
- **Journey:** [J-041](JOURNEYS.md#j-041--multi-party-forms-many-respondents-one-submission-load-bearing-for-joint-legal-tax-immigration-custody-and-financial-work)
- **Done:** Design output for joint-submission flows where each party authenticates independently, holds their own draft, sees only the parts the form's privacy model says they should see, signs their own attestations cryptographically separately, and the resulting receipt names everyone with roles, timestamps, and signatures. Names per-party state, per-party visibility scoping (including the safe-address case per FW-0049), per-party signature timing, deterministic merge, and the disagreement-is-a-state primitive. Build is FW-0059.
- **Anti-patterns:** AP-002, AP-014.
- **Note:** Architecturally significant. Joint flows controlled by one party are the worst coercion vector in the corpus — get this right or don't ship multi-party.

### FW-0051 — Bring-your-own-assistant: structure exposure and consent model

- **Lane:** Next
- **Status:** open
- **Persona:** Respondent / Platform
- **Journey:** [J-046](JOURNEYS.md#j-046--let-me-use-the-assistant-i-already-use-not-whatever-this-form-ships)
- **Done:** Design output for letting the respondent's own assistant — whichever one they use — see the form's structure, propose values, and check answers, with every proposal landing as a visible suggestion the respondent must confirm. Names what the form exposes (structure, validation rules, contextual help), what it doesn't (other respondents' content, the model behind FW-0045), and how consent and revocation work per assistant. The "no assistant" path stays exactly as good as the assisted one.
- **Anti-patterns:** AP-002, AP-007, AP-024.
- **Note:** Architecturally significant: the platform stops being the only place AI happens. Pairs with FW-0045 (platform's own assistant) — both must exist, neither should require the other. Build is FW-0060.

## Later

### FW-0052 — Offline verifier as a downloadable static bundle

- **Lane:** Later
- **Status:** open
- **Persona:** Evaluator
- **Journey:** [J-007](JOURNEYS.md#j-007--evaluator-verifier-validates-a-receipt--without-an-account-without-trusting-us)
- **Done:** A static verifier — single ZIP, no network — that an auditor downloads, runs locally, and gets the same answers as the public one. Trust-load-bearing for "verify without us, ever, including if we cease to exist."
- **Anti-patterns:** AP-023.
- **Note:** Pulled forward if a government RFP requires offline verifiability. Otherwise Later — the online verifier (FW-0003) carries the positioning bet.

### FW-0053 — Embeddable respondent widget for third-party hosts (CSP-safe)

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-002](JOURNEYS.md#j-002--respondent-fills-out-a-form-recovers-from-validation-and-never-loses-work) and [J-018](JOURNEYS.md#j-018--im-filling-this-out-on-a-site-i-came-to-for-something-else)
- **Done:** The respondent renderer can be embedded as an iframe or web component on a third-party site, with a CSP-safe handshake. Used by adopter sites that don't want a redirect at all.
- **Anti-patterns:** —
- **Note:** The Now-lane embed (FW-0040) carries the user-visible promise. This row is the harder technical variant for adopters with strict content-security requirements. Pull forward if a launch customer demands it.

### FW-0054 — Long-life receipt portal (no-account read access)

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent / Signer / Evaluator
- **Journey:** [J-009](JOURNEYS.md#j-009--the-receipt-is-an-object-i-own--and-i-can-prove-this-years-later)
- **Done:** A long-lived public surface where a receipt URL plus one possession factor (the original email, a printable code, a device-bound key) opens the bundle five years later without an account. Survives this platform's organizational changes.
- **Anti-patterns:** AP-006.
- **Note:** Subset of the J-009 promise. The Now-lane FW-0009 ships the receipt itself; this row is the durable read surface.

### FW-0055 — Respondent-side obligations stream

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-039](JOURNEYS.md#j-039--show-me-what-i-owe-whom-across-every-form-ive-ever-filled-out)
- **Done:** A cross-sender view the respondent owns: what's due, to whom, by when, across every issuer using the platform. Per-matter mute / batch / escalate. Calendar export. Sender-side notification budgets visible. Senders trying to circumvent the user's preferences are surfaced as a signal.
- **Anti-patterns:** AP-006, AP-014.
- **Note:** Build phase of the respondent-side-place cluster. Gated by FW-0047 design.

### FW-0056 — Respondent-side document library with selective presentation

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-042](JOURNEYS.md#j-042--my-documents-are-in-my-library--i-share-them-with-each-form-on-my-terms)
- **Done:** The respondent's documents — passport, license, tax forms, medical records, professional credentials — live on their side and are recognized by what they are, not by what each form happens to call them. When a new form asks for one, the user chooses how much to share: the full document, a redacted version, or just the derived answer the form actually needs ("is 18 or older," "income above $X"). Permissions are revocable per presentation.
- **Anti-patterns:** AP-006, AP-024.
- **Note:** Build phase. The privacy / encryption / portability model is set in FW-0047 — do not ship without it.

### FW-0057 — Respondent-side history across every issuer

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-043](JOURNEYS.md#j-043--show-me-every-form-ive-ever-submitted-started-or-signed)
- **Done:** A searchable, filterable, exportable view of every draft, submission, and signed record the user has on the platform. Linked to receipts, verifier paths, the obligations they created, and the documents that backed them. The user can prove their own history without re-contacting any issuer.
- **Anti-patterns:** AP-006.
- **Note:** Build phase. Together with FW-0055 and FW-0056 this is the architectural shift from transit to place.

### FW-0058 — AI-agent filer chain (non-human capacity)

- **Lane:** Later
- **Status:** open
- **Persona:** Signer / Platform
- **Journey:** [J-012](JOURNEYS.md#j-012--im-filing-this-for-someone-else--or-as-a-non-human-agent--and-the-receipt-must-say-so) (the AI-agent slice)
- **Done:** A submission from an automated agent shows the full chain on the receipt: agent, operator, the accountable human, and the scope of the authority. The verifier renders that chain so a recipient can see exactly who is on the hook. No agent submission ever silently appears as a human's.
- **Anti-patterns:** AP-014, AP-024.
- **Note:** Split deliberately from FW-0037 (human-capacity variants) to keep the Next-lane row shippable. Pull forward if an early adopter has agentic intake.

### FW-0059 — Coercion-aware signing build

- **Lane:** Later
- **Status:** open
- **Persona:** Signer
- **Journey:** [J-027](JOURNEYS.md#j-027--when-im-being-coerced-give-me-a-back-channel-that-doesnt-tip-off-the-coercer)
- **Done:** The duress affordance designed in FW-0048 lands on the high-risk template set. Activation is invisible to a shoulder-surfer, routes to issuer-defined victim services without halting the form, and is recorded in the platform's private audit trail but not in the public receipt.
- **Anti-patterns:** AP-014, AP-021.
- **Note:** Build gated on FW-0048's threat model. Do not ship before then.

### FW-0060 — Safe-address handling build

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-037](JOURNEYS.md#j-037--safe-address-handling-for-survivors-and-protected-parties)
- **Done:** Protectable fields, ACP substitution, structurally-consistent redaction, and per-party visibility (per FW-0050) land across the form, the receipt, and the verifier. The presence of redaction is not itself a tell.
- **Anti-patterns:** AP-014.
- **Note:** Build phase. Gated on FW-0049 design.

### FW-0061 — Multi-party submission build

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent / Signer
- **Journey:** [J-041](JOURNEYS.md#j-041--multi-party-forms-many-respondents-one-submission-load-bearing-for-joint-legal-tax-immigration-custody-and-financial-work)
- **Done:** Joint-submission flows that match the design in FW-0050: per-party authentication, per-party drafts, per-party visibility, per-party signatures, deterministic merge, and a receipt that names every party with timestamps and signatures.
- **Anti-patterns:** AP-002, AP-014.
- **Note:** Build phase. Gated on FW-0050 design. Cross-cuts FW-0060 (per-party safe address) and FW-0042 (reviewer collaboration).

### FW-0062 — Bring-your-own-assistant build

- **Lane:** Later
- **Status:** open
- **Persona:** Respondent
- **Journey:** [J-046](JOURNEYS.md#j-046--let-me-use-the-assistant-i-already-use-not-whatever-this-form-ships)
- **Done:** Form structure, validation rules, and contextual help are exposed in a stable, documented shape any third-party assistant can read. Proposals from the assistant land as suggestions the respondent confirms; nothing applies silently. Per-assistant consent and revocation are first-class.
- **Anti-patterns:** AP-002, AP-007, AP-024.
- **Note:** Build phase. Gated on FW-0051 design.

## Closed

*(none yet)*

---

## Verdict and pressure-tests

**Strongest case against this sequencing:** I put six rows in `Now (alpha)` and four in `Now (parity)`. A defensible counter-argument says `Now (alpha)` should be three rows — the thin-slice respondent flow, the verifier, and the trust center — and that FW-0004 (first-paint legitimacy), FW-0005 (one-handed phone), FW-0006 (trail-sign cover), and FW-0007 (pre-submit consequences) should slip to `Next`. The argument: a smaller `Now` ships faster, and FW-0001 implicitly covers FW-0004/FW-0005 if the implementer is competent. My counter is that "implicitly covered" is exactly how phone parity and first-paint legitimacy get lost — pulling them out as named rows makes them inspectable. But the strongest pushback would say: name them as acceptance criteria on FW-0001 instead of standalone rows, and put the saved row-budget into actually shipping FW-0033 (file upload) sooner, because regulated buyers will press on document handling before they press on copy density.

**Three rows I'm least confident about:**

1. **FW-0006 (trail-sign cover page) in `Now (alpha)`.** It's a high-leverage row, but it depends on real completion-time data that doesn't exist yet from this platform. Risk: it ships with vendor-estimate "5 minutes" theater (the very thing J-024 warns against) because the data isn't there. Mitigation: ship without the median/p90 numbers initially and add them once the platform has enough completed submissions to draw from. The cost/checklist halves still work. If that mitigation isn't acceptable, this row belongs in `Next`.
2. **FW-0009 (paper receipt) in `Now (parity)`.** The paper-render variant is arguably a polish ahead of where alpha needs to be. The case for it: the first regulated demo will end with someone asking "can my clerk accept this?" — and a screenshot won't survive that question. The case against: the digital receipt alone meets the parity bar with the server, and paper can be FW-0009's Next-lane decomposition. I left it in `Now (parity)` because losing the first regulated buyer over "this isn't acceptable at the clerk's desk" is a worse outcome than landing one extra row. Marginal call.
3. **FW-0048 (coercion threat-model research row) in `Next`.** The design row is in `Next`; the build is in `Later`. The pushback: even putting the *design* in `Next` is ambitious given the threat-model work, the legal-counsel involvement, and the need to coordinate with issuer-defined victim-services routing. If `Next` lane discipline matters, this row may need to land in `Later` alongside its build, with only a placeholder in `Next`. I kept it in `Next` because not committing to the design work is functionally equivalent to deferring the entire journey indefinitely, and J-027 is the single most morally-load-bearing journey in the corpus. Worth a check-in after FW-0001 lands.

**The thing this rewrite may have missed:**

The corpus has no explicit row backing the *Trust Center as a working artifact graph* — i.e., the Trust Center should not just list subprocessors and a data-flow diagram, but should let an evaluator click "show me the selective-proof for SOC 2 control X" or "show me the signed attestation for subprocessor change Y on this date" and land in the verifier (FW-0003) against a real artifact. FW-0002 says "selective-proof artifacts are linked" but treats them as static links. The deeper play — the Trust Center is a *living* index where every claim has a verifiable backing artifact, browsed by the same evaluator who uses the verifier on receipts — would change FW-0002's scope and arguably belongs in `Now (alpha)` as a positioning multiplier alongside FW-0003. I did not promote this to a row because the corpus' J-006 framing is shallower than that, but if the platform-strategist position holds ("the visible product sells the meeting"), this is the missing row that would make the Trust Center sell *with* the verifier instead of merely beside it.

**Coverage exceptions** — journeys without a dedicated FW-* row:

- **J-001 (first-paint legitimacy):** backed by FW-0004.
- **J-002 (fill / recover / never lose work):** backed by FW-0001 (thin-slice) and FW-0013 (errors deep cut). The save-resume / multi-device sub-promise is implicit in FW-0001; if it doesn't survive the thin-slice work, it earns its own row.
- **J-003..J-024:** each has a row (FW-0011, FW-0012, FW-0006, FW-0019, FW-0020, FW-0021, FW-0022, FW-0023, FW-0024).
- **J-025..J-031:** each has a row (FW-0025, FW-0026, FW-0048, FW-0029, FW-0027, FW-0043, FW-0035).
- **J-032..J-038:** each has a row (FW-0028, FW-0036, FW-0030, FW-0031, FW-0032, FW-0049, FW-0009 paper variant).
- **J-039 / J-042 / J-043 (respondent-side place):** design row FW-0047 in `Next`; build rows FW-0055 / FW-0056 / FW-0057 in `Later`. Architectural-shift cluster, called out explicitly.
- **J-040 (file upload):** FW-0033.
- **J-041 (multi-party):** design FW-0050 in `Next`; build FW-0061 in `Later`. Architectural-shift, called out.
- **J-044..J-047:** each has a row (FW-0034, FW-0044, FW-0045, FW-0046).
- **J-046 (BYO assistant):** design FW-0051 in `Next`; build FW-0062 in `Later`. Architectural-shift, called out.
- **J-012 (filer ≠ signer ≠ subject):** human variants FW-0037 in `Next`; AI-agent variant FW-0058 in `Later`.

Every journey is backed. No journey is silently deferred.

**Confidence label:** *plausible-but-unverified*. The framing, the lane discipline, and the architectural-shift decomposition are defensible. What I cannot verify from this seat: whether the launch customer's actual procurement criteria will validate `Now (alpha)`'s contents (FW-0006 and FW-0007 in particular are leaning on a model of regulated buyer behavior I haven't pressure-tested with a real deal), whether FW-0047/FW-0048/FW-0049/FW-0050/FW-0051's design work will fit inside `Next` without crowding out shippable rows, and whether the "missing Trust Center artifact graph" critique above should already be a row. The first real customer conversation should be treated as a forcing function to reorder this list, not as confirmation of it.
