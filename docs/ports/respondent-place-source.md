# RespondentPlaceSource

`RespondentPlaceSource` reads the respondent-held place: obligations,
documents, submission history, presentation policies, and applicant-status
projection refs.

Adapter contract:

- Return snapshots shaped like `formspec/specs/respondent-library/library-spec.md`.
- Preserve `aggregationMode: "client-wallet"` and
  `trustModel.serverAggregation: "forbidden"`.
- Use the sidecar document-kind and presentation-policy vocabularies; do not
  invent web-only kinds.
- Treat applicant status as a WOS applicant API projection reference/cache, not
  as a web status enum. Fetch live WOS-shaped resources through `StatusReader`.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/respondent-place-source
```

## Consumers

Two consumers in `formspec-web`:

- `RespondentPlacePanel` inside `RespondentRuntime` — surfaces obligations + files
  + submissions next to the form-fill view (in-form context).
- `ObligationsRuntime` at `/obligations` (FW-0055 slice 1) — standalone
  respondent-owned dashboard, identity-bound, sorted + sender-grouped + gap-
  honest. Reuses this port; calls no other (no `StatusReader`, no form-shaped
  MVP ports).

Both share `src/app/obligations-view.tsx` for the obligation render contract.
