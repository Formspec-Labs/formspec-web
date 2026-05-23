/** @filedesc Standard (non-group) field control switch — dispatches by component type. */
'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ComboboxSelect } from './controls/combobox-select';
import { MoneyInputControl } from './controls/money-input';
import { SliderControl } from './controls/slider';
import { RatingControl } from './controls/rating';
import { SignatureControl } from './controls/signature';
import { FileUploadControl } from './controls/file-upload';
export function renderControl(field, node, describedBy, isProtected = false, extensionAttrs = {}, resolvePlaceholder = (value) => value) {
    const { dataType, id, path, value } = field;
    const isReadonly = field.readonly || isProtected;
    const showError = !!(field.error && field.touched);
    const autoComplete = node.props?.autoComplete || undefined;
    const common = {
        id,
        name: path,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        'aria-invalid': showError,
        'aria-required': field.required,
        required: field.required,
        'aria-disabled': isProtected || undefined,
        onBlur: () => field.touch(),
        autoComplete,
    };
    switch (node.component) {
        case 'Select': {
            const clearable = node.props?.clearable;
            const searchable = node.props?.searchable;
            const multiple = node.props?.multiple;
            const placeholderOpt = resolvePlaceholder(node.props?.placeholder) || 'Select…';
            if (searchable || multiple) {
                return (_jsx(ComboboxSelect, { field: field, node: node, common: { ...common, placeholder: resolvePlaceholder(node.props?.placeholder) }, isReadonly: isReadonly }));
            }
            return (_jsxs("div", { className: "formspec-select-wrapper", children: [_jsxs("select", { ...common, className: "formspec-input formspec-select-native", value: value ?? '', onChange: isReadonly ? undefined : (e) => field.setValue(e.target.value), disabled: isReadonly, children: [_jsx("option", { value: "", disabled: true, hidden: true, children: placeholderOpt }), field.options.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value)))] }), clearable && value && !isReadonly && (_jsx("button", { type: "button", className: "formspec-select-clear", "aria-label": "Clear selection", onClick: () => { field.setValue(null); field.touch(); }, children: _jsx("span", { "aria-hidden": "true", children: "\u00D7" }) }))] }));
        }
        case 'DatePicker': {
            const variant = node.props?.variant;
            // Item 20: minDate/maxDate → native min/max attributes
            const minDate = node.props?.minDate;
            const maxDate = node.props?.maxDate;
            const placeholder = resolvePlaceholder(node.props?.placeholder);
            let inputType = 'date';
            if (variant === 'dateTime' || dataType === 'dateTime')
                inputType = 'datetime-local';
            else if (variant === 'time' || dataType === 'time')
                inputType = 'time';
            return (_jsx("input", { ...common, type: inputType, value: value ?? '', readOnly: isReadonly, placeholder: placeholder, min: minDate, max: maxDate, onChange: isReadonly ? undefined : (e) => field.setValue(e.target.value) }));
        }
        case 'NumberInput': {
            const min = node.props?.min != null ? Number(node.props.min) : undefined;
            const max = node.props?.max != null ? Number(node.props.max) : undefined;
            const step = node.props?.step != null ? Number(node.props.step) : undefined;
            const showStepper = node.props?.showStepper;
            const placeholder = resolvePlaceholder(node.props?.placeholder);
            const numberInput = (_jsx("input", { ...common, type: "number", value: value ?? '', readOnly: isReadonly, placeholder: placeholder, min: min != null ? String(min) : undefined, max: max != null ? String(max) : undefined, step: step != null ? String(step) : undefined, onChange: isReadonly
                    ? undefined
                    : (e) => field.setValue(e.target.value === '' ? null : Number(e.target.value)) }));
            if (showStepper) {
                const stepVal = step ?? 1;
                const numVal = typeof value === 'number' ? value : 0;
                return (_jsxs("div", { className: "formspec-stepper", children: [_jsx("button", { type: "button", className: "formspec-stepper-decrement", "aria-label": `Decrease ${field.label}`, disabled: isReadonly || (min != null && numVal - stepVal < min), onClick: () => { field.setValue(numVal - stepVal); field.touch(); }, children: "\u2212" }), numberInput, _jsx("button", { type: "button", className: "formspec-stepper-increment", "aria-label": `Increase ${field.label}`, disabled: isReadonly || (max != null && numVal + stepVal > max), onClick: () => { field.setValue(numVal + stepVal); field.touch(); }, children: "+" })] }));
            }
            return numberInput;
        }
        case 'FileUpload':
            return _jsx(FileUploadControl, { field: field, node: node, common: common, isReadonly: isReadonly });
        case 'MoneyInput':
            return (_jsx(MoneyInputControl, { field: field, node: node, common: common, isReadonly: isReadonly, placeholder: resolvePlaceholder(node.props?.placeholder) }));
        case 'Slider':
            return _jsx(SliderControl, { field: field, node: node, common: common, isReadonly: isReadonly });
        case 'Rating':
            return (_jsx(RatingControl, { field: field, node: node, isReadonly: isReadonly, supplementaryDescribedBy: describedBy }));
        case 'Signature':
            return _jsx(SignatureControl, { field: field, node: node, supplementaryDescribedBy: describedBy });
        case 'TextInput':
        default: {
            const maxLines = node.props?.maxLines;
            const prefix = node.props?.prefix;
            const suffix = node.props?.suffix;
            const placeholder = node.props?.placeholder;
            const inputMode = node.props?.inputMode;
            const isTextarea = dataType === 'text' || maxLines != null;
            // Item 15: build aria-describedby chain that includes prefix/suffix ids
            const adornmentIds = [
                prefix ? `${id}-prefix` : '',
                suffix ? `${id}-suffix` : '',
            ].filter(Boolean);
            const adornedDescribedBy = adornmentIds.length
                ? [...(describedBy ? [describedBy] : []), ...adornmentIds].join(' ')
                : describedBy;
            const controlProps = {
                ...common,
                'aria-describedby': adornedDescribedBy || undefined,
            };
            const control = isTextarea ? (_jsx("textarea", { ...controlProps, rows: maxLines, placeholder: resolvePlaceholder(placeholder), value: value ?? '', readOnly: isReadonly, maxLength: extensionAttrs.maxLength, onChange: (e) => field.setValue(e.target.value) })) : (_jsx("input", { ...controlProps, type: extensionAttrs.type || 'text', value: value ?? '', readOnly: isReadonly, placeholder: resolvePlaceholder(placeholder), inputMode: (extensionAttrs.inputMode || inputMode), maxLength: extensionAttrs.maxLength, pattern: extensionAttrs.pattern, autoComplete: extensionAttrs.autoComplete || autoComplete, onChange: (e) => field.setValue(e.target.value) }));
            if (prefix || suffix) {
                return (_jsxs("div", { className: "formspec-input-adornment", children: [prefix && _jsx("span", { id: `${id}-prefix`, className: "formspec-input-prefix", children: prefix }), control, suffix && _jsx("span", { id: `${id}-suffix`, className: "formspec-input-suffix", children: suffix })] }));
            }
            return control;
        }
    }
}
