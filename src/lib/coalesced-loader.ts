/** Polls share one request; a refresh after a mutation waits for a newer read. */
export function createCoalescedLoader<T>(read: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  let refreshQueued = false;
  return (options: { fresh?: boolean } = {}): Promise<T> => {
    if (pending) {
      if (options.fresh) refreshQueued = true;
      return pending;
    }
    const run = async (): Promise<T> => {
      for (;;) {
        refreshQueued = false;
        try {
          const result = await read();
          if (!refreshQueued) return result;
        } catch (error) {
          if (!refreshQueued) throw error;
        }
      }
    };
    pending = run().finally(() => { pending = null; });
    return pending;
  };
}
