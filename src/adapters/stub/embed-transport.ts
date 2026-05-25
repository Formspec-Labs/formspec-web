import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import type {
  EmbedMessage,
  EmbedMessageFromHost,
  EmbedTransport,
  Unsubscribe,
} from '../../ports/embed-transport.ts';

export interface StubEmbedTransport extends EmbedTransport {
  /** Test-only: returns a snapshot of every postMessage call. */
  _internalSentMessages(): ReadonlyArray<{
    readonly message: EmbedMessage;
    readonly targetOrigin: string;
  }>;
  /**
   * Test-only: synthesizes a host→form message and dispatches it to every
   * registered subscriber. Mirrors what a real adapter does when the
   * browser fires a `message` event from the parent window.
   */
  _internalSimulateHostMessage(message: EmbedMessage, origin: string): void;
}

export interface StubEmbedTransportOptions {
  /**
   * Whether the simulated mount context is an iframe. Defaults to `false`
   * (top-level window — the bundled demo posture). Tests opt in to the
   * embedded branch with `{ embedded: true }`.
   */
  readonly embedded?: boolean;
  /**
   * Simulated host origin. Returned by `hostOrigin()` when `embedded` is
   * true. When `undefined`, the stub returns `null` from `hostOrigin()`
   * so tests can exercise the fail-closed branch.
   */
  readonly hostOrigin?: string;
}

/**
 * In-memory EmbedTransport for demo + tests.
 *
 * - Tracks `_internalSentMessages()` for postMessage call assertions.
 * - Exposes `_internalSimulateHostMessage()` so tests can drive the
 *   subscribe path without `window.postMessage` plumbing.
 * - Marked DEMO_STUB_ADAPTER per ADR-0011; the coherence assertion
 *   forbids this adapter in production mode.
 *
 * Production reference adapters (FW-0102) replace the in-memory bus with
 * real `window.postMessage` plumbing + a handshake protocol that resolves
 * `hostOrigin()` after the host page replies; the port shape is unchanged.
 */
export function stubEmbedTransport(
  options: StubEmbedTransportOptions = {},
): StubEmbedTransport {
  const embedded = options.embedded ?? false;
  const configuredHostOrigin = options.hostOrigin ?? null;
  const sent: Array<{ message: EmbedMessage; targetOrigin: string }> = [];
  const subscribers = new Set<(message: EmbedMessageFromHost) => void>();

  const adapter: StubEmbedTransport = {
    isEmbedded() {
      return embedded;
    },

    hostOrigin() {
      return embedded ? configuredHostOrigin : null;
    },

    postMessage(message, targetOrigin) {
      if (targetOrigin === '*') {
        throw new Error(
          "EmbedTransport.postMessage: targetOrigin '*' is forbidden; use a concrete origin",
        );
      }
      assertWellFormedTargetOrigin(targetOrigin);
      sent.push({ message, targetOrigin });
    },

    subscribeFromHost(handler) {
      subscribers.add(handler);
      let removed = false;
      const unsubscribe: Unsubscribe = () => {
        if (removed) return;
        removed = true;
        subscribers.delete(handler);
      };
      return unsubscribe;
    },

    _internalSentMessages() {
      return sent.slice();
    },

    _internalSimulateHostMessage(message, origin) {
      const envelope: EmbedMessageFromHost = { data: message, origin };
      for (const handler of subscribers) {
        handler(envelope);
      }
    },
  };
  markDemoStubAdapter(adapter, {
    featureKey: 'embed',
    reason: 'in-memory embed transport; demo only — no real host page wired',
  });
  return adapter;
}

function assertWellFormedTargetOrigin(value: string): void {
  if (value.length === 0) {
    throw new Error('EmbedTransport.postMessage: targetOrigin must be a non-empty origin');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `EmbedTransport.postMessage: targetOrigin "${value}" is not a valid URL`,
    );
  }
  if (url.origin !== value) {
    throw new Error(
      `EmbedTransport.postMessage: targetOrigin "${value}" must be an origin (no path, query, or fragment); got "${url.origin}" canonical`,
    );
  }
}
