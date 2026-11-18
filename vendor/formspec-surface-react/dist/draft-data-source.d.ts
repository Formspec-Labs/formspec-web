/** @filedesc Deliver only committed filtered Response data to authorized draft consumers. */
import type { DataSourceLoadRequest, DataSourceLoadResult } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import type { DraftSession } from './draft-session.js';
type DraftReadSession = Pick<DraftSession, 'readCommitted'>;
export declare function readSessionDraft(session: DraftReadSession, definitions: ReadonlyMap<string, FormDefinition>, request: DataSourceLoadRequest): Promise<DataSourceLoadResult>;
export {};
