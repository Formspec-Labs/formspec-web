/** @filedesc Definition constructor helper for resolving option sets. */
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { wasmResolveOptionSetsOnDefinition } from '../wasm-bridge-runtime.js';
export function resolveOptionSetsOnDefinition(definition) {
    return parseJsonExact(wasmResolveOptionSetsOnDefinition(JSON.stringify(definition)));
}
