/** @filedesc Shared Definition layout root planning used by renderers and Surface slot-supply planning. */
import { type ComponentDocument, type FormDefinition } from '@formspec-org/types';
import { type WorkspacePage } from './plan-page-mode.js';
import type { ThemeDocument } from './theme-resolver.js';
import type { ComponentGraphProjectionContext, LayoutHostEvidence, LayoutNode } from './types.js';
export interface PlanDefinitionLayoutOptions {
    definition: FormDefinition;
    componentDocument?: (ComponentDocument & {
        formPresentation?: Record<string, unknown>;
    }) | null | undefined;
    themeDocument?: ThemeDocument | null | undefined;
    activeBreakpoint?: string | null | undefined;
    componentGraph?: ComponentGraphProjectionContext | null | undefined;
    hostEvidence?: LayoutHostEvidence | null | undefined;
    autoPlacedActionRefs?: readonly string[] | undefined;
    autoPlaceControls?: 'always' | 'when-unauthored' | 'never' | undefined;
    showValidationSummary?: boolean | undefined;
}
export interface PlannedDefinitionLayout {
    root: LayoutNode;
    workspace?: WorkspacePage[] | undefined;
    effectiveTheme: ThemeDocument;
    formPresentation?: Record<string, unknown> | undefined;
}
/**
 * Compute the effective LayoutNode tree for a FormDefinition using the exact
 * cascade shared by React rendering and Surface transition-supply planning:
 * platform + granted Theme merge, merged formPresentation, responsive breakpoint,
 * pageMode / Component tree / Definition fallback, and auto-placed ActionButtons.
 */
export declare function planDefinitionLayout(options: PlanDefinitionLayoutOptions): PlannedDefinitionLayout;
