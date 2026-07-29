import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  matchRoutePath,
  type ResolvedBundle,
} from '@formspec-org/surface';
import {
  useBrowserLocation,
  type SurfaceDefinitionFormRenderInput,
} from '@formspec-org/surface-react';
import type { FormspecWebConfig, RespondentSurfaceBundleConfig } from '../../config/types.ts';
import type { Composition } from '../../composition/types.ts';
import type { SubmitConfirmation } from '../../ports/submit-transport.ts';
import {
  createSurfaceBundleSchemaValidators,
} from '../../adapters/schema/index.ts';
import {
  RespondentDefinitionController,
} from '../../app/RespondentRuntime.tsx';
import {
  VerifyingSurfaceHost,
  type AdmittedSurfaceRenderInput,
} from '../VerifyingSurfaceHost.tsx';
import type { SurfaceBundleValidationConfig } from '../admission.ts';
import { SurfaceVerificationStatus } from '../SurfaceVerificationStatus.tsx';
import { createRespondentDataSourceRuntime, proofRouteAddresses } from './data-sources.ts';
import { localeDocumentsForTarget, useRespondentSurfaceLocale } from './locale.ts';
import {
  withRespondentPublicAppValidation,
} from './public-app-validation.ts';
import {
  createBrowserRespondentReceiptSessionStore,
  receiptRecordFromConfirmation,
  type RespondentReceiptSessionStore,
} from './session-store.ts';
import { respondentWidgetModule } from './widget-module.ts';

export interface VerifiedRespondentSurfaceProps {
  readonly composition: Composition;
  readonly config: FormspecWebConfig;
  readonly bundleConfig: RespondentSurfaceBundleConfig;
  readonly sessionStore?: RespondentReceiptSessionStore;
  readonly preferredLocales?: readonly string[];
  readonly now?: () => Date;
}

export function VerifiedRespondentSurface({
  composition,
  config,
  bundleConfig,
  sessionStore: suppliedSessionStore,
  preferredLocales,
  now = () => new Date(),
}: VerifiedRespondentSurfaceProps) {
  const [location, navigate] = useBrowserLocation(window.location.pathname);
  const sessionStore = useMemo(
    () => suppliedSessionStore ?? createBrowserRespondentReceiptSessionStore(),
    [suppliedSessionStore],
  );
  const validation = useMemo<SurfaceBundleValidationConfig>(
    () => withRespondentPublicAppValidation(
      { schemaValidators: createSurfaceBundleSchemaValidators() },
      {
        appId: bundleConfig.verification.expectedAppId,
        starterModuleId: bundleConfig.starterModuleId,
        receiptResourceUrl: bundleConfig.receiptResourceUrl,
      },
    ),
    [bundleConfig],
  );
  const widgetModules = useMemo(
    () => [respondentWidgetModule(bundleConfig.starterModuleId)],
    [bundleConfig.starterModuleId],
  );

  return (
    <VerifyingSurfaceHost
      composition={composition}
      location={location}
      onNavigate={navigate}
      request={{ locator: bundleConfig.locator }}
      validation={validation}
      widgetModules={widgetModules}
      renderAdmitted={(input) => (
        <AdmittedRespondentSurface
          {...input}
          key={input.admission.snapshot.identity}
          composition={composition}
          config={config}
          location={location}
          navigate={navigate}
          now={now}
          preferredLocales={preferredLocales}
          receiptResourceUrl={bundleConfig.receiptResourceUrl}
          sessionStore={sessionStore}
        />
      )}
    />
  );
}

interface AdmittedRespondentSurfaceProps extends AdmittedSurfaceRenderInput {
  readonly composition: Composition;
  readonly config: FormspecWebConfig;
  readonly location: string;
  readonly navigate: (href: string) => void;
  readonly receiptResourceUrl: string;
  readonly sessionStore: RespondentReceiptSessionStore;
  readonly preferredLocales?: readonly string[];
  readonly now: () => Date;
}

function AdmittedRespondentSurface({
  admission,
  composition,
  config,
  location,
  navigate,
  now,
  preferredLocales,
  receiptResourceUrl,
  renderSurface,
  sessionStore,
}: AdmittedRespondentSurfaceProps) {
  const payload = admission.verification.payload;
  const appId = payload.manifest.id;
  const releaseIdentity = admission.snapshot.identity;
  const locale = useRespondentSurfaceLocale(payload, preferredLocales);
  const deepLinkCaseRef = useMemo(
    () => receiptCaseRefForLocation(admission.bundle, location),
    [admission.bundle, location],
  );
  const [confirmedCaseRef, setConfirmedCaseRef] = useState<string | undefined>(
    deepLinkCaseRef,
  );
  const routeCaseRef = deepLinkCaseRef ?? confirmedCaseRef;
  const proofRoutes = useMemo(
    () => proofRouteAddresses(admission.bundle),
    [admission.bundle],
  );
  const dataRuntime = useMemo(
    () => createRespondentDataSourceRuntime({
      appId,
      releaseIdentity,
      receiptResourceUrl,
      proofRoutes,
      sessionStore,
    }),
    [
      appId,
      proofRoutes,
      receiptResourceUrl,
      releaseIdentity,
      sessionStore,
    ],
  );
  const definitionLocales = useMemo(() => {
    const byDefinition = new Map<string, ReturnType<typeof localeDocumentsForTarget>>();
    return (definitionUrl: string) => {
      const cached = byDefinition.get(definitionUrl);
      if (cached) return cached;
      const resolved = localeDocumentsForTarget(payload, {
        kind: 'definition',
        url: definitionUrl,
      });
      byDefinition.set(definitionUrl, resolved);
      return resolved;
    };
  }, [payload]);
  const stableThemeDocuments = useRef(new Map<string, SurfaceDefinitionFormRenderInput['grant']['themeDocument']>());
  const stableRegistryEntries = useRef(
    new Map<string, SurfaceDefinitionFormRenderInput['plan']['registryEntries']>(),
  );

  const onSubmitConfirmed = useCallback((confirmation: SubmitConfirmation) => {
    // Persistence failure must not rewrite an already accepted submission as
    // failed. The receipt loader will expose the unavailable state explicitly.
    sessionStore.write(receiptRecordFromConfirmation(
      appId,
      releaseIdentity,
      confirmation,
      now().toISOString(),
    ));
    setConfirmedCaseRef(confirmation.referenceNumber);
  }, [appId, now, releaseIdentity, sessionStore]);

  const renderDefinitionForm = useCallback(
    (input: SurfaceDefinitionFormRenderInput): ReactNode => {
      const themeKey = JSON.stringify(input.grant.themeDocument);
      const themeDocument = stableThemeDocuments.current.get(themeKey)
        ?? input.grant.themeDocument;
      stableThemeDocuments.current.set(themeKey, themeDocument);
      const registryKey = JSON.stringify(input.plan.registryEntries);
      const registryEntries = stableRegistryEntries.current.get(registryKey)
        ?? input.plan.registryEntries;
      stableRegistryEntries.current.set(registryKey, registryEntries);
      return (
        <RespondentDefinitionController
          composition={composition}
          config={config}
          form={{
            definition: input.plan.definition,
            themeDocument,
            registryEntries,
            responseActionsDocument: input.responseActionsDocument,
            localeDocuments: definitionLocales(input.plan.definition.url),
            activeLocale: locale.activeLocale,
            ...(input.onActionCompleted
              ? { onActionCompleted: input.onActionCompleted }
              : {}),
          }}
          onSubmitConfirmed={onSubmitConfirmed}
        />
      );
    },
    [composition, config, definitionLocales, locale.activeLocale, onSubmitConfirmed],
  );

  if (locale.status !== 'ready' || !locale.strings) {
    return (
      <main className="fs-surface-admission" role={locale.status === 'unavailable' ? 'alert' : 'status'}>
        <SurfaceVerificationStatus
          verification={admission.verification}
          snapshot={admission.snapshot}
        />
        <h1>
          {locale.status === 'unavailable'
            ? 'This app has no usable language'
            : 'Preparing this app'}
        </h1>
        <p>
          {locale.status === 'unavailable'
            ? 'The verified release did not provide the app language needed to show its controls.'
            : 'The verified app is preparing its language controls.'}
        </p>
      </main>
    );
  }

  return (
    <>
      <SurfaceLocaleSwitcher
        activeLocale={locale.activeLocale}
        availableLocales={locale.availableLocales}
        onSelect={locale.selectLocale}
      />
      {renderSurface({
        location,
        onNavigate: navigate,
        routeParams: routeCaseRef ? { caseRef: routeCaseRef } : undefined,
        strings: locale.strings,
        dataSourceLoader: dataRuntime.dataSourceLoader,
        authorizeDataSource: dataRuntime.authorizeDataSource,
        validateDataSourcePayload: dataRuntime.validateDataSourcePayload,
        renderDefinitionForm,
        sessionGeneration: releaseIdentity,
        headingBaseLevel: 2,
        showExperienceNeeds: false,
        showThemeNotice: false,
      })}
    </>
  );
}

function SurfaceLocaleSwitcher({
  activeLocale,
  availableLocales,
  onSelect,
}: {
  activeLocale: string;
  availableLocales: readonly string[];
  onSelect: (locale: string) => void;
}) {
  if (availableLocales.length < 2) return null;
  return (
    <div className="fs-surface-locale-switcher" role="group" aria-label="Language">
      {availableLocales.map((locale) => (
        <button
          aria-pressed={activeLocale === locale}
          key={locale}
          type="button"
          onClick={() => onSelect(locale)}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}

function receiptCaseRefForLocation(
  bundle: ResolvedBundle,
  location: string,
): string | undefined {
  for (const surface of bundle.surfaces) {
    for (const route of surface.routes) {
      if (route.routeClass !== 'proof') continue;
      const params = matchRoutePath(route.path, location);
      const caseRef = params?.caseRef;
      if (caseRef) return caseRef;
    }
  }
  return undefined;
}
