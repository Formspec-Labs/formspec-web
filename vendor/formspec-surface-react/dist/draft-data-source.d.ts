import { type DataSourceLoader, type DataSourceLoadRequest, type DataSourceLoadResult } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import type { DraftSession } from './draft-session.js';
export declare function readSessionDraft(session: DraftSession, definitions: ReadonlyMap<string, FormDefinition>, request: DataSourceLoadRequest): Promise<DataSourceLoadResult>;
/** Preview can overlay an open draft for an exact same-unit selection. */
export declare function readCurrentDraft(session: DraftSession, definitions: ReadonlyMap<string, FormDefinition>, request: DataSourceLoadRequest, baseline: DataSourceLoader): Promise<DataSourceLoadResult>;
