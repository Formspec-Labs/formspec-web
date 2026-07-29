import { describe, expect, it } from 'vitest';
import {
  respondentWidgetModule,
} from '../../src/verifying-surface/respondent/widget-module.ts';

describe('public respondent widget module', () => {
  it('publishes only intake and receipt widgets', () => {
    const module = respondentWidgetModule('x-respondent');

    expect(Object.keys(module.widgets).sort()).toEqual([
      'IntakeBanner',
      'ReceiptPanel',
      'x-intake-banner',
      'x-receipt-panel',
    ]);
    expect(module.widgets).not.toHaveProperty('CeremonyFrame');
    expect(module.widgets).not.toHaveProperty('QueueTable');
    expect(module.widgets).not.toHaveProperty('x-ceremony-frame');
    expect(module.widgets).not.toHaveProperty('x-queue-panel');
  });
});
