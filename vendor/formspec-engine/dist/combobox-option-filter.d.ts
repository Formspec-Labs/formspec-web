/** @filedesc Case-insensitive combobox type-ahead: label, value, and optional option keywords. */
export interface ComboboxOptionSearchShape {
    value: string;
    label: string;
    keywords?: readonly string[] | undefined;
}
/** True if query is empty or matches label, value, or any keyword (substring, case-insensitive). */
export declare function optionMatchesComboboxQuery(opt: ComboboxOptionSearchShape, queryRaw: string): boolean;
