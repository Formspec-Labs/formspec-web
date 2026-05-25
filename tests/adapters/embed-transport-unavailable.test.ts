import { describe, expect, it } from 'vitest';
import { unavailableEmbedTransport } from '../../src/adapters/unavailable/embed-transport.ts';
import { UNAVAILABLE_ADAPTER, isUnavailableAdapter } from '../../src/policy/sentinel.ts';

describe('unavailableEmbedTransport', () => {
  it('carries the UNAVAILABLE_ADAPTER marker with the embed feature key', () => {
    const adapter = unavailableEmbedTransport();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    const meta = (adapter as unknown as Record<symbol, { featureKey: string }>)[
      UNAVAILABLE_ADAPTER
    ];
    expect(meta.featureKey).toBe('embed');
  });

  it('reports not-embedded with a null host origin', () => {
    const adapter = unavailableEmbedTransport();
    expect(adapter.isEmbedded()).toBe(false);
    expect(adapter.hostOrigin()).toBe(null);
  });

  it('throws a plain-language message on postMessage', () => {
    const adapter = unavailableEmbedTransport('Adopter has not wired an embed transport.');
    expect(() =>
      adapter.postMessage(
        { kind: 'host-handshake', hostOrigin: 'https://allowed.example.test' },
        'https://allowed.example.test',
      ),
    ).toThrowError('Adopter has not wired an embed transport.');
  });

  it('throws a plain-language message on subscribeFromHost', () => {
    const adapter = unavailableEmbedTransport();
    expect(() => adapter.subscribeFromHost(() => undefined)).toThrow();
  });
});
