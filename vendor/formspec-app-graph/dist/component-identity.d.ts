/** @filedesc Component graph identity helpers. */
import type { AppGraphArtifactRef } from './types.js';
export interface AppGraphComponentMembershipIdentity {
    handle: string;
    url?: string;
    version?: string;
}
export interface AppGraphComponentNodeIdentity {
    component: AppGraphComponentMembershipIdentity;
    surface: AppGraphArtifactRef;
    route: string;
    nodePath: string;
    id?: string;
    nodeId?: string;
}
export declare function componentNodeIdentityKey(identity: AppGraphComponentNodeIdentity): string;
