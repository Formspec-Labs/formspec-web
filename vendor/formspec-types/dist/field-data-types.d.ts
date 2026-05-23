/**
 * @filedesc Canonical core field dataType values from definition.schema.json.
 */
/** Core built-in field data types (definition.schema.json Field.dataType enum). */
export declare const CORE_FIELD_DATA_TYPES: readonly ["string", "text", "integer", "decimal", "boolean", "date", "dateTime", "time", "uri", "attachment", "choice", "multiChoice", "money"];
export type CoreFieldDataType = (typeof CORE_FIELD_DATA_TYPES)[number];
