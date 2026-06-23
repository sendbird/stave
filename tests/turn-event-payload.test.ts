import { describe, expect, test } from "bun:test";
import type { BridgeEvent } from "../electron/providers/types";
import {
  TURN_EVENT_PAYLOAD_INLINE_MAX_BYTES,
  parseTurnEventPayload,
  prepareTurnEventPayload,
} from "../electron/persistence/turn-event-payload";

describe("prepareTurnEventPayload", () => {
  test("serializes a small event without truncation and preserves the type", () => {
    const event: BridgeEvent = { type: "text", text: "hello world" };
    const prepared = prepareTurnEventPayload(event);

    expect(prepared.eventType).toBe("text");
    expect(prepared.truncated).toBe(false);
    expect(JSON.parse(prepared.payloadJson)).toEqual(event);
  });

  test("extracts the type from non-text events", () => {
    expect(prepareTurnEventPayload({ type: "done", stop_reason: "end_turn" }).eventType).toBe(
      "done",
    );
    expect(
      prepareTurnEventPayload({
        type: "usage",
        inputTokens: 1,
        outputTokens: 2,
      }).eventType,
    ).toBe("usage");
  });

  test("replaces an oversized payload with a compact truncation marker", () => {
    const event: BridgeEvent = {
      type: "tool_result",
      tool_use_id: "t1",
      output: "x".repeat(TURN_EVENT_PAYLOAD_INLINE_MAX_BYTES + 1024),
    };
    const prepared = prepareTurnEventPayload(event);

    expect(prepared.eventType).toBe("tool_result");
    expect(prepared.truncated).toBe(true);
    const marker = JSON.parse(prepared.payloadJson);
    expect(marker.__truncated).toBe(true);
    expect(marker.type).toBe("tool_result");
    expect(marker.byteSize).toBeGreaterThan(TURN_EVENT_PAYLOAD_INLINE_MAX_BYTES);
    // The marker itself must be tiny.
    expect(Buffer.byteLength(prepared.payloadJson, "utf8")).toBeLessThan(256);
  });

  test("honors a custom max byte budget", () => {
    const event: BridgeEvent = { type: "text", text: "0123456789" };
    const prepared = prepareTurnEventPayload(event, 8);
    expect(prepared.truncated).toBe(true);
  });

  test("does not truncate a payload exactly at the budget", () => {
    const event: BridgeEvent = { type: "text", text: "abc" };
    const json = JSON.stringify(event);
    const prepared = prepareTurnEventPayload(event, Buffer.byteLength(json, "utf8"));
    expect(prepared.truncated).toBe(false);
  });
});

describe("parseTurnEventPayload", () => {
  test("round-trips a normal payload", () => {
    const event: BridgeEvent = { type: "thinking", text: "reasoning", isStreaming: true };
    const prepared = prepareTurnEventPayload(event);
    const parsed = parseTurnEventPayload(prepared.payloadJson);

    expect(parsed.truncated).toBe(false);
    expect(parsed.event).toEqual(event);
  });

  test("reports truncation markers as truncated with a null event", () => {
    const prepared = prepareTurnEventPayload(
      { type: "diff", filePath: "a.ts", oldContent: "", newContent: "y".repeat(400_000) },
    );
    const parsed = parseTurnEventPayload(prepared.payloadJson);

    expect(parsed.truncated).toBe(true);
    expect(parsed.event).toBeNull();
  });

  test("handles invalid JSON defensively", () => {
    const parsed = parseTurnEventPayload("{not valid json");
    expect(parsed.truncated).toBe(true);
    expect(parsed.event).toBeNull();
  });
});
