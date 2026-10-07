/** @filedesc Pure capture of supplied field wording for retained Response data. */
import type { FormDefinition, FormResponse } from '@formspec-org/types';
export type CapturedResponseFields = Readonly<Record<string, {
    label: string;
    options?: readonly {
        value: string;
        label: string;
    }[];
}>>;
/** Readers supply already qualified wording; this helper does not establish its origin. */
export interface ResponseFieldMetadataReader {
    label(path: string): string | undefined;
    /** Undefined refuses a missing field; an empty array admits a field without options. */
    options(path: string): readonly {
        value: string;
        label: string;
    }[] | undefined;
}
/**
 * Capture only Definition paths present in retained Response data, including
 * indexed repeat rows. Copy metadata so subsequent reader changes cannot alter
 * this snapshot. Reader refusals propagate. No evaluation or Locale lookup occurs.
 */
export declare function captureResponseFieldMetadata(definition: FormDefinition, response: FormResponse, reader: ResponseFieldMetadataReader): CapturedResponseFields;
