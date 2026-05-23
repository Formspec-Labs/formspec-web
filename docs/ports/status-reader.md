# StatusReader

`StatusReader` reads respondent-visible status through WOS applicant API
resource shapes. The port does not define lifecycle, task, notification, or
timeline status vocabularies.

Adapter contract:

- Return resources conforming to
  `work-spec/schemas/api/applicant.schema.json`, such as
  `ApplicantCaseSummary`, `ApplicantCaseDetail`, `ApplicantTaskSummary`,
  `ApplicantNotificationListItem`, or `ApplicantStatusTimelineEntry`.
- Do not return the Respondent Library sidecar's `ApplicantStatusProjection`
  wrapper from this port; that wrapper is only a cache/reference field in
  `RespondentPlaceSource`.
- Return `undefined` for unknown or inaccessible status requests.
- Keep authorization and applicant-scope filtering in the adapter/upstream
  service, not in the React shell.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/status-reader
```
