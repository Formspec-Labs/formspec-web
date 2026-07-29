import {
  IntakeBanner,
  ReceiptPanel,
  type SurfaceWidgetModule,
} from '@formspec-org/surface-react';

/**
 * Runtime widgets exposed to the public respondent actor.
 *
 * The upstream starter set also contains staff and signing-ceremony widgets.
 * This narrow module deliberately publishes only the intake and receipt names
 * admitted by the respondent AppGraph policy.
 */
export function respondentWidgetModule(moduleId: string): SurfaceWidgetModule {
  return {
    moduleId,
    widgets: Object.freeze({
      'x-intake-banner': IntakeBanner,
      IntakeBanner,
      'x-receipt-panel': ReceiptPanel,
      ReceiptPanel,
    }),
  };
}
