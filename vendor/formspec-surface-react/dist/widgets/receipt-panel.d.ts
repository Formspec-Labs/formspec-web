import type { SurfaceWidgetProps } from '../widget-api.js';
export interface ReceiptFact {
    label: string;
    value: string;
}
export interface ReceiptPanelData {
    /** The reference the person quotes. Falls back to a route parameter. */
    caseRef?: string;
    /** Durable receipt identifier issued by the service. */
    receiptId?: string;
    /** ISO 8601 server acceptance timestamp, if the host knows one. */
    submittedAt?: string;
    /** Content fingerprint / cryptographic digest of the accepted Response. */
    fingerprint?: string;
    /** Who issued the receipt. */
    issuer?: string;
    /** Anything else worth keeping — one row each. */
    facts?: readonly ReceiptFact[];
}
export declare function ReceiptPanel({ data, route, config }: SurfaceWidgetProps): import("react/jsx-runtime").JSX.Element;
