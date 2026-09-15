import { type PlannedTransition, type SurfaceStrings } from '@formspec-org/surface';
import type { FireTransition, SurfaceTransitionOutcome, SurfaceTransitionSource } from './SurfaceApp.js';
export interface SurfaceTransitionsProps {
    from: SurfaceTransitionSource;
    transitions: readonly PlannedTransition[];
    /** The shell's own person-facing strings. Defaults to the shipped English. */
    strings?: SurfaceStrings | undefined;
    /**
     * Runs the transition's action under Response Actions authority and reports
     * whether it succeeded. Absent ⇒ a resolved transition is `unfireable` with
     * reason `no-executor`, and no control renders.
     */
    onFire?: FireTransition | undefined;
    /** Navigate. Called only after `onFire` reports the action actually succeeded. */
    onAdvance?: ((transition: PlannedTransition, outcome: SurfaceTransitionOutcome) => void) | undefined;
}
export declare function SurfaceTransitions({ from, transitions, strings, onFire, onAdvance, }: SurfaceTransitionsProps): import("react/jsx-runtime").JSX.Element | null;
