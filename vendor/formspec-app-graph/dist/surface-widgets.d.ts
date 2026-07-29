/** @filedesc Shared extraction for qualified Surface module-widget bindings. */
import type { AppGraphContext, ResolvedArtifactHandle } from './types.js';
import { type WidgetContributionEntry } from './widget-contribution.js';
export type JsonRecord = Record<string, unknown>;
export interface RegistryWidgetEntry extends WidgetContributionEntry {
    registry: ResolvedArtifactHandle;
    entryIndex: number;
    widgetShape?: unknown;
    [key: string]: unknown;
}
export interface SurfaceWidgetSlot {
    surface: ResolvedArtifactHandle;
    surfaceRef?: string;
    route: JsonRecord;
    routeIndex: number;
    routeId?: string;
    slot: JsonRecord;
    slotIndex: number;
    slotId?: string;
    binding: JsonRecord;
    moduleId: string;
    widgetName: string;
}
export declare function record(value: unknown): JsonRecord | undefined;
export declare function stringProp(value: JsonRecord | undefined, key: string): string | undefined;
export declare function ownProp(value: JsonRecord | undefined, key: string): unknown;
export declare function recordArray(value: unknown): JsonRecord[];
export declare function handlesByKind(handles: readonly ResolvedArtifactHandle[], artifactKind: string): ResolvedArtifactHandle[];
export declare function registryWidgetEntries(context: AppGraphContext): RegistryWidgetEntry[];
export declare function surfaceWidgetSlots(surface: ResolvedArtifactHandle): SurfaceWidgetSlot[];
export declare function resolvedWidgetContribution(context: AppGraphContext, widget: Pick<SurfaceWidgetSlot, 'moduleId' | 'widgetName'>): RegistryWidgetEntry | undefined;
export declare function resolvedWidgetContributionFromEntries(widget: Pick<SurfaceWidgetSlot, 'moduleId' | 'widgetName'>, entries: readonly RegistryWidgetEntry[]): RegistryWidgetEntry | undefined;
export declare function moduleIsAdmitted(context: AppGraphContext, moduleId: string): boolean;
export declare function widgetShape(entry: RegistryWidgetEntry | undefined): JsonRecord | undefined;
export declare function escapeJsonPointerToken(token: string): string;
