import { describe, expect, it } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';

describe('composition root smoke', () => {
  it('createStubComposition wires all 5 MVP ports', () => {
    const c = createStubComposition();
    expect(c.definitionSource).toBeDefined();
    expect(c.draftStore).toBeDefined();
    expect(c.submitTransport).toBeDefined();
    expect(c.identityProvider).toBeDefined();
    expect(c.notificationDelivery).toBeDefined();
  });

  it('createDefaultComposition produces a Composition (currently delegates to stub)', () => {
    const c = createDefaultComposition();
    expect(c.definitionSource).toBeDefined();
    expect(c.identityProvider).toBeDefined();
  });

  it('SubmitTransport is idempotent on the same key', async () => {
    const { submitTransport } = createStubComposition();
    const first = await submitTransport.submit({}, 'key-1');
    const second = await submitTransport.submit({}, 'key-1');
    expect(second.referenceNumber).toBe(first.referenceNumber);
  });

  it('SubmitTransport returns a new reference number on a new key', async () => {
    const { submitTransport } = createStubComposition();
    const first = await submitTransport.submit({}, 'key-A');
    const second = await submitTransport.submit({}, 'key-B');
    expect(second.referenceNumber).not.toBe(first.referenceNumber);
  });

  it('IdentityProvider subscribe receives initial null then update on authenticate', async () => {
    const { identityProvider } = createStubComposition();
    const received: Array<unknown> = [];
    const unsubscribe = identityProvider.subscribe((c) => received.push(c));
    expect(received).toEqual([null]);
    const [option] = await identityProvider.discover();
    if (!option) throw new Error('expected at least one IdP option');
    const claim = await identityProvider.authenticate(option);
    expect(claim.assuranceLevel).toBe('L1');
    expect(received).toHaveLength(2);
    expect(received[1]).toBe(claim);
    unsubscribe();
  });
});
