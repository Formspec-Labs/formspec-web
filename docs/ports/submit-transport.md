# SubmitTransport

`SubmitTransport` submits a validated `IntakeHandoff` from
`@formspec-org/types` and returns a respondent-facing confirmation.

Adapter contract:

- Accept schema-valid public-intake handoffs.
- Require UUIDv7 idempotency keys.
- Use the stack-common `idempotency-key` header when crossing HTTP.
- Return the same confirmation for the same key and distinct confirmations for
  distinct keys.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/submit-transport
```
