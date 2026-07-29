import { type PlannedTransition, type SurfaceRouteHandle, type SurfaceStrings } from '@formspec-org/surface';
export interface SurfaceTransitionsProps {
    from: SurfaceRouteHandle;
    transitions: readonly PlannedTransition[];
    /** The shell's own person-facing strings. Defaults to the shipped English. */
    strings?: SurfaceStrings | undefined;
    /**
     * Runs the transition's action under Response Actions authority and reports
     * whether it succeeded. Absent ⇒ a resolved transition is `unfireable` with
     * reason `no-executor`, and no control renders.
     */
    onFire?: ((transition: PlannedTransition, from: SurfaceRouteHandle) => Promise<{
        advanced: boolean;
        reason?: string;
    }>) | undefined;
    /** Navigate. Called only after `onFire` reports the action actually succeeded. */
    onAdvance?: ((transition: PlannedTransition) => void) | undefined;
}
export declare function SurfaceTransitions({ from, transitions, strings, onFire, onAdvance, }: SurfaceTransitionsProps): import("react/jsx-runtime").JSX.Element | null;
