/** @filedesc FieldViewModel — per-field reactive state with locale resolution and FEL interpolation. */
import { interpolateMessage } from './interpolate-message.js';
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
 * `{{}}` interpolated through `evalFEL`; `null` when the Locale has neither. Each lookup walks the locale
 * fallback cascade (fr-CA → fr). Reads `localeStore.version`, so a computed caller tracks locale changes.
 */
function resolveLocaleItemString(localeStore, itemKey, property, context, evalFEL) {
    localeStore.version.value;
    const keys = context ? [`${itemKey}.${property}@${context}`, `${itemKey}.${property}`] : [`${itemKey}.${property}`];
    for (const key of keys) {
        const fromLocale = localeStore.lookupKeyWithMeta(key);
        if (fromLocale.value !== null) {
            return {
                value: interpolateMessage(fromLocale.value, evalFEL).text,
                needAnchors: [...(fromLocale.needAnchors ?? [])],
            };
        }
    }
    return null;
}
/**
 * Label a respondent sees for any Item (Locale §3.1–3.3): Locale `<key>.label@context` → Locale
 * `<key>.label` → Definition `labels[context]` → inline `label`, `{{}}` interpolated through `evalFEL`.
 */
export function resolveItemLabel(source) {
    const { localeStore, itemKey, labels, context, evalFEL } = source;
    const fromLocale = resolveLocaleItemString(localeStore, itemKey, 'label', context, evalFEL);
    if (fromLocale) {
        return fromLocale;
    }
    const definitionLabel = (context ? labels?.[context] : undefined) || source.inlineLabel || '';
    return { value: interpolateMessage(definitionLabel, evalFEL).text, needAnchors: [] };
}
// ── Factory ─────────────────────────────────────────────────────────
export function createFieldViewModel(deps) {
    // Locale §3.1: item strings are keyed `<itemKey>.<property>` by the Item's
    // definition-unique `key` — never by group path or repeat instance path.
    const { rx, localeStore, itemKey, evalFEL } = deps;
    /** Hint / description cascade (Locale §3.1.2): Locale `@context` → Locale → inline; no Definition context step. */
    function resolveLocaleString(property, fallback) {
        const fromLocale = resolveLocaleItemString(localeStore, itemKey, property, deps.getLabelContext(), evalFEL);
        if (fromLocale)
            return fromLocale;
        if (fallback === null || fallback === undefined)
            return { value: null, needAnchors: [] };
        return { value: interpolateMessage(fallback, evalFEL).text, needAnchors: [] };
    }
    // ── Label: shared Item label cascade ──
    const labelResolution = rx.computed(() => resolveItemLabel({
        localeStore,
        itemKey,
        inlineLabel: deps.getItemLabel(),
        labels: deps.getItemLabels(),
        context: deps.getLabelContext(),
        evalFEL,
    }));
    const label = rx.computed(() => labelResolution.value.value);
    const labelNeedAnchors = rx.computed(() => labelResolution.value.needAnchors);
    // ── Hint / description: Locale @context → Locale → inline ──
    const hintResolution = rx.computed(() => resolveLocaleString('hint', deps.getItemHint()));
    const hint = rx.computed(() => hintResolution.value.value);
    const hintNeedAnchors = rx.computed(() => hintResolution.value.needAnchors);
    const descriptionResolution = rx.computed(() => resolveLocaleString('description', deps.getItemDescription()));
    const description = rx.computed(() => descriptionResolution.value.value);
    const descriptionNeedAnchors = rx.computed(() => descriptionResolution.value.needAnchors);
    // ── State signals: wrap existing engine signals ──
    const value = rx.computed(() => deps.getFieldValue().value);
    const required = rx.computed(() => deps.getRequired().value);
    const visible = rx.computed(() => deps.getVisible().value);
    const readonly_ = rx.computed(() => deps.getReadonly().value);
    // ── Validation: locale-resolved messages with code synthesis ──
    const errors = rx.computed(() => {
        localeStore.version.value;
        const rawErrors = deps.getErrors().value;
        if (!rawErrors.length)
            return [];
        return rawErrors.map((err) => {
            const code = err.code ?? CODE_SYNTHESIS[err.constraintKind] ?? 'UNKNOWN';
            const resolvedMessage = resolveValidationMessage(err, code);
            return {
                path: err.path,
                severity: err.severity,
                constraintKind: err.constraintKind ?? 'unknown',
                code,
                message: resolvedMessage,
            };
        });
    });
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
            return interpolateMessage(fromCode, evalFEL).text;
        }
        // Step 2: Per-bind key — itemKey.requiredMessage or itemKey.constraintMessage
        if (err.constraintKind === 'required') {
            const reqKey = `${itemKey}.requiredMessage`;
            const fromReq = localeStore.lookupKey(reqKey);
            if (fromReq !== null)
                return interpolateMessage(fromReq, evalFEL).text;
        }
        else if (code === 'CONSTRAINT_FAILED') {
            // Core Phase 3 step 1a: `constraintMessage` labels a `false` result only; a
            // CONSTRAINT_PARSE_ERROR (definition error) keeps its processor-generated message.
            const constKey = `${itemKey}.constraintMessage`;
            const fromConst = localeStore.lookupKey(constKey);
            if (fromConst !== null)
                return interpolateMessage(fromConst, evalFEL).text;
            // Step 3: Inline bind constraintMessage
            if (err.constraintMessage)
                return interpolateMessage(err.constraintMessage, evalFEL).text;
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
                label: interpolateMessage(fromField.value, evalFEL).text,
                ...(fromField.needAnchors ? { needAnchors: fromField.needAnchors } : {}),
            };
        }
        // Step 2: OptionSet-level locale key
        if (optionSetName) {
            const setKey = `$optionSet.${optionSetName}.${escapedValue}.label`;
            const fromSet = localeStore.lookupKeyWithMeta(setKey);
            if (fromSet.value !== null) {
                return {
                    label: interpolateMessage(fromSet.value, evalFEL).text,
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
        value,
        required,
        visible,
        readonly: readonly_,
        errors,
        firstError,
        options,
        optionsState,
        setValue: deps.setFieldValue,
    };
}
/** Escape dots and backslashes in option values per §3.1.3. */
function escapeOptionValue(value) {
    return value.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}
