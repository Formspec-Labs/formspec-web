import { type FormStatusQuery, type FormStatusObservation, type StatusReader, type FormStatusPlan, type HeadingLevel, type SlotPlan, type SurfaceStrings } from '@formspec-org/surface';
import { type EffectDataSourcePorts } from './data-source-effect.js';
import { type DataSourceRevisionSelector } from './data-source-revision.js';
import { type SurfaceRouteTitleResolver } from './title-presentation.js';
type Observation = FormStatusObservation | {
    readonly draft: {
        readonly status: 'loading';
    };
    readonly filing: {
        readonly status: 'unavailable';
    };
};
type DraftReads = (query: FormStatusQuery) => Observation;
export interface FormStatusNavigation {
    navigate: (href: string) => void | boolean | Promise<void | boolean>;
    formatHref?: ((href: string) => string | undefined) | undefined;
    resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
}
export interface FormStatusOptions extends FormStatusNavigation {
    readSummaries?: StatusReader | undefined;
    revision?: string | number | undefined;
}
export interface FormStatusViewContext extends Partial<FormStatusNavigation> {
    observe: DraftReads;
    rosters?: ReadonlyMap<FormStatusPlan, FormStatusPlan> | undefined;
}
export declare function useFormStatusObservations(slots: readonly SlotPlan<unknown>[], readSummaries: StatusReader | undefined, previewScope: string | undefined, revision: string | number | undefined, generation: string | undefined, draftRevision: number | undefined, { loader, authorize, validatePayload }: EffectDataSourcePorts, selectRevision: DataSourceRevisionSelector | undefined): {
    observe: DraftReads;
    rosters: ReadonlyMap<FormStatusPlan, FormStatusPlan> | undefined;
};
export declare function FormStatus({ plan: originalPlan, context, level, text }: {
    plan: FormStatusPlan;
    context?: FormStatusViewContext | undefined;
    level: HeadingLevel;
    text: SurfaceStrings;
}): import("react/jsx-runtime").JSX.Element;
export {};
