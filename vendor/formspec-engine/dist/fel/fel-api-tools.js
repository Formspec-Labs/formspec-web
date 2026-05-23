/** @filedesc FEL/registry/lint/changelog helpers backed by tools WASM (`wasm-bridge-tools` only; ADR 0050). */
import { wasmCollectFELRewriteTargets, wasmFindRegistryEntry, wasmGenerateChangelog, wasmLintDocument, wasmListBuiltinFunctions, wasmParseRegistry, wasmPrintFEL, wasmRewriteFelForAssembly, wasmRewriteFELReferences, wasmRewriteMessageTemplate, wasmTokenizeFEL, wasmTryLiftConditionGroup, wasmValidateExtensionUsage, wasmValidateLifecycleTransition, wasmWellKnownRegistryUrl, } from '../wasm-bridge-tools.js';
export const tokenizeFEL = wasmTokenizeFEL;
function mapRewriteEntries(entries, rewrite) {
    if (!rewrite || entries.length === 0)
        return undefined;
    const mapped = {};
    let changed = false;
    for (const entry of entries) {
        const next = rewrite(entry);
        if (next !== entry) {
            mapped[entry] = next;
            changed = true;
        }
    }
    return changed ? mapped : undefined;
}
function mapRewriteNavigationTargets(entries, rewrite) {
    if (!rewrite || entries.length === 0)
        return undefined;
    const mapped = {};
    let changed = false;
    for (const entry of entries) {
        const next = rewrite(entry.name, entry.functionName);
        if (next !== entry.name) {
            mapped[`${entry.functionName}:${entry.name}`] = next;
            changed = true;
        }
    }
    return changed ? mapped : undefined;
}
/** Rewrite FEL references using callback options (bridges to WASM rewrite). */
export function rewriteFELReferences(expression, options) {
    const targets = wasmCollectFELRewriteTargets(expression);
    return wasmRewriteFELReferences(expression, {
        fieldPaths: mapRewriteEntries(targets.fieldPaths, options.rewriteFieldPath),
        currentPaths: mapRewriteEntries(targets.currentPaths, options.rewriteCurrentPath),
        variables: mapRewriteEntries(targets.variables, options.rewriteVariable),
        instanceNames: mapRewriteEntries(targets.instanceNames, options.rewriteInstanceName),
        navigationTargets: mapRewriteNavigationTargets(targets.navigationTargets, options.rewriteNavigationTarget),
    });
}
export const rewriteMessageTemplate = wasmRewriteMessageTemplate;
export const lintDocument = wasmLintDocument;
export const parseRegistry = wasmParseRegistry;
export const findRegistryEntry = wasmFindRegistryEntry;
export const validateLifecycleTransition = wasmValidateLifecycleTransition;
export const wellKnownRegistryUrl = wasmWellKnownRegistryUrl;
export const generateChangelog = wasmGenerateChangelog;
export const printFEL = wasmPrintFEL;
export const tryLiftConditionGroup = wasmTryLiftConditionGroup;
export function getBuiltinFELFunctionCatalog() {
    return wasmListBuiltinFunctions();
}
export function validateExtensionUsage(items, options) {
    const names = new Set();
    collectExtensionNames(items, names);
    const registryEntries = {};
    for (const name of names) {
        const entry = options.resolveEntry(name);
        if (entry) {
            registryEntries[name] = entry;
        }
    }
    return wasmValidateExtensionUsage(items, registryEntries);
}
export function createSchemaValidator(_schemas) {
    return {
        validate(document, documentType) {
            const result = lintDocument(document);
            return {
                documentType: (documentType ?? result.documentType ?? null),
                errors: (result.diagnostics ?? [])
                    .filter((diag) => diag?.severity === 'error')
                    .map((diag) => ({
                    path: typeof diag.path === 'string' ? diag.path : '$',
                    message: typeof diag.message === 'string' ? diag.message : 'Schema validation failed',
                    raw: diag,
                })),
            };
        },
    };
}
export function rewriteFEL(expression, map) {
    return wasmRewriteFelForAssembly(expression, JSON.stringify({
        fragmentRootKey: map.fragmentRootKey,
        hostGroupKey: map.hostGroupKey,
        importedKeys: [...map.importedKeys],
        keyPrefix: map.keyPrefix,
    }));
}
function collectExtensionNames(items, names) {
    for (const item of items) {
        for (const [name, enabled] of Object.entries(item?.extensions ?? {})) {
            if (enabled !== false) {
                names.add(name);
            }
        }
        if (Array.isArray(item?.children)) {
            collectExtensionNames(item.children, names);
        }
    }
}
