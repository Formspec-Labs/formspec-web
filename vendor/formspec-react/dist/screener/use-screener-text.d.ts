import { type ChromeText } from '../use-chrome-text';
import type { UseScreenerOptions, ScreenerAnswers } from './types';
export interface ScreenerPresentationText {
    chrome: ChromeText;
    text(key: string, fallback: string, answers: ScreenerAnswers, itemKey?: string, bindScope?: boolean): string;
    direction: 'ltr' | 'rtl';
    localeFinding?: string;
    translationWarnings: Array<{
        key: string;
        expression: string;
        message: string;
    }>;
}
export declare function useScreenerText(options: UseScreenerOptions, answers: ScreenerAnswers, requiredKeys?: readonly string[]): ScreenerPresentationText;
