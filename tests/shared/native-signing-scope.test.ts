import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';
import { admitNativeSigningScope, nativeSigningActionMappings, signingScopeAllows } from '../../src/shared/native-signing-scope.ts';

function fixture() {
  const bundle = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/native-signing-r5/native-bundle.json'), 'utf8')) as BundleExport;
  const selection = { surface: { ...bundle.manifest.surfaces![0], version: bundle.manifest.surfaces![0].version! },
    route: 'signing', ceremonySlot: 'ceremony', reviewSlot: 'review' };
  return { bundle, selection, moduleId: bundle.manifest.modules![0].id };
}
describe('explicit native signing scope', () => {
  it('selects intake and correction independently in the exact frozen Studio multi-ceremony bundle', () => {
    const bytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/photo-complete-successor-v1.bundle.json'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('4df93304ccd95cf5f3ab46c2ab2c3e422883ac5cd8ca0f05b9663ec9f7e42b9a');
    const bundle = JSON.parse(bytes.toString('utf8')) as BundleExport;
    const intake = admitNativeSigningScope(bundle, 'x-demo-signing', { surface: { url: 'urn:formspec:demo:d1:signing-app:surface', version: '0.3.3' },
      route: 'signing', ceremonySlot: 'ceremony', reviewSlot: 'review' })!;
    const correction = admitNativeSigningScope(bundle, 'x-demo-signing', { surface: { url: 'urn:formspec:demo:d1:complete-app:surface:correction', version: '0.3.3' },
      route: 'correction-signing', ceremonySlot: 'ceremony', reviewSlot: 'review' })!;
    expect(intake.identity.surface.url).not.toBe(correction.identity.surface.url);
    expect((correction.ceremony.binding as Record<string, unknown>).actionBindings).toMatchObject({ sign: { actionRef: 'sign-correction' } });
    expect((correction.ceremony.binding as { actionBindings: object }).actionBindings).not.toHaveProperty('submit');
    expect(signingScopeAllows(intake.identity, { surfaceId: correction.identity.surfaceId, surfaceRef: correction.identity.surface.url,
      routeId: correction.identity.route, slotId: 'ceremony', moduleId: 'x-demo-signing', widgetName: 'SigningCeremony' })).toBe(false);
  });

  it('leaves omission to the existing strict package-wide checks', () => {
    const f = fixture();
    expect(admitNativeSigningScope(f.bundle, f.moduleId)).toBeUndefined();
  });
  it('admits one immutable identity and ignores an unrelated ceremony with conflicting bindings', () => {
    const f = fixture(), surface = dereferenceBundleExport(f.bundle).surfaces[0];
    const other = structuredClone(surface.routes.find(route => route.id === 'signing')!);
    other.id = 'other-signing'; other.path = '/other-signing';
    (other.slots![1].binding as Record<string, unknown>).dataBindings = { response: { catalogRef: 'urn:other', sourceRef: 'other' } };
    surface.routes.push(other);
    const selected = admitNativeSigningScope(f.bundle, f.moduleId, f.selection)!;
    expect(selected.route.id).toBe('signing');
    expect(selected.ceremony.id).toBe('ceremony');
    const actionRef = ((selected.ceremony.binding as { actionBindings: { sign: { actionRef: string } } }).actionBindings.sign.actionRef);
    expect(nativeSigningActionMappings(dereferenceBundleExport(f.bundle), actionRef)).toHaveLength(2);
    const mappings = nativeSigningActionMappings(dereferenceBundleExport(f.bundle), actionRef, selected.identity);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].route.id).toBe('signing');
    f.selection.surface.version = 'changed';
    expect(selected.identity.surface.version).toBe('0.1.5');
    expect(Object.isFrozen(selected.identity.surface)).toBe(true);
  });
  it.each(['version', 'surface', 'route', 'route class', 'ceremony', 'review', 'same slot', 'module', 'widget', 'duplicate route', 'duplicate slot'] as const)('refuses %s drift without a fallback ceremony', mode => {
    const f = fixture(), surface = dereferenceBundleExport(f.bundle).surfaces[0];
    const route = surface.routes.find(route => route.id === 'signing')!;
    if (mode === 'version') f.selection.surface.version = 'other';
    if (mode === 'surface') f.selection.surface.url = 'urn:other';
    if (mode === 'route') f.selection.route = 'other';
    if (mode === 'route class') route.routeClass = 'operation';
    if (mode === 'ceremony') f.selection.ceremonySlot = 'absent';
    if (mode === 'review') f.selection.reviewSlot = 'absent';
    if (mode === 'same slot') f.selection.reviewSlot = f.selection.ceremonySlot;
    if (mode === 'module') f.moduleId = 'other';
    if (mode === 'widget') (route.slots![1].binding as Record<string, unknown>).widgetName = 'ResponseReview';
    if (mode === 'duplicate route') surface.routes.push(structuredClone(route));
    if (mode === 'duplicate slot') route.slots!.push(structuredClone(route.slots![1]));
    expect(() => admitNativeSigningScope(f.bundle, f.moduleId, f.selection)).toThrow();
  });
  it('admits host delivery only for the selected route, exact slot and widget', () => {
    const f = fixture(), scope = admitNativeSigningScope(f.bundle, f.moduleId, f.selection)!.identity;
    const context = { surfaceId: scope.surfaceId, surfaceRef: scope.surface.url, routeId: scope.route,
      slotId: scope.ceremonySlot, moduleId: scope.moduleId, widgetName: 'SigningCeremony' };
    expect(signingScopeAllows(scope, context)).toBe(true);
    expect(signingScopeAllows(scope, { ...context, slotId: scope.reviewSlot, widgetName: 'ResponseReview' })).toBe(true);
    for (const key of ['surfaceId', 'surfaceRef', 'routeId', 'slotId', 'moduleId', 'widgetName'] as const) {
      expect(signingScopeAllows(scope, { ...context, [key]: 'foreign' })).toBe(false);
    }
  });
});
