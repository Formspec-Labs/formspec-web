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
export { resolveResponsiveProps, extractBreakpointEntries, matchBreakpoint, type BreakpointSpec, } from './responsive.js';
export { interpolateParams } from './params.js';
export { getDefaultComponent } from './defaults.js';
export { widgetTokenToComponent, KNOWN_COMPONENT_TYPES, SPEC_WIDGET_TO_COMPONENT, COMPONENT_TO_HINT, COMPATIBILITY_MATRIX, } from '@formspec-org/types';
export { mergeFormPresentationForPlanning } from './form-presentation.js';
export { planComponentTree, planDefinitionFallback, planDefinitionLayout, planContains, ensureActionButton, ensureValidationSummary, createNodeIdGenerator, preparePlanContext, } from './planner.js';
export type { EnsureActionButtonOptions, NodeIdGenerator, PlanDefinitionLayoutOptions, PlannedDefinitionLayout, } from './planner.js';
export { describeWizardStep, findAuthoredPageSection, hasWizardSections, placementCovers, placementKey, planExplicitPageRoot, resolvePageSequence, resolveSectionTitlePlan } from './page-sequence.js';
export type { PageSequenceEntry, PageSequenceOptions } from './page-sequence.js';
export { planPageMode, type WorkspacePage } from './plan-page-mode.js';
export * from './form-progress.js';
export { positionPopupNearTrigger, clearPopupFixedPosition, POPUP_EDGE_PADDING, POPUP_TRIGGER_GAP, MODAL_FIRST_FOCUSABLE_SELECTOR, } from './popup-position.js';
export type { PopupPlacement } from './popup-position.js';
export { bindAutoModal } from './auto-modal.js';
export type { AutoModal } from './auto-modal.js';
export { characterCountLimitMessage, characterCountStatus, CHARACTER_COUNT_ANNOUNCE_DELAY_MS, } from './character-count.js';
export type { UiStringLookup } from './character-count.js';
export { UI_STRINGS, fillUiParams } from './ui-strings.js';
export type { ChromeStringKey } from './ui-strings.js';
export { readValidationSummaryRows, validationResultPath, stripSeverityPrefix, dedupeSeverityPrefix, } from './validation-summary.js';
export type { ValidationSummaryComp, ValidationSummaryRow, ValidationSummarySource } from './validation-summary.js';
export { HIDDEN_ANSWERS_OMITTED_CODE, readWarningAcknowledgementGroups, warningAcknowledgementLegend } from './warning-acknowledgement.js';
export type { WarningAcknowledgementGroupInput, WarningAcknowledgementGroupView, WarningAcknowledgementItem, WarningAcknowledgementSource, WarningAcknowledgementStateInput, } from './warning-acknowledgement.js';
export { platformDefaults, platformSelectors, buildPlatformTheme, mergePlatformAndTenantTheme, } from './platform-defaults.js';
export { resolveRouteLandmark } from './route-landmark-projection.js';
export type { ResolvedRouteLandmark, ResolvedRouteLandmarkRole } from './route-landmark-projection.js';
export { admitFieldHelpUri, resolveFieldHelp } from './field-help.js';
export type { FieldHelpReference, FieldHelpUriAdmission, ReferencesDocumentLike } from './field-help.js';
export { parseRichText, isRichText, richTextToPlain } from './rich-text.js';
export type { RichBlock, RichInline } from './rich-text.js';
export type { ComponentGraphProjectionContext, LayoutHostEvidence, LayoutNode, PlanContext, UiGraphPolicyProjectionEvidence, UiGraphRoutePolicyProjection, } from './types.js';
