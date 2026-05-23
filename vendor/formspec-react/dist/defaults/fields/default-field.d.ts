import type { FieldComponentProps } from '../../component-map';
/**
 * Default field renderer — works for any field type.
 * Renders semantic HTML with ARIA attributes, theme-resolved classes,
 * onBlur touch behavior, and touch-gated error display.
 * Override per component type via the `components.fields` map.
 */
export declare function DefaultField({ field, node }: FieldComponentProps): import("react/jsx-runtime").JSX.Element;
