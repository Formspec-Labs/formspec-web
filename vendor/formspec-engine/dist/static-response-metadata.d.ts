import type { FormDefinition, FormResponse, LocaleDocument } from '@formspec-org/types';
export interface StaticResponseMetadataInput {
    /** Original parsed artifacts; the host must qualify their bytes, hashes and historical association. */
    definition: FormDefinition;
    response: FormResponse;
    /** Exact recorded base-language Locale; null only when the Response has no displayedLocale. */
    locale: LocaleDocument | null;
}
/**
 * Produce a reader for Surface captureResponseFieldMetadata's static subset.
 * No original custody proof is created. Context alternatives, regional/fallback
 * Locales, unresolved fragments and dynamic/remote options require captured
 * original metadata instead. Snapshots isolate reads from later caller edits.
 */
export declare function createStaticResponseMetadataReader(input: StaticResponseMetadataInput): {
    label(path: string): string;
    options(path: string): readonly {
        value: string;
        label: string;
    }[];
};
