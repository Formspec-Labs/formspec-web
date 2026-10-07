/**
 * Locale steps of an Item string cascade (Locale §3.1.2): `<key>.<property>@context` → `<key>.<property>`,
 * `{{}}` resolved through `interpolate`; `null` when the Locale has neither. Each lookup walks the locale
 * fallback cascade (fr-CA → fr). Reads `localeStore.version`, so a computed caller tracks locale changes.
 */
function resolveLocaleItemString(localeStore, itemKey, property, context, interpolate) {
    localeStore.version.value;
    const keys = context ? [`${itemKey}.${property}@${context}`, `${itemKey}.${property}`] : [`${itemKey}.${property}`];
    for (const key of keys) {
        const fromLocale = localeStore.lookupKeyWithMeta(key);
        if (fromLocale.value !== null) {
            return {
                value: interpolate(fromLocale.value),
                template: fromLocale.value,
                needAnchors: [...(fromLocale.needAnchors ?? [])],
            };
        }
    }
    return null;
}
/**
 * Hint or description a respondent sees for any Item (Core §4.2.1, Locale §3.1.2): Locale
 * `<key>.<property>@context` → Locale `<key>.<property>` → the inline property — the label cascade
 * minus its Definition-side context step, since neither property has a `labels`-like sibling.
 * `null` when no source has it.
 */
export function resolveItemHelpText(source) {
    const { localeStore, itemKey, property, inlineText, context, interpolate } = source;
    const fromLocale = resolveLocaleItemString(localeStore, itemKey, property, context, interpolate);
    if (fromLocale) {
        return fromLocale;
    }
    if (inlineText === null || inlineText === undefined) {
        return { value: null, template: null, needAnchors: [] };
    }
    return { value: interpolate(inlineText), template: inlineText, needAnchors: [] };
}
/**
 * Label a respondent sees for any Item (Locale §3.1–3.3): Locale `<key>.label@context` → Locale
 * `<key>.label` → Definition `labels[context]` → inline `label`, `{{}}` resolved through `interpolate`.
 */
export function resolveItemLabel(source) {
    const { localeStore, itemKey, labels, context, interpolate } = source;
    const fromLocale = resolveLocaleItemString(localeStore, itemKey, 'label', context, interpolate);
    if (fromLocale) {
        return fromLocale;
    }
    const definitionLabel = (context ? labels?.[context] : undefined) || source.inlineLabel || '';
    return { value: interpolate(definitionLabel), template: definitionLabel, needAnchors: [] };
}
export function resolveOptionLabel(localeStore, itemKey, opt, interpolate, optionSetName) {
    const escapedValue = escapeOptionValue(opt.value);
    // Step 1: Field-level locale key
    const fieldKey = `${itemKey}.options.${escapedValue}.label`;
    const fromField = localeStore.lookupKeyWithMeta(fieldKey);
    if (fromField.value !== null) {
        return {
            label: interpolate(fromField.value),
            ...(fromField.needAnchors ? { needAnchors: fromField.needAnchors } : {}),
        };
    }
    // Step 2: OptionSet-level locale key
    if (optionSetName) {
        const setKey = `$optionSet.${optionSetName}.${escapedValue}.label`;
        const fromSet = localeStore.lookupKeyWithMeta(setKey);
        if (fromSet.value !== null) {
            return {
                label: interpolate(fromSet.value),
                ...(fromSet.needAnchors ? { needAnchors: fromSet.needAnchors } : {}),
            };
        }
    }
    // Step 3: Inline option label
    return { label: opt.label };
}
/** Escape dots and backslashes in option values per §3.1.3. */
function escapeOptionValue(value) {
    return value.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}
