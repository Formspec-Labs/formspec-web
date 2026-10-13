import { expect, it, vi } from 'vitest';
import { createSubmitFailureReporter } from '../../src/shared/submit-diagnostic.ts';

it('bounds metadata output per owner and omits invalid HTTP status', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const report = createSubmitFailureReporter();
    report('task-transport', 'http-status', NaN);
    for (let index = 0; index < 100; index++) report('controller-review', 'refused');
    expect(warn).toHaveBeenCalledTimes(32);
    expect(warn.mock.calls[0]).toEqual(['Native form Submit diagnostic', '{"stage":"task-transport","kind":"http-status"}']);
    expect(new Set(warn.mock.calls.slice(1).map(call => call[1]))).toEqual(new Set(['{"stage":"controller-review","kind":"refused"}']));
    createSubmitFailureReporter()('host-admission');
    expect(warn).toHaveBeenCalledTimes(33);
  } finally { warn.mockRestore(); }
});

it('never propagates observer failures', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('private observer failure'); });
  try { expect(() => createSubmitFailureReporter()('task-preflight')).not.toThrow(); }
  finally { warn.mockRestore(); }
});
