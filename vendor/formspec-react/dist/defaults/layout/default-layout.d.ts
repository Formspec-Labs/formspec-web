/** @filedesc Default layout component — semantic HTML containers with CSS class structure. */
import React from 'react';
import type { LayoutComponentProps } from '../../component-map';
/**
 * Default layout renderer — dispatches to the correct container component
 * based on node.component, applying formspec CSS classes and theme styles.
 */
export declare function DefaultLayout({ node, children }: LayoutComponentProps): import("react/jsx-runtime").JSX.Element;
interface LayoutProps {
    node: LayoutComponentProps['node'];
    children?: React.ReactNode;
    themeClass: string;
    style?: React.CSSProperties;
}
/** Divider (component §5.15): a rule, or `label` centered between two rules. `label` overrides `node.props.label`. */
export declare function DividerLayout({ node, themeClass, style, label, }: Omit<LayoutProps, 'children'> & {
    label?: string;
}): import("react/jsx-runtime").JSX.Element;
export {};
