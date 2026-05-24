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

## URN-as-bearer-token semantics (FW-0039 slice 1)

The `/status?case={WosResourceUrn}` route (FW-0039 slice 1) hands the URN
through the request unchanged. The slice's accountless-access honesty
depends on **two adapter-side responsibilities** the port does not enforce:

1. **Rate-limit unknown-URN probes.** WOS URNs follow the
   `stack-common-typeid` grammar (`urn:wos:case_{tenant}_{uuidv7_base32}`).
   The UUIDv7 tail is high-entropy but not opaque-token-class; a determined
   attacker can probe at scale without rate limiting. Production adapters
   MUST rate-limit unknown-URN reads server-side.
2. **Return uniform "not found" for every unknown lookup.** Do NOT vary the
   response shape between "this URN doesn't exist" and "this URN exists but
   is not yours" — the consumer (`StatusRuntime`) renders the same
   plain-language copy in both cases. Distinguishing the two would make
   `/status?case=...` an enumeration oracle. Tenant-scope filtering remains
   the adapter's responsibility per the contract above; the failure shape
   stays `undefined`.

Adopters whose threat model rejects the URN-as-bearer-token model wire a
different adapter (magic-link rotation, browser-bound proof, OAuth scope
check) — the port stays unchanged either way. Future hardening rows
(FW-0054 long-life-receipt portal; FW-0041 public-terminal hygiene) layer
on top.

## Disabled-status rendering

When the resolved runtime profile disables `status` (web ADR-0011), neither
`RespondentRuntime`'s in-form panel nor `StatusRuntime`'s standalone page
calls `readStatus`. The honest copy is `"Status not shared"` plus a
disabled-cause-keyed detail. Adapters do not need to handle the
policy-disabled case; the resolver short-circuits before the call.

## Throughput aggregation

Out of scope for `StatusReader`. The "actual recent throughput" half of
J-021 / FW-0039 needs a workflow-scoped cross-case statistic — filed as
`EXT-28` in [the upstream extension queue](../../thoughts/specs/2026-05-22-upstream-extension-queue.md)
and consumed by FW-0067 once it lands.
