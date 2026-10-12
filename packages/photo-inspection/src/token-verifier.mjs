import { createLocalJWKSet, jwtVerify } from 'jose';

/** Explicit Keycloak profile only; matches Source shared policy constants. */
export function createTokenVerifier(identity, serviceSubject, jwks, now = () => Date.now()) {
  if (identity.profile !== 'keycloak') throw new Error('unsupported token profile');
  if (!Array.isArray(jwks.keys) || !jwks.keys.length || jwks.keys.length > 64) throw new Error('bounded signing keys required');
  const ids = new Set();
  const signingKeys = [];
  for (const key of jwks.keys) {
    if (!key || typeof key !== 'object' || Array.isArray(key)
      || typeof key.kid !== 'string' || !key.kid || key.kid.length > 256 || ids.has(key.kid)
      || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(field => Object.hasOwn(key, field))) throw new Error('identified public keys required');
    ids.add(key.kid);
    // Issuer sets can also publish encryption keys; they cannot verify JWT signatures.
    if (key.use === 'enc') continue;
    if (key.kty !== 'RSA' || (key.alg !== undefined && key.alg !== 'RS256')
      || (key.use !== undefined && key.use !== 'sig') || (key.key_ops !== undefined && JSON.stringify(key.key_ops) !== '["verify"]')
      || typeof key.n !== 'string' || !key.n || typeof key.e !== 'string' || !key.e
      || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(field => Object.hasOwn(key, field))) throw new Error('identified public RS256 signing keys required');
    signingKeys.push(key);
  }
  if (!signingKeys.length) throw new Error('RS256 signing keys required');
  const signingIds = new Set(signingKeys.map(key => key.kid));
  const keys = createLocalJWKSet({ keys: signingKeys });
  let lastNow = 0;
  return async token => {
    if (typeof token !== 'string' || token.length > 16 * 1024) throw new Error('token refused');
    let current = Math.floor(now() / 1000);
    if (!Number.isSafeInteger(current) || current <= 0 || current < lastNow) throw new Error('operational clock moved backward');
    lastNow = current;
    const { payload, protectedHeader } = await jwtVerify(token, keys, { algorithms: ['RS256'], issuer: identity.issuer,
      audience: identity.audience, requiredClaims: ['iss', 'aud', 'sub', 'iat', 'exp'], currentDate: new Date(current * 1000), clockTolerance: 30 });
    const afterCrypto = Math.floor(now() / 1000);
    if (!Number.isSafeInteger(afterCrypto) || afterCrypto <= 0 || afterCrypto < lastNow || afterCrypto < current) throw new Error('operational clock moved backward');
    current = afterCrypto; lastNow = afterCrypto;
    if (!signingIds.has(protectedHeader.kid) || ['jku', 'x5u', 'jwk'].some(field => Object.hasOwn(protectedHeader, field))) throw new Error('unregistered key reference');
    for (const field of ['iat', 'exp', ...(payload.nbf === undefined ? [] : ['nbf'])]) {
      if (!Number.isSafeInteger(payload[field]) || payload[field] < 0) throw new Error('integer token dates required');
    }
    if (payload.exp <= current || payload.iat > current + 30 || payload.exp <= payload.iat || payload.exp - payload.iat > 86400
      || (payload.nbf !== undefined && (payload.nbf > current + 30 || payload.nbf >= payload.exp))
      || (payload.jti !== undefined && (typeof payload.jti !== 'string' || !payload.jti.trim()))
      || typeof payload.sub !== 'string' || !payload.sub.trim()
      || payload.typ !== 'Bearer' || payload.sub !== serviceSubject || !identity.allowedClients.includes(payload.azp)
      || payload.azp !== identity.clientId || typeof payload.scope !== 'string') throw new Error('dedicated service claims refused');
    const scopes = payload.scope.split(' ');
    if (!scopes.length || scopes.some(scope => !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(scope))
      || identity.requiredScopes.some(scope => !scopes.includes(scope))) throw new Error('service scopes refused');
    return { issuer: payload.iss, subject: payload.sub, clientId: payload.azp, expiresAt: payload.exp };
  };
}
