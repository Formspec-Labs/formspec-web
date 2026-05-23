/** @filedesc Resolves assist-friendly page sequences from the authoritative layout planner. */
import { findItemAtPath } from './planner-path-utils.js';
import { planComponentTree, planDefinitionFallback, preparePlanContext } from './planner.js';
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function normalizeId(value, fallback) {
    if (!isNonEmptyString(value)) {
        return fallback;
    }
    const slug = slugify(value);
    return slug.length > 0 ? slug : fallback;
}
function flattenUnique(values) {
    const seen = new Set();
    const ordered = [];
    for (const value of values) {
        if (!isNonEmptyString(value) || seen.has(value)) {
            continue;
        }
        seen.add(value);
        ordered.push(value);
    }
    return ordered;
}
function createPlanContext(definition, options = {}) {
    return preparePlanContext({
        items: definition.items,
        formPresentation: definition.formPresentation,
        componentDocument: options.component,
        theme: options.theme,
        activeBreakpoint: null,
        findItem: (path) => findItemAtPath(definition.items, path),
    });
}
function topLevelPages(nodes) {
    if (Array.isArray(nodes)) {
        return nodes.filter((node) => node.component === 'Section');
    }
    if (nodes.component === 'Section') {
        return [nodes];
    }
    return Array.isArray(nodes.children)
        ? nodes.children.filter((node) => node.component === 'Section')
        : [];
}
function collectFieldPaths(node, output) {
    if (node.fieldItem && isNonEmptyString(node.bindPath)) {
        output.push(node.bindPath);
    }
    for (const child of node.children ?? []) {
        collectFieldPaths(child, output);
    }
}
function buildComponentSequence(definition, component) {
    if (!component?.tree) {
        return [];
    }
    const planned = planComponentTree(component.tree, createPlanContext(definition, { component }), '', undefined, false);
    return topLevelPages(planned).map((page, index) => {
        const fields = [];
        collectFieldPaths(page, fields);
        return {
            id: normalizeId(page.props?.id ?? page.id, `page-${index + 1}`),
            title: isNonEmptyString(page.props?.title) ? String(page.props.title).trim() : undefined,
            fields: flattenUnique(fields),
        };
    });
}
function buildThemeSequence(definition, options) {
    const planned = options.component?.tree
        ? planComponentTree(options.component.tree, createPlanContext(definition, options), '', undefined, true)
        : planDefinitionFallback(definition.items, createPlanContext(definition, { theme: options.theme }));
    return topLevelPages(planned).map((page, index) => {
        const fields = [];
        collectFieldPaths(page, fields);
        return {
            id: normalizeId(page.props?.id ?? page.id, `page-${index + 1}`),
            title: isNonEmptyString(page.props?.title) ? String(page.props.title).trim() : undefined,
            fields: flattenUnique(fields),
        };
    });
}
function buildDefinitionSequence(definition) {
    const planned = planDefinitionFallback(definition.items, createPlanContext(definition));
    const pages = topLevelPages(planned);
    if (pages.length === 0) {
        const fields = [];
        for (const item of planned) {
            collectFieldPaths(item, fields);
        }
        return [{ id: 'default', fields: flattenUnique(fields) }];
    }
    return pages.map((page, index) => {
        const fields = [];
        collectFieldPaths(page, fields);
        return {
            id: normalizeId(page.props?.title ?? page.id, `page-${index + 1}`),
            fields: flattenUnique(fields),
        };
    });
}
export function resolvePageSequence(definition, options = {}) {
    // Layer precedence is explicit:
    // root-level component Section units > theme.pages > generated definition group sections.
    if (options.component) {
        const componentPages = buildComponentSequence(definition, options.component);
        if (componentPages.length > 0) {
            return componentPages;
        }
    }
    if (options.theme) {
        const themePages = buildThemeSequence(definition, { component: options.component, theme: options.theme });
        if (themePages.length > 0) {
            return themePages;
        }
    }
    return buildDefinitionSequence(definition);
}
