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

## Optional resumable upload extension

FW-0076 adds `ResumableAttachmentStore` as a narrow optional extension:

```ts
uploadResumable(blob, metadata, { chunkSizeBytes, onProgress })
```

The baseline `upload(blob)` method stays valid. The field renderer detects
`uploadResumable` when present and reports byte-level progress on the upload
row. Adopters use this extension for multipart object stores, tus-style
uploads, or browser-stream-backed upload paths that survive flaky networks.

Adapters that implement the extension MUST call `onProgress` with
`loadedBytes`, `totalBytes`, `chunksUploaded`, and `chunkCount` as chunks
commit. A final `AttachmentRef` still has the same serializable shape as the
baseline port.

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

The OSS reference demo wires `persistentDemoAttachmentStore()`, a
DEMO_STUB_ADAPTER-marked localStorage-backed store. It survives page refresh
so the bundled demo form can include an optional attachment field without
misleading contributors. Production still declares `fileUpload:
'unavailable'` and wires `unavailableAttachmentStore()` until an adopter
forks. The narrowed-route factories (`/status`, `/obligations`, `/documents`)
declare `unavailable` uniformly — those surfaces do not accept uploads.

## Field-component guardrails (`<FormspecWebAttachmentControl>`)

The respondent renderer applies two adopter-overridable guardrails on the
file picker / drag-drop surface before bytes reach the AttachmentStore:

- **`maxSize` (bytes)** — defaults to `25 * 1024 * 1024` (25 MiB). Large
  enough for typical attachment use (passport scans, lease documents,
  multi-page PDFs), small enough that an accidental 10 GB drop won't OOM
  the browser tab. Adopters override per-field via the layout node's
  `props.maxSize`.
- **`accept` (string)** — same syntax as the HTML5 `<input accept>`
  attribute (comma-separated list of file extensions like `.pdf`, exact
  MIME types like `application/pdf`, or wildcards like `image/*`). When
  set, the renderer rejects non-matching files client-side with a typed
  `AttachmentUploadError({ code: 'mime-rejected' })`. Server-side
  enforcement (the only enforcement that matters for security) remains the
  adopter's responsibility — this is UX, not policy.

## Form-policy gate

The default + stub composition's `formRuntimePolicyExtractor` (specifically
the `AttachmentRequirementExtractor` reference adapter, promoted to the
`FormRuntimePolicyExtractor` port at FW-0066) walks the loaded definition
for any field whose `dataType === 'attachment'`. If at least one is
present, the form's policy declares `fileUpload: 'required'`. The
resolver then throws `UnsupportedRequiredFeatureError` at the form-load
boundary if the instance cannot satisfy it, and the React shell renders the
fileUpload-specific copy: "This form needs file uploads, but this site is
not set up to receive files."

## Vocabulary firewall

The port name, the `AttachmentRef.kind` discriminator, the URI scheme, the
content hash, and the MIME type never appear in respondent-facing UI text.
The field-component override exports `ATTACHMENT_DEFERRED_CAPABILITY_COPY`
as the fixture-pinned plain-language string for the one remaining
upload-adjacent deferred capability: "Saving to your document library is not
yet available here."

## Capture, legibility, and redaction

FW-0073/FW-0074 add an in-page camera path to
`FormspecWebAttachmentControl`. The control opens `getUserMedia`, captures a
still frame into a canvas, warns on basic legibility failures (small
resolution, low contrast, likely glare), and then routes the captured `File`
through the same `AttachmentStore` upload path.

Image picks and camera captures enter an on-device review step before upload.
The respondent can draw redaction boxes; the control overwrites those pixels
on a canvas and uploads only the rendered redacted image. The original local
image is not passed to `AttachmentStore.upload()` when redactions exist.

## What slice 1 does not ship

- Save-to-library compose with FW-0056 (FW-0075).
- A production reference adapter for any specific object store. Adopters
  fork the composition file (<100 lines) and wire their own.
- A canonical wire-format ratification for `AttachmentRef` inside the
  `IntakeHandoff` shape. The slice-1 web work fixture-pins the shape; the
  cross-stack ratification follows in a stack-extension queue row.
