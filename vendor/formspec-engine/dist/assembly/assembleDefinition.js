/** @filedesc Resolve $ref fragments and assemble a FormDefinition via WASM. */
import { cloneValue } from '../engine/helpers.js';
import { initWasmTools, isWasmToolsReady, wasmAssembleDefinition } from '../wasm-bridge-tools.js';
function parseRef(ref) {
    let remainder = ref;
    let fragment;
    const hashIdx = remainder.indexOf('#');
    if (hashIdx !== -1) {
        fragment = remainder.slice(hashIdx + 1);
        remainder = remainder.slice(0, hashIdx);
    }
    const pipeIndex = remainder.indexOf('|');
    if (pipeIndex === -1) {
        return { url: remainder, fragment };
    }
    return {
        url: remainder.slice(0, pipeIndex),
        version: remainder.slice(pipeIndex + 1),
        fragment,
    };
}
function collectRefs(node, refs) {
    if (!node || typeof node !== 'object') {
        return;
    }
    if (Array.isArray(node)) {
        for (const entry of node) {
            collectRefs(entry, refs);
        }
        return;
    }
    const object = node;
    if (typeof object.$ref === 'string') {
        refs.add(object.$ref);
    }
    for (const value of Object.values(object)) {
        collectRefs(value, refs);
    }
}
async function collectResolvedFragmentsAsync(definition, resolver) {
    const fragments = {};
    const visiting = new Set();
    const visit = async (node) => {
        const refs = new Set();
        collectRefs(node, refs);
        for (const refUri of refs) {
            const { url, version } = parseRef(refUri);
            const cacheKey = version ? `${url}|${version}` : url;
            if (cacheKey in fragments || visiting.has(cacheKey)) {
                continue;
            }
            visiting.add(cacheKey);
            const resolved = cloneValue(await resolver(url, version));
            fragments[cacheKey] = resolved;
            if (!(url in fragments)) {
                fragments[url] = resolved;
            }
            await visit(resolved);
            visiting.delete(cacheKey);
        }
    };
    await visit(definition);
    return fragments;
}
function collectResolvedFragmentsSync(definition, resolver) {
    const fragments = {};
    const visiting = new Set();
    const visit = (node) => {
        const refs = new Set();
        collectRefs(node, refs);
        for (const refUri of refs) {
            const { url, version } = parseRef(refUri);
            const cacheKey = version ? `${url}|${version}` : url;
            if (cacheKey in fragments || visiting.has(cacheKey)) {
                continue;
            }
            visiting.add(cacheKey);
            const resolved = cloneValue(resolver(url, version));
            fragments[cacheKey] = resolved;
            if (!(url in fragments)) {
                fragments[url] = resolved;
            }
            visit(resolved);
            visiting.delete(cacheKey);
        }
    };
    visit(definition);
    return fragments;
}
async function assembleDefinitionAsyncInternal(definition, resolver) {
    await initWasmTools();
    const fragments = await collectResolvedFragmentsAsync(definition, resolver);
    const result = wasmAssembleDefinition(cloneValue(definition), fragments);
    if (result.errors?.length) {
        throw new Error(result.errors.join('\n'));
    }
    return {
        definition: result.definition,
        assembledFrom: result.assembledFrom ?? [],
    };
}
function assembleDefinitionSyncInternal(definition, resolver) {
    if (!isWasmToolsReady()) {
        throw new Error('assembleDefinitionSync requires tools WASM. Call await initFormspecEngineTools() after await initFormspecEngine(), ' +
            'or use await assembleDefinition() to load tools lazily.');
    }
    const resolveOne = typeof resolver === 'function'
        ? resolver
        : (url, version) => resolver[version ? `${url}|${version}` : url] ?? resolver[url];
    const fragments = collectResolvedFragmentsSync(definition, resolveOne);
    const result = wasmAssembleDefinition(cloneValue(definition), fragments);
    if (result.errors?.length) {
        throw new Error(result.errors.join('\n'));
    }
    return {
        definition: result.definition,
        assembledFrom: result.assembledFrom ?? [],
    };
}
export function assembleDefinitionSync(definition, resolver) {
    return assembleDefinitionSyncInternal(definition, resolver);
}
export async function assembleDefinition(definition, resolver) {
    return assembleDefinitionAsyncInternal(definition, resolver);
}
