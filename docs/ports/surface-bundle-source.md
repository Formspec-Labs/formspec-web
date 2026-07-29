# SurfaceBundleSource

`SurfaceBundleSource` acquires one signed Surface-bundle candidate. It returns
the exact bytes as an immutable, SHA-256-bound snapshot plus transport
observations. It does not parse the app, verify a signature, select a key, or
decide whether the app may render.

What goes in: a host-selected locator and optional cancellation signal.

What happens: the adapter checks its configured location, redirect, byte, and
deadline limits and reads the response once.

What comes out: a snapshot with copied bytes, a `sha256:` identity, byte count,
requested and resolved locations, acquisition time, and adapter identity.

How to check it: run `npm run test:conformance -- surface-bundle-source` and
the focused HTTP adapter tests. Every failure is a typed
`SurfaceBundleSourceError`; transport success never becomes a trust verdict.

The default composition wires `unavailableSurfaceBundleSource()`. A completely
configured anonymous respondent deployment replaces it with the bounded HTTP
adapter. Neither the Definition runtime nor the Verifying Surface host falls
back from this port to `DefinitionSource`.
