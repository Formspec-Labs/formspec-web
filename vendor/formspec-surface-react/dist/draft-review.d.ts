import { type WarningAcknowledgementGroupView } from '@formspec-org/layout';
import { type DraftReviewPlan, type SurfaceDiagnosticSite, type WidgetDataDelivery } from '@formspec-org/surface';
import { type LocaleDocument } from '@formspec-org/types';
import type { DraftSession, FiledObservation } from './draft-session.js';
type DraftReviewFailure = Extract<DraftReviewPlan, {
    status: 'unresolved';
}>['reason'] | 'initialized' | 'absent' | 'denied' | 'version-mismatch' | 'unavailable' | 'save-failed' | 'response-invalid' | 'presentation-invalid';
export interface DraftReviewValidationSummary {
    readonly toFix: number;
    readonly toCheck: number;
    readonly missing: number;
}
export type DraftReviewReadyDelivery = Extract<WidgetDataDelivery, {
    status: 'ready';
}> & {
    revision: string;
    warningGroups: readonly WarningAcknowledgementGroupView[];
    filing?: FiledObservation | undefined;
    isFiledRecord?: boolean | undefined;
    validationSummary?: DraftReviewValidationSummary | undefined;
};
export type DraftReviewDelivery = DraftReviewReadyDelivery | (Extract<WidgetDataDelivery, {
    status: 'unavailable';
}> & {
    draftReviewReason: DraftReviewFailure;
});
export declare function loadDraftReviewInputs(plan: DraftReviewPlan, { session, site, signal, localeDocuments, activeLocale }: {
    session: DraftSession | undefined;
    site: SurfaceDiagnosticSite;
    signal: AbortSignal;
    localeDocuments: readonly LocaleDocument[] | undefined;
    activeLocale: string | undefined;
}): Promise<DraftReviewDelivery>;
export {};
