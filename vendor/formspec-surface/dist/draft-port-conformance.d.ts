/** @filedesc Reusable behavioral checks for authorized Surface draft storage. */
import type { DraftKey, DraftPort } from './draft-port.js';
/** Supply a fresh port and real authorized/denied caller settings per fixture. */
export interface DraftPortFixture {
    port: DraftPort;
    deny: () => void | Promise<void>;
    key?: DraftKey;
    otherKeys?: readonly DraftKey[];
}
export declare const draftPortConformance: {
    'isolates scopes, Definitions and subjects'({ port, key: address, otherKeys }: DraftPortFixture): Promise<void>;
    'checks authorization before revealing a version mismatch'({ port, deny, key: address }: DraftPortFixture): Promise<void>;
    'denies all operations on a never-saved key'({ port, deny, key: address }: DraftPortFixture): Promise<void>;
    'admits one create when both callers saw absence'({ port, key: address }: DraftPortFixture): Promise<void>;
    'commits answers and summary at the winning revision'({ port, key: address }: DraftPortFixture): Promise<void>;
    'reports missing and invalidated summaries without returning answers or creating a draft'({ port, key: address }: DraftPortFixture): Promise<void>;
};
