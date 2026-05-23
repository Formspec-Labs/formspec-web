# Contributing

formspec-web is the public reference UI for Formspec. Contributions should preserve the repository's auditability: small changes, clear contracts, and tests that prove the visible behavior or adapter boundary being changed.

## License

This repository is Apache-2.0. By contributing, you agree that your contribution is licensed under the repository license unless a file explicitly states otherwise.

Do not add a dependency with an incompatible or unclear license. Post-MVP packages with non-Apache terms need an ADR before consumption.

## Architecture Boundary

The React shell is adapter-agnostic. Follow web ADR-0009:

- `src/ports/**` defines interfaces only.
- `src/app/**` consumes ports through the `Composition` context.
- `src/composition/types.ts` names ports, not adapters.
- `src/adapters/**` contains specific adapter implementations.
- Cross-port coordination belongs in the shell or explicit constructor injection, never a hidden import of the whole composition.

`npm run lint` enforces the hard import boundary with `import/no-restricted-paths`. `npm run check:vendor-leaks` scans the core shell and port surfaces for backend/provider vocabulary that would weaken the adapter boundary.

## Local Gates

Run these before committing a production change:

```sh
npm run typecheck
npm run lint
npm test
npm run check:vendor-leaks
npm run test:e2e
npm run build
```

For changes that touch a port, adapter contract, profile model, brand isolation, or vocabulary-firewall enforcement, get an architecture review before landing the change.
