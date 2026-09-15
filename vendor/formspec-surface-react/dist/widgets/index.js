import { MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES } from '../widget-state.js';
import { IntakeBanner } from './intake-banner.js';
import { CeremonyFrame } from './ceremony-frame.js';
import { ReceiptPanel } from './receipt-panel.js';
import { QueueTable } from './queue-table.js';
import { StructuredPanel } from './structured-panel.js';
export { IntakeBanner } from './intake-banner.js';
export { CeremonyFrame } from './ceremony-frame.js';
export { ReceiptPanel } from './receipt-panel.js';
export { QueueTable } from './queue-table.js';
export { StructuredPanel, readStructuredPanelPath } from './structured-panel.js';
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
    'x-structured-panel': StructuredPanel,
    IntakeBanner,
    CeremonyFrame,
    ReceiptPanel,
    QueueTable,
    StructuredPanel,
};
export const STRUCTURED_PANEL_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/StructuredPanel@0.1';
export const QUEUE_TABLE_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/QueueTable@0.1';
export const RECEIPT_PANEL_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/ReceiptPanel@0.1';
export const CEREMONY_FRAME_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/CeremonyFrame@0.1';
export const STRUCTURED_PANEL_RENDERED_CONFIG_NODES = [
    { pointerPattern: '', kind: 'structured-panel' },
    { pointerPattern: '/blocks/*', kind: 'structured-panel-block' },
    { pointerPattern: '/blocks/*/items/*', kind: 'structured-panel-field' },
    { pointerPattern: '/blocks/*/columns/*', kind: 'structured-panel-column' },
    { pointerPattern: '/blocks/*/rowAction', kind: 'structured-panel-row-action' },
    {
        pointerPattern: '/blocks/*/rowAction/confirmation',
        kind: 'structured-panel-action-confirmation',
    },
    { pointerPattern: '/actions/*', kind: 'structured-panel-action' },
    {
        pointerPattern: '/actions/*/confirmation',
        kind: 'structured-panel-action-confirmation',
    },
    ...MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES,
];
export const QUEUE_TABLE_RENDERED_CONFIG_NODES = [
    { pointerPattern: '', kind: 'queue-table' },
    { pointerPattern: '/columns/*', kind: 'queue-table-column' },
    { pointerPattern: '/rowAction', kind: 'queue-table-row-action' },
];
export const RECEIPT_PANEL_RENDERED_CONFIG_NODES = [
    { pointerPattern: '', kind: 'receipt-panel' },
];
export const CEREMONY_FRAME_RENDERED_CONFIG_NODES = [
    { pointerPattern: '', kind: 'ceremony-frame' },
];
export function starterWidgetModule(moduleId) {
    const contract = (deliveryContractId, renderedConfigNodes) => ({
        deliveryContractId,
        registryEntryVersion: '0.1.0',
        renderedConfigNodes,
    });
    const structuredPanelContract = contract(STRUCTURED_PANEL_DELIVERY_CONTRACT_ID, STRUCTURED_PANEL_RENDERED_CONFIG_NODES);
    const queueTableContract = contract(QUEUE_TABLE_DELIVERY_CONTRACT_ID, QUEUE_TABLE_RENDERED_CONFIG_NODES);
    const receiptPanelContract = contract(RECEIPT_PANEL_DELIVERY_CONTRACT_ID, RECEIPT_PANEL_RENDERED_CONFIG_NODES);
    const ceremonyFrameContract = contract(CEREMONY_FRAME_DELIVERY_CONTRACT_ID, CEREMONY_FRAME_RENDERED_CONFIG_NODES);
    return {
        moduleId,
        widgets: STARTER_WIDGETS,
        contracts: {
            StructuredPanel: structuredPanelContract,
            'x-structured-panel': structuredPanelContract,
            QueueTable: queueTableContract,
            'x-queue-panel': queueTableContract,
            ReceiptPanel: receiptPanelContract,
            'x-receipt-panel': receiptPanelContract,
            CeremonyFrame: ceremonyFrameContract,
            'x-ceremony-frame': ceremonyFrameContract,
        },
    };
}
