# Upstream Theme Assets

This directory contains the minimal static theme assets consumed for the M1 branded shell:

- `layout/default-theme.json` from `../formspec/packages/formspec-layout/src/default-theme.json`
- `layout/token-registry.json` from `../formspec/packages/formspec-layout/src/token-registry.json`
- `adapters/tailwind-formspec-core.css` from `../formspec/packages/formspec-adapters/src/tailwind/tailwind-formspec-core.css`

They are copied from the local sibling source packages, whose package manifests and LICENSE files declare Apache-2.0. They are not installed from the npm registry while the registry metadata reports AGPL-3.0-only for these package names.

Run `npm run check:upstream-theme` from the formspec-web root when the sibling `../formspec` checkout is available. The script verifies the source package licenses and byte-for-byte sync for these copied assets.
