/** @filedesc Shared lint diagnostics and URL-paired bundle document lint through an injected linter. */
import { diagnosticSourceForHandle } from './report.js';
import { componentTargetUrl } from './locale-associations.js';
import { handlesByKind, ownProp, record, stringProp } from './surface-widgets.js';
import { responseProjectionDiagnostics } from './instance-projection.js';
/** Lint findings keep their canonical codes under this origin. */
export const DOCUMENT_LINT_ORIGIN = 'x-formspec-lint';
function severity(value) {
    return value === 'error' || value === 'warning' || value === 'info' ? value : undefined;
}
/** `$.strings["a.b"][0].c` -> `/strings/a.b/0/c`; anything unparsed falls back to the root. */
export function lintPathToJsonPointer(path) {
    if (!path || path === '$')
        return '';
    const segments = [];
    const pattern = /\.([^.[\]]+)|\["((?:[^"\\]|\\.)*)"\]|\[(\d+)\]/gy;
    pattern.lastIndex = path.startsWith('$') ? 1 : 0;
    while (pattern.lastIndex < path.length) {
        const match = pattern.exec(path);
        if (!match)
            return '';
        const segment = match[1] ?? (match[2] !== undefined ? JSON.parse(`"${match[2]}"`) : match[3]);
        segments.push(segment.replace(/~/g, '~0').replace(/\//g, '~1'));
    }
    return segments.map((segment) => `/${segment}`).join('');
}
function exactlyOne(values) {
    return values.length === 1 ? values[0] : undefined;
}
function handleUrlMatches(handle, url) {
    return handle.ref?.url === url && stringProp(record(handle.document), 'url') === url;
}
function findingJsonPointer(handle, path) {
    // Rust emits flat Theme token keys as dot paths. Quote an actual token key so
    // `color.accent` remains one JSON Pointer segment rather than two.
    const token = path?.startsWith('$.tokens.') ? path.slice('$.tokens.'.length) : undefined;
    const tokens = record(ownProp(record(handle.document), 'tokens'));
    if (token && tokens && Object.prototype.hasOwnProperty.call(tokens, token)) {
        return lintPathToJsonPointer(`$.tokens[${JSON.stringify(token)}]`);
    }
    return lintPathToJsonPointer(path);
}
/** Map lint findings once for authoring and publication consumers; each gate chooses its severity policy. */
export function documentLintDiagnostics(lint, handle, context) {
    return (lint(handle.document, context).diagnostics ?? []).flatMap((finding) => {
        const level = severity(finding.severity);
        if (!level || !finding.code)
            return [];
        const message = finding.message ?? finding.code;
        return [{
                code: finding.code,
                severity: level,
                phase: 'cross-artifact',
                origin: DOCUMENT_LINT_ORIGIN,
                message: `${handle.artifactKind} '${handle.slot}': ${finding.suggestedFix ? `${message.replace(/\.$/, '')}. ${finding.suggestedFix}` : message}`,
                primarySource: diagnosticSourceForHandle(handle, findingJsonPointer(handle, finding.path)),
                details: {
                    lintPath: finding.path,
                    ...(finding.suggestedFix !== undefined ? { suggestedFix: finding.suggestedFix } : {}),
                    ...(finding.specRef !== undefined ? { specRef: finding.specRef } : {}),
                },
            }];
    });
}
function lintContextFor(context, handle) {
    if (handle.artifactKind === 'definition') {
        const registries = handlesByKind(context.handles, 'registry').map((entry) => entry.document);
        return registries.length > 0 ? { registryDocuments: registries } : {};
    }
    // Companion module payloads are already checked by the module resolver.
    const result = {};
    const document = record(handle.document);
    const target = record(ownProp(document, 'target'));
    const kind = handle.artifactKind === 'locale' ? stringProp(target, 'kind') : 'definition';
    // Companion documents share these target spellings, including Mapping.definitionRef.
    const url = componentTargetUrl(document);
    if (!url)
        return result;
    const locales = handlesByKind(context.handles, 'locale').filter((locale) => {
        const localeTarget = record(ownProp(record(locale.document), 'target'));
        return locale !== handle
            && stringProp(localeTarget, 'kind') === kind
            && stringProp(localeTarget, 'url') === url;
    }).map((locale) => locale.document);
    if (locales.length > 0)
        result.localeDocuments = locales;
    if (kind === 'screener') {
        const screener = exactlyOne(handlesByKind(context.handles, 'screener').filter((entry) => handleUrlMatches(entry, url)));
        if (screener)
            result.screenerDocument = screener.document;
        return result;
    }
    if (kind !== 'definition')
        return result;
    const definition = exactlyOne(handlesByKind(context.handles, 'definition').filter((entry) => handleUrlMatches(entry, url)));
    if (!definition)
        return result;
    result.definitionDocument = definition.document;
    const theme = exactlyOne(handlesByKind(context.handles, 'theme').filter((entry) => componentTargetUrl(record(entry.document)) === url));
    if (theme)
        result.themeDocument = theme.document;
    const components = handlesByKind(context.handles, 'component')
        .filter((entry) => componentTargetUrl(record(entry.document)) === url)
        .map((entry) => entry.document);
    if (components.length > 0)
        result.componentDocuments = components;
    return result;
}
// Surface and Experience keep their native rule owners until fs-drn5 reconciles them.
// dataSources and appManifest have no document lint pass. E605 remains native too:
// never pass bundleComponentDocuments, which would duplicate the Component identity check.
const LINTED_KINDS = new Set([
    'definition', 'theme', 'component', 'locale', 'screener',
    'responseActions', 'mapping', 'ontology', 'references', 'registry',
]);
/** Lint every supported loaded document, even when its declared target cannot be resolved. */
export function documentLintValidator(lint, { resolveMappingSourceContext } = {}) {
    const validate = (context) => context.handles
        .filter((handle) => handle.status === 'loaded')
        .flatMap((handle) => {
        if (handle.artifactKind === 'dataSources')
            return responseProjectionDiagnostics(lint, context, handle);
        if (!LINTED_KINDS.has(handle.artifactKind))
            return [];
        const lintContext = lintContextFor(context, handle);
        if (handle.artifactKind === 'mapping') {
            const sourceContext = resolveMappingSourceContext?.(handle, context);
            if (sourceContext !== undefined)
                lintContext.mappingSourceContext = sourceContext;
        }
        const diagnostics = documentLintDiagnostics(lint, handle, lintContext);
        return handle.artifactKind === 'definition'
            ? diagnostics.concat(responseProjectionDiagnostics(lint, context, handle))
            : diagnostics;
    });
    return Object.assign(validate, { checksResponseProjections: true });
}
