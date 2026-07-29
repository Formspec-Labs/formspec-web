/** @filedesc Surface definition-form slot binding cross-artifact validation against loaded Definitions. */
import { type AppGraphContext, type AppGraphDiagnostic } from './types.js';
/**
 * Surface `definition-form` slot binding URLs MUST appear in App Manifest
 * `definitions[].url` — every form-bearing slot in an app graph references a
 * Definition the manifest explicitly declares. ArtifactResolver loading of those
 * declared Definitions is a separate (resolver-phase) concern; this validator
 * catches the graph-shape gap (Surface references a Definition the manifest
 * doesn't even know about). Surface schema requires `definitionRef` when
 * `slotType === 'definition-form'`; missing-URL is a schema-phase concern, not
 * a cross-artifact one. See surface-spec §"definition-form".
 */
export declare function validateSurfaceDefinitionSlots(context: AppGraphContext): AppGraphDiagnostic[];
