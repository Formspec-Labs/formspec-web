/** @filedesc Target-qualified Screener presentation text using the maintained Locale and FEL engines. */
import type { LocaleDocument, ScreenerDocument } from '@formspec-org/types';
import { type WasmInterpolated } from './wasm-bridge-runtime.js';
export interface ScreenerLocaleInput {
    document: ScreenerDocument;
    localeDocuments?: readonly LocaleDocument[];
    activeLocale?: string;
    /** Schema-aligned renderer chrome suffixes from the caller's maintained inventory. */
    chromeKeys: readonly string[];
}
export interface ScreenerLocaleText {
    lookup(key: string): string | null;
    text(key: string, fallback: string, answers: Record<string, unknown>, itemKey?: string, bindScope?: boolean): WasmInterpolated;
    direction: 'ltr' | 'rtl';
}
export type ScreenerLocaleAdmission = {
    status: 'ready';
    resolver: ScreenerLocaleText;
} | {
    status: 'refused';
    reason: string;
};
/** Escape a static option value using canonical Locale key addressing. */
export declare function screenerOptionLocaleKey(itemKey: string, value: string): string;
/** Admit exact-target Locale resources and reuse the existing same-target cascade. */
export declare function createScreenerLocaleResolver(input: ScreenerLocaleInput): ScreenerLocaleAdmission;
