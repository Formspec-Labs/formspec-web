# Adapter conformance suites

Per [web ADR-0009 §"Conformance suite per port"](../../thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md), every port has an executable conformance suite under `tests/adapter-conformance/<port>/`.

Minimum bar per port:
- One schema-validity round-trip (input → adapter call → output → schema validate).
- One negative case per conformance invariant.

Fixtures live as JSON cases under `tests/adapter-conformance/<port>/<case>/` mirroring the upstream `formspec/tests/fixtures/` pattern.

The per-port suite *shape* is defined in ADR-0009; the per-port suite *content* (specific fixtures) lands alongside each port spec ADR or its first consumer FW row.

Directory skeleton (one per MVP port):
- `definition-source/`
- `draft-store/`
- `submit-transport/`
- `identity-provider/`
- `notification-delivery/`
