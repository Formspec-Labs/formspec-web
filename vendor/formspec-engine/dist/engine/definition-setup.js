import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { wasmAnalyzeFel, wasmGetFelDependencies, wasmResolveOptionSetsOnDefinition, } from '../wasm-bridge-runtime.js';
import { detectNamedCycle, getScopeAncestors, parentPathOf, resolveRelativeDependency, toBasePath, } from './helpers.js';
export function resolveOptionSetsOnDefinition(definition) {
    return parseJsonExact(wasmResolveOptionSetsOnDefinition(JSON.stringify(definition)));
}
export function validateVariableDefinitionCycles(variableDefs, resolveScope) {
    const scopes = new Map();
    for (const definition of variableDefs) {
        const scope = resolveScope(definition.scope);
        if (!scopes.has(scope))
            scopes.set(scope, new Set());
        scopes.get(scope)?.add(definition.name);
    }
    const graph = new Map();
    for (const definition of variableDefs) {
        const scope = resolveScope(definition.scope);
        const visible = ['#', ...getScopeAncestors(scope)].reverse();
        const deps = new Set();
        for (const name of wasmAnalyzeFel(definition.expression).variables) {
            const declaration = visible.find(path => scopes.get(path)?.has(name));
            if (declaration)
                deps.add(`${declaration}:${name}`);
        }
        graph.set(`${scope}:${definition.name}`, deps);
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
