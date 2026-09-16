/** The path a finding names: its source when it has one, else its path. */
export function validationResultPath(result) {
    const raw = result.sourceId || result.path || '';
    return typeof raw === 'string' ? raw.trim() : '';
}
/**
 * The rows a ValidationSummary shows now. Empty while the component's gate is closed (`mode: "submit"`
 * before a submit, `continuous` before a submit or a touch). `showFieldErrorsByDefault` is the renderer's
 * default for a component that does not say: the default look lists field findings, USWDS lists only
 * form-level ones unless asked, as its reference pattern does.
 */
export function readValidationSummaryRows(comp, source, options) {
    let results;
    if ((comp.source ?? 'live') === 'submit') {
        results = source.submitted ?? [];
    }
    else {
        const mode = comp.mode ?? 'continuous';
        const gateOpen = source.submitted !== null || (mode !== 'submit' && source.touched);
        if (!gateOpen)
            return [];
        results = mode === 'submit' ? source.submitted ?? [] : source.live();
    }
    const showFieldErrors = options.showFieldErrorsByDefault
        ? comp.showFieldErrors !== false
        : comp.showFieldErrors === true;
    const jumpLinks = comp.jumpLinks === true;
    const seen = new Set();
    const rows = [];
    for (const result of results) {
        if (!showFieldErrors && result.source !== 'shape' && result.constraintKind !== 'shape')
            continue;
        const rawPath = validationResultPath(result);
        const formLevel = rawPath === '' || rawPath === '#';
        const path = formLevel ? '' : rawPath;
        const severity = result.severity || 'error';
        const message = source.message(result) || 'Validation error';
        if (comp.dedupe !== false) {
            const key = `${severity}|${path}|${message}`;
            if (seen.has(key))
                continue;
            seen.add(key);
        }
        const field = formLevel ? null : source.field(path);
        const label = field?.label ?? (formLevel ? null : path.replace(/\[\d+\]/g, ''));
        const canJump = jumpLinks && !formLevel && (source.jumpable ? source.jumpable(path) : field !== null);
        rows.push({
            severity,
            path,
            formLevel,
            message,
            label,
            text: label === null ? message : source.chrome('validationSummary.row', { label, message }),
            jumpPath: canJump ? path : null,
            jumpHref: canJump && field?.controlId ? `#${field.controlId}` : null,
        });
    }
    return rows;
}
