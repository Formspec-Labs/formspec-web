import { cloneValue, deepEqual } from '../json-values.js';
export function isStamped(entry) {
    return entry.author !== undefined && entry.recorded !== undefined;
}
export function stripExplanationStamp(entry) {
    const copy = cloneValue(entry);
    delete copy.author;
    delete copy.recorded;
    return copy;
}
export function matchesEntry(entry, key) {
    return 'shapeId' in key
        ? 'shapeId' in entry && entry.shapeId === key.shapeId && entry.path === key.path
        : 'group' in entry && entry.code === key.code && entry.partyRef === key.partyRef;
}
export function sameAnswer(entry, other) {
    if (!matchesEntry(entry, other) || other.basis !== entry.basis)
        return false;
    if ('group' in entry)
        return 'group' in other && deepEqual(other.paths, entry.paths);
    return 'shapeId' in other && other.text === entry.text;
}
export function warningReview(resultFacts, entries) {
    const findings = resultFacts.explanationFindings ?? [];
    const byCode = new Map();
    const basisByCode = new Map();
    const shapeIdsByCode = new Map();
    const identity = (id, path) => JSON.stringify([id, path]);
    const instanceText = new Map();
    const storedPaths = new Map();
    for (const entry of entries) {
        if ('group' in entry) {
            const paths = storedPaths.get(entry.code) ?? new Set();
            for (const path of entry.paths)
                paths.add(path);
            storedPaths.set(entry.code, paths);
        }
        else
            instanceText.set(identity(entry.shapeId, entry.path), entry.text);
    }
    const errors = new Set();
    const groupErrors = new Set();
    const messages = new Map();
    for (const result of resultFacts.validations) {
        if (result.constraintKind === 'explanation' && result.severity === 'error') {
            if (result.shapeId)
                errors.add(identity(result.shapeId, result.path));
            else {
                const code = result.context?.code;
                if (code)
                    groupErrors.add(code);
            }
        }
        else if (result.constraintKind === 'shape' && result.shapeId && typeof result.message === 'string') {
            messages.set(identity(result.shapeId, result.path), result.message);
        }
    }
    const instances = findings.flatMap(finding => {
        if (finding.mode === 'acknowledge') {
            const paths = byCode.get(finding.code) ?? new Set();
            paths.add(finding.path);
            byCode.set(finding.code, paths);
            basisByCode.set(finding.code, finding.groupBasis);
            const shapeIds = shapeIdsByCode.get(finding.code) ?? new Set();
            shapeIds.add(finding.shapeId);
            shapeIdsByCode.set(finding.code, shapeIds);
            return [];
        }
        const key = identity(finding.shapeId, finding.path);
        return [{ ...finding, current: !errors.has(key), text: instanceText.get(key), message: messages.get(key) ?? '' }];
    });
    const groups = [...byCode].map(([code, currentPaths]) => {
        const stored = storedPaths.get(code) ?? new Set();
        // ResolvedItemPath and the root marker have an ASCII alphabet.
        const paths = [...currentPaths].sort();
        const shapeIds = [...(shapeIdsByCode.get(code) ?? [])].sort();
        return {
            code, basis: basisByCode.get(code) ?? '', shapeIds, paths, current: !groupErrors.has(code),
            added: paths.filter(path => !stored.has(path)),
            removed: [...stored].filter(path => !currentPaths.has(path)).sort(),
        };
    });
    const candidateEntries = resultFacts.candidateExplanations ?? [];
    const pendingStamps = candidateEntries.some(entry => !isStamped(entry));
    return cloneValue({ findings, groups, instances, entries, candidateEntries, pendingStamps });
}
