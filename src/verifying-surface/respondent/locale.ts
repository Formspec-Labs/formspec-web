import { useEffect, useMemo, useState } from 'react';
import {
  evalFEL,
  interpolateMessage,
  LocaleStore,
  preactReactiveRuntime,
} from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import {
  resolveSurfaceLocaleStrings,
  type SurfaceStrings,
} from '@formspec-org/surface';
import type { LocaleDocument } from '@formspec-org/types';
import type { SurfaceBundleSignedPayloadV1 } from '@formspec-org/surface-bundle-signing';

const localeEngineReady = initFormspecEngine();

export interface RespondentSurfaceLocaleState {
  readonly status: 'preparing' | 'ready' | 'unavailable';
  readonly activeLocale: string;
  readonly availableLocales: readonly string[];
  readonly strings?: SurfaceStrings;
  readonly selectLocale: (locale: string) => void;
}

export function useRespondentSurfaceLocale(
  payload: SurfaceBundleSignedPayloadV1,
  preferredLocales: readonly string[] = browserPreferredLocales(),
): RespondentSurfaceLocaleState {
  const appId = payload.manifest.id;
  const documents = useMemo(
    () => localeDocumentsForTarget(payload, { kind: 'app', url: appId }),
    [appId, payload],
  );
  const localeStore = useMemo(() => {
    const store = new LocaleStore(
      preactReactiveRuntime,
      'auto',
      { kind: 'app', url: appId },
    );
    for (const document of documents) store.loadLocale(document);
    return store;
  }, [appId, documents]);
  const availableLocales = useMemo(
    () => localeStore.getAvailableLocales({ kind: 'app', url: appId }),
    [appId, localeStore],
  );
  const selectedDefault = useMemo(
    () => selectPreferredLocale(availableLocales, preferredLocales),
    [availableLocales, preferredLocales],
  );
  const [activeLocale, setActiveLocale] = useState(selectedDefault);
  const [engineStatus, setEngineStatus] = useState<'preparing' | 'ready' | 'unavailable'>(
    'preparing',
  );

  useEffect(() => {
    setActiveLocale(selectedDefault);
    if (selectedDefault) localeStore.setLocale(selectedDefault);
  }, [localeStore, selectedDefault]);

  useEffect(() => {
    let active = true;
    setEngineStatus('preparing');
    void localeEngineReady.then(
      () => {
        if (active) setEngineStatus('ready');
      },
      () => {
        if (active) setEngineStatus('unavailable');
      },
    );
    return () => {
      active = false;
    };
  }, [localeStore]);

  const strings = useMemo(
    () => engineStatus === 'ready'
      ? resolveSurfaceLocaleStrings({
          lookup: (key) => localeStore.lookupKey(key),
          interpolate: (template, vars) => interpolateMessage(
            template,
            (expression) => evalFEL(expression, { ...vars }),
          ).text,
        })
      : undefined,
    [engineStatus, localeStore, activeLocale],
  );

  return {
    status: availableLocales.length === 0 ? 'unavailable' : engineStatus,
    activeLocale,
    availableLocales,
    strings,
    selectLocale(locale) {
      if (!availableLocales.includes(locale)) return;
      localeStore.setLocale(locale);
      setActiveLocale(locale);
    },
  };
}

export function localeDocumentsForTarget(
  payload: SurfaceBundleSignedPayloadV1,
  target: LocaleDocument['target'],
): LocaleDocument[] {
  const manifest = payload.manifest as Record<string, unknown>;
  const refs = Array.isArray(manifest.locales) ? manifest.locales : [];
  const documents = payload.documents as Readonly<Record<string, unknown>>;
  const result: LocaleDocument[] = [];
  for (const ref of refs) {
    if (!isRecord(ref) || typeof ref.url !== 'string') continue;
    if (!Object.prototype.hasOwnProperty.call(documents, ref.url)) continue;
    const document = documents[ref.url];
    if (!isLocaleDocument(document)) continue;
    if (document.target.kind !== target.kind || document.target.url !== target.url) continue;
    result.push(document);
  }
  return result;
}

function selectPreferredLocale(
  available: readonly string[],
  preferred: readonly string[],
): string {
  for (const requested of preferred) {
    const exact = available.find((candidate) => localeEqual(candidate, requested));
    if (exact) return exact;
    const base = requested.split('-')[0];
    const baseMatch = available.find((candidate) => localeEqual(candidate, base ?? requested));
    if (baseMatch) return baseMatch;
  }
  return available[0] ?? '';
}

function localeEqual(left: string, right: string): boolean {
  return LocaleStore.normalizeCode(left) === LocaleStore.normalizeCode(right);
}

function browserPreferredLocales(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

function isLocaleDocument(value: unknown): value is LocaleDocument {
  if (!isRecord(value) || value.$formspecLocale !== '2.0') return false;
  if (
    typeof value.version !== 'string'
    || typeof value.locale !== 'string'
    || !isRecord(value.target)
    || (value.target.kind !== 'app' && value.target.kind !== 'definition')
    || typeof value.target.url !== 'string'
    || !isRecord(value.strings)
  ) {
    return false;
  }
  return Object.values(value.strings).every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
