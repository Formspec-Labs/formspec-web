'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** @filedesc Default field dispatcher — layout chrome + per-component control routing. */
import { useMemo } from 'react';
import { useFormspecContext, findItemByKey } from '../../context';
import { GroupControl } from './group-control';
import { renderControl } from './render-control';
import { needTraceAttrs, projectionMetadataAttrs } from '../../projection-metadata.js';
import { useSemanticFieldControl } from '../../use-semantic-field-control.js';
/** Definition item `prefix`/`suffix` (core §4.2.3) for the field at instance `path`. */
function itemAdornments(engine, path) {
    const item = findItemByKey(engine.getDefinition().items ?? [], path);
    return { prefix: item?.prefix, suffix: item?.suffix };
}
/**
 * Default field renderer — works for any field type.
 * Renders semantic HTML with ARIA attributes, theme-resolved classes,
 * onBlur touch behavior, and touch-gated error display.
 * Override per component type via the `components.fields` map.
 */
export function DefaultField({ field, node }) {
    const isProtected = !field.visible && field.disabledDisplay === 'protected';
    const isReadonly = field.readonly || isProtected;
    useSemanticFieldControl(field, isReadonly);
    const showError = !!(field.error && field.touched);
    const themeClass = node.cssClasses?.join(' ') || '';
    const graphAttrs = projectionMetadataAttrs(node);
    const { engine, registryEntries, resolveFieldHelp, admitFieldHelpUri, fieldHelpLabel, } = useFormspecContext();
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
    const authoredNeedAnchors = node.needAnchors ?? [];
    const labelNeedAttrs = needTraceAttrs([
        ...authoredNeedAnchors,
        ...field.labelNeedAnchors,
    ]);
    const hintNeedAttrs = needTraceAttrs([
        ...authoredNeedAnchors,
        ...field.hintNeedAnchors,
    ]);
    const descriptionNeedAttrs = needTraceAttrs([
        ...authoredNeedAnchors,
        ...field.descriptionNeedAnchors,
    ]);
    const descId = `${field.id}-desc`;
    const descriptionNode = field.description ? (_jsx("div", { id: descId, className: "formspec-description", ...descriptionNeedAttrs, children: field.description })) : null;
    const hintNode = field.hint ? (_jsx("p", { id: `${field.id}-hint`, className: "formspec-hint", ...hintNeedAttrs, children: field.hint })) : null;
    const humanReferences = resolveFieldHelp?.(field.path) ?? [];
    const helpNeedAnchors = humanReferences.flatMap((reference) => reference.needAnchors);
    const helpNode = humanReferences.length > 0 ? (_jsxs("details", { className: "formspec-field-help", ...needTraceAttrs(helpNeedAnchors), children: [_jsx("summary", { className: "formspec-field-help-summary", children: fieldHelpLabel }), _jsx("div", { className: "formspec-field-help-content", children: humanReferences.map((reference, index) => {
                    const href = reference.uri
                        ? admitFieldHelpUri(reference.uri)
                        : undefined;
                    return (_jsxs("article", { className: "formspec-field-help-reference", ...needTraceAttrs(reference.needAnchors), children: [_jsx("h4", { className: "formspec-field-help-title", children: href ? (_jsx("a", { href: href, children: reference.title })) : reference.title }), reference.description ? _jsx("p", { children: reference.description }) : null, reference.content ? _jsx("p", { children: reference.content }) : null] }, reference.id ?? `${reference.title}:${index}`));
                }) })] })) : null;
    // Supplementary text ids, plus the error id while an error is shown (USWDS validation pattern:
    // the control's aria-describedby names its error message). Parity with webcomponent bindSharedFieldEffects.
    const errorId = `${field.id}-error`;
    const describedBy = [
        field.description ? descId : '',
        field.hint ? `${field.id}-hint` : '',
        showError ? errorId : '',
    ].filter(Boolean).join(' ') || undefined;
    const errorNode = (_jsx("p", { id: errorId, className: "formspec-error", "aria-live": "polite", children: showError ? field.error : '' }));
    const requiredNode = field.required ? (_jsx("abbr", { className: "formspec-required usa-label--required", title: "required", children: " *" })) : null;
    if (node.component === 'Toggle') {
        const onLabel = node.props?.onLabel;
        const offLabel = node.props?.offLabel;
        const hasToggleLabels = onLabel || offLabel;
        const checkboxInput = (_jsx("input", { id: field.id, type: "checkbox", className: "formspec-input", role: "switch", checked: !!field.value, onChange: isReadonly ? undefined : (e) => field.setValue(e.target.checked), onBlur: () => field.touch(), disabled: isReadonly, "aria-invalid": showError, "aria-required": field.required || undefined, ...(describedBy ? { 'aria-describedby': describedBy } : {}) }));
        return (_jsxs("div", { className: `formspec-field formspec-field--inline formspec-field--toggle ${isProtected ? 'formspec-protected' : ''} ${themeClass}`.trim(), style: node.style, "data-name": field.path, ...graphAttrs, children: [_jsxs("label", { htmlFor: field.id, className: "formspec-label", ...labelNeedAttrs, children: [field.label, requiredNode] }), descriptionNode, hintNode, helpNode, _jsxs("div", { className: `formspec-toggle${field.value ? ' formspec-toggle--on' : ''}`.trim(), children: [hasToggleLabels && (_jsx("span", { className: "formspec-toggle-label formspec-toggle-off", "aria-hidden": "true", children: offLabel })), checkboxInput, hasToggleLabels && (_jsx("span", { className: "formspec-toggle-label formspec-toggle-on", "aria-hidden": "true", children: onLabel }))] }), errorNode] }));
    }
    if (node.component === 'RadioGroup' || node.component === 'CheckboxGroup') {
        const labelId = `${field.id}-label`;
        const labelHidden = node.labelPosition === 'hidden';
        // A checkbox `group` has no aria-required (WAI-ARIA 1.2): the legend says "required" in place of the asterisk.
        const legendRequiredNode = node.component === 'CheckboxGroup' && field.required ? (_jsxs(_Fragment, { children: [_jsx("abbr", { className: "formspec-required usa-label--required", title: "required", "aria-hidden": "true", children: " *" }), _jsx("span", { className: "formspec-sr-only usa-sr-only", children: " required" })] })) : requiredNode;
        return (_jsxs("fieldset", { className: [`formspec-fieldset`, isProtected ? 'formspec-protected' : '', themeClass].filter(Boolean).join(' ').trim(), style: node.style, "data-name": field.path, ...graphAttrs, children: [_jsxs("legend", { id: labelId, className: labelHidden ? 'formspec-legend formspec-sr-only' : 'formspec-legend', ...labelNeedAttrs, children: [field.label, legendRequiredNode] }), descriptionNode, hintNode, helpNode, _jsx(GroupControl, { field: field, node: node, isReadonly: isReadonly, invalid: showError, labelId: labelId, describedBy: describedBy }), errorNode] }));
    }
    const controlSurfaceClass = node.component === 'Slider' ? 'formspec-slider'
        : node.component === 'Rating' ? 'formspec-rating'
            : node.component === 'FileUpload' ? 'formspec-file-upload'
                : '';
    return (_jsxs("div", { className: [`formspec-field`, isProtected ? 'formspec-protected' : '', themeClass, controlSurfaceClass].filter(Boolean).join(' ').trim(), style: node.style, "data-name": field.path, ...graphAttrs, ...(node.accessibility?.role ? { role: node.accessibility.role } : {}), ...(node.accessibility?.description ? { 'aria-description': node.accessibility.description } : {}), children: [_jsxs("label", { id: `${field.id}-label`, htmlFor: field.id, className: node.labelPosition === 'hidden' ? 'formspec-label formspec-sr-only' : 'formspec-label', ...labelNeedAttrs, children: [field.label, requiredNode] }), descriptionNode, hintNode, helpNode, renderControl(field, node, describedBy, isProtected, extensionAttrs, resolvePlaceholder, itemAdornments(engine, field.path)), errorNode] }));
}
