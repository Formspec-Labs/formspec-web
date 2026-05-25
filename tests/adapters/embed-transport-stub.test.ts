import { describe, expect, it } from 'vitest';
import { stubEmbedTransport } from '../../src/adapters/stub/embed-transport.ts';
import { DEMO_STUB_ADAPTER, isDemoStubAdapter } from '../../src/policy/sentinel.ts';
import type {
  EmbedMessage,
  EmbedMessageFromHost,
} from '../../src/ports/embed-transport.ts';

const sampleMessage: EmbedMessage = {
  kind: 'host-handshake',
  hostOrigin: 'https://allowed.example.test',
};

describe('stubEmbedTransport', () => {
  it('carries the DEMO_STUB_ADAPTER marker with the embed feature key', () => {
    const adapter = stubEmbedTransport();
    expect(isDemoStubAdapter(adapter)).toBe(true);
    const meta = (adapter as unknown as Record<symbol, { featureKey: string }>)[
      DEMO_STUB_ADAPTER
    ];
    expect(meta.featureKey).toBe('embed');
  });

  it('defaults to not embedded with a null host origin', () => {
    const adapter = stubEmbedTransport();
    expect(adapter.isEmbedded()).toBe(false);
    expect(adapter.hostOrigin()).toBe(null);
  });

  it('returns the configured host origin only when embedded', () => {
    const embedded = stubEmbedTransport({
      embedded: true,
      hostOrigin: 'https://allowed.example.test',
    });
    expect(embedded.isEmbedded()).toBe(true);
    expect(embedded.hostOrigin()).toBe('https://allowed.example.test');

    const detached = stubEmbedTransport({ hostOrigin: 'https://allowed.example.test' });
    expect(detached.isEmbedded()).toBe(false);
    expect(detached.hostOrigin()).toBe(null);
  });

  it('records postMessage calls in order', () => {
    const adapter = stubEmbedTransport({ embedded: true, hostOrigin: 'https://allowed.example.test' });
    adapter.postMessage(sampleMessage, 'https://allowed.example.test');
    adapter.postMessage(sampleMessage, 'https://other.example.test');
    const sent = adapter._internalSentMessages();
    expect(sent).toHaveLength(2);
    expect(sent[0].targetOrigin).toBe('https://allowed.example.test');
    expect(sent[1].targetOrigin).toBe('https://other.example.test');
  });

  it('rejects wildcard targetOrigin', () => {
    const adapter = stubEmbedTransport();
    expect(() => adapter.postMessage(sampleMessage, '*')).toThrow();
  });

  it('rejects non-origin strings with a path', () => {
    const adapter = stubEmbedTransport();
    expect(() =>
      adapter.postMessage(sampleMessage, 'https://allowed.example.test/path'),
    ).toThrow();
  });

  it('subscribeFromHost dispatches simulated messages to handlers and unsubscribes cleanly', () => {
    const adapter = stubEmbedTransport({ embedded: true, hostOrigin: 'https://allowed.example.test' });
    const received: EmbedMessageFromHost[] = [];
    const unsubscribe = adapter.subscribeFromHost((envelope) => {
      received.push(envelope);
    });

    adapter._internalSimulateHostMessage(sampleMessage, 'https://allowed.example.test');
    expect(received).toHaveLength(1);
    expect(received[0].origin).toBe('https://allowed.example.test');
    expect(received[0].data.kind).toBe('host-handshake');

    unsubscribe();
    adapter._internalSimulateHostMessage(sampleMessage, 'https://allowed.example.test');
    expect(received).toHaveLength(1);

    // Idempotent cleanup.
    expect(() => unsubscribe()).not.toThrow();
  });
});
