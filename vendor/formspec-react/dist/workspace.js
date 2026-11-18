'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @filedesc Section navigation, question search and live findings for Core workspace mode. */
import { createContext, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { computed } from '@preact/signals-core';
import { placementCovers, placementKey, readFormProgressFindingRows, summarizeFormProgress, } from '@formspec-org/layout';
import { useFormspecContext } from './context';
import { FormspecNode } from './node-renderer';
import { useChromeText } from './use-chrome-text';
import { useFocusField } from './use-focus-field';
import { useSignal } from './use-signal';
import { HeadingLevelContext, useHeadingLevel } from './heading-level';
import { plannedTitle } from './use-localized-node';
export const WorkspaceFieldJump = createContext(null);
function indexPlacements(sections) {
    const index = new Map();
    for (const section of sections) {
        for (const path of section.fields) {
            const key = placementKey(path);
            const placements = index.get(key) ?? [];
            placements.push({ path, section });
            index.set(key, placements);
        }
    }
    return index;
}
function repeatContext(engine, path, chrome) {
    return Array.from(path.matchAll(/\[(\d+)\]/g), match => {
        const group = path.slice(0, match.index);
        return chrome('repeat.row', {
            label: engine.getItemLabelSignal(group)?.value || group.split('.').pop(),
            index: Number(match[1]) + 1,
        });
    }).join(' / ');
}
function useSectionTitle(title, report, updateDocumentTitle) {
    const baseTitle = useRef('');
    useLayoutEffect(() => {
        if (report)
            return () => report(undefined);
        if (!updateDocumentTitle)
            return;
        baseTitle.current = document.title;
        return () => { document.title = baseTitle.current; };
    }, [report, updateDocumentTitle]);
    useLayoutEffect(() => {
        if (report)
            report(title);
        else if (updateDocumentTitle)
            document.title = title ? [title, baseTitle.current].filter(Boolean).join(' – ') : baseTitle.current;
    }, [report, title, updateDocumentTitle]);
}
export function Workspace({ root, pages }) {
    const { engine, workspaceNavigation, touchField } = useFormspecContext();
    const chrome = useChromeText();
    const formTitle = useSignal(useMemo(() => engine.getFormVM(), [engine]).title);
    const [localSection, setLocalSection] = useState();
    const controlled = workspaceNavigation && 'activeSection' in workspaceNavigation;
    const selected = controlled ? workspaceNavigation.activeSection : localSection;
    const [query, setQuery] = useState('');
    const [notice, setNotice] = useState('');
    const [jump, setJump] = useState();
    const heading = useRef(null);
    const { focusField, containerRef } = useFocusField();
    const level = useHeadingLevel();
    const Heading = `h${level}`;
    const searchId = useId();
    const searchLabelId = useId();
    const searchResultsId = useId();
    const searchStatusId = useId();
    const findingsHeading = useId();
    const activeIndex = Math.max(0, pages.findIndex(page => page.id === selected));
    const active = pages[activeIndex];
    useLayoutEffect(() => {
        if (controlled)
            setLocalSection(active?.id);
    }, [controlled, active?.id]);
    const activeContent = useMemo(() => active && _jsx(FormspecNode, { node: active.content }, active.content.id), [active]);
    const titles = useSignal(useMemo(() => computed(() => {
        engine.localeSignal.value;
        return pages.map((page, index) => plannedTitle(engine, page)
            || page.title || (page.id ? chrome('wizard.stepTitle', { index: index + 1 }) : formTitle || chrome('wizard.steps')));
    }), [engine, pages, chrome, formTitle]));
    useSectionTitle(active?.id ? titles[activeIndex] : undefined, workspaceNavigation?.onSectionTitleChange, workspaceNavigation?.updateDocumentTitle);
    const snapshot = useSignal(useMemo(() => computed(() => engine.getEvaluatedFormState()), [engine]));
    const progress = useMemo(() => summarizeFormProgress(pages, snapshot), [pages, snapshot]);
    const placements = useMemo(() => indexPlacements(pages), [pages]);
    const resolvePage = useCallback((path) => placements.get(placementKey(path))?.find(placement => placementCovers(placement.path, path))?.section, [placements]);
    // Answer edits refresh the snapshot. Search only needs to revisit membership when relevant paths change.
    const relevantPaths = useMemo(() => snapshot.fields.filter(field => field.relevant).map(field => field.path).join('\n'), [snapshot]);
    const relevant = useMemo(() => new Set(relevantPaths ? relevantPaths.split('\n') : []), [relevantPaths]);
    const field = (path) => {
        const vm = engine.getFieldVM(path);
        return vm ? { label: vm.label.value, controlId: vm.id || null } : null;
    };
    const findings = readFormProgressFindingRows(progress, {
        field, chrome, message: result => engine.resolveValidationMessage(result) ?? '',
        jumpable: path => relevant.has(path) && resolvePage(path) !== undefined,
    });
    const term = query.trim();
    const matches = useSignal(useMemo(() => computed(() => {
        if (!term)
            return [];
        engine.localeSignal.value;
        engine.structureVersion.value;
        const locale = engine.getActiveLocale() || undefined;
        const normalize = (text) => text.toLocaleLowerCase(locale).normalize('NFD').replace(/\p{M}/gu, '');
        const normalizedTerm = normalize(term);
        if (!normalizedTerm)
            return [];
        return Array.from(relevant).flatMap(path => {
            const page = resolvePage(path);
            const question = page && engine.getFieldVM(path);
            if (!question)
                return [];
            const context = repeatContext(engine, path, chrome);
            const label = [question.label.value, context].filter(Boolean).join(' — ');
            const title = titles[pages.indexOf(page)];
            return normalize(`${label} ${title}`).includes(normalizedTerm) ? [{ path, label, title }] : [];
        });
    }), [term, engine, relevant, resolvePage, chrome, titles, pages]));
    function select(page) {
        if (page.id === undefined)
            return;
        if (!controlled)
            setLocalSection(page.id);
        workspaceNavigation?.onActiveSectionChange?.(page.id);
    }
    function navigate(page) {
        setJump(undefined);
        setNotice('');
        select(page);
    }
    function jumpTo(path) {
        const section = resolvePage(path);
        if (!section) {
            setNotice(chrome('workspace.targetUnavailable'));
            heading.current?.focus();
            return;
        }
        setNotice('');
        setJump({ path, section });
        if (section !== active || workspaceNavigation?.sectionNavigationActive === false)
            select(section);
    }
    const navigationActive = workspaceNavigation?.sectionNavigationActive !== false;
    const previousPage = useRef({ section: active?.id, navigationActive });
    useLayoutEffect(() => {
        const previous = previousPage.current;
        previousPage.current = { section: active?.id, navigationActive };
        const changed = navigationActive && (previous.section !== active?.id || !previous.navigationActive);
        const pending = jump && jump.section.id === active?.id && (navigationActive || active?.id === undefined);
        if (changed || pending)
            heading.current?.focus();
        if (!pending)
            return;
        touchField(jump.path);
        const field = () => containerRef.current?.querySelector(`[data-name="${jump.path}"]`);
        const waitingForTab = field()?.closest('[role="tabpanel"][hidden]');
        const finish = () => {
            const target = field();
            const focused = focusField(jump.path);
            const visible = target && !target.closest('[hidden], .formspec-hidden');
            const disabled = target?.ownerDocument.activeElement?.closest('[aria-disabled="true"]');
            if (!visible || !focused || disabled) {
                heading.current?.focus();
                setNotice(chrome(visible ? 'workspace.targetReadOnly' : 'workspace.targetUnavailable'));
            }
            setJump(undefined);
        };
        if (waitingForTab) {
            focusField(jump.path);
            const frame = requestAnimationFrame(finish);
            return () => cancelAnimationFrame(frame);
        }
        finish();
    }, [active?.id, navigationActive, jump, focusField, touchField, chrome, containerRef]);
    const content = new Set(pages.map(page => page.content));
    const sectionLink = (page, label) => {
        const href = page.id && workspaceNavigation?.hrefForSection?.(page.id);
        const current = page === active ? 'location' : undefined;
        const activate = () => navigate(page);
        return href ? (_jsx("a", { href: href, "aria-current": current, "data-formspec-section": page.id, onClick: event => {
                if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
                    return;
                event.preventDefault();
                activate();
            }, children: label })) : _jsx("button", { type: "button", "aria-current": current, "data-formspec-section": page.id, onClick: activate, children: label });
    };
    const renderShared = (node) => _jsx(FormspecNode, { node: node }, node.id);
    return (_jsx("div", { className: "formspec-workspace-container", children: _jsx(WorkspaceFieldJump.Provider, { value: jumpTo, children: _jsxs("div", { className: "formspec-workspace", ref: containerRef, children: [_jsxs("div", { className: "formspec-workspace__navigation", children: [pages.some(page => page.id) && (_jsx("nav", { "aria-label": chrome('workspace.sections'), children: _jsx("ul", { children: pages.map((page, i) => page.id && _jsx("li", { children: sectionLink(page, titles[i]) }, page.id)) }) })), _jsx("label", { id: searchLabelId, htmlFor: searchId, children: chrome('workspace.search') }), _jsx("input", { id: searchId, type: "search", value: query, onInput: event => setQuery(event.currentTarget.value), "aria-controls": searchResultsId, "aria-describedby": searchStatusId }), _jsx("p", { id: searchStatusId, role: "status", "aria-atomic": "true", children: term && (matches.length ? chrome('workspace.matchCount', { count: matches.length }) : chrome('workspace.noMatches')) }), _jsx("ul", { id: searchResultsId, "aria-labelledby": searchLabelId, hidden: matches.length === 0, children: matches.map(({ path, label, title }) => _jsx("li", { children: _jsxs("button", { type: "button", onClick: () => jumpTo(path), children: [label, _jsx("small", { children: title })] }) }, path)) })] }), _jsxs("div", { className: "formspec-workspace__content", "data-formspec-section": active?.id ?? '', children: [_jsx(Heading, { ref: heading, tabIndex: -1, children: titles[activeIndex] ?? formTitle }), _jsx("p", { role: "status", children: notice }), root.children.filter(node => !content.has(node) && node.component === 'ValidationSummary').map(renderShared), _jsx(HeadingLevelContext.Provider, { value: level + 1, children: activeContent }), pages.length > 1 && _jsxs("div", { className: "formspec-workspace__previous-next", children: [_jsx("button", { type: "button", disabled: activeIndex === 0, onClick: () => navigate(pages[activeIndex - 1]), children: chrome('wizard.previous') }), _jsx("button", { type: "button", disabled: activeIndex === pages.length - 1, onClick: () => navigate(pages[activeIndex + 1]), children: chrome('wizard.next') })] }), root.children.filter(node => !content.has(node) && node.component !== 'ValidationSummary').map(renderShared)] }), _jsxs("aside", { className: "formspec-workspace__findings", "aria-labelledby": findingsHeading, children: [_jsx(Heading, { id: findingsHeading, children: chrome('workspace.findings') }), _jsx("p", { children: chrome('workspace.filled', { filled: progress.form.filled, total: progress.form.total }) }), snapshot.report === null && _jsx("p", { children: chrome('workspace.validationUnavailable') }), findings.length > 0 && _jsx("ul", { children: findings.map(row => {
                                    const page = row.sectionId && pages.find(page => page.id === row.sectionId);
                                    const message = chrome(row.severity === 'error' ? 'workspace.error'
                                        : row.severity === 'warning' ? 'workspace.warning' : 'workspace.info', { message: row.text });
                                    return _jsx("li", { className: `formspec-shape-${row.severity}`, children: row.jumpPath ? _jsx("button", { type: "button", onClick: () => jumpTo(row.jumpPath), children: message })
                                            : page ? _jsx("button", { type: "button", onClick: () => {
                                                    if (page === active && navigationActive)
                                                        heading.current?.focus();
                                                    else
                                                        navigate(page);
                                                }, children: message })
                                                : message }, row.identity);
                                }) })] })] }) }) }));
}
