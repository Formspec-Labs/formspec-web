import type { ReactNode } from 'react';

/** Shared presentation only; child notices retain their live-region and action semantics. */
export function SessionStatus({ children }: { children: ReactNode }) {
  return <div className="submit-notice session-status">{children}</div>;
}
