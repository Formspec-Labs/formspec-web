import { loadProviderConfig } from './provider-config.mjs';
import { createTokenVerifier } from './token-verifier.mjs';
import { assertRuntimeContainment } from './containment.mjs';
import { createProviderHandler } from './provider-core.mjs';

/** Production composition: fixed real clock/kernel guard; no uncontained fallback. */
export async function createRegisteredPhotoProvider({ configBytes, policyBytes, jwksBytes, receiptSink }) {
  if (typeof receiptSink !== 'function') throw new TypeError('explicit diagnostic receipt sink required');
  const selected = loadProviderConfig(configBytes, policyBytes, jwksBytes);
  await assertRuntimeContainment();
  const verifyToken = createTokenVerifier(selected.config.registration.credentialIdentity, selected.config.serviceSubject, selected.jwks);
  return createProviderHandler({ selected, verifyToken, checkContainment: assertRuntimeContainment, receiptSink });
}
