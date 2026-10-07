/** @filedesc FieldViewModel — per-field reactive state with locale resolution and FEL interpolation. */
import { resolveItemHelpText, resolveItemLabel, resolveOptionLabel } from './presentation-strings.js';
export { resolveItemHelpText, resolveItemLabel } from './presentation-strings.js';
// ── Code synthesis table (§3.1.4) ───────────────────────────────────
const CODE_SYNTHESIS = {
    required: 'REQUIRED',
    type: 'TYPE_MISMATCH',
    constraint: 'CONSTRAINT_FAILED',
    shape: 'SHAPE_FAILED',
    external: 'EXTERNAL_FAILED',
};
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
            const labelResolution = resolveOptionLabel(localeStore, itemKey, opt, interpolate, optionSetName);
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
        writeSource: deps.getWriteSource(),
    };
}
