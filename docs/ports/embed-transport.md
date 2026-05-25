# EmbedTransport

`EmbedTransport` is the seam between the form-fill runtime and a host
page that embeds the form in an iframe (or, post-FW-0053, a Custom
Element). It models iframe-context detection + host-origin discovery +
bidirectional `postMessage` so the runtime never reads
`window.parent`, `document.referrer`, or `window.addEventListener('message', ...)`
directly. Production transports vary per host integration (raw
postMessage, `penpal`, `comlink`, future Custom Element message
channels) — exactly what hexagonal DI is for.

Without this port, a form mounted inside a host iframe runs identically
to one loaded directly: there is no security check that the host page
belongs to an allowed origin, and the host page has no honest
substrate to send messages through. The form-load boundary's
iframe-context gate catches the first half: a form embedded in an
iframe whose parent origin is not in
`orgRuntimePolicy.limits.embed.allowedOrigins` fails-load with
`EmbedOriginNotAllowedError` and the plain-language
"This form is not set up to be shown on this site." copy.

## Adapter contract

- `isEmbedded()` returns a `boolean`. Production adapters compute it
  from `window.parent !== window` (treating same-origin parents as
  not-embedded is an adapter-side policy decision); the conformance
  suite asserts the return type, not the policy.
- `hostOrigin()` returns `string | null`. The string MUST round-trip
  through `new URL(origin).origin` (i.e., be a valid origin with no
  path / query / fragment). Production adapters MAY return `null`
  initially and resolve to the real origin only after a postMessage
  handshake completes; runtime callers treat `null` as "unknown" and
  the iframe-context gate fails-closed in that case.
- `postMessage(message, targetOrigin)` rejects `targetOrigin === '*'`
  (wildcards bypass the org-policy allow-list and defeat the gate)
  and rejects strings with a path / query / fragment. The
  conformance suite enforces both invariants.
- `subscribeFromHost(handler)` returns an `Unsubscribe` function that
  removes the listener cleanly. Calling the returned function twice
  is a no-op (idempotent cleanup).

Run the conformance suite with:

```bash
npm test -- tests/adapter-conformance/embed-transport
```

## Org-policy allow-list (`limits.embed.allowedOrigins`)

The allow-list lives on `orgRuntimePolicy.limits.embed.allowedOrigins`
(typed as `EmbedLimits`). The runtime matches the host page's origin
against this list at form load:

| Entry | Behavior |
|---|---|
| `'https://clinic.example.org'` | Exact origin match (scheme + host + port; case-insensitive scheme + host, port-sensitive per WHATWG URL). |
| `'*'` | Wildcard — any host origin is allowed. **Production adopters who use this MUST document it.** Wildcards make the iframe-context gate inert and let attackers iframe-embed the form anywhere. |
| `[]` (empty array) | Fail-closed default — every iframe load fails the gate. The runtime mounts forms loaded directly (top-level window) unchanged. |

Slice 1 does **not** support subdomain globs (`'*.example.org'`),
path-prefix matching (origins have no paths), or regex matchers. A
future row may add a deliberate subdomain matcher with explicit syntax.

Malformed entries in the allow-list (non-strings, empty strings,
strings with a path) throw `InvalidRuntimePolicyError` at the
composition / boot boundary.

## Form-policy opt-in (`x-formspec-embeddable`)

A form opts into being embeddable via
`definition.extensions['x-formspec-embeddable']: true`. The
`EmbeddableExtractor` reference adapter declares
`embed: 'optional'` (NOT `'required'` — an embeddable form still
mounts directly on its issuer's URL; declaring `required` would
fail-load every embeddable form when accessed directly).

When the form is loaded directly (top-level window), the embed feature
is enabled but the iframe-context gate no-ops because
`isEmbedded()` returns `false`. When the form is loaded in an iframe,
the gate verifies the host origin against the allow-list.

## What the slice-1 stub adapter does

`stubEmbedTransport({ embedded?, hostOrigin? })`:

- `isEmbedded()` returns the constructor's `embedded` flag (default
  `false`).
- `hostOrigin()` returns the constructor's `hostOrigin` when
  `embedded === true`, otherwise `null`.
- `postMessage(message, targetOrigin)` validates `targetOrigin` and
  records the call into `_internalSentMessages()` for tests.
- `subscribeFromHost(handler)` registers the handler; tests can
  drive it via `_internalSimulateHostMessage(message, origin)`.

The bundled demo composition wires `stubEmbedTransport({ embedded: false })`
because the bundled demo loads as the top-level window; synthetic-
definition tests opt into the embedded branch by composing a fresh
stub with `{ embedded: true, hostOrigin }`.

## What the slice-1 unavailable sentinel does

`unavailableEmbedTransport()`:

- `isEmbedded()` returns `false`.
- `hostOrigin()` returns `null`.
- `postMessage` / `subscribeFromHost` throw with the adopter-supplied
  plain-language message.

A form loaded inside an iframe on an instance with `embed: 'unavailable'`
fails the gate the same way (the production sentinel's `isEmbedded`
returns `false`, so the gate no-ops — but the resolver's
`embed: 'unavailable'` already disables the feature so adopters who
need iframe support fork the composition file).

## Worked example (adopter fork)

```ts
// composition/my-deployment.ts
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from 'formspec-web/policy';
import { createDefaultComposition } from 'formspec-web/composition';
import { myProductionEmbedTransport } from './my-embed-transport.ts';

export function createMyComposition() {
  const base = createDefaultComposition(myConfig);
  return freezeComposition({
    ...base,
    embedTransport: myProductionEmbedTransport(),
    instanceCapabilities: {
      ...base.instanceCapabilities,
      embed: 'available',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { ...base.orgRuntimePolicy.features, embed: 'allowed' },
      limits: {
        ...base.orgRuntimePolicy.limits,
        embed: {
          allowedOrigins: [
            'https://clinic.example.org',
            'https://nonprofit.example.org',
          ],
        },
      },
    } satisfies OrgRuntimePolicy,
  });
}
```

## What slice 1 does NOT ship

- **Custom Element wrapper (`<formspec-embed>`).** FW-0053 territory.
  The substrate ships here; FW-0053 ships the Custom Element that
  wraps the runtime + mounts the iframe.
- **Production transport adapters.** Raw postMessage / `penpal` /
  `comlink` wrappers + handshake protocol + theme-handoff messages +
  resize-on-content-grow are adopter-side. FW-0102 ships the
  reference postMessage RPC adapter; FW-0103 ships the penpal /
  comlink wrapper cookbook.
- **Per-host-style theming + brand inheritance.** Out of slice-1
  scope; FW-0053 + a future theming-handoff row.
- **Cross-origin storage / cookie isolation guidance.** Browser-
  substrate concern; FW-0104.
- **SubResource Integrity (SRI) bundle helpers.** Adopter-side
  concern (the host's `<script integrity="sha384-...">` is owned by
  the host's build pipeline). Document recommended hashes.
- **CSP nonce / origin attestation header generation.** Adopter-side
  concern (the host's CSP header is owned by the host).
- **`<iframe sandbox="...">` attribute defaults.** Adopter-side
  concern. The recommended posture is
  `sandbox="allow-scripts allow-same-origin allow-forms"` plus
  `allow-popups` for OIDC redirect flows; consult the host's
  security review before relaxing further.
- **Multi-form-per-iframe.** FW-0105.
- **Partial-origin matching (globs / regex).** Future row with a
  deliberate matcher.

## Slice-1 imperfections (documented)

- **`hostOrigin()` returning null in production is opaque.** When the
  host page does not complete the postMessage handshake (or the
  adapter's handshake protocol times out), `hostOrigin()` returns
  `null` and the gate fails-closed. Adopters debugging this see only
  the "this form is not set up to be shown on this site" copy; the
  typed `EmbedOriginNotAllowedError.code` (`'EmbedOriginNotAllowed'`)
  is the support reference. Production transports SHOULD log
  handshake failures internally.
- **Same-origin iframe nesting is policy.** A form embedded in an
  iframe whose parent window is the same origin (e.g., an internal
  preview surface) is technically embedded but does not deserve
  fail-closed behavior. The slice-1 stub takes the parameter
  explicitly so adopters control the policy; production adapters
  decide whether to treat same-origin parents as not-embedded.
- **The org-policy `limits.embed` is loaded synchronously.** The
  composition is constructed once at boot per web ADR-0009;
  adopters who load org-policy from a server MUST resolve the load
  before passing the composition to `RespondentRuntime`. There is no
  race in the slice-1 shape.
