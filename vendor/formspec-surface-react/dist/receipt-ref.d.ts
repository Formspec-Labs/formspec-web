/** @filedesc Shared receipt reference formatting and filing status label helpers. */
import { type ReactNode } from 'react';
import type { SurfaceStrings } from '@formspec-org/surface';
import type { FiledObservation } from './draft-session.js';
export declare function filingStatusLabel(status: FiledObservation['status'], strings: SurfaceStrings): string;
/**
 * Insert zero-width `<wbr />` break opportunities after URN colons so long
 * receipt identifiers wrap at segment boundaries instead of leaving single-character
 * orphans, while preserving exact `textContent`.
 */
export declare function FormattedReceiptRef({ reference }: {
    reference: string;
}): ReactNode;
