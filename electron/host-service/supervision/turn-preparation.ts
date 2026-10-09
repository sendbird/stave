/** Cancellation of read-only preparation never retries or cancels a dispatched write. */
export async function prepareRunTurn<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Turn preparation cancelled", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([read(), cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
