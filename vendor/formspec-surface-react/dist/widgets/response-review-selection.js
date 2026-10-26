/** @filedesc Definition-validated native paths for accepted-record display selection. */
import { Path, PathSegmentKind } from '@formspec-org/types';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (segment) => segment?.kind === PathSegmentKind.Exact;
/** Reject permissive parser recovery, special indices, and ambiguous key syntax. */
function parse(value) {
    if (typeof value !== 'string' || !value)
        throw Error('Invalid review field path');
    const path = Path.parse(value);
    if (path.toString() !== value || path.segments.some(segment => segment.kind === PathSegmentKind.Special ||
        (segment.kind === PathSegmentKind.Exact && !/^[A-Za-z][A-Za-z0-9_]*$/.test(segment.key)) ||
        (segment.kind === PathSegmentKind.Indexed && !Number.isSafeInteger(segment.index)))) {
        throw Error('Invalid review field path');
    }
    return path.segments;
}
function declaredLeaf(items, segments) {
    let siblings = items;
    let offset = 0;
    while (offset < segments.length) {
        const segment = segments[offset];
        if (!exact(segment) || !Array.isArray(siblings))
            throw Error('Unresolved review field path');
        const matches = siblings.filter(item => object(item) && item.key === segment.key);
        if (matches.length !== 1)
            throw Error('Unresolved review field path');
        const item = matches[0];
        offset++;
        if (offset === segments.length) {
            if (item.type !== 'field')
                throw Error('Review selection must name a declared field');
            return;
        }
        if (item.type !== 'group')
            throw Error('Review path must cross a declared group');
        if (item.repeatable === true) {
            const index = segments[offset];
            if (index?.kind !== PathSegmentKind.Indexed && index?.kind !== PathSegmentKind.Wildcard) {
                throw Error('Repeated review group requires an index');
            }
            offset++;
        }
        siblings = item.children;
    }
    throw Error('Unresolved review field path');
}
function compatible(left, right) {
    if (left.kind === PathSegmentKind.Exact || right.kind === PathSegmentKind.Exact) {
        return exact(left) && exact(right) && left.key === right.key;
    }
    return left.kind === PathSegmentKind.Wildcard || right.kind === PathSegmentKind.Wildcard ||
        (left.kind === PathSegmentKind.Indexed && right.kind === PathSegmentKind.Indexed && left.index === right.index);
}
/** Resolve against the Definition, so an absent optional answer is still a valid selector.
 * Wildcards expand only while walking recorded group rows; they never select unknown keys.
 * This is a display policy and establishes no authorization or Response integrity. */
export function createAcceptedReviewFieldSelection(items, fieldPaths) {
    if (!Array.isArray(fieldPaths) || fieldPaths.length === 0)
        throw Error('Review field paths must be a nonempty array');
    const parsed = fieldPaths.map(parse);
    parsed.forEach(segments => declaredLeaf(items, segments));
    for (let index = 0; index < parsed.length; index++) {
        if (parsed.slice(0, index).some(prior => prior.length === parsed[index].length &&
            prior.every((segment, part) => compatible(segment, parsed[index][part])))) {
            throw Error('Duplicate or overlapping review field paths');
        }
    }
    const matches = (path, descendant) => {
        const concrete = parse(path);
        return parsed.some(selector => (descendant ? selector.length > concrete.length : selector.length === concrete.length) &&
            concrete.every((segment, index) => compatible(segment, selector[index])));
    };
    return {
        fieldPaths: Object.freeze([...fieldPaths]),
        includes: path => matches(path, false),
        contains: path => matches(path, true),
    };
}
/** Expand selected declared fields to concrete recorded paths, never to unknown answers.
 * Selected optional fields without values contribute no path. Malformed selected groups
 * fail closed rather than exposing their raw object/array as a fallback. */
export function resolveAcceptedReviewFieldPaths(items, responseData, fieldPaths) {
    const selection = createAcceptedReviewFieldSelection(items, fieldPaths);
    const paths = [];
    const walk = (siblings, values, prefix) => {
        if (!Array.isArray(siblings) || !object(values))
            throw Error('Invalid selected review group');
        for (const item of siblings) {
            if (!object(item) || typeof item.key !== 'string')
                throw Error('Invalid Definition item');
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            if (!Object.prototype.hasOwnProperty.call(values, item.key))
                continue;
            if (item.type === 'field' && selection.includes(path))
                paths.push(path);
            else if (item.type === 'group' && selection.contains(path)) {
                const value = values[item.key];
                if (item.repeatable === true) {
                    if (!Array.isArray(value))
                        throw Error('Invalid selected repeated review group');
                    value.forEach((row, index) => {
                        const rowPath = `${path}[${index}]`;
                        if (selection.contains(rowPath))
                            walk(item.children, row, rowPath);
                    });
                }
                else
                    walk(item.children, value, path);
            }
        }
    };
    walk(items, responseData, '');
    return Object.freeze(paths);
}
/** Same maintained resolver for qualified host presentation and renderer admission. */
export function resolveAcceptedResponseReviewFieldSelection(definition, response, policy) {
    if (!object(policy) || Object.keys(policy).some(key => !['policyId', 'definitionUrl', 'definitionVersion', 'fieldPaths'].includes(key)) ||
        typeof policy.policyId !== 'string' || policy.policyId.length === 0 ||
        typeof policy.definitionUrl !== 'string' || policy.definitionUrl.length === 0 ||
        typeof policy.definitionVersion !== 'string' || policy.definitionVersion.length === 0 ||
        definition.url !== policy.definitionUrl || definition.version !== policy.definitionVersion ||
        response.definitionUrl !== policy.definitionUrl || response.definitionVersion !== policy.definitionVersion) {
        throw Error('Review field selection identity mismatch');
    }
    return Object.freeze({
        policyId: policy.policyId,
        definitionUrl: policy.definitionUrl,
        definitionVersion: policy.definitionVersion,
        permittedPaths: Object.freeze([...resolveAcceptedReviewFieldPaths(definition.items, response.data, policy.fieldPaths)].sort()),
    });
}
