# DraftStore Adapters

`HttpDraftStore` is the formspec-stack reference adapter.

It mirrors the current `formspec-server` draft routes:

- `POST /runtime/forms/{form_id}/drafts` creates a server draft.
- `GET /drafts/{draft_id}` verifies the mapped draft still exists.
- `PATCH /drafts/{draft_id}` saves new draft state for respondent-bound drafts.

The port key remains `{ formUrl, formVersion?, subjectRef? }`. The adapter owns
the local key-to-`draft_id` mapping, so callers never handle server draft IDs.

`formspec-server` does not currently expose `DELETE /drafts/{draft_id}` (EXT-21),
so `delete()` and `invalidateSubject()` clear only the adapter-local mapping.
The server also returns `DraftView` metadata, not `draft_state`; this adapter
keeps the latest saved response locally for same-session hydration until the
server read shape expands (EXT-26). Cross-reload or cross-device draft resume is
not server-backed yet.

Anonymous production saves intentionally create a fresh server draft on each
save and move the local binding to that new `draft_id`. The current server
`PATCH /drafts/{draft_id}` command cannot carry or verify the anonymous session
token, so the reference web composition avoids that route for anonymous drafts
until the server exposes a session-bound update contract (EXT-27).

Run:

```bash
npm test -- tests/adapter-conformance/draft-store
npm test -- tests/adapters/http/draft-store.test.ts
```
