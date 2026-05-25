import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type {
  EmbedMessage,
  EmbedMessageFromHost,
  EmbedTransport,
  Unsubscribe,
} from '../../ports/embed-transport.ts';

export function unavailableEmbedTransport(
  message = 'Embed transport adapter is not configured for this deployment.',
): EmbedTransport {
  const adapter: EmbedTransport = {
    isEmbedded(): boolean {
      return false;
    },
    hostOrigin(): string | null {
      return null;
    },
    postMessage(_message: EmbedMessage, _targetOrigin: string): void {
      throw new Error(message);
    },
    subscribeFromHost(_handler: (envelope: EmbedMessageFromHost) => void): Unsubscribe {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'embed',
    reason: message,
  });
}
