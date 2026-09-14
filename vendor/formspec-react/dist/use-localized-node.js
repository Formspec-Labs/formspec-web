'use client';
/** @filedesc useLocalizedNode — a LayoutNode with its Locale `$component.<id>.<prop>` strings and live group title applied. */
import { createContext, useContext, useMemo } from 'react';
import { computed, signal } from '@preact/signals-core';
import { useFormspecContext, findItemByKey } from './context';
import { useSignal } from './use-signal';
/** The innermost repeat instance (`jobs[1]`) around the node being rendered; '' outside repeats. */
export const RepeatInstanceContext = createContext('');
/** Top-level string props a `$component` key addresses (Locale §3.1.8); an ActionButton label may be `{ literal }`. */
const LOCALIZABLE_PROPS = ['text', 'label', 'title', 'subtitle', 'description', 'triggerLabel', 'pendingLabel', 'placeholder'];
const UNCHANGED = signal(null);
function literalOf(value) {
    if (typeof value === 'string')
        return value;
    const literal = value?.literal;
    return typeof value === 'object' && typeof literal === 'string' ? literal : undefined;
}
/**
 * The node renderers see, live:
 * - an authored node's string props replaced by `$component.<id>.<prop>` Locale strings, `{{}}` evaluated in
 *   form scope, or in the innermost repeat instance scope inside a repeat (Locale §3.3.2);
 * - a group node titled with its group's inline label titled with that group's live label instead
 *   (`engine.getItemLabelSignal`: Locale, label context, `{{}}`).
 * Same rules as webcomponent `resolveCompText` and emit-node's group heading.
 */
export function useLocalizedNode(node) {
    const { engine } = useFormspecContext();
    const instance = useContext(RepeatInstanceContext);
    const localizedProps = useMemo(() => {
        const props = node.props ?? {};
        const id = typeof props.id === 'string' ? props.id : null;
        const groupPath = node.scopeChange && node.bindPath && typeof props.title === 'string' ? node.bindPath : null;
        if (!id && !groupPath)
            return UNCHANGED;
        const group = groupPath ? findItemByKey(engine.getDefinition().items ?? [], groupPath) : null;
        return computed(() => {
            engine.localeSignal.value;
            let next = null;
            const set = (prop, value) => { (next ?? (next = { ...props }))[prop] = value; };
            if (id) {
                const scopePath = instance ? `${instance}.${id}` : '';
                for (const prop of LOCALIZABLE_PROPS) {
                    const inline = literalOf(props[prop]);
                    if (inline === undefined)
                        continue;
                    const resolved = engine.resolveLocaleString(`$component.${id}.${prop}`, inline, scopePath);
                    if (resolved === inline)
                        continue;
                    set(prop, typeof props[prop] === 'string' ? resolved : { ...props[prop], literal: resolved });
                }
            }
            if (groupPath && group?.type === 'group' && (next ?? props).title === group.label) {
                const label = engine.getItemLabelSignal(groupPath)?.value;
                if (label && label !== group.label)
                    set('title', label);
            }
            return next;
        });
    }, [engine, instance, node]);
    const props = useSignal(localizedProps);
    return useMemo(() => (props ? { ...node, props } : node), [node, props]);
}
