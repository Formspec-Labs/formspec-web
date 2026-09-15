import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  SurfaceApp,
  type SurfaceAppProps,
} from '@formspec-org/surface-react';
import '@formspec-org/surface-react/formspec-surface.css';
import type { AppGraphReportProducerResult } from '@formspec-org/app-graph';
import type { Composition } from '../composition/types.ts';
import type {
  SurfaceBundleAcquisitionRequest,
} from '../ports/surface-bundle-source.ts';
import {
  admitSurfaceBundle,
  type SurfaceAdmissionState,
  type SurfaceBundleValidationProvider,
} from './admission.ts';
import { SurfaceVerificationStatus } from './SurfaceVerificationStatus.tsx';
import './verifying-surface.css';

export interface VerifyingSurfaceHostProps
  extends Omit<SurfaceAppProps, 'bundle' | 'header'> {
  readonly composition: Pick<
    Composition,
    'surfaceBundleSource' | 'surfaceBundleVerifier'
  >;
  readonly request: SurfaceBundleAcquisitionRequest;
  readonly validation: SurfaceBundleValidationProvider;
  readonly onAdmissionState?: (state: SurfaceAdmissionState) => void;
  readonly onValidationReport?: (result: AppGraphReportProducerResult) => void;
  /**
   * Host-owned runtime state that can only be prepared from the authenticated
   * payload belongs behind this boundary. `renderSurface` always preserves the
   * admitted bundle and verification header.
   */
  readonly renderAdmitted?: (input: AdmittedSurfaceRenderInput) => ReactNode;
}

export function VerifyingSurfaceHost({
  composition,
  request,
  validation,
  onAdmissionState,
  onValidationReport,
  renderAdmitted,
  ...surfaceProps
}: VerifyingSurfaceHostProps) {
  const requestSignal = request.signal;
  const onAdmissionStateRef = useRef(onAdmissionState);
  const onValidationReportRef = useRef(onValidationReport);
  onAdmissionStateRef.current = onAdmissionState;
  onValidationReportRef.current = onValidationReport;

  const currentInput: AdmissionInputIdentity = {
    source: composition.surfaceBundleSource,
    verifier: composition.surfaceBundleVerifier,
    locator: request.locator,
    signal: requestSignal,
    validation,
  };
  const currentInputRef = useRef(currentInput);
  currentInputRef.current = currentInput;
  const [admission, setAdmission] = useState<AdmissionRecord>(() => ({
    input: currentInput,
    state: { status: 'checking' },
  }));
  const state = sameAdmissionInput(admission.input, currentInput)
    ? admission.state
    : ({ status: 'checking' } as const);

  useEffect(() => {
    let active = true;
    const lifecycle = new AbortController();
    const signal = combineAbortSignals(lifecycle.signal, requestSignal);
    const checking = Object.freeze({ status: 'checking' } as const);
    const input: AdmissionInputIdentity = {
      source: composition.surfaceBundleSource,
      verifier: composition.surfaceBundleVerifier,
      locator: request.locator,
      signal: requestSignal,
      validation,
    };
    const isCurrentAdmission = () => (
      active
      && !signal.aborted
      && sameAdmissionInput(input, currentInputRef.current)
    );
    setAdmission({ input, state: checking });
    onAdmissionStateRef.current?.(checking);

    void admitSurfaceBundle({
      source: composition.surfaceBundleSource,
      verifier: composition.surfaceBundleVerifier,
      request: {
        locator: request.locator,
        signal,
      },
      validation,
      isCurrentAdmission,
      onValidationReport: (result) => {
        if (!isCurrentAdmission()) return;
        onValidationReportRef.current?.(result);
      },
    })
      .catch((): SurfaceAdmissionState => Object.freeze({
        status: 'adapter-error',
        code: 'unexpected-adapter-error',
      }))
      .then((next) => {
        if (!active) return;
        setAdmission({ input, state: next });
        onAdmissionStateRef.current?.(next);
      });

    return () => {
      active = false;
      lifecycle.abort();
    };
  }, [
    composition.surfaceBundleSource,
    composition.surfaceBundleVerifier,
    request.locator,
    requestSignal,
    validation,
  ]);

  if (state.status !== 'admitted') {
    return <SurfaceAdmissionMessage state={state} />;
  }

  const verificationHeader = (
    <SurfaceVerificationStatus
      verification={state.verification}
      snapshot={state.snapshot}
    />
  );
  const renderSurface: AdmittedSurfaceRenderInput['renderSurface'] = (overrides = {}) => (
    <SurfaceApp
      {...surfaceProps}
      {...overrides}
      bundle={state.bundle}
      header={verificationHeader}
    />
  );

  return renderAdmitted
    ? renderAdmitted({ admission: state, renderSurface })
    : renderSurface();
}

export interface AdmittedSurfaceRenderInput {
  readonly admission: Extract<SurfaceAdmissionState, { readonly status: 'admitted' }>;
  readonly renderSurface: (
    overrides?: Partial<Omit<SurfaceAppProps, 'bundle' | 'header'>>,
  ) => ReactNode;
}

interface AdmissionInputIdentity {
  readonly source: Composition['surfaceBundleSource'];
  readonly verifier: Composition['surfaceBundleVerifier'];
  readonly locator: string;
  readonly signal: AbortSignal | undefined;
  readonly validation: SurfaceBundleValidationProvider;
}

interface AdmissionRecord {
  readonly input: AdmissionInputIdentity;
  readonly state: SurfaceAdmissionState;
}

function sameAdmissionInput(
  left: AdmissionInputIdentity,
  right: AdmissionInputIdentity,
): boolean {
  return (
    left.source === right.source
    && left.verifier === right.verifier
    && left.locator === right.locator
    && left.signal === right.signal
    && left.validation === right.validation
  );
}

interface SurfaceAdmissionMessageProps {
  readonly state: Exclude<SurfaceAdmissionState, { readonly status: 'admitted' }>;
}

function SurfaceAdmissionMessage({ state }: SurfaceAdmissionMessageProps) {
  const copy = admissionCopy(state.status);
  return (
    <main
      className="fs-surface-admission"
      aria-live={state.status === 'checking' ? 'polite' : 'assertive'}
      {...(state.status === 'checking' ? { role: 'status' } : { role: 'alert' })}
      data-admission-status={state.status}
    >
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
    </main>
  );
}

function admissionCopy(
  status: Exclude<SurfaceAdmissionState['status'], 'admitted'>,
): { readonly title: string; readonly body: string } {
  switch (status) {
    case 'checking':
      return {
        title: 'Checking this app',
        body: 'This site is checking the app before showing any of its content.',
      };
    case 'failure':
      return {
        title: 'This app could not be verified',
        body: 'This site did not open the app because its signed release did not pass every check.',
      };
    case 'unsupported':
      return {
        title: 'This signed app is not supported here',
        body: 'This site cannot check the signing method used by this app.',
      };
    case 'adapter-error':
      return {
        title: 'This app is temporarily unavailable',
        body: 'This site could not complete the checks needed to open the app. Try again later.',
      };
  }
}

function combineAbortSignals(
  lifecycle: AbortSignal,
  external: AbortSignal | undefined,
): AbortSignal {
  if (!external) return lifecycle;
  if (external.aborted) return external;
  const controller = new AbortController();
  const abort = () => controller.abort();
  lifecycle.addEventListener('abort', abort, { once: true });
  external.addEventListener('abort', abort, { once: true });
  return controller.signal;
}
