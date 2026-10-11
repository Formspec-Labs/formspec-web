import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { createFormEngine } from '@formspec-org/engine/render';
import { sampleFormDefinition, sampleFormResponse } from '../../src/adapter-conformance/fixtures.ts';
beforeAll(() => initFormspecEngine());
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResponseActionsDocument } from '@formspec-org/types';
import { admitNativeHostEvents, type NativeHostEventCapability } from '../../src/shared/native-host-events.ts';
const document: ResponseActionsDocument = { $formspecResponseActions: '1.0', version: '1', scope: 'response', targetDefinition: { url: 'urn:test:form' },
  actions: [{ id: 'refresh-resource', intent: 'review', validation: { profile: 'off', blocking: 'non-blocking', persistence: 'none' }, effects: [{ type: 'hostEvent', eventName: 'resource-refresh' }] }] };
function fixture() {
  const handle = vi.fn<NativeHostEventCapability['handle']>(async () => {}); const submit = vi.fn(() => ({ response: sampleFormResponse, validationReport: createFormEngine(sampleFormDefinition).getValidationReport({ profile: 'off' }) }));
  const ports = { dispatchHostEvent: vi.fn(), submit };
  const capability = { artifactRef: 'urn:test:actions', actionRef: 'refresh-resource', eventName: 'resource-refresh', handle };
  const admission = { documents: { 'urn:test:actions': document }, definitionUrl: 'urn:test:form', controllerActions: [], capabilities: [capability] };
  const context = { signal: new AbortController().signal, assertCurrent: vi.fn(), refreshSavedFacts: vi.fn(async () => {}) };
  const input = { document, actionRef: 'refresh-resource', ports };
  return { handle, capability, admission, context, input, ports };
}
describe('explicit native host event capabilities', () => {
  it('refuses missing required authored event capability before rendering', () => { const f = fixture(); expect(() => admitNativeHostEvents({ ...f.admission, capabilities: [] })).toThrow('native-host-event-capability-unavailable'); });
  it('refuses wrong event and ambiguous or controller-owned registrations', () => { const f = fixture();
    expect(() => admitNativeHostEvents({ ...f.admission, capabilities: [{ ...f.capability, eventName: 'other' }] })).toThrow('native-host-event-unadmitted');
    expect(() => admitNativeHostEvents({ ...f.admission, capabilities: [f.capability, f.capability] })).toThrow('native-host-event-ambiguous');
    expect(() => admitNativeHostEvents({ ...f.admission, controllerActions: [f.capability] })).toThrow('native-host-event-unadmitted');
  });
  it('awaits the trusted capability and preserves original renderer submit validation', async () => {
    const f = fixture(); let finish!: () => void; f.handle.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    let completed = false; const operation = admitNativeHostEvents(f.admission).invoke(f.input, f.context).then(value => { completed = true; return value; });
    await vi.waitFor(() => expect(f.handle).toHaveBeenCalledOnce()); expect(completed).toBe(false); expect(f.ports.submit).toHaveBeenCalledOnce(); expect(f.ports.dispatchHostEvent).not.toHaveBeenCalled();
    finish(); expect((await operation as { status: string }).status).toBe('completed');
  });
  it('returns a closed failure when the configured capability rejects', async () => {
    const f = fixture(); f.handle.mockRejectedValue(new Error('private provider details')); await expect(admitNativeHostEvents(f.admission).invoke(f.input, f.context)).rejects.toThrow('native-host-event-handler-failed');
  });
  it('refuses a changed artifact before dispatch', async () => { const f = fixture(); const router = admitNativeHostEvents(f.admission); const changed = { ...document, version: '2' }; expect(router.owns(changed, f.input.actionRef)).toBe(false); await expect(router.invoke({ ...f.input, document: changed }, f.context)).rejects.toThrow('native-host-event-unadmitted'); expect(f.handle).not.toHaveBeenCalled(); });
  it('retires a pending result after the host context changes', async () => {
    const f = fixture(); let current = true; f.context.assertCurrent.mockImplementation(() => { if (!current) throw new Error('retired'); }); f.handle.mockImplementation(async () => { current = false; });
    await expect(admitNativeHostEvents(f.admission).invoke(f.input, f.context)).rejects.toThrow('native-host-event-handler-failed');
  });
  it('refuses an already-aborted event before renderer validation or dispatch', async () => {
    const f = fixture(); const abort = new AbortController(); abort.abort(); f.context.signal = abort.signal;
    await expect(admitNativeHostEvents(f.admission).invoke(f.input, f.context)).rejects.toThrow('native-host-event-handler-failed');
    expect(f.ports.submit).not.toHaveBeenCalled(); expect(f.handle).not.toHaveBeenCalled();
  });
  it('retires escaped refresh after timeout without initiating saved qualification', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); let refresh!: () => Promise<void>;
      f.handle.mockImplementation(async context => { refresh = context.refreshSavedFacts; await new Promise<void>(() => {}); });
      const operation = admitNativeHostEvents(f.admission).invoke(f.input, f.context); const refused = expect(operation).rejects.toThrow('native-host-event-handler-failed');
      await vi.advanceTimersByTimeAsync(30_001); await refused;
      expect(() => refresh()).toThrow(); expect(f.context.refreshSavedFacts).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('completes a current saved refresh beyond ten seconds within the bounded budget', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.handle.mockImplementation(async context => { await new Promise<void>(resolve => setTimeout(resolve, 20_000)); context.assertCurrent(); await context.refreshSavedFacts(); });
      let completed = false;
      const operation = admitNativeHostEvents(f.admission).invoke(f.input, f.context).then(result => { completed = true; return result; });
      await vi.advanceTimersByTimeAsync(10_001); expect(completed).toBe(false); expect(f.context.refreshSavedFacts).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000); expect((await operation as { status: string }).status).toBe('completed');
      expect(f.context.refreshSavedFacts).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it('joins a refresh started without awaiting it, and prevents new refresh after completion', async () => {
    const f = fixture(); let refresh!: () => Promise<void>; let finish!: () => void;
    f.context.refreshSavedFacts.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    f.handle.mockImplementation(async context => { refresh = context.refreshSavedFacts; void refresh(); });
    let completed = false; const operation = admitNativeHostEvents(f.admission).invoke(f.input, f.context).then(result => { completed = true; return result; });
    await vi.waitFor(() => expect(f.context.refreshSavedFacts).toHaveBeenCalledOnce()); expect(completed).toBe(false);
    expect(() => refresh()).toThrow('native-host-event-retired'); expect(f.context.refreshSavedFacts).toHaveBeenCalledOnce();
    finish(); await operation;
    expect(() => refresh()).toThrow('native-host-event-retired');
  });
});
