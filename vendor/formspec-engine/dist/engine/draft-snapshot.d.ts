/** @filedesc Capture editable field data and repeat arrays for draft persistence. */
import type { FormItem } from '@formspec-org/types';
import type { JsonRecord, JsonValue } from '../interfaces.js';
/** Match the Response data tree, where dependent questions share their scalar parent's object. */
export declare function captureDraftData(items: FormItem[], fieldValue: (path: string) => JsonValue | undefined, repeatCount: (path: string) => number): JsonRecord;
