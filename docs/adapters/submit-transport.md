# SubmitTransport Adapters

`HttpSubmitTransport` is the formspec-stack reference adapter.

It calls `POST /drafts/{draft_id}/submit` and sends the caller-supplied
UUIDv7 idempotency key in the `idempotency-key` header, matching
`formspec-server` middleware. The adapter requires a `draftIdResolver` because
the port submits an `IntakeHandoff` while the server route is draft-scoped.

The submit body maps to `SubmitDraftCommand`:

- `response_data` comes from an injected resolver or `handoff.extensions["x-formspec-response-data"]`.
- `subject_ref` comes from `handoff.subjectRef` when present.
- `anonymous_session_token` and `signing_requested` are injected composition values.

Run:

```bash
npm test -- tests/adapter-conformance/submit-transport
npm test -- tests/adapters/http/submit-transport.test.ts
```
