/** @filedesc Field-help rule shared by the React and webcomponent renderers — which References qualify, which URIs are admitted. */
const ABSOLUTE_URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const FIELD_HELP_URI_BASE = 'https://formspec.invalid/';
/**
 * Fail-closed browser policy for human Reference links: HTTPS, or a same-app relative URI, and nothing else.
 *
 * Deliberately narrower than the rich-text link rule (core §4.2.1 admits `http:` and `mailto:` too). A help
 * link is a destination a form hands a respondent under the form's own authority — a downgrade to `http:`, an
 * embedded credential, or a protocol-relative `//host` that inherits whatever scheme the page loaded under are
 * all things a References Document should not be able to introduce. One rule, both renderers.
 */
export function admitFieldHelpUri(uri) {
    if (uri.length === 0
        || uri.trim() !== uri
        || uri.includes('\\')
        || uri.startsWith('//')) {
        return undefined;
    }
    try {
        const absolute = ABSOLUTE_URI_SCHEME.test(uri);
        const destination = absolute
            ? new URL(uri)
            : new URL(uri, FIELD_HELP_URI_BASE);
        if (destination.protocol !== 'https:'
            || destination.username.length > 0
            || destination.password.length > 0
            || (!absolute && destination.origin !== 'https://formspec.invalid')) {
            return undefined;
        }
        return uri;
    }
    catch {
        return undefined;
    }
}
/** Presentation order of the effective priority tiers (References spec §2.4). */
const PRIORITY_ORDER = { primary: 0, supplementary: 1, background: 2 };
/**
 * The human-facing References bound to `fieldPath`, in presentation order.
 *
 * Qualifying (References spec §2.1, §4.2, §8.2): `audience` is `"human"` or `"both"` — agent-only entries are
 * never rendered — and `target` names this item. A `target` matches when it equals the path, equals the path
 * with its repeat indices stripped, or is the `items[*].field` wildcard form of it; `"#"` is form-level and
 * belongs to no field. Order is by effective priority tier (absent means `"supplementary"`, §2.1), then
 * authoring order within the tier (§2.4).
 */
export function resolveFieldHelp(document, fieldPath) {
    const references = document?.references;
    if (!Array.isArray(references) || fieldPath === '')
        return [];
    const candidates = [];
    references.forEach((entry, order) => {
        if (!entry || typeof entry !== 'object')
            return;
        const audience = entry.audience;
        if (audience !== 'human' && audience !== 'both')
            return;
        if (typeof entry.target !== 'string' || !targetMatches(entry.target, fieldPath))
            return;
        const title = typeof entry.title === 'string' ? entry.title : '';
        if (title === '' && typeof entry.uri !== 'string')
            return;
        candidates.push({
            tier: PRIORITY_ORDER[String(entry.priority ?? 'supplementary')] ?? 1,
            order,
            ref: {
                ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
                title,
                ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
                ...(typeof entry.content === 'string' ? { content: entry.content } : {}),
                ...(typeof entry.uri === 'string' ? { uri: entry.uri } : {}),
                ...(typeof entry.type === 'string' ? { type: entry.type } : {}),
                needAnchors: needAnchorsOf(entry),
            },
        });
    });
    return candidates
        .sort((a, b) => (a.tier - b.tier) || (a.order - b.order))
        .map((c) => c.ref);
}
/** Strip repeat indices: `jobs[2].employer` and `jobs[*].employer` both address `jobs.employer`. */
function stripIndices(path) {
    return path.replace(/\[(?:\d+|\*)\]/g, '');
}
function targetMatches(target, fieldPath) {
    if (target === '#')
        return false;
    return target === fieldPath || stripIndices(target) === stripIndices(fieldPath);
}
function needAnchorsOf(entry) {
    const generation = entry['x-generation'];
    if (!generation || typeof generation !== 'object' || Array.isArray(generation))
        return [];
    const anchors = generation.anchors;
    return Array.isArray(anchors) ? anchors.filter((a) => typeof a === 'string') : [];
}
