import type { LayoutComponentProps } from '../../component-map';
/**
 * Tabs layout component.
 *
 * Renders a tab bar and tab panels following the WAI-ARIA Tabs pattern.
 * Supports top/bottom/side tab placement, keyboard navigation (Arrow/Home/End),
 * and automatic activation on arrow key press.
 *
 * Tab labels are read from child LayoutNode metadata (fieldItem.label, props.title,
 * or "Tab N" fallback). All panels remain mounted; inactive panels are hidden via
 * the HTML `hidden` attribute to preserve component state across tab switches.
 */
export declare function Tabs({ node, children }: LayoutComponentProps): import("react/jsx-runtime").JSX.Element;
