import { describe, expect, it } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { createDemoComposition } from '../../src/composition/demo.ts';
import { applyBrandTheme, getUpstreamTokenRegistry } from '../../src/theme/theme.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { demoSampleForm } from '../../src/demo/index.ts';

describe('composition root smoke', () => {
  it('createStubComposition wires all 5 MVP ports', () => {
    const c = createStubComposition();
    expect(c.definitionSource).toBeDefined();
    expect(c.draftStore).toBeDefined();
    expect(c.submitTransport).toBeDefined();
    expect(c.identityProvider).toBeDefined();
    expect(c.notificationDelivery).toBeDefined();
  });

  it('createDemoComposition wires stubs and registers the sample form fixture', async () => {
    const c = createDemoComposition();
    const definition = await c.definitionSource.getDefinition(demoSampleForm.url, demoSampleForm.version);
    expect(c.mode).toBe('demo');
    expect(definition.title).toBe('Demo Benefits Intake');
  });

  it('createDefaultComposition falls back to demo mode without server env', () => {
    const c = createDefaultComposition();
    expect(c.definitionSource).toBeDefined();
    expect(c.identityProvider).toBeDefined();
    expect(c.mode).toBe('demo');
  });

  it('createDefaultComposition wires HTTP adapters when server env is present', () => {
    const c = createDefaultComposition({
      ...departmentAppProfile,
      referenceAdapters: {
        formspecStack: {
          ...departmentAppProfile.referenceAdapters?.formspecStack,
          tenantHeaderDialect: 'formspec',
          formspecServerUrl: 'https://formspec-server.example.test',
        },
      },
    });
    expect(c.mode).toBe('production');
    expect(c.initialDefinitionUrl).toBe(
      'https://formspec-server.example.test/runtime/forms/demo-intake',
    );
  });

  it('SubmitTransport is idempotent on the same key', async () => {
    const { submitTransport } = createStubComposition();
    const key = generateIdempotencyKey();
    const first = await submitTransport.submit(sampleIntakeHandoff, key);
    const second = await submitTransport.submit(sampleIntakeHandoff, key);
    expect(second.referenceNumber).toBe(first.referenceNumber);
  });

  it('SubmitTransport returns a new reference number on a new key', async () => {
    const { submitTransport } = createStubComposition();
    const first = await submitTransport.submit(sampleIntakeHandoff, generateIdempotencyKey());
    const second = await submitTransport.submit(sampleIntakeHandoff, generateIdempotencyKey());
    expect(second.referenceNumber).not.toBe(first.referenceNumber);
  });

  it('IdentityProvider subscribe receives initial null then update on authenticate', async () => {
    const { identityProvider } = createStubComposition();
    const received: Array<unknown> = [];
    const unsubscribe = identityProvider.subscribe((c) => received.push(c));
    expect(received).toEqual([null]);
    const [option] = await identityProvider.discover();
    if (!option) throw new Error('expected at least one IdP option');
    const claim = await identityProvider.authenticate(option);
    expect(claim.assuranceLevel).toBe('L1');
    expect(received).toHaveLength(2);
    expect(received[1]).toBe(claim);
    unsubscribe();
  });

  it('consumes the upstream token registry vocabulary for brand overrides', () => {
    const registry = getUpstreamTokenRegistry();
    expect(registry).toHaveProperty('$formspecTokenRegistry', '1.0');
    expect(JSON.stringify(registry)).toContain('color.primary');
  });

  it('emits adapter-compatible CSS variable aliases from upstream tokens', () => {
    const target = document.createElement('div');
    applyBrandTheme(target);
    expect(target.style.getPropertyValue('--formspec-color-primary')).toBe('#155e56');
    expect(target.style.getPropertyValue('--formspec-color-primary-foreground')).toBe('#ffffff');
    expect(target.style.getPropertyValue('--formspec-color-text')).toBe('#1f2933');
    expect(target.style.getPropertyValue('--formspec-color-text-secondary')).toBe('#5d6b66');
    expect(target.style.getPropertyValue('--formspec-color-warning-border')).toBe('#946112');
  });
});
