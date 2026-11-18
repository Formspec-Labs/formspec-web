/** @filedesc Identify Definition actions that operate on a committed draft revision. */
import { type ResponseAction } from '@formspec-org/engine/render';
import type { ResponseActionsDocument } from '@formspec-org/types';
export type DraftFencedAction = 'prepare' | 'sign' | 'submit';
export declare function filingAction(document: ResponseActionsDocument | null | undefined, action: ResponseAction | null | undefined): DraftFencedAction | undefined;
