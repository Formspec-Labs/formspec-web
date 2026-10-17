# Signed Surface bundle vendor provenance

These packages are copied as built JavaScript and TypeScript declarations so
formspec-web can consume the accepted upstream verification profile without
reimplementing it.

| Local package | Upstream source |
|---|---|
| `@formspec-org/types` | `../formspec/packages/formspec-types` |
| `@formspec-org/engine` | `../formspec/packages/formspec-engine` |
| `@formspec-org/react` | `../formspec/packages/formspec-react` |
| `@formspec-org/surface-bundle-signing` | `../formspec/packages/formspec-surface-bundle-signing` |
| `@formspec-org/app-graph` | `../formspec/packages/formspec-app-graph` |
| `@formspec-org/layout` | `../formspec/packages/formspec-layout` |
| `@formspec-org/surface` | `../formspec/packages/formspec-surface` |
| `@formspec-org/surface-react` | `../formspec/packages/formspec-surface-react` |
| `@formspec-org/integrity-cose` | `../integrity-stack/packages/integrity-cose` |
| `@formspec-org/integrity-signature-port` | `../integrity-stack/packages/integrity-signature-port` |
| `@formspec-org/integrity-signature-adapter-webcrypto` | `../integrity-stack/packages/integrity-signature-adapter-webcrypto` |

The Formspec package declares `Apache-2.0`. The integrity-stack Rust workspace
also declares `Apache-2.0`; the copied `LICENSE` files contain that license
text. `npm run check:surface-bundle-vendor` verifies licenses, source hashes,
package metadata, and the source-size ceiling against the sibling checkouts.

`npm run vendor:refresh` rewrites every copy from fresh sibling builds and
re-runs both checks; `check:surface-bundle-vendor` does the same builds and
fails on any byte of drift. Both first run each sibling workspace's own
`npm run build` (run `npm ci` there once). Formspec's engine WASM is built in
formspec's pinned image (`docker/wasm-build`: Rust, wasm-pack and binaryen
pinned; sources at fixed `/src` paths), the same image its publish workflow
uses, so these bytes are the published bytes on any host with Docker.
`upstream-refs.json` records the formspec, fel-core and integrity-stack commits a
full `vendor:refresh` built from; CI checks out exactly those and still gates on
the byte comparison.
Package manifests are curated
by hand: keep `exports` in step with upstream.
