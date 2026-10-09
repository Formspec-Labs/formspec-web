import type { ComponentDocument, LocaleDocument } from '@formspec-org/types';
import type { ScreenerSelection } from '../ports/screener-retention.ts';
import type { SurfaceScreenerCompletionPolicy } from '@formspec-org/surface-react';
import type { ComponentRouteResolver } from '@formspec-org/app-graph';
import { nativePackageSigningConfig, type NativePackageSigningConfig } from '../config/native-package-signing.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import type { createNativePackageSigningHost } from '../shared/native-package-signing-host.ts';
import { freezeComposition } from '../policy/index.ts';
import { createDemoComposition } from './demo.ts';
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
}

export interface NativePackageCompositionOptions {
  packageUrl: string; initialDefinitionUrl: string; signing: NativePackageSigningConfig;
  identityBinding?: IdentityBinding;
  /** Trusted host capability; authored documents cannot supply completion callbacks. */
  screenerCompletion?: SurfaceScreenerCompletionPolicy;
  nativeScreener?: NativeScreenerCompositionPins;
}

/** Deferred local hash-pinned package admission, separate from signed-release verification. */
export function createNativePackageComposition(config: FormspecWebConfig, options: NativePackageCompositionOptions): Composition {
  config = structuredClone(config);
  options = { ...options, signing: nativePackageSigningConfig(options.signing),
    nativeScreener: options.nativeScreener ? structuredClone(options.nativeScreener) : undefined,
    screenerCompletion: options.screenerCompletion === undefined ? undefined : Object.freeze({ ...options.screenerCompletion }) };
  if (options.nativeScreener && options.screenerCompletion) throw new Error('Native Screener completion policies are ambiguous');
  if (options.nativeScreener && (!options.identityBinding?.browserAuthSession || !config.identity.oidc)) throw new Error('Native Screener requires the selected authenticated session');
  const adapter = config.referenceAdapters?.formspecStack;
  if (!adapter?.formspecServerUrl) throw new Error('Native package signing requires the configured package service');
  if ((config.identity.mode === 'oidc-required' || config.ports.identityProvider === 'oidc')
    && (!options.identityBinding?.accessToken || !options.identityBinding.browserAuthSession)) {
    throw new Error('Native package signing requires the selected OIDC session and bearer provider');
  }
  const preview = createDemoComposition();
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
