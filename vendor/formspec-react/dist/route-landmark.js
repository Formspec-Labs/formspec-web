export function routeLandmarkAttrs(node) {
    const landmark = node.uiGraphRoutePolicy?.a11y?.landmark;
    switch (landmark) {
        case 'main':
        case 'navigation':
        case 'complementary':
            return { role: landmark };
        default:
            return {};
    }
}
