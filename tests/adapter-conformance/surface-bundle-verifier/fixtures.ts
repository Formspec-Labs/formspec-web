import {
  buildSurfaceBundlePreimage,
  type MonotonicCommitResult,
  type MonotonicReleaseState,
  type MonotonicReleaseStore,
  type PublisherAuthority,
  type SurfaceBundleSignedPayloadV1,
} from '@formspec-org/surface-bundle-signing';
import {
  detachedSignatureProtectedHeader,
  encodeCoseSign1,
  sigStructureBytes,
} from '@formspec-org/integrity-cose';
import {
  StaticKeyResolver,
  semVer,
  uri,
  type SignatureMethodRegistry,
} from '@formspec-org/integrity-signature-port';
import { IntegritySurfaceBundleVerifier } from '../../../src/adapters/integrity/index.ts';
import type { IntegritySurfaceBundleVerifierConfig } from '../../../src/adapters/integrity/index.ts';
import {
  createSurfaceBundleSnapshot,
  type SurfaceBundleSnapshot,
} from '../../../src/ports/surface-bundle-source.ts';
import type {
  SurfaceBundleVerifierConformanceCase,
} from '../../../src/adapter-conformance/index.ts';

export const METHOD_ED25519 = 'urn:formspec:sig-method:ed25519-cose-sign1@1';
const METHOD_UNSUPPORTED = 'urn:formspec:sig-method:ml-dsa-65-cose-sign1@1';
export const APP_ID = 'https://example.gov/apps/intake';
const PUBLISHER_ID = 'https://publisher.example/';
const TRUSTED_KID = new TextEncoder().encode('publisher-key-2026');
const NOW = new Date('2026-07-28T16:00:00.000Z');

const REGISTRY: SignatureMethodRegistry = {
  version: semVer('1.1.0'),
  entries: [
    {
      id: uri(METHOD_ED25519),
      suite: 'Ed25519',
      wire: 'COSE_Sign1 with alg = -8',
      alg: -8,
      status: 'registered',
    },
    {
      id: uri(METHOD_UNSUPPORTED),
      suite: 'ML-DSA-65',
      wire: 'COSE_Sign1',
      alg: null,
      status: 'registered',
    },
  ],
};

export class AtomicTestStore implements MonotonicReleaseStore {
  state: MonotonicReleaseState | null;
  commitCalls = 0;

  constructor(initial: MonotonicReleaseState | null = null) {
    this.state = initial;
  }

  async read(): Promise<MonotonicReleaseState | null> {
    return this.state ? { ...this.state } : null;
  }

  async commitAdmitted(
    _appId: string,
    candidate: MonotonicReleaseState,
  ): Promise<MonotonicCommitResult> {
    this.commitCalls += 1;
    const current = this.state;
    if (current && candidate.sequence < current.sequence) {
      return { status: 'rejected', code: 'stale', current: { ...current } };
    }
    if (
      current
      && candidate.sequence === current.sequence
      && candidate.digest !== current.digest
    ) {
      return {
        status: 'rejected',
        code: 'sequence-conflict',
        current: { ...current },
      };
    }
    if (
      current
      && candidate.sequence === current.sequence
      && candidate.digest === current.digest
    ) {
      return { status: 'already-current', state: { ...current } };
    }
    this.state = { ...candidate };
    return { status: 'committed', state: { ...candidate } };
  }
}

export interface VerifierFixture {
  readonly adapter: IntegritySurfaceBundleVerifier;
  readonly snapshot: SurfaceBundleSnapshot;
  readonly store: AtomicTestStore;
}

export async function createVerifierCase(
  name: SurfaceBundleVerifierConformanceCase,
  createAdapter: (
    config: IntegritySurfaceBundleVerifierConfig,
  ) => IntegritySurfaceBundleVerifier = (config) =>
    new IntegritySurfaceBundleVerifier(config),
): Promise<VerifierFixture> {
  const trustedPair = await generateKeyPair();
  const trustedPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', trustedPair.publicKey),
  );
  let candidatePayload = payload();
  let candidateKid = TRUSTED_KID;
  let candidatePrivateKey = trustedPair.privateKey;
  let candidateMethod = METHOD_ED25519;
  let configuredAuthority = authority();
  let store = new AtomicTestStore();

  if (name === 'wrong-publisher') {
    candidatePayload = payload({ publisherId: 'https://attacker.example/' });
  } else if (name === 'wrong-app') {
    candidatePayload = payload({ appId: 'https://example.gov/apps/operator' });
  } else if (name === 'expired-authority') {
    configuredAuthority = authority({ validUntil: NOW.toISOString() });
  } else if (name === 'revoked-authority') {
    configuredAuthority = authority({ revoked: true });
  } else if (name === 'stale-release') {
    store = new AtomicTestStore({
      sequence: 43,
      digest: 'a'.repeat(64),
      releaseId: '2026-07-29.1',
    });
  } else if (name === 'unsupported-method') {
    candidateMethod = METHOD_UNSUPPORTED;
  } else if (name === 'unknown-key') {
    const attackerPair = await generateKeyPair();
    candidateKid = new TextEncoder().encode('attacker-key');
    candidatePrivateKey = attackerPair.privateKey;
  }

  let candidateBytes = await signCandidate(candidatePayload, {
    keyPair: trustedPair,
    kid: candidateKid,
    privateKey: candidatePrivateKey,
    methodUri: candidateMethod,
  });

  if (name === 'tampered') {
    const changed = JSON.parse(new TextDecoder().decode(candidateBytes)) as CandidateJson;
    changed.signedPayload.release.id = '2026-07-28.2';
    candidateBytes = encodeCandidate(changed);
  } else if (name === 'replacement-sidecar') {
    const changed = JSON.parse(new TextDecoder().decode(candidateBytes)) as CandidateJson & {
      publicKey?: string;
    };
    changed.publicKey = encodeBase64Url(trustedPublicKey);
    candidateBytes = encodeCandidate(changed);
  }

  const snapshot = await snapshotFrom(candidateBytes, `memory:${name}`);
  const adapter = createAdapter({
    expectedAppId: APP_ID,
    methodRegistry: REGISTRY,
    keyResolver: new StaticKeyResolver([[TRUSTED_KID, trustedPublicKey]]),
    trustPolicy: { authorities: [configuredAuthority] },
    releasePolicy: { mode: 'monotonic', store },
    now: () => NOW,
  });
  return { adapter, snapshot, store };
}

export async function snapshotFrom(
  bytes: Uint8Array,
  locator = 'memory:fixture',
): Promise<SurfaceBundleSnapshot> {
  return createSurfaceBundleSnapshot(bytes, {
    adapterId: 'urn:formspec-web:test:surface-bundle-source@1',
    requestedLocator: locator,
    resolvedLocator: locator,
    acquiredAt: NOW.toISOString(),
  });
}

function payload(
  overrides: {
    publisherId?: string;
    appId?: string;
    sequence?: number;
  } = {},
): SurfaceBundleSignedPayloadV1 {
  return {
    profile: 'formspec-surface-bundle-signing-v1',
    publisher: { id: overrides.publisherId ?? PUBLISHER_ID },
    release: { id: '2026-07-28.1', sequence: overrides.sequence ?? 42 },
    manifest: {
      id: overrides.appId ?? APP_ID,
      $formspecApp: '2.4',
      surfaces: [],
    },
    documents: {},
  };
}

function authority(overrides: Partial<PublisherAuthority> = {}): PublisherAuthority {
  return {
    kid: TRUSTED_KID,
    publisherId: PUBLISHER_ID,
    publisherDisplayName: 'Example Benefits Publisher',
    appIds: [APP_ID],
    methods: [METHOD_ED25519, METHOD_UNSUPPORTED],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    revoked: false,
    ...overrides,
  };
}

async function signCandidate(
  signedPayload: SurfaceBundleSignedPayloadV1,
  options: {
    keyPair: CryptoKeyPair;
    kid: Uint8Array;
    privateKey: CryptoKey;
    methodUri: string;
  },
): Promise<Uint8Array> {
  const protectedHeader = detachedSignatureProtectedHeader(
    -8,
    options.kid,
    options.methodUri,
  );
  const preimage = buildSurfaceBundlePreimage(signedPayload);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      options.privateKey,
      sigStructureBytes(protectedHeader, preimage) as BufferSource,
    ),
  );
  return encodeCandidate({
    signedPayload: structuredClone(signedPayload),
    signature: {
      format: 'COSE_Sign1',
      value: encodeBase64Url(
        encodeCoseSign1(protectedHeader, null, signature),
      ),
    },
  });
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;
}

interface CandidateJson {
  signedPayload: {
    profile: string;
    publisher: { id: string };
    release: { id: string; sequence: number };
    manifest: { id: string; [key: string]: unknown };
    documents: Record<string, Record<string, unknown>>;
  };
  signature: { format: string; value: string };
}

function encodeCandidate(candidate: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(candidate));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}
