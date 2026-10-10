import { describe, expect, test } from "bun:test";
import {
  createLensCaptureLane,
  type LensCaptureTimeoutPhase,
} from "../electron/main/browser/browser-capture-lane";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const GUEST = 7;
const LONG = { timeoutMs: 10_000 };

describe("Lens capture lane", () => {
  test("starts a guest's next capture only after the previous one settles", async () => {
    const lane = createLensCaptureLane();
    const first = deferred<string>();
    const started: string[] = [];

    const a = lane.run(
      GUEST,
      () => {
        started.push("a");
        return first.promise;
      },
      LONG,
    );
    const b = lane.run(
      GUEST,
      async () => {
        started.push("b");
        return "b";
      },
      LONG,
    );

    await flush();
    expect(started).toEqual(["a"]);

    first.resolve("a");
    await expect(a).resolves.toBe("a");
    await expect(b).resolves.toBe("b");
    expect(started).toEqual(["a", "b"]);
  });

  test("a caller that gives up mid-capture does not free the guest early", async () => {
    // The overlap that leaves a page stuck: Lens stops waiting on a capture
    // that is still running natively, and the retry starts beside it.
    const lane = createLensCaptureLane();
    const stalled = deferred<string>();
    const phases: LensCaptureTimeoutPhase[] = [];
    let retryStarted = false;

    const abandoned = lane.run(GUEST, () => stalled.promise, {
      timeoutMs: 5,
      onTimeout: (phase) => phases.push(phase),
    });
    await expect(abandoned).rejects.toThrow(
      "Lens screenshot timed out after 5 ms.",
    );
    expect(phases).toEqual(["capturing"]);
    expect(lane.isBusy(GUEST)).toBe(true);

    const retry = lane.run(
      GUEST,
      async () => {
        retryStarted = true;
        return "retry";
      },
      LONG,
    );
    await flush();
    expect(retryStarted).toBe(false);

    stalled.resolve("late");
    await expect(retry).resolves.toBe("retry");
    expect(retryStarted).toBe(true);
  });

  test("a caller whose turn never comes times out without starting its capture", async () => {
    const lane = createLensCaptureLane();
    const stalled = deferred<string>();
    const phases: LensCaptureTimeoutPhase[] = [];
    let queuedStarted = false;

    void lane.run(GUEST, () => stalled.promise, LONG);
    const queued = lane.run(
      GUEST,
      async () => {
        queuedStarted = true;
        return "queued";
      },
      { timeoutMs: 5, onTimeout: (phase) => phases.push(phase) },
    );

    await expect(queued).rejects.toThrow(/still waiting for the page to draw/);
    expect(phases).toEqual(["waiting"]);

    stalled.resolve("done");
    await flush();
    await flush();
    expect(queuedStarted).toBe(false);
    expect(lane.isBusy(GUEST)).toBe(false);
  });

  test("guests do not wait for each other", async () => {
    const lane = createLensCaptureLane();
    const stalled = deferred<string>();

    void lane.run(GUEST, () => stalled.promise, LONG);
    await expect(
      lane.run(GUEST + 1, async () => "other", LONG),
    ).resolves.toBe("other");
    expect(lane.isBusy(GUEST)).toBe(true);
    expect(lane.isBusy(GUEST + 1)).toBe(false);

    stalled.resolve("done");
  });

  test("a failed or throwing capture releases the guest", async () => {
    const lane = createLensCaptureLane();

    await expect(
      lane.run(
        GUEST,
        () => {
          throw new Error("guest closed");
        },
        LONG,
      ),
    ).rejects.toThrow("guest closed");
    await expect(
      lane.run(GUEST, () => Promise.reject(new Error("no frame")), LONG),
    ).rejects.toThrow("no frame");
    await expect(lane.run(GUEST, async () => "next", LONG)).resolves.toBe(
      "next",
    );
    await flush();
    expect(lane.isBusy(GUEST)).toBe(false);
  });
});
