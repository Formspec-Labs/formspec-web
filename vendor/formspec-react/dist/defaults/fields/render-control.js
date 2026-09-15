/** @filedesc Standard (non-group) field control switch — dispatches by component type. */
'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { UI_STRINGS } from '@formspec-org/layout';
import { ComboboxSelect } from './controls/combobox-select';
import { MoneyInputControl } from './controls/money-input';
import { SliderControl } from './controls/slider';
import { RatingControl } from './controls/rating';
import { SignatureControl } from './controls/signature';
import { FileUploadControl } from './controls/file-upload';
import { CharacterCount, characterCountInfoId } from './controls/character-count';
import { needTraceAttrs } from '../../projection-metadata.js';
/**
 * Wrap `control` with prefix/suffix spans when either is set. Span ids (`<id>-prefix`, `<id>-suffix`)
 * must join the control's aria-describedby: see {@link adornedDescribedBy}.
 */
function withAdornments(control, id, { prefix, suffix }) {
    if (!prefix && !suffix)
        return control;
    return (_jsxs("div", { className: "formspec-input-adornment", children: [prefix && _jsx("span", { id: `${id}-prefix`, className: "formspec-input-prefix", children: prefix }), control, suffix && _jsx("span", { id: `${id}-suffix`, className: "formspec-input-suffix", children: suffix })] }));
}
/** Theme `widgetConfig.maxLength` (theme §4.2 TextInput) when it is a positive integer. */
function widgetMaxLength(node) {
    const value = node.presentation?.widgetConfig?.maxLength;
    return Number.isInteger(value) && value > 0 ? value : undefined;
}
function adornedDescribedBy(describedBy, id, { prefix, suffix }) {
    return [describedBy, prefix ? `${id}-prefix` : '', suffix ? `${id}-suffix` : ''].filter(Boolean).join(' ') || undefined;
}
export function renderControl(field, node, describedBy, isProtected = false, extensionAttrs = {}, resolvePlaceholder = (value) => value, itemAdornments = {}) {
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
            const placeholderOpt = resolvePlaceholder(node.props?.placeholder) || UI_STRINGS['select.placeholder'];
            if (searchable || multiple) {
                return (_jsx(ComboboxSelect, { field: field, node: node, common: { ...common, placeholder: resolvePlaceholder(node.props?.placeholder) }, isReadonly: isReadonly }));
            }
            return (_jsxs("div", { className: "formspec-select-wrapper", children: [_jsxs("select", { ...common, className: "formspec-input formspec-select-native", value: value ?? '', onChange: isReadonly ? undefined : (e) => field.setValue(e.target.value), disabled: isReadonly, children: [_jsx("option", { value: "", disabled: true, hidden: true, children: placeholderOpt }), field.options.map((opt) => (_jsx("option", { value: opt.value, ...needTraceAttrs(opt.needAnchors), children: opt.label }, opt.value)))] }), clearable && value && !isReadonly && (_jsx("button", { type: "button", className: "formspec-select-clear", "aria-label": UI_STRINGS['select.clearSelection'], onClick: () => { field.setValue(null); field.touch(); }, children: _jsx("span", { "aria-hidden": "true", children: "\u00D7" }) }))] }));
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
            // Prefix/suffix hug the input; stepper buttons sit outside them.
            const numberInput = withAdornments(_jsx("input", { ...common, "aria-describedby": adornedDescribedBy(describedBy, id, itemAdornments), type: "number", value: value ?? '', readOnly: isReadonly, placeholder: placeholder, min: min != null ? String(min) : undefined, max: max != null ? String(max) : undefined, step: step != null ? String(step) : undefined, onChange: isReadonly
                    ? undefined
                    : (e) => field.setValue(e.target.value === '' ? null : Number(e.target.value)) }), id, itemAdornments);
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
            return (_jsx(RatingControl, { field: field, node: node, isReadonly: isReadonly, describedBy: describedBy }));
        case 'Signature':
            return _jsx(SignatureControl, { field: field, node: node, describedBy: describedBy });
        case 'TextInput':
        default: {
            const maxLines = node.props?.maxLines;
            const placeholder = node.props?.placeholder;
            const inputMode = node.props?.inputMode;
            const isTextarea = dataType === 'text' || maxLines != null;
            // Theme widgetConfig.maxLength is a count display, not a cap; a registry constraint stays a native cap.
            const countLimit = widgetMaxLength(node);
            const maxLength = countLimit === undefined ? extensionAttrs.maxLength : undefined;
            const length = String(value ?? '').length;
            // Component prop wins; else the definition item's prefix/suffix.
            const adornments = {
                prefix: node.props?.prefix ?? itemAdornments.prefix,
                suffix: node.props?.suffix ?? itemAdornments.suffix,
            };
            const controlProps = {
                ...common,
                'aria-describedby': adornedDescribedBy([countLimit !== undefined ? characterCountInfoId(id) : '', describedBy].filter(Boolean).join(' ') || undefined, id, adornments),
                // Invalid while Formspec validation shows an error or the text is over the count limit.
                'aria-invalid': common['aria-invalid'] || (countLimit !== undefined && length > countLimit),
            };
            const control = isTextarea ? (_jsx("textarea", { ...controlProps, rows: maxLines, placeholder: resolvePlaceholder(placeholder), value: value ?? '', readOnly: isReadonly, maxLength: maxLength, onChange: (e) => field.setValue(e.target.value) })) : (_jsx("input", { ...controlProps, type: extensionAttrs.type || 'text', value: value ?? '', readOnly: isReadonly, placeholder: resolvePlaceholder(placeholder), inputMode: (extensionAttrs.inputMode || inputMode), maxLength: maxLength, pattern: extensionAttrs.pattern, autoComplete: extensionAttrs.autoComplete || autoComplete, onChange: (e) => field.setValue(e.target.value) }));
            const adorned = withAdornments(control, id, adornments);
            if (countLimit === undefined)
                return adorned;
            return (_jsxs(_Fragment, { children: [adorned, _jsx(CharacterCount, { fieldId: id, length: length, maxLength: countLimit })] }));
        }
    }
}
