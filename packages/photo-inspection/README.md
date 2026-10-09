# Photo byte measurements

This standalone Node package measures retained image bytes offline. It has no UI, HTTP endpoint, credentials, provider registration or acceptance authority. It is an executable first cut, not an eleven-rule passport inspector.

`measureAttachment` takes a Buffer, exact owned attachment URI/digest/size, request/candidate/policy digests, rule edition, explicit file-size range, byte/pixel/deadline limits and optional AbortSignal. It snapshots bytes and verifies digest/length before launching one decoder child. It never follows a URI. Caller-supplied request/candidate/policy digests are recorded context; this package does not establish their authority.

The child uses maintained sharp with warning-level failure, explicit pixel/channel limits, safety features enabled, cache disabled and one decoder thread. It records full decoded dimensions and unequal sRGB component counts. Chromatic pixels do not establish portrait color compliance. Signature detection does not establish valid format. Decode refusal may indicate corruption, exhausted budget or unavailable codec; it remains inconclusive. HEIC/HEIF and multiple pages are unsupported. Measurements do not establish capture date, retouch history or agency acceptance.

Deadline or cancellation kills the child and waits for its close event. Native decoder memory is not contained by a Node heap setting. Run controlled offline fixtures until external process/container memory isolation is implemented and independently qualified. No qualified executor identity, lock or credential exists here.

`unavailableInspection` emits the exact proposed Studio result schema: eleven unique unsupported observations with null executor/result/fix and aggregate unavailable. Actual measurements remain separate evidence. No path emits passed or a Source Qualified result. Schema copies preserve the reviewed proposal and do not adopt module vocabulary:

- policy SHA256: `acfcfd5460da758dafecd3248b3e395c7170f51923e6668251296a0208c56293`
- result SHA256: `56a3a9af49ad3137f93420558aaa39bfd859d3d0f0e475b1fe0b7ebe338a7985`

Run `npm ci --ignore-scripts` and `npm test` here. This uses prebuilt sharp dependencies without native builds. Node >=20.9.0 is required.

Before serving through Source, qualify its final committed protocol, dedicated credential verifier, current owner/publication/candidate binding, bounded request/concurrency/output controls, externally contained native memory and evidence freshness. Qualify visual executors before compliance claims. Fresh signed history declarations and task association remain separate. Module registry/adoption and activation require subsequent reviewed work.

[Decoder options](https://sharp.pixelplumbing.com/api-constructor/)

The local demo selects decimal54,000–10,000,000 bytes as its explicit size range. This is a local interpretation of the source labels, not an official resolution of KB/MB units. Size comparison remains a measurement, not aggregate compliance.
