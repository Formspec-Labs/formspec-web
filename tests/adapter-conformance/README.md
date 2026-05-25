# Adapter conformance suites

Per [web ADR-0009 §"Conformance suite per port"](../../thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md), every port has an executable conformance suite under `tests/adapter-conformance/<port>/`.

Adapter authors import the public source-level harness from
`formspec-web/adapter-conformance`. This repo's local test suites re-export
that same public surface through `tests/adapter-conformance/_framework/conformance.ts`
so first-party tests and adopter-facing helpers cannot drift apart.

Minimum bar per port:
- One schema-validity round-trip (input → adapter call → output → schema validate).
- One negative case per conformance invariant.

Shared fixtures live in `src/adapter-conformance/fixtures.ts` so the public
harness and local suites exercise the same schema-shaped examples.

The per-port suite *shape* is defined in ADR-0009; the per-port suite *content* (specific fixtures) lands alongside each port spec ADR or its first consumer FW row.

Directory skeleton (one per current port):
- `definition-source/`
- `draft-store/`
- `submit-transport/`
- `identity-provider/`
- `notification-delivery/`
- `respondent-place-source/`
- `status-reader/`
- `attachment-store/`
- `form-runtime-policy-extractor/`
- `respondent-history-source/`
- `offline-submit-queue/`
