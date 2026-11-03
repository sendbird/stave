import { describe, expect, test } from "bun:test";
import { mapClaudeMessageToEvents } from "../electron/providers/claude-sdk-runtime";
import { buildCodexCommandResult } from "../electron/providers/codex-command-result";
import { buildCodexFileChangeToolEvent } from "../electron/providers/codex-file-change-mapping";
import { createToolTimingRecorder } from "../electron/providers/tool-timing";
import type { BridgeEvent } from "../electron/providers/types";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { appendProviderEventToAssistant } from "../src/lib/session/provider-event-replay";
import { createWorkGraph, reduceWorkGraphEvent } from "../src/lib/work-graph/work-graph-reducer";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";
import type { ChatMessage, ToolUsePart } from "../src/types/chat";

/**
 * Observed tool timing: the runtime stamps each call's start and end as it
 * handles the provider's messages, and every consumer downstream keeps those
 * times instead of reading its own clock.
 */

function clock(...times: number[]) {
  let index = 0;
  return () => {
    const value = times[Math.min(index, times.length - 1)]!;
    index += 1;
    return value;
  };
}

function toolEvents(events: BridgeEvent[]) {
  return events.filter(
    (event): event is Extract<BridgeEvent, { type: "tool" | "tool_result" }> =>
      event.type === "tool" || event.type === "tool_result",
  );
}

describe("runtime tool timing", () => {
  test("Claude: a tool_use starts the call and its tool_result ends it", () => {
    const recorder = createToolTimingRecorder(clock(1_000, 4_500));
    const started = mapClaudeMessageToEvents({
      message: {
        type: "assistant",
        uuid: "assistant-1",
        session_id: "session-1",
        parent_tool_use_id: null,
        message: {
          content: [{ type: "tool_use", id: "toolu_read", name: "Read", input: { file_path: "/w/a.ts" } }],
        },
      } as never,
      claudeDebugStream: false,
    }).map(recorder.stamp);
    const finished = mapClaudeMessageToEvents({
      message: {
        type: "user",
        session_id: "session-1",
        parent_tool_use_id: null,
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "export const a = 1;" }],
        },
      } as never,
      claudeDebugStream: false,
    }).map(recorder.stamp);

    const [tool] = toolEvents(started);
    const [result] = toolEvents(finished);
    expect(tool).toMatchObject({ type: "tool", toolUseId: "toolu_read", startedAt: 1_000 });
    expect(tool).not.toHaveProperty("completedAt");
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_read", completedAt: 4_500 });
  });

  test("Claude: a follow-up result for the same call repeats the first end", () => {
    const recorder = createToolTimingRecorder(clock(1_000, 2_000, 9_000));
    recorder.stamp({ type: "tool", toolUseId: "toolu_app", toolName: "mcp__app__open", input: "{}", state: "input-available" });
    const first = recorder.stamp({ type: "tool_result", tool_use_id: "toolu_app", output: "opened" });
    // The captured app view arrives later in a second result for the same call.
    const view = recorder.stamp({ type: "tool_result", tool_use_id: "toolu_app", output: "opened" });

    expect(first).toMatchObject({ completedAt: 2_000 });
    expect(view).toMatchObject({ completedAt: 2_000 });
  });

  test("Codex: a command keeps one start across started, streamed and completed events", () => {
    const recorder = createToolTimingRecorder(clock(10_000, 10_400, 13_250));
    const started = recorder.stamp({
      type: "tool",
      toolUseId: "item_cmd",
      toolName: "bash",
      input: "bun test",
      state: "input-available",
    });
    const partial = recorder.stamp({ type: "tool_result", tool_use_id: "item_cmd", output: "running…", isPartial: true });
    const completed = recorder.stamp(
      buildCodexCommandResult({ id: "item_cmd", status: "completed", exitCode: 0 }, "12 pass"),
    );

    expect(started).toMatchObject({ startedAt: 10_000 });
    // A chunk of output is not an ending.
    expect(partial).not.toHaveProperty("completedAt");
    expect(completed).toMatchObject({ tool_use_id: "item_cmd", completedAt: 10_400 });
  });

  test("Codex: a file change opened late still gets an observed start and end", () => {
    const recorder = createToolTimingRecorder(clock(20_000, 20_050));
    const opened = buildCodexFileChangeToolEvent({
      itemId: "item_patch",
      item: { changes: [{ path: "src/a.ts" }] } as never,
    });
    expect(opened).not.toBeNull();
    const tool = recorder.stamp(opened!);
    const result = recorder.stamp({ type: "tool_result", tool_use_id: "item_patch", output: "src/a.ts" });

    expect(tool).toMatchObject({ startedAt: 20_000 });
    expect(result).toMatchObject({ completedAt: 20_050 });
  });

  test("a terminal tool event ends the call; a result without a seen start gets only an end", () => {
    const recorder = createToolTimingRecorder(clock(1, 2, 3));
    recorder.stamp({ type: "tool", toolUseId: "a", toolName: "x", input: "", state: "input-available" });
    const done = recorder.stamp({ type: "tool", toolUseId: "a", toolName: "x", input: "", state: "output-available" });
    const orphan = recorder.stamp({ type: "tool_result", tool_use_id: "never-started", output: "" });

    expect(done).toMatchObject({ startedAt: 1, completedAt: 2 });
    expect(orphan).toMatchObject({ completedAt: 3 });
    expect(orphan).not.toHaveProperty("startedAt");
  });

  test("keeps a time the event already carries and leaves other events alone", () => {
    const recorder = createToolTimingRecorder(clock(99));
    const provided = recorder.stamp({
      type: "tool",
      toolUseId: "p",
      toolName: "x",
      input: "",
      state: "input-available",
      startedAt: 5,
    });
    const text: BridgeEvent = { type: "text", text: "hi" };

    expect(provided).toMatchObject({ startedAt: 5 });
    expect(recorder.stamp(text)).toBe(text);
  });
});

describe("observed timing downstream", () => {
  const tool: NormalizedProviderEvent = {
    type: "tool",
    toolUseId: "toolu_1",
    toolName: "Read",
    input: "{}",
    state: "input-available",
    startedAt: Date.UTC(2026, 10, 3, 9, 0, 0),
  };
  const result: NormalizedProviderEvent = {
    type: "tool_result",
    tool_use_id: "toolu_1",
    output: "ok",
    completedAt: Date.UTC(2026, 10, 3, 9, 0, 3),
  };

  test("the IPC event schema passes the times through", () => {
    expect(NormalizedProviderEventSchema.parse(tool)).toMatchObject({ startedAt: tool.startedAt });
    expect(NormalizedProviderEventSchema.parse(result)).toMatchObject({ completedAt: Date.UTC(2026, 10, 3, 9, 0, 3) });
    expect(NormalizedProviderEventSchema.safeParse({ ...tool, startedAt: -1 }).success).toBe(false);
  });

  test("the saved tool part keeps the observed start and end across repeated events", () => {
    let message: ChatMessage = {
      id: "m-1",
      role: "assistant",
      model: "claude",
      providerId: "claude-code",
      content: "",
      parts: [],
    };
    message = appendProviderEventToAssistant({ message, event: tool });
    // An emission that does not repeat the start must not erase it.
    message = appendProviderEventToAssistant({
      message,
      event: { ...tool, startedAt: undefined, state: "input-available" } as NormalizedProviderEvent,
    });
    message = appendProviderEventToAssistant({ message, event: { ...result, output: "par", isPartial: true } as NormalizedProviderEvent });
    const partial = message.parts[0] as ToolUsePart;
    expect(partial.startedAt).toBe("2026-11-03T09:00:00.000Z");
    expect(partial.completedAt).toBeUndefined();

    message = appendProviderEventToAssistant({ message, event: result });
    const part = message.parts[0] as ToolUsePart;
    expect(part.startedAt).toBe("2026-11-03T09:00:00.000Z");
    expect(part.completedAt).toBe("2026-11-03T09:00:03.000Z");
  });

  test("a call saved without observed times stays without them", () => {
    let message: ChatMessage = {
      id: "m-2",
      role: "assistant",
      model: "codex",
      providerId: "codex",
      content: "",
      parts: [],
    };
    message = appendProviderEventToAssistant({
      message,
      event: { type: "tool", toolUseId: "old", toolName: "bash", input: "ls", state: "input-available" },
    });
    message = appendProviderEventToAssistant({ message, event: { type: "tool_result", tool_use_id: "old", output: "a" } });
    const part = message.parts[0] as ToolUsePart;
    expect(part.startedAt).toBeUndefined();
    expect(part.completedAt).toBeUndefined();
  });

  test("the work graph reads the runtime's times, not the time it folded the event", () => {
    let graph = createWorkGraph({ turnId: "t", providerId: "claude-code", startedAt: 0 });
    const foldedAt = Date.UTC(2026, 10, 3, 9, 5, 0);
    graph = reduceWorkGraphEvent(graph, tool, foldedAt);
    graph = reduceWorkGraphEvent(graph, result, foldedAt + 10);
    const item = graph.workItemsById["tool:toolu_1"];
    expect(item?.startedAt).toBe(tool.startedAt);
    expect(item?.completedAt).toBe(Date.UTC(2026, 10, 3, 9, 0, 3));
  });
});
