import { defineSurfaceBundleVerifierConformance } from '../_framework/conformance.ts';
import { IntegritySurfaceBundleVerifier } from '../../../src/adapters/integrity/index.ts';
import { createVerifierCase } from './fixtures.ts';

defineSurfaceBundleVerifierConformance(
  'integrity/WebCrypto SurfaceBundleVerifier conformance',
  () => ({
    case: (name) =>
      createVerifierCase(
        name,
        (config) => new IntegritySurfaceBundleVerifier(config),
      ),
  }),
);
