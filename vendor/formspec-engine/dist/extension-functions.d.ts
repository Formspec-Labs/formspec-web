/** @filedesc Host FEL extension functions (Core §3.12) registered on an engine and handed to WASM. */
import { type FelExtensionHost } from './wasm-bridge-runtime.js';
/** A registered extension: its implementation and optional arity bounds. */
export interface FelExtensionFunctionRegistration {
    /** Pure and total (Core §3.12): receives non-null JSON-like arguments, returns a JSON-like value. */
    implementation: (...args: any[]) => unknown;
    /** Minimum argument count (default 0). */
    minArgs?: number;
    /** Maximum argument count (default unbounded). */
    maxArgs?: number;
}
/**
 * One engine's extension functions, in the shape Rust's evaluator calls (`FelExtensionHost`).
 *
 * Registration checks the name in Rust (built-ins and reserved words are refused). Rust
 * keeps arity checks, null propagation, and a throw becoming an author diagnostic; this
 * adapter only looks up and invokes, with arguments and results as JSON text.
 */
export declare class FelExtensionFunctions implements FelExtensionHost {
    private readonly functions;
    /** Registers `name`, replacing an earlier registration; throws for a FEL built-in or reserved word. */
    register(name: string, registration: FelExtensionFunctionRegistration): void;
    arity(name: string): {
        minArgs: number;
        maxArgs?: number;
    } | undefined;
    invoke(name: string, argsJson: string): string;
}
