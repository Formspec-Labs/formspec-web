'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc React issuer chrome and query-override helpers. */
import { useEffect, useState } from 'react';
import { resolveLangValue, } from '@formspec-org/engine';
import { useSignal } from './use-signal';
export function IssuerChromeSlot({ engine, hostOrigin, mode = 'light', headerWidth = 'wide', }) {
    const localeTick = useSignal(engine.localeSignal);
    const [resolved, setResolved] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setResolved(null);
        void engine.getResolvedIssuer()
            .then((next) => {
            if (!cancelled) {
                setResolved(next.source === 'unbranded' ? null : next);
            }
        })
            .catch((error) => {
            console.warn('Issuer resolution failed', error);
        });
        return () => {
            cancelled = true;
        };
    }, [engine, localeTick]);
    if (!resolved || resolved.source === 'unbranded') {
        return _jsx("div", { className: "fs-issuer-chrome-slot" });
    }
    const issuer = resolved.primary;
    const locale = engine.getActiveLocale() || 'en';
    const defaultLanguage = issuer.defaultLanguage ?? 'en';
    const displayName = resolveLangValue(issuer.displayName ?? issuer.name, locale, defaultLanguage) ?? '';
    const logo = selectLogoVariant(issuer, { mode, headerWidth });
    const altText = logo
        ? resolveLangValue(logo.altText, locale, defaultLanguage) ?? displayName
        : undefined;
    const breadcrumb = resolveBreadcrumb(resolved, locale, defaultLanguage);
    const supportEmail = primaryContactEmail(issuer);
    return (_jsx("div", { className: "fs-issuer-chrome-slot", children: _jsxs("header", { className: "fs-issuer-chrome", "data-source": resolved.source, children: [logo ? (_jsx("img", { className: "fs-issuer-logo", src: logo.url, alt: altText ?? '' })) : null, _jsxs("div", { className: "fs-issuer-text", children: [_jsx("div", { className: "fs-issuer-name", children: displayName }), breadcrumb ? (_jsx("div", { className: "fs-issuer-org-breadcrumb", children: breadcrumb })) : null, supportEmail ? (_jsx("a", { className: "fs-issuer-support", href: `mailto:${supportEmail}`, children: supportEmail })) : null] }), resolved.source === 'host-query' ? (_jsx("div", { className: "fs-issuer-query-indicator", role: "status", children: `Branding provided by ${hostOrigin ?? 'host'}` })) : null] }) }));
}
export function parseQueryIssuerOverride(pageUrl, allowedOrigins) {
    const raw = pageUrl.searchParams.get('_issuer');
    if (!raw) {
        return undefined;
    }
    if (allowedOrigins.length === 0) {
        warnIgnored('no issuer allowlist configured');
        return undefined;
    }
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        warnIgnored('issuer URL is malformed');
        return undefined;
    }
    if (!allowedOrigins.includes(url.origin)) {
        warnIgnored(`origin not allowlisted: ${url.origin}`);
        return undefined;
    }
    return { kind: 'url', url: url.toString(), source: 'host-query' };
}
function selectLogoVariant(issuer, ctx) {
    const { primary, wordmark, monochrome } = issuer.logo ?? {};
    const dark = ctx.mode !== 'light';
    const narrow = ctx.headerWidth === 'narrow';
    const preferred = dark ? monochrome : narrow ? wordmark : primary;
    return preferred ?? primary ?? wordmark ?? monochrome;
}
function resolveBreadcrumb(resolved, locale, defaultLanguage) {
    const parts = [];
    const organizationName = resolveLangValue(resolved.primary.organizationName, locale, defaultLanguage);
    if (organizationName) {
        parts.push(organizationName);
    }
    for (const issuer of resolved.chain.slice(1)) {
        const name = resolveLangValue(issuer.displayName ?? issuer.name, locale, issuer.defaultLanguage ?? defaultLanguage);
        if (name && !parts.includes(name)) {
            parts.push(name);
        }
    }
    return parts.length > 0 ? parts.join(' / ') : undefined;
}
function primaryContactEmail(issuer) {
    const contacts = contactPoints(issuer.contactPoint);
    return contacts.find((contact) => contact.contactType === 'customer support')?.email
        ?? contacts.find((contact) => contact.email != null)?.email;
}
function contactPoints(contactPoint) {
    if (!contactPoint) {
        return [];
    }
    return Array.isArray(contactPoint) ? contactPoint : [contactPoint];
}
function warnIgnored(reason) {
    globalThis.console?.warn?.(`Formspec Issuer query override ignored: ${reason}`);
}
