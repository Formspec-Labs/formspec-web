/** @filedesc Runtime JSON admission and detached metadata for host instance sources. */
import type { InstanceSourceResult, JsonValue } from '../interfaces.js';
export declare function sourceErrorMessage(error: unknown): string;
export declare function freezeSourceMetadata<T>(value: T): T;
/** Copy an acyclic JSON tree without invoking accessors or accepting non-JSON objects. */
export declare function cloneSourceJson(value: unknown, ancestors?: Set<object>): JsonValue;
export declare function readSourceResult(value: unknown): InstanceSourceResult;
