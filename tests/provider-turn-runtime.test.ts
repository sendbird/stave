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

  test("keeps consuming a healthy stream when applying an event throws", async () => {
    const streamed: NormalizedProviderEvent[] = [
      { type: "tool", toolUseId: "tool-1", toolName: "bash", input: "ls", state: "input-available" },
      { type: "tool_result", tool_use_id: "tool-1", output: "file.txt" },
      { type: "text", text: "done listing" },
      { type: "done", stop_reason: "end_turn" },
    ];
    const healthyRunTurn = mock(async function* () {
      for (const event of streamed) {
        yield event;
      }
    });
    const delivered: NormalizedProviderEvent[] = [];
    const consumerErrors: Array<{ error: unknown; event: NormalizedProviderEvent }> = [];
    runProviderTurn(
      {
        provider: "codex",
        prompt: "List files",
        taskId: "task-1",
        onEvent: ({ event }) => {
          delivered.push(event);
          if (event.type === "tool_result") {
            // A store subscriber (for example React's update-depth guard)
            // throwing out of the store write that applies this event.
            throw new Error("Minified React error #185");
          }
        },
      },
      {
        runTurn: healthyRunTurn,
        onConsumerError: (failure) => consumerErrors.push(failure),
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    // The remaining provider events still arrive, the turn ends with the
    // provider's own `done`, and no synthetic stream failure is reported.
    expect(delivered).toEqual(streamed);
    expect(consumerErrors).toHaveLength(1);
    expect(consumerErrors[0]?.event).toEqual(streamed[1]);
    expect(String(consumerErrors[0]?.error)).toContain("#185");
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

  test("flushes interaction events without waiting for the text cadence", async () => {
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

    // Flushed in the next macrotask, well before the 50 ms text cadence.
    expect(flushed).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
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

  test("coalesces a microtask-drained burst of interaction events into one flush", async () => {
    const flushed: NormalizedProviderEvent[][] = [];
    const controller = createProviderTurnEventController({
      flushEvents: (events) => flushed.push(events),
    });

    // An IPC burst drained by the stream's async generator reaches the
    // controller with only microtask gaps between events. Flushing each one
    // synchronously would commit React once per event inside one task.
    const burst: NormalizedProviderEvent[] = Array.from({ length: 80 }, (_, index) => ({
      type: "tool_result",
      tool_use_id: "tool-1",
      output: `line ${index}`,
      isPartial: true,
    }));
    for (const event of burst) {
      controller.handleEvent(event);
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(flushed).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(flushed).toEqual([burst]);
  });

  test("flushes a pending interaction batch synchronously with `done` exactly once", async () => {
    const flushed: NormalizedProviderEvent[][] = [];
    const controller = createProviderTurnEventController({
      flushEvents: (events) => flushed.push(events),
    });

    controller.handleEvent({ type: "tool_result", tool_use_id: "tool-1", output: "ok" });
    controller.handleEvent({ type: "done", stop_reason: "end_turn" });

    expect(flushed).toEqual([
      [
        { type: "tool_result", tool_use_id: "tool-1", output: "ok" },
        { type: "done", stop_reason: "end_turn" },
      ],
    ]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(flushed).toHaveLength(1);
  });

  test("reports a deferred flush failure and keeps flushing later events", async () => {
    const flushed: NormalizedProviderEvent[][] = [];
    const failures: Array<{ error: unknown; events: NormalizedProviderEvent[] }> = [];
    let failNext = true;
    const controller = createProviderTurnEventController({
      flushEvents: (events) => {
        if (failNext) {
          failNext = false;
          throw new Error("subscriber failed");
        }
        flushed.push(events);
      },
      onFlushError: (failure) => failures.push(failure),
    });

    controller.handleEvent({ type: "tool_result", tool_use_id: "tool-1", output: "first" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.handleEvent({ type: "tool_result", tool_use_id: "tool-1", output: "second" });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(failures).toHaveLength(1);
    expect(failures[0]?.events).toEqual([
      { type: "tool_result", tool_use_id: "tool-1", output: "first" },
    ]);
    expect(flushed).toEqual([
      [{ type: "tool_result", tool_use_id: "tool-1", output: "second" }],
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
