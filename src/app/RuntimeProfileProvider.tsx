import { createContext, type ReactNode } from 'react';
import type { ResolvedRuntimeProfile } from '../policy/index.ts';

/**
 * Carries the ResolvedRuntimeProfile to the React shell per web ADR-0011 §Decision:
 * "The React shell MUST render from the resolved runtime profile. It MUST NOT
 *  inspect raw instance, org, or form policy independently."
 */
export const ResolvedRuntimeProfileContext = createContext<ResolvedRuntimeProfile | null>(
  null,
);

export function RuntimeProfileProvider({
  value,
  children,
}: {
  value: ResolvedRuntimeProfile;
  children: ReactNode;
}) {
  return (
    <ResolvedRuntimeProfileContext.Provider value={value}>
      {children}
    </ResolvedRuntimeProfileContext.Provider>
  );
}
