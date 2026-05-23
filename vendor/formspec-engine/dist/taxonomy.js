/** @filedesc Data type taxonomy predicates per Core spec §4.2.3 — 13 canonical data types. */
const NUMERIC_TYPES = new Set(['integer', 'decimal']);
const DATE_TYPES = new Set(['date', 'time', 'dateTime']);
const CHOICE_TYPES = new Set(['choice', 'multiChoice']);
const TEXT_TYPES = new Set(['string', 'text']);
/** True if `dataType` is a numeric type (integer, decimal). */
export function isNumericType(dataType) {
    return NUMERIC_TYPES.has(dataType);
}
/** True if `dataType` is a date/time type (date, time, dateTime). */
export function isDateType(dataType) {
    return DATE_TYPES.has(dataType);
}
/** True if `dataType` is a choice type (choice, multiChoice). */
export function isChoiceType(dataType) {
    return CHOICE_TYPES.has(dataType);
}
/** True if `dataType` is a text type (string, text). */
export function isTextType(dataType) {
    return TEXT_TYPES.has(dataType);
}
/** True if `dataType` is the binary/attachment type. */
export function isBinaryType(dataType) {
    return dataType === 'attachment';
}
/** True if `dataType` is boolean. */
export function isBooleanType(dataType) {
    return dataType === 'boolean';
}
/** True if `dataType` is money ({amount, currency} object). */
export function isMoneyType(dataType) {
    return dataType === 'money';
}
/** True if `dataType` is uri. */
export function isUriType(dataType) {
    return dataType === 'uri';
}
