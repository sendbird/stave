/**
 * One native screenshot at a time per Lens guest.
 *
 * A guest's next capture starts after the previous native copy and any page
 * restoration have completed. A lifecycle change cancels the caller and
 * abortable preparation while the lane keeps ownership of a running copy.
 */

export type LensCaptureTimeoutPhase = "waiting" | "capturing";

export type LensCaptureContext = {
  signal: AbortSignal;
  assertActive(): void;
};

export type LensCaptureRunOptions = {
  timeoutMs: number;
  /**
   * Called once when the caller is answered with a timeout. `capturing` means
   * the native work is still running and will keep the lane until it settles.
   */
  onTimeout?: (phase: LensCaptureTimeoutPhase) => void;
};

export type LensCaptureLane = {
  run<T>(
    key: number,
    capture: (context: LensCaptureContext) => Promise<T>,
    options: LensCaptureRunOptions,
  ): Promise<T>;
  /** Serialize cleanup behind native work and before later captures. */
  after(key: number, cleanup: () => Promise<void>): Promise<void>;
  /** Invalidate work from the previous page or presentation, retaining native serialization. */
  cancel(key: number, reason: Error): void;
  /** Whether a capture for `key` is queued or still running natively. */
  isBusy(key: number): boolean;
};

function formatTimeout(timeoutMs: number): string {
  return timeoutMs < 1_000
    ? `${timeoutMs} ms`
    : `${Math.round(timeoutMs / 1_000)} seconds`;
}

export function createLensCaptureTimeoutError(
  timeoutMs: number,
  phase: LensCaptureTimeoutPhase,
): Error {
  const base = `Lens screenshot timed out after ${formatTimeout(timeoutMs)}.`;
  return new Error(
    phase === "waiting"
      ? `${base} An earlier screenshot of this page is still running.`
      : base,
  );
}

export function createLensCaptureLane(): LensCaptureLane {
  /** Settles when every capture queued so far for a guest has settled. */
  const tails = new Map<number, Promise<void>>();
  const pending = new Map<number, Set<(reason: Error) => void>>();

  return {
    run<T>(
      key: number,
      capture: (context: LensCaptureContext) => Promise<T>,
      options: LensCaptureRunOptions,
    ): Promise<T> {
      const abort = new AbortController();
      const deadline = Date.now() + options.timeoutMs;
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const done = new Promise<void>((resolve) => {
        release = resolve;
      });
      // The next caller waits for the previous capture *and* this one, so a
      // caller that gives up before its turn cannot let a later one overlap
      // the capture it was itself waiting behind.
      const tail = previous.then(() => done);
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) {
          tails.delete(key);
        }
      });

      return new Promise<T>((resolve, reject) => {
        let answered = false;
        let started = false;
        const requests = pending.get(key) ?? new Set();
        pending.set(key, requests);
        const forget = () => {
          requests.delete(cancel);
          if (!requests.size && pending.get(key) === requests) pending.delete(key);
        };
        const cancel = (reason: Error) => {
          if (answered) return;
          answered = true;
          clearTimeout(timer);
          if (!started) {
            release();
            forget();
          }
          abort.abort(reason);
          reject(reason);
        };
        const timer = setTimeout(() => {
          const phase: LensCaptureTimeoutPhase = started
            ? "capturing"
            : "waiting";
          cancel(createLensCaptureTimeoutError(options.timeoutMs, phase));
          options.onTimeout?.(phase);
        }, options.timeoutMs);
        requests.add(cancel);
        (timer as { unref?: () => void }).unref?.();

        void previous.then(() => {
          if (answered) {
            return;
          }
          started = true;
          let native: Promise<T>;
          try {
            native = Promise.resolve(
              capture({
                signal: abort.signal,
                assertActive() {
                  if (abort.signal.aborted) throw abort.signal.reason;
                  if (Date.now() >= deadline) {
                    throw createLensCaptureTimeoutError(
                      options.timeoutMs,
                      "capturing",
                    );
                  }
                },
              }),
            );
          } catch (error) {
            native = Promise.reject(error);
          }
          native
            .then(
              (value) => {
                if (answered) return;
                answered = true;
                clearTimeout(timer);
                resolve(value);
              },
              (error: unknown) => {
                if (answered) return;
                answered = true;
                clearTimeout(timer);
                reject(error);
              },
            )
            .finally(() => {
              forget();
              release();
            });
        });
      });
    },

    after(key, cleanup) {
      const operation = (tails.get(key) ?? Promise.resolve()).then(cleanup);
      const tail = operation.catch(() => undefined);
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return operation;
    },

    isBusy(key: number): boolean {
      return tails.has(key);
    },

    cancel(key, reason) {
      for (const cancel of pending.get(key) ?? []) cancel(reason);
    },
  };
}

/** Shared by explicit screenshots and best-effort action previews. */
export const lensCaptureLane = createLensCaptureLane();
