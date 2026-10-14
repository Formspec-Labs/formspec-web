import { ownedDraftResumeSelection } from '../config/owned-draft-resume.ts';
import type { OwnedDraftResumeSelection } from '../ports/draft-store.ts';
import type { NativeHostEventCapability } from '../shared/native-host-events.ts';
import type { NativeScreenerHydrationFactory } from '../adapters/http/initial-mixed-screener-hydration.ts';
import type { ComponentDocument, LocaleDocument } from '@formspec-org/types';
import { validatedAttachmentMaxUploadBytes } from '../config/attachment-policy.ts';
import type { HttpClientConfig } from '../adapters/http/http-client.ts';
import type { HttpTaskCandidateHydrationConfig } from '../adapters/http/task-candidate-hydration.ts';
import type { TaskDraftLaunchSelection } from '../ports/task-draft.ts';
import type { TaskCompletionSelection } from '../ports/task-completion.ts';
import type { ScreenerSelection } from '../ports/screener-retention.ts';
import type { SurfaceScreenerCompletionPolicy } from '@formspec-org/surface-react';
import type { ComponentRouteResolver } from '@formspec-org/app-graph';
import { nativePackageSigningConfig, type NativePackageSigningConfig } from '../config/native-package-signing.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import type { NativeInitialDataSourceFactory, createNativePackageSigningHost } from '../shared/native-package-signing-host.ts';
import { freezeComposition } from '../policy/index.ts';
import { createUnavailableComposition } from './unavailable.ts';
import type { Composition } from './types.ts';
import type { IdentityBinding } from './default.ts';

export interface NativePackageBoot {
  composition: Composition;
  host: ReturnType<typeof createNativePackageSigningHost>;
  componentDocument: ComponentDocument;
  componentRouteResolver: ComponentRouteResolver;
  localeDocuments: readonly LocaleDocument[];
  moduleId: string;
  initialLocale: string;
  screenerCompletion?: SurfaceScreenerCompletionPolicy;
  resumeSubmitted?: () => Promise<'absent' | 'active' | 'submitted'>;
}

export interface NativeScreenerCompositionPins {
  readonly selection: ScreenerSelection;
  readonly selectionHash: string;
  readonly selectionKey: string;
  /** Explicit host-selected targets that require current accepted screening. */
  readonly entryGate?: { readonly protectedTargets: readonly string[] };
  /** Independently selected Source composition policy; never part of a retained Screener selection. */
  readonly compositionRegistrationHash?: string;
  /** Trusted host capability; selected before package admission, never supplied by authored JSON. */
  readonly hydrationFactory?: NativeScreenerHydrationFactory;
}

/** Trusted deployment selects correction authority; authored package data cannot select it. */
export interface NativeTaskCompositionPins {
  readonly launch: TaskDraftLaunchSelection;
  readonly completion: TaskCompletionSelection;
  readonly launchOperationId: string;
  readonly subjectRef: string;
  readonly wos: HttpClientConfig;
  readonly completionTimeoutMs?: number;
  readonly assertCurrentWos: () => void;
  readonly hydration: Pick<HttpTaskCandidateHydrationConfig, 'selection' | 'identity' | 'receiptVerifier' | 'elapsedNow'>;
  readonly attachmentFieldPaths: Readonly<Record<string, string>>;
}

export interface NativePackageCompositionOptions {
  packageUrl: string; initialDefinitionUrl: string; signing: NativePackageSigningConfig;
  identityBinding?: IdentityBinding;
  /** Read-only external locator for an existing authenticated ordinary draft. */
  ownedDraftResume?: OwnedDraftResumeSelection;
  /** Trusted host capability; authored documents cannot supply completion callbacks. */
  screenerCompletion?: SurfaceScreenerCompletionPolicy;
  nativeScreener?: NativeScreenerCompositionPins;
  nativeTask?: NativeTaskCompositionPins;
  initialDataSources?: NativeInitialDataSourceFactory;
  hostEvents?: readonly NativeHostEventCapability[];
}

/** Deferred local hash-pinned package admission, separate from signed-release verification. */
export function createNativePackageComposition(config: FormspecWebConfig, options: NativePackageCompositionOptions): Composition {
  if (typeof options.initialDefinitionUrl !== 'string' || !options.initialDefinitionUrl.trim()) throw new Error('Native package composition requires an explicit initialDefinitionUrl');
  config = structuredClone(config);
  options = { ...options, hostEvents: options.hostEvents?.map(value => Object.freeze({ ...value })), signing: nativePackageSigningConfig(options.signing),
    nativeScreener: options.nativeScreener ? snapshotNativeScreener(options.nativeScreener) : undefined,
    screenerCompletion: options.screenerCompletion === undefined ? undefined : Object.freeze({ ...options.screenerCompletion }) };
  if (options.nativeTask) {
    const task = options.nativeTask;
    options.nativeTask = { ...task, launch: structuredClone(task.launch), completion: structuredClone(task.completion),
      wos: { ...task.wos, tenantBinding: task.wos.tenantBinding ? structuredClone(task.wos.tenantBinding) : undefined },
      attachmentFieldPaths: Object.freeze({ ...task.attachmentFieldPaths }), hydration: { ...task.hydration,
        selection: structuredClone(task.hydration.selection), identity: structuredClone(task.hydration.identity),
        receiptVerifier: task.hydration.receiptVerifier ? Object.freeze({ verify: task.hydration.receiptVerifier.verify.bind(task.hydration.receiptVerifier) }) : undefined } };
    if (options.nativeScreener || options.screenerCompletion || options.signing.applicationLifecycle)
      throw new Error('Native task correction cannot select initial application capabilities');
    if (validatedAttachmentMaxUploadBytes(config.referenceAdapters?.formspecStack?.attachments?.maxUploadBytes) === undefined
      || Object.entries(task.attachmentFieldPaths).some(([field, path]) => !field.trim()
        || path !== '/' + field.replace(/\[(\d+)\]/g, '.$1').split('.').map(part => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')))
      throw new Error('Native task attachments require actual authored paths and a finite limit');
    if (!options.identityBinding?.accessToken || !options.identityBinding.browserAuthSession || !config.identity.oidc)
      throw new Error('Native task correction requires the selected authenticated session');
  }
  if (options.nativeScreener && options.screenerCompletion) throw new Error('Native Screener completion policies are ambiguous');
  if (options.nativeScreener && (!options.identityBinding?.browserAuthSession || !config.identity.oidc)) throw new Error('Native Screener requires the selected authenticated session');
  if (options.ownedDraftResume !== undefined) {
    if (options.nativeTask || config.identity.mode !== 'oidc-required' || !options.identityBinding?.accessToken
      || !options.identityBinding.browserAuthSession) throw new Error('Owned draft resume requires the ordinary authenticated native entry');
    options.ownedDraftResume = ownedDraftResumeSelection(options.ownedDraftResume);
  }
  const adapter = config.referenceAdapters?.formspecStack;
  if (!adapter?.formspecServerUrl) throw new Error('Native package signing requires the configured package service');
  if ((config.identity.mode === 'oidc-required' || config.ports.identityProvider === 'oidc')
    && (!options.identityBinding?.accessToken || !options.identityBinding.browserAuthSession)) {
    throw new Error('Native package signing requires the selected OIDC session and bearer provider');
  }
  const preview = createUnavailableComposition(options.initialDefinitionUrl);
  const unavailable = async (): Promise<never> => { throw new Error('Native package admission has not completed'); };
  let pending: Promise<NativePackageBoot> | undefined;
  const deferred: Composition = freezeComposition({
    ...preview, localPackagePreview: true, initialDefinitionUrl: options.initialDefinitionUrl,
    definitionSource: { getDefinition: unavailable }, attachmentStore: unavailableAttachmentStore(), offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    instanceCapabilities: { ...preview.instanceCapabilities, fileUpload: 'unavailable', offlineSubmit: 'unavailable' },
    browserAuthSession: options.identityBinding?.browserAuthSession,
    identityProvider: options.identityBinding?.provider ?? { async discover() { return []; }, authenticate: unavailable, async revoke() {}, subscribe(listener) { listener(null); return () => {}; } },
    draftStore: { load: unavailable, save: unavailable, list: unavailable, delete: unavailable, invalidateSubject: unavailable },
    submitTransport: { submit: unavailable },
    nativePackageRespondent: { load: () => pending ??= import('./native-package-loader.ts')
      .then(({ loadNativePackage }) => loadNativePackage(config, options, deferred)) },
  });
  return deferred;
}

function snapshotNativeScreener(pins: NativeScreenerCompositionPins): NativeScreenerCompositionPins {
  const { hydrationFactory, ...selected } = pins;
  return Object.freeze({ ...structuredClone(selected), hydrationFactory });
}
