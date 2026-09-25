type TurnNotification = {
  method?: string;
  params?: unknown;
};

const pendingByThread = new Map<string, Promise<void>>();
const unsafeThreads = new Set<string>();

/** Block a second turn from resuming a thread whose interrupted start is unsettled. */
export function beginCodexInterruptedThreadCleanup(threadId: string) {
  const previous = pendingByThread.get(threadId);
  let resolve!: () => void;
  const current = new Promise<void>((done) => { resolve = done; });
  const barrier = previous ? previous.then(() => current) : current;
  pendingByThread.set(threadId, barrier);
  void barrier.then(() => {
    if (pendingByThread.get(threadId) === barrier) pendingByThread.delete(threadId);
  });
  let finished = false;
  return (safe: boolean) => {
    if (finished) return;
    finished = true;
    if (!safe) unsafeThreads.add(threadId);
    resolve();
  };
}

export async function canResumeCodexThreadAfterInterrupt(threadId: string) {
  while (true) {
    const pending = pendingByThread.get(threadId);
    if (!pending) return !unsafeThreads.has(threadId);
    await pending;
    if (pendingByThread.get(threadId) === pending) return !unsafeThreads.has(threadId);
  }
}

/** Track native completion before turn/start acknowledges an interrupted turn. */
export function createCodexOrphanTurnCleanup<T extends TurnNotification>(args: {
  threadId: string;
  subscribe: (listener: (message: T) => void) => () => void;
  interrupt: (turnId: string) => Promise<unknown>;
  graceMs: number;
}) {
  const completed = new Set<string>();
  const waiters = new Map<string, () => void>();
  const unsubscribe = args.subscribe((message) => {
    if (message.method !== "turn/completed") return;
    const params = message.params;
    if (!params || typeof params !== "object" ||
        !("threadId" in params) || params.threadId !== args.threadId) return;
    const turn = "turn" in params ? params.turn : null;
    const turnId = turn && typeof turn === "object" && "id" in turn &&
      typeof turn.id === "string" ? turn.id :
      "turnId" in params && typeof params.turnId === "string" ? params.turnId : null;
    if (!turnId) return;
    completed.add(turnId);
    waiters.get(turnId)?.();
  });

  return {
    async settle(turnStart: Promise<{ turn: { id: string } }>): Promise<boolean> {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), args.graceMs);
        timeout.unref?.();
      });
      const cleanup = turnStart.then(async ({ turn }) => {
        if (completed.has(turn.id)) return true;
        void args.interrupt(turn.id).catch(() => {});
        await new Promise<void>((resolve) => {
          if (completed.has(turn.id)) resolve();
          else waiters.set(turn.id, resolve);
        });
        return true;
      }).catch(() => false);
      try {
        return await Promise.race([cleanup, deadline]);
      } finally {
        if (timeout) clearTimeout(timeout);
        waiters.clear();
      }
    },
    hasCompleted(turnId: string) {
      return completed.has(turnId);
    },
    dispose() {
      unsubscribe();
      waiters.clear();
      completed.clear();
    },
  };
}
