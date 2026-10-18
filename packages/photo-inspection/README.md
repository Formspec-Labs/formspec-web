# Photo byte measurements

This standalone Node package measures retained image bytes and provides a bounded adapter for Source’s committed `registeredHttpBatchV1` API. It has no acceptance authority. The offline measurement API remains separate from the registered HTTP handler and Runtime-only deployment entry. Every compliance rule remains unsupported until its executor is independently qualified.

`measureAttachment` takes a Buffer, exact owned attachment URI/digest/size, request/candidate/policy digests, rule edition, explicit file-size range, byte/pixel/deadline limits and optional AbortSignal. It snapshots bytes and verifies digest/length before launching one decoder child. It never follows a URI. Caller-supplied request/candidate/policy digests are recorded context; this package does not establish their authority.

The child uses maintained sharp with warning-level failure, explicit pixel/channel limits, safety features enabled, cache disabled and one decoder thread. It records full decoded dimensions and unequal sRGB component counts. Chromatic pixels do not establish portrait color compliance. Signature detection does not establish valid format. Decode refusal may indicate corruption, exhausted budget or unavailable codec; it remains inconclusive. HEIC/HEIF and multiple pages are unsupported. Measurements do not establish capture date, retouch history or agency acceptance.

The offline decoder kills its child on deadline or cancellation and waits for the close event. The registered adapter additionally requires externally imposed Linux resource limits and checks them at startup and before each request. Those checks do not establish container isolation or prove behavior under memory exhaustion; Runtime must qualify the deployed image and limits. No qualified visual executor identity or lock exists here.

`unavailableInspection` emits the exact proposed Studio result schema: eleven unique unsupported observations with null executor/result/fix and aggregate unavailable. Actual measurements remain separate evidence. No path emits passed or a Source Qualified result. Schema copies preserve the reviewed proposal and do not adopt module vocabulary:

- policy SHA256: `acfcfd5460da758dafecd3248b3e395c7170f51923e6668251296a0208c56293`
- result SHA256: `56a3a9af49ad3137f93420558aaa39bfd859d3d0f0e475b1fe0b7ebe338a7985`

Run `npm ci --ignore-scripts` at the formspec-web root, then
`npm run test:photo-inspection`. This package is an npm workspace; the root
`npm test` and `npm run ci` also run its tests. This uses prebuilt sharp dependencies without native builds. Node >=20.9.0 is required.

The package-local lockfile remains the install input for its independently built provider image.

The registered adapter validates Source’s committed request shape, plain canonical JSON hashes, retained form-version and policy pins, selected instance/source mapping, full attachment inventory, actual bytes and dedicated Keycloak credentials. Source retains applicant authorization and publication authority. The adapter returns only typed `pending` or `unavailable` results, with exact request identifiers; it never returns `qualified`. Missing photo input remains Pending so Save can proceed. Measurements stay in a separate bounded diagnostic receipt. Fresh signed history declarations and task association remain separate.

The adapter permits one request at a time without a queue. The whole request has a deadline, including receipt persistence and final credential checks. After cancellation it allows 100 ms for tracked work to settle; unfinished work permanently quarantines the handler until operator restart. A receipt sink may finish after cancellation, but no successful HTTP result follows it and no second request overlaps it. The deployment CLI limits UTF-8 receipt lines to 64 KiB and the receipt file to 128 MiB.

The verifier uses `jose` and an operator-pinned public signing-only RSA JSON Web Key Set (JWKS), with RS256, exact issuer/audience/client/service subject/scope and bounded integer dates. It refuses unknown keys, private keys, header-supplied keys, unsupported profiles and clock rollback. Operators must select public signing keys from a mixed issuer JWKS, repin and restart on rotation. This local demo does not claim online revocation or introspection.

See [Runtime deployment and qualification](deploy/README.md). Runtime alone builds, starts, registers and activates this provider. The local tests use signed token and byte fixtures with stream doubles; they do not establish live Source integration, real container containment or passport compliance.

[Decoder options](https://sharp.pixelplumbing.com/api-constructor/)

The local demo selects decimal 54,000–10,000,000 bytes as its explicit size range. This is a local interpretation of the source labels, not an official resolution of KB/MB units. Size comparison remains a measurement, not aggregate compliance.
