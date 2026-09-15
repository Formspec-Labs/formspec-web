import type { SurfaceWidgetProps } from '../widget-api.js';
export interface QueueColumn {
    /** Key into each row object. */
    key: string;
    label: string;
    /** Right-align numeric columns. */
    numeric?: boolean;
}
export type QueueRow = Readonly<Record<string, unknown>>;
export interface QueueTableActionPayloadSelector {
    /** Dot-separated safe path relative to the row. An empty path selects the row. */
    path: string;
}
export type QueueTableActionPayloadConfig = Readonly<Record<string, QueueTableActionPayloadSelector>>;
export interface QueueTableRowActionConfig {
    outputName: string;
    /** Visible column heading for the action controls. */
    columnLabel: string;
    /** Flat named selectors evaluated relative to the selected row. */
    payload?: QueueTableActionPayloadConfig;
    emphasis?: 'primary' | 'secondary' | 'danger';
    pendingLabel?: string;
    successMessage?: string;
    failureMessage?: string;
    'x-generation'?: {
        anchors?: readonly string[];
    };
}
export interface QueueTableConfig {
    columns?: readonly QueueColumn[];
    caption?: string;
    /** Stable row identity. This may differ from the human-readable row header. */
    rowKey?: string;
    /** Which column identifies the row. Defaults to the first column. */
    rowHeaderKey?: string;
    /** Sentence shown when there are no rows. */
    emptyMessage?: string;
    /** One generic action control rendered for each row. */
    rowAction?: QueueTableRowActionConfig;
}
export interface QueueTableData {
    rows?: readonly QueueRow[];
}
export declare function QueueTable({ config, data, slot, actions, emitAction, }: SurfaceWidgetProps): import("react/jsx-runtime").JSX.Element;
