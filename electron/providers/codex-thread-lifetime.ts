/** Stave's grace period is separate from the server's own unload grace period. */
export const CODEX_THREAD_IDLE_MS = 60_000;
export const CODEX_CLIENT_IDLE_MS = 5 * 60_000;

type Entry = {
  users: number;
  cancel?: () => void;
  unloading?: Promise<void>;
};

type Schedule = (callback: () => void, delayMs: number) => () => void;
const schedule: Schedule = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return () => clearTimeout(timer);
};

/** Pins active turns, including approvals, and serializes resume with unloading. */
export class CodexThreadLifetime {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly unload: (threadId: string) => Promise<void>,
    private readonly onError: () => void,
    private readonly defer: Schedule = schedule,
  ) {}

  async acquire(threadId: string): Promise<() => void> {
    let entry = this.entries.get(threadId);
    if (!entry) {
      entry = { users: 0 };
      this.entries.set(threadId, entry);
    }
    entry.users += 1;
    entry.cancel?.();
    entry.cancel = undefined;
    await entry.unloading;
    let released = false;
    return () => {
      if (released || this.entries.get(threadId) !== entry) return;
      released = true;
      entry.users -= 1;
      if (entry.users !== 0) return;
      entry.cancel = this.defer(() => {
        entry.cancel = undefined;
        entry.unloading = Promise.resolve()
          .then(() => {
            if (this.entries.get(threadId) === entry)
              return this.unload(threadId);
          })
          .catch(() => this.onError())
          .finally(() => {
            entry.unloading = undefined;
            if (entry.users === 0 && this.entries.get(threadId) === entry) {
              this.entries.delete(threadId);
            }
          });
      }, CODEX_THREAD_IDLE_MS);
    };
  }

  clear() {
    for (const entry of this.entries.values()) entry.cancel?.();
    this.entries.clear();
  }
}

/** Owns idle process retirement separately from durable conversation identity. */
export class CodexClientLifetime {
  private cancelIdle?: () => void;
  private activeNativeThreads = new Set<string>();
  readonly threads: CodexThreadLifetime;

  constructor(
    private readonly options: {
      isRunning: () => boolean;
      isBusy: () => boolean;
      retire: () => void;
      unsubscribe: (threadId: string) => Promise<void>;
      onError: () => void;
    },
  ) {
    this.threads = new CodexThreadLifetime(async (threadId) => {
      if (!options.isRunning() || this.activeNativeThreads.has(threadId))
        return;
      await options.unsubscribe(threadId);
    }, options.onError);
  }

  suspend() {
    this.cancelIdle?.();
    this.cancelIdle = undefined;
  }

  schedule() {
    this.suspend();
    if (!this.options.isRunning()) return;
    this.cancelIdle = schedule(() => {
      this.cancelIdle = undefined;
      if (this.options.isBusy() || this.activeNativeThreads.size > 0) {
        this.schedule();
        return;
      }
      this.options.retire();
    }, CODEX_CLIENT_IDLE_MS);
  }

  observe(message: { method?: string; params?: unknown }) {
    // Detached reviews and native workers may outlive the initiating Stave turn.
    const params = (message.params ?? {}) as Record<string, unknown>;
    if (typeof params.threadId !== "string") return;
    const status = (params.status as { type?: string } | undefined)?.type;
    if (
      message.method === "turn/started" ||
      (message.method === "thread/status/changed" && status === "active")
    ) {
      this.activeNativeThreads.add(params.threadId);
    } else if (
      message.method === "turn/completed" ||
      message.method === "thread/closed" ||
      (message.method === "thread/status/changed" &&
        (status === "idle" ||
          status === "notLoaded" ||
          status === "systemError"))
    ) {
      if (this.activeNativeThreads.delete(params.threadId)) {
        void this.threads.acquire(params.threadId).then((release) => release());
      }
    }
  }

  clear() {
    this.suspend();
    this.threads.clear();
    this.activeNativeThreads.clear();
  }
}
