import { defineSafeAddressDirectoryConformance } from '../../../src/adapter-conformance/index.ts';
import { stubSafeAddressDirectory } from '../../../src/adapters/stub/safe-address-directory.ts';

defineSafeAddressDirectoryConformance('stub SafeAddressDirectory conformance', () => ({
  adapter: stubSafeAddressDirectory(),
  expectedJurisdiction: {
    jurisdictionKey: 'CA-ACP',
    label: 'California Safe at Home',
    accessClass: 'safe-address',
  },
  validCandidate: 'PO Box 846, Sacramento, CA 95812',
  invalidCandidate: '123 Fake St',
}));
