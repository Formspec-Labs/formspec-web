import { describe, expect, it } from 'vitest';
import { unavailableSafeAddressDirectory } from '../../src/adapters/unavailable/safe-address-directory.ts';

describe('unavailableSafeAddressDirectory', () => {
  it('throws the configured unavailable message', async () => {
    const directory = unavailableSafeAddressDirectory('Wire a safe-address directory here.');
    await expect(directory.supportedJurisdictions()).rejects.toThrow(
      'Wire a safe-address directory here.',
    );
    await expect(directory.validateSubstituteAddress({
      jurisdictionKey: 'CA-ACP',
      candidate: 'PO Box 846',
    })).rejects.toThrow('Wire a safe-address directory here.');
  });
});
