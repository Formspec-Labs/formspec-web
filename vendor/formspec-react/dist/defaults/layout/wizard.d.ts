/** @filedesc Wizard layout component — multi-step form navigation with soft validation. */
import React from 'react';
import type { LayoutComponentProps } from '../../component-map';
/**
 * Wizard layout — renders one step at a time with Previous / Next / Submit
 * navigation, optional progress bar, and soft validation on Next.
 *
 * Set `node.props.sidenav` (or `formPresentation.sidenav` on the component
 * document) to show a collapsible step rail; top progress is then hidden
 * (same as the web component).
 */
export declare function Wizard({ node, children }: LayoutComponentProps): React.JSX.Element;
