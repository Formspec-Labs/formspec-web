# FW-0033 — File upload as a primary act (design)

**Date:** 2026-05-23
**Row:** [FW-0033](../../PLANNING.md#fw-0033--file-upload-as-a-primary-act)
**Journey:** [J-040](../../JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0011 (runtime feature resolution)
**Precedent (substrate shape):** [FW-0056 slice-1 design](2026-05-23-fw-0056-document-library-design.md) — runtime-feature key addition + composition coordination. **Distinct in surface:** FW-0033 is IN-FORM (no standalone route). The slice-1 pattern is port + adapter + conformance suite + in-form integration, NOT a `/uploads` route.
**Authority:** ADR-0011 §"Feature Ownership Table" enumerates `fileUpload` (instance capability: "object store plus attachment binding"; form-policy trigger: "attachment fields"). This row ratifies the port that satisfies the instance capability and the form-load wiring that gates on it. Triggers a third extension of the closed `RuntimeFeatureKey` taxonomy (after `documentPresentation` per FW-0056).

## What FW-0033 actually needs (vs the row prose)

PLANNING row J-040 frames the full vision: camera capture + deskew + edge detection + legibility check + redaction + per-question labeling. **None of that is the slice-1 substrate gap.** The substrate gap is that `formspec-web` today cannot persist the bytes of a file the respondent picks; `formspec-react`'s `FileUploadControl` stores `File` objects in the engine field value, `buildIntakeHandoff` JSON-serializes the response, and `File` JSON-roundtrips to `{}`. **Today the bytes silently disappear at submit.** That is the dishonesty slice 1 fixes.

Four independently load-bearing gaps:

1. **No port for object storage.** `formspec-react`'s file control writes raw `File` into the engine and the bytes never leave the browser. Adopters wire S3 / R2 / Azure Blob / server-bundled / IPFS for different deployments — that is the textbook adopter-shaped seam per web ADR-0009 §"port what's adopter-shaped". The port is missing.
2. **Submit handoff carries no attachment references.** Even if an adopter wires byte storage out-of-band, the `IntakeHandoff` shape has no defined slot for `AttachmentRef[]`, so the upstream service has no way to bind which bytes go with which response.
3. **No runtime-feature gate.** A form with an `attachment` field on an instance with no object-store adapter today renders the file control, lets the respondent pick a file, lets them hit submit, and silently submits `{}`. That is the ADR-0011 §Rationale #1 ("reference deployments must be honest") violation — the page LOOKS like a working upload until the receipt arrives empty.
4. **No honest-copy disabled-cause path.** When the form requires uploads and the instance cannot do them, the respondent must see a plain-language unavailable page at form load, not a broken file picker mid-flow.

Each gap is independently load-bearing. Gap 1 alone makes the feature unimplementable on production. Gap 2 makes it unimplementable end-to-end even when the adapter exists. Gap 3 makes the demo composition mislead respondents. Gap 4 turns a configuration error into a respondent-visible silent failure.

## Decision: ship slice 1 (port + conformance + stub + in-form upload affordance + handoff slot + runtime gate); defer capture / deskew / redaction / library-save

Slice 1 lands:

- A new **`AttachmentStore` port** with one operation: `upload(blob, metadata) → Promise<AttachmentRef>`. The port is intentionally minimal — no `delete`, no `download`, no `list`. The respondent's act is "give the file to the system"; the system owns lifecycle from there. (Future rows add download for receipt portals — out of slice 1.)
- A new **conformance suite** (`defineAttachmentStoreConformance`) covering: upload happy path, content-hash + size correctness, large-file behavior (deferred — see §"What slice 1 does NOT ship"), MIME passthrough, adapter idempotency under reupload, deterministic ref shape, vendor-leak invariants.
- A new **in-memory stub adapter** (`stubAttachmentStore`) carrying the `DEMO_STUB_ADAPTER` marker; stores blobs in a `Map<ref, Blob>`. Used by demo composition and the conformance suite.
- A new **unavailable sentinel** (`unavailableAttachmentStore`) carrying the `UNAVAILABLE_ADAPTER` marker; `upload` throws with a plain-language adopter-facing message.
- A new **`fileUpload` runtime-feature key** appended to the closed `RUNTIME_FEATURE_KEYS` tuple per ADR-0011 §"Feature Ownership Table" (third extension after `documentPresentation`). Mapped 1:1 to the new `attachmentStore` port slot in `FEATURE_PORT_MAP` — no slot-sharing transitional caveat (the port is the substrate AND the consumer).
- A new **`attachmentStore` slot on Composition**. Production composition defaults to `unavailableAttachmentStore()` + declares `fileUpload: 'unavailable'`. Stub/demo composition wires `stubAttachmentStore()` + declares `fileUpload: 'demo-stub'`. The coherence assertion already handles the new key automatically through the existing `RUNTIME_FEATURE_KEYS` loop.
- An **in-form upload affordance** through a `FormspecWebAttachmentControl` field-component override registered via `componentMap.fields.FileUpload` on the `FormspecProvider`. The control wraps the existing `formspec-react` `FileUploadControl` and replaces the engine value: on file pick / drop, the bytes are POSTed through `AttachmentStore.upload`; the engine value becomes `AttachmentRef` (single) or `AttachmentRef[]` (multiple). The UI shows the file name, size, upload progress (best-effort), and a remove button. `formspec-react`'s existing drag-drop zone + accept + maxSize affordances are preserved.
- **Submit handoff integration.** Because the engine value IS the `AttachmentRef` (after slice-1 upload), `buildIntakeHandoff` JSON-serializes it cleanly inside `extensions['x-formspec-response-data']` with no change to `IntakeHandoff` shape itself. The upstream service reads attachment refs out of the response data exactly as it reads other field values — no parallel sidecar plumbing. This is the **honest** integration: the engine field IS the ref, the response carries the ref, the handoff carries the ref, the upstream service can resolve the ref against the same object store the web adapter wrote to (per the deployment composition).
- **Runtime-feature gating at form load.** When `formExtractor` walks a definition and finds any `dataType === 'attachment'` field, it declares `fileUpload: 'required'` in the form-runtime-policy. The resolver short-circuits per ADR-0011 §Failure Semantics: production-instance with no object store throws `UnsupportedRequiredFeatureError` at form load → `RuntimePolicyErrorPage` renders the plain-language unavailable copy. Demo composition's stub satisfies `required`. Forms with no attachment fields are unaffected.
- **Honest deferred copy.** On the file control itself, when the upload affordance is present but the adopter has not configured a production object-store adapter (a posture only reachable today via deliberate composition fork; see §"Composition coordination"), a sub-line under the upload zone reads: "Camera capture, edge detection, on-device redaction, and saving to your document library are not yet available here." Fixture-pinned. Honesty about what's downstream.

Slice 1 does **not** ship:

- **Camera capture / deskew / edge detection / legibility check.** The "you see what the receiver sees" half of J-040 needs a device-camera stream + a client-side image processing pipeline. Both are substantial UX surfaces with their own a11y + performance + privacy lenses. Filed as **FW-0073** (post-slice-1 row) covering capture + deskew + legibility as one slice.
- **On-device redaction.** "Redact fields that don't belong to this form" needs a client-side image / PDF editor. Distinct surface; filed as **FW-0074** with explicit dependency on FW-0073 (capture must land first so there's something to redact).
- **Per-question labeling beyond what the field label already carries.** The field's own label already answers "which question" — the J-040 "labeled with which question it answers and why" promise is satisfied by the existing label binding + an OPTIONAL `definition.metadata.purpose` annotation that already covers "why" through the existing Definition-tier vocabulary (queue EXT-1 dependency for forms that want the explicit purpose). No new web work beyond what other rows already cover.
- **Save-to-library.** J-042 / FW-0056 carries the library side; the upload-to-library handoff is sibling work between the two rows. Filed as **FW-0075** (compose FW-0033 + FW-0056) — out of slice 1.
- **Virus scanning / content moderation.** Issuer / object-store concern, not respondent-UI concern. Adopters configure the scan pipeline on their object store; the web port does not enforce or gate on it.
- **Resumable / chunked uploads for large files.** The slice-1 port accepts a `Blob` and returns when the upload completes — no progress callback, no resume. Filed as **FW-0076** (resumable / chunked / progress) — known need; not blocking slice 1.
- **Attachment-binding to specific audiences** (composition with FW-0049 safe-address + FW-0056 documents — "this attachment goes to the protected-recipient channel only"). Sibling row; deferred.
- **A second port for object-store reads.** Receipts that include attachments (FW-0009 / FW-0010 selective-proof viewer) need a reader. Distinct port shape (`AttachmentReader.fetch(ref) → Blob`); not slice 1.
- **A canonical schema for `AttachmentRef`.** The TS type lives in `src/ports/attachment-store.ts`; a wire-format ratification (JSON Schema, CDDL) is a stack-extension concern (queue EXT row — see §"Honest deferrals"). Slice 1 ships the TS type; the wire shape is fixture-pinned in tests so adopters can mirror it deterministically.

## Decision on port shape: separate `AttachmentStore`, NOT an extended `SubmitTransport`

The alternatives considered:

| Option | Shape | Why rejected/accepted |
|---|---|---|
| **(a) Separate `AttachmentStore`** | Two-step: `upload(blob) → ref` happens during form-fill; submit carries `AttachmentRef[]` only. | **ACCEPTED.** Storage and submission are orthogonal — adopters wire S3/R2/Azure/server-bundled for storage independently of the submit transport. Matches the FW-0056 + FW-0055 precedent of one port per adopter-shaped concern. Lets uploads happen progressively during form-fill (not in a single submit-time batch) so the respondent sees errors immediately at the field, not at submit time. |
| **(b) Extended `SubmitTransport.submitWithAttachments`** | One-shot: bytes + handoff go to submit together. | Rejected — couples two adopter concerns; large submissions become large multipart POSTs with no progressive failure surface; the upstream service must be the object store OR proxy bytes to a separate object store, blocking the deployment topology where the object store is independent of the submit endpoint. |
| **(c) AttachmentStore wired into engine via formspec-react config** | Upload happens inside `formspec-react` without a web-layer port. | Rejected — `formspec-react` is the FEL conformance harness; baking adopter-specific storage into the layer-1 React package would force every adopter that uses `formspec-react` (including those NOT using `formspec-web`) to wire formspec-web's port. Wrong layer per the package-layering contract. |

**Decision: (a).** Justified above; matches existing port discipline.

## Decision on runtime feature key: add `fileUpload` — third taxonomy extension

ADR-0011 §"Feature Ownership Table" already enumerates `fileUpload` (instance capability: "object store plus attachment binding"; org-policy: "file limits and classes"; form-policy: "attachment fields"). The decision is to materialize the taxonomy entry, not to invent a new one.

| Concern | Gated by | Slice 1 wiring |
|---|---|---|
| Persisting uploaded bytes | `fileUpload` | New key. Production: `unavailable`. Demo/stub: `demo-stub` (in-memory). |

Implications:

1. `src/policy/feature-keys.ts`: extend `RUNTIME_FEATURE_KEYS = ['respondentPlace', 'status', 'documentPresentation', 'fileUpload'] as const` (append-only ordering).
2. `src/policy/feature-port-map.ts`: add `fileUpload: 'attachmentStore'` — 1:1 mapping, no transitional slot-sharing. Adopters wire one `AttachmentStore`; the coherence assertion picks up the new key/port pair automatically.
3. `src/composition/types.ts`: add `attachmentStore: AttachmentStore` to `Composition`.
4. **Default compositions:** `fileUpload: 'unavailable'` in production (no object store wired in the reference composition; adopters fork to wire S3/R2/etc.); `fileUpload: 'demo-stub'` in demo/stub (in-memory adapter). The demo composition's `getFormRuntimePolicy` for the demo form declares `fileUpload: 'optional'` so the policy resolution stays valid for the bundled demo form (which has no attachment field today — see §"Demo form posture").
5. **Form-policy extractor walks the definition for attachment fields.** This is the FIRST extractor that introspects definition content, vs. the existing seeded extractor that returns a literal map for the demo form. Per FW-0066 (`FormRuntimePolicyExtractor` port promotion — already triggered by FW-0056), slice-1 ships the walker inline inside `getFormRuntimePolicy` as a function-typed extractor; FW-0066 cleans it up into a port + conformance suite. Slice 1 is the second trigger pulse for FW-0066 (was already at the trigger from FW-0056 with no port promotion landed yet).
6. **Org-policy limits.** Slice 1 wires `orgRuntimePolicy.features.fileUpload: 'allowed'`; org-level upload-size / mime-class limits are a slice-2 concern (`orgRuntimePolicy.limits.fileUpload` carries `{ maxBytesPerFile, allowedMimeTypes }` — typed but unconsumed in slice 1, with a fixture-pinned schema sketch so adopters know the shape that's coming).

**Trigger pulse for FW-0066.** This is the SECOND feature row to extend the closed `RuntimeFeatureKey` taxonomy AND the first one to ship a non-literal extractor. PLANNING row for FW-0066 should be updated to cite FW-0033 as the second trigger. Per FW-0066's row body, the port promotion is a follow-on refactor blocked on nothing — pure internal contract cleanup once two extractors with non-literal behavior exist. Slice 1 explicitly does NOT pull FW-0066 forward (matches FW-0056's decision).

## Decision on composition coordination: in-form only; route-narrowed factories noop

FW-0033 is **in-form, not standalone-route.** The upload affordance lives inside the respondent form-fill flow next to the attachment field. The new `attachmentStore` slot needs to be present on every Composition (full-app + every narrowed route) because the coherence assertion iterates over `RUNTIME_FEATURE_KEYS`, but:

- **Full-app composition (`createDefaultComposition` + `createStubComposition`):** wires the real / stub adapter.
- **Narrowed-route composition (`createRouteNarrowedComposition`):** wires `unavailableAttachmentStore()` (production AND stub modes) + declares `fileUpload: 'unavailable'`. None of `/status`, `/obligations`, `/documents` accepts uploads — the narrowed-route is by definition not a form-fill surface. The coherence assertion accepts `unavailable` adapter + `unavailable` declaration as a coherent pair.

No `consumesAttachmentStore` flag added to `RouteNarrowing`. Every shipped narrowed route is uniformly noop on attachments today; if a future row needs an upload affordance on a narrowed route, that's the trigger to add the flag. Slice 1 keeps the descriptor minimal.

## Composition coordination — slot table

| Slot | Production (default) | Demo (stub) | Narrowed routes (all modes) | Notes |
|---|---|---|---|---|
| `attachmentStore` | `unavailableAttachmentStore()` | `stubAttachmentStore()` | `unavailableAttachmentStore()` | New slot. Adopters fork the production wiring per their object store. |
| `instanceCapabilities.fileUpload` | `'unavailable'` | `'demo-stub'` | `'unavailable'` | New key. |
| `orgRuntimePolicy.features.fileUpload` | `'allowed'` | `'allowed'` | `'allowed'` | Default org policy doesn't forbid uploads; instances simply can't do them by default. |
| `getFormRuntimePolicy` | Walks definition for `dataType === 'attachment'`; returns `{features: {fileUpload: 'required'}}` if any present, else `{features: {}}` — preserving the existing demo-form seeded keys when applicable. | Same walker. | Same walker (no form in scope; returns empty). | Slice 1's first non-literal extractor. FW-0066 trigger #2. |

## Demo form posture

The bundled `sample-form.json` does NOT have an attachment field today. The decision is to **leave the demo form unchanged in slice 1** — the `fileUpload` feature key is wired through the entire policy + coherence + extractor pipeline (and exercised via test fixtures that synthesize attachment-bearing definitions), but the bundled demo doesn't show the upload affordance. Reasons:

1. The demo form's narrative (employment-application-style) doesn't naturally call for an attachment; bolting one on dilutes the demo's clarity.
2. The slice-1 honesty discipline holds either way — the upload control is tested through synthetic definitions; adding it to the canonical demo would require shipping a stub object store that pretends to persist files across reloads (which the in-memory stub does NOT; refresh-the-page loses the upload). That dishonesty leaks into the "what the OSS reference shows when you `npm run dev`" surface.
3. Adopters who want to see the upload affordance work end-to-end can compose their own demo form with an attachment field; the conformance suite + the synthetic-definition tests prove the wiring.

A **follow-on row FW-0077** ("Demo form: add attachment field once a refresh-surviving demo store ships") is filed to remind us; gated on a real (or `IndexedDB`-backed) demo store, not on slice 1.

## Port boundaries

**`AttachmentStore` (new).** One operation:

```ts
upload(blob: Blob, metadata: AttachmentUploadMetadata): Promise<AttachmentRef>
```

- `Blob` is the W3C Blob API. Accepts `File` (subclass) natively.
- `AttachmentUploadMetadata`: `{ filename: string, mimeType: string }`. Filename is the respondent's chosen name (for receipt display); mime is the browser-reported MIME (adopter MAY override).
- `AttachmentRef`: `{ kind: 'attachment-ref'; uri: string; hash: string; size: number; mimeType: string; filename: string }`. `uri` is the adopter's canonical reference (e.g., `s3://bucket/key`, `attachment:abc123`, `https://...`); `hash` is `sha256:<hex>` of the bytes (the conformance suite enforces this); `size` is byte count; `mimeType` and `filename` round-trip the metadata for display.
- Idempotency: NOT enforced at the port level — adopters whose object stores deduplicate by content-hash can return the same `uri` for the same bytes; adopters whose stores don't dedupe return a fresh `uri`. The conformance suite asserts the `hash` is identical for identical bytes and may be different for different bytes.
- Error handling: failure throws an `Error` (subclass `AttachmentUploadError` carrying `cause`). The slice-1 control catches and renders the message inline at the field.

**`SubmitTransport` (no change).** The `IntakeHandoff` extensions already carry `x-formspec-response-data: response.data` — the engine value at an attachment field IS the `AttachmentRef`, and JSON serialization preserves it. No new IntakeHandoff slot. The upstream service reads `response.data[<attachment-path>]` and resolves the URI against its configured object store.

**`IdentityProvider` (no change).** The upload affordance does not require identity beyond what the form already requires.

**No new port for the upload UI itself.** The field control lives in `src/app/`; it's a React component, not a port. Adopters who want a different UX fork the component, not the port.

## Vocabulary firewall

- **Respondent-facing copy:** "file", "upload", "attached", "remove", "choose a file", "drag and drop here". Never "attachment ref", "blob", "object store", "URI", "content hash", "S3", "MIME type", "multipart".
- **Field labels:** carried through from the definition's `field.label` binding unchanged.
- **Error copy:** "We could not upload your file. Try again." + adopter-supplied detail when the `Error.message` is plain enough to surface; otherwise generic "Please try again or contact support" copy with a developer-view diagnostic.
- **Deferred-capability copy:** "Camera capture, edge detection, on-device redaction, and saving to your document library are not yet available here." — fixture-pinned.
- **Disabled-cause copy at form load** (when the form requires uploads but the instance cannot do them):
  - `optional-no-instance` → unreachable; attachment fields always declare `required`.
  - `instance-unavailable` (mapped to `UnsupportedRequiredFeatureError` per ADR-0011 §Failure Semantics) → "This form needs file uploads, but this site is not set up to receive files." (The `RuntimePolicyErrorPage` already handles typed-error rendering; we add the specific copy mapping for `fileUpload` per its err code.)
- **Spec jargon `AttachmentRef`, `attachmentStore`, `fileUpload`** stays internal — never appears in DOM, never appears in user copy, never appears in adopter-facing error messages.

## Architectural surface — minimal new code

- `src/ports/attachment-store.ts` (new) — `AttachmentStore` interface + `AttachmentRef` + `AttachmentUploadMetadata` + `AttachmentUploadError` types.
- `src/ports/index.ts` (modify) — re-export.
- `src/adapters/stub/attachment-store.ts` (new) — `stubAttachmentStore()` in-memory adapter, marked `DEMO_STUB_ADAPTER`. Hashes bytes with WebCrypto SHA-256 (falling back to a deterministic fnv-style hash if subtle crypto unavailable, matching `respondent-flow.ts:responseHash`); generates `attachment:demo-<counter>` URIs.
- `src/adapters/unavailable/attachment-store.ts` (new) — `unavailableAttachmentStore()` sentinel.
- `src/adapter-conformance/conformance.ts` (modify) — `defineAttachmentStoreConformance` + `AttachmentStoreConformanceSubject`.
- `src/adapter-conformance/index.ts` (modify) — re-export.
- `src/adapter-conformance/fixtures.ts` (modify) — `sampleAttachmentBlob`, `sampleAttachmentMetadata`.
- `src/adapter-conformance/assertions.ts` (modify) — `isAttachmentRef` shape guard.
- `src/policy/feature-keys.ts` (modify) — append `'fileUpload'` to `RUNTIME_FEATURE_KEYS`.
- `src/policy/feature-port-map.ts` (modify) — add `fileUpload: 'attachmentStore'` entry.
- `src/composition/types.ts` (modify) — add `attachmentStore: AttachmentStore`.
- `src/composition/default.ts` (modify) — wire `unavailableAttachmentStore()`, declare `fileUpload: 'unavailable'`, extend `getFormRuntimePolicy` with attachment-field walker.
- `src/composition/stub.ts` (modify) — wire `stubAttachmentStore()`, declare `fileUpload: 'demo-stub'`, extend extractor.
- `src/composition/route-narrowing.ts` (modify) — add `attachmentStore: unavailableAttachmentStore()` + `fileUpload: 'unavailable'` to both narrowed-route branches.
- `src/app/attachment-upload-control.tsx` (new) — `FormspecWebAttachmentControl` React field-component override + helpers. Wraps `formspec-react`'s `FileUploadControl` semantics; on file pick, uploads via `useComposition().attachmentStore`, replaces field value with `AttachmentRef[]`.
- `src/app/CompositionProvider.tsx` (verify) — exposes `composition` via context so the field-component override can `useComposition().attachmentStore`. Today the composition is passed as a prop into `RespondentRuntime`; check whether the existing `FormspecProvider` already wires it or if a tiny context shim is needed.
- `src/app/RespondentRuntime.tsx` (modify) — register `componentMap.fields.FileUpload = FormspecWebAttachmentControl` on the `FormspecProvider`. ALSO maps the typed `UnsupportedRequiredFeatureError` for `fileUpload` to the `RuntimePolicyErrorPage` already-shipped path (`RuntimePolicyErrorPage` already handles typed errors generically; we add the `fileUpload`-specific message in its copy table — verify the existing component handles the new key without modification first).
- `src/policy/extract-form-policy.ts` (new) — pure walker: `extractAttachmentRequirement(definition) → FormFeaturePolicyMode | undefined`. Co-located in `policy/` (not `composition/`) because it's pure policy derivation; FW-0066 will lift it into a port.
- `src/policy/extract-form-policy.test.ts` (new) — unit coverage for the walker (presence / absence / nested in repeats / multiple fields).
- `docs/ports/attachment-store.md` (new) — adopter doc analogous to `docs/ports/status-reader.md`. Names: port contract, conformance test invocation, in-form vs route-narrowed wiring, why no `delete` / `download`, the upcoming wire-format ratification (EXT row).
- `docs/policy/runtime-feature-resolution.md` (modify) — add `fileUpload` to the worked-key examples.
- `tests/adapter-conformance/attachment-store/conformance.test.ts` (new) — runs the conformance suite against `stubAttachmentStore`.
- `tests/adapters/attachment-store-stub.test.ts` (new) — stub-specific behavior: in-memory storage, counter URIs, marker presence.
- `tests/adapters/attachment-store-unavailable.test.ts` (new) — sentinel-specific behavior: throws plain-language message.
- `tests/adapters/unavailable-sentinel.test.ts` (modify) — extend with `attachmentStore` case if the existing test enumerates per-port.
- `tests/adapters/demo-stub-marker.test.ts` (modify) — extend with `attachmentStore` case.
- `tests/app/attachment-upload-control.test.tsx` (new) — control behavior: uploads on pick, replaces engine value with ref, shows error inline, supports multiple, supports remove, vocabulary firewall, deferred-capability copy.
- `tests/app/respondent-runtime-attachment.test.tsx` (new) — end-to-end through `RespondentRuntime`: form with attachment field, file picked, submit produces handoff with `AttachmentRef` in `response.data`; form requiring upload with unavailable composition → typed error → policy-error page.
- `tests/composition/freeze-attachment-store.test.ts` (new) — coherence assertion exercise for the new slot (unavailable + unavailable OK, demo-stub + demo-stub OK, demo-stub + production mode rejected, declared-available + sentinel rejected).
- `tests/policy-resolution/cases/file-upload-disabled-no-instance.ts` + `file-upload-required-unavailable-throws.ts` + `file-upload-demo-stub-satisfies-required.ts` (new) — resolver cases.
- `tests/smoke/composition.test.ts` (modify) — every factory exercises the new slot via the coherence assertion run by `freezeComposition`.
- `scripts/check-conformance-coverage.mjs` (modify) — add `AttachmentStore` to `portSuites` + add the new stub adapter to `stubPortsByPath` + add the unavailable sentinel to `unavailableSentinelFactoriesByPath`.
- `docs/testing-plan.md` (modify if it enumerates ports per check) — extend the row count / port list with `attachmentStore`. (Verify by inspection first; if it cites by count rather than enumerating, no edit needed.)
- `tests/adapter-conformance/README.md` (modify) — list the new port suite.
- `PLANNING.md` (modify) — FW-0033 closes as `live (slice 1)` with named release gaps. Open follow-on rows: FW-0073 (capture / deskew), FW-0074 (on-device redaction), FW-0075 (compose with FW-0056 library save), FW-0076 (resumable / chunked / progress), FW-0077 (demo form attachment field).
- `thoughts/specs/2026-05-22-upstream-extension-queue.md` (modify) — add new EXT row for the `AttachmentRef` + `IntakeHandoff` attachment-binding wire-format ratification (so the field-data-type interop is honored end-to-end across stack-common / formspec / formspec-server). Label it as a stack-extension concern; web slice 1 fixture-pins the shape but doesn't ratify it.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` (footer append, one bullet) — `fileUpload` key is the first feature gate driven by definition introspection (vs literal route synthesis); cite FW-0066 as the port-promotion follow-on.

## Non-goals (explicit, to bound scope)

- **No image processing.** No deskew, no edge detection, no legibility check, no thumbnail generation, no EXIF stripping. All filed.
- **No camera capture API integration.** No `getUserMedia`, no `MediaStream`, no in-page camera UI. Filed.
- **No on-device redaction.** Filed.
- **No save-to-library compose.** FW-0033 + FW-0056 → FW-0075. Filed.
- **No production object-store reference adapter** (S3, R2, Azure Blob). Adopter-side; the reference deployment composition declares `unavailable` honestly.
- **No virus-scan adapter or pipeline.** Issuer/operations concern.
- **No resumable / chunked / progressive uploads.** Filed.
- **No `IntakeHandoff` shape change.** The engine value at an attachment path IS the `AttachmentRef` (after slice-1 upload); the existing extensions carry it through.
- **No new schema ratification.** Upstream extension queue row covers it.
- **No download / fetch / delete operations on the port.** Receipt portals + library views need a reader port; distinct slice.
- **No `componentMap.fields.FileUpload` adopter override path enforced.** The web shell wires its own override; adopters who fork the shell can wire their own. The component is exported for reuse.

## Test coverage matrix

| Behaviour | Test |
|---|---|
| Port conformance: stub round-trips bytes → ref → same content hash | `tests/adapter-conformance/attachment-store/conformance.test.ts#round-trips` |
| Port conformance: identical bytes uploaded twice produce identical `hash` | `tests/adapter-conformance/attachment-store/conformance.test.ts#hash determinism` |
| Port conformance: distinct bytes produce distinct `hash` | `tests/adapter-conformance/attachment-store/conformance.test.ts#hash differentiation` |
| Port conformance: `AttachmentRef` shape passes the shape guard | `tests/adapter-conformance/attachment-store/conformance.test.ts#ref shape` |
| Port conformance: `mimeType` + `filename` round-trip from metadata | `tests/adapter-conformance/attachment-store/conformance.test.ts#metadata round-trip` |
| Port conformance: empty `Blob` upload accepted and yields zero-size ref | `tests/adapter-conformance/attachment-store/conformance.test.ts#empty blob` |
| Stub: marked DEMO_STUB_ADAPTER | `tests/adapters/attachment-store-stub.test.ts#marker` |
| Stub: stored bytes retrievable in-test (internal helper) for assertion against engine values | `tests/adapters/attachment-store-stub.test.ts#test-retrieval` |
| Unavailable: marked UNAVAILABLE_ADAPTER + throws plain-language error | `tests/adapters/attachment-store-unavailable.test.ts` |
| Coherence: full-app default composition coherent (unavailable+unavailable) | `tests/composition/freeze-attachment-store.test.ts#default` |
| Coherence: full-app stub composition coherent (demo-stub+demo-stub) | `tests/composition/freeze-attachment-store.test.ts#stub` |
| Coherence: production composition with demo-stub adapter throws | `tests/composition/freeze-attachment-store.test.ts#prod-with-demo-stub` |
| Coherence: narrowed routes pass with unavailable+unavailable | `tests/composition/freeze-attachment-store.test.ts#narrowed-routes` |
| Resolver: form requires fileUpload, instance unavailable → `UnsupportedRequiredFeatureError` | `tests/policy-resolution/cases/file-upload-required-unavailable-throws.ts` |
| Resolver: form requires fileUpload, demo-stub in demo mode → enabled | `tests/policy-resolution/cases/file-upload-demo-stub-satisfies-required.ts` |
| Resolver: form does not require, instance unavailable → disabled `not-requested` | `tests/policy-resolution/cases/file-upload-disabled-no-instance.ts` |
| Extractor: definition with attachment field → `required` | `src/policy/extract-form-policy.test.ts#single attachment field` |
| Extractor: definition with attachment field nested in repeat → `required` | `src/policy/extract-form-policy.test.ts#attachment in repeat` |
| Extractor: definition with no attachment field → undefined | `src/policy/extract-form-policy.test.ts#no attachment field` |
| Extractor: definition with multiple attachment fields → `required` (single declaration) | `src/policy/extract-form-policy.test.ts#multiple attachment fields` |
| Feature-key registry: `fileUpload` is in `RUNTIME_FEATURE_KEYS` (append-only) | `src/policy/feature-keys.test.ts` |
| Control: picking a file uploads via composition store; engine value becomes AttachmentRef | `tests/app/attachment-upload-control.test.tsx#picks file → uploads → ref` |
| Control: multiple files mode produces AttachmentRef[] | `tests/app/attachment-upload-control.test.tsx#multiple` |
| Control: remove file clears engine value (single) / removes ref (multiple) | `tests/app/attachment-upload-control.test.tsx#remove` |
| Control: upload error renders inline message without leaking jargon | `tests/app/attachment-upload-control.test.tsx#error inline` |
| Control: vocabulary firewall — no `attachment-ref`, `blob`, `mime`, `URI`, `hash`, `S3`, `multipart` in DOM | `tests/app/attachment-upload-control.test.tsx#vocabulary firewall` |
| Control: deferred-capability copy fixture-pinned | `tests/app/attachment-upload-control.test.tsx#deferred copy` |
| Runtime: form with attachment field + stub composition → submit handoff carries AttachmentRef in `response.data` | `tests/app/respondent-runtime-attachment.test.tsx#end-to-end attachment submit` |
| Runtime: form with attachment field + unavailable composition → typed error → policy-error page renders fileUpload-specific copy | `tests/app/respondent-runtime-attachment.test.tsx#unavailable form-load` |
| Smoke: all four FW-0033 composition factories pass the coherence assertion via freezeComposition | `tests/smoke/composition.test.ts#FW-0033 attachment factories` |
| Conformance-coverage script: discovers stubAttachmentStore + unavailableAttachmentStore + registers them in the new suite | (script execution within `npm run ci`) |

## Risks and what catches them

- **Risk:** the in-memory stub adapter loses uploads on page refresh, and the demo form (if it had an attachment field) would mislead. **Catch:** §"Demo form posture" decision — the demo form does NOT have an attachment field in slice 1. The stub is exercised through synthetic-definition tests and the conformance suite only.
- **Risk:** the field control's "wait for upload" UX blocks form submission when the network is slow / failing, and the respondent thinks the form is broken. **Catch:** slice 1 ships an "Uploading…" indicator next to the file row (or, if `Blob.size` is small enough to upload synchronously fast, no indicator); the upload error renders inline and the file can be re-picked. The submit button is NOT disabled while uploads are in flight (the field shows the in-flight state at the field, not site-wide), but the form's existing validation will block submit until the field has a value — so the in-flight rows don't submit until they resolve. Test coverage names the in-flight state explicitly.
- **Risk:** the `componentMap.fields.FileUpload` override conflicts with adopters who already register their own. **Catch:** the override is registered AT `RespondentRuntime` composition time; adopter forks that need a different control override their own merge layer. The web shell's default registration is documented in `docs/ports/attachment-store.md`. The component is exported as `FormspecWebAttachmentControl` so adopters who want to wrap it (vs replace) can.
- **Risk:** the form-policy walker walks a deeply nested definition and is slow. **Catch:** the walker is recursive over the layout / fields tree; depth is bounded by `definition.schema.json` constraints. A perf test is overkill for slice 1; revisit only if a real form measurably regresses form-load time.
- **Risk:** the in-form upload that succeeds mid-session, when the respondent abandons and reloads, leaves orphaned bytes in the object store. **Catch:** slice 1 punts — the object store is the adopter's, and adopter-side retention / sweep policy handles orphans (industry-standard pattern). The web docs flag this as a deployment concern in `docs/ports/attachment-store.md`.
- **Risk:** the WebCrypto SHA-256 hash is not deterministic across runtimes / adapters (e.g., a server-bundled adapter that hashes server-side after re-encoding). **Catch:** the conformance suite asserts `hash` is consistent for the SAME bytes via the SAME adapter; cross-adapter hash agreement is not asserted (different adapters MAY hash differently as long as identical bytes yield identical refs per adapter). Adopter docs name the contract.
- **Risk:** the `IntakeHandoff` carries the `AttachmentRef` as an opaque JSON object inside `response.data`, and the upstream service doesn't know to resolve it because the wire format isn't ratified. **Catch:** the new EXT row in the upstream extension queue tracks the canonical ratification; slice 1 documents the fixture-pinned shape so the formspec-server / adopter-side resolver can mirror it deterministically. The slice-1 web work is the test seam; ratification follows in stack-extension work.
- **Risk:** a future renderer change in `formspec-react` collides with the field-component override. **Catch:** the override targets the documented `componentMap.fields.FileUpload` integration point; if `formspec-react` renames or removes that integration, that's a coordinated upstream change with the web-layer override, and the test suite will fail loudly (the field renders nothing or default fallback). Same risk every adopter who overrides field components runs.

## What FW-0033 ships and what stays open

**Ships:**
- `AttachmentStore` port + conformance suite + `AttachmentRef` shape.
- `stubAttachmentStore` (in-memory, demo-stub-marked).
- `unavailableAttachmentStore` (sentinel-marked).
- `fileUpload` runtime-feature key (third closed-taxonomy extension).
- `attachmentStore` Composition slot + coherence assertion coverage.
- Form-policy walker (`extractAttachmentRequirement`) — first non-literal extractor; FW-0066 trigger pulse #2.
- In-form upload affordance via `FormspecWebAttachmentControl` field-component override.
- Submit-handoff integration: `AttachmentRef` flows through `response.data` JSON unchanged.
- Runtime-feature gate at form load: forms requiring upload on unavailable instances throw typed error → policy-error page with fileUpload-specific copy.
- Honest deferred-capability copy on the field control.
- Adopter doc + ADR-0011 cross-reference + conformance-coverage script extension.
- Composition coordination with narrowed-route factories (uniformly unavailable).
- Follow-on rows (FW-0073..FW-0077) + EXT row filed for wire-format ratification.

**Stays open (slice 2 / follow-on rows / upstream ratification):**
- Camera capture, deskew, edge detection, legibility check (FW-0073).
- On-device redaction (FW-0074).
- Save-to-library compose with FW-0056 (FW-0075).
- Resumable / chunked / progressive uploads (FW-0076).
- Demo form attachment field (FW-0077, gated on refresh-surviving demo store).
- Production object-store reference adapter (S3 / R2 / Azure / server-bundled) — adopter-side per deployment composition.
- Virus scanning / content moderation pipeline (adopter / issuer-side).
- Attachment-binding to specific audiences (compose with FW-0049 / FW-0056).
- AttachmentReader port for receipt portals (FW-0009 / FW-0010 territory).
- Canonical `AttachmentRef` + IntakeHandoff binding wire-format ratification (new EXT row).
- `FormRuntimePolicyExtractor` port promotion (FW-0066 — second trigger pulse; the port is still scheduled because slice 1 ships the extractor inline).

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline; port what's adopter-shaped
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — `fileUpload` capability key (already enumerated); failure semantics
- [FW-0055 design](2026-05-23-fw-0055-respondent-obligations-stream-design.md) — port + conformance + stub + unavailable precedent
- [FW-0056 design](2026-05-23-fw-0056-document-library-design.md) — runtime-feature-key extension precedent (third extension; this is the fourth)
- [FW-0033 implementation plan](../plans/2026-05-23-fw-0033-file-upload.md) — task-by-task execution
- [`thoughts/specs/2026-05-22-upstream-extension-queue.md`](2026-05-22-upstream-extension-queue.md) — new EXT row for AttachmentRef + IntakeHandoff binding wire-format
- [J-040](../../JOURNEYS.md#j-040--file-upload-as-a-primary-act-not-a-side-door-load-bearing-for-regulated-work) — the journey this slice serves
