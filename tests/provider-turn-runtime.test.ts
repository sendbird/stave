import { afterEach, describe, expect, mock, test } from "bun:test";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import {
  createProviderTurnEventController,
  runProviderTurn,
} from "@/store/provider-turn-runtime";

const runTurn = mock(async function* () {
  throw new Error("connection closed");
});

describe("provider turn runtime", () => {
  afterEach(() => {
    runTurn.mockClear();
  });

  test("normalizes an adapter exception as a terminal provider error", async () => {
    const events: NormalizedProviderEvent[] = [];
    runProviderTurn(
      {
        provider: "codex",
        prompt: "Inspect the failure",
        taskId: "task-1",
        onEvent: ({ event }) => {
          events.push(event);
        },
      },
      { runTurn },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual([
      {
        type: "error",
        message: "Provider stream failed: Error: connection closed",
        recoverable: false,
      },
      { type: "done", stop_reason: "aborted" },
    ]);
  });
});

describe("provider turn event controller liveness", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  test("reports liveness on IPC arrival even when the rAF flush never fires", () => {
    // Simulate a hidden/occluded renderer: requestAnimationFrame is registered
    // but its callback is never invoked (Electron throttles/pauses rAF for
    // background windows). The stall net must still be reset from arrival.
    const pendingRafCallbacks: FrameRequestCallback[] = [];
    (globalThis as { window?: unknown }).window = {
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        pendingRafCallbacks.push(cb);
        return pendingRafCallbacks.length;
      },
      cancelAnimationFrame: () => {},
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };

    const flushed: NormalizedProviderEvent[][] = [];
    const arrived: NormalizedProviderEvent[] = [];
    const controller = createProviderTurnEventController({
      flushEvents: (events) => flushed.push(events),
      onEventArrived: (event) => arrived.push(event),
    });

    controller.handleEvent({ type: "text", text: "chunk one" });
    controller.handleEvent({ type: "text", text: "chunk two" });

    // rAF never fired → no visual flush happened...
    expect(flushed).toHaveLength(0);
    expect(pendingRafCallbacks).toHaveLength(1);
    // ...but liveness was delivered synchronously for every streamed event.
    expect(arrived).toEqual([
      { type: "text", text: "chunk one" },
      { type: "text", text: "chunk two" },
    ]);
  });

  test("does not double-count `done` as a liveness event and flushes it synchronously", () => {
    (globalThis as { window?: unknown }).window = {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };

    const flushed: NormalizedProviderEvent[][] = [];
    const arrived: NormalizedProviderEvent[] = [];
    const controller = createProviderTurnEventController({
      flushEvents: (events) => flushed.push(events),
      onEventArrived: (event) => arrived.push(event),
    });

    controller.handleEvent({ type: "text", text: "answer" });
    controller.handleEvent({ type: "done", stop_reason: "end_turn" });

    // `done` bypasses the arrival poke (it clears the timer via flushNow) and
    // flushes everything queued so far synchronously.
    expect(arrived).toEqual([{ type: "text", text: "answer" }]);
    expect(flushed).toEqual([
      [
        { type: "text", text: "answer" },
        { type: "done", stop_reason: "end_turn" },
      ],
    ]);
  });
});
