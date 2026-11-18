import { type FilingDraftObservation, type FilingDraftQuery, type FilingStatusReader, type FilingStatusPlan, type HeadingLevel, type SlotPlan, type SurfaceStrings } from '@formspec-org/surface';
import { type SurfaceRouteTitleResolver } from './title-presentation.js';
type DraftReads = (query: FilingDraftQuery) => FilingDraftObservation | {
    status: 'loading';
};
export interface FilingStatusNavigation {
    navigate: (href: string) => void;
    formatHref?: ((href: string) => string | undefined) | undefined;
    resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
}
export interface FilingStatusOptions extends FilingStatusNavigation {
    readSummaries?: FilingStatusReader | undefined;
    revision?: string | number | undefined;
}
export interface FilingStatusViewContext extends FilingStatusNavigation {
    observe: DraftReads;
}
export declare function useFilingDraftObservations(slots: readonly SlotPlan<unknown>[], readSummaries: FilingStatusReader | undefined, previewScope: string | undefined, revision: string | number | undefined, generation: string | undefined, draftRevision: number | undefined): DraftReads;
export declare function FilingStatus({ plan, context, level, text }: {
    plan: FilingStatusPlan;
    context?: FilingStatusViewContext | undefined;
    level: HeadingLevel;
    text: SurfaceStrings;
}): import("react/jsx-runtime").JSX.Element;
export {};
