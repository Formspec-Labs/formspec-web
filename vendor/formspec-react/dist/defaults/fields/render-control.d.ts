import type { FieldComponentProps } from '../../component-map';
import type { ExtensionAttrs } from './field-control-types';
/** Display-only text before/after an input (definition item `prefix`/`suffix`, core §4.2.3). */
export type InputAdornments = {
    prefix?: string;
    suffix?: string;
};
export declare function renderControl(field: FieldComponentProps['field'], node: FieldComponentProps['node'], describedBy: string | undefined, isProtected?: boolean, extensionAttrs?: ExtensionAttrs, resolvePlaceholder?: (componentPlaceholder?: string) => string | undefined, itemAdornments?: InputAdornments): import("react/jsx-runtime").JSX.Element;
