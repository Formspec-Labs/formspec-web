# Vendored Formspec schemas

These JSON Schemas are exact copies of the corresponding files in
`../formspec/schemas/`. They are the runtime schema set for signed Surface
bundle admission in `formspec-web`.

`scripts/check-surface-bundle-vendor.mjs --write` synchronized the files from the Formspec
worktree at commit `85aab36c686fc3e4a46f236d87eeac836c27cc54`; `SHA256SUMS` is
the exact source identity for this snapshot. `response`, `validation-result`,
and `verification-receipt` are here only because Data Sources references
Response's `ResponseStatus`.

The source repository and these copies are licensed under Apache-2.0.
