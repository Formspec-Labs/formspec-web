# NotificationDelivery

`NotificationDelivery` sends pre-rendered messages for adapters that need
outbound delivery, such as magic-link identity flows. It does not define
templates, audience policy, or delivery semantics.

FW-0041 also consumes this port from the confirmation panel to send a
pre-rendered SMS receipt for public-terminal users. The shell supplies the
reference number, short verifier code, and tracking URL; the adapter remains
transport-only.

Adapter contract:

- Accept pre-rendered channel messages.
- Deduplicate repeated sends by UUIDv7 idempotency key.
- Avoid coupling template authoring to the web shell.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/notification-delivery
```
