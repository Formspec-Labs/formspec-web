import { IntakeBanner } from './intake-banner.js';
import { CeremonyFrame } from './ceremony-frame.js';
import { ReceiptPanel } from './receipt-panel.js';
import { QueueTable } from './queue-table.js';
export { IntakeBanner } from './intake-banner.js';
export { CeremonyFrame } from './ceremony-frame.js';
export { ReceiptPanel } from './receipt-panel.js';
export { QueueTable } from './queue-table.js';
export { WidgetEmptyState } from './empty-state.js';
/**
 * `widgetShape.widgetName` → component, for the starter set.
 *
 * The `x-` prefixed spellings are the names the surface-render-v10 bundle
 * authors, kept so a signed bundle binds without re-signing. The bare spellings
 * are the same components under names a new module would more naturally write —
 * the schema permits both, since this field carries no pattern.
 */
export const STARTER_WIDGETS = {
    'x-intake-banner': IntakeBanner,
    'x-ceremony-frame': CeremonyFrame,
    'x-receipt-panel': ReceiptPanel,
    'x-queue-panel': QueueTable,
    IntakeBanner,
    CeremonyFrame,
    ReceiptPanel,
    QueueTable,
};
export function starterWidgetModule(moduleId) {
    return { moduleId, widgets: STARTER_WIDGETS };
}
