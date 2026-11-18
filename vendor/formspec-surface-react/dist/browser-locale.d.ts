import { type ResolvedBundle } from '@formspec-org/surface';
import { type LocaleDocument } from '@formspec-org/types';
export declare function resolveBrowserLocale(bundle: ResolvedBundle, documents?: readonly LocaleDocument[]): {
    activeLocale: string;
    direction: "ltr" | "rtl";
    strings: import("@formspec-org/surface").SurfaceStrings;
};
