/** @filedesc Repeat `seedFrom` sizing and relative field `prePopulate`. */
import type { FormItem } from '@formspec-org/types';
import type { FormFieldValue } from '../interfaces.js';
export type SeedFromGroup = {
    path: string;
    item: FormItem;
    seedFrom: NonNullable<FormItem['seedFrom']>;
};
export declare function collectSeedFromGroups(items: FormItem[], prefix?: string): SeedFromGroup[];
export declare function findRelativeSeedContext(fieldPath: string, seedFromGroups: SeedFromGroup[]): {
    seedFrom: SeedFromGroup['seedFrom'];
    rowIndex: number;
} | null;
/** True when host primary data already sized this repeat. */
export declare function repeatHasHostData(groupPath: string, data: Record<string, unknown>, signals: Record<string, {
    value: FormFieldValue;
}>, minRepeat: number): boolean;
export declare function resolvePrePopulateFromInstance(item: FormItem, fieldPath: string, seedFromGroups: SeedFromGroup[], getInstanceData: (name: string, path?: string) => FormFieldValue, instanceDataRoot: (name: string) => unknown): FormFieldValue | undefined;
