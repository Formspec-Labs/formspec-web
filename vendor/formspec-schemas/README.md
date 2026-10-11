# Vendored Formspec schemas

These JSON Schemas are exact copies of the corresponding files in
`../formspec/schemas/`. They are the runtime schema set for signed Surface
bundle admission in `formspec-web`.

`scripts/check-surface-bundle-vendor.mjs --write` synchronized the files from the Formspec
worktree at commit `85aab36c686fc3e4a46f236d87eeac836c27cc54`; `SHA256SUMS` is
the exact source identity for this snapshot. `response`, `validation-result`,
and `verification-receipt` are here only because Data Sources references
Response's `ResponseStatus`.

The Mapping schema alone was refreshed on 2026-10-11 from the owning qualified
`sourceSchema` implementation. Its exact SHA-256 is
`be15c09ca0104f25243a7216d9e77c7efcf4bfbe9b993f07497ad719c237136b`.
The common dependency remains byte-identical to the snapshot above; all other
schema pins remain unchanged.

The source repository and these copies are licensed under Apache-2.0.
