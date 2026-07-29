import type { SurfaceWidgetProps } from '../widget-api.js';
export interface QueueColumn {
    /** Key into each row object. */
    key: string;
    label: string;
    /** Right-align numeric columns. */
    numeric?: boolean;
}
export type QueueRow = Readonly<Record<string, unknown>>;
export interface QueueTableConfig {
    columns?: readonly QueueColumn[];
    caption?: string;
    /** Which column identifies the row. Defaults to the first column. */
    rowHeaderKey?: string;
    /** Sentence shown when there are no rows. */
    emptyMessage?: string;
}
export interface QueueTableData {
    rows?: readonly QueueRow[];
}
export declare function QueueTable({ config, data, headingLevel, slot }: SurfaceWidgetProps): import("react/jsx-runtime").JSX.Element;
