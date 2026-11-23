function progressCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function progressCounts(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const { total, filled, toFix, toCheck } = value;
    if (!progressCount(total) || !progressCount(filled))
        return undefined;
    if (toFix !== null && !progressCount(toFix))
        return undefined;
    if (toCheck !== null && !progressCount(toCheck))
        return undefined;
    return { total, filled, toFix, toCheck };
}
/**
 * Copy exactly the `schemas/draft-progress-summary.schema.json` fields of a progress value.
 * Field paths, messages and any other caller-attached members are dropped; when `allowedSectionIds`
 * is provided, only section keys declared in that plan are retained. A value that cannot be
 * represented by the closed schema yields `undefined` so the caller stores no counts.
 */
export function canonicalDraftProgress(value, allowedSectionIds) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const { status, form, sections } = value;
    if (status !== 'current' || typeof sections !== 'object' || sections === null || Array.isArray(sections))
        return undefined;
    const formCounts = progressCounts(form);
    const ready = form?.ready;
    if (!formCounts || (ready !== null && typeof ready !== 'boolean'))
        return undefined;
    const allowed = allowedSectionIds === undefined
        ? undefined
        : allowedSectionIds instanceof Set ? allowedSectionIds : new Set(allowedSectionIds);
    const sectionEntries = [];
    for (const [id, counts] of Object.entries(sections)) {
        if (allowed !== undefined && !allowed.has(id))
            continue;
        const copied = progressCounts(counts);
        if (!copied)
            return undefined;
        sectionEntries.push([id, copied]);
    }
    return { status: 'current', form: { ...formCounts, ready }, sections: Object.fromEntries(sectionEntries) };
}
export function matchesFilingSubjectPredicates(definition, subject, match) {
    const declaration = definition.subject;
    if (!declaration || declaration.type !== match.type || !subject || subject.type !== match.type) {
        return false;
    }
    const declaredEntries = Object.entries(declaration.keys);
    if (Object.keys(subject.keys).length !== declaredEntries.length)
        return false;
    for (const [name, field] of declaredEntries) {
        if (!Object.hasOwn(subject.keys, name))
            return false;
        const actual = subject.keys[name];
        if (field.dataType === 'integer' ? !Number.isSafeInteger(actual) : typeof actual !== 'string') {
            return false;
        }
    }
    for (const predicate of match.predicates) {
        const field = declaration.keys[predicate.key];
        if (!field || !Object.hasOwn(subject.keys, predicate.key))
            return false;
        const actual = subject.keys[predicate.key];
        const expected = predicate.value;
        if (predicate.op === 'eq') {
            const validType = field.dataType === 'integer'
                ? Number.isSafeInteger(actual) && Number.isSafeInteger(expected)
                : typeof actual === 'string' && typeof expected === 'string';
            if (!validType || actual !== expected)
                return false;
            continue;
        }
        if (field.dataType !== 'integer'
            || typeof actual !== 'number' || typeof expected !== 'number'
            || !Number.isSafeInteger(actual) || !Number.isSafeInteger(expected)) {
            return false;
        }
        if (predicate.op === 'le' ? !(actual <= expected) : !(actual >= expected)) {
            return false;
        }
    }
    return true;
}
