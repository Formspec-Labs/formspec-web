import { type DraftReviewPlan, type SurfaceDiagnosticSite, type WidgetDataDelivery } from '@formspec-org/surface';
import { type LocaleDocument } from '@formspec-org/types';
import type { DraftSession } from './draft-session.js';
type DraftReviewFailure = Extract<DraftReviewPlan, {
    status: 'unresolved';
}>['reason'] | 'absent' | 'denied' | 'version-mismatch' | 'unavailable' | 'save-failed' | 'response-invalid' | 'presentation-invalid';
export type DraftReviewDelivery = Extract<WidgetDataDelivery, {
    status: 'ready';
}> | (Extract<WidgetDataDelivery, {
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
