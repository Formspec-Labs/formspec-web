# StatusReader

`StatusReader` reads respondent-visible status through a WOS applicant API
projection. The port does not define lifecycle, task, notification, or timeline
status vocabularies.

Adapter contract:

- Return projections with
  `sourceSchema: "https://schemas.formspec.io/wos-api/applicant/v1"`.
- Preserve the upstream `projectionKind` instead of mapping it to a web-owned
  enum.
- Return `undefined` for unknown or inaccessible status requests.
- Keep authorization and applicant-scope filtering in the adapter/upstream
  service, not in the React shell.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/status-reader
```
