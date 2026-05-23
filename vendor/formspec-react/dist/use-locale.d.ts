export interface UseLocaleResult {
    activeLocale: string;
    availableLocales: string[];
    direction: 'ltr' | 'rtl';
    setLocale: (code: string) => void;
    loadLocale: (doc: any) => void;
}
/**
 * Locale management hook — forwards to engine locale APIs.
 * Provides active locale, available locales, text direction, and locale switching.
 *
 * Subscribes to `engine.localeSignal` so React re-renders on any locale
 * state change (active locale switch, locale doc load).
 */
export declare function useLocale(): UseLocaleResult;
