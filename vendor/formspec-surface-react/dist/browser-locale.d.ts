import { type ResolvedBundle } from '@formspec-org/surface';
import { type FormDefinition, type LocaleDocument } from '@formspec-org/types';
/** Build the Definition-targeted cascade without opening a draft or starting a form engine. */
export declare function definitionLocaleLookup(documents?: readonly LocaleDocument[], activeLocale?: string): (definition: FormDefinition, key: string) => string | null;
export declare function resolveBrowserLocale(bundle: ResolvedBundle, documents?: readonly LocaleDocument[]): {
    activeLocale: string;
    direction: "ltr" | "rtl";
    strings: import("@formspec-org/surface").SurfaceStrings;
};
