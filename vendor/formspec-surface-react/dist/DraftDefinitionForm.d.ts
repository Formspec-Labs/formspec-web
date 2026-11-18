/** @filedesc Open, resume and explicitly restart the native Surface form's draft. */
import { type ReactNode } from 'react';
import type { IFormEngine } from '@formspec-org/engine';
import { type DraftSession } from './draft-session.js';
import type { DraftWriter } from './draft-writer.js';
import type { SurfaceDefinitionFormRenderInput } from './SurfaceSlot.js';
export declare function DraftDefinitionForm({ input, session, children, }: {
    input: SurfaceDefinitionFormRenderInput;
    session: DraftSession;
    children: (engine: IFormEngine, writer: DraftWriter) => ReactNode;
}): import("react/jsx-runtime").JSX.Element;
