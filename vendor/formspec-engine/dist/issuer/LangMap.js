/** @filedesc BCP 47-aware LangMap resolver with regional and defaultLanguage fallback. */
export function resolveLangValue(value, requested, defaultLanguage) {
    if (value == null) {
        return undefined;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (value[requested] != null) {
        return value[requested];
    }
    const base = requested.split('-')[0];
    if (base !== requested && value[base] != null) {
        return value[base];
    }
    if (value[defaultLanguage] != null) {
        return value[defaultLanguage];
    }
    const first = Object.keys(value)[0];
    return first ? value[first] : undefined;
}
