# FW-0040 — Embed: form lives in the host's page (design)

**Date:** 2026-05-24
**Row:** [FW-0040](../../PLANNING.md#fw-0040--embed-form-lives-in-the-hosts-page)
**Journey:** [J-018](../../JOURNEYS.md#j-018--im-filling-this-out-on-a-site-i-came-to-for-something-else)
**Subordinate to:** web ADR-0009 (hexagonal), web ADR-0011 (runtime feature resolution), stack-root [ADR-0128 (frontend surface architecture)](../../../thoughts/adr/0128-frontend-surface-architecture.md)
**Precedent (substrate shape):** [FW-0033 slice-1 design](2026-05-23-fw-0033-file-upload-design.md) — IN-FORM new-port + capability-key extension. [FW-0044 slice-1 design](2026-05-24-fw-0044-offline-capable-fill-design.md) — IN-FORM new-port + runtime-time gating. [FW-0027 slice-1 design](2026-05-24-fw-0027-multi-rail-payment-design.md) — port-with-typed-shapes + form-policy extractor + closed-taxonomy extension (most analogous in shape; **`embed` may land as the seventh or eighth key depending on FW-0027 land order — verify before appending**).
**Authority:** ADR-0011 §"Instance capabilities" + §"Feature Ownership Table" enumerate `embed` (instance capability: "iframe/web component transport and CSP/origin enforcement"; org policy: "allowed origins and CSP"; form policy: "form embeddable"). This row materializes the taxonomy entry. Adds a **new** `EmbedTransport` port per web ADR-0009.

## What FW-0040 actually needs (vs the row prose)

The PLANNING row promises the respondent never leaves the host's site, never sees "powered by" chrome, never gets bounced to an unfamiliar domain. **Most of that surface is delivered by a Custom Element wrapper (FW-0053 territory) plus host-side embedder docs (adopter-side).** The substrate gap at the formspec-web layer is what an iframe-mounted respondent renderer needs *from the runtime* before any of that distribution work can land honestly:

Four independently load-bearing gaps:

1. **No port for host-page transport.** The form runtime today assumes it owns the top-level window: `navigator.onLine`, `window.parent === window`, `document.referrer` read directly from globals. When the form mounts inside an iframe on `clinic.example.org`, those reads are correct but unspoken — there is no port boundary an adopter can override (e.g., to inject a test seam, to use `comlink`/`penpal` in a future row, or to swap to a Web Component messaging substrate). Slice 1 needs a named seam.
2. **No host-origin policy gate.** A form embedded on `clinic.example.org` and a form embedded on `not-clinic-evil.example` are different security postures. Today the runtime cannot distinguish them: it mounts identically anywhere it is loaded. The org-policy layer (web ADR-0011 §Org runtime policy `limits.embed`) carries the allow-list, but the runtime has no enforcement seam.
3. **No runtime-feature gate.** A form whose author marked it embeddable still mounts identically on an instance with no embed substrate; an iframe-loaded form on an instance whose org-policy forbids embeds still mounts and silently runs in the iframe. Both violate ADR-0011 §Rationale #1 ("reference deployments must be honest").
4. **No respondent-visible "this form is shown on [host]" affordance.** Slice 1 does not ship the host-named confirmation copy (the row's "filled out on the host's page, never noticed there was a platform behind it" promise is a Custom Element + adopter concern), but the substrate must surface the host origin in a way the React shell can read so the FW-0053 wrapper has somewhere honest to consume from.

Each gap is independently load-bearing. Gap 1 alone makes the FW-0053 widget unimplementable. Gap 2 makes a production iframe deployment unsafe (the form will mount on any origin that loads the iframe URL). Gap 3 makes the OSS reference dishonest about whether it supports embedding. Gap 4 makes FW-0053's host-named UX impossible to wire later without a substrate refactor.

## Decision: ship slice 1 (port + conformance + stub + unavailable sentinel + extractor + org-policy allow-list + runtime origin-gate); defer Custom Element wrapper + host-side embedder docs + production transport adapters

Slice 1 lands:

- A new **`EmbedTransport` port** with three operations:
  - `isEmbedded(): boolean` — narrow seam over `window.parent !== window`. Adapter-shaped so tests can inject the iframe-context state without touching globals.
  - `hostOrigin(): string | null` — best-effort: returns the host page's origin when embedded, `null` when not embedded or when the origin cannot be determined (cross-origin `document.referrer` may be stripped; production adapters wrap a postMessage handshake to learn it explicitly). Slice 1's stub returns a fixture-pinned value; the unavailable sentinel returns `null`.
  - `postMessage(message, targetOrigin): void` — send to host. `targetOrigin` MUST be a concrete origin string (`'https://clinic.example.org'`), never `'*'` (the conformance suite rejects it).
  - `subscribeFromHost(handler): Unsubscribe` — listen from host. Handler receives `{ data: unknown, origin: string }` shape; the adapter is responsible for the `MessageEvent.origin` check at the listener boundary (the conformance suite asserts that handlers fire only when origin matches a registered allowlist).

  The port is intentionally minimal — no `requestResize`, no `requestThemeHandoff`, no `bootstrapSession` — those are FW-0053 territory + future-row concerns. The substrate ships the **transport** primitive; the **messages** are an FW-0053 / future-row vocabulary.
- A new **`EmbedMessage` type** — a discriminated union seeded with a single variant: `{ kind: 'host-handshake', hostOrigin: string }`. The slice-1 vocabulary is the bare minimum needed for `hostOrigin()` to be honest about its source (a stub can synthesize the handshake; a production adapter can complete it before resolving the origin). Future variants (`resize-request`, `theme-handoff`, `submit-complete`) land per their owning rows. The union shape is the extension point.
- A new **conformance suite** (`defineEmbedTransportConformance`) covering: `isEmbedded()` returns a boolean (no truthy/falsy heuristics), `hostOrigin()` returns `string | null` (never undefined / never an unconstructable URL), `postMessage` rejects `targetOrigin === '*'` (the load-bearing security invariant — wildcards bypass the allow-list), `postMessage` rejects non-origin strings (no path / no query / no fragment), `subscribeFromHost` returns an `Unsubscribe` function that removes the listener cleanly, the adapter does not mutate handler-supplied `EmbedMessage` payloads (purity invariant).
- A new **in-memory stub adapter** (`stubEmbedTransport`) carrying the `DEMO_STUB_ADAPTER` marker; constructor takes `{ hostOrigin?: string, embedded?: boolean }`. Internally maintains a simple subscriber set; `postMessage` records calls into a test-only `_internalSentMessages()` accessor; `subscribeFromHost` registers handlers and `_internalSimulateHostMessage(message, origin)` dispatches to subscribers for tests.
- A new **unavailable sentinel** (`unavailableEmbedTransport`) carrying the `UNAVAILABLE_ADAPTER` marker; `isEmbedded()` returns `false`, `hostOrigin()` returns `null`, `postMessage` throws, `subscribeFromHost` throws.
- A new **`embed` runtime-feature key** appended to the closed `RUNTIME_FEATURE_KEYS` tuple per ADR-0011 §"Feature Ownership Table". **Append-only — verify the current state of `feature-keys.ts` before appending.** If FW-0027 has landed `payment` as the 7th key (current state), `embed` becomes the **8th** key. If FW-0040 lands first, `embed` becomes the 7th. The protocol handles both orderings.
- A new **`EmbeddableExtractor`** `FormRuntimePolicyExtractor` adapter. Walks `definition.extensions['x-formspec-embeddable']`; when present and `=== true`, declares `embed: 'optional'` — NOT `'required'` (a form that opts into being embeddable still mounts directly on its issuer's URL; declaring `required` would fail-load every embeddable form when loaded directly). Matches the FW-0044 offline-extractor shape, not the FW-0033 / FW-0027 hard-requirement shape.
- A new **`allowedEmbedOrigins`** org-policy limit (`orgRuntimePolicy.limits.embed`). Typed as `{ readonly allowedOrigins: readonly string[] }`. An empty array means "no origins allowed" (the iframe-context check fails-closed). A single `'*'` entry means "any origin allowed" (explicit opt-in to wildcard; production adopters who use this MUST document it). Concrete origin strings (`'https://clinic.example.org'`) are matched exactly (case-insensitive on scheme + host, port-sensitive per [URL spec](https://url.spec.whatwg.org/)).
- **`RespondentRuntime` integration.** A new `verifyEmbedOriginAllowed(...)` pure helper in `respondent-flow.ts` reads `runtimeProfile.enabled.has('embed')`, calls `composition.embedTransport.isEmbedded()`, and (when embedded) reads `composition.embedTransport.hostOrigin()` + matches it against the resolved-profile's `limits.embed.allowedOrigins`. When the form is loaded inside an iframe whose parent origin is not allowed, the helper throws a new typed `EmbedOriginNotAllowedError extends RuntimePolicyError` — the React shell's existing form-load error boundary catches it and the `RuntimePolicyErrorPage` renders the fixture-pinned "this form is not set up to be shown on this site." copy. When NOT embedded, the helper no-ops (the form mounts normally regardless of whether `embed` is enabled). When embedded AND origin allowed, the helper no-ops and the form mounts.
- **Disabled-cause copy at form load.** When the form is loaded in an iframe AND the embed key is disabled (instance unavailable, or org-forbidden), the runtime treats it as `EmbedOriginNotAllowedError` (the iframe context is unsupported on this instance). When the form is loaded directly (top-level window), the embed key being disabled is harmless and the form mounts.
- **Honest deferred copy.** The runtime-policy error page surfaces "this form is not set up to be shown on this site" — fixture-pinned. The `docs/ports/embed-transport.md` adopter doc explains the slice-1 surface, names FW-0053 as the Custom Element wrapper follow-on, and names the production iframe-host integrations as adopter-shipped (penpal / comlink wrappers, theme-handoff messages, etc.).
- **Production composition default**: `embed: 'unavailable'` + `unavailableEmbedTransport()`. The OSS reference deployment does not ship a production embed-host adapter — adopters fork to wire whatever postMessage / comlink / penpal substrate they use.
- **Demo / stub composition**: `embed: 'demo-stub'` + `stubEmbedTransport({ embedded: false })` (the bundled demo loads as the top-level window; the stub returns `false` for `isEmbedded` and the runtime no-ops). Synthetic-definition tests exercise the embedded branch with `stubEmbedTransport({ embedded: true, hostOrigin: 'https://allowed.example.test' })`.

Slice 1 does **not** ship:

- **Custom Element wrapper (`<formspec-embed>`).** FW-0053 territory — depends on this slice's transport substrate.
- **Production transport adapters** (penpal / comlink wrappers, postMessage RPC, theme-handoff messages, resize-on-content-grow). Adopter-side, each its own future row. Filed as **FW-0102** (postMessage RPC reference adapter), **FW-0103** (penpal/comlink wrapper docs).
- **Per-host-style theming + brand inheritance.** Out of scope; FW-0053 + a future theming-handoff row.
- **Cross-origin storage / cookie isolation.** Browser-substrate concern; deferred. Filed under FW-0104.
- **SubResource Integrity for embed JS bundle.** Adopter-side concern (build-time SRI generation for the host's `<script>` tag). Documented in `docs/ports/embed-transport.md`.
- **CSP nonce / origin attestation.** Adopter-side concern (the host page's CSP header is owned by the host). Documented in `docs/ports/embed-transport.md`.
- **Sandbox-attribute enforcement.** Adopter-side concern (the host's `<iframe sandbox="…">` attributes; documented in the adopter doc).
- **Host-named confirmation chrome.** FW-0053 row — the substrate provides `hostOrigin()`; FW-0053 consumes it for "Submitted to [host]" copy.
- **Multi-tenant embed (different forms on different host origins from one runtime).** Slice 1 mounts one form per iframe; multi-form-per-iframe is FW-0105.

## Decision on port shape: NEW `EmbedTransport` port — option (a) per the task

Alternatives considered:

| Option | Shape | Why rejected/accepted |
|---|---|---|
| **(a) New `EmbedTransport` port** | Four methods: `isEmbedded()`, `hostOrigin()`, `postMessage()`, `subscribeFromHost()`. Iframe-context detection + origin discovery + bidirectional transport behind one port. | **ACCEPTED.** Aligns with web ADR-0009 §"port what's adopter-shaped." The transport substrate varies per host integration (raw postMessage, penpal, comlink, future Web Component message channel) — exactly what hexagonal DI is for. The `isEmbedded()` + `hostOrigin()` operations are part of the same port because their answers come from the same substrate (postMessage handshake / parent-window read / Custom Element attribute read). Splitting them would force every adapter to coordinate three port slots for one concern. |
| **(b) Web Component primitive `<formspec-embed>` as the slice-1 ship** | Custom Element wrapper landed first; transport substrate inferred from the element's mount context. | **REJECTED.** Per the task: this is FW-0053's territory — a deployment shape, not a port. Shipping the element without the transport substrate behind it would either (i) require the element to read `window.parent` / `document.referrer` directly (hard-coded singleton coupling, no test seam) or (ii) duplicate the transport plumbing the next row has to rip out. Substrate-first preserves the DI boundary. |
| **(c) Extend `IdentityProvider` / `NotificationDelivery` with host-origin awareness** | No new port — bolt host-origin reading onto an existing port. | **REJECTED.** Couples two unrelated adopter concerns. Neither identity nor notification varies per host-embedding posture; both already have full conformance suites that would need to be torn up. |
| **(d) Two ports: `EmbedContext` (`isEmbedded` + `hostOrigin`) + `EmbedMessageTransport` (`postMessage` + `subscribeFromHost`)** | Read-side and write-side on separate ports. | **REJECTED.** The four operations share the same substrate (postMessage handshake produces the host origin AND opens the bidirectional channel). Splitting them forces an adopter to wire two adapters where one would do; the conformance suite would also need to coordinate the two for the handshake test. Single-port-per-substrate is the correct grain. |

**Decision: (a).** Justified above; matches the FW-0027 / FW-0044 / FW-0033 / FW-0057 precedent of one port per adopter-shaped concern.

## Decision on origin matching: explicit origin strings + `'*'` opt-in; no partial / glob matching in slice 1

The `allowedEmbedOrigins: readonly string[]` slot accepts:
- Concrete origin strings (`'https://clinic.example.org'`, `'https://nonprofit.example.org:8443'`) — matched exactly (case-insensitive scheme + host, port-sensitive).
- The single literal `'*'` — opts into "any origin allowed." Production adopters who use this MUST document it; the adopter doc carries a stern warning.

Slice 1 does NOT support:
- Subdomain globs (`'*.example.org'`) — too easy to write `'*.example'` and own the world; future row with a deliberate matcher.
- Path-prefix matching (origins have no paths; the schema is `scheme://host[:port]`).
- Regex matchers — out of slice 1 scope.

The runtime matches via a small `matchesAllowedOrigin(hostOrigin, allowed)` helper that normalizes both sides through `new URL(...).origin` before comparing. Malformed entries in the allow-list throw `InvalidRuntimePolicyError` at the resolver boundary.

## Decision on runtime feature key: add `embed` — seventh or eighth taxonomy extension

ADR-0011 §"Feature Ownership Table" already enumerates `embed` (instance capability: "iframe/web component transport"; org policy: "allowed origins and CSP"; form policy: "form embeddable"). The decision materializes the taxonomy entry, not inventing a new one.

| Concern | Gated by | Slice 1 wiring |
|---|---|---|
| Form mounting inside a host iframe | `embed` | New key. Production: `unavailable`. Demo/stub: `demo-stub` (in-memory transport, defaults to "not embedded"). |

Implications:

1. `src/policy/feature-keys.ts`: append `'embed'` to `RUNTIME_FEATURE_KEYS` after `'payment'` (or before, if FW-0027 has not landed yet). **Verify the current state of the tuple before appending** — the append-only protocol handles both orderings.
2. `src/policy/feature-port-map.ts`: add `embed: 'embedTransport'` — 1:1 mapping, no transitional slot-sharing.
3. `src/composition/types.ts`: add `embedTransport: EmbedTransport` to `Composition`.
4. **Default compositions:** `embed: 'unavailable'` in production; `embed: 'demo-stub'` in demo/stub. Coherence assertion handles the new key/port pair automatically through the existing `RUNTIME_FEATURE_KEYS` loop.
5. **Narrowed-route compositions:** uniformly wire `unavailableEmbedTransport()` + declare `embed: 'unavailable'` on every narrowed route. None of `/status`, `/obligations`, `/documents`, `/history` is itself an embed surface today (the embed substrate is for the form-fill route — `/`). If a future row needs an embedded narrowed surface (e.g., an embedded status widget), it adds `'embed'` to its descriptor's `consumes` set per FW-0080's closed-taxonomy shape and the factory branches.
6. **Org-policy limits.** Slice 1 wires `orgRuntimePolicy.features.embed: 'allowed'` and `limits.embed: { allowedOrigins: [] }` by default (any iframe-loaded form fails-closed without explicit allow-list entries). Adopters override `limits.embed.allowedOrigins` per their host integration.

## Decision: `optional`, not `required`

A form that opts into being embeddable still works when loaded directly on its issuer's URL. Declaring `required` would fail-load every embeddable form when accessed at the issuer's own form URL — exactly the dishonest path the FW-0044 design rejected. The extractor declares `'optional'`; the resolver enables the feature when both the instance and the org agree; the iframe-context check (`verifyEmbedOriginAllowed`) only fires when the form actually loads inside an iframe.

The trade: a form loaded inside an iframe whose org-policy has no allow-list entries fails-closed at form load, with the plain-language "this form is not set up to be shown on this site." copy. That is the honest disclosure ADR-0011 §Rationale #1 asks for. A form loaded inside an iframe on an instance that does not support embeds at all (`embed: 'unavailable'`) ALSO fails-closed — the iframe context is unsupported on this instance, regardless of which form is loaded.

**Non-opt-in forms receive no runtime origin check.** Forms that do not declare `x-formspec-embeddable: true` mount in any iframe at any origin with no runtime challenge. This is deliberate: defense-in-depth at the runtime layer would fail-close legitimate non-embed forms loaded by adopters in iframes for testing OR loaded by host pages that don't intend to embed. The production composition default further wires `embed: 'unavailable'`, which collapses the resolver to `not-requested` for every form regardless of opt-in — the gate is a no-op for the OSS reference deployment until an adopter forks the composition. **Host-side `X-Frame-Options` / CSP `frame-ancestors` is the protection.** Adopters who want unconditional iframe-mount refusal must set those headers at the form-hosting server; the substrate gate is a per-form-policy admission control, not a perimeter defense, and the user-visible "this form is not set up to be shown on this site" copy is the form-opt-in narrative, not a hard guarantee against framing.

## Decision on composition coordination: in-form only; route-narrowed factories noop

FW-0040 is **in-form, not standalone-route.** Embedding IS a deployment posture of the form-fill flow; there is no separate "/embed" page. The new `embedTransport` slot needs to be present on every Composition (full-app + every narrowed route) because the coherence assertion iterates over `RUNTIME_FEATURE_KEYS`, but:

- **Full-app composition (`createDefaultComposition` + `createStubComposition`):** wires the real / stub embed transport.
- **Narrowed-route composition (`createRouteNarrowedComposition`):** wires `unavailableEmbedTransport()` (production AND stub modes) + declares `embed: 'unavailable'`. None of today's narrowed surfaces is itself an embed surface — the coherence assertion accepts `unavailable` adapter + `unavailable` declaration as a coherent pair.

No descriptor adds `'embed'` to its `consumes` set today. Every shipped narrowed route is uniformly noop on the embed transport.

## Composition coordination — slot table

| Slot | Production (default) | Demo (stub) | Narrowed routes (all modes) | Notes |
|---|---|---|---|---|
| `embedTransport` | `unavailableEmbedTransport()` | `stubEmbedTransport({ embedded: false })` | `unavailableEmbedTransport()` | New slot. Adopters fork the production wiring per their host integration. |
| `instanceCapabilities.embed` | `'unavailable'` | `'demo-stub'` | `'unavailable'` | New key. |
| `orgRuntimePolicy.features.embed` | `'allowed'` | `'allowed'` | `'allowed'` | Default org policy doesn't forbid embed; instances simply can't do it by default. |
| `orgRuntimePolicy.limits.embed` | `{ allowedOrigins: [] }` | `{ allowedOrigins: [] }` | `{ allowedOrigins: [] }` | Fail-closed default — adopters override per host integration. |
| `formRuntimePolicyExtractor` | `CompositeFormRuntimePolicyExtractor([..., new EmbeddableExtractor()])` | `CompositeFormRuntimePolicyExtractor([..., new EmbeddableExtractor()])` | `new EmptyFormRuntimePolicyExtractor()` | New composite delegate appended; narrowed routes keep the empty extractor (no definition in scope). |

## Demo form posture

The bundled `sample-form.json` does NOT declare `extensions['x-formspec-embeddable']: true` in slice 1. The decision is to **leave the demo form unchanged** — the `embed` feature key is wired through the entire policy + coherence + extractor pipeline (exercised via test fixtures that synthesize embed-declared definitions), but the bundled demo does not show the embed posture live. Reasons:

1. The bundled demo loads as the top-level window (`window.parent === window`); the stub transport's default `embedded: false` correctly no-ops the gate. There is nothing for the demo to demonstrate at this slice.
2. A demo of the embed posture requires a parent host page to mount the form inside an iframe — which is the FW-0053 Custom Element + adopter docs scope, not the slice-1 substrate scope.
3. Adopters who want to see the embed gate end-to-end can compose their own host page with a stub-wired iframe + verify via the synthetic-definition tests + the conformance suite.

A **follow-on row FW-0106** ("Demo form: declare `x-formspec-embeddable: true` once a worked host-page demo lands") is filed; gated on FW-0053 + FW-0102, not on slice 1.

## Port boundaries — `EmbedTransport` shape

```ts
// src/ports/embed-transport.ts

export type EmbedMessage = {
  readonly kind: 'host-handshake';
  readonly hostOrigin: string;
};
// Future variants land per their owning rows (FW-0053 ships
// 'resize-request' + 'theme-handoff'; future rows ship 'submit-complete'
// etc.). The union shape is the extension point.

export interface EmbedMessageFromHost {
  readonly data: EmbedMessage;
  readonly origin: string;
}

export type Unsubscribe = () => void;

export interface EmbedTransport {
  /**
   * Whether the form is mounted inside a host iframe. Adapter-shaped so
   * tests inject the state without touching globals; production adapters
   * compute it from `window.parent !== window`.
   */
  isEmbedded(): boolean;

  /**
   * The host page's origin (scheme + host [+ port]) when embedded; `null`
   * when not embedded or when the origin cannot be determined. Production
   * adapters MAY return `null` initially and resolve to the real origin
   * after a postMessage handshake completes; runtime callers MUST treat
   * `null` as "unknown" (the iframe-context check then fails-closed).
   */
  hostOrigin(): string | null;

  /**
   * Send a message to the host page. `targetOrigin` MUST be a concrete
   * origin string ('https://clinic.example.org'); the conformance suite
   * rejects `'*'` (wildcards bypass the allow-list).
   */
  postMessage(message: EmbedMessage, targetOrigin: string): void;

  /**
   * Subscribe to messages from the host page. The handler receives the
   * raw `{ data, origin }` shape; the runtime is responsible for matching
   * `origin` against the allow-list before acting on `data`. Returns an
   * `Unsubscribe` function that removes the listener cleanly.
   */
  subscribeFromHost(handler: (message: EmbedMessageFromHost) => void): Unsubscribe;
}
```

## Vocabulary firewall

Every visible string respects `formspec-web/CLAUDE.md` §Vocabulary firewall:

- **Respondent-facing copy:** "embed" (in error copy), "this form is shown on [host]" (FW-0053 territory, not slice 1), "this form is not set up to be shown on this site" (slice-1 error copy). Never "iframe", "postMessage", "targetOrigin", "EmbedTransport", "allowedOrigins", "host-handshake", "CSP", "subscribeFromHost", "Unsubscribe".
- **Deferred-capability copy:** "The Custom Element wrapper and production host-page integrations are adopter-shipped — the OSS reference deployment provides the substrate only." — fixture-pinned in the adopter doc.
- **Error copy on disallowed origin:** "this form is not set up to be shown on this site." — fixture-pinned. The respondent sees the form is unavailable; no rail / origin / CSP detail.
- **Disabled-cause copy at form load (instance unavailable or org-forbidden, when iframe-loaded):** same "this form is not set up to be shown on this site." copy — the user-facing distinction "the form's site couldn't show it" vs "this site couldn't show it" is not load-bearing; one copy keeps the failure surface honest.
- **Spec jargon `EmbedTransport`, `embedTransport`, `embed` (the runtime feature key), `EmbedMessage`, `allowedEmbedOrigins`, `hostOrigin`, `isEmbedded`, `postMessage`, `subscribeFromHost`** stays internal — never appears in DOM, never appears in user copy.

## Architectural surface — minimal new code

- `src/ports/embed-transport.ts` (new) — port interface + `EmbedMessage` + `EmbedMessageFromHost` + `Unsubscribe` types.
- `src/ports/index.ts` (modify) — re-export the new port + types.
- `src/adapters/stub/embed-transport.ts` (new) — `stubEmbedTransport({embedded?, hostOrigin?})` in-memory adapter; marked `DEMO_STUB_ADAPTER`. Exposes test-only `_internalSentMessages()` + `_internalSimulateHostMessage(message, origin)` helpers.
- `src/adapters/unavailable/embed-transport.ts` (new) — `unavailableEmbedTransport()` sentinel; throws on `postMessage` / `subscribeFromHost`; returns `false` / `null` on `isEmbedded` / `hostOrigin`. Marked `UNAVAILABLE_ADAPTER`.
- `src/adapter-conformance/conformance.ts` (modify) — add `defineEmbedTransportConformance` + `EmbedTransportConformanceSubject`. Add `sampleAllowedHostOrigin` + `sampleEmbedMessage` fixtures.
- `src/adapter-conformance/index.ts` (modify) — re-export.
- `src/adapter-conformance/fixtures.ts` (modify) — add `sampleAllowedHostOrigin` + `sampleEmbedMessage`.
- `tests/adapter-conformance/_framework/conformance.ts` (modify) — re-export the new define.
- `tests/adapter-conformance/embed-transport/conformance.test.ts` (new) — invokes the suite against the stub.
- `scripts/check-conformance-coverage.mjs` (modify) — add `EmbedTransport` to `portSuites` + add the new stub adapter to `stubPortsByPath` + add the unavailable sentinel to `unavailableSentinelFactoriesByPath` + add `defineEmbedTransportConformance` to `requiredHarnessExports`.
- `src/policy/feature-keys.ts` (modify) — append `'embed'`.
- `src/policy/feature-keys.test.ts` (modify) — extend `RUNTIME_FEATURE_KEYS.toEqual(...)` assertion + flip the `'embed'` assertion from `false` to `true`.
- `src/policy/feature-port-map.ts` (modify) — add `embed: 'embedTransport'`.
- `src/policy/extract-form-policy.ts` (modify) — add `extractEmbeddableOptIn(definition)` walker; returns `'optional' | undefined`.
- `src/policy/extract-form-policy.test.ts` (modify) — add cases for embed opt-in (absent / present-true / present-false / present-non-boolean).
- `src/policy/errors.ts` (modify) — add `EmbedOriginNotAllowedError extends RuntimePolicyError` with code `'EmbedOriginNotAllowed'`.
- `src/policy/errors.test.ts` (modify) — extend with the new error class.
- `src/policy/policy-shapes.ts` (modify) — add `EmbedLimits` type (`{ allowedOrigins: readonly string[] }`) and document the `limits.embed` shape in the comment.
- `src/policy/resolver.ts` (modify) — validate the `limits.embed.allowedOrigins` shape (throws `InvalidRuntimePolicyError` if any entry is not a non-empty string, or if any concrete origin fails `new URL(origin).origin === origin` round-trip).
- `src/adapters/composing/form-runtime-policy-extractor.ts` (modify) — add `EmbeddableExtractor` wrapping `extractEmbeddableOptIn`.
- `src/composition/types.ts` (modify) — add `embedTransport: EmbedTransport` slot.
- `src/composition/default.ts` (modify) — declare `embed: 'unavailable'` + wire `unavailableEmbedTransport()` + add `limits.embed: { allowedOrigins: [] }` + append `new EmbeddableExtractor()` to the composite extractor; update org-policy features.
- `src/composition/stub.ts` (modify) — declare `embed: 'demo-stub'` + wire `stubEmbedTransport({ embedded: false })` + add `limits.embed: { allowedOrigins: [] }` + append `new EmbeddableExtractor()` to the composite extractor; update org-policy features.
- `src/composition/route-narrowing.ts` (modify) — add `embedTransport: unavailableEmbedTransport()` to both narrowed-route branches; extend `instanceCapabilities` / `orgRuntimePolicy.features` declarations + `limits.embed: { allowedOrigins: [] }`.
- `src/app/respondent-flow.ts` (modify) — add `verifyEmbedOriginAllowed(...)` pure helper that throws `EmbedOriginNotAllowedError` when the iframe-context check fails. Add a `matchesAllowedOrigin(hostOrigin, allowed)` helper.
- `src/app/respondent-flow.test.ts` (modify) — unit-test the decision matrix (not embedded → no-op; embedded + origin allowed → no-op; embedded + origin not allowed → throws; embedded + wildcard → no-op; embedded + null hostOrigin → throws fail-closed).
- `src/app/RespondentRuntime.tsx` (modify) — call `verifyEmbedOriginAllowed(...)` inside `createReadyState` after the resolver call; extend `runtimePolicyErrorCopy` with the `embed` row + handle `EmbedOriginNotAllowedError`.
- `docs/ports/embed-transport.md` (new) — adopter doc per the other-port template.
- `docs/policy/runtime-feature-resolution.md` (modify) — add `embed` to the worked-key examples + the iframe-origin-gate worked example.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` (footer append, one bullet) — `embed` is the seventh / eighth feature key (per landing order).
- `tests/adapters/embed-transport-stub.test.ts` (new) — stub-specific: marker presence, `embedded` toggle, `_internalSentMessages` / `_internalSimulateHostMessage` round-trip.
- `tests/adapters/embed-transport-unavailable.test.ts` (new) — sentinel-specific: throws plain-language message; `isEmbedded()` false / `hostOrigin()` null.
- `tests/adapters/unavailable-sentinel.test.ts` (modify) — extend with the new sentinel.
- `tests/adapters/demo-stub-marker.test.ts` (modify) — extend with the new stub.
- `tests/app/respondent-runtime-embed.test.tsx` (new) — end-to-end through `RespondentRuntime`: render with the stub composition + a synthetic definition declaring `x-formspec-embeddable: true` + the stub transport configured `{ embedded: true, hostOrigin: 'https://allowed.example.test' }` + org limits `allowedOrigins: ['https://allowed.example.test']` → form mounts. Same setup with `hostOrigin: 'https://attacker.example.test'` → `EmbedOriginNotAllowedError` → policy error page renders the "this form is not set up to be shown on this site" copy. Same setup with `embedded: false` → form mounts regardless of allow-list. Vocabulary firewall: rendered DOM contains no `iframe`, `postMessage`, `EmbedTransport`, `allowedOrigins`, `hostOrigin`, `embed-transport`, `embedTransport` substrings.
- `tests/policy-resolution/cases/embed-optional-allowed.json` (new) — resolver fixture: org allowed + form optional + instance available → enabled.
- `tests/policy-resolution/cases/embed-disabled-no-instance.json` (new) — resolver fixture: form optional + instance unavailable → `optional-no-instance`.
- `tests/policy-resolution/cases/embed-org-forbidden.json` (new) — resolver fixture: form optional + org forbidden → `org-forbidden`.
- `tests/policy-resolution/cases/*.json` (modify pre-existing cases) — backfill the new `embed` key in `instance` / `org` blocks per the append-only key contract.
- `tests/composition/route-narrowing.test.ts` (modify) — descriptor matrix coverage for the new slot (uniform `unavailable` across all descriptors); add `'embed'` to the "no descriptor consumes today" invariant.
- `tests/profiles/composition-coherence.test.ts` (modify) — extend any per-key assertions for the new slot.
- `src/policy/freeze-composition.test.ts` (modify) — extend the coherent + incoherent cases with the new slot.
- `tests/adapter-conformance/README.md` (modify) — list the new port suite.
- `PLANNING.md` (modify) — FW-0040 row → `live (slice 1)` with named release gaps + follow-on rows FW-0102 / FW-0103 / FW-0104 / FW-0105 / FW-0106.

## Non-goals (explicit, to bound scope)

- **No Custom Element wrapper.** `<formspec-embed>` is FW-0053 territory.
- **No production transport adapter.** postMessage RPC + penpal / comlink wrappers are adopter-side. Filed.
- **No host-page demo.** A worked host-page demo with two iframes is FW-0053 + FW-0106 territory.
- **No CSP header generation.** The host's CSP is owned by the host; the adopter doc documents the recommended headers.
- **No SRI bundle helpers.** Adopter-side; documented.
- **No theming-handoff messages.** Future row per FW-0053 follow-ons.
- **No multi-form-per-iframe.** FW-0105.
- **No partial-origin matching (globs / regex).** Future row with a deliberate matcher.
- **No `IntakeHandoff` shape change.** Slice 1 does not embed the host-origin into the submission handoff; if a future row needs the host as a submission witness, it adds a typed extension to the handoff.

## Test coverage matrix

| Behaviour | Test |
|---|---|
| Port conformance: `isEmbedded()` returns boolean | `tests/adapter-conformance/embed-transport/conformance.test.ts#isEmbedded type` |
| Port conformance: `hostOrigin()` returns `string \| null` | `tests/adapter-conformance/embed-transport/conformance.test.ts#hostOrigin type` |
| Port conformance: `postMessage` rejects `'*'` targetOrigin | `tests/adapter-conformance/embed-transport/conformance.test.ts#wildcard rejected` |
| Port conformance: `postMessage` rejects non-origin strings | `tests/adapter-conformance/embed-transport/conformance.test.ts#path rejected` |
| Port conformance: `subscribeFromHost` returns Unsubscribe; cleanup removes listener | `tests/adapter-conformance/embed-transport/conformance.test.ts#unsubscribe` |
| Stub-specific: marker presence + featureKey | `tests/adapters/embed-transport-stub.test.ts#marker` |
| Stub-specific: `embedded` toggle round-trip | `tests/adapters/embed-transport-stub.test.ts#embedded` |
| Stub-specific: `_internalSentMessages` records postMessage calls | `tests/adapters/embed-transport-stub.test.ts#sent` |
| Stub-specific: `_internalSimulateHostMessage` dispatches to subscribers | `tests/adapters/embed-transport-stub.test.ts#simulate` |
| Sentinel-specific: throws plain-language message on `postMessage` / `subscribeFromHost` | `tests/adapters/embed-transport-unavailable.test.ts#throws` |
| Sentinel-specific: `isEmbedded()` false; `hostOrigin()` null | `tests/adapters/embed-transport-unavailable.test.ts#defaults` |
| Sentinel registry extended | `tests/adapters/unavailable-sentinel.test.ts` + `tests/adapters/demo-stub-marker.test.ts` |
| Form-policy walker: absent → undefined | `src/policy/extract-form-policy.test.ts#embed absent` |
| Form-policy walker: `x-formspec-embeddable: true` → 'optional' | `src/policy/extract-form-policy.test.ts#embed true` |
| Form-policy walker: `x-formspec-embeddable: false` → undefined | `src/policy/extract-form-policy.test.ts#embed false` |
| Form-policy walker: non-boolean ignored | `src/policy/extract-form-policy.test.ts#embed non-boolean` |
| Resolver: org allowed + form optional + instance available → enabled with limits | `tests/policy-resolution/cases/embed-optional-allowed.json` |
| Resolver: form optional + instance unavailable → `optional-no-instance` | `tests/policy-resolution/cases/embed-disabled-no-instance.json` |
| Resolver: form optional + org forbidden → `org-forbidden` | `tests/policy-resolution/cases/embed-org-forbidden.json` |
| Resolver: malformed `limits.embed.allowedOrigins` → `InvalidRuntimePolicyError` | `src/policy/resolver.test.ts` |
| `RespondentRuntime`: embedded + allowed origin → form mounts | `tests/app/respondent-runtime-embed.test.tsx#allowed` |
| `RespondentRuntime`: embedded + disallowed origin → `EmbedOriginNotAllowedError` → error page | `tests/app/respondent-runtime-embed.test.tsx#disallowed` |
| `RespondentRuntime`: embedded + wildcard allow → form mounts | `tests/app/respondent-runtime-embed.test.tsx#wildcard` |
| `RespondentRuntime`: embedded + null hostOrigin → fail-closed | `tests/app/respondent-runtime-embed.test.tsx#null-origin` |
| `RespondentRuntime`: not embedded → form mounts regardless of allow-list | `tests/app/respondent-runtime-embed.test.tsx#top-level` |
| Vocabulary firewall: rendered DOM never contains internal jargon | `tests/app/respondent-runtime-embed.test.tsx#vocabulary` |
| Composition coherence: every factory passes with the new key/slot | `tests/profiles/composition-coherence.test.ts` + `src/policy/freeze-composition.test.ts` |
| Feature-key registry: `embed` is in `RUNTIME_FEATURE_KEYS` | `src/policy/feature-keys.test.ts` |
| Conformance coverage script enumerates the new port | `scripts/check-conformance-coverage.mjs` (via `npm run ci`) |
| `verifyEmbedOriginAllowed` decision matrix | `src/app/respondent-flow.test.ts` |

## Risks and what catches them

- **Risk:** the new key extension breaks all pre-existing policy-resolution fixtures + the `RUNTIME_FEATURE_KEYS.toEqual(...)` test simultaneously. **Catch:** mirror FW-0027's pattern — backfill all fixtures in a single commit immediately after the policy module commit; verify via `npm run test:unit -- policy-resolution` before continuing.
- **Risk:** the `hostOrigin()` read returns `null` in production when `document.referrer` is stripped by cross-origin policy; the runtime fails-closed but adopters debugging the deployment see an opaque "not allowed" without a path forward. **Catch:** slice-1 design names this explicitly in `docs/ports/embed-transport.md`; the adopter-shipped production transport adapter (FW-0102) MUST complete a postMessage handshake to establish the origin before resolving `hostOrigin()`. The slice-1 stub returns a fixture-pinned origin so tests are deterministic; the unavailable sentinel returns `null` and the fail-closed behavior is exercised.
- **Risk:** an adopter wires `allowedOrigins: ['*']` thinking it means "any allowed subdomain of my org" — it actually means "any origin in the universe" and lets attackers iframe-embed the form anywhere. **Catch:** the adopter doc carries a stern warning; the conformance suite documents the semantics; future row (FW-0107?) may add a deliberate subdomain-glob matcher with explicit syntax.
- **Risk:** the form runtime is embedded in an iframe AND the user's identity flow involves a popup redirect (OIDC); the popup's window.opener is the iframe-mounted form, which may be blocked by browser sandbox-attribute defaults. **Catch:** out of slice-1 scope; identity-in-iframe is an adopter concern documented in `docs/ports/embed-transport.md` + the adopter's `<iframe sandbox=...>` MUST include `allow-popups` for OIDC flows.
- **Risk:** the runtime's `verifyEmbedOriginAllowed` helper reads from `composition.embedTransport.hostOrigin()` synchronously, but production adapters may need an async handshake before the origin is known. **Catch:** slice-1's port is synchronous because the iframe-context decision must happen at form-load (before the React mount); production adapters that need an async handshake MUST complete it in the adapter constructor / `init()` (called by the composition root before passing the adapter to `freezeComposition`). Slice 1's `unavailable` sentinel and `stub` both return synchronously; the production-transport row (FW-0102) carries the async-init pattern.
- **Risk:** the iframe context is `window.parent !== window` AND the parent is a popup the user opened of their own form (same-origin), which doesn't deserve fail-closed behavior. **Catch:** the production transport adapter's `isEmbedded()` SHOULD treat same-origin parent windows as not-embedded; slice 1's stub takes the parameter explicitly so adopters control the policy.
- **Risk:** the org-policy `allowedOrigins` allow-list is loaded from server-side config that might lag the iframe load by milliseconds; a race could fail-closed on a legitimate embed. **Catch:** the composition is constructed once at boot per web ADR-0009 §Composition lifecycle; the runtime feature gate runs at form-load time AFTER the composition is fully wired. There is no race in the slice-1 shape; adopters who load org-policy from a server MUST resolve the load before passing the composition to `RespondentRuntime`.

## What FW-0040 ships and what stays open

**Ships:**
- New `EmbedTransport` port + `EmbedMessage` / `EmbedMessageFromHost` / `Unsubscribe` types.
- Conformance suite + stub adapter (with embedded toggle + helpers) + unavailable sentinel.
- New `embed` runtime-feature key (seventh or eighth extension of the closed taxonomy; verify before append).
- New form-policy extractor (`EmbeddableExtractor`) reading `extensions['x-formspec-embeddable']`.
- New `embedTransport` slot on `Composition`; wired in default + stub + narrowed-route factories.
- New `orgRuntimePolicy.limits.embed: { allowedOrigins: string[] }` shape.
- New `EmbedOriginNotAllowedError extends RuntimePolicyError`.
- `RespondentRuntime` iframe-context detection + origin allow-list verification.
- Honest "this form is not set up to be shown on this site" copy.
- Adopter docs + ADR-0011 cross-reference + runtime-feature-resolution.md updates.

**Stays open (named follow-on rows):**
- **FW-0053** — Custom Element wrapper (`<formspec-embed>`).
- **FW-0102** — postMessage RPC reference adapter (handshake protocol; theme-handoff message; resize-request message).
- **FW-0103** — penpal / comlink wrapper docs (adopter-side cookbook for production hosts).
- **FW-0104** — Cross-origin storage / cookie isolation guidance + adapter shape.
- **FW-0105** — Multi-form-per-iframe composition.
- **FW-0106** — Demo form: declare `x-formspec-embeddable: true` once a worked host-page demo lands (gated on FW-0053 + FW-0102).

## Cross-references

- [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) — hexagonal discipline
- [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — new `embed` capability key
- stack-root [ADR-0128 (frontend surface architecture)](../../../thoughts/adr/0128-frontend-surface-architecture.md) — embed is one distribution mode of the public form-shell
- [FW-0027 design](2026-05-24-fw-0027-multi-rail-payment-design.md) — most analogous shape (port + extractor + closed-taxonomy extension)
- [FW-0044 design](2026-05-24-fw-0044-offline-capable-fill-design.md) — IN-FORM new-port + runtime-time gating precedent
- [FW-0033 design](2026-05-23-fw-0033-file-upload-design.md) — IN-FORM new-port + capability-key + extractor precedent
- [FW-0066 design](2026-05-24-fw-0066-form-runtime-policy-extractor-port-design.md) — `FormRuntimePolicyExtractor` port the embed extractor implements
- [`docs/ports/embed-transport.md`](../../docs/ports/embed-transport.md) — adopter doc (new)
- [`docs/policy/runtime-feature-resolution.md`](../../docs/policy/runtime-feature-resolution.md) — worked example (modified)
- FW-0053 row in PLANNING.md — Custom Element wrapper (depends on this slice's transport substrate)
