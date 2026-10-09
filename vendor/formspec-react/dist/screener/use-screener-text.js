'use client';
/** @filedesc Screener-owned Locale lookup, separate from any surrounding Definition. */
import { useMemo } from 'react';
import { createScreenerLocaleResolver, screenerOptionLocaleKey } from '@formspec-org/engine/render';
import { useChromeText, chromeStringKeys, chromeTextFromLookup } from '../use-chrome-text';
export function useScreenerText(options, answers, requiredKeys = []) {
    const legacyChrome = useChromeText();
    const admission = useMemo(() => options.screenerDocument
        ? createScreenerLocaleResolver({ document: options.screenerDocument, localeDocuments: options.localeDocuments,
            activeLocale: options.activeLocale, chromeKeys: chromeStringKeys })
        : null, [options.screenerDocument, options.localeDocuments, options.activeLocale]);
    const resolver = admission?.status === 'ready' ? admission.resolver : undefined;
    const ownsLocale = !!options.onDetermination || options.localeDocuments !== undefined || options.activeLocale !== undefined;
    const translationWarnings = useMemo(() => {
        if (!resolver || !options.screenerDocument)
            return [];
        const keys = [['$form.title', '', false], ['$form.description', '', false]];
        for (const item of options.screenerDocument.items) {
            keys.push([`${item.key}.label`, item.key, false]);
            if (requiredKeys.includes(item.key))
                keys.push([`${item.key}.requiredMessage`, item.key, true]);
            if (Array.isArray(item.options))
                for (const option of item.options) {
                    if (option && typeof option === 'object' && typeof option.value === 'string')
                        keys.push([screenerOptionLocaleKey(item.key, option.value), item.key, false]);
                }
        }
        return keys.flatMap(([key, itemKey, bindScope]) => resolver.text(key, '', answers, itemKey, bindScope).warnings.map(warning => ({ key, ...warning })));
    }, [resolver, options.screenerDocument, answers, requiredKeys]);
    return {
        translationWarnings,
        direction: resolver?.direction ?? 'ltr',
        ...(admission?.status === 'refused' ? { localeFinding: admission.reason } : {}),
        chrome: (key, params, fallback) => ownsLocale
            ? chromeTextFromLookup(key => resolver?.lookup(key), key, params, fallback)
            : legacyChrome(key, params, fallback),
        text: (key, fallback, answers, itemKey, bindScope) => resolver?.text(key, fallback, answers, itemKey, bindScope).text ?? fallback,
    };
}
