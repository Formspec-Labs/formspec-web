/** @filedesc MoneyInput amount + currency adornment. */
'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { jsonNumberText, jsonValueText } from '@formspec-org/engine';
import { useChromeText } from '../../../use-chrome-text';
import { formatMoneyDisplay, normalizeMoneyInput, toCurrencySymbol, useCurrencyDraft, } from './currency-format';
export { formatMoneyDisplay, normalizeMoneyInput };
/** Round-trip raw canonical decimal text for money amount input (matches web component bind sync). */
function formatMoneyAmountForInput(amount) {
    return jsonValueText(amount);
}
export function MoneyInputControl({ field, node, common, isReadonly, placeholder: resolvedPlaceholder, }) {
    const chrome = useChromeText();
    const currencyCode = (node.props?.currency || 'USD').toUpperCase();
    const currency = toCurrencySymbol(currencyCode);
    const min = node.props?.min != null ? jsonValueText(node.props.min) : undefined;
    const max = node.props?.max != null ? jsonValueText(node.props.max) : undefined;
    const step = node.props?.step != null ? jsonValueText(node.props.step) : undefined;
    const placeholder = resolvedPlaceholder || chrome('money.amount');
    const currencyId = `${field.id}-currency`;
    const rawValue = field.value;
    let amountStr = '';
    if (rawValue != null) {
        if (typeof rawValue === 'object' && rawValue !== null && 'amount' in rawValue) {
            amountStr = formatMoneyAmountForInput(rawValue.amount);
        }
        else if (jsonNumberText(rawValue) !== undefined) {
            amountStr = formatMoneyAmountForInput(rawValue);
        }
    }
    const { displayValue, handleFocus, handleBlur, handleChange } = useCurrencyDraft({
        rawStr: amountStr,
        currencyCode,
        currencySymbol: currency,
        isReadonly,
        onCommit: (amount) => field.setValue(amount === null ? undefined : { amount, currency: currencyCode }),
        onBlur: common.onBlur,
    });
    const moneyDescribedBy = [common['aria-describedby'], currencyId]
        .filter(Boolean)
        .join(' ') || undefined;
    return (_jsxs("div", { className: "formspec-money", children: [_jsx("span", { id: currencyId, className: "formspec-money-currency", children: currency }), _jsx("input", { ...common, type: "text", inputMode: "decimal", pattern: '-?[0-9,]*\\.?[0-9]*', className: "formspec-input formspec-money-amount", name: `${field.path}__amount`, placeholder: placeholder, "aria-describedby": moneyDescribedBy, value: displayValue, readOnly: isReadonly, min: min, max: max, step: step, onFocus: isReadonly ? undefined : handleFocus, onBlur: handleBlur, onChange: isReadonly ? undefined : handleChange })] }));
}
