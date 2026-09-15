/** @filedesc Host FEL extension functions (Core §3.12) registered on an engine and handed to WASM. */
import { wasmCheckFELExtensionName } from './wasm-bridge-runtime.js';
/**
 * One engine's extension functions, in the shape Rust's evaluator calls (`FelExtensionHost`).
 *
 * Registration checks the name in Rust (built-ins and reserved words are refused). Rust
 * keeps arity checks, null propagation, and a throw becoming an author diagnostic; this
 * adapter only looks up and invokes, with arguments and results as JSON text.
 */
export class FelExtensionFunctions {
    constructor() {
        this.functions = new Map();
    }
    /** Registers `name`, replacing an earlier registration; throws for a FEL built-in or reserved word. */
    register(name, registration) {
        wasmCheckFELExtensionName(name);
        this.functions.set(name, { ...registration });
    }
    arity(name) {
        const registration = this.functions.get(name);
        return registration && { minArgs: registration.minArgs ?? 0, maxArgs: registration.maxArgs };
    }
    invoke(name, argsJson) {
        const registration = this.functions.get(name);
        if (!registration) {
            throw new Error(`extension '${name}' is not registered`);
        }
        return JSON.stringify(registration.implementation(...JSON.parse(argsJson)) ?? null);
    }
}
