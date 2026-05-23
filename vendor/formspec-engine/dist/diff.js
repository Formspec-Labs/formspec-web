/** @filedesc Diffs batch evaluation snapshots into per-signal patch payloads. */
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function deepEqual(left, right) {
    if (Object.is(left, right)) {
        return true;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!deepEqual(left[index], right[index])) {
                return false;
            }
        }
        return true;
    }
    if (isPlainObject(left) && isPlainObject(right)) {
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        if (!deepEqual(leftKeys, rightKeys)) {
            return false;
        }
        for (const key of leftKeys) {
            if (!deepEqual(left[key], right[key])) {
                return false;
            }
        }
        return true;
    }
    return false;
}
function diffRecord(previous, next) {
    const changed = {};
    const removed = [];
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of keys) {
        const hasPrevious = Object.prototype.hasOwnProperty.call(previous, key);
        const hasNext = Object.prototype.hasOwnProperty.call(next, key);
        if (!hasNext) {
            removed.push(key);
            continue;
        }
        if (!hasPrevious || !deepEqual(previous[key], next[key])) {
            changed[key] = next[key];
        }
    }
    removed.sort();
    return { changed, removed };
}
function groupValidations(validations) {
    const grouped = {};
    for (const validation of validations) {
        if (validation.shapeId) {
            continue;
        }
        const key = validation.path;
        (grouped[key] ?? (grouped[key] = [])).push(validation);
    }
    return grouped;
}
function groupShapeResults(validations) {
    var _a;
    const grouped = {};
    for (const validation of validations) {
        if (!validation.shapeId) {
            continue;
        }
        (grouped[_a = validation.shapeId] ?? (grouped[_a] = [])).push(validation);
    }
    return grouped;
}
export function diffEvalResults(previous, next) {
    const previousValues = previous?.values ?? {};
    const previousVariables = previous?.variables ?? {};
    const previousRequired = previous?.required ?? {};
    const previousReadonly = previous?.readonly ?? {};
    const previousNonRelevant = new Set(previous?.nonRelevant ?? []);
    const nextNonRelevant = new Set(next.nonRelevant);
    const relevant = {};
    const relevanceKeys = new Set([...previousNonRelevant, ...nextNonRelevant]);
    for (const key of relevanceKeys) {
        const previousRelevant = !previousNonRelevant.has(key);
        const nextRelevant = !nextNonRelevant.has(key);
        if (previous === null || previousRelevant !== nextRelevant) {
            relevant[key] = nextRelevant;
        }
    }
    const validationGroups = groupValidations(next.validations);
    const previousValidationGroups = groupValidations(previous?.validations ?? []);
    const validationDiff = diffRecord(previousValidationGroups, validationGroups);
    const shapeGroups = groupShapeResults(next.validations);
    const previousShapeGroups = groupShapeResults(previous?.validations ?? []);
    const shapeDiff = diffRecord(previousShapeGroups, shapeGroups);
    const valueDiff = diffRecord(previousValues, next.values);
    const variableDiff = diffRecord(previousVariables, next.variables);
    const requiredDiff = diffRecord(previousRequired, next.required);
    const readonlyDiff = diffRecord(previousReadonly, next.readonly);
    const delta = {
        values: valueDiff.changed,
        removedValues: valueDiff.removed,
        relevant,
        required: requiredDiff.changed,
        readonly: readonlyDiff.changed,
        validations: validationDiff.changed,
        removedValidationPaths: validationDiff.removed,
        shapeResults: shapeDiff.changed,
        removedShapeIds: shapeDiff.removed,
        variables: variableDiff.changed,
        removedVariables: variableDiff.removed,
    };
    Object.defineProperties(delta, {
        valueUpdates: { value: delta.values, enumerable: false },
        relevantUpdates: { value: delta.relevant, enumerable: false },
        requiredUpdates: { value: delta.required, enumerable: false },
        readonlyUpdates: { value: delta.readonly, enumerable: false },
        validationUpdates: { value: delta.validations, enumerable: false },
        shapeUpdates: { value: delta.shapeResults, enumerable: false },
        variableUpdates: { value: delta.variables, enumerable: false },
    });
    return delta;
}
