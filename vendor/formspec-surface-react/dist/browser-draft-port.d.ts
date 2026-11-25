import { type PageSequenceEntry } from '@formspec-org/layout';
import { type BrowserDraftPort, type DraftStartInput, type DataSourceCatalogHandle, type DraftKey, type PreparedResponseFixtures, type ResponseFixtures, type ResponseRecordTools } from '@formspec-org/surface';
import type { DispositionAuthority, FormDefinition, FormResponse, NewerSelectedResponse, ResponseSelectionRequest, ResponseSelector } from '@formspec-org/types';
import { type DraftDefinitionResponsePort } from './definition-response-reads.js';
import type { SurfaceDraftFence } from './draft-writer.js';
type FilingReference = NewerSelectedResponse & {
    definitionVersion: string;
};
export interface OpeningResponseDependency {
    readonly sourceInstance: string;
    /** Read the exact filed reference attached to the authorized source. A missing reference refuses opening. */
    readonly reference: (source: Readonly<FilingReference & {
        extensions?: FormResponse['extensions'];
    }>) => Readonly<FilingReference> | undefined;
}
export interface PreviewFilingStoreOptions {
    scope: string;
    definitions: ReadonlyMap<string, FormDefinition>;
    fixtures?: ResponseFixtures;
    /** Pre-validated fixture metadata from scenario admission; avoids re-reading raw fixture payloads. */
    preparedFixtures?: PreparedResponseFixtures;
    catalogs?: readonly DataSourceCatalogHandle[] | undefined;
    /** Admitted Definition/Theme/Component section plans precomputed at fixture initialization. */
    sectionPlans?: ((definition: FormDefinition) => readonly (readonly PageSequenceEntry[])[]) | undefined;
    /**
     * A selection check authorizes the requested subject space before lookup,
     * including when it contains no records. Other checks use the filing key.
     */
    /** Delegate the existing open check to the host with the supplied parents. */
    authorizeOpen?: (input: Readonly<DraftStartInput>) => boolean | Promise<boolean>;
    /** By consuming Definition URL and instance. Both instances must select one completed record at open. */
    openingResponseDependencies?: ReadonlyMap<string, ReadonlyMap<string, OpeningResponseDependency>>;
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
    drafts: BrowserDraftPort & Partial<DraftDefinitionResponsePort>;
    responses: ResponseSelector & DispositionAuthority;
    submit(fence: Readonly<SurfaceDraftFence>, responseJson: string): Promise<PreviewFilingSubmitResult>;
    ready(): Promise<void>;
}
export declare function previewResponseRecordTools(): Promise<ResponseRecordTools>;
export declare function createBrowserFilingStore(options: BrowserFilingStoreOptions): PreviewFilingStore;
export declare function createMemoryFilingStore(options: PreviewFilingStoreOptions): PreviewFilingStore;
export {};
