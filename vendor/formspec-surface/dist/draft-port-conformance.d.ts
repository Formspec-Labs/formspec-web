/** @filedesc Reusable behavioral checks for authorized Surface draft storage. */
import type { ResponseSelectionDelivery, ResponseSelectionOutcome } from '@formspec-org/types';
import type { DraftKey, DraftPort } from './draft-port.js';
/** Supply a fresh port and real authorized/denied caller settings per fixture. */
export interface DraftPortFixture {
    port: DraftPort;
    deny: () => void | Promise<void>;
    key?: DraftKey;
    otherKeys?: readonly DraftKey[];
    pins?: {
        instance: string;
        initialResponseId: string;
        newerResponseId: string;
        addInitial(): Promise<void>;
        addNewer(): Promise<void>;
        select(pin: ResponseSelectionDelivery): Promise<ResponseSelectionOutcome>;
    };
}
export declare const draftPortConformance: {
    'isolates scopes, Definitions and subjects'({ port, key: address, otherKeys }: DraftPortFixture): Promise<void>;
    'checks authorization before revealing a version mismatch'({ port, deny, key: address }: DraftPortFixture): Promise<void>;
    'denies all operations on a never-saved key'({ port, deny, key: address }: DraftPortFixture): Promise<void>;
    'admits one create when both callers saw absence'({ port, key: address }: DraftPortFixture): Promise<void>;
    'commits answers and summary at the winning revision'({ port, key: address }: DraftPortFixture): Promise<void>;
    'reports missing and invalidated summaries without returning answers or creating a draft'({ port, key: address }: DraftPortFixture): Promise<void>;
    'refuses creating a draft when its at-open filing is missing'({ port, key: address, pins }: DraftPortFixture): Promise<void>;
    'records an empty at-open pin'({ port, key: address, pins }: DraftPortFixture): Promise<void>;
    'records an at-open pin once and reports a newer filing without changing the pin'({ port, key: address, pins }: DraftPortFixture): Promise<void>;
};
