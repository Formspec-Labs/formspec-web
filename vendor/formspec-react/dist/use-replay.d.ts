import type { ValidationProfile } from '@formspec-org/types';
export type ReplayEvent = {
    type: 'setValue';
    path: string;
    value: any;
} | {
    type: 'addRepeatInstance';
    path: string;
} | {
    type: 'removeRepeatInstance';
    path: string;
    index: number;
} | {
    type: 'evaluateShape';
    shapeId: string;
} | {
    type: 'getValidationReport';
    profile?: ValidationProfile;
} | {
    type: 'getResponse';
    profile?: ValidationProfile;
};
export interface ReplayApplyResult {
    ok: boolean;
    event: ReplayEvent;
    output?: any;
    error?: string;
}
export interface ReplayResult {
    applied: number;
    results: ReplayApplyResult[];
    errors: Array<{
        index: number;
        event: ReplayEvent;
        error: string;
    }>;
}
export interface UseReplayResult {
    /** Apply a single replay event. */
    applyEvent: (event: ReplayEvent) => ReplayApplyResult;
    /** Replay a sequence of events. */
    replay: (events: ReplayEvent[], options?: {
        stopOnError?: boolean;
    }) => ReplayResult;
}
export declare function useReplay(): UseReplayResult;
