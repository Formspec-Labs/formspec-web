import { describe, expect, it } from 'vitest';
import { AnonymousAdapter } from '../../../src/adapters/identity/anonymous.ts';

describe('AnonymousAdapter', () => {
  it('mints an L1 anonymous claim keyed by crypto.randomUUID', async () => {
    const adapter = new AnonymousAdapter();
    const [option] = await adapter.discover();
    if (!option) throw new Error('expected anonymous option');

    const claim = await adapter.authenticate(option);

    expect(claim).toMatchObject({
      provider: 'anonymous',
      adapter: 'anonymous@0',
      assuranceLevel: 'L1',
      privacyTier: 'anonymous',
    });
    expect(claim.subjectRef).toMatch(/^anon:[0-9a-f-]{36}$/);
  });
});
