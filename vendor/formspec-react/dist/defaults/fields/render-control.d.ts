import type { FieldComponentProps } from '../../component-map';
import type { ExtensionAttrs } from './field-control-types';
export declare function renderControl(field: FieldComponentProps['field'], node: FieldComponentProps['node'], describedBy: string | undefined, isProtected?: boolean, extensionAttrs?: ExtensionAttrs, resolvePlaceholder?: (componentPlaceholder?: string) => string | undefined): import("react/jsx-runtime").JSX.Element;
