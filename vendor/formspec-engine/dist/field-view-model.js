/** @filedesc FieldViewModel — per-field reactive state with locale resolution and FEL interpolation. */
// ── Code synthesis table (§3.1.4) ───────────────────────────────────
const CODE_SYNTHESIS = {
    required: 'REQUIRED',
    type: 'TYPE_MISMATCH',
    constraint: 'CONSTRAINT_FAILED',
    shape: 'SHAPE_FAILED',
    external: 'EXTERNAL_FAILED',
};
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
// ── Factory ─────────────────────────────────────────────────────────
export function createFieldViewModel(deps) {
    // Locale §3.1: item strings are keyed `<itemKey>.<property>` by the Item's
    // definition-unique `key` — never by group path or repeat instance path.
    const { rx, localeStore, itemKey, interpolate, interpolateMessage } = deps;
    const helpText = (property, inlineText) => resolveItemHelpText({
        localeStore,
        itemKey,
        property,
        inlineText,
        context: deps.getLabelContext(),
        interpolate,
    });
    // ── Label: shared Item label cascade ──
    const labelResolution = rx.computed(() => resolveItemLabel({
        localeStore,
        itemKey,
        inlineLabel: deps.getItemLabel(),
        labels: deps.getItemLabels(),
        context: deps.getLabelContext(),
        interpolate,
    }));
    const label = rx.computed(() => labelResolution.value.value);
    const labelTemplate = rx.computed(() => labelResolution.value.template);
    const labelNeedAnchors = rx.computed(() => labelResolution.value.needAnchors);
    // ── Hint / description: Locale @context → Locale → inline ──
    const hintResolution = rx.computed(() => helpText('hint', deps.getItemHint()));
    const hint = rx.computed(() => hintResolution.value.value);
    const hintTemplate = rx.computed(() => hintResolution.value.template);
    const hintNeedAnchors = rx.computed(() => hintResolution.value.needAnchors);
    const descriptionResolution = rx.computed(() => helpText('description', deps.getItemDescription()));
    const description = rx.computed(() => descriptionResolution.value.value);
    const descriptionTemplate = rx.computed(() => descriptionResolution.value.template);
    const descriptionNeedAnchors = rx.computed(() => descriptionResolution.value.needAnchors);
    // ── State signals: wrap existing engine signals ──
    const value = rx.computed(() => deps.getFieldValue().value);
    const required = rx.computed(() => deps.getRequired().value);
    const visible = rx.computed(() => deps.getVisible().value);
    const readonly_ = rx.computed(() => deps.getReadonly().value);
    // ── Validation: locale-resolved messages with code synthesis ──
    const codeOf = (err) => err.code ?? CODE_SYNTHESIS[err.constraintKind] ?? 'UNKNOWN';
    function resolveMessage(err) {
        localeStore.version.value;
        return resolveValidationMessage(err, codeOf(err));
    }
    const errors = rx.computed(() => deps.getErrors().value.map((err) => ({
        path: err.path,
        severity: err.severity,
        constraintKind: err.constraintKind ?? 'unknown',
        code: codeOf(err),
        message: resolveMessage(err),
    })));
    const firstError = rx.computed(() => {
        const errs = errors.value;
        const firstErr = errs.find(e => e.severity === 'error');
        return firstErr?.message ?? null;
    });
    // ── Options: 3-step locale cascade ──
    const options = rx.computed(() => {
        localeStore.version.value;
        const rawOptions = deps.getOptions().value;
        const optionSetName = deps.getOptionSetName();
        return rawOptions.map((opt) => {
            const labelResolution = resolveOptionLabel(opt, optionSetName);
            const resolved = {
                value: opt.value,
                label: labelResolution.label,
            };
            const generation = opt['x-generation'];
            const anchors = generation && typeof generation === 'object' && !Array.isArray(generation)
                ? generation.anchors
                : undefined;
            const canonical = [
                ...(Array.isArray(anchors) ? anchors : []),
                ...(labelResolution.needAnchors ?? []),
            ].filter((anchor) => typeof anchor === 'string'
                && /^need:[a-zA-Z][a-zA-Z0-9_-]*@[1-9][0-9]*$/.test(anchor));
            if (canonical.length > 0)
                resolved.needAnchors = [...new Set(canonical)];
            if (opt.keywords && opt.keywords.length > 0) {
                resolved.keywords = [...opt.keywords];
            }
            return resolved;
        });
    });
    const optionsState = rx.computed(() => deps.getOptionsState().value);
    // ── Helpers ──
    function resolveValidationMessage(err, code) {
        // Step 1: Per-code key — itemKey.errors.CODE
        const codeKey = `${itemKey}.errors.${code}`;
        const fromCode = localeStore.lookupKey(codeKey);
        if (fromCode !== null) {
            return interpolateMessage(fromCode);
        }
        // Step 2: Per-bind key — itemKey.requiredMessage or itemKey.constraintMessage
        if (err.constraintKind === 'required') {
            const reqKey = `${itemKey}.requiredMessage`;
            const fromReq = localeStore.lookupKey(reqKey);
            if (fromReq !== null)
                return interpolateMessage(fromReq);
        }
        else if (code === 'CONSTRAINT_FAILED') {
            // Core Phase 3 step 1a: `constraintMessage` labels a `false` result only; a
            // CONSTRAINT_PARSE_ERROR (definition error) keeps its processor-generated message.
            const constKey = `${itemKey}.constraintMessage`;
            const fromConst = localeStore.lookupKey(constKey);
            if (fromConst !== null)
                return interpolateMessage(fromConst);
            // Step 3: the Bind's inline template, resolved here rather than taken from the processor, so a
            // date in it takes the active Locale's formats; `$` is the field either way.
            const inline = deps.getConstraintMessage();
            if (inline !== null)
                return interpolateMessage(inline);
        }
        // Step 4: Processor default
        return err.message ?? 'Validation error';
    }
    function resolveOptionLabel(opt, optionSetName) {
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
    return {
        templatePath: deps.templatePath,
        instancePath: deps.instancePath,
        id: deps.id,
        itemKey: deps.itemKey,
        dataType: deps.dataType,
        disabledDisplay: deps.getDisabledDisplay(),
        label,
        labelNeedAnchors,
        hint,
        hintNeedAnchors,
        description,
        descriptionNeedAnchors,
        labelTemplate,
        hintTemplate,
        descriptionTemplate,
        interpolate,
        value,
        required,
        visible,
        readonly: readonly_,
        errors,
        firstError,
        resolveMessage,
        options,
        optionsState,
        setValue: deps.setFieldValue,
    };
}
/** Escape dots and backslashes in option values per §3.1.3. */
function escapeOptionValue(value) {
    return value.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}
