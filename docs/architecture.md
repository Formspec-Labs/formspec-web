# Architecture

`formspec-web` is a hexagonal React shell. The app imports a deployment config,
builds a `Composition`, and renders only against five MVP ports:

- `DefinitionSource`
- `DraftStore`
- `SubmitTransport`
- `IdentityProvider`
- `NotificationDelivery`

Port interfaces live in `src/ports/`. They consume canonical schema types from
`@formspec-org/types`: `FormDefinition`, `FormResponse`, and `IntakeHandoff`.
Reference and stub adapters live outside the port contract and are wired only by
the composition root.

The public adapter contract is executable. Adapter authors import
`formspec-web/adapter-conformance` and run the per-port Vitest harness against
their adapter. The same harness is used by the first-party stubs under
`tests/adapter-conformance/`.

Shared stack conventions live under `src/shared/`: the UUIDv7 idempotency-key
helper uses the `idempotency-key` header name, and the Problem JSON mirror tracks
`../stack-common/schemas/error.schema.json` byte-for-byte with `error_code` as
the required machine field.
