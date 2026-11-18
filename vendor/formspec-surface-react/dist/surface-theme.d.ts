/** @filedesc Emit a granted Theme onto a shell-owned element and clean up on change. */
import { type RefObject } from 'react';
import type { ThemeDocument } from '@formspec-org/types';
export declare function useSurfaceThemeTokens(element: RefObject<HTMLElement | null>, theme: ThemeDocument | undefined): void;
