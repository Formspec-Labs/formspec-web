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
- Treat unknown and inaccessible status requests uniformly: return `undefined`
  or throw `StatusReadError` with code `access-denied` for both.
- Use `sign-in-required` for a missing or retired authentication session and
  `unavailable` for incomplete reads or service failures. These are never empty cases.
- Keep authorization and applicant-scope filtering in the adapter/upstream
  service, not in the React shell.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/status-reader
```

## Authenticated durable case navigation

The maintained `/status?caseLedgerId=<opaque>` route carries one complete durable
case selector. The identifier supplies navigation only. The host requires
ordinary OpenID Connect sign-in, and WOS checks original applicant ownership,
tenant scope, accepted intake association and current task permissions. Task
revision, definition/publication selections and persisted expiry come from
current owning reads after sign-in, never from this URL.

`HttpStatusReader` reads the selected durable case through
`GET /api/v1/applicant/cases/{encodeURIComponent(caseLedgerId)}`. Its server must
implement the owner-checked durable-case read; the older reference service's
process scan and unconditional empty task lists do not qualify this adapter.
A successful owned read can contain no open tasks. Missing ownership, absent or
ambiguous accepted intake, incomplete native delivery and failed reads cannot
stand in for that result. The current backend successor remains independently
qualified by its owner before deployment.

Missing and foreign cases share the same denial. The shared conformance suite
accepts uniform `undefined` or uniform typed `access-denied`; the authenticated
HTTP adapter uses typed denial for both HTTP 403 and 404. It never presents a
case as empty because a read failed. `StatusRuntime` removes loaded status and
task actions when its selected browser session retires, changes or expires.

## Disabled-status rendering

When the resolved runtime profile disables `status` (web ADR-0011), neither
`RespondentRuntime`'s in-form panel nor `StatusRuntime`'s standalone page
calls `readStatus`. The honest copy is `"Status not shared"` plus a
disabled-cause-keyed detail. Adapters do not need to handle the
policy-disabled case; the resolver short-circuits before the call.

## Throughput aggregation

Out of scope for `StatusReader`. The "actual recent throughput" half of
J-021 / FW-0039 needs a workflow-scoped cross-case statistic — filed as
`EXT-29` in [the upstream extension queue](../../thoughts/specs/2026-05-22-upstream-extension-queue.md)
and consumed by FW-0067 once it lands.
