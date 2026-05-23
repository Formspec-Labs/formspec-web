/** @filedesc FormspecForm — auto-renderer that walks LayoutNode tree into React elements. */
import React from 'react';
import type { FormspecProviderProps } from './context';
import type { ScreenerRoute, ScreenerRouteType } from './screener/types';
export interface FormspecFormProps extends Omit<FormspecProviderProps, 'children'> {
    /** Optional className on the root container. */
    className?: string;
    /** Origins allowed to supply `?_issuer=` branding overrides. Empty or absent disables query overrides. */
    issuerAllowedOrigins?: readonly string[];
    /** Standalone Screener Document. */
    screenerDocument?: any;
    /** When true, bypass the screener gate entirely. */
    skipScreener?: boolean;
    /** Pre-fill answers for the screener fields. */
    screenerSeedAnswers?: Record<string, any>;
    /** Render prop for the external route result in the screener. */
    renderExternalRoute?: (route: ScreenerRoute) => React.ReactNode;
    /** Render prop for the "no match" result in the screener. */
    renderNoMatch?: () => React.ReactNode;
    /** Callback when the screener determines a route. */
    onScreenerRoute?: (route: ScreenerRoute, routeType: ScreenerRouteType, answers: Record<string, any>) => void;
}
/**
 * Drop-in auto-renderer: takes a definition and renders the full form.
 *
 * Wraps itself in a FormspecProvider, plans the layout, and renders
 * each LayoutNode through the component map.
 *
 * When the definition contains a screener, the screener gate is rendered first.
 * Once the screener routes internally (or is skipped), the form is shown.
 */
export declare function FormspecForm(props: FormspecFormProps): import("react/jsx-runtime").JSX.Element;
