import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { needTraceAttrs } from '../../projection-metadata.js';
import { useChromeText } from '../../use-chrome-text';
/**
 * `readonly` has no effect on radios or checkboxes. While read-only, cancel the click that would change an option
 * (label clicks and keyboard selection dispatch one too) so the DOM keeps its state, and each onChange (which React
 * fires from that click) ignores it: options stay enabled, focusable, and announced read-only, but the value cannot
 * change (core §4.3 Bind `readonly`). Same guard as webcomponent bindSharedFieldEffects.
 */
function blockReadonlyChange(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox')) {
        event.preventDefault();
    }
}
/**
 * Renders radio/checkbox group options (ARIA matches the webcomponent adapters). A radiogroup carries required,
 * invalid, and read-only state (WAI-ARIA radiogroup supports all three). A checkbox `group` supports neither
 * aria-required nor aria-readonly: it carries aria-invalid, each checkbox aria-readonly, and DefaultField's legend
 * says "required".
 */
export function GroupControl({ field, node, isReadonly, invalid, labelId, describedBy, }) {
    const chrome = useChromeText();
    const onClickCapture = isReadonly ? blockReadonlyChange : undefined;
    if (node.component === 'RadioGroup') {
        const orientation = node.props?.orientation;
        return (_jsx("div", { className: "formspec-radio-group", role: "radiogroup", "aria-labelledby": labelId, "aria-required": field.required, "aria-invalid": invalid, "aria-readonly": isReadonly, ...(describedBy ? { 'aria-describedby': describedBy } : {}), ...(orientation === 'horizontal' ? { 'data-orientation': 'horizontal' } : {}), onClickCapture: onClickCapture, children: field.options.map((opt) => (_jsxs("label", { ...needTraceAttrs(opt.needAnchors), children: [_jsx("input", { type: "radio", name: field.path, value: opt.value, checked: field.value === opt.value, onChange: () => {
                            if (isReadonly)
                                return;
                            field.setValue(opt.value);
                            field.touch();
                        } }), ' ', opt.label] }, opt.value))) }));
    }
    const current = Array.isArray(field.value) ? field.value : [];
    const columns = node.props?.columns;
    const selectAll = node.props?.selectAll;
    const allValues = field.options.map(o => o.value);
    const allSelected = allValues.length > 0 && allValues.every(v => current.includes(v));
    const columnStyle = typeof columns === 'string' ? { display: 'grid', gridTemplateColumns: columns } : undefined;
    const dataColumns = typeof columns === 'number' && columns > 1 ? { 'data-columns': String(columns) } : {};
    return (_jsxs("div", { className: "formspec-checkbox-group", role: "group", "aria-labelledby": labelId, "aria-invalid": invalid, ...(describedBy ? { 'aria-describedby': describedBy } : {}), style: columnStyle, ...dataColumns, onClickCapture: onClickCapture, children: [selectAll && (_jsxs("label", { className: "formspec-select-all", "data-select-all": true, children: [_jsx("input", { type: "checkbox", "aria-label": chrome('select.selectAll'), "aria-readonly": isReadonly, checked: allSelected, onChange: (e) => {
                            if (isReadonly)
                                return;
                            field.setValue(e.target.checked ? [...allValues] : []);
                            field.touch();
                        } }), chrome('select.selectAll')] })), field.options.map((opt) => (_jsxs("label", { ...needTraceAttrs(opt.needAnchors), children: [_jsx("input", { type: "checkbox", name: field.path, value: opt.value, "aria-readonly": isReadonly, checked: current.includes(opt.value), onChange: (e) => {
                            if (isReadonly)
                                return;
                            const next = e.target.checked
                                ? [...current, opt.value]
                                : current.filter((v) => v !== opt.value);
                            field.setValue(next);
                            field.touch();
                        } }), ' ', opt.label] }, opt.value)))] }));
}
