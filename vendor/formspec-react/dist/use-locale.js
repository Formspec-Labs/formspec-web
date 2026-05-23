'use client';
/** @filedesc useLocale — locale management forwarding to FormEngine. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';
/**
 * Locale management hook — forwards to engine locale APIs.
 * Provides active locale, available locales, text direction, and locale switching.
 *
 * Subscribes to `engine.localeSignal` so React re-renders on any locale
 * state change (active locale switch, locale doc load).
 */
export function useLocale() {
    const { engine } = useFormspecContext();
    // Subscribe to the locale tick signal — bumps on setLocale/loadLocale.
    // The value itself is unused; the subscription drives re-render.
    useSignal(engine.localeSignal);
    const setLocale = useCallback((code) => {
        engine.setLocale(code);
    }, [engine]);
    const loadLocale = useCallback((doc) => {
        engine.loadLocale(doc);
    }, [engine]);
    return {
        activeLocale: engine.getActiveLocale(),
        availableLocales: engine.getAvailableLocales(),
        direction: engine.getLocaleDirection(),
        setLocale,
        loadLocale,
    };
}
