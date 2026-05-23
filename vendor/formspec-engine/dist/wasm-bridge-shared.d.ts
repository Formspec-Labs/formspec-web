/** @filedesc Node helpers to resolve sibling `.wasm` bytes when `import.meta.url` is not `file:` (e.g. Vitest). */
export declare const nodeFsModuleName = "node:fs";
export declare const nodeUrlModuleName = "node:url";
export declare const nodePathModuleName = "node:path";
export declare const nodeModuleModuleName = "node:module";
/**
 * Resolve a sibling `.wasm` path for Node `readFileSync`.
 * Vitest/vite-node can rewrite `import.meta.url` to a non-`file:` URL; fall back to the `@formspec-org/engine` package root.
 */
export declare function resolveWasmAssetPathForNode(relativeToThisModule: string): Promise<string>;
