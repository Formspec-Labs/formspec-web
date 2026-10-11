import { describe, expect, it } from 'vitest';
import { createProtectedScreenerRoutes } from '../../src/shared/protected-screener-routes.ts';
describe('explicit protected Screener destinations', () => {
  it.each([undefined, 'surface:help', 'surface:application'])('keeps public help available for accepted target %s', accepted => {
    const application = {}; const help = {};
    const routes = createProtectedScreenerRoutes({ allowedTargets: ['surface:application', 'surface:help'], protectedTargets: ['surface:application'],
      resolve: target => target === 'surface:application' ? [application] : [help], accepted: target => target === accepted });
    expect(routes.requiresScreening(help)).toBe(false);
    expect(routes.requiresScreening(application)).toBe(accepted !== 'surface:application');
  });
  it.each([[], ['surface:foreign'], ['surface:application', 'surface:application']].map(protectedTargets => ({ protectedTargets })))('refuses missing, foreign or duplicate protected policy $protectedTargets', ({ protectedTargets }) => {
    expect(() => createProtectedScreenerRoutes({ allowedTargets: ['surface:application'], protectedTargets,
      resolve: () => [{}], accepted: () => true })).toThrow();
  });
  it.each([0, 2])('refuses %s resolved destinations before admission', count => {
    expect(() => createProtectedScreenerRoutes({ allowedTargets: ['surface:application'], protectedTargets: ['surface:application'],
      resolve: () => Array.from({ length: count }, () => ({})), accepted: () => true })).toThrow();
  });
});
