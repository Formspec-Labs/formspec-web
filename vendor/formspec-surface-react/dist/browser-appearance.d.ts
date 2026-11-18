/** @filedesc Remember the browser appearance and honor a host's scheme. */
import { type RefObject } from 'react';
type Scheme = 'light' | 'dark';
type Appearance = 'system' | Scheme;
/** Inline in the page head so the browser can paint the saved scheme before React mounts. */
export declare const SURFACE_APPEARANCE_SCRIPT: string;
export declare function useBrowserAppearance(): {
    preference: Appearance;
    appearance: Scheme;
    choose: (value: string) => void;
};
export declare function useHostAppearance(root: RefObject<HTMLElement | null>, enabled: boolean): Scheme | undefined;
export {};
