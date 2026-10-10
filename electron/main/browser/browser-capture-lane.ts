/**
 * One native screenshot at a time per Lens guest.
 *
 * `Page.captureScreenshot` is not a read. Chromium serves a clipped or
 * full-page capture by applying a temporary device-emulation override to the
 * page — view size, viewport offset and scale — and restores "whatever was in
 * force when the capture started" from the capture's completion callback.
 * Two captures in flight on the same page therefore corrupt each other: the
 * second one records the first one's temporary override as the original, and
 * whichever finishes last restores it. The page is left laid out at the old
 * size, scrolled to the old clip origin, and painting only a clip-sized band —
 * shifted up and left, with blank space below — and because emulation lives on
 * the DevTools session, a reload does not clear it.
 *
 * Measured against a `<webview>` guest: two overlapping clipped captures stick
 * every time. A capture that waits for a frame the guest never draws (a parked
 * guest) stays in flight long after Lens's own timeout has given up on it, so a
 * retry is the usual way the second capture arrives.
 *
 * The lane closes that: a guest's next capture starts only once the previous
 * one has *settled natively*, not merely once its caller stopped waiting. A
 * caller still gets a bounded answer — the timeout covers its wait for a turn
 * and its own capture — but giving up never frees the guest early.
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
      ? `${base} An earlier screenshot of this page is still waiting for the page to draw; show its Lens tab, then retry.`
      : base,
  );
}

export function createLensCaptureLane(): LensCaptureLane {
  /** Settles when every capture queued so far for a guest has settled. */
  const tails = new Map<number, Promise<void>>();

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
        const timer = setTimeout(() => {
          answered = true;
          const phase: LensCaptureTimeoutPhase = started
            ? "capturing"
            : "waiting";
          if (!started) {
            // Never started: nothing native to wait for on this turn.
            release();
          }
          const error = createLensCaptureTimeoutError(options.timeoutMs, phase);
          abort.abort(error);
          reject(error);
          options.onTimeout?.(phase);
        }, options.timeoutMs);
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
            .finally(release);
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
  };
}

/** Shared by explicit screenshots and best-effort action previews. */
export const lensCaptureLane = createLensCaptureLane();
