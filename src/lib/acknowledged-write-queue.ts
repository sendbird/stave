/** Serialized, coalesced writes. Failed values remain pending until retried. */
export function createAcknowledgedWriteQueue<K, V>(options: {
  write: (key: K, value: V) => Promise<void>;
  delayMs: number;
  onFailure: (key: K, error: unknown) => void;
  onSuccess?: (key: K) => void;
}) {
  type Pending = { value: V };
  type Entry = {
    pending?: Pending;
    running?: Promise<void>;
    timer?: ReturnType<typeof setTimeout>;
  };
  const entries = new Map<K, Entry>();

  function put(key: K, value: V) {
    const entry = entries.get(key) ?? {};
    clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.pending = { value };
    entries.set(key, entry);
    return entry;
  }

  async function flush(key: K) {
    const entry = entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = undefined;
    while (entry.running || entry.pending) {
      if (entry.running) {
        await entry.running;
        continue;
      }
      const pending = entry.pending!;
      entry.pending = undefined;
      const running = Promise.resolve()
        .then(() => options.write(key, pending.value))
        .then(() => options.onSuccess?.(key))
        .catch((error: unknown) => {
          // An edit arriving during the failed write supersedes that value.
          entry.pending ??= pending;
          options.onFailure(key, error);
          throw error;
        })
        .finally(() => {
          entry.running = undefined;
        });
      entry.running = running;
      await running;
    }
    clearTimeout(entry.timer);
    if (entries.get(key) === entry) entries.delete(key);
  }

  return {
    save(key: K, value: V) {
      put(key, value);
      return flush(key);
    },
    schedule(key: K, value: V) {
      const entry = put(key, value);
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        // Failure was reported and retained above. Never create an unhandled
        // rejection from an automatic save or an unbounded retry loop.
        void flush(key).catch(() => {});
      }, options.delayMs);
    },
    async flushAll() {
      const results = await Promise.allSettled([...entries.keys()].map(flush));
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (failures.length) {
        throw new AggregateError(failures, "Some workspace changes could not be saved.");
      }
    },
  };
}
