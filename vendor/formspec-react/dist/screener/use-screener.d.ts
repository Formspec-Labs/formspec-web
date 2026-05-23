import type { FormItem } from '@formspec-org/types';
import type { UseScreenerOptions, UseScreenerResult, ScreenerAnswers, ScreenerDocumentInput } from './types';
/**
 * Read the item's data type, supporting both the canonical schema field
 * (`dataType`) and the simplified alias (`type`) from the user-facing API.
 */
declare function itemDataType(item: FormItem & {
    type?: string;
}): string;
/**
 * Read the item's option list, supporting both the canonical schema field
 * (`options`) and the simplified alias (`choices`).
 */
declare function itemOptions(item: FormItem & {
    choices?: FormItem['options'];
}): NonNullable<FormItem['options']>;
/**
 * Determine whether a screener item is required.
 * Checks the item's own `required` flag first, then falls back to
 * `screener.binds` (the canonical location in the definition schema).
 * FEL expressions in the `required` bind are evaluated against the
 * current answers using the engine's FEL evaluator.
 */
export declare function isItemRequired(item: FormItem, screener: ScreenerDocumentInput | null | undefined, answers: ScreenerAnswers): boolean;
export declare function useScreener(options?: UseScreenerOptions): UseScreenerResult;
export { itemDataType, itemOptions };
