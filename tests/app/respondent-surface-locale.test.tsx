import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SURFACE_LOCALE_KEY_PREFIX,
  SURFACE_STRING_KEYS,
} from '@formspec-org/surface';
import type {
  SurfaceBundleSignedPayloadV1,
} from '@formspec-org/surface-bundle-signing';
import {
  useRespondentSurfaceLocale,
} from '../../src/verifying-surface/respondent/locale.ts';

const APP = 'https://example.gov/apps/respondent-locale';
const EN = 'https://example.gov/locales/respondent-locale/en';
const ES = 'https://example.gov/locales/respondent-locale/es';

describe('verified respondent app Locale 2.0', () => {
  it('switches target-bounded shell strings, follows same-target fallback, and evaluates FEL interpolation', async () => {
    const bundle = payload();
    const preferred = ['es-MX'];
    const { result } = renderHook(() => useRespondentSurfaceLocale(
      bundle,
      preferred,
    ));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.activeLocale).toBe('es');
    expect(result.current.strings?.('navigationLabel')).toBe('Paginas de esta solicitud');
    expect(result.current.strings?.('notFoundTitle')).toBe('English notFoundTitle');
    expect(result.current.strings?.(
      'transitionContinue',
      { target: 'Recibo' },
    )).toBe('Continuar a Recibo');

    act(() => {
      result.current.selectLocale('en');
    });

    await waitFor(() => {
      expect(result.current.activeLocale).toBe('en');
    });
    expect(result.current.strings?.('navigationLabel')).toBe('English navigationLabel');
    expect(result.current.strings?.(
      'transitionContinue',
      { target: 'Receipt' },
    )).toBe('Continue to Receipt');
  });
});

function payload(): SurfaceBundleSignedPayloadV1 {
  const english = Object.fromEntries(SURFACE_STRING_KEYS.map((key) => [
    `${SURFACE_LOCALE_KEY_PREFIX}${key}`,
    key === 'transitionContinue'
      ? 'Continue to {{$target}}'
      : `English ${key}`,
  ]));
  return {
    profile: 'formspec-surface-bundle-signing-v1',
    publisher: { id: 'https://publisher.example/' },
    release: { id: 'locale-test', sequence: 1 },
    manifest: {
      $formspecBundle: '2.4',
      id: APP,
      version: '1.0.0',
      definitions: [],
      locales: [
        { url: EN, version: '1.0.0', locale: 'en' },
        { url: ES, version: '1.0.0', locale: 'es' },
      ],
    },
    documents: {
      [EN]: {
        $formspecLocale: '2.0',
        url: EN,
        version: '1.0.0',
        locale: 'en',
        target: { kind: 'app', url: APP },
        strings: english,
      },
      [ES]: {
        $formspecLocale: '2.0',
        url: ES,
        version: '1.0.0',
        locale: 'es',
        fallback: 'en',
        target: { kind: 'app', url: APP },
        strings: {
          [`${SURFACE_LOCALE_KEY_PREFIX}navigationLabel`]: 'Paginas de esta solicitud',
          [`${SURFACE_LOCALE_KEY_PREFIX}transitionContinue`]: 'Continuar a {{$target}}',
        },
      },
    },
  };
}
