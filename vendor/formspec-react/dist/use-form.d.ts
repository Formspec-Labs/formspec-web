import type { ValidationOverride, ValidationProfile } from '@formspec-org/types';
export interface SubmitOptions {
    profile?: ValidationProfile;
    validationTuple?: ValidationOverride;
    id?: string;
    author?: {
        id: string;
        name?: string;
    };
    subject?: {
        id: string;
        type?: string;
    };
}
export interface UseFormResult {
    title: string;
    description: string;
    isValid: boolean;
    validationSummary: {
        errors: number;
        warnings: number;
        infos: number;
    };
    submit(options?: SubmitOptions): any;
    getResponse(meta?: Record<string, any>): any;
}
/**
 * Form-level state from FormViewModel.
 * Provides title, validity, and submit/response access.
 */
export declare function useForm(): UseFormResult;
