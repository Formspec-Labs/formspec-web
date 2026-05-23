/** @filedesc FormspecScreener — standalone eligibility gate component. */
import React from 'react';
import type { UseScreenerOptions, ScreenerRoute } from './types';
export interface FormspecScreenerProps extends UseScreenerOptions {
    /** Render prop for the external route result. */
    renderExternalRoute?: (route: ScreenerRoute) => React.ReactNode;
    /** Render prop for the "no match" result. */
    renderNoMatch?: () => React.ReactNode;
    /** CSS className on the root container. */
    className?: string;
}
export declare function FormspecScreener({ screenerDocument, renderExternalRoute, renderNoMatch, className, ...options }: FormspecScreenerProps): import("react/jsx-runtime").JSX.Element | null;
