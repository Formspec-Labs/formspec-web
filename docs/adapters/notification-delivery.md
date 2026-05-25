# NotificationDelivery Adapters

The MVP ships `NotificationDelivery` as stub-only.

There is no `formspec-server` `/notifications` route in the current stack
(EXT-19), so formspec-web does not ship an HTTP notification adapter at M4.
`MagicLinkAdapter` can consume the stub locally and surface the generated
magic-link URL inline for development.

FW-0041 uses the same port for public-terminal SMS receipts. The OSS reference
composition still wires the stub adapter; adopter compositions that need real
SMS wire a transport provider behind `NotificationDelivery` without changing
the respondent runtime.

Run:

```bash
npm test -- tests/adapter-conformance/notification-delivery
```
