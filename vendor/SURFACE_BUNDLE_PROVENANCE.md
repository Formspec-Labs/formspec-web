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
| `@integrity-stack/cose` | `../integrity-stack/packages/integrity-cose` |
| `@integrity-stack/signature-port` | `../integrity-stack/packages/integrity-signature-port` |
| `@integrity-stack/signature-adapter-webcrypto` | `../integrity-stack/packages/integrity-signature-adapter-webcrypto` |

The Formspec package declares `Apache-2.0`. The integrity-stack Rust workspace
also declares `Apache-2.0`; the copied `LICENSE` files contain that license
text. `npm run check:surface-bundle-vendor` verifies licenses, source hashes,
package metadata, and the source-size ceiling against the sibling checkouts.

`npm run vendor:refresh` rewrites every copy from fresh sibling `tsc` builds
and re-runs both checks. The engine's `wasm-pkg-runtime/` and `wasm-pkg-tools/`
are copied from the sibling's last `wasm-pack` build, so build the WASM in
`../formspec` first when its Rust crates changed. Package manifests are curated
by hand: keep `exports` in step with upstream.
