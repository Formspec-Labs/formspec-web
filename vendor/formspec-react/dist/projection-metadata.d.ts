/** @filedesc Inert projection metadata helpers shared by default React renderers. */
import type { LayoutNode } from '@formspec-org/layout';
export type ProjectionMetadataAttrs = Record<`data-formspec-${string}`, string>;
export declare function componentGraphIdentityAttrs(node: Pick<LayoutNode, 'componentGraphIdentity'>): ProjectionMetadataAttrs;
export declare function uiGraphRoutePolicyAttrs(node: Pick<LayoutNode, 'uiGraphRoutePolicy'>): ProjectionMetadataAttrs;
export declare function projectionMetadataAttrs(node: Pick<LayoutNode, 'componentGraphIdentity' | 'uiGraphRoutePolicy'>): ProjectionMetadataAttrs;
