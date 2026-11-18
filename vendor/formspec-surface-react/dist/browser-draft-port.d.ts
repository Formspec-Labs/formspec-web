import { type BrowserDraftPort, type DataSourceCatalogHandle, type DraftKey, type ResponseFixtures, type ResponseRecordTools } from '@formspec-org/surface';
import type { DispositionAuthority, FormDefinition, ResponseSelectionRequest, ResponseSelector } from '@formspec-org/types';
import type { SurfaceDraftFence } from './draft-writer.js';
export interface PreviewFilingStoreOptions {
    scope: string;
    definitions: ReadonlyMap<string, FormDefinition>;
    fixtures?: ResponseFixtures;
    catalogs?: readonly DataSourceCatalogHandle[] | undefined;
    /**
     * A selection check authorizes the requested subject space before lookup,
     * including when it contains no records. Other checks use the filing key.
     */
    authorize?: (key: DraftKey, relation: 'read' | 'resume' | 'send', selection?: ResponseSelectionRequest) => boolean | Promise<boolean>;
}
export interface BrowserFilingStoreOptions extends PreviewFilingStoreOptions {
    databaseName?: string;
}
export type PreviewFilingSubmitResult = {
    status: 'filed';
    receiptRef: string;
    label: 'preview filing; nothing was sent';
} | {
    status: 'denied' | 'unavailable' | 'conflict' | 'invalid-response' | 'duplicate-response';
};
export interface PreviewFilingStore {
    drafts: BrowserDraftPort;
    responses: ResponseSelector & DispositionAuthority;
    submit(fence: Readonly<SurfaceDraftFence>, responseJson: string): Promise<PreviewFilingSubmitResult>;
}
export declare function previewResponseRecordTools(): Promise<ResponseRecordTools>;
export declare function createBrowserFilingStore(options: BrowserFilingStoreOptions): PreviewFilingStore;
export declare function createMemoryFilingStore(options: PreviewFilingStoreOptions): PreviewFilingStore;
