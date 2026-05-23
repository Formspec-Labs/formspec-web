import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RuntimeProfileProvider } from '../../src/app/RuntimeProfileProvider.tsx';
import { useResolvedRuntimeProfile } from '../../src/app/hooks/useResolvedRuntimeProfile.ts';
import type { ResolvedRuntimeProfile } from '../../src/policy/index.ts';

function ProbeEnabled() {
  const profile = useResolvedRuntimeProfile();
  return <span data-testid="enabled">{[...profile.enabled].join(',')}</span>;
}

describe('RuntimeProfileProvider', () => {
  it('exposes the resolved profile to children via useResolvedRuntimeProfile', () => {
    const profile: ResolvedRuntimeProfile = Object.freeze({
      mode: 'production',
      enabled: new Set(['status']),
      disabled: new Map(),
      limits: {},
    });
    render(
      <RuntimeProfileProvider value={profile}>
        <ProbeEnabled />
      </RuntimeProfileProvider>,
    );
    expect(screen.getByTestId('enabled').textContent).toBe('status');
  });

  it('useResolvedRuntimeProfile throws outside a provider', () => {
    expect(() => render(<ProbeEnabled />)).toThrow(/RuntimeProfileProvider/);
  });
});
