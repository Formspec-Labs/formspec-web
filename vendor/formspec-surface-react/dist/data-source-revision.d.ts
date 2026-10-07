/** @filedesc Host scheduling hints for qualified Surface data consumers. */
import type { DataSourceLoadRequest } from '@formspec-org/surface';
/**
 * Pure scheduling hint, evaluated on host renders. It grants no authority and
 * starts no subscription. Keep the loading/admission ports stable when using it.
 */
export type DataSourceRevisionSelector = (request: DataSourceLoadRequest) => string | number | undefined;
export declare function selectDataSourceRevisions(requests: readonly DataSourceLoadRequest[], select: DataSourceRevisionSelector | undefined): {
    key: string;
    failures: readonly DataSourceLoadRequest[];
};
