/**
 * Operation queues for the agent-run supervisor, one per key (a run, or a
 * task while a run is admitted on it). Operations that share a key run one at
 * a time in the order they were queued; operations that share no key never
 * wait on each other, however slow either one is.
 *
 * An operation may name several keys (a start names its task and the task's
 * current run). It then waits for every earlier operation on any of them, and
 * every later operation on any of them waits for it. An operation only ever
 * waits on operations queued before it, so two operations cannot wait on each
 * other. An operation must not queue on a key it holds and await the result.
 *
 * Used by: `agent-run-runtime.ts`.
 */
export function createRunOperationQueues() {
  /** The last operation queued on each key; settles once it ran, never rejects. */
  const tails = new Map<string, Promise<void>>();

  function enqueue<T>(keys: string | readonly string[], operation: () => Promise<T> | T): Promise<T> {
    const names = [...new Set(typeof keys === "string" ? [keys] : keys)];
    const earlier = names.flatMap((name) => tails.get(name) ?? []);
    // Always started from a promise, never inline: the caller can record the
    // operation's promise before the operation itself runs.
    const next = (earlier.length === 0 ? Promise.resolve() : Promise.all(earlier)).then(() => operation());
    const tail = next.then(() => undefined, () => undefined);
    for (const name of names) tails.set(name, tail);
    void tail.then(() => {
      for (const name of names) if (tails.get(name) === tail) tails.delete(name);
    });
    return next;
  }

  /** Resolves once no operation is queued or running on any key, including ones queued meanwhile. */
  async function drain() {
    while (tails.size > 0) await Promise.all(new Set(tails.values()));
  }

  return { enqueue, drain };
}
