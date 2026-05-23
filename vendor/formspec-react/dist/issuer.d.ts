import { type IFormEngine, type IssuerSource } from '@formspec-org/engine';
export interface IssuerChromeSlotProps {
    engine: IFormEngine;
    hostOrigin?: string;
    mode?: IssuerChromeMode;
    headerWidth?: IssuerChromeHeaderWidth;
}
type IssuerChromeMode = 'light' | 'dark' | 'high-contrast';
type IssuerChromeHeaderWidth = 'wide' | 'narrow';
export declare function IssuerChromeSlot({ engine, hostOrigin, mode, headerWidth, }: IssuerChromeSlotProps): import("react/jsx-runtime").JSX.Element;
export declare function parseQueryIssuerOverride(pageUrl: URL, allowedOrigins: readonly string[]): IssuerSource | undefined;
export {};
