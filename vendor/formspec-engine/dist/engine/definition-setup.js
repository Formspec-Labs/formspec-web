import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { wasmAnalyzeFel, wasmGetFelDependencies, wasmResolveOptionSetsOnDefinition, } from '../wasm-bridge-runtime.js';
import { detectNamedCycle, parentPathOf, resolveRelativeDependency, toBasePath, } from './helpers.js';
export function resolveOptionSetsOnDefinition(definition) {
    return parseJsonExact(wasmResolveOptionSetsOnDefinition(JSON.stringify(definition)));
}
export function validateVariableDefinitionCycles(variableDefs) {
    const graph = new Map();
    for (const variableDef of variableDefs) {
        const deps = new Set();
        for (const name of wasmAnalyzeFel(variableDef.expression).variables) {
            deps.add(name);
        }
        graph.set(variableDef.name, deps);
    }
    detectNamedCycle(graph, 'Circular variable dependency');
}
export function validateCalculateBindCycles(bindConfigs) {
    const graph = new Map();
    for (const [path, bind] of Object.entries(bindConfigs)) {
        if (!bind.calculate) {
            continue;
        }
        const deps = new Set();
        const parentPath = parentPathOf(path);
        for (const dep of wasmGetFelDependencies(bind.calculate)) {
            const resolved = resolveRelativeDependency(dep, parentPath, path);
            if (resolved) {
                deps.add(toBasePath(resolved));
            }
        }
        graph.set(path, deps);
    }
    detectNamedCycle(graph, 'Cyclic dependency detected');
}
