import { describe, expect, test } from "bun:test";
import { createCdpCommandBarrier } from "../electron/main/browser/browser-cdp-close-barrier";

describe("Lens CDP close barrier", () => {
  test("waits for native commands to drain and rejects new work", async () => {
    const barrier = createCdpCommandBarrier();
    const release = barrier.acquire();
    const closing = barrier.beginClose(1_000);

    expect(barrier.snapshot()).toEqual({
      closing: true,
      inFlightCommands: 1,
    });
    expect(() => barrier.acquire()).toThrow("debugger is closing");

    release();
    expect(await closing).toBe("drained");
    expect(barrier.snapshot().inFlightCommands).toBe(0);
  });

  test("times out without discarding the native command lease", async () => {
    const barrier = createCdpCommandBarrier();
    const release = barrier.acquire();

    expect(await barrier.beginClose(1)).toBe("timed-out");
    expect(barrier.snapshot().inFlightCommands).toBe(1);

    release();
    expect(barrier.snapshot().inFlightCommands).toBe(0);
  });

  test("finishing destruction releases close waiters", async () => {
    const barrier = createCdpCommandBarrier();
    barrier.acquire();
    const closing = barrier.beginClose(1_000);

    barrier.finishClose();

    expect(await closing).toBe("drained");
  });
});
