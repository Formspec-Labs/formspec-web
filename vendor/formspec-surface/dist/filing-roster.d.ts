import type { FilingPlanInput, FilingStatusPlan } from './filing-status.js';
export declare function planFilingRoster(input: FilingPlanInput, planFixed: (binding: unknown) => FilingStatusPlan): FilingStatusPlan | undefined;
