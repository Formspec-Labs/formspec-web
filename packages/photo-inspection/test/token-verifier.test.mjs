import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerFixture } from './provider-fixture.mjs';
import { createTokenVerifier } from '../src/token-verifier.mjs';

const fixture = await providerFixture();
const signing = JSON.parse(fixture.jwksBytes).keys[0];
const encryption = { ...signing, kid: 'encryption-key', alg: 'RSA-OAEP', use: 'enc', key_ops: ['encrypt'] };
const verifier = keys => createTokenVerifier(fixture.config.registration.credentialIdentity,
  fixture.config.serviceSubject, { keys }, () => fixture.now);

test('mixed Keycloak keys select signing keys and verify the dedicated service token', async () => {
  const verify = verifier([encryption, signing]);
  assert.equal((await verify(await fixture.token(fixture.claims))).clientId, 'source-photo-client');
  await assert.rejects(verify(await fixture.token({ ...fixture.claims, aud: 'other' })));
  await assert.rejects(verify(await fixture.token({ ...fixture.claims, scope: 'other' })));
});

test('mixed sets still refuse duplicate identifiers, malformed signing keys and no signing key', () => {
  for (const keys of [[signing, { ...encryption, kid: signing.kid }],
    [encryption, { ...signing, n: '' }], [encryption, { ...signing, alg: 'RS512' }],
    [encryption, { ...signing, key_ops: ['sign'] }], [encryption, { ...signing, d: 'private' }],
    [encryption], [signing, null]]) assert.throws(() => verifier(keys));
});
