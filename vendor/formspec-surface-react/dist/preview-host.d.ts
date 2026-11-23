import { type BundleExport, type DataSourcePayloadValidator, type SurfaceDefinitionComponentResolver, type SurfaceScenarioSchemaValidator } from '@formspec-org/surface';
import { type PreviewFilingStore, type PreviewFilingStoreOptions } from './browser-draft-port.js';
import type { SurfacePreviewEdition } from './BrowserSurfaceApp.js';
export declare function createSurfacePreviewEdition(input: {
    scope: string;
    source: BundleExport;
    scenario?: unknown;
    profileId?: string;
    databaseName?: string;
    sessionGeneration?: string | number;
    validateSchema?: SurfaceScenarioSchemaValidator;
    validatePayload?: (request: Pick<Parameters<DataSourcePayloadValidator>[0], 'schema' | 'value'>) => ReturnType<DataSourcePayloadValidator>;
    resolveDefinitionComponent?: SurfaceDefinitionComponentResolver;
    createFilingStore?: (options: PreviewFilingStoreOptions) => PreviewFilingStore;
}): Promise<SurfacePreviewEdition>;
