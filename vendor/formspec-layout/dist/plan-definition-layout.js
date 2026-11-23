/** @filedesc Shared Definition layout root planning used by renderers and Surface slot-supply planning. */
import { Path } from '@formspec-org/types';
import { mergeFormPresentationForPlanning } from './form-presentation.js';
import { ensureActionButton, ensureValidationSummary, planContains, preparePlanContext, } from './node-utils.js';
import { planPageMode } from './plan-page-mode.js';
import { buildPlatformTheme, mergePlatformAndTenantTheme } from './platform-defaults.js';
import { planComponentTree } from './planner-component-tree.js';
import { planDefinitionFallback } from './planner-definition-fallback.js';
const defaultPlatformTheme = buildPlatformTheme();
function findDefinitionItemByKey(items, key) {
    const segments = Path.parse(key).splitNormalized();
    let current = items;
    for (let i = 0; i < segments.length; i++) {
        const found = current.find((item) => item.key === segments[i]);
        if (!found)
            return null;
        if (i === segments.length - 1)
            return found;
        current = Array.isArray(found.children) ? found.children : [];
    }
    return null;
}
/**
 * Compute the effective LayoutNode tree for a FormDefinition using the exact
 * cascade shared by React rendering and Surface transition-supply planning:
 * platform + granted Theme merge, merged formPresentation, responsive breakpoint,
 * pageMode / Component tree / Definition fallback, and auto-placed ActionButtons.
 */
export function planDefinitionLayout(options) {
    const { definition, componentDocument, themeDocument, activeBreakpoint = null, componentGraph, hostEvidence, autoPlacedActionRefs = [], autoPlaceControls = 'never', showValidationSummary = false, } = options;
    const effectiveTheme = themeDocument
        ? mergePlatformAndTenantTheme(defaultPlatformTheme, themeDocument)
        : mergePlatformAndTenantTheme(defaultPlatformTheme);
    const items = (definition.items ?? []);
    const formPresentation = mergeFormPresentationForPlanning(definition.formPresentation, componentDocument?.formPresentation);
    const pageMode = formPresentation?.pageMode;
    const planCtx = preparePlanContext({
        items,
        ...(formPresentation !== undefined ? { formPresentation } : {}),
        ...(componentDocument ? { componentDocument: componentDocument } : {}),
        ...(componentGraph ? { componentGraph } : {}),
        ...(hostEvidence ? { hostEvidence } : {}),
        theme: effectiveTheme,
        activeBreakpoint,
        findItem: (key) => findDefinitionItemByKey(items, key),
    });
    const paged = pageMode === 'wizard' || pageMode === 'tabs' || pageMode === 'workspace'
        ? planPageMode(definition, planCtx, pageMode)
        : undefined;
    let root;
    if (paged) {
        root = paged.root;
    }
    else if (componentDocument?.tree) {
        root = planComponentTree(componentDocument.tree, planCtx);
    }
    else {
        root = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: planDefinitionFallback(items, planCtx),
        };
    }
    const shouldInjectControls = autoPlaceControls === 'always'
        || (autoPlaceControls === 'when-unauthored' && !planContains(root, 'ActionButton'));
    if (shouldInjectControls) {
        for (const actionRef of autoPlacedActionRefs) {
            ensureActionButton(root, planCtx.nextId, {
                ...(root.pageMode !== undefined ? { pageMode: root.pageMode } : {}),
                actionRef,
            });
        }
    }
    if (showValidationSummary) {
        ensureValidationSummary(root, planCtx.nextId);
    }
    return {
        root,
        workspace: paged?.workspace,
        effectiveTheme,
        formPresentation,
    };
}
