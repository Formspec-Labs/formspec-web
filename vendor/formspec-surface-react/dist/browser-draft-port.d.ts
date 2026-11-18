import type { BrowserDraftPort, DraftKey } from '@formspec-org/surface';
export interface BrowserDraftPortOptions {
    databaseName?: string;
    scope?: string;
    authorize?: (key: DraftKey) => boolean | Promise<boolean>;
}
export declare function createBrowserDraftPort(options?: BrowserDraftPortOptions): BrowserDraftPort;
