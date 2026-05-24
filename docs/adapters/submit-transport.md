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

## Composition pairing

In the formspec-stack reference composition, `HttpSubmitTransport` is wired
together with `HttpDraftStore` through `createHttpAdapterCohort(config)` (see
`src/adapters/http/cohort.ts`). The cohort closes over a private
`DraftBindingRegistry` that the draft store writes on save and the submit
transport reads on submit; the submit transport derives the binding key from
`handoff.definitionRef + handoff.subjectRef` (see `draftKeyFromHandoff`). No
web-runtime sentinel rides through `IntakeHandoff.extensions` — `RespondentRuntime`
keeps the save-side `DraftKey` and the handoff fields aligned (FW-0064).

Adopters who wire their own draft-id source can still construct the transport
directly and inject `draftIdResolver`; the standalone path is what the
conformance suite exercises.

Run:

```bash
npm test -- tests/adapter-conformance/submit-transport
npm test -- tests/adapters/http/submit-transport.test.ts
npm test -- tests/adapters/http/cohort.test.ts
```
