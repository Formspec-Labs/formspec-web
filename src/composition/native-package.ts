import type { ComponentDocument, LocaleDocument } from '@formspec-org/types';
import { nativePackageSigningConfig, type NativePackageSigningConfig } from '../config/native-package-signing.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import type { createNativePackageSigningHost } from '../shared/native-package-signing-host.ts';
import { freezeComposition } from '../policy/index.ts';
import { createDemoComposition } from './demo.ts';
import type { Composition } from './types.ts';

export interface NativePackageBoot {
  composition: Composition;
  host: ReturnType<typeof createNativePackageSigningHost>;
  componentDocument: ComponentDocument;
  localeDocuments: readonly LocaleDocument[];
  moduleId: string;
  initialLocale: string;
}

export interface NativePackageCompositionOptions {
  packageUrl: string; initialDefinitionUrl: string; signing: NativePackageSigningConfig;
}

/** Deferred local hash-pinned package admission, separate from signed-release verification. */
export function createNativePackageComposition(config: FormspecWebConfig, options: NativePackageCompositionOptions): Composition {
  config = structuredClone(config);
  options = { ...options, signing: nativePackageSigningConfig(options.signing) };
  const adapter = config.referenceAdapters?.formspecStack;
  if (!adapter?.formspecServerUrl || config.identity.mode === 'oidc-required') throw new Error('Native package signing requires the configured anonymous package service');
  const preview = createDemoComposition();
  const unavailable = async (): Promise<never> => { throw new Error('Native package admission has not completed'); };
  let pending: Promise<NativePackageBoot> | undefined;
  const deferred: Composition = freezeComposition({
    ...preview, localPackagePreview: true, initialDefinitionUrl: options.initialDefinitionUrl,
    definitionSource: { getDefinition: unavailable }, attachmentStore: unavailableAttachmentStore(), offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    instanceCapabilities: { ...preview.instanceCapabilities, fileUpload: 'unavailable', offlineSubmit: 'unavailable' },
    identityProvider: { async discover() { return []; }, authenticate: unavailable, async revoke() {}, subscribe(listener) { listener(null); return () => {}; } },
    draftStore: { load: unavailable, save: unavailable, list: unavailable, delete: unavailable, invalidateSubject: unavailable },
    submitTransport: { submit: unavailable },
    nativePackageRespondent: { load: () => pending ??= import('./native-package-loader.ts')
      .then(({ loadNativePackage }) => loadNativePackage(config, options, deferred)) },
  });
  return deferred;
}
