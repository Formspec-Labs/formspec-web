/** @filedesc Generic, traced module-widget loading, empty, and failure views. */
import type { ReactNode } from 'react';
import type { SurfaceWidgetAction, SurfaceWidgetProps } from './widget-api.js';
export type ModuleWidgetStateName = 'loading' | 'empty' | 'unavailable' | 'error';
/** Registry inventory entries required by the generic shell state renderer. */
export declare const MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES: readonly [{
    readonly pointerPattern: "/stateViews/*";
    readonly kind: "module-widget-state-view";
}, {
    readonly pointerPattern: "/stateViews/*/actions/*";
    readonly kind: "module-widget-state-action";
}];
export interface ModuleWidgetEmptyWhen {
    inputName: string;
    path?: string;
}
interface ModuleWidgetGeneratedStateNode {
    'x-generation'?: {
        anchors?: readonly string[];
    };
}
export interface ModuleWidgetRetryStateAction extends ModuleWidgetGeneratedStateNode {
    kind: 'retry';
    label: string;
    emphasis?: 'primary' | 'secondary' | 'danger';
}
export interface ModuleWidgetOutputStateAction extends ModuleWidgetGeneratedStateNode {
    kind: 'output';
    outputName: string;
    emphasis?: 'primary' | 'secondary' | 'danger';
}
export type ModuleWidgetStateAction = ModuleWidgetRetryStateAction | ModuleWidgetOutputStateAction;
export interface ModuleWidgetStateViewConfig extends ModuleWidgetGeneratedStateNode {
    heading?: string;
    body?: string;
    actions?: readonly ModuleWidgetStateAction[];
}
export type ModuleWidgetStateViewsConfig = Readonly<Partial<Record<ModuleWidgetStateName, ModuleWidgetStateViewConfig>>>;
/** True only when an explicit safe selector resolves to an empty value. */
export declare function widgetDataMatchesEmptyWhen(config: Readonly<Record<string, unknown>>, data: Readonly<Record<string, unknown>>): boolean;
export interface ModuleWidgetStateViewProps {
    state: ModuleWidgetStateName;
    config: Readonly<Record<string, unknown>>;
    headingLevel: SurfaceWidgetProps['headingLevel'];
    actions: readonly SurfaceWidgetAction[];
    emitAction: SurfaceWidgetProps['emitAction'];
    onRetry: () => void;
    fallback: ReactNode;
}
/**
 * Render only independently traced state and action objects. A parent config
 * trace never authorizes state copy or controls.
 */
export declare function ModuleWidgetStateView({ state, config, headingLevel, actions, emitAction, onRetry, fallback, }: ModuleWidgetStateViewProps): ReactNode;
export {};
