# Browser scoped metadata

`createBrowserScopedMetadataStore`, `BrowserScopedMetadataConfig` and
`ScopedMetadataStore` are exported from `formspec-web/shared`. The synchronous
store reads unknown parsed JSON, writes values and removes slots. Callers
validate the meaning and completeness of their metadata.

```ts
import { createBrowserScopedMetadataStore } from 'formspec-web/shared';

const metadata = createBrowserScopedMetadataStore({
  namespace: 'application:pending-operation:v1',
  context: { deployment: 'qualified-deployment', actor: 'qualified-actor' },
});
metadata.write('qualified-operation', { key: originalKey, body: originalBodyText });
const retained: unknown = metadata.read('qualified-operation');
// Validate retained metadata and current association before using it.
```

Namespace must contain one or more letters, digits, colons, dots, underscores
or hyphens. Context must serialize to a JSON object. The factory captures its
serialization once, preserving property order. Slots are nonempty strings;
namespace and slot are never trimmed. The address is
`namespace + ':' + JSON.stringify(context) + ':' + slot`. Stored records retain
`{context: serializedContext, slot, value}`. Strings, including original keys
and HTTP body text, retain their exact contents through a read.

Missing slots return `undefined`. Reads refuse invalid JSON, missing own
`context`, `slot` or `value` properties, and context or slot mismatches. Writes
serialize before accessing storage, refuse omitted top-level values and
serialization errors, and verify exact readback. Removes verify absence.
Failures throw an error with its cause; callers must handle uncertain writes
or removals. No fallback store or automatic replacement operation is created.
Nested values retain ordinary `JSON.stringify` behavior: optional undefined
properties are omitted, for example. This helper does not validate a domain
schema or promise lossless persistence of arbitrary JavaScript values.

An optional injected storage implements `getItem`, `setItem` and `removeItem`.
Otherwise, the helper accesses `window.sessionStorage` only during operations.
This provides same-tab reload persistence, with no crash, restart or multi-device
recovery guarantee. Metadata grants no authority and proves no server result.
Keep actor, deployment, task, operation, credential and provenance validation in
the owning caller. Saving HTTP body text does not add an HTTP dispatch method.

The draft-resume factory delegates to this helper with its existing deployment
context and `formspec-web:draft-resume:v1` namespace. Existing valid draft keys,
record bytes and values remain compatible; no migration is required. Draft,
anonymous-session and signing callers keep their existing domain checks.
