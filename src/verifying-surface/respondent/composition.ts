import {
  StaticKeyResolver,
  semVer,
  uri,
  type SignatureMethodRegistry,
} from '@integrity-stack/signature-port';
import type {
  PublisherTrustPolicy,
  SurfaceBundleReleasePolicy,
} from '@formspec-org/surface-bundle-signing';
import { createDefaultComposition } from '../../composition/default.ts';
import type { Composition } from '../../composition/types.ts';
import type {
  FormspecWebConfig,
  RespondentSurfaceBundleConfig,
} from '../../config/types.ts';
import {
  respondentSurfaceBundleConfig,
  respondentSurfaceDeploymentIsConfigured,
} from '../../config/respondent-surface.ts';
import { createHttpSurfaceBundleSource } from '../../adapters/http/surface-bundle-source.ts';
import { createIntegritySurfaceBundleVerifier } from '../../adapters/integrity/surface-bundle-verifier.ts';
import { freezeComposition } from '../../policy/index.ts';

export interface RespondentSurfaceComposition {
  readonly composition: Composition;
  readonly bundleConfig: RespondentSurfaceBundleConfig;
}

export function createRespondentSurfaceComposition(
  config: FormspecWebConfig,
): RespondentSurfaceComposition {
  if (!respondentSurfaceDeploymentIsConfigured(config)) {
    throw new Error(
      'The signed respondent Surface requires the anonymous publicPortal deployment.',
    );
  }
  const bundleConfig = respondentSurfaceBundleConfig(config);
  if (!bundleConfig) {
    throw new Error('The signed respondent Surface deployment is not fully configured.');
  }
  const base = createDefaultComposition(config);
  if (base.mode !== 'production') {
    throw new Error('The signed respondent Surface requires the production HTTP composition.');
  }

  const verification = bundleConfig.verification;
  const keyResolver = new StaticKeyResolver(
    verification.keys.map((entry) => [
      decodeBase64Url(entry.kid, 'kid'),
      decodeRawEd25519PublicKey(entry.publicKey),
    ]),
  );
  const methodRegistry: SignatureMethodRegistry = {
    version: semVer(verification.methodRegistry.version),
    entries: verification.methodRegistry.entries.map((entry) => ({
      id: uri(entry.id),
      suite: entry.suite,
      wire: entry.wire,
      alg: entry.alg,
      status: entry.status,
      ...(entry.deprecationNotice
        ? { deprecationNotice: entry.deprecationNotice }
        : {}),
    })),
  };
  const trustPolicy: PublisherTrustPolicy = {
    authorities: verification.authorities.map((authority) => ({
      kid: decodeBase64Url(authority.kid, 'authority.kid'),
      publisherId: authority.publisherId,
      publisherDisplayName: authority.publisherDisplayName,
      ...(authority.appIds ? { appIds: [...authority.appIds] } : {}),
      ...(authority.appNamespaces
        ? { appNamespaces: [...authority.appNamespaces] }
        : {}),
      methods: [...authority.methods],
      validFrom: authority.validFrom,
      validUntil: authority.validUntil,
      revoked: authority.revoked,
    })),
  };
  const releasePolicy: SurfaceBundleReleasePolicy = {
    mode: 'pinned',
    allowed: verification.pinnedReleases.map((release) => ({
      digest: release.digest,
      ...(release.releaseId ? { releaseId: release.releaseId } : {}),
    })),
  };

  const composition = freezeComposition({
    ...base,
    surfaceBundleSource: createHttpSurfaceBundleSource({
      allowedOrigins: bundleConfig.allowedOrigins,
      maxBytes: bundleConfig.maxBytes,
      timeoutMs: bundleConfig.timeoutMs,
      redirectPolicy: bundleConfig.redirectPolicy,
      ...(bundleConfig.maxRedirects === undefined
        ? {}
        : { maxRedirects: bundleConfig.maxRedirects }),
    }),
    surfaceBundleVerifier: createIntegritySurfaceBundleVerifier({
      expectedAppId: verification.expectedAppId,
      methodRegistry,
      keyResolver,
      trustPolicy,
      releasePolicy,
      ...(verification.methodUriPrefix
        ? { methodUriPrefix: verification.methodUriPrefix }
        : {}),
    }),
  } satisfies Composition);

  return { composition, bundleConfig };
}

function decodeRawEd25519PublicKey(value: string): Uint8Array {
  const publicKey = decodeBase64Url(value, 'publicKey');
  if (publicKey.byteLength !== 32) {
    throw new Error(
      'Surface bundle publicKey must encode a raw 32-byte Ed25519 public key.',
    );
  }
  return publicKey;
}

function decodeBase64Url(value: string, field: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error(`Surface bundle ${field} must be unpadded base64url.`);
  }
  const standard = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch (error) {
    throw new Error(`Surface bundle ${field} is not valid base64url.`, { cause: error });
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
