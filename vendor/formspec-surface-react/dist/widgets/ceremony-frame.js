import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @filedesc `CeremonyFrame` — the frame around a signing act.
 *
 * ## The sharp edge this widget sits on
 *
 * A `ceremony` route refuses tenant chrome theming, because *the signer's
 * preimage IS the thing signed* (`surface-spec.md` §3): what the person read is
 * the evidence, not a view of it. So this is a **module-supplied widget that is
 * required to render unbranded** — a shape the Registry does not currently
 * express, because `widgetShape.tokenSlots` says which token categories a widget
 * accepts and never says "and none of them on these routes" (gap ledger
 * `widget-x-ceremony-frame`).
 *
 * How it holds anyway, without the Registry expressing it: the widget paints
 * only through `--formspec-*` custom properties, and on a refusing route those
 * properties were emitted from a theme document built from the platform token
 * registry alone (`@formspec-org/surface`'s `createThemeAuthority`). The widget
 * needs no rule of its own — it cannot reach a tenant token because none is in
 * scope. `admitsTenantTheme` is surfaced in the DOM so that absence is
 * measurable rather than merely intended.
 *
 * ## What it does not do
 *
 * It does not sign. There is no signing act in a Surface slot binding and no
 * channel to one, so a control that looked like "sign here" would be a button
 * that produces no signature. It renders the statement being attested to and
 * says, in plain language, that the act itself is not available here.
 */
import { Heading, nextLevel } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
function readConfig(config) {
    const text = (key) => typeof config[key] === 'string' && config[key] !== '' ? config[key] : undefined;
    const parsed = {};
    const lead = text('lead');
    const statement = text('statement');
    const acknowledgement = text('acknowledgement');
    if (lead !== undefined)
        parsed.lead = lead;
    if (statement !== undefined)
        parsed.statement = statement;
    if (acknowledgement !== undefined)
        parsed.acknowledgement = acknowledgement;
    return parsed;
}
export function CeremonyFrame({ config, headingLevel, admitsTenantTheme }) {
    const parsed = readConfig(config);
    return (_jsxs("div", { className: "fs-surface-ceremony", "data-widget": "ceremony-frame", "data-tenant-theme": admitsTenantTheme ? 'admitted' : 'refused', children: [parsed.lead && _jsx("p", { className: "fs-surface-ceremony__lead", children: parsed.lead }), parsed.statement ? (_jsx("blockquote", { className: "fs-surface-ceremony__statement", "data-probe": "ceremony-statement", children: parsed.statement })) : (_jsx(WidgetEmptyState, { children: "There is no declaration to read here yet, so there is nothing to agree to." })), parsed.acknowledgement && (_jsx("p", { className: "fs-surface-ceremony__acknowledgement", children: parsed.acknowledgement })), _jsx(Heading, { level: nextLevel(headingLevel), className: "fs-surface-visually-hidden", children: "About signing" }), _jsx("p", { className: "fs-surface-ceremony__note", children: "Signing is not something this page can do on its own. What you read here is what would be signed." })] }));
}
