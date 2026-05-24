# AttachmentStore

`AttachmentStore` persists the bytes of files a respondent attaches to a
form, returning an `AttachmentRef` that is serializable and small enough to
travel inside the response data on the submit handoff. Without this port,
the field-component renderer would write raw `File` objects into the engine
state; `JSON.stringify` would silently collapse them to `{}` at submit time
and the receiver would never see the bytes.

Adapter contract:

- Accept a W3C `Blob` (a `File` is a `Blob` subclass) and an
  `AttachmentUploadMetadata` (`filename`, `mimeType`).
- Return an `AttachmentRef` of shape
  `{ kind: 'attachment-ref', uri, hash, size, mimeType, filename }`.
- `hash` MUST start with `sha256:` and MUST be deterministic for identical
  bytes within a single adapter instance. Cross-adapter hash agreement is
  NOT required; different adapters MAY hash differently as long as identical
  bytes yield identical refs per adapter.
- `uri` is the adapter's canonical reference to the stored bytes (for
  example `s3://bucket/key`, `attachment:abc123`, or an HTTPS URL). Treat
  it as opaque on the consumer side.
- Errors throw `AttachmentUploadError` (or any `Error`). The field-component
  surface catches and renders the message inline at the field.

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/attachment-store
```

## Why upload is separate from `SubmitTransport`

Storage and submission are orthogonal adopter concerns. Adopters wire S3,
R2, Azure Blob, server-bundled, or IPFS for storage independently of the
endpoint that accepts the submit handoff. Uploading progressively during
form fill (rather than in a single submit-time batch) also surfaces errors
at the field, not at the end of a multi-megabyte POST.

## Optional `delete` for in-flight remove

The port exposes an OPTIONAL `delete(uri: string): Promise<void>` hook. The
field-component renderer calls it when the respondent removes an
AttachmentRef from the field value before submit. Adopters who back the
port with durable object storage (S3 / R2 / Azure Blob / GCS) SHOULD
implement `delete` to avoid orphaned bytes from abandoned attaches.

Adopters who omit `delete` are responsible for submit-side cleanup by
diffing the bytes their store retains against the final `response.data`
set (the substrate-of-record). The renderer treats `delete` failures as
non-blocking and swallows them with a `console.debug` — a failing cleanup
MUST NOT interrupt the respondent's flow.

`download` and `list` are NOT in scope here. The respondent's act is "give
the file to the system." Read paths (retention sweeps, audit retention,
receipt portals, selective-proof viewers per FW-0009 / FW-0010) live on a
future `AttachmentReader` port, filed separately.

## Composition wiring

The full-app composition exposes the slot:

```ts
const composition: Composition = freezeComposition({
  // ...
  attachmentStore: yourS3Adapter(),
  instanceCapabilities: { /* ... */ fileUpload: 'available' },
  // ...
});
```

The OSS reference deployment declares `fileUpload: 'unavailable'` and wires
`unavailableAttachmentStore()` until an adopter forks. The narrowed-route
factories (`/status`, `/obligations`, `/documents`) declare `unavailable`
uniformly — those surfaces do not accept uploads.

## Form-policy gate

The default + stub composition's `getFormRuntimePolicy` walks the loaded
definition for any field whose `dataType === 'attachment'`. If at least one
is present, the form's policy declares `fileUpload: 'required'`. The
resolver then throws `UnsupportedRequiredFeatureError` at the form-load
boundary if the instance cannot satisfy it, and the React shell renders the
fileUpload-specific copy: "This form needs file uploads, but this site is
not set up to receive files."

## Vocabulary firewall

The port name, the `AttachmentRef.kind` discriminator, the URI scheme, the
content hash, and the MIME type never appear in respondent-facing UI text.
The field-component override exports `ATTACHMENT_DEFERRED_CAPABILITY_COPY`
as the fixture-pinned plain-language string for the deferred-capability
sub-line ("Camera capture, edge detection, on-device redaction, and saving
to your document library are not yet available here.").

## What slice 1 does not ship

- Camera capture, deskew, edge detection, legibility check (FW-0073).
- On-device redaction (FW-0074).
- Save-to-library compose with FW-0056 (FW-0075).
- Resumable / chunked / progressive uploads (FW-0076).
- A production reference adapter for any specific object store. Adopters
  fork the composition file (<100 lines) and wire their own.
- A canonical wire-format ratification for `AttachmentRef` inside the
  `IntakeHandoff` shape. The slice-1 web work fixture-pins the shape; the
  cross-stack ratification follows in a stack-extension queue row.
