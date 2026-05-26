/**
 * formspec-layout — Pure layout planning utilities for Formspec.
 *
 * Provides theme cascade resolution, token resolution, responsive breakpoint
 * merging, default component mapping, and parameter interpolation. All
 * functions are pure (no DOM, no signals, no side effects beyond warnings).
 *
 * @module
 */
export { resolvePresentation, resolveWidget, setTailwindMerge, } from './theme-resolver.js';
export type { ThemeDocument, PresentationBlock, ItemDescriptor, AccessibilityBlock, ThemeSelector, SelectorMatch, Tier1Hints, FormspecDataType, Page, Region, LayoutHints, StyleHints, } from './theme-resolver.js';
export { resolveToken, emitMergedThemeCssVars } from './tokens.js';
export { resolveResponsiveProps } from './responsive.js';
export { interpolateParams } from './params.js';
export { getDefaultComponent } from './defaults.js';
export { widgetTokenToComponent, KNOWN_COMPONENT_TYPES, SPEC_WIDGET_TO_COMPONENT, COMPONENT_TO_HINT, COMPATIBILITY_MATRIX, } from '@formspec-org/types';
export { mergeFormPresentationForPlanning } from './form-presentation.js';
export { planComponentTree, planDefinitionFallback, planContains, ensureActionButton, createNodeIdGenerator, preparePlanContext, } from './planner.js';
export type { EnsureActionButtonOptions, NodeIdGenerator } from './planner.js';
export { resolvePageSequence } from './page-sequence.js';
export type { PageSequenceEntry } from './page-sequence.js';
export { positionPopupNearTrigger, clearPopupFixedPosition, POPUP_EDGE_PADDING, POPUP_TRIGGER_GAP, MODAL_FIRST_FOCUSABLE_SELECTOR, } from './popup-position.js';
export type { PopupPlacement } from './popup-position.js';
export { platformDefaults, platformSelectors, buildPlatformTheme } from './platform-defaults.js';
export type { ComponentGraphProjectionContext, LayoutHostEvidence, LayoutNode, PlanContext, UiGraphPolicyProjectionEvidence, UiGraphRoutePolicyProjection, } from './types.js';
