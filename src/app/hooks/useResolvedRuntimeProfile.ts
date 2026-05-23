import { useContext } from 'react';
import { ResolvedRuntimeProfileContext } from '../RuntimeProfileProvider.tsx';
import type { ResolvedRuntimeProfile } from '../../policy/index.ts';

export function useResolvedRuntimeProfile(): ResolvedRuntimeProfile {
  const profile = useContext(ResolvedRuntimeProfileContext);
  if (!profile) {
    throw new Error(
      'useResolvedRuntimeProfile must be called inside a <RuntimeProfileProvider>',
    );
  }
  return profile;
}
