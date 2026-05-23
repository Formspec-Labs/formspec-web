'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc FormspecForm — auto-renderer that walks LayoutNode tree into React elements. */
import { useState, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { buildPlatformTheme, emitMergedThemeCssVars } from '@formspec-org/layout';
const defaultThemeJson = buildPlatformTheme();
import { FormspecProvider } from './context';
import { useFormspecContext } from './context';
import { FormspecNode } from './node-renderer';
import { IssuerChromeSlot, parseQueryIssuerOverride } from './issuer';
import { FormspecScreener } from './screener/FormspecScreener';
/** Match `<formspec-render>`: emit theme + component tokens on `.formspec-container` so CSS variables resolve the same as the web component (e.g. radio group border). */
function syncSystemAppearanceClass(el, systemPrefersDark) {
    if (!el)
        return;
    const hasExplicitLight = el.classList.contains('formspec-appearance-light');
    const hasExplicitDark = el.classList.contains('formspec-appearance-dark');
    if (hasExplicitLight || hasExplicitDark)
        return;
    el.classList.toggle('formspec-appearance-dark', systemPrefersDark);
}
function useEmitThemeTokensOnFormspecContainerRef() {
    const ref = useRef(null);
    const { themeDocument, componentDocument } = useFormspecContext();
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const effectiveTheme = themeDocument ?? defaultThemeJson;
        const themeTokens = effectiveTheme.tokens;
        emitMergedThemeCssVars(el, {
            themeTokens: themeTokens || {},
            componentTokens: componentDocument?.tokens,
        });
        return () => {
            for (let i = el.style.length - 1; i >= 0; i--) {
                const prop = el.style[i];
                if (prop.startsWith('--formspec-')) {
                    el.style.removeProperty(prop);
                }
            }
        };
    }, [themeDocument, componentDocument]);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof window === 'undefined' || typeof window.matchMedia !== 'function')
            return;
        const colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        const syncAppearance = () => {
            syncSystemAppearanceClass(el, colorSchemeMedia.matches);
        };
        syncAppearance();
        if (typeof colorSchemeMedia.addEventListener === 'function') {
            colorSchemeMedia.addEventListener('change', syncAppearance);
            return () => colorSchemeMedia.removeEventListener('change', syncAppearance);
        }
        colorSchemeMedia.addListener(syncAppearance);
        return () => colorSchemeMedia.removeListener(syncAppearance);
    });
    return ref;
}
/**
 * Drop-in auto-renderer: takes a definition and renders the full form.
 *
 * Wraps itself in a FormspecProvider, plans the layout, and renders
 * each LayoutNode through the component map.
 *
 * When the definition contains a screener, the screener gate is rendered first.
 * Once the screener routes internally (or is skipped), the form is shown.
 */
export function FormspecForm(props) {
    const { definition, className, issuerAllowedOrigins, issuerOverride, screenerDocument, skipScreener, screenerSeedAnswers, renderExternalRoute, renderNoMatch, onScreenerRoute, ...providerProps } = props;
    const hasIssuerOverrideProp = Object.prototype.hasOwnProperty.call(props, 'issuerOverride');
    const effectiveIssuerOverride = useEffectiveIssuerOverride(hasIssuerOverrideProp ? issuerOverride : undefined, issuerAllowedOrigins);
    const issuerProviderProps = hasIssuerOverrideProp || effectiveIssuerOverride
        ? { issuerOverride: effectiveIssuerOverride }
        : {};
    const hasScreener = !skipScreener && hasActiveScreenerDoc(screenerDocument);
    const [screenerDone, setScreenerDone] = useState(!hasScreener);
    const handleRoute = useCallback((route, routeType, answers) => {
        if (routeType === 'internal') {
            setScreenerDone(true);
        }
        onScreenerRoute?.(route, routeType, answers);
    }, [onScreenerRoute]);
    // If the screener is active and not yet resolved, render it standalone
    if (hasScreener && !screenerDone) {
        return (_jsx(FormspecProvider, { definition: definition, ...providerProps, ...issuerProviderProps, children: _jsx(ScreenerGate, { screenerDocument: screenerDocument, className: className, seedAnswers: screenerSeedAnswers, renderExternalRoute: renderExternalRoute, renderNoMatch: renderNoMatch, onRoute: handleRoute, onSkip: () => setScreenerDone(true) }) }));
    }
    return (_jsx(FormspecProvider, { definition: definition, ...providerProps, ...issuerProviderProps, children: _jsx(FormspecFormInner, { className: className }) }));
}
/**
 * Screener gate rendered inside a FormspecProvider so it has access to the engine.
 * When the screener component returns null (internal route or skip), we notify the
 * parent to flip to form rendering.
 */
function ScreenerGate({ screenerDocument, className, seedAnswers, renderExternalRoute, renderNoMatch, onRoute, onSkip, }) {
    const containerRef = useEmitThemeTokensOnFormspecContainerRef();
    const { engine } = useFormspecContext();
    return (_jsxs("div", { ref: containerRef, className: className ? `formspec-container ${className}` : 'formspec-container', children: [_jsx(IssuerChromeSlot, { engine: engine, hostOrigin: browserHostOrigin(), mode: issuerChromeModeFromClassName(className) }), _jsx(FormspecScreener, { screenerDocument: screenerDocument, seedAnswers: seedAnswers, renderExternalRoute: renderExternalRoute, renderNoMatch: renderNoMatch, onRoute: (route, routeType, answers) => {
                    onRoute?.(route, routeType, answers);
                    // If the screener resolved to internal or was skipped,
                    // FormspecScreener returns null — but we also need to
                    // notify the parent so it can switch to form rendering.
                    // The parent's handleRoute already does setScreenerDone
                    // for internal routes.
                } })] }));
}
function FormspecFormInner({ className }) {
    const { engine, layoutPlan } = useFormspecContext();
    const containerRef = useEmitThemeTokensOnFormspecContainerRef();
    if (!layoutPlan) {
        const containerClass = className
            ? `formspec-container ${className}`
            : 'formspec-container';
        return (_jsxs("div", { ref: containerRef, className: containerClass, children: [_jsx(IssuerChromeSlot, { engine: engine, hostOrigin: browserHostOrigin(), mode: issuerChromeModeFromClassName(className) }), "No layout plan available."] }));
    }
    const containerClass = className
        ? `formspec-container ${className}`
        : 'formspec-container';
    return (_jsxs("div", { ref: containerRef, className: containerClass, children: [_jsx(IssuerChromeSlot, { engine: engine, hostOrigin: browserHostOrigin(), mode: issuerChromeModeFromClassName(className) }), _jsx(FormspecNode, { node: layoutPlan })] }));
}
/** Check whether a standalone screener document is active. */
function hasActiveScreenerDoc(screenerDocument) {
    return (Boolean(screenerDocument) &&
        Array.isArray(screenerDocument?.items) &&
        screenerDocument.items.length > 0);
}
function useEffectiveIssuerOverride(issuerOverride, issuerAllowedOrigins) {
    return useMemo(() => {
        if (issuerOverride) {
            return withEmbedSource(issuerOverride);
        }
        if (typeof window === 'undefined') {
            return undefined;
        }
        return parseQueryIssuerOverride(new URL(window.location.href), issuerAllowedOrigins ?? []);
    }, [issuerOverride, issuerAllowedOrigins]);
}
function withEmbedSource(source) {
    if (source.kind === 'inline') {
        return { kind: 'inline', issuer: source.issuer, source: 'host-embed' };
    }
    return { kind: 'url', url: source.url, source: 'host-embed' };
}
function browserHostOrigin() {
    return typeof window === 'undefined' ? undefined : window.location.origin;
}
function issuerChromeModeFromClassName(className) {
    return className?.split(/\s+/).includes('formspec-appearance-dark') ? 'dark' : 'light';
}
