/**
 * EmbedTransport port — web ADR-0009 / ADR-0011 / FW-0040.
 *
 * The substrate the respondent renderer uses when mounted inside a host
 * iframe. Slice 1 ships the read-side (iframe-context detection +
 * host-origin discovery) and the write-side (postMessage send +
 * subscribeFromHost listen) primitives behind one port; the Custom Element
 * wrapper (FW-0053) and production transport adapters (postMessage RPC,
 * penpal / comlink wrappers — FW-0102) compose against this port.
 *
 * Separation from `IdentityProvider` / `SubmitTransport` (FW-0040 §"Decision
 * on port shape"):
 *   - `IdentityProvider` answers "who is this respondent?".
 *   - `SubmitTransport` answers "where does this form submit?".
 *   - `EmbedTransport` answers "is this form embedded? in whose page? and
 *     how do we talk to that page?". The substrate varies per host
 *     integration (raw postMessage today; penpal / comlink wrappers in
 *     production adopter forks; future Web Component message channel) —
 *     the port is the single adopter-shaped seam.
 *
 * Conformance contract — the executable shape lives in
 * `defineEmbedTransportConformance` in `src/adapter-conformance/conformance.ts`;
 * adopters MUST run that suite against their adapter. The contract families:
 *
 * - `isEmbedded()` is a boolean (no truthy / falsy heuristics).
 * - `hostOrigin()` returns `string | null` (never `undefined`; never a
 *   malformed origin). Production adapters MAY return `null` until a
 *   postMessage handshake completes — runtime callers treat `null` as
 *   "unknown" and fail-closed under the iframe-context check.
 * - `postMessage` rejects `targetOrigin === '*'` — the load-bearing
 *   security invariant. Wildcards bypass the org-policy allow-list and
 *   defeat the iframe-context gate.
 * - `postMessage` rejects non-origin strings (no path / query / fragment).
 *   Origin shape is `scheme://host[:port]`.
 * - `subscribeFromHost` returns an `Unsubscribe` function that removes the
 *   listener cleanly; double-unsubscribe is a no-op.
 *
 * Slice-1 production posture: NO production reference adapter ships. The OSS
 * reference deployment wires `unavailableEmbedTransport()` + declares
 * `embed: 'unavailable'`. Adopters who want iframe-host integration fork
 * the composition file and wire their own postMessage / penpal / comlink
 * substrate. See `docs/ports/embed-transport.md`.
 */

export type EmbedMessage = {
  readonly kind: 'host-handshake';
  readonly hostOrigin: string;
};

export interface EmbedMessageFromHost {
  readonly data: EmbedMessage;
  readonly origin: string;
}

export type Unsubscribe = () => void;

export interface EmbedTransport {
  /**
   * Whether the form is mounted inside a host iframe. Adapter-shaped so
   * tests inject the state without touching `window.parent`; production
   * adapters compute it from `window.parent !== window` (treating
   * same-origin parents as not-embedded is an adapter-side policy).
   */
  isEmbedded(): boolean;

  /**
   * The host page's origin (scheme + host [+ port]) when embedded; `null`
   * when not embedded OR when the origin cannot be determined yet.
   * Production adapters MAY return `null` initially and resolve to the
   * real origin only after a postMessage handshake completes. Runtime
   * callers MUST treat `null` as "unknown" — the iframe-context gate
   * fails-closed in that case.
   */
  hostOrigin(): string | null;

  /**
   * Send a message to the host page. `targetOrigin` MUST be a concrete
   * origin string (`'https://clinic.example.org'`); the conformance suite
   * rejects `'*'` (wildcards bypass the allow-list) and rejects strings
   * with a path / query / fragment.
   */
  postMessage(message: EmbedMessage, targetOrigin: string): void;

  /**
   * Subscribe to messages from the host page. The handler receives the
   * raw `{ data, origin }` shape; the runtime is responsible for matching
   * `origin` against the allow-list before acting on `data`. Returns an
   * `Unsubscribe` function that removes the listener cleanly; calling
   * the returned function twice is a no-op (idempotent cleanup).
   */
  subscribeFromHost(handler: (message: EmbedMessageFromHost) => void): Unsubscribe;
}
