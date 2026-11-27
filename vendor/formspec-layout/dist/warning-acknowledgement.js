/** @filedesc Shared view model for grouped blank-answer warning acknowledgements. */
import { UI_STRINGS, fillUiParams } from './ui-strings.js';
function hasStoredGroupEntry(entries, code) {
    if (!entries)
        return false;
    return entries.some((entry) => typeof entry === 'object' &&
        entry !== null &&
        'group' in entry &&
        entry.group === true &&
        entry.code === code);
}
function describePath(path, source) {
    if (path === '#') {
        return { path, label: source.rootLabel(), jumpPath: null, jumpHref: null };
    }
    const field = source.field(path);
    const label = field?.label || path;
    const canJump = source.jumpable ? source.jumpable(path) : field !== null;
    const customHref = canJump && source.hrefForPath ? source.hrefForPath(path) : null;
    return {
        path,
        label,
        jumpPath: canJump ? path : null,
        jumpHref: canJump ? (customHref ?? (field?.controlId ? `#${field.controlId}` : null)) : null,
    };
}
/** Built-in grouped acknowledgement code for non-relevant held answers excluded at Submit. */
export const HIDDEN_ANSWERS_OMITTED_CODE = 'HIDDEN_ANSWERS_OMITTED';
function unansweredQuestions(count) {
    return count === 1 ? '1 unanswered question' : `${count} unanswered questions`;
}
function hiddenAnswersCount(count) {
    return count === 1 ? '1 hidden answer' : `${count} hidden answers`;
}
/** A group's heading: the first authored `explanationPrompt` among its Shapes, else a clear count. */
export function warningAcknowledgementLegend(group, resolveText) {
    for (const shapeId of group.shapeIds ?? []) {
        const resolved = resolveText(`$shape.${shapeId}.explanationPrompt`, '');
        if (resolved)
            return resolved;
    }
    if (group.code === HIDDEN_ANSWERS_OMITTED_CODE) {
        return `${hiddenAnswersCount(group.paths.length)} excluded from filing`;
    }
    return unansweredQuestions(group.paths.length);
}
/**
 * Build the renderer-agnostic grouped acknowledgement panels for the current Submit state.
 */
export function readWarningAcknowledgementGroups(state, source) {
    const groups = state.groups ?? [];
    if (groups.length === 0)
        return [];
    const rowTemplate = source.lookupUi?.('validationSummary.row') ?? UI_STRINGS['validationSummary.row'];
    return groups.map((group) => {
        const isHidden = group.code === HIDDEN_ANSWERS_OMITTED_CODE;
        const noun = isHidden
            ? hiddenAnswersCount(group.paths.length)
            : unansweredQuestions(group.paths.length);
        const legend = warningAcknowledgementLegend(group, source.resolveText);
        const items = group.paths.map((path) => describePath(path, source));
        const hasChanges = !group.current && hasStoredGroupEntry(state.entries, group.code);
        const added = hasChanges ? group.added.map((path) => describePath(path, source)) : [];
        const removed = hasChanges
            ? group.removed.map((path) => {
                const info = describePath(path, source);
                return { path, label: info.label };
            })
            : [];
        const addedText = added.length > 0
            ? fillUiParams(rowTemplate, {
                label: isHidden ? 'Newly excluded' : 'Newly unanswered',
                message: added.map((item) => item.label).join(', '),
            })
            : null;
        const removedText = removed.length > 0
            ? fillUiParams(rowTemplate, {
                label: isHidden ? 'No longer excluded' : 'Now answered',
                message: removed.map((item) => item.label).join(', '),
            })
            : null;
        const buttonLabel = isHidden
            ? (group.current ? `Acknowledged ${noun}` : `Acknowledge ${noun}`)
            : (group.current ? `Accepted ${noun}` : `Accept ${noun}`);
        return {
            code: group.code,
            ...(group.basis !== undefined ? { basis: group.basis } : {}),
            legend,
            items,
            hasChanges,
            added,
            removed,
            addedText,
            removedText,
            current: group.current,
            buttonLabel,
        };
    });
}
