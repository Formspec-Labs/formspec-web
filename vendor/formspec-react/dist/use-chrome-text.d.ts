import { type ChromeStringKey } from '@formspec-org/layout';
import type { IFormEngine } from '@formspec-org/engine/render';
/** Resolves one chrome string: what the renderer says for itself, in the respondent's language. */
export type ChromeText = (key: ChromeStringKey, params?: Record<string, string | number>) => string;
/**
 * Locale §3.1.10 `$ui.<ChromeStringKey>`: an authored override wins, else the shared English default
 * (`packages/formspec-layout/src/ui-strings.ts` — the one inventory every renderer draws from).
 * Callers subscribe to `engine.localeSignal` so a locale switch re-renders; {@link useChromeText} does that.
 */
export declare function chromeText(engine: IFormEngine | undefined, key: ChromeStringKey, params?: Record<string, string | number>): string;
/**
 * The chrome-string resolver for the form being rendered, re-resolved on a locale switch. Outside a
 * provider — a standalone `FormspecScreener`, which carries a screener document and no Locale — it
 * answers with the English defaults.
 */
export declare function useChromeText(): ChromeText;
