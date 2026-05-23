import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Renders radio/checkbox group options (ARIA matches default web component adapter). */
export function GroupControl({ field, node, isReadonly, labelId, groupSupplementaryDescribedBy, }) {
    if (node.component === 'RadioGroup') {
        const orientation = node.props?.orientation;
        return (_jsx("div", { className: "formspec-radio-group", role: "radiogroup", "aria-labelledby": labelId, ...(groupSupplementaryDescribedBy ? { 'aria-describedby': groupSupplementaryDescribedBy } : {}), ...(orientation === 'horizontal' ? { 'data-orientation': 'horizontal' } : {}), children: field.options.map((opt) => (_jsxs("label", { children: [_jsx("input", { type: "radio", name: field.path, value: opt.value, checked: field.value === opt.value, disabled: isReadonly, onChange: isReadonly ? undefined : () => { field.setValue(opt.value); field.touch(); } }), ' ', opt.label] }, opt.value))) }));
    }
    const current = Array.isArray(field.value) ? field.value : [];
    const columns = node.props?.columns;
    const selectAll = node.props?.selectAll;
    const allValues = field.options.map(o => o.value);
    const allSelected = allValues.length > 0 && allValues.every(v => current.includes(v));
    const columnStyle = typeof columns === 'string' ? { display: 'grid', gridTemplateColumns: columns } : undefined;
    const dataColumns = typeof columns === 'number' && columns > 1 ? { 'data-columns': String(columns) } : {};
    return (_jsxs("div", { className: "formspec-checkbox-group", role: "group", "aria-labelledby": labelId, ...(groupSupplementaryDescribedBy ? { 'aria-describedby': groupSupplementaryDescribedBy } : {}), style: columnStyle, ...dataColumns, children: [selectAll && (_jsxs("label", { className: "formspec-select-all", "data-select-all": true, children: [_jsx("input", { type: "checkbox", "aria-label": "Select all", checked: allSelected, disabled: isReadonly, onChange: isReadonly ? undefined : (e) => {
                            field.setValue(e.target.checked ? [...allValues] : []);
                            field.touch();
                        } }), "Select all"] })), field.options.map((opt) => (_jsxs("label", { children: [_jsx("input", { type: "checkbox", name: field.path, value: opt.value, checked: current.includes(opt.value), disabled: isReadonly, onChange: isReadonly ? undefined : (e) => {
                            const next = e.target.checked
                                ? [...current, opt.value]
                                : current.filter((v) => v !== opt.value);
                            field.setValue(next);
                            field.touch();
                        } }), ' ', opt.label] }, opt.value)))] }));
}
