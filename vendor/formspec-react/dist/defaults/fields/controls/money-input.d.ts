import type { CommonInputProps } from '../field-control-types';
import { formatMoneyDisplay, normalizeMoneyInput } from './currency-format';
export { formatMoneyDisplay, normalizeMoneyInput };
export declare function MoneyInputControl({ field, node, common, isReadonly, placeholder: resolvedPlaceholder, }: CommonInputProps & {
    placeholder?: string;
}): import("react/jsx-runtime").JSX.Element;
