/** @filedesc Numeric control arithmetic using the evaluator's decimal implementation. */
import { type ExactJsonNumber } from './json-values.js';
/** Clamp an entered number without rounding it through binary floating point. */
export declare function clampJsonNumber(value: unknown, min?: unknown, max?: unknown): number | ExactJsonNumber;
/** Step by one authored increment; return undefined when it would cross a bound. */
export declare function stepJsonNumber(value: unknown, step: unknown, direction: -1 | 1, min?: unknown, max?: unknown): number | ExactJsonNumber | undefined;
