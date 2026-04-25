import { describe, expect, test } from "bun:test";
import {
  appendBoundedBridgeEvent,
  appendBoundedText,
  createBoundedBridgeEventCollector,
  dropBufferedBridgeEvents,
  measureBridgeEventBytes,
} from "../electron/providers/provider-buffering";
import type { BridgeEvent } from "../electron/providers/types";

describe("appendBoundedText", () => {
  test("keeps the suffix when requested", () => {
    expect(appendBoundedText({
      current: "abcdef",
      chunk: "ghijkl",
      keep: "suffix",
      maxBytes: 6,
    })).toBe("ghijkl");
  });

  test("keeps the prefix when requested", () => {
    expect(appendBoundedText({
      current: "abcdef",
      chunk: "ghijkl",
      keep: "prefix",
      maxBytes: 6,
    })).toBe("abcdef");
  });
});

describe("appendBoundedBridgeEvent", () => {
  test("replaces superseded partial tool snapshots for the same tool", () => {
    const events: BridgeEvent[] = [];
    let retainedBytes = 0;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 1",
        isPartial: true,
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 2",
        isPartial: true,
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    expect(retainedBytes).toBeGreaterThan(0);
    expect(events).toEqual([
      {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 2",
        isPartial: true,
      },
    ]);
  });

  test("replaces superseded plan snapshots for the same source segment", () => {
    const events: BridgeEvent[] = [];
    let retainedBytes = 0;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "plan_ready",
        planText: "Step 1",
        sourceSegmentId: "plan-1",
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "plan_ready",
        planText: "Step 1\nStep 2",
        sourceSegmentId: "plan-1",
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    expect(retainedBytes).toBeGreaterThan(0);
    expect(events).toEqual([
      {
        type: "plan_ready",
        planText: "Step 1\nStep 2",
        sourceSegmentId: "plan-1",
      },
    ]);
  });

  test("drops the oldest retained events when the replay window exceeds its byte cap", () => {
    const first: BridgeEvent = { type: "text", text: "alpha" };
    const second: BridgeEvent = { type: "text", text: "beta" };
    const maxBytes = measureBridgeEventBytes(first) + measureBridgeEventBytes(second) - 1;
    const events: BridgeEvent[] = [];
    let retainedBytes = 0;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: first,
      retainedBytes,
      maxBytes,
    }).retainedBytes;

    const appended = appendBoundedBridgeEvent({
      events,
      next: second,
      retainedBytes,
      maxBytes,
    });

    expect(appended.droppedCount).toBe(1);
    expect(events).toEqual([second]);
  });
});

describe("dropBufferedBridgeEvents", () => {
  test("removes acknowledged events and updates the retained byte count", () => {
    const first: BridgeEvent = { type: "text", text: "alpha" };
    const second: BridgeEvent = { type: "done" };
    const events: BridgeEvent[] = [first, second];
    const retainedBytes = measureBridgeEventBytes(first) + measureBridgeEventBytes(second);

    const nextRetainedBytes = dropBufferedBridgeEvents({
      events,
      retainedBytes,
      dropCount: 1,
    });

    expect(events).toEqual([second]);
    expect(nextRetainedBytes).toBe(measureBridgeEventBytes(second));
  });
});

describe("createBoundedBridgeEventCollector", () => {
  test("preserves event order and marks overflow instead of dropping earlier events", () => {
    const firstEvent: BridgeEvent = { type: "text", text: "alpha" };
    const largeEvent: BridgeEvent = { type: "text", text: "gamma".repeat(32) };
    const collector = createBoundedBridgeEventCollector({
      maxBytes: measureBridgeEventBytes(firstEvent) + measureBridgeEventBytes({
        type: "error",
        message: "overflow",
        recoverable: true,
      }) + measureBridgeEventBytes({ type: "done" }),
      reserveTailBytes:
        measureBridgeEventBytes({
          type: "error",
          message: "overflow",
          recoverable: true,
        }) + measureBridgeEventBytes({ type: "done" }),
    });

    collector.append(firstEvent);
    collector.append(largeEvent);
    collector.appendTail({
      type: "error",
      message: "overflow",
      recoverable: true,
    });
    collector.appendTail({ type: "done" });

    expect(collector.events[0]).toEqual(firstEvent);
    expect(collector.events.at(-2)).toEqual({
      type: "error",
      message: "overflow",
      recoverable: true,
    });
    expect(collector.events.at(-1)).toEqual({ type: "done" });
    expect(collector.overflowed).toBe(true);
    expect(collector.retainedBytes).toBeLessThanOrEqual(
      measureBridgeEventBytes(firstEvent) +
        measureBridgeEventBytes({
          type: "error",
          message: "overflow",
          recoverable: true,
        }) +
        measureBridgeEventBytes({ type: "done" }),
    );
  });

  test("truncates oversized events to preserve event boundaries", () => {
    const collector = createBoundedBridgeEventCollector({
      maxBytes: 256,
    });

    collector.append({
      type: "text",
      text: "alpha ".repeat(64),
    });

    expect(collector.overflowed).toBe(false);
    expect(collector.events).toHaveLength(1);
    expect(collector.events[0]?.type).toBe("text");
    expect((collector.events[0] as Extract<BridgeEvent, { type: "text" }>).text).toContain(
      "<truncated>",
    );
    expect(collector.retainedBytes).toBeLessThanOrEqual(256);
  });

  test("truncates multi-field user input events without forcing overflow", () => {
    const collector = createBoundedBridgeEventCollector({
      maxBytes: 512,
    });

    collector.append({
      type: "user_input",
      toolName: "AskUserQuestion",
      requestId: "request-1",
      questions: [
        {
          header: "Question Header ".repeat(8),
          question: "Question body ".repeat(16),
          options: [
            {
              label: "Option A ".repeat(10),
              description: "Option description ".repeat(12),
            },
            {
              label: "Option B ".repeat(10),
              description: "Option description ".repeat(12),
            },
          ],
        },
        {
          header: "Second Header ".repeat(8),
          question: "Second question body ".repeat(16),
          options: [
            {
              label: "Option C ".repeat(10),
              description: "Option description ".repeat(12),
            },
          ],
        },
      ],
    });

    expect(collector.overflowed).toBe(false);
    expect(collector.events).toHaveLength(1);
    expect(collector.events[0]?.type).toBe("user_input");
    expect(collector.retainedBytes).toBeLessThanOrEqual(512);
  });
});
