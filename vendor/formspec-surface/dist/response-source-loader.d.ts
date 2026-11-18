import type { DataSource, DataSourcesDocument, ResponseSelection, ResponseSelector } from '@formspec-org/types';
import type { DataSourceLoader } from './data-source-loader.js';
export declare function catalogResponseProjection(schema: DataSource['schema'], cardinality: ResponseSelection['cardinality']): string[] | undefined;
/** Match the server's SHA-256 over integrity-canonical JSON for the entire catalog. */
export declare function catalogResponseDigest(catalog: DataSourcesDocument): Promise<string>;
export declare function responseSourceLoader(selector: ResponseSelector): DataSourceLoader;
