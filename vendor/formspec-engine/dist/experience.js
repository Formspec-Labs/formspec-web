/** @filedesc Experience processor predicates for sidecar coverage and references. */
export function analyzeExperience(definition, experience) {
    const targetDefinition = targetDefinitionFindings(definition, experience);
    const referentialIntegrity = referentialIntegrityFindings(experience);
    const unresolvedItemRefs = unresolvedItemRefFindings(definition, experience);
    const coverage = coverageFindings(definition, experience);
    return {
        findings: [...targetDefinition, ...referentialIntegrity, ...unresolvedItemRefs, ...coverage],
        targetDefinition,
        referentialIntegrity,
        unresolvedItemRefs,
        coverage,
    };
}
export function targetDefinitionFindings(definition, experience) {
    const findings = [];
    const target = asObject(experience.targetDefinition);
    const targetUrl = asString(target?.url);
    const definitionUrl = asString(definition.url);
    if (targetUrl && definitionUrl && targetUrl !== definitionUrl) {
        findings.push({
            code: 'EXP-TARGET-DEFINITION-MISMATCH',
            severity: 'warning',
            path: 'targetDefinition.url',
            message: `Experience targetDefinition.url '${targetUrl}' does not match Definition url '${definitionUrl}'.`,
        });
    }
    const compatibleVersions = asString(target?.compatibleVersions);
    const definitionVersion = asString(definition.version);
    if (compatibleVersions && definitionVersion && !simpleRangeSatisfies(compatibleVersions, definitionVersion)) {
        findings.push({
            code: 'EXP-TARGET-DEFINITION-VERSION-MISMATCH',
            severity: 'warning',
            path: 'targetDefinition.compatibleVersions',
            message: `Experience compatibleVersions '${compatibleVersions}' does not include Definition version '${definitionVersion}'.`,
        });
    }
    return findings;
}
export function coverageFindings(definition, experience) {
    const required = requiredVisiblePaths(definition);
    const covered = coveredPaths(experience);
    return [...required]
        .filter(path => !covered.has(path))
        .sort()
        .map(path => ({
        code: 'EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM',
        severity: 'warning',
        path,
        experienceId: asString(experience.name) ?? asString(experience.title) ?? '',
        message: `Required visible item '${path}' is not referenced by any unit.itemRefs.`,
    }));
}
export function unresolvedItemRefFindings(definition, experience) {
    const paths = itemPaths(definition);
    const findings = [];
    for (const [unitIdx, unit] of asArray(experience.units).entries()) {
        const unitObj = asObject(unit);
        if (!unitObj)
            continue;
        for (const ref of asArray(unitObj.itemRefs)) {
            const refObj = asObject(ref);
            const path = asString(refObj?.path);
            if (!path)
                continue;
            if (!paths.has(normalizeItemPath(path))) {
                findings.push({
                    code: 'EXP-ITEM-REF-UNRESOLVED',
                    severity: 'warning',
                    path,
                    unitId: asString(unitObj.id) ?? String(unitIdx),
                    message: `ItemRef.path '${path}' does not resolve in target Definition.`,
                });
            }
        }
    }
    return findings;
}
export function referentialIntegrityFindings(experience) {
    const actorIds = idsFromArray(experience.actors);
    const taskIds = idsFromArray(experience.tasks);
    const findings = [];
    const add = (path, ref, target) => {
        findings.push({
            code: 'EXP-REFERENTIAL-INTEGRITY',
            severity: 'warning',
            path,
            ref,
            target,
            message: `Reference '${ref}' at ${path} does not resolve in ${target}.`,
        });
    };
    for (const [idx, ref] of stringEntries(asObject(experience.applicability)?.actorRefs)) {
        if (!actorIds.has(ref))
            add(`applicability.actorRefs[${idx}]`, ref, 'actors');
    }
    for (const [taskIdx, task] of asArray(experience.tasks).entries()) {
        const taskObj = asObject(task);
        if (!taskObj)
            continue;
        for (const [refIdx, ref] of stringEntries(taskObj.actorRefs)) {
            if (!actorIds.has(ref))
                add(`tasks[${taskIdx}].actorRefs[${refIdx}]`, ref, 'actors');
        }
    }
    for (const [unitIdx, unit] of asArray(experience.units).entries()) {
        const unitObj = asObject(unit);
        if (!unitObj)
            continue;
        const actorRef = asString(unitObj.actorRef);
        if (actorRef && !actorIds.has(actorRef))
            add(`units[${unitIdx}].actorRef`, actorRef, 'actors');
        for (const [refIdx, ref] of stringEntries(unitObj.taskRefs)) {
            if (!taskIds.has(ref))
                add(`units[${unitIdx}].taskRefs[${refIdx}]`, ref, 'tasks');
        }
        for (const [refIdx, ref] of stringEntries(asObject(unitObj.applicability)?.actorRefs)) {
            if (!actorIds.has(ref)) {
                add(`units[${unitIdx}].applicability.actorRefs[${refIdx}]`, ref, 'actors');
            }
        }
    }
    return findings;
}
function requiredVisiblePaths(definition) {
    const fields = fieldItems(definition);
    const bindMeta = bindMetaByPath(definition, fields);
    const paths = new Set();
    for (const [path, bind] of bindMeta.entries()) {
        const field = fields.get(path);
        if (!field)
            continue;
        if (trimmedLiteral(bind.required) !== 'true')
            continue;
        if (field.insideOptionalRepeat)
            continue;
        if (hasStaticFalseRelevance(path, bindMeta))
            continue;
        paths.add(field.canonicalPath);
    }
    return paths;
}
function bindMetaByPath(definition, fields) {
    const meta = new Map();
    const allPaths = itemPaths(definition);
    for (const bind of asArray(definition.binds)) {
        const bindObj = asObject(bind);
        const rawPath = asString(bindObj?.path);
        if (!rawPath)
            continue;
        const path = normalizeItemPath(rawPath);
        if (!allPaths.has(path) && !fields.has(path))
            continue;
        meta.set(path, {
            required: asString(bindObj?.required) ?? undefined,
            relevant: asString(bindObj?.relevant) ?? undefined,
        });
    }
    return meta;
}
function fieldItems(definition) {
    const out = new Map();
    const walk = (items, prefix, canonicalPrefix, insideOptionalRepeat) => {
        for (const item of items) {
            const itemObj = asObject(item);
            const key = asString(itemObj?.key);
            if (!itemObj || !key)
                continue;
            const path = prefix ? `${prefix}.${key}` : key;
            const repeatable = itemObj.repeatable === true || itemObj.repeat !== undefined;
            const minRepeat = typeof itemObj.minRepeat === 'number' ? itemObj.minRepeat : 0;
            const nextInsideOptionalRepeat = insideOptionalRepeat || (repeatable && minRepeat === 0);
            const canonicalSegment = repeatable ? `${key}[*]` : key;
            const canonicalPath = canonicalPrefix ? `${canonicalPrefix}.${canonicalSegment}` : canonicalSegment;
            if (itemObj.type === 'field') {
                out.set(path, { canonicalPath, insideOptionalRepeat: nextInsideOptionalRepeat });
            }
            walk(asArray(itemObj.children), path, canonicalPath, nextInsideOptionalRepeat);
        }
    };
    walk(asArray(definition.items), '', '', false);
    return out;
}
function itemPaths(definition) {
    const paths = new Set();
    const walk = (items, prefix) => {
        for (const item of items) {
            const itemObj = asObject(item);
            const key = asString(itemObj?.key);
            if (!itemObj || !key)
                continue;
            const path = prefix ? `${prefix}.${key}` : key;
            paths.add(path);
            walk(asArray(itemObj.children), path);
        }
    };
    walk(asArray(definition.items), '');
    return paths;
}
function coveredPaths(experience) {
    const paths = new Set();
    for (const unit of asArray(experience.units)) {
        const unitObj = asObject(unit);
        if (!unitObj)
            continue;
        for (const ref of asArray(unitObj.itemRefs)) {
            const path = asString(asObject(ref)?.path);
            if (path)
                paths.add(path);
        }
    }
    return paths;
}
function hasStaticFalseRelevance(path, bindMeta) {
    let current = '';
    for (const segment of path.split('.')) {
        current = current ? `${current}.${segment}` : segment;
        if (trimmedLiteral(bindMeta.get(current)?.relevant) === 'false')
            return true;
    }
    return false;
}
function idsFromArray(value) {
    return new Set(asArray(value).map(item => asString(asObject(item)?.id)).filter(isString));
}
function stringEntries(value) {
    return asArray(value)
        .map((entry, index) => [index, asString(entry)])
        .filter((entry) => entry[1] !== null);
}
function normalizeItemPath(path) {
    return path.replace(/\[[^\]]+\]/g, '');
}
function simpleRangeSatisfies(range, version) {
    return range.split('||').some(part => rangePartSatisfies(part.trim(), version));
}
function rangePartSatisfies(range, version) {
    if (!range)
        return false;
    if (range.includes(' ')) {
        return range.split(/\s+/).every(part => rangePartSatisfies(part, version));
    }
    if (range.startsWith('^')) {
        const base = parseVersion(range.slice(1));
        const current = parseVersion(version);
        return Boolean(base && current && current.major === base.major && compareVersion(current, base) >= 0);
    }
    if (range.startsWith('~')) {
        const base = parseVersion(range.slice(1));
        const current = parseVersion(version);
        return Boolean(base &&
            current &&
            current.major === base.major &&
            current.minor === base.minor &&
            compareVersion(current, base) >= 0);
    }
    const match = /^(>=|<=|>|<|=)?(.+)$/.exec(range);
    if (!match)
        return false;
    const op = match[1] || '=';
    const wanted = parseVersion(match[2]);
    const current = parseVersion(version);
    if (!wanted || !current)
        return false;
    const cmp = compareVersion(current, wanted);
    if (op === '>=')
        return cmp >= 0;
    if (op === '<=')
        return cmp <= 0;
    if (op === '>')
        return cmp > 0;
    if (op === '<')
        return cmp < 0;
    return cmp === 0;
}
function parseVersion(value) {
    const core = value.split('-', 1)[0];
    const parts = core.split('.');
    if (parts.length < 1 || parts.length > 3)
        return null;
    const [major, minor = '0', patch = '0'] = parts;
    const parsed = [major, minor, patch].map(part => Number.parseInt(part, 10));
    if (parsed.some(part => Number.isNaN(part)))
        return null;
    return { major: parsed[0], minor: parsed[1], patch: parsed[2] };
}
function compareVersion(left, right) {
    return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}
function trimmedLiteral(value) {
    return value?.trim();
}
function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function asString(value) {
    return typeof value === 'string' ? value : null;
}
function isString(value) {
    return value !== null;
}
