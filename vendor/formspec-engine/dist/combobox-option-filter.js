/** @filedesc Case-insensitive combobox type-ahead: label, value, and optional option keywords. */
/** True if query is empty or matches label, value, or any keyword (substring, case-insensitive). */
export function optionMatchesComboboxQuery(opt, queryRaw) {
    const q = queryRaw.trim().toLowerCase();
    if (!q)
        return true;
    if (opt.label.toLowerCase().includes(q))
        return true;
    if (opt.value.toLowerCase().includes(q))
        return true;
    for (const kw of opt.keywords ?? []) {
        if (String(kw).toLowerCase().includes(q))
            return true;
    }
    return false;
}
