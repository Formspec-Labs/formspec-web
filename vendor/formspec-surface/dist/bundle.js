import { surfaceDiagnostic } from './diagnostics.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function dereferenceBundleExport(bundle) {
    const diagnostics = [];
    const documents = bundle.documents ?? {};
    function lookup(ref, slot) {
        if (!ref)
            return undefined;
        const found = documents[ref.url];
        if (found === undefined) {
            diagnostics.push(surfaceDiagnostic('BUNDLE-DOCUMENT-MISSING', `The release lists a ${slot} at "${ref.url}" and does not contain it.`, { source: ref.url }, { slot }));
            return undefined;
        }
        if (!isRecord(found)) {
            diagnostics.push(surfaceDiagnostic('BUNDLE-DOCUMENT-SHAPE', `The ${slot} at "${ref.url}" is not a document.`, { source: ref.url }, { slot }));
            return undefined;
        }
        return found;
    }
    function lookupAll(refs, slot) {
        return (refs ?? []).flatMap((ref) => {
            const found = lookup(ref, slot);
            return found === undefined ? [] : [found];
        });
    }
    const surfaceRefs = new Map();
    const resolvedSurfaces = (bundle.manifest.surfaces ?? []).flatMap((ref) => {
        const found = lookup(ref, 'Surface');
        if (found === undefined)
            return [];
        surfaceRefs.set(found, ref.url);
        return [{ ref, document: found }];
    });
    const surfaces = resolvedSurfaces.map(({ document }) => document);
    let entrySurface;
    if (bundle.manifest.$formspecBundle === '2.4') {
        const refs = bundle.manifest.surfaces ?? [];
        const selector = bundle.manifest.entrySurface;
        if (selector !== undefined) {
            const manifestMatches = refs.filter((ref) => ref.url === selector).length;
            const loadedMatches = resolvedSurfaces.filter(({ ref }) => ref.url === selector);
            if (manifestMatches === 1 && loadedMatches.length === 1) {
                entrySurface = loadedMatches[0]?.document ?? null;
            }
            else {
                entrySurface = null;
                diagnostics.push(surfaceDiagnostic('APP-ENTRY-SURFACE-UNRESOLVED', `App Manifest entrySurface "${selector}" does not resolve to exactly one manifested and loaded Surface.`, { source: selector }, {
                    reason: 'entry-surface-unresolved',
                    entrySurface: selector,
                    manifestMatches,
                    loadedMatches: loadedMatches.length,
                }));
            }
        }
        else if (refs.length > 1) {
            entrySurface = null;
            diagnostics.push(surfaceDiagnostic('APP-ENTRY-AMBIGUOUS', 'App Manifest 2.4 declares more than one Surface without selecting entrySurface.', {}, {
                reason: 'entry-surface-required',
                surfaceCount: refs.length,
            }));
        }
        else if (refs.length === 1) {
            const soleUrl = refs[0]?.url;
            const loadedMatches = soleUrl === undefined
                ? []
                : resolvedSurfaces.filter(({ ref }) => ref.url === soleUrl);
            if (soleUrl !== undefined && loadedMatches.length === 1) {
                entrySurface = loadedMatches[0]?.document ?? null;
            }
            else {
                entrySurface = null;
                diagnostics.push(surfaceDiagnostic('APP-ENTRY-SURFACE-UNRESOLVED', `App Manifest entry Surface "${soleUrl ?? '<missing>'}" does not resolve to exactly one loaded Surface.`, soleUrl === undefined ? {} : { source: soleUrl }, {
                    reason: 'entry-surface-unresolved',
                    entrySurface: soleUrl,
                    manifestMatches: 1,
                    loadedMatches: loadedMatches.length,
                }));
            }
        }
        else {
            entrySurface = null;
        }
    }
    const experienceRefs = bundle.manifest.experiences ??
        (bundle.manifest.experience ? [bundle.manifest.experience] : []);
    const experienceHandles = experienceRefs.flatMap((ref) => {
        const document = lookup(ref, 'Experience');
        return document === undefined
            ? []
            : [{ experienceRef: ref.url, document }];
    });
    const experiences = experienceHandles.map(({ document }) => document);
    const referenceRefs = [
        ...(bundle.manifest.references ? [bundle.manifest.references] : []),
        ...(bundle.manifest.referenceDocuments ?? []),
    ];
    const references = lookupAll(referenceRefs, 'References document');
    const ontologyRefs = [
        ...(bundle.manifest.ontology ? [bundle.manifest.ontology] : []),
        ...(bundle.manifest.ontologies ?? []),
    ];
    const ontologies = lookupAll(ontologyRefs, 'Ontology document');
    const registries = lookupAll(bundle.manifest.registries, 'Registry');
    const tenantTheme = lookup(bundle.manifest.theme, 'Theme');
    const responseActionRefs = [
        ...(bundle.manifest.responseActions ? [bundle.manifest.responseActions] : []),
        ...(bundle.manifest.responseActionDocuments ?? []),
    ];
    const responseActions = lookupAll(responseActionRefs, 'Response Actions document');
    const dataSources = (bundle.manifest.dataSources ?? []).flatMap((ref) => {
        const document = lookup(ref, 'Data Sources catalog');
        return document === undefined ? [] : [{ catalogRef: ref.url, document }];
    });
    const mappings = (bundle.manifest.mappings ?? []).flatMap((ref) => {
        const document = lookup(ref, 'Mapping document');
        return document === undefined
            ? []
            : [{ mappingRef: ref.handle, artifactRef: ref.url, document }];
    });
    const definitions = new Map();
    for (const ref of bundle.manifest.definitions ?? []) {
        const found = lookup(ref, 'Definition');
        if (found !== undefined)
            definitions.set(ref.url, found);
    }
    return {
        manifest: bundle.manifest,
        title: typeof bundle.manifest.title === 'string' ? bundle.manifest.title : undefined,
        surfaces,
        ...(entrySurface === undefined ? {} : { entrySurface }),
        surfaceRefs,
        experiences,
        experienceHandles,
        tenantTheme,
        references,
        ontologies,
        registries,
        responseActions,
        dataSources,
        mappings,
        definitions,
        diagnostics,
    };
}
/**
 * A bundle is renderable when nothing it *lists* is absent. Structural absence
 * only — this makes no claim about validity or authenticity, returns no
 * verification verdict, and supplies no default. `resolveArtifacts`, the
 * app-graph validator, and the host's verification gate remain separate.
 */
export function bundleIsRenderable(bundle) {
    return !bundle.diagnostics.some((diagnostic) => diagnostic.code === 'BUNDLE-DOCUMENT-MISSING' || diagnostic.code === 'BUNDLE-DOCUMENT-SHAPE');
}
