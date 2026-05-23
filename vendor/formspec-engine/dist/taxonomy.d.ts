/** @filedesc Data type taxonomy predicates per Core spec §4.2.3 — 13 canonical data types. */
/** True if `dataType` is a numeric type (integer, decimal). */
export declare function isNumericType(dataType: string): boolean;
/** True if `dataType` is a date/time type (date, time, dateTime). */
export declare function isDateType(dataType: string): boolean;
/** True if `dataType` is a choice type (choice, multiChoice). */
export declare function isChoiceType(dataType: string): boolean;
/** True if `dataType` is a text type (string, text). */
export declare function isTextType(dataType: string): boolean;
/** True if `dataType` is the binary/attachment type. */
export declare function isBinaryType(dataType: string): boolean;
/** True if `dataType` is boolean. */
export declare function isBooleanType(dataType: string): boolean;
/** True if `dataType` is money ({amount, currency} object). */
export declare function isMoneyType(dataType: string): boolean;
/** True if `dataType` is uri. */
export declare function isUriType(dataType: string): boolean;
