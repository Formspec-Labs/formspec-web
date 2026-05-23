'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Default field dispatcher — layout chrome + per-component control routing. */
import { useMemo } from 'react';
import { useFormspecContext } from '../../context';
import { GroupControl } from './group-control';
import { renderControl } from './render-control';
/**
 * Default field renderer — works for any field type.
 * Renders semantic HTML with ARIA attributes, theme-resolved classes,
 * onBlur touch behavior, and touch-gated error display.
 * Override per component type via the `components.fields` map.
 */
export function DefaultField({ field, node }) {
    const isProtected = !field.visible && field.disabledDisplay === 'protected';
    const isReadonly = field.readonly || isProtected;
    const showError = !!(field.error && field.touched);
    const themeClass = node.cssClasses?.join(' ') || '';
    const { registryEntries } = useFormspecContext();
    const extensionAttrs = useMemo(() => {
        const extensions = node.fieldItem?.extensions;
        if (!extensions || registryEntries.size === 0)
            return {};
        const attrs = {};
        for (const [extName, enabled] of Object.entries(extensions)) {
            if (!enabled)
                continue;
            const entry = registryEntries.get(extName);
            if (!entry)
                continue;
            if (entry.metadata?.inputMode)
                attrs.inputMode = entry.metadata.inputMode;
            if (entry.metadata?.autocomplete)
                attrs.autoComplete = entry.metadata.autocomplete;
            if (entry.constraints?.maxLength != null)
                attrs.maxLength = entry.constraints.maxLength;
            if (entry.constraints?.pattern)
                attrs.pattern = entry.constraints.pattern;
            if (entry.metadata?.placeholder)
                attrs.placeholder = entry.metadata.placeholder;
            if (entry.metadata?.inputType)
                attrs.type = entry.metadata.inputType;
        }
        return attrs;
    }, [node.fieldItem?.extensions, registryEntries]);
    const resolvePlaceholder = (componentPlaceholder) => extensionAttrs.placeholder || componentPlaceholder;
    const descId = `${field.id}-desc`;
    const descriptionNode = field.description ? (_jsx("div", { id: descId, className: "formspec-description", children: field.description })) : null;
    const hintNode = field.hint ? _jsx("p", { id: `${field.id}-hint`, className: "formspec-hint", children: field.hint }) : null;
    const supplementaryDescribedBy = [field.description ? descId : '', field.hint ? `${field.id}-hint` : ''].filter(Boolean).join(' ') || undefined;
    const errorNode = (_jsx("p", { id: `${field.id}-error`, className: "formspec-error", "aria-live": "polite", children: showError ? field.error : '' }));
    const requiredNode = field.required ? (_jsx("abbr", { className: "formspec-required usa-label--required", title: "required", children: " *" })) : null;
    if (node.component === 'Toggle') {
        const onLabel = node.props?.onLabel;
        const offLabel = node.props?.offLabel;
        const hasToggleLabels = onLabel || offLabel;
        const checkboxInput = (_jsx("input", { id: field.id, type: "checkbox", className: "formspec-input", role: "switch", checked: !!field.value, onChange: isReadonly ? undefined : (e) => field.setValue(e.target.checked), onBlur: () => field.touch(), disabled: isReadonly, "aria-invalid": showError, "aria-required": field.required || undefined, ...(supplementaryDescribedBy ? { 'aria-describedby': supplementaryDescribedBy } : {}) }));
        return (_jsxs("div", { className: `formspec-field formspec-field--inline ${isProtected ? 'formspec-protected' : ''} ${themeClass}`.trim(), style: node.style, "data-name": field.path, children: [_jsxs("label", { htmlFor: field.id, className: "formspec-label", children: [field.label, requiredNode] }), descriptionNode, hintNode, _jsxs("div", { className: `formspec-toggle${field.value ? ' formspec-toggle--on' : ''}`.trim(), children: [hasToggleLabels && (_jsx("span", { className: "formspec-toggle-label formspec-toggle-off", "aria-hidden": "true", children: offLabel })), checkboxInput, hasToggleLabels && (_jsx("span", { className: "formspec-toggle-label formspec-toggle-on", "aria-hidden": "true", children: onLabel }))] }), errorNode] }));
    }
    if (node.component === 'RadioGroup' || node.component === 'CheckboxGroup') {
        const labelId = `${field.id}-label`;
        const labelHidden = node.labelPosition === 'hidden';
        const groupSupplementaryDescribedBy = [field.description ? descId : '', field.hint ? `${field.id}-hint` : ''].filter(Boolean).join(' ') || undefined;
        return (_jsxs("fieldset", { className: [`formspec-fieldset`, isProtected ? 'formspec-protected' : '', themeClass].filter(Boolean).join(' ').trim(), style: node.style, "data-name": field.path, children: [_jsxs("legend", { id: labelId, className: labelHidden ? 'formspec-legend formspec-sr-only' : 'formspec-legend', children: [field.label, requiredNode] }), descriptionNode, hintNode, _jsx(GroupControl, { field: field, node: node, isReadonly: isReadonly, labelId: labelId, groupSupplementaryDescribedBy: groupSupplementaryDescribedBy }), errorNode] }));
    }
    const controlSurfaceClass = node.component === 'Slider' ? 'formspec-slider'
        : node.component === 'Rating' ? 'formspec-rating'
            : node.component === 'FileUpload' ? 'formspec-file-upload'
                : '';
    return (_jsxs("div", { className: [`formspec-field`, isProtected ? 'formspec-protected' : '', themeClass, controlSurfaceClass].filter(Boolean).join(' ').trim(), style: node.style, "data-name": field.path, ...(node.accessibility?.role ? { role: node.accessibility.role } : {}), ...(node.accessibility?.description ? { 'aria-description': node.accessibility.description } : {}), children: [_jsxs("label", { htmlFor: field.id, className: node.labelPosition === 'hidden' ? 'formspec-label formspec-sr-only' : 'formspec-label', children: [field.label, requiredNode] }), descriptionNode, hintNode, renderControl(field, node, supplementaryDescribedBy, isProtected, extensionAttrs, resolvePlaceholder), errorNode] }));
}
