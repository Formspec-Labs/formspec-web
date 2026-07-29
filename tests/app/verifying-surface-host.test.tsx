import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  kidOrThumbprint,
  semVer,
  uri,
} from '@integrity-stack/signature-port';
import type { AppGraphReportProducerResult } from '@formspec-org/app-graph';
import type {
  SurfaceBundleSignedPayloadV1,
} from '@formspec-org/surface-bundle-signing';
import {
  createSurfaceBundleSnapshot,
  SurfaceBundleSourceError,
  type SurfaceBundleSnapshot,
  type SurfaceBundleSource,
} from '../../src/ports/surface-bundle-source.ts';
import type {
  SurfaceBundleReleaseCommitRequest,
  SurfaceBundleReleaseCommitResult,
  SurfaceBundleReleasePrecondition,
  SurfaceBundleVerificationResult,
  SurfaceBundleVerifiedResult,
  SurfaceBundleVerifier,
} from '../../src/ports/surface-bundle-verifier.ts';
import {
  VerifyingSurfaceHost,
  admitSurfaceBundle,
  type SurfaceAdmissionState,
  type SurfaceBundleValidationConfig,
} from '../../src/verifying-surface/index.ts';

const APP_ID = 'https://example.gov/apps/signed-intake';
const PUBLISHER_ID = 'https://signed.publisher.example/';
const SURFACE_URL = 'https://example.gov/surfaces/main';
const SIGNED_TITLE = 'Signed benefits intake';
const SIGNED_CONTENT = 'Authenticated bundle content';
const SECOND_ROUTE_CONTENT = 'Authenticated receipt content';
const RAW_FAILURE_SENTINEL = 'RAW-ADAPTER-FAILURE-MUST-NOT-RENDER';
const SOURCE_SIDECAR_SENTINEL = 'unsigned-sidecar.example';
const MISATTRIBUTED_SOURCE_SENTINEL = 'misattributed-verifier-source.example';
const CHECKED_AT = '2026-07-28T16:00:00.000Z';

const validation: SurfaceBundleValidationConfig = {
  schemaValidators: () => ({ ok: true }),
};

afterEach(() => {
  cleanup();
  document.title = '';
  vi.restoreAllMocks();
});

describe('admitSurfaceBundle', () => {
  it('runs acquire → verify → validate → dereference → commit and admits one snapshot', async () => {
    const events: string[] = [];
    const fixture = await createFixture({
      onAcquire: () => events.push('acquire'),
      onVerify: () => events.push('verify'),
      onCommit: () => events.push('commit'),
    });

    const state = await admitSurfaceBundle({
      source: fixture.source,
      verifier: fixture.verifier,
      request: { locator: 'https://host.example/apps/intake.bundle' },
      validation: {
        schemaValidators: () => {
          events.push('validate');
          return { ok: true };
        },
      },
    });

    expect(state.status).toBe('admitted');
    expect(events[0]).toBe('acquire');
    expect(events[1]).toBe('verify');
    expect(events.at(-1)).toBe('commit');
    expect(events.filter((event) => event === 'validate').length).toBeGreaterThan(0);
    expect(events.indexOf('validate')).toBeLessThan(events.indexOf('commit'));
    expect(fixture.commitRequests).toHaveLength(1);
    expect(fixture.commitRequests[0]?.snapshot).toBe(fixture.snapshot);
  });

  it('does not commit when a graph-valid candidate becomes non-renderable before release commit', async () => {
    const payload = signedPayload();
    const fixture = await createFixture({
      verificationFactory: (snapshot) => ({
        ...verifiedResult(snapshot),
        payload,
      }),
    });
    const state = await admitSurfaceBundle({
      source: fixture.source,
      verifier: fixture.verifier,
      request: { locator: 'https://host.example/apps/intake.bundle' },
      validation,
      onValidationReport: (result) => {
        expect(result.report.ok).toBe(true);
        delete (payload.documents as Record<string, unknown>)[SURFACE_URL];
      },
    });

    expect(state).toEqual({
      status: 'failure',
      code: 'bundle-not-renderable',
    });
    expect(fixture.commitRequests).toHaveLength(0);
  });

  it.each([
    ['staff Surface', 'https://example.gov/unmanifested/staff', {
      $formspecSurface: '0.2',
      id: 'staff',
      entry: 'queue',
      routes: [{
        id: 'queue',
        path: '/queue',
        routeClass: 'operation',
        slots: [{ id: 'queue-copy', slotType: 'static-content', binding: { kind: 'text', content: 'Staff' } }],
      }],
    }],
    ['staff Data Sources', 'https://example.gov/unmanifested/staff-data', {
      $formspecDataSources: '1.0',
      id: 'https://example.gov/unmanifested/staff-data',
      version: '1.0.0',
      sources: [{
        id: 'query:queue',
        kind: 'query-result',
        owner: 'host',
        scope: 'route',
        availability: { level: 'app' },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'none' },
          authorizationBoundary: 'host',
          failureMode: 'block-render',
          provenance: { kind: 'query-result', source: 'queue' },
        },
      }],
    }],
    ['ceremony Surface', 'https://example.gov/unmanifested/ceremony', {
      $formspecSurface: '0.2',
      id: 'signer',
      entry: 'sign',
      routes: [{
        id: 'sign',
        path: '/sign',
        routeClass: 'ceremony',
        slots: [{ id: 'sign-copy', slotType: 'static-content', binding: { kind: 'text', content: 'Sign' } }],
      }],
    }],
  ])('rejects an unmanifested %s before validation or commit', async (_name, url, document) => {
    const fixture = await createFixture({
      verificationFactory: (snapshot) => {
        const verified = verifiedResult(snapshot);
        return {
          ...verified,
          payload: {
            ...verified.payload,
            documents: {
              ...verified.payload.documents,
              [url]: document,
            },
          },
        };
      },
    });

    const state = await admitSurfaceBundle({
      source: fixture.source,
      verifier: fixture.verifier,
      request: { locator: 'https://host.example/apps/intake.bundle' },
      validation,
    });

    expect(state).toEqual({
      status: 'failure',
      code: 'app-graph-invalid',
      diagnosticCode: 'unmanifested-document',
    });
    expect(fixture.commitRequests).toHaveLength(0);
  });

  it('returns fixed host codes and does not commit an invalid AppGraph', async () => {
    const fixture = await createFixture();
    const reports: AppGraphReportProducerResult[] = [];

    const state = await admitSurfaceBundle({
      source: fixture.source,
      verifier: fixture.verifier,
      request: { locator: 'https://host.example/apps/intake.bundle' },
      validation: {
        schemaValidators: () => ({
          ok: false,
          issues: [{ message: RAW_FAILURE_SENTINEL }],
        }),
      },
      onValidationReport: (report) => reports.push(report),
    });

    expect(state).toEqual({
      status: 'failure',
      code: 'app-graph-invalid',
    });
    expect(JSON.stringify(state)).not.toContain(RAW_FAILURE_SENTINEL);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.report.ok).toBe(false);
    expect(fixture.commitRequests).toHaveLength(0);
  });

  it('refuses mismatched verification and release snapshot identities', async () => {
    const verificationMismatch = await createFixture({
      verificationFactory: (snapshot) => ({
        ...verifiedResult(snapshot),
        snapshotIdentity: 'sha256:different-candidate',
      }),
    });
    const verificationState = await admitSurfaceBundle({
      source: verificationMismatch.source,
      verifier: verificationMismatch.verifier,
      request: { locator: 'https://host.example/apps/intake.bundle' },
      validation,
    });

    expect(verificationState).toEqual({
      status: 'adapter-error',
      code: 'verification-unavailable',
      diagnosticCode: 'snapshot-identity-mismatch',
    });
    expect(verificationMismatch.commitRequests).toHaveLength(0);

    const releaseMismatch = await createFixture({
      commit: {
        status: 'committed',
        releaseCommit: 'committed',
        snapshotIdentity: 'sha256:different-candidate',
      },
    });
    const releaseState = await admitSurfaceBundle({
      source: releaseMismatch.source,
      verifier: releaseMismatch.verifier,
      request: { locator: 'https://host.example/apps/intake.bundle' },
      validation,
    });

    expect(releaseState).toEqual({
      status: 'adapter-error',
      code: 'release-unavailable',
      diagnosticCode: 'snapshot-identity-mismatch',
    });
  });

  it('classifies source, verification, and release outcomes without exposing reasons', async () => {
    const cases: ReadonlyArray<{
      name: string;
      sourceError?: unknown;
      verification?: SurfaceBundleVerificationResult;
      commit?: SurfaceBundleReleaseCommitResult;
      expected: SurfaceAdmissionState;
    }> = [
      {
        name: 'refused source',
        sourceError: new SurfaceBundleSourceError(
          'disallowed-location',
          RAW_FAILURE_SENTINEL,
        ),
        expected: { status: 'failure', code: 'source-refused', diagnosticCode: 'disallowed-location' },
      },
      {
        name: 'source adapter error',
        sourceError: new Error(RAW_FAILURE_SENTINEL),
        expected: { status: 'adapter-error', code: 'unexpected-adapter-error' },
      },
      {
        name: 'source timeout',
        sourceError: new SurfaceBundleSourceError('timeout', RAW_FAILURE_SENTINEL),
        expected: {
          status: 'adapter-error',
          code: 'source-unavailable',
          diagnosticCode: 'timeout',
        },
      },
      {
        name: 'failed signature',
        verification: failedVerification('signature-invalid'),
        expected: { status: 'failure', code: 'verification-failed', diagnosticCode: 'signature-invalid' },
      },
      {
        name: 'unsupported method',
        verification: unverifiedVerification('integrity-unsupported'),
        expected: { status: 'unsupported', code: 'verification-unsupported', diagnosticCode: 'integrity-unsupported' },
      },
      {
        name: 'verifier unavailable',
        verification: unverifiedVerification('verifier-unavailable'),
        expected: { status: 'adapter-error', code: 'verification-unavailable', diagnosticCode: 'verifier-unavailable' },
      },
      {
        name: 'release refused',
        commit: {
          status: 'refused',
          code: 'sequence-conflict',
          reason: RAW_FAILURE_SENTINEL,
          snapshotIdentity: 'sha256:test',
        },
        expected: { status: 'failure', code: 'release-refused', diagnosticCode: 'sequence-conflict' },
      },
      {
        name: 'release store unavailable',
        commit: {
          status: 'unavailable',
          code: 'store-unavailable',
          reason: RAW_FAILURE_SENTINEL,
          snapshotIdentity: 'sha256:test',
        },
        expected: { status: 'adapter-error', code: 'release-unavailable', diagnosticCode: 'store-unavailable' },
      },
    ];

    for (const testCase of cases) {
      const fixture = await createFixture({
        ...(testCase.sourceError ? { sourceError: testCase.sourceError } : {}),
        ...(testCase.verification ? { verification: testCase.verification } : {}),
        ...(testCase.commit ? { commit: testCase.commit } : {}),
      });
      const state = await admitSurfaceBundle({
        source: fixture.source,
        verifier: fixture.verifier,
        request: { locator: 'https://host.example/apps/intake.bundle' },
        validation,
      });

      expect(state, testCase.name).toEqual(testCase.expected);
      expect(JSON.stringify(state), testCase.name).not.toContain(RAW_FAILURE_SENTINEL);
    }
  });
});

describe('VerifyingSurfaceHost', () => {
  it('shows only host-owned checking copy while acquisition is pending', async () => {
    document.title = 'Trusted host';
    const pending = deferred<SurfaceBundleSnapshot>();
    const fixture = await createFixture({ acquireResult: pending.promise });

    renderHost(fixture);

    expect(screen.getByRole('status').getAttribute('data-admission-status')).toBe('checking');
    expect(screen.getByRole('heading', { name: 'Checking this app' })).toBeDefined();
    expect(screen.queryByText(SIGNED_TITLE)).toBeNull();
    expect(screen.queryByText(SIGNED_CONTENT)).toBeNull();
    expect(screen.queryByText('Example Benefits Publisher')).toBeNull();
    expect(document.title).toBe('Trusted host');
  });

  it.each([
    {
      name: 'failed verification',
      verification: failedVerification('signature-invalid'),
      heading: 'This app could not be verified',
      status: 'failure',
    },
    {
      name: 'unsupported verification',
      verification: unverifiedVerification('integrity-unsupported'),
      heading: 'This signed app is not supported here',
      status: 'unsupported',
    },
    {
      name: 'verification adapter error',
      verificationError: new Error(RAW_FAILURE_SENTINEL),
      heading: 'This app is temporarily unavailable',
      status: 'adapter-error',
    },
  ])('renders fixed $name UI without bundle or adapter text', async (testCase) => {
    document.title = 'Trusted host';
    const fixture = await createFixture({
      ...(testCase.verification ? { verification: testCase.verification } : {}),
      ...(testCase.verificationError
        ? { verificationError: testCase.verificationError }
        : {}),
    });

    renderHost(fixture);

    const alert = await screen.findByRole('alert');
    expect(alert.getAttribute('data-admission-status')).toBe(testCase.status);
    expect(screen.getByRole('heading', { name: testCase.heading })).toBeDefined();
    expect(document.body.textContent).not.toContain(SIGNED_TITLE);
    expect(document.body.textContent).not.toContain(SIGNED_CONTENT);
    expect(document.body.textContent).not.toContain(RAW_FAILURE_SENTINEL);
    expect(document.body.textContent).not.toContain(SOURCE_SIDECAR_SENTINEL);
    expect(document.title).toBe('Trusted host');
  });

  it('does not render or set the title until release admission commits', async () => {
    document.title = 'Trusted host';
    const pendingCommit = deferred<SurfaceBundleReleaseCommitResult>();
    const fixture = await createFixture({ commitResult: pendingCommit.promise });

    renderHost(fixture);

    await waitFor(() => {
      expect(fixture.commitRequests).toHaveLength(1);
    });
    expect(screen.getByRole('heading', { name: 'Checking this app' })).toBeDefined();
    expect(screen.queryByText(SIGNED_CONTENT)).toBeNull();
    expect(screen.queryByLabelText('App verification')).toBeNull();
    expect(document.title).toBe('Trusted host');

    pendingCommit.resolve(committed(fixture.snapshot));

    expect(await screen.findByText(SIGNED_CONTENT)).toBeDefined();
    expect(screen.getByLabelText('App verification')).toBeDefined();
    await waitFor(() => {
      expect(document.title).toBe(SIGNED_TITLE);
    });
  });

  it('keeps trust, signed claims, and host observations visibly distinct', async () => {
    const fixture = await createFixture({
      verificationFactory: (snapshot) => {
        const verified = verifiedResult(snapshot);
        return {
          ...verified,
          provenance: {
            ...verified.provenance,
            source: {
              ...verified.provenance.source,
              resolvedLocator: `https://${MISATTRIBUTED_SOURCE_SENTINEL}/candidate`,
            },
          },
        };
      },
    });

    renderHost(fixture);

    const status = await screen.findByLabelText('App verification');
    expect(status.getAttribute('data-verification-status')).toBe('verified');
    expect(within(status).getByText('Published by Example Benefits Publisher')).toBeDefined();
    expect(detailValue(status, 'Signed publisher ID')).toBe(PUBLISHER_ID);
    expect(detailValue(status, 'Signed app ID')).toBe(APP_ID);
    expect(detailValue(status, 'Publisher trust result')).toBe('authorized');
    expect(detailValue(status, 'Authenticated payload digest')).toBe('sha256:signed-payload');
    expect(detailValue(status, 'Signature method')).toBe(
      'urn:formspec:sig-method:ed25519-cose-sign1@1',
    );
    expect(detailValue(status, 'Signature adapter version')).toBe('1.0.0');
    expect(detailValue(status, 'Verification adapter')).toBe(
      'urn:formspec-web:test:verifier@1',
    );
    expect(detailValue(status, 'Checked by this site')).toBe(CHECKED_AT);
    expect(detailValue(status, 'Trusted signing key')).toBe('cHVibGlzaGVyLWtleS0yMDI2');
    expect(detailValue(status, 'Loaded by this site from')).toContain(SOURCE_SIDECAR_SENTINEL);
    expect(detailValue(status, 'Candidate identity')).toBe(fixture.snapshot.identity);
    expect(status.textContent).not.toContain(MISATTRIBUTED_SOURCE_SENTINEL);
  });

  it('keeps authenticated status across routes without reacquiring the bundle', async () => {
    const fixture = await createFixture();
    const rendered = renderHost(fixture, { location: '/' });

    expect(await screen.findByText(SIGNED_CONTENT)).toBeDefined();
    expect(screen.getByLabelText('App verification')).toBeDefined();

    rendered.rerender(hostElement(fixture, { location: '/receipt' }));

    expect(await screen.findByText(SECOND_ROUTE_CONTENT)).toBeDefined();
    expect(screen.getByLabelText('App verification')).toBeDefined();
    expect(fixture.acquireCalls).toBe(1);
    expect(fixture.verifyCalls).toBe(1);
    expect(fixture.commitRequests).toHaveLength(1);
  });

  it('withdraws the old admitted bundle synchronously when the requested candidate changes', async () => {
    const first = await createFixture();
    const secondPending = deferred<SurfaceBundleSnapshot>();
    const second = await createFixture({ acquireResult: secondPending.promise });
    const rendered = renderHost(first);

    expect(await screen.findByText(SIGNED_CONTENT)).toBeDefined();

    rendered.rerender(hostElement(second, {
      locator: 'https://host.example/apps/replacement.bundle',
    }));

    expect(screen.getByRole('heading', { name: 'Checking this app' })).toBeDefined();
    expect(screen.queryByText(SIGNED_CONTENT)).toBeNull();
    expect(screen.queryByLabelText('App verification')).toBeNull();
  });

  it('does not report or commit a replaced admission after pending verification resolves', async () => {
    const pendingVerification = deferred<SurfaceBundleVerificationResult>();
    const stale = await createFixture({
      verificationResult: pendingVerification.promise,
    });
    const replacementAcquisition = deferred<SurfaceBundleSnapshot>();
    const replacement = await createFixture({
      acquireResult: replacementAcquisition.promise,
    });
    const reports: AppGraphReportProducerResult[] = [];
    const states: SurfaceAdmissionState[] = [];
    const callbacks = {
      onValidationReport: (report: AppGraphReportProducerResult) => reports.push(report),
      onAdmissionState: (state: SurfaceAdmissionState) => states.push(state),
    };
    const rendered = renderHost(stale, callbacks);

    await waitFor(() => {
      expect(stale.verifyCalls).toBe(1);
    });

    rendered.rerender(hostElement(replacement, {
      ...callbacks,
      locator: 'https://host.example/apps/replacement.bundle',
    }));
    expect(screen.getByRole('heading', { name: 'Checking this app' })).toBeDefined();

    await act(async () => {
      pendingVerification.resolve(verifiedResult(stale.snapshot));
      await pendingVerification.promise;
      await Promise.resolve();
    });

    expect(reports).toHaveLength(0);
    expect(stale.commitRequests).toHaveLength(0);
    expect(states.some((state) => state.status === 'admitted')).toBe(false);
    expect(replacement.acquireCalls).toBe(1);
    expect(screen.getByRole('heading', { name: 'Checking this app' })).toBeDefined();
  });

  it('does not commit when report delivery synchronously replaces the candidate', async () => {
    const stale = await createFixture();
    const replacementAcquisition = deferred<SurfaceBundleSnapshot>();
    const replacement = await createFixture({
      acquireResult: replacementAcquisition.promise,
    });
    const reports: AppGraphReportProducerResult[] = [];
    const renderedRef: { current?: ReturnType<typeof render> } = {};

    const rendered = renderHost(stale, {
      onValidationReport: (report) => {
        reports.push(report);
        renderedRef.current?.rerender(hostElement(replacement, {
          locator: 'https://host.example/apps/replacement.bundle',
        }));
      },
    });
    renderedRef.current = rendered;

    await waitFor(() => {
      expect(reports).toHaveLength(1);
      expect(replacement.acquireCalls).toBe(1);
    });
    expect(stale.commitRequests).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Checking this app' })).toBeDefined();
  });

  it('reports the AppGraph result for host records but never renders its diagnostics', async () => {
    const fixture = await createFixture();
    const reports: AppGraphReportProducerResult[] = [];
    const states: SurfaceAdmissionState[] = [];

    renderHost(fixture, {
      validation: {
        schemaValidators: () => ({
          ok: false,
          issues: [{ message: RAW_FAILURE_SENTINEL }],
        }),
      },
      onValidationReport: (report) => reports.push(report),
      onAdmissionState: (state) => states.push(state),
    });

    expect(
      (await screen.findByRole('alert')).getAttribute('data-admission-status'),
    ).toBe('failure');
    expect(reports).toHaveLength(1);
    expect(reports[0]?.report.ok).toBe(false);
    expect(JSON.stringify(states)).not.toContain(RAW_FAILURE_SENTINEL);
    expect(document.body.textContent).not.toContain(RAW_FAILURE_SENTINEL);
    expect(fixture.commitRequests).toHaveLength(0);
  });

  it('fails closed with fixed UI when a host report callback throws', async () => {
    const fixture = await createFixture();

    renderHost(fixture, {
      onValidationReport: () => {
        throw new Error(RAW_FAILURE_SENTINEL);
      },
    });

    expect(
      (await screen.findByRole('alert')).getAttribute('data-admission-status'),
    ).toBe('adapter-error');
    expect(screen.getByRole('heading', {
      name: 'This app is temporarily unavailable',
    })).toBeDefined();
    expect(document.body.textContent).not.toContain(RAW_FAILURE_SENTINEL);
    expect(document.body.textContent).not.toContain(SIGNED_CONTENT);
    expect(fixture.commitRequests).toHaveLength(0);
  });
});

interface FixtureOptions {
  readonly acquireResult?: Promise<SurfaceBundleSnapshot>;
  readonly sourceError?: unknown;
  readonly verification?: SurfaceBundleVerificationResult;
  readonly verificationResult?: Promise<SurfaceBundleVerificationResult>;
  readonly verificationFactory?: (
    snapshot: SurfaceBundleSnapshot,
  ) => SurfaceBundleVerificationResult;
  readonly verificationError?: unknown;
  readonly commit?: SurfaceBundleReleaseCommitResult;
  readonly commitResult?: Promise<SurfaceBundleReleaseCommitResult>;
  readonly onAcquire?: () => void;
  readonly onVerify?: () => void;
  readonly onCommit?: () => void;
}

interface Fixture {
  readonly snapshot: SurfaceBundleSnapshot;
  readonly source: SurfaceBundleSource;
  readonly verifier: SurfaceBundleVerifier;
  readonly commitRequests: SurfaceBundleReleaseCommitRequest[];
  readonly acquireCalls: number;
  readonly verifyCalls: number;
}

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const snapshot = await createSurfaceBundleSnapshot(
    new TextEncoder().encode('signed-candidate-bytes'),
    {
      adapterId: 'urn:formspec-web:test:source@1',
      requestedLocator: 'https://host.example/apps/intake.bundle',
      resolvedLocator: `https://${SOURCE_SIDECAR_SENTINEL}/cache/intake.bundle`,
      acquiredAt: CHECKED_AT,
      responseStatus: 200,
    },
  );
  const verified = verifiedResult(snapshot);
  const commitRequests: SurfaceBundleReleaseCommitRequest[] = [];
  let acquireCalls = 0;
  let verifyCalls = 0;
  const source: SurfaceBundleSource = {
    async acquire() {
      acquireCalls += 1;
      options.onAcquire?.();
      if (options.sourceError) throw options.sourceError;
      return options.acquireResult ?? snapshot;
    },
  };
  const verifier: SurfaceBundleVerifier = {
    async verify() {
      verifyCalls += 1;
      options.onVerify?.();
      if (options.verificationError) throw options.verificationError;
      if (options.verificationResult) return options.verificationResult;
      return options.verificationFactory?.(snapshot) ?? options.verification ?? verified;
    },
    async commitRelease(request) {
      options.onCommit?.();
      commitRequests.push(request);
      if (options.commitResult) return options.commitResult;
      return options.commit ?? committed(snapshot);
    },
  };

  return {
    snapshot,
    source,
    verifier,
    commitRequests,
    get acquireCalls() {
      return acquireCalls;
    },
    get verifyCalls() {
      return verifyCalls;
    },
  };
}

function signedPayload(): SurfaceBundleSignedPayloadV1 {
  return {
    profile: 'formspec-surface-bundle-signing-v1',
    publisher: { id: PUBLISHER_ID },
    release: { id: '2026-07-28.1', sequence: 42 },
    manifest: {
      $formspecBundle: '2.4',
      id: APP_ID,
      version: '1.0.0',
      title: SIGNED_TITLE,
      definitions: [],
      surfaces: [{ url: SURFACE_URL, version: '1.0.0' }],
      entrySurface: SURFACE_URL,
    },
    documents: {
      [SURFACE_URL]: {
        $formspecSurface: '0.2',
        id: 'main',
        entry: 'start',
        routes: [
          {
            id: 'start',
            path: '/',
            title: 'Start',
            routeClass: 'intake',
            slots: [
              {
                id: 'welcome',
                slotType: 'static-content',
                binding: { kind: 'text', content: SIGNED_CONTENT },
              },
            ],
          },
          {
            id: 'receipt',
            path: '/receipt',
            title: 'Receipt',
            routeClass: 'proof',
            slots: [
              {
                id: 'receipt-copy',
                slotType: 'static-content',
                binding: { kind: 'text', content: SECOND_ROUTE_CONTENT },
              },
            ],
          },
        ],
      },
    },
  };
}

function verifiedResult(snapshot: SurfaceBundleSnapshot): SurfaceBundleVerifiedResult {
  return {
    status: 'verified',
    snapshotIdentity: snapshot.identity,
    payload: signedPayload(),
    provenance: {
      adapterId: 'urn:formspec-web:test:verifier@1',
      snapshotIdentity: snapshot.identity,
      source: snapshot.evidence,
      checkedAt: CHECKED_AT,
      signedPayloadDigest: 'sha256:signed-payload',
      integrityReceipt: {
        result: 'verified',
        method: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        methodRegistryVersion: semVer('1.1.0'),
        adapter: {
          id: uri('urn:formspec:test:webcrypto@1'),
          version: semVer('1.0.0'),
        },
        key: {
          ref: kidOrThumbprint('cHVibGlzaGVyLWtleS0yMDI2'),
        },
        verifiedAt: CHECKED_AT,
      },
      trust: {
        status: 'authorized',
        kid: 'cHVibGlzaGVyLWtleS0yMDI2',
        publisherId: PUBLISHER_ID,
        publisherDisplayName: 'Example Benefits Publisher',
        appId: APP_ID,
        methodUri: 'urn:formspec:sig-method:ed25519-cose-sign1@1',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        revoked: false,
      },
      release: {
        status: 'current',
        mode: 'monotonic',
        releaseId: '2026-07-28.1',
        sequence: 42,
        digest: 'sha256:signed-payload',
        previous: null,
      },
    },
    releasePrecondition: {} as SurfaceBundleReleasePrecondition,
  };
}

function failedVerification(
  code: 'signature-invalid',
): SurfaceBundleVerificationResult {
  return {
    status: 'failed',
    code,
    reason: RAW_FAILURE_SENTINEL,
    snapshotIdentity: 'sha256:test',
    provenance: provenanceStub(),
  };
}

function unverifiedVerification(
  code: 'integrity-unsupported' | 'verifier-unavailable',
): SurfaceBundleVerificationResult {
  return {
    status: 'unverified',
    code,
    reason: RAW_FAILURE_SENTINEL,
    snapshotIdentity: 'sha256:test',
    provenance: provenanceStub(),
  };
}

function provenanceStub() {
  return {
    adapterId: 'urn:formspec-web:test:verifier@1',
    snapshotIdentity: 'sha256:test',
    source: {
      adapterId: 'urn:formspec-web:test:source@1',
      requestedLocator: 'memory:test',
      resolvedLocator: `memory:${SOURCE_SIDECAR_SENTINEL}`,
      acquiredAt: CHECKED_AT,
      byteCount: 1,
    },
  };
}

function committed(
  snapshot: SurfaceBundleSnapshot,
): SurfaceBundleReleaseCommitResult {
  return {
    status: 'committed',
    releaseCommit: 'committed',
    snapshotIdentity: snapshot.identity,
  };
}

interface RenderOptions {
  readonly locator?: string;
  readonly location?: string;
  readonly validation?: SurfaceBundleValidationConfig;
  readonly onValidationReport?: (result: AppGraphReportProducerResult) => void;
  readonly onAdmissionState?: (state: SurfaceAdmissionState) => void;
}

function hostElement(fixture: Fixture, options: RenderOptions = {}) {
  return (
    <VerifyingSurfaceHost
      composition={{
        surfaceBundleSource: fixture.source,
        surfaceBundleVerifier: fixture.verifier,
      }}
      request={{
        locator: options.locator ?? 'https://host.example/apps/intake.bundle',
      }}
      validation={options.validation ?? validation}
      location={options.location ?? '/'}
      onNavigate={vi.fn()}
      onValidationReport={options.onValidationReport}
      onAdmissionState={options.onAdmissionState}
    />
  );
}

function renderHost(fixture: Fixture, options: RenderOptions = {}) {
  return render(hostElement(fixture, options));
}

function detailValue(status: HTMLElement, label: string): string | null {
  const term = within(status).getByText(label);
  return term.nextElementSibling?.textContent ?? null;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
