/** Stop waiting when an owner retires; observe late settlement and remove the listener. */
export function abortable<T>(signal: AbortSignal, task: Promise<T>): Promise<T> {
  if (signal.aborted) { void task.catch(() => {}); return Promise.reject(signal.reason); }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    task.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
