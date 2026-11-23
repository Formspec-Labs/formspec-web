/** @filedesc ValidationSummary rows every renderer draws: which results show, deduped, worded as the field shows them, linked to their control. */
import { validationResultIdentity } from '@formspec-org/types';
/** Strip one or more leading severity prefixes (`WARNING:`, `Error:`, `Info —`, etc.). */
export function stripSeverityPrefix(message) {
    return message.replace(/^(?:(?:warning|error|info(?:rmation)?)\s*[:—-]+\s*)+/i, '').trim();
}
/** Collapse doubled leading severity prefixes (`Warning: WARNING: ...` → `Warning: ...`). */
export function dedupeSeverityPrefix(message) {
    return message.replace(/^((?:warning|error|info(?:rmation)?))\s*:\s*(?:(?:warning|error|info(?:rmation)?)\s*[:—-]+\s*)+/i, '$1: ');
}
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
        const rawPath = (options.path ?? validationResultPath)(result);
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
        rows.push({
            identity: validationResultIdentity(result),
            severity,
            path,
            formLevel,
            message,
            ...summaryRowWording(source, path, message, jumpLinks),
        });
    }
    return rows;
}
/**
 * @internal Word one row for a path (empty at form level) as its field shows it, linked when the field can
 * take the jump. Finding rows and owed follow-up rows read the same.
 */
export function summaryRowWording(source, path, message, jumpLinks) {
    const formLevel = path === '';
    const field = formLevel ? null : source.field(path);
    const rawLabel = field?.label ?? (formLevel ? null : path.replace(/\[\d+\]/g, ''));
    const label = rawLabel === null ? null : (rawLabel.trimEnd().replace(/[:.]+$/, '') || rawLabel);
    const rowMessage = label === null
        ? (dedupeSeverityPrefix(message) || message)
        : (stripSeverityPrefix(message) || message);
    const canJump = jumpLinks && !formLevel && (source.jumpable ? source.jumpable(path) : field !== null);
    return {
        label,
        text: label === null ? rowMessage : source.chrome('validationSummary.row', { label, message: rowMessage }),
        jumpPath: canJump ? path : null,
        jumpHref: canJump && field?.controlId ? `#${field.controlId}` : null,
    };
}
