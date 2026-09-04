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
  test("reports liveness immediately and coalesces a short visual burst", async () => {
    const flushed: NormalizedProviderEvent[][] = [];
    const arrived: NormalizedProviderEvent[] = [];
    const controller = createProviderTurnEventController({
      flushEvents: (events) => flushed.push(events),
      onEventArrived: (event) => arrived.push(event),
    });

    controller.handleEvent({ type: "text", text: "chunk one" });
    controller.handleEvent({ type: "text", text: "chunk two" });

    // The visual batch has not reached its 50 ms deadline yet...
    expect(flushed).toHaveLength(0);
    // ...but liveness was delivered synchronously for every streamed event.
    expect(arrived).toEqual([
      { type: "text", text: "chunk one" },
      { type: "text", text: "chunk two" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(flushed).toEqual([
      [{ type: "text", text: "chunk onechunk two" }],
    ]);
  });

  test("does not double-count `done` as a liveness event and flushes it synchronously", () => {
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

  test("flushes interaction events without waiting for the text cadence", () => {
    const flushed: NormalizedProviderEvent[][] = [];
    const controller = createProviderTurnEventController({
      flushEvents: (events) => flushed.push(events),
    });

    controller.handleEvent({ type: "text", text: "before approval" });
    controller.handleEvent({
      type: "approval",
      toolName: "Bash",
      requestId: "request-1",
      description: "Run tests",
    });

    expect(flushed).toEqual([
      [
        { type: "text", text: "before approval" },
        {
          type: "approval",
          toolName: "Bash",
          requestId: "request-1",
          description: "Run tests",
        },
      ],
    ]);
  });

  test("keeps provider text segment boundaries while coalescing", async () => {
    const flushed: NormalizedProviderEvent[][] = [];
    const controller = createProviderTurnEventController({
      flushEvents: (events) => flushed.push(events),
    });

    controller.handleEvent({ type: "text", text: "commentary", segmentId: "a" });
    controller.handleEvent({ type: "text", text: "answer", segmentId: "b" });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(flushed).toEqual([
      [
        { type: "text", text: "commentary", segmentId: "a" },
        { type: "text", text: "answer", segmentId: "b" },
      ],
    ]);
  });
});
