# ADR-0003 - License Apache-2.0

**Date:** 2026-05-22
**Status:** accepted

## Context

formspec-web is the open-source public reference UI for the respondent renderer and, post-MVP, the verifier and selective-proof viewer. The code is meant to be audited, forked, self-hosted, and copied into adopter deployments without forcing a copyleft posture on those adopters.

The license therefore has to support:

- reuse by agencies, nonprofits, commercial integrators, and self-hosters;
- patent grant clarity for a trust-load-bearing implementation;
- compatibility with permissively licensed sibling source packages;
- clean separation from post-MVP packages that may have different licenses.

## Decision

formspec-web is licensed under Apache License 2.0.

The repository root carries the Apache-2.0 `LICENSE` text, and `package.json` declares `"license": "Apache-2.0"`.

Per-file headers are not required for the MVP codebase. Source files inherit the repository license unless a file states otherwise. If third-party generated assets or vendored artifacts are added later, their license notices must stay with the artifact and be called out in a repository `NOTICE` file if required.

## Rationale

1. **Adoption friction stays low.** Apache-2.0 is permissive and familiar to government, commercial, and open-source adopters.
2. **Patent language matters.** The verifier positioning depends on a public implementation that adopters can inspect and reuse without ambiguity around patent grants.
3. **Sibling source alignment is the target.** The local sibling source manifests for `@formspec-org/layout` and `@formspec-org/adapters` declare Apache-2.0.
4. **Published-package drift blocks registry consumption, not source consumption.** The npm registry metadata for those same packages currently reports AGPL-3.0-only. formspec-web must not install those registry artifacts until the published metadata is corrected or an explicit license ADR changes this decision. It may consume traced static assets from the Apache-2.0 local sibling source packages.
5. **Future license collisions stay explicit.** `@formspec-org/assist` is not an MVP dependency. Any post-MVP row that wants to consume BUSL-licensed or otherwise differently licensed code must make a new ADR-level decision before adding the dependency.

## Consequences

- The repository license gate is satisfied by `LICENSE`, `package.json`, and this ADR.
- Contributors must not add dependencies whose licenses conflict with Apache-2.0 without an explicit ADR update.
- M1 token consumption from `@formspec-org/layout` / `@formspec-org/adapters` uses traced static assets copied from the local Apache-2.0 sibling source packages. The npm registry artifacts remain blocked until their metadata matches the intended Apache-2.0 source posture.
- Post-MVP AI/assist surfaces remain blocked from implicit consumption until their license posture is separately resolved.

## Related

- web ADR-0001 - Public reference UI separation
- web ADR-0004 - Cross-repo placement lens: consume primitives, do not invent them
- web ADR-0009 - Hexagonal architecture: ports, adapters, and DI discipline
