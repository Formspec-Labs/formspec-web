import type { ValidationProfile } from '@formspec-org/types';
/** Engine-internal validation trigger vocabulary. */
export type ValidationTrigger = 'continuous' | 'submit' | 'demand' | 'disabled';
export type ValidationReportOptions = {
    profile?: ValidationProfile;
};
export type EnabledValidationProfile = Exclude<ValidationProfile, 'off'>;
/**
 * Bridges the closed Validation Mapping profile enum to the engine's internal trigger vocabulary.
 */
export declare class DefaultValidationProfileResolver {
    resolve(profile: ValidationProfile): ValidationTrigger;
}
