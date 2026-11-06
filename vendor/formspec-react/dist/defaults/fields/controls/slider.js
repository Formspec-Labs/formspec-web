/** @filedesc Slider / range input with optional ticks. */
'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { jsonValueText } from '@formspec-org/engine';
export function SliderControl({ field, node, common, isReadonly }) {
    const minNum = node.props?.min != null ? Number(jsonValueText(node.props.min)) : 0;
    const minStr = node.props?.min != null ? jsonValueText(node.props.min) : undefined;
    const maxStr = node.props?.max != null ? jsonValueText(node.props.max) : undefined;
    const stepStr = node.props?.step != null ? jsonValueText(node.props.step) : undefined;
    const maxNum = node.props?.max != null ? Number(jsonValueText(node.props.max)) : undefined;
    const stepNum = node.props?.step != null ? Number(jsonValueText(node.props.step)) : undefined;
    const showTicks = node.props?.showTicks === true;
    const ticksProp = node.props?.ticks;
    const showValue = node.props?.showValue !== false;
    const customTicks = Array.isArray(ticksProp) ? ticksProp : null;
    const listId = customTicks && customTicks.length > 0
        ? `${field.id}-ticks`
        : showTicks && maxNum != null && stepNum != null && Number.isFinite(maxNum) && Number.isFinite(stepNum)
            ? `formspec-ticks-${field.path.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
            : ticksProp === true && minStr != null && maxStr != null && stepStr != null
                ? `formspec-ticks-${field.path.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
                : undefined;
    const displayValue = field.value != null ? jsonValueText(field.value) : String(minNum);
    let datalist = null;
    if (listId) {
        if (customTicks) {
            datalist = (_jsx("datalist", { id: listId, children: customTicks.map(t => _jsx("option", { value: jsonValueText(t.value), label: t.label }, jsonValueText(t.value))) }));
        }
        else if (showTicks && maxNum != null && stepNum != null && Number.isFinite(minNum)) {
            const opts = [];
            // Graphical ticks are approximate and bounded; never advance by a step
            // too small to change a binary float in an open-ended loop.
            const count = stepNum > 0 ? Math.floor((maxNum - minNum) / stepNum) + 1 : 0;
            if (count > 0 && count <= 200)
                for (let index = 0; index < count; index++) {
                    const value = minNum + index * stepNum;
                    opts.push(_jsx("option", { value: value }, index));
                }
            datalist = _jsx("datalist", { id: listId, children: opts });
        }
        else if (ticksProp === true) {
            datalist = _jsx("datalist", { id: listId });
        }
    }
    return (_jsxs("div", { className: "formspec-slider-track", children: [datalist, _jsx("input", { ...common, type: "range", className: "formspec-input", value: jsonValueText(field.value ?? minNum), disabled: isReadonly, min: minStr, max: maxStr, step: stepStr, list: listId, "aria-valuetext": displayValue, onChange: isReadonly ? undefined : (e) => field.setValue(e.target.value) }), showValue ? _jsx("span", { className: "formspec-slider-value", children: displayValue }) : null] }));
}
