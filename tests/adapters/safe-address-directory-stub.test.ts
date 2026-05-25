import { describe, expect, it } from 'vitest';
import { stubSafeAddressDirectory } from '../../src/adapters/stub/safe-address-directory.ts';

describe('stubSafeAddressDirectory', () => {
  it('validates configured substitute addresses and rejects unknown candidates', async () => {
    const directory = stubSafeAddressDirectory();
    await expect(directory.validateSubstituteAddress({
      jurisdictionKey: 'CA-ACP',
      accessClass: 'safe-address',
      candidate: 'PO Box 846, Sacramento, CA 95812',
    })).resolves.toMatchObject({ valid: true });
    await expect(directory.validateSubstituteAddress({
      jurisdictionKey: 'CA-ACP',
      accessClass: 'safe-address',
      candidate: '123 Fake St',
    })).resolves.toMatchObject({ valid: false, reason: 'not-recognized' });
  });
});
