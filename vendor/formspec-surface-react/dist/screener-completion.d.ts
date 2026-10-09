import { type FormspecScreenerProps, type ScreenerCompletionDisposition } from '@formspec-org/react';
import type { SurfaceWidgetRouteContext } from './widget-api.js';
/** Browser observations are diagnostic. Hosts load their own selected publication and use trusted time. */
export interface SurfaceScreenerCompletionRequest {
    completionId: string;
    selectionKey: string;
    document: NonNullable<FormspecScreenerProps['screenerDocument']>;
    screenerRef: {
        url: string;
        version: string;
    };
    determination: Parameters<NonNullable<FormspecScreenerProps['onDetermination']>>[0];
    answers: Parameters<NonNullable<FormspecScreenerProps['onDetermination']>>[1];
    evaluationTime: string;
    allowedTargets: readonly string[];
    target: string;
    route: SurfaceWidgetRouteContext;
    slotId: string;
    runtimeGeneration?: string | undefined;
    visitId?: string | undefined;
    signal: AbortSignal;
}
/** Acceptance confirms durable host acceptance of the exact attempted target. */
export type SurfaceScreenerCompletion = (request: SurfaceScreenerCompletionRequest) => ScreenerCompletionDisposition | Promise<ScreenerCompletionDisposition>;
export type SurfaceScreenerCompletionPolicy = {
    mode: 'stateless';
} | {
    mode: 'host-required';
    selectionKey: string;
    complete?: SurfaceScreenerCompletion | undefined;
};
export interface NativeScreenerSlotProps {
    document: SurfaceScreenerCompletionRequest['document'];
    screenerRef: SurfaceScreenerCompletionRequest['screenerRef'];
    allowedTargets: readonly string[];
    route: SurfaceWidgetRouteContext;
    slotId: string;
    runtimeGeneration?: string | undefined;
    visitId?: string | undefined;
    policy?: SurfaceScreenerCompletionPolicy | undefined;
    localeDocuments?: FormspecScreenerProps['localeDocuments'];
    activeLocale?: string | undefined;
    checkTarget?: ((target: string) => ScreenerCompletionDisposition) | undefined;
    navigate?: ((target: string) => ScreenerCompletionDisposition) | undefined;
}
/** Keep answer state mounted across Locale and host port replacement. */
export declare function NativeScreenerSlot(props: NativeScreenerSlotProps): import("react/jsx-runtime").JSX.Element;
