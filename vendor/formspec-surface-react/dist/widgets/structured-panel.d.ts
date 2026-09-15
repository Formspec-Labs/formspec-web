import type { SurfaceWidgetProps } from '../widget-api.js';
import type { ModuleWidgetEmptyWhen, ModuleWidgetStateViewsConfig } from '../widget-state.js';
interface GeneratedFromNeeds {
    'x-generation'?: {
        anchors?: readonly string[];
    };
}
interface StructuredBlockBase extends GeneratedFromNeeds {
    id: string;
    title?: string;
    emptyMessage?: string;
}
export interface StructuredMetricBlockConfig extends StructuredBlockBase {
    type: 'metric';
    label?: string;
    path: string;
    prefix?: string;
    suffix?: string;
}
export interface StructuredKeyValueItemConfig extends GeneratedFromNeeds {
    id: string;
    label: string;
    path?: string;
    routeParam?: string;
}
export interface StructuredKeyValueBlockConfig extends StructuredBlockBase {
    type: 'key-value';
    items: readonly StructuredKeyValueItemConfig[];
}
export interface StructuredListBlockConfig extends StructuredBlockBase {
    type: 'list';
    path: string;
    itemPath?: string;
    ordered?: boolean;
}
export interface StructuredTableColumnConfig extends GeneratedFromNeeds {
    id: string;
    label: string;
    path: string;
    numeric?: boolean;
}
export interface StructuredTableBlockConfig extends StructuredBlockBase {
    type: 'table';
    path: string;
    caption?: string;
    responsiveMode?: 'stack' | 'scroll';
    columns: readonly StructuredTableColumnConfig[];
    rowAction?: StructuredTableRowActionConfig;
}
export interface StructuredProgressBlockConfig extends StructuredBlockBase {
    type: 'progress';
    label?: string;
    path: string;
    max?: number;
    maxPath?: string;
    suffix?: string;
}
export type StructuredPanelBlockConfig = StructuredMetricBlockConfig | StructuredKeyValueBlockConfig | StructuredListBlockConfig | StructuredTableBlockConfig | StructuredProgressBlockConfig;
export interface StructuredPanelActionConfig extends GeneratedFromNeeds {
    outputName: string;
    order?: number;
    emphasis?: 'primary' | 'secondary' | 'danger';
    payload?: StructuredActionPayloadConfig;
    pendingLabel?: string;
    successMessage?: string;
    failureMessage?: string;
    confirmation?: StructuredActionConfirmationConfig;
}
export interface StructuredActionPayloadSelector {
    /** Dot-separated safe path. An empty path selects the current object. */
    path: string;
}
export type StructuredActionPayloadConfig = Readonly<Record<string, StructuredActionPayloadSelector>>;
export interface StructuredTableRowActionConfig extends GeneratedFromNeeds {
    outputName: string;
    columnLabel: string;
    emphasis?: 'primary' | 'secondary' | 'danger';
    /** Paths are relative to the selected row. */
    payload?: StructuredActionPayloadConfig;
    pendingLabel?: string;
    successMessage?: string;
    failureMessage?: string;
    confirmation?: StructuredActionConfirmationConfig;
}
/** Explicit two-step confirmation for a destructive authored action. */
export interface StructuredActionConfirmationConfig extends GeneratedFromNeeds {
    heading: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
}
export interface StructuredPanelConfig extends GeneratedFromNeeds {
    id?: string;
    eyebrow?: string;
    state?: string;
    title?: string;
    body?: string;
    emptyMessage?: string;
    emptyWhen?: ModuleWidgetEmptyWhen;
    stateViews?: ModuleWidgetStateViewsConfig;
    blocks?: readonly StructuredPanelBlockConfig[];
    actions?: readonly StructuredPanelActionConfig[];
}
/**
 * Reads only own properties through a dot-separated path. Brackets, empty
 * segments, and prototype-bearing names are rejected.
 */
export declare function readStructuredPanelPath(root: unknown, path: unknown): unknown;
export declare function StructuredPanel({ actions, config, data, emitAction, headingLevel, route, slot, semanticOutputScope, }: SurfaceWidgetProps): import("react/jsx-runtime").JSX.Element | null;
export {};
