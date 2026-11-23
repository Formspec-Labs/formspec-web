/** @filedesc RadioGroup and CheckboxGroup option lists (fieldset children). */
import React from 'react';
import type { FieldComponentProps } from '../../component-map';
/**
 * `readonly` has no effect on radios or checkboxes. While read-only, cancel the click that would change an option
 * (label clicks and keyboard selection dispatch one too) so the DOM keeps its state, and each onChange (which React
 * fires from that click) ignores it: options stay enabled, focusable, and announced read-only, but the value cannot
 * change (core §4.3 Bind `readonly`). Same guard as webcomponent bindSharedFieldEffects.
 */
export declare function blockReadonlyChange(event: React.MouseEvent<HTMLElement>): void;
/**
 * Renders radio/checkbox group options (ARIA matches the webcomponent adapters). A radiogroup carries required,
 * invalid, and read-only state (WAI-ARIA radiogroup supports all three). A checkbox `group` supports neither
 * aria-required nor aria-readonly: it carries aria-invalid, each checkbox aria-readonly, and DefaultField's legend
 * says "required".
 */
export declare function GroupControl({ field, node, isReadonly, invalid, labelId, describedBy, }: {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    isReadonly: boolean;
    invalid: boolean;
    labelId: string;
    describedBy: string | undefined;
}): import("react/jsx-runtime").JSX.Element;
