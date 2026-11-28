import { type DraftStartPlan, type SurfaceStrings } from '@formspec-org/surface';
import type { FormStatusNavigation } from './FormStatus.js';
import { type DraftSession } from './draft-session.js';
export declare function DraftStart({ plan, session, navigate, strings }: {
    plan: DraftStartPlan;
    session: DraftSession;
    navigate: FormStatusNavigation['navigate'];
    strings: SurfaceStrings;
}): import("react/jsx-runtime").JSX.Element;
