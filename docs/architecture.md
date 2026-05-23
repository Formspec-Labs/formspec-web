# Architecture

`formspec-web` is a hexagonal React shell. The app imports a deployment config,
builds a `Composition`, and renders against typed ports:

- `DefinitionSource`
- `DraftStore`
- `SubmitTransport`
- `IdentityProvider`
- `NotificationDelivery`
- `RespondentPlaceSource`
- `StatusReader`

Port interfaces live in `src/ports/`. They consume canonical schema types from
`@formspec-org/types` where generated types exist. `RespondentPlaceSource`
mirrors `formspec/specs/respondent-library/library-spec.md`; `StatusReader`
returns WOS applicant API resources without defining a web-owned status
vocabulary. The Respondent Library sidecar may carry projection references or
caches, but live status reads stay WOS-shaped. Reference and stub adapters live
outside the port contract and are wired only by the composition root.

The public adapter contract is executable. Adapter authors import
`formspec-web/adapter-conformance` and run the per-port Vitest harness against
their adapter. The same harness is used by the first-party stubs under
`tests/adapter-conformance/`.

Shared stack conventions live under `src/shared/`: the UUIDv7 idempotency-key
helper uses the `idempotency-key` header name, and the Problem JSON mirror tracks
`../stack-common/schemas/error.schema.json` byte-for-byte with `error_code` as
the required machine field.
