/** @filedesc Static wording from admitted original artifacts; never evaluates answers. */
import { Path, PathSegmentKind, targetDefinitionMatches } from '@formspec-org/types';
import { LocaleStore } from './locale.js';
import { resolveItemLabel, resolveOptionLabel } from './presentation-strings.js';
import { preactReactiveRuntime } from './reactivity/preact-runtime.js';
function refuse(reason) {
    throw new Error(`static-response-metadata-${reason}`);
}
function staticText(text) {
    if (typeof text !== 'string' || text.includes('{{'))
        refuse('interpolation-unproven');
    return text;
}
/**
 * Produce a reader for Surface captureResponseFieldMetadata's static subset.
 * No original custody proof is created. Context alternatives, regional/fallback
 * Locales, unresolved fragments and dynamic/remote options require captured
 * original metadata instead. Snapshots isolate reads from later caller edits.
 */
export function createStaticResponseMetadataReader(input) {
    const { definition, response, locale } = structuredClone(input);
    if (response.definitionUrl !== definition.url || response.definitionVersion !== definition.version) {
        refuse('definition-mismatch');
    }
    const store = new LocaleStore(preactReactiveRuntime, 'ltr', { kind: 'definition', url: definition.url });
    const recorded = response.displayedLocale;
    if (recorded) {
        if (!locale)
            refuse('locale-unavailable');
        const code = LocaleStore.normalizeCode(recorded.locale);
        if (!/^[a-z]{2,3}$/.test(code) || locale.fallback !== undefined)
            refuse('fallback-unproven');
        if (locale.target.kind !== 'definition' || !targetDefinitionMatches(locale.target, definition)
            || LocaleStore.normalizeCode(locale.locale) !== code
            || locale.version !== recorded.version
            || recorded.url !== (locale.url ? locale.url : undefined)) {
            refuse('locale-mismatch');
        }
        store.loadLocale(locale);
        store.setLocale(code);
    }
    else if (locale !== null) {
        refuse('locale-mismatch');
    }
    // An unresolved fragment cannot establish the complete original item tree.
    const itemKeys = new Set();
    function checkItems(items) {
        for (const item of items) {
            if (item.$ref !== undefined)
                refuse('definition-unresolved');
            if (itemKeys.has(item.key))
                refuse('definition-ambiguous');
            itemKeys.add(item.key);
            if (item.children)
                checkItems(item.children);
        }
    }
    checkItems(definition.items);
    function itemAt(path) {
        const parsed = Path.parse(path);
        if (!path || parsed.toString() !== path || parsed.segments.some(segment => segment.kind !== PathSegmentKind.Exact && segment.kind !== PathSegmentKind.Indexed)) {
            refuse('path-invalid');
        }
        let items = definition.items;
        let value = response.data;
        let item;
        for (let index = 0; index < parsed.segments.length; index++) {
            const segment = parsed.segments[index];
            if (segment.kind === PathSegmentKind.Indexed) {
                if (!item || item.type !== 'group' || !item.repeatable || !Array.isArray(value)
                    || !Object.prototype.hasOwnProperty.call(value, segment.index))
                    refuse('path-invalid');
                value = value[segment.index];
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    refuse('path-invalid');
            }
            else if (segment.kind === PathSegmentKind.Exact) {
                if (index > 0) {
                    if (!item || item.type !== 'group' || Array.isArray(value))
                        refuse('path-invalid');
                    items = item.children ?? [];
                }
                const matches = items.filter(candidate => candidate.key === segment.key);
                if (matches.length !== 1 || !value || typeof value !== 'object'
                    || !Object.prototype.hasOwnProperty.call(value, segment.key))
                    refuse('path-unavailable');
                item = matches[0];
                value = value[segment.key];
            }
        }
        if (!item || item.type === 'display')
            refuse('path-unavailable');
        if (item.labels && Object.keys(item.labels).length > 0)
            refuse('context-unproven');
        if (locale && Object.keys(locale.strings).some(key => key.startsWith(`${item.key}.label@`))) {
            refuse('context-unproven');
        }
        return item;
    }
    return {
        label(path) {
            const item = itemAt(path);
            return resolveItemLabel({ localeStore: store, itemKey: item.key, inlineLabel: item.label,
                labels: item.labels, context: null, interpolate: staticText }).value;
        },
        options(path) {
            const item = itemAt(path);
            if (item.type !== 'field')
                refuse('field-unavailable');
            const templatePath = Path.parse(path).stripIndices();
            if ((definition.binds ?? []).some(bind => Path.parse(bind.path).stripIndices() === templatePath && 'remoteOptions' in bind)) {
                refuse('options-unproven');
            }
            if (item.remoteOptions !== undefined || item.optionFilter !== undefined)
                refuse('options-unproven');
            let supplied = item.options;
            if (item.optionSet !== undefined) {
                const set = definition.optionSets?.[item.optionSet];
                if (!set || typeof set !== 'object' || (!Array.isArray(set) && set.source !== undefined)) {
                    refuse('options-unproven');
                }
                supplied = Array.isArray(set) ? set : set.options;
                if (!Array.isArray(supplied))
                    refuse('options-unproven');
            }
            if (supplied === undefined)
                return [];
            if (!Array.isArray(supplied))
                refuse('options-unproven');
            return supplied.map((entry) => {
                if (!entry || typeof entry.value !== 'string' || typeof entry.label !== 'string')
                    refuse('options-unproven');
                const selected = resolveOptionLabel(store, item.key, entry, staticText, item.optionSet);
                return { value: entry.value, label: staticText(selected.label) };
            });
        },
    };
}
