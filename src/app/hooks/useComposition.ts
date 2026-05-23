import { useContext } from 'react';
import type { Composition } from '../../composition/types.ts';
import { CompositionContext } from '../CompositionProvider.tsx';

/**
 * Access the active Composition from inside the React shell.
 * Throws if used outside CompositionProvider — better fail-fast than null-prop drilling.
 */
export function useComposition(): Composition {
  const composition = useContext(CompositionContext);
  if (!composition) {
    throw new Error(
      'useComposition must be used within a CompositionProvider (web ADR-0009 §Composition lifecycle)',
    );
  }
  return composition;
}
