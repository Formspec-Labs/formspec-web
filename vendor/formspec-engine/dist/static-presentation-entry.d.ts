/** @filedesc Public static presentation reader; no Engine or WASM initialization. */
export { createStaticResponseMetadataReader } from './static-response-metadata.js';
export type { StaticResponseMetadataInput } from './static-response-metadata.js';
import { type FormDefinition, type LocaleDocument } from '@formspec-org/types';
/** Look up authored strings without evaluating answers, using the runtime Locale cascade. */
export declare function createDefinitionLocaleLookup(definition: FormDefinition, documents: readonly LocaleDocument[]): {
    locales: string[];
    lookup: (locale: string, key: string) => string | null;
};
