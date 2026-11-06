/** @filedesc Exact JSON numeric leaves, detached copies, and scalar-aware equality. */
import type { JsonRecord } from './interfaces.js';
/** Immutable JSON.rawJSON numeric leaf; JSON.stringify emits its digits without quotes. */
export type ExactJsonNumber = {
    readonly rawJSON: string;
};
export declare function isRawJson(value: unknown): value is {
    readonly rawJSON: string;
};
/** Return a number's exact text; strings and ordinary lookalike objects are not numbers. */
export declare function jsonNumberText(value: unknown): string | undefined;
/** Parse numeric input without sending significant digits through a JavaScript number. */
export declare function parseJsonNumber(text: string): number | ExactJsonNumber;
/** Text for DOM controls and labels, including exact numeric primitives. */
export declare function jsonValueText(value: unknown): string;
export declare function isJsonRecord(value: unknown): value is JsonRecord;
/** Preserve immutable raw primitives while detaching their surrounding containers. */
export declare function cloneValue<T>(value: T): T;
export declare function deepEqual(left: unknown, right: unknown): boolean;
