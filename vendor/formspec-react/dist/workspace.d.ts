/** @filedesc Section navigation, question search and live findings for Core workspace mode. */
import React from 'react';
import { type LayoutNode } from '@formspec-org/layout';
import type { WorkspacePage } from './plan-page-mode';
export declare const WorkspaceFieldJump: React.Context<((path: string) => void) | null>;
export declare function Workspace({ root, pages }: {
    root: LayoutNode;
    pages: WorkspacePage[];
}): import("react/jsx-runtime").JSX.Element;
