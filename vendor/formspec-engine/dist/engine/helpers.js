/** @filedesc Internal helpers shared by FormEngine (paths, coercion, validation shaping, FEL context). */
import { Path, PathSegmentKind } from '@formspec-org/types';
import { wasmCoerceFieldValue, wasmEvalFELWithContext, wasmNormalizeIndexedPath, } from '../wasm-bridge-runtime.js';
export function normalizeRemoteOptions(payload) {
    const record = payload !== null && typeof payload === 'object'
        ? payload
        : null;
    const options = Array.isArray(payload)
        ? payload
        : record && Array.isArray(record.options)
            ? record.options
            : null;
    if (!options) {
        throw new Error('Remote options response must be an array or { options: [...] }');
    }
    return options
        .filter((option) => !!option && typeof option === 'object' && 'value' in option && 'label' in option)
        .map((option) => {
        const base = {
            value: String(option.value),
            label: String(option.label),
        };
        if (Array.isArray(option.keywords) && option.keywords.length > 0) {
            const keywords = option.keywords.map((k) => String(k)).filter((s) => s.length > 0);
            if (keywords.length > 0)
                return { ...base, keywords };
        }
        return base;
    });
}
export function makeValidationResult(result) {
    return {
        $formspecValidationResult: '1.0',
        ...result,
        path: toFelIndexedPath(result.path),
    };
}
export function toValidationResult(result) {
    return {
        ...result,
        $formspecValidationResult: '1.0',
        path: toFelIndexedPath(result.path),
    };
}
export function toValidationResults(results) {
    return results.map(toValidationResult);
}
export function toRuntimeMappingResult(result) {
    return {
        direction: result.direction,
        output: result.output,
        appliedRules: result.rulesApplied,
        diagnostics: (result.diagnostics ?? []),
    };
}
export function emptyValueForItem(item) {
    if (item.type !== 'field') {
        return null;
    }
    switch (item.dataType) {
        case 'integer':
        case 'decimal':
        case 'money':
        case 'date':
        case 'dateTime':
        case 'time':
        case 'attachment':
        case 'uri':
        case 'choice':
            return null;
        case 'boolean':
            return false;
        case 'multiChoice':
            return [];
        default:
            return '';
    }
}
export function coerceInitialValue(item, value) {
    if (item.dataType === 'boolean' && value === '') {
        return false;
    }
    if (['integer', 'decimal'].includes(item.dataType ?? '') && value === '') {
        return null;
    }
    if (item.dataType === 'money' && typeof value === 'number') {
        return { amount: value, currency: item.currency ?? '' };
    }
    if (item.dataType === 'money' && isJsonRecord(value) && typeof value.amount === 'string') {
        const parsed = value.amount === '' ? null : Number(value.amount);
        return {
            ...value,
            amount: parsed === null || !Number.isNaN(parsed) ? parsed : value.amount,
        };
    }
    return cloneValue(value);
}
export function coerceFieldValue(item, bind, definition, value) {
    if (value === undefined) {
        return undefined;
    }
    const bindJson = bind === undefined ? '' : JSON.stringify(bind);
    const out = wasmCoerceFieldValue(JSON.stringify(item), bindJson, JSON.stringify(definition), JSON.stringify(value));
    return JSON.parse(out);
}
export function validateDataType(value, dataType) {
    switch (dataType) {
        case 'string':
            return typeof value === 'string';
        case 'boolean':
            return typeof value === 'boolean';
        case 'integer':
            return typeof value === 'number' && Number.isInteger(value);
        case 'decimal':
            return typeof value === 'number' && !Number.isNaN(value);
        case 'money':
            return isJsonRecord(value) && typeof value.amount === 'number';
        case 'array':
            return Array.isArray(value);
        case 'object':
            return value !== null && typeof value === 'object' && !Array.isArray(value);
        default:
            return true;
    }
}
export function cloneValue(value) {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    const copier = globalThis.structuredClone;
    if (typeof copier === 'function') {
        return copier(value);
    }
    return JSON.parse(JSON.stringify(value));
}
export function isJsonRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function normalizeWasmValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeWasmValue(entry));
    }
    if (value && typeof value === 'object') {
        const record = value;
        if (record.$type === 'money' && 'amount' in record && 'currency' in record) {
            return {
                $type: 'money',
                amount: normalizeWasmValue(record.amount),
                currency: normalizeWasmValue(record.currency),
            };
        }
        return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, normalizeWasmValue(entry)]));
    }
    return cloneValue(value);
}
export function tagMoneyByPath(path, value, bindConfigs, fieldDataTypes = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
    const record = value;
    if (record.$type === 'money')
        return value;
    const bind = bindConfigs[toBasePath(path)];
    const dataType = fieldDataTypes[toBasePath(path)];
    if (dataType === 'money' && 'amount' in record && 'currency' in record) {
        return {
            $type: 'money',
            amount: record.amount,
            currency: record.currency,
        };
    }
    return value;
}
export function toWasmContextValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => toWasmContextValue(entry));
    }
    if (value && typeof value === 'object') {
        const record = value;
        return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, toWasmContextValue(entry)]));
    }
    return cloneValue(value);
}
export function deepEqual(left, right) {
    if (Object.is(left, right)) {
        return true;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        if (!deepEqual(leftKeys, rightKeys)) {
            return false;
        }
        return leftKeys.every((key) => deepEqual(left[key], right[key]));
    }
    return false;
}
export function resolveNowProvider(now) {
    if (typeof now === 'function') {
        return () => coerceDate(now());
    }
    if (now !== undefined) {
        const fixed = coerceDate(now);
        return () => new Date(fixed.getTime());
    }
    return () => new Date();
}
export function coerceDate(value) {
    if (value instanceof Date) {
        return new Date(value.getTime());
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
export function toBasePath(path) {
    return wasmNormalizeIndexedPath(path).replace(/\[\*\]/g, '');
}
export function parseInstanceTarget(path) {
    const explicit = path.match(/^instances\.([a-zA-Z][a-zA-Z0-9_]*)\.?(.*)$/);
    if (explicit) {
        return {
            instanceName: explicit[1],
            instancePath: explicit[2] || undefined,
        };
    }
    const felSyntax = path.match(/^@instance\((['"])([^'"]+)\1\)\.?(.*)$/);
    if (felSyntax) {
        return {
            instanceName: felSyntax[2],
            instancePath: felSyntax[3] || undefined,
        };
    }
    return null;
}
export function splitIndexedPath(path) {
    return path.match(/[^.[\]]+|\[\d+\]/g)?.map((segment) => segment.startsWith('[') ? segment : segment) ?? [];
}
export function appendPath(base, segment) {
    return segment.startsWith('[') ? `${base}${segment}` : `${base}.${segment}`;
}
export function parentPathOf(path) {
    if (!path) {
        return '';
    }
    const segments = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
    if (segments.length <= 1) {
        return '';
    }
    const parts = segments.slice(0, -1);
    let current = parts[0] ?? '';
    for (let index = 1; index < parts.length; index += 1) {
        current = appendPath(current, parts[index]);
    }
    return current;
}
export function getAncestorBasePaths(path) {
    const segments = splitIndexedPath(toBasePath(path));
    const result = [];
    for (let index = segments.length; index >= 1; index -= 1) {
        result.push(segments.slice(0, index).join('.'));
    }
    return result;
}
export function getScopeAncestors(scopePath) {
    const stripped = toBasePath(scopePath);
    if (!stripped) {
        return [];
    }
    const parts = Path.parse(stripped).splitNormalized();
    const scopes = [];
    for (let index = 1; index <= parts.length; index += 1) {
        scopes.push(parts.slice(0, index).join('.'));
    }
    return scopes;
}
// ── Path navigation helpers (shared via `Path`) ──────────────────────
//
// All three of `getNestedValue`, `setNestedPathValue`, `setExpressionContextValue`
// walk a path through nested objects/arrays. They now share the same parser
// (`Path.parse`) and filter out Wildcard/Special segments — those are not
// concrete data-path elements. Pre-refactor regex tokenizer would silently
// look up `obj["*"]` for a wildcard, producing garbage; the typed walk
// returns undefined / no-op instead.
function concreteSegments(path) {
    const out = [];
    for (const seg of Path.parse(path).segments) {
        if (seg.kind === PathSegmentKind.Exact || seg.kind === PathSegmentKind.Indexed) {
            out.push(seg);
        }
    }
    return out;
}
export function getNestedValue(target, path) {
    const segments = concreteSegments(path);
    let current = target;
    for (const seg of segments) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (seg.kind === PathSegmentKind.Indexed) {
            if (!Array.isArray(current)) {
                return undefined;
            }
            current = current[seg.index];
            continue;
        }
        if (!isJsonRecord(current)) {
            return undefined;
        }
        current = current[seg.key];
    }
    return current;
}
export function setNestedPathValue(target, path, value) {
    var _a, _b;
    const segments = concreteSegments(path);
    if (segments.length === 0) {
        return;
    }
    let current = target;
    for (let i = 0; i < segments.length - 1; i += 1) {
        const seg = segments[i];
        const nextIsIndex = segments[i + 1].kind === PathSegmentKind.Indexed;
        if (seg.kind === PathSegmentKind.Indexed) {
            current[_a = seg.index] ?? (current[_a] = nextIsIndex ? [] : {});
            current = current[seg.index];
        }
        else {
            current[_b = seg.key] ?? (current[_b] = nextIsIndex ? [] : {});
            current = current[seg.key];
        }
    }
    const last = segments[segments.length - 1];
    if (last.kind === PathSegmentKind.Indexed) {
        current[last.index] = value;
    }
    else {
        current[last.key] = value;
    }
}
export function setExpressionContextValue(target, path, value) {
    var _a, _b;
    const segments = concreteSegments(path);
    if (segments.length === 0) {
        return;
    }
    let current = target;
    for (let i = 0; i < segments.length - 1; i += 1) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return;
        }
        const seg = segments[i];
        const nextIsIndex = segments[i + 1].kind === PathSegmentKind.Indexed;
        if (seg.kind === PathSegmentKind.Indexed) {
            const existing = current[seg.index];
            if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
                return;
            }
            current[_a = seg.index] ?? (current[_a] = nextIsIndex ? [] : {});
            current = current[seg.index];
        }
        else {
            const existing = current[seg.key];
            if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
                return;
            }
            current[_b = seg.key] ?? (current[_b] = nextIsIndex ? [] : {});
            current = current[seg.key];
        }
    }
    if (current === null || current === undefined || typeof current !== 'object') {
        return;
    }
    const last = segments[segments.length - 1];
    if (last.kind === PathSegmentKind.Indexed) {
        current[last.index] = value;
    }
    else {
        current[last.key] = value;
    }
}
export function setResponsePathValue(target, path, value) {
    const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
    if (tokens.length === 0) {
        return;
    }
    let current = target;
    for (let index = 0; index < tokens.length - 1; index += 1) {
        const token = tokens[index];
        const next = tokens[index + 1];
        if (token.startsWith('[')) {
            const arrayIndex = Number(token.slice(1, -1));
            const existing = current[arrayIndex];
            if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
                const fallbackPath = tokens.slice(index + 1).join('.');
                setResponsePathValue(target, fallbackPath, value);
                return;
            }
            current[arrayIndex] ?? (current[arrayIndex] = next?.startsWith('[') ? [] : {});
            current = current[arrayIndex];
            continue;
        }
        const existing = current[token];
        if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
            const fallbackPath = tokens
                .slice(0, index)
                .concat(tokens.slice(index + 1))
                .join('.');
            setResponsePathValue(target, fallbackPath, value);
            return;
        }
        current[token] ?? (current[token] = next?.startsWith('[') ? [] : {});
        current = current[token];
    }
    const last = tokens[tokens.length - 1];
    if (last.startsWith('[')) {
        current[Number(last.slice(1, -1))] = value;
    }
    else {
        current[last] = value;
    }
}
export function replaceBareCurrentFieldRefs(expression, currentFieldName) {
    if (!currentFieldName || !expression.includes('$')) {
        return expression;
    }
    let output = '';
    let quote = null;
    for (let index = 0; index < expression.length; index += 1) {
        const char = expression[index];
        const previous = index > 0 ? expression[index - 1] : '';
        const next = index + 1 < expression.length ? expression[index + 1] : '';
        if (quote) {
            output += char;
            if (char === '\\' && next) {
                output += next;
                index += 1;
                continue;
            }
            if (char === quote) {
                quote = null;
            }
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            output += char;
            continue;
        }
        if (char === '$'
            && !/[A-Za-z0-9_]/.test(previous)
            && !/[A-Za-z0-9_]/.test(next)) {
            output += '$' + currentFieldName;
            continue;
        }
        output += char;
    }
    return output;
}
export function flattenObject(value, prefix = '', output = {}) {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => {
            const path = `${prefix}[${index}]`;
            flattenObject(entry, path, output);
        });
        if (prefix) {
            output[prefix] = cloneValue(value);
        }
        return output;
    }
    if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            const path = prefix ? `${prefix}.${key}` : key;
            flattenObject(entry, path, output);
        }
        if (prefix) {
            output[prefix] = cloneValue(value);
        }
        return output;
    }
    if (prefix) {
        output[prefix] = cloneValue(value);
    }
    return output;
}
export function buildGroupSnapshotForPath(prefix, signals) {
    const snapshot = {};
    for (const [path, signalRef] of Object.entries(signals)) {
        if (!path.startsWith(`${prefix}.`)) {
            continue;
        }
        const relative = path.slice(prefix.length + 1);
        if (!relative || relative.includes('[')) {
            continue;
        }
        setNestedPathValue(snapshot, relative, cloneValue(signalRef.value));
    }
    return snapshot;
}
export function buildRepeatCollection(groupPath, count, signals) {
    const rows = [];
    for (let index = 0; index < count; index += 1) {
        const prefix = `${groupPath}[${index}]`;
        const row = {};
        for (const [path, signalRef] of Object.entries(signals)) {
            if (!path.startsWith(`${prefix}.`)) {
                continue;
            }
            const relative = path.slice(prefix.length + 1);
            setResponsePathValue(row, relative, cloneValue(signalRef.value));
        }
        rows.push(row);
    }
    return rows;
}
export function getRepeatAncestors(currentItemPath, repeats) {
    const matches = currentItemPath.match(/[^.[\]]+\[\d+\]|[^.[\]]+/g) ?? [];
    const ancestors = [];
    let current = '';
    for (const segment of matches) {
        const repeatMatch = segment.match(/^(.+)\[(\d+)\]$/);
        if (repeatMatch) {
            current = current ? `${current}.${repeatMatch[1]}` : repeatMatch[1];
            if (repeats[current]) {
                ancestors.push({
                    groupPath: current,
                    index: Number(repeatMatch[2]),
                    count: repeats[current].value,
                });
            }
            current = `${current}[${repeatMatch[2]}]`;
        }
        else {
            current = current ? `${current}.${segment}` : segment;
        }
    }
    return ancestors;
}
export function isEmptyValue(value) {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}
export function safeEvaluateExpression(expression, context) {
    try {
        return wasmEvalFELWithContext(expression, context);
    }
    catch {
        return null;
    }
}
const INLINE_BIND_KEYS = [
    'calculate',
    'constraint',
    'constraintMessage',
    'relevant',
    'required',
    'readonly',
    'default',
    'precision',
    'disabledDisplay',
    'whitespace',
    'nonRelevantBehavior',
    'remoteOptions',
    'excludedValue',
];
export function extractInlineBind(item, path) {
    const bind = { path };
    let used = false;
    for (const key of INLINE_BIND_KEYS) {
        const value = item[key];
        if (value !== undefined) {
            Object.assign(bind, { [key]: value });
            used = true;
        }
    }
    if (item.visible !== undefined && bind.relevant === undefined) {
        bind.relevant = item.visible;
        used = true;
    }
    return used ? bind : null;
}
export function detectNamedCycle(graph, message) {
    const visiting = new Set();
    const visited = new Set();
    const visit = (node) => {
        if (visited.has(node)) {
            return;
        }
        if (visiting.has(node)) {
            throw new Error(message);
        }
        visiting.add(node);
        for (const dep of graph.get(node) ?? []) {
            if (graph.has(dep)) {
                visit(dep);
            }
        }
        visiting.delete(node);
        visited.add(node);
    };
    for (const node of graph.keys()) {
        visit(node);
    }
}
export function topoSortKeys(nodes, graph) {
    const pending = new Map(nodes.map((node) => [node.key, node]));
    const incoming = new Map();
    for (const node of nodes) {
        incoming.set(node.key, 0);
    }
    for (const deps of graph.values()) {
        for (const dep of deps) {
            incoming.set(dep, incoming.get(dep) ?? 0);
        }
    }
    for (const [key, deps] of graph.entries()) {
        incoming.set(key, incoming.get(key) ?? 0);
        for (const dep of deps) {
            incoming.set(key, (incoming.get(key) ?? 0) + 1);
        }
    }
    const ordered = [];
    const queue = [...nodes.filter((node) => (incoming.get(node.key) ?? 0) === 0).map((node) => node.key)];
    while (queue.length > 0) {
        const key = queue.shift();
        const node = pending.get(key);
        if (!node) {
            continue;
        }
        pending.delete(key);
        ordered.push(node);
        for (const [otherKey, deps] of graph.entries()) {
            if (!deps.has(key)) {
                continue;
            }
            const nextIncoming = (incoming.get(otherKey) ?? 0) - 1;
            incoming.set(otherKey, nextIncoming);
            if (nextIncoming === 0) {
                queue.push(otherKey);
            }
        }
    }
    if (pending.size > 0) {
        ordered.push(...pending.values());
    }
    return ordered;
}
export function snapshotSignals(signals) {
    const snapshot = {};
    for (const [path, signalRef] of Object.entries(signals)) {
        const value = signalRef.value;
        if (value !== undefined) {
            snapshot[path] = cloneValue(value);
        }
    }
    return snapshot;
}
export function toFelIndexedPath(path) {
    return path.replace(/\[(\d+)\]/g, (_match, index) => `[${Number(index) + 1}]`);
}
export function buildRepeatValueAliases(valuesByPath) {
    const grouped = new Map();
    for (const [path, value] of Object.entries(valuesByPath)) {
        const match = path.match(/^(.*)\[(\d+)\]\.([^.[\]]+)$/);
        if (!match) {
            continue;
        }
        const alias = `${match[1]}.${match[3]}`;
        const entries = grouped.get(alias) ?? [];
        entries.push({ index: Number(match[2]), value: cloneValue(value) });
        grouped.set(alias, entries);
    }
    return [...grouped.entries()].map(([path, entries]) => [
        path,
        entries.sort((left, right) => left.index - right.index).map((entry) => entry.value),
    ]);
}
export function toRepeatWildcardPath(alias) {
    const lastDot = alias.lastIndexOf('.');
    if (lastDot === -1) {
        return `${alias}[*]`;
    }
    return `${alias.slice(0, lastDot)}[*].${alias.slice(lastDot + 1)}`;
}
export function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Resolve $group.field qualified refs to sibling refs within repeat context.
 *
 * When evaluating an expression for a field inside a repeat group (e.g., line_items[0].total),
 * a reference like $line_items.qty should resolve to the sibling field "qty" in the same
 * instance, not to a wildcard collecting all instances.
 *
 * For nested repeats (e.g., orders[0].items[0].line_total), $items.qty resolves to the
 * innermost sibling, and $orders.discount_pct resolves to the enclosing group's concrete path.
 */
export function resolveQualifiedGroupRefs(expression, currentItemPath, repeatAncestors) {
    let result = expression;
    // Build a map of group name -> concrete prefix for each repeat ancestor.
    // Process longest names first to avoid partial matches.
    const groupReplacements = [];
    for (let index = 0; index < repeatAncestors.length; index += 1) {
        const ancestor = repeatAncestors[index];
        const groupPath = ancestor.groupPath;
        // Extract the group name (last Exact segment of the groupPath, without any indices)
        const segments = Path.parse(groupPath).splitNormalized();
        const groupName = segments[segments.length - 1] ?? groupPath;
        const concretePrefix = `${groupPath}[${ancestor.index}]`;
        groupReplacements.push({
            groupName,
            concretePrefix,
            isInnermost: index === repeatAncestors.length - 1,
        });
    }
    // Sort longest group names first to prevent partial matches
    groupReplacements.sort((a, b) => b.groupName.length - a.groupName.length);
    for (const { groupName, concretePrefix, isInnermost } of groupReplacements) {
        const escapedGroupName = escapeRegExp(groupName);
        // Match $groupName.fieldName — the qualified ref pattern
        const pattern = new RegExp(`\\$${escapedGroupName}\\.([A-Za-z_][A-Za-z0-9_]*)`, 'g');
        result = result.replace(pattern, (_match, fieldName) => {
            if (isInnermost) {
                // For the innermost repeat scope, resolve to bare sibling ref
                // (buildExpressionContext already adds siblings as short names)
                return fieldName;
            }
            // For outer repeat scopes, resolve to the FEL-indexed path.
            // FEL uses 1-based indexing; the concretePrefix uses 0-based.
            return toFelIndexedPath(concretePrefix) + '.' + fieldName;
        });
    }
    return result;
}
export function resolveRelativeDependency(dep, parentPath, selfPath) {
    if (!dep) {
        return selfPath;
    }
    if (dep.includes('.')) {
        return dep;
    }
    return parentPath ? `${parentPath}.${dep}` : dep;
}
