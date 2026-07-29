/** @filedesc LocaleStore — reactive locale document management and string resolution cascade. */
import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleDocument } from '@formspec-org/types';
export type { LocaleDocument };
export interface LocaleTargetIdentity {
    kind: LocaleDocument['target']['kind'];
    url: string;
}
/**
 * Rich lookup result exposing which cascade level produced the value.
 */
export interface LookupResult {
    value: string | null;
    source: 'regional' | 'fallback' | 'implicit' | null;
    localeCode?: string;
}
/**
 * Manages loaded locale documents, resolves string keys through the
 * regional -> fallback -> implicit cascade, and exposes reactive signals
 * for active locale and text direction.
 */
export declare class LocaleStore {
    readonly activeLocale: EngineSignal<string>;
    readonly direction: ReadonlyEngineSignal<'ltr' | 'rtl'>;
    readonly version: EngineSignal<number>;
    private _documents;
    private _activeTarget;
    private _rx;
    private _directionMode;
    private _directionVersion;
    private static RTL_LANGUAGES;
    constructor(rx: EngineReactiveRuntime, directionMode?: 'ltr' | 'rtl' | 'auto', activeTarget?: LocaleTargetIdentity);
    setDirectionMode(mode: 'ltr' | 'rtl' | 'auto'): void;
    loadLocale(doc: LocaleDocument): void;
    setTarget(target: LocaleTargetIdentity): void;
    getActiveTarget(): LocaleTargetIdentity | null;
    setLocale(code: string): void;
    getAvailableLocales(target?: LocaleTargetIdentity | null): string[];
    lookupKey(key: string): string | null;
    lookupKeyWithMeta(key: string): LookupResult;
    lookupKeyForTarget(key: string, target: LocaleTargetIdentity, localeCode?: string): LookupResult;
    private _cascadeLookup;
    /**
     * Normalize BCP 47: lowercase language, title-case script (4 chars),
     * uppercase region (2 chars), lowercase variants/extensions.
     */
    static normalizeCode(code: string): string;
    private static targetKey;
    private static documentKey;
}
/**
 * Normalize BCP 47: lowercase language, title-case script (4 chars),
 * uppercase region (2 chars), lowercase variants/extensions.
 */
export declare function normalizeBcp47(code: string): string;
