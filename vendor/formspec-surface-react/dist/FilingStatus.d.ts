import { type FilingDraftQuery, type FilingStatusObservation, type FilingStatusReader, type FilingStatusPlan, type HeadingLevel, type SlotPlan, type SurfaceStrings } from '@formspec-org/surface';
import { type EffectDataSourcePorts } from './data-source-effect.js';
import { type DataSourceRevisionSelector } from './data-source-revision.js';
import { type SurfaceRouteTitleResolver } from './title-presentation.js';
type Observation = FilingStatusObservation | {
    readonly draft: {
        readonly status: 'loading';
    };
    readonly filing: {
        readonly status: 'unavailable';
    };
};
type DraftReads = (query: FilingDraftQuery) => Observation;
export interface FilingStatusNavigation {
    navigate: (href: string) => void | boolean | Promise<void | boolean>;
    formatHref?: ((href: string) => string | undefined) | undefined;
    resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
}
export interface FilingStatusOptions extends FilingStatusNavigation {
    readSummaries?: FilingStatusReader | undefined;
    revision?: string | number | undefined;
}
export interface FilingStatusViewContext extends Partial<FilingStatusNavigation> {
    observe: DraftReads;
    rosters?: ReadonlyMap<FilingStatusPlan, FilingStatusPlan> | undefined;
}
export declare function useFilingDraftObservations(slots: readonly SlotPlan<unknown>[], readSummaries: FilingStatusReader | undefined, previewScope: string | undefined, revision: string | number | undefined, generation: string | undefined, draftRevision: number | undefined, { loader, authorize, validatePayload }: EffectDataSourcePorts, selectRevision: DataSourceRevisionSelector | undefined): {
    observe: DraftReads;
    rosters: ReadonlyMap<FilingStatusPlan, FilingStatusPlan> | undefined;
};
export declare function FilingStatus({ plan: originalPlan, context, level, text }: {
    plan: FilingStatusPlan;
    context?: FilingStatusViewContext | undefined;
    level: HeadingLevel;
    text: SurfaceStrings;
}): import("react/jsx-runtime").JSX.Element;
export {};
