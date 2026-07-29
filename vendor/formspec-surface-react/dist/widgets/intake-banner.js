import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Heading } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
function readConfig(config) {
    const text = (key) => typeof config[key] === 'string' && config[key] !== '' ? config[key] : undefined;
    const checklist = Array.isArray(config.checklist)
        ? config.checklist.filter((item) => typeof item === 'string' && item !== '')
        : undefined;
    const parsed = {};
    const eyebrow = text('eyebrow');
    const headline = text('headline');
    const body = text('body');
    if (eyebrow !== undefined)
        parsed.eyebrow = eyebrow;
    if (headline !== undefined)
        parsed.headline = headline;
    if (body !== undefined)
        parsed.body = body;
    if (checklist !== undefined && checklist.length > 0)
        parsed.checklist = checklist;
    return parsed;
}
export function IntakeBanner({ config, headingLevel, admitsTenantTheme }) {
    const parsed = readConfig(config);
    const empty = parsed.eyebrow === undefined &&
        parsed.headline === undefined &&
        parsed.body === undefined &&
        parsed.checklist === undefined;
    return (_jsx("div", { className: "fs-surface-banner", "data-widget": "intake-banner", "data-tenant-theme": admitsTenantTheme ? 'admitted' : 'refused', children: empty ? (_jsx(WidgetEmptyState, { children: "Nothing has been written for this banner yet, so there is nothing to read here." })) : (_jsxs(_Fragment, { children: [parsed.eyebrow && _jsx("p", { className: "fs-surface-banner__eyebrow", children: parsed.eyebrow }), parsed.headline && (_jsx(Heading, { level: headingLevel, className: "fs-surface-banner__headline", children: parsed.headline })), parsed.body && _jsx("p", { className: "fs-surface-banner__body", children: parsed.body }), parsed.checklist && (_jsx("ul", { className: "fs-surface-banner__checklist", children: parsed.checklist.map((item) => (_jsx("li", { children: item }, item))) }))] })) }));
}
