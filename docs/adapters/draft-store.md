# DraftStore Adapters

`HttpDraftStore` is the formspec-stack reference adapter.

It mirrors the current `formspec-server` draft routes:

- `POST /runtime/forms/{form_id}/drafts` creates a server draft.
- `GET /drafts/{draft_id}` verifies the mapped draft still exists.
- `PATCH /drafts/{draft_id}` saves new draft state for respondent-bound drafts.

The port key remains `{ formUrl, formVersion?, subjectRef? }`. The adapter owns
the local key-to-`draft_id` mapping, so callers never handle server draft IDs.

`formspec-server` does not currently expose `DELETE /drafts/{draft_id}` (EXT-21),
so `delete()` clears only adapter-local access. Explicit Clear drains existing
saves, then removes the scoped locator and credentials.

A signing cohort with `qualifiedDraftState` treats authenticated identity
retirement separately: it rejects obsolete local work, clears cached answers,
and retains only the subject-scoped server draft ID, revision, and response ID.
Anonymous invalidation retains its existing clear behavior. The selected native
OIDC composition also scopes these locators to its issuer and client, endpoint,
and tenant. Retained locators confer no access; recovery requires a fresh bearer
and an owner-qualified server GET against the exact form publication.

Recovery of a signed active response checks its saved revision, exact authored
signing content and Locale, and maintained delegated evidence consistency. It
regenerates the signed review and requires fresh review readiness before Submit.
It restores no prior preparation, assent, or ready state, and preserves refusal
for unresolved signing operations. These checks do not independently verify the
delegated signature cryptographically. Missing or older-context locators remain
unavailable; this path does not reconstruct or migrate them. Recovery is tab-local
and does not provide cross-device draft discovery. After signed recovery at the
entry page, the native host offers a review control from the exact admitted
Submit widget route. It preserves the active host and selected package; fresh
review, including saved attachments, still gates Submit. Ambiguous, colliding,
or unresolved routes do not produce a recovery control.

Anonymous production saves intentionally create a fresh server draft on each
save and move the local binding to that new `draft_id`. The current server
`PATCH /drafts/{draft_id}` command cannot carry or verify the anonymous session
token, so the reference web composition avoids that route for anonymous drafts
until the server exposes a session-bound update contract (EXT-27).

## Composition pairing

The formspec-stack reference composition wires `HttpDraftStore` and
`HttpSubmitTransport` together through `createHttpAdapterCohort(config)` (see
`src/adapters/http/cohort.ts`), which shares the draft-id binding through a
private registry captured in the cohort closure. The cohort is the wiring path;
the standalone constructor stays viable for adopters with their own draft-id
source (and is what the conformance suite uses). See `docs/adapters/submit-transport.md`
for the submit-side of the pairing.

Run:

```bash
npm test -- tests/adapter-conformance/draft-store
npm test -- tests/adapters/http/draft-store.test.ts
npm test -- tests/adapters/http/cohort.test.ts
```
