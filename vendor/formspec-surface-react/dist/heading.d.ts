/**
 * @filedesc `<Heading>` — a heading that takes its level from the composition,
 * not from the component that draws it.
 *
 * Every heading in this package goes through here. A widget or slot renderer
 * that writes `<h2>` directly is a component that is right exactly once — until
 * it is embedded, nested, or dropped onto a route whose host renders its own
 * title. Heading levels are the document outline, and the outline is an
 * accessibility contract (WCAG 1.3.1), so the level is an input.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import type { HeadingLevel } from '@formspec-org/surface';
export interface HeadingProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'children'> {
    level: HeadingLevel;
    children: ReactNode;
}
export declare function Heading({ level, children, ...attributes }: HeadingProps): import("react/jsx-runtime").JSX.Element;
/** One level down, never past 6. */
export declare function nextLevel(level: HeadingLevel): HeadingLevel;
