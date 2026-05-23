/** @filedesc BCP 47-aware LangMap resolver with regional and defaultLanguage fallback. */
import type { StringOrLangMap } from './types';
export declare function resolveLangValue(value: StringOrLangMap | undefined, requested: string, defaultLanguage: string): string | undefined;
