import type { FieldComponentProps } from '../../component-map';
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
