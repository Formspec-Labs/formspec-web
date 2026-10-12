/** Generic stable ordering for authored StructuredPanel tables. */
export type StructuredTableOrderKey = {
    path: string;
    kind: 'priority';
    values: readonly string[];
} | {
    path: string;
    kind: 'date-time' | 'string';
    direction: 'asc' | 'desc';
};
/** Missing/invalid values are last in either direction; equal keys retain input order. */
export declare function orderStructuredTableRows<T>(rows: T[], orderBy: unknown, read: (row: T, path: string) => unknown): T[];
