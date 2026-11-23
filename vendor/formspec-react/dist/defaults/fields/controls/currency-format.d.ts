import type React from 'react';
/** Resolve a currency-symbol prefix adornment (`$`, `€`, `£`, `¥`, etc.) to its ISO 4217 code, or null. */
export declare function currencyCodeFromPrefix(prefix?: string): string | null;
/** ISO 4217 minor-unit decimal places (e.g. 2 for USD/EUR/GBP, 0 for JPY). */
export declare function currencyMinFractionDigits(code: string): number;
/**
 * Format an exact decimal string with thousands commas and consistent currency decimals without
 * converting through IEEE-754 floats (preserves arbitrary-precision fractional digits verbatim).
 */
export declare function formatMoneyDisplay(raw: string, currencyCode: string): string;
/** Strip thousands commas (and optional pasted currency symbol/whitespace) when the entry is numeric. */
export declare function normalizeMoneyInput(raw: string, currencySymbol: string): string;
/**
 * Manage currency input display & local draft text while focused so intermediate keystrokes
 * (`1234.`, `100.0`, `.5`, `-`) are never eaten by engine numeric canonicalization, while
 * blurred and read-only states display comma-formatted currency figures.
 */
export declare function useCurrencyDraft({ rawStr, currencyCode, currencySymbol, isReadonly, onCommit, onBlur, }: {
    rawStr: string;
    currencyCode: string;
    currencySymbol: string;
    isReadonly: boolean;
    onCommit: (normalized: string | null) => void;
    onBlur: () => void;
}): {
    displayValue: string;
    handleFocus: () => void;
    handleBlur: () => void;
    handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};
