# Optional application lifecycle

A native package can admit a `startApplication` response action and three writable Boolean instance fields for `canStart`, `started`, and `persistentSaving`. The HTTP loader reads `GET /runtime/forms/{form_id}/application-lifecycle` with the selected authenticated session and tenant scope. Its `formVersionId` must match the admitted publication. The browser has no independent feature toggle.

Deliberate Start checkpoints the current answers through the existing admitted Save action when no owned draft exists. Save uses validation profile `off`, so incomplete answers can be retained. Start then posts `{}` to `/drafts/{draft_id}/application-case`. An unsuccessful case request retains the owned checkpoint. A subsequent Start uses that draft again; the server's stable draft-based key identifies the association across distinct native invocations.

Only an actual four-field receipt supplies the case identity, display reference, draft reference, and `in-progress` or `submitted` status. The UI displays the case reference. It keeps ledger and draft references private. Start does not run on page load, and signing or source acceptance alone does not claim that WOS has submitted the case.

Fresh owned-draft recovery composes its qualified draft GET and case GET under one operation guard. `GET /drafts/{draft_id}/application-case` returns HTTP 200 with an exact receipt or JSON `null` for qualified absence. Other statuses remain errors. Reads continue to work when early creation is disabled. Explicit status refresh reads the same association and refuses identity changes or a submitted-to-in-progress regression.

With persistent saving enabled, native controls say Save progress and the host reports unsaved, saving, saved, or failed checkpoints. With persistent saving disabled, those same required Save actions prepare or update a signing copy. That mode retains owned draft GET/PATCH, same-owner expiry recovery, signing staging, and accepted-response retention; it promises no optional Save for later feature. With early creation disabled, the native Start control is hidden and the backend retains case-after-Submit behavior.

Case identity survives local edits and language changes. Signed recovery retains the exact signed Response and requires fresh attachment review before Submit. Submitted recovery shows the accepted Response receipt and any qualified case status without creating an editable form. Clearing saved access removes local access through the existing draft lifecycle; it does not delete a retained backend case.

Verification covers capability publication mismatch, native admission, all four option combinations, incomplete checkpoints, failed Start retry, edits and language changes, signed and submitted recovery, current-owner reads, stale completion retirement, and HTTP error handling. Browser login, backend restart, and durable case transitions require the runtime owner's separate execution evidence.
