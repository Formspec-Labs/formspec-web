import type { SurfaceWidgetProps } from '../widget-api.js';
export interface IntakeBannerConfig {
    /** Small label above the headline — the service or programme name. */
    eyebrow?: string;
    headline?: string;
    /** One or two sentences. Longer belongs in an `experience-unit` slot. */
    body?: string;
    /** What a person should have to hand before they start. */
    checklist?: readonly string[];
}
export declare function IntakeBanner({ config, headingLevel, admitsTenantTheme }: SurfaceWidgetProps): import("react/jsx-runtime").JSX.Element;
