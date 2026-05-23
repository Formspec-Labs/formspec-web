import type { FieldComponentProps } from '../../component-map';
/** Renders radio/checkbox group options (ARIA matches default web component adapter). */
export declare function GroupControl({ field, node, isReadonly, labelId, groupSupplementaryDescribedBy, }: {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    isReadonly: boolean;
    labelId: string;
    groupSupplementaryDescribedBy: string | undefined;
}): import("react/jsx-runtime").JSX.Element;
