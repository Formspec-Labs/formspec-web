/** @filedesc Slider / range input with optional ticks. */
'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SliderControl({ field, node, common, isReadonly }) {
    const minNum = node.props?.min != null ? Number(node.props.min) : 0;
    const minStr = node.props?.min != null ? String(node.props.min) : undefined;
    const maxStr = node.props?.max != null ? String(node.props.max) : undefined;
    const stepStr = node.props?.step != null ? String(node.props.step) : undefined;
    const maxNum = node.props?.max != null ? Number(node.props.max) : undefined;
    const stepNum = node.props?.step != null ? Number(node.props.step) : undefined;
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
    const displayValue = field.value != null ? String(field.value) : String(minNum);
    let datalist = null;
    if (listId) {
        if (customTicks) {
            datalist = (_jsx("datalist", { id: listId, children: customTicks.map(t => _jsx("option", { value: t.value, label: t.label }, t.value)) }));
        }
        else if (showTicks && maxNum != null && stepNum != null && Number.isFinite(minNum)) {
            const opts = [];
            for (let v = minNum; v <= maxNum; v += stepNum) {
                opts.push(_jsx("option", { value: v }, v));
            }
            datalist = _jsx("datalist", { id: listId, children: opts });
        }
        else if (ticksProp === true) {
            datalist = _jsx("datalist", { id: listId });
        }
    }
    return (_jsxs("div", { className: "formspec-slider-track", children: [datalist, _jsx("input", { ...common, type: "range", className: "formspec-input", value: field.value ?? minNum, disabled: isReadonly, min: minStr, max: maxStr, step: stepStr, list: listId, "aria-valuetext": displayValue, onChange: isReadonly ? undefined : (e) => field.setValue(Number(e.target.value)) }), showValue ? _jsx("span", { className: "formspec-slider-value", children: displayValue }) : null] }));
}
