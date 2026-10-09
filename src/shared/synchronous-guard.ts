/** Async or value-bearing guards cannot authorize a synchronous effect boundary. */
export function assertSynchronousGuard(assert: () => void): void {
  const result: unknown = assert();
  if (result !== undefined) {
    void Promise.resolve(result).catch(() => {});
    throw new Error('Current-context guard must be synchronous');
  }
}
