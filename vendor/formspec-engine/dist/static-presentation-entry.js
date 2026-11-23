/** @filedesc Public static presentation reader; no Engine or WASM initialization. */
export { createStaticResponseMetadataReader } from './static-response-metadata.js';
import { targetDefinitionMatches } from '@formspec-org/types';
import { LocaleStore } from './locale.js';
import { preactReactiveRuntime } from './reactivity/preact-runtime.js';
/** Look up authored strings without evaluating answers, using the runtime Locale cascade. */
export function createDefinitionLocaleLookup(definition, documents) {
    const target = { kind: 'definition', url: definition.url };
    const store = new LocaleStore(preactReactiveRuntime, 'ltr', target);
    for (const document of documents) {
        if (document.target.kind === 'definition' && targetDefinitionMatches(document.target, definition)) {
            store.loadLocale(document);
        }
    }
    return {
        locales: store.getAvailableLocales(),
        lookup: (locale, key) => store.lookupKeyForTarget(key, target, locale).value,
    };
}
