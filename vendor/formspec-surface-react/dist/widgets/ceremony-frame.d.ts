import type { SurfaceWidgetProps } from '../widget-api.js';
export interface CeremonyFrameConfig {
    /** What the person is about to do, before the statement. */
    lead?: string;
    /** The statement being attested to. This is the preimage. */
    statement?: string;
    /** The wording of the confirmation, when a host can actually take one. */
    acknowledgement?: string;
}
export declare function CeremonyFrame({ config, headingLevel, admitsTenantTheme }: SurfaceWidgetProps): import("react/jsx-runtime").JSX.Element;
