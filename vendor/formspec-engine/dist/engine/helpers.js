/** @filedesc Internal helpers shared by FormEngine (paths, coercion, validation shaping, FEL path rewriting). */
import { cloneValue, isJsonRecord, isRawJson, jsonNumberText } from '../json-values.js';
export { cloneValue, deepEqual, isJsonRecord } from '../json-values.js';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { Path, PathSegmentKind } from '@formspec-org/types';
import { wasmCoerceFieldValue, wasmEvalFel, wasmNormalizeIndexedPath, } from '../wasm-bridge-runtime.js';
export function normalizeRemoteOptions(payload, mapping) {
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
    const valueField = mapping?.valueField || 'value';
    const labelField = mapping?.labelField || 'label';
    return options
        .filter((option) => !!option && typeof option === 'object' && valueField in option && labelField in option)
        .map((option) => {
        const base = {
            value: String(option[valueField]),
            label: String(option[labelField]),
            ...(option['x-generation'] && typeof option['x-generation'] === 'object'
                ? { 'x-generation': option['x-generation'] }
                : {}),
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
    };
}
/** Paths stay resolved instance paths with 0-based indexes (Core §4.3.3), exactly as WASM emits them. */
export function toValidationResult(result) {
    return {
        ...result,
        $formspecValidationResult: '1.0',
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
export function coerceFieldValue(item, bind, definition, value) {
    if (value === undefined) {
        return undefined;
    }
    const bindJson = bind === undefined ? '' : JSON.stringify(bind);
    const out = wasmCoerceFieldValue(JSON.stringify(item), bindJson, JSON.stringify(definition), JSON.stringify(value));
    return parseJsonExact(out);
}
export function validateDataType(value, dataType) {
    switch (dataType) {
        case 'string':
            return typeof value === 'string';
        case 'boolean':
            return typeof value === 'boolean';
        case 'integer':
            return jsonNumberText(value) !== undefined && wasmEvalFel('floor($value) = $value', { value }) === true;
        case 'decimal':
            return jsonNumberText(value) !== undefined;
        case 'money':
            return isJsonRecord(value) && typeof value.amount === 'string' && typeof value.currency === 'string';
        case 'array':
            return Array.isArray(value);
        case 'object':
            return isJsonRecord(value);
        default:
            return true;
    }
}
export function normalizeWasmValue(value) {
    if (isRawJson(value))
        return value;
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
// `getNestedValue` and `setNestedPathValue` walk a path through nested
// objects/arrays. They share the same parser
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
export function isEmptyValue(value) {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
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
/** FEL expression addressing only (`$repeat[n]` is 1-based, Core §4.3.3); never for ValidationResult paths. */
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
                // (the FEL context resolves bare sibling names in the row's lexical scope, Core §3.2.1)
                return fieldName;
            }
            // For outer repeat scopes, resolve to the FEL-indexed path.
            // FEL uses 1-based indexing; the concretePrefix uses 0-based.
            return toFelIndexedPath(concretePrefix) + '.' + fieldName;
        });
    }
    return result;
}
