import { createContext, type ReactNode } from 'react';
import type { Composition } from '../composition/types.ts';

/**
 * React context carrying the Composition.
 * Per web ADR-0009 §Composition lifecycle, the shell consumes the Composition
 * via this context only; direct adapter imports are forbidden in src/app/.
 */
export const CompositionContext = createContext<Composition | null>(null);

export function CompositionProvider({
  value,
  children,
}: {
  value: Composition;
  children: ReactNode;
}) {
  return <CompositionContext.Provider value={value}>{children}</CompositionContext.Provider>;
}
