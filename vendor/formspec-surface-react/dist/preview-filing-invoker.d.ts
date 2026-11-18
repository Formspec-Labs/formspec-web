import type { SurfaceScenarioActionOutcome } from '@formspec-org/types';
import type { PreviewFilingStore } from './browser-draft-port.js';
import type { DraftActionInvoker } from './draft-writer.js';
export declare function previewFilingInvoker(submit: PreviewFilingStore['submit'], actionOutcome?: (actionId: string) => SurfaceScenarioActionOutcome): DraftActionInvoker;
