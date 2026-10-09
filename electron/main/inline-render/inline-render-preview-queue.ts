/**
 * Bounds on inline render previews: a fixed number of slots, so at most that
 * many hidden windows exist at once and each slot owns one session no other
 * preview shares, and a deadline that stops a page that never settles.
 *
 * Pure (timers are injectable) so the tests drive it without Electron.
 */

export class InlineRenderPreviewBusyError extends Error {}
export class InlineRenderPreviewTimeoutError extends Error {}

export interface InlineRenderPreviewSlot {
  index: number;
  /** Idempotent. Hands the slot to the next waiter, if any. */
  release(): void;
}

interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const DEFAULT_TIMERS: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Slots are handed out lowest index first. A caller that finds them all taken
 * waits its turn, up to `maxWaiting` callers for at most `waitTimeoutMs`;
 * beyond that it is refused at once rather than queued without bound.
 */
export function createInlineRenderPreviewSlots(options: {
  size: number;
  maxWaiting: number;
  waitTimeoutMs: number;
  timers?: Timers;
}) {
  const timers = options.timers ?? DEFAULT_TIMERS;
  const free = Array.from({ length: options.size }, (_, index) => index);
  const waiting: Array<{
    resolve: (slot: InlineRenderPreviewSlot) => void;
    timer: unknown;
  }> = [];

  function hand(index: number): InlineRenderPreviewSlot {
    let released = false;
    return {
      index,
      release() {
        if (released) return;
        released = true;
        const next = waiting.shift();
        if (next) {
          timers.clearTimeout(next.timer);
          next.resolve(hand(index));
          return;
        }
        free.push(index);
        free.sort((left, right) => left - right);
      },
    };
  }

  return {
    acquire(): Promise<InlineRenderPreviewSlot> {
      const index = free.shift();
      if (index !== undefined) return Promise.resolve(hand(index));
      if (waiting.length >= options.maxWaiting) {
        return Promise.reject(
          new InlineRenderPreviewBusyError(
            `${options.size} previews are running and ${waiting.length} are waiting. Wait for them to finish, then preview again.`,
          ),
        );
      }
      return new Promise((resolve, reject) => {
        const entry = {
          resolve,
          timer: timers.setTimeout(() => {
            const position = waiting.indexOf(entry);
            if (position !== -1) waiting.splice(position, 1);
            reject(
              new InlineRenderPreviewBusyError(
                `No preview slot came free within ${Math.round(options.waitTimeoutMs / 1000)} s. Preview again in a moment.`,
              ),
            );
          }, options.waitTimeoutMs) as unknown,
        };
        waiting.push(entry);
      });
    },
    /** For tests and diagnostics. */
    stats() {
      return { free: free.length, waiting: waiting.length };
    },
  };
}

/**
 * Runs `task` with a hard deadline. On expiry the signal aborts (the task's
 * window is torn down from its abort listener) and the call rejects with
 * `InlineRenderPreviewTimeoutError` at once, without waiting for a page that
 * may never yield. A late result or error from the task is dropped.
 */
export function runWithInlineRenderPreviewDeadline<T>(
  task: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; message: () => string; timers?: Timers },
): Promise<T> {
  const timers = options.timers ?? DEFAULT_TIMERS;
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = timers.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new InlineRenderPreviewTimeoutError(options.message()));
      controller.abort();
    }, options.timeoutMs);
    let running: Promise<T>;
    try {
      running = task(controller.signal);
    } catch (error) {
      running = Promise.reject(error);
    }
    running.then(
      (value) => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
