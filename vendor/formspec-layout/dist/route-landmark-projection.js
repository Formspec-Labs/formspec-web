/**
 * Map validated route policy to active landmark attributes.
 * Callers MUST gate overlay roots (Modal, Dialog, Popover) separately.
 */
export function resolveRouteLandmark(policy) {
    const a11y = policy?.a11y;
    if (!a11y || a11y.landmarkSuppressed) {
        return {};
    }
    switch (a11y.landmark) {
        case 'main':
        case 'navigation':
        case 'complementary':
            return { role: a11y.landmark };
        case 'region': {
            const label = typeof a11y.landmarkLabel === 'string' ? a11y.landmarkLabel.trim() : '';
            return label.length > 0 ? { role: 'region', ariaLabel: label } : {};
        }
        default:
            return {};
    }
}
