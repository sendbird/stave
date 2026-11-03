import { describe, expect, test } from "bun:test";
import {
  layoutTraceBar,
  resolveTraceAxis,
} from "@/components/ads/components/TraceWaterfall";
import {
  buildTurnTrace,
  spanDurationMs,
  TURN_TRACE_ROOT_ID,
  type TurnTraceMessage,
} from "@/components/session/turn-trace.utils";
import type { ThinkingPart, ToolUsePart } from "@/types/chat";

const T0 = Date.UTC(2026, 10, 3, 9, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1_000).toISOString();

function tool(overrides: Partial<ToolUsePart> & { toolUseId: string }): ToolUsePart {
  return {
    type: "tool_use",
    toolName: "Read",
    input: JSON.stringify({ file_path: "src/a.ts" }),
    state: "output-available",
    ...overrides,
  };
}

function assistant(...parts: Array<ToolUsePart | ThinkingPart>): TurnTraceMessage {
  return { role: "assistant", parts };
}

describe("turn trace spans", () => {
  test("draws observed calls under the turn and nests a subagent's calls under it", () => {
    const trace = buildTurnTrace({
      messages: [
        assistant(
          tool({ toolUseId: "read", startedAt: at(1), completedAt: at(2) }),
          // Claude: the subagent call, then a call made inside it.
          tool({ toolUseId: "agent", toolName: "Agent", input: JSON.stringify({ description: "Explore" }), startedAt: at(3), completedAt: at(40) }),
          tool({ toolUseId: "inner", parentToolUseId: "agent", startedAt: at(5), completedAt: at(6) }),
          // Codex: the worker is named on its spawn call and owns its calls.
          tool({ toolUseId: "spawn", toolName: "collaboration.spawn_agent", agentId: "thread-7", startedAt: at(10), completedAt: at(30) }),
          tool({ toolUseId: "owned", ownerAgentId: "thread-7", toolName: "bash", input: "ls", startedAt: at(12), completedAt: at(13) }),
        ),
      ],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 60_000,
      live: false,
      now: T0 + 60_000,
    });

    const byId = new Map(trace.spans.map((span) => [span.id, span]));
    expect(byId.get(TURN_TRACE_ROOT_ID)).toMatchObject({ kind: "turn", parentId: null, endMs: T0 + 60_000, status: "ok" });
    expect(byId.get("tool:read")).toMatchObject({ kind: "tool", parentId: TURN_TRACE_ROOT_ID, startMs: T0 + 1_000, endMs: T0 + 2_000 });
    expect(byId.get("tool:agent")).toMatchObject({ kind: "agent", parentId: TURN_TRACE_ROOT_ID });
    expect(byId.get("tool:inner")?.parentId).toBe("tool:agent");
    expect(byId.get("tool:spawn")).toMatchObject({ kind: "agent" });
    expect(byId.get("tool:owned")?.parentId).toBe("tool:spawn");
    expect(trace.unreported).toEqual([]);
    expect(trace.nowMs).toBeNull();
  });

  test("lists calls without an observed time instead of placing them", () => {
    const trace = buildTurnTrace({
      messages: [
        assistant(
          // Saved before runtimes recorded times.
          tool({ toolUseId: "old" }),
          // The turn ended before this call returned.
          tool({ toolUseId: "cut", state: "input-available", startedAt: at(2) }),
          tool({ toolUseId: "ok", startedAt: at(1), completedAt: at(3) }),
        ),
      ],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 10_000,
      live: false,
      now: T0 + 10_000,
    });

    expect(trace.spans.map((span) => span.id)).toEqual([TURN_TRACE_ROOT_ID, "tool:ok"]);
    expect(trace.unreported.map((item) => item.id)).toEqual(["tool:old", "tool:cut"]);
    expect(trace.unreported[0]).toMatchObject({ kind: "tool", toolUseId: "old" });
  });

  test("a live turn draws a running call open to now, and its child under it", () => {
    const trace = buildTurnTrace({
      messages: [
        assistant(
          tool({ toolUseId: "agent", toolName: "Task", state: "input-available", startedAt: at(2) }),
          tool({ toolUseId: "child", parentToolUseId: "agent", startedAt: at(3), completedAt: at(4) }),
          // A running call whose start was never observed is still not drawn.
          tool({ toolUseId: "unseen", state: "input-available" }),
        ),
      ],
      turnStartedAt: T0,
      turnCompletedAt: null,
      live: true,
      now: T0 + 9_000,
    });

    const agent = trace.spans.find((span) => span.id === "tool:agent")!;
    expect(agent).toMatchObject({ endMs: null, status: "running" });
    expect(spanDurationMs(agent, trace.nowMs!)).toBe(7_000);
    expect(trace.spans.find((span) => span.id === TURN_TRACE_ROOT_ID)).toMatchObject({ endMs: null, status: "running" });
    expect(trace.nowMs).toBe(T0 + 9_000);
    expect(trace.unreported.map((item) => item.id)).toEqual(["tool:unseen"]);
  });

  test("marks the slowest leaf, never the turn or a span with children", () => {
    const trace = buildTurnTrace({
      messages: [
        assistant(
          tool({ toolUseId: "agent", toolName: "Agent", startedAt: at(0), completedAt: at(50) }),
          tool({ toolUseId: "inner", parentToolUseId: "agent", startedAt: at(1), completedAt: at(4) }),
          tool({ toolUseId: "cmd", toolName: "Bash", input: JSON.stringify({ command: "bun test" }), startedAt: at(5), completedAt: at(17) }),
          tool({ toolUseId: "quick", startedAt: at(18), completedAt: at(18.4) }),
        ),
      ],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 60_000,
      live: false,
      now: T0 + 60_000,
    });

    expect(trace.slowestId).toBe("tool:cmd");
  });

  test("names no slowest span when there is only one step", () => {
    const trace = buildTurnTrace({
      messages: [assistant(tool({ toolUseId: "only", startedAt: at(1), completedAt: at(9) }))],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 10_000,
      live: false,
      now: T0 + 10_000,
    });

    expect(trace.slowestId).toBeNull();
  });

  test("draws a reasoning pass that streamed, and lists one that arrived whole", () => {
    const streamed: ThinkingPart = { type: "thinking", text: "…", isStreaming: false, startedAt: at(1), completedAt: at(4) };
    const whole: ThinkingPart = { type: "thinking", text: "…", isStreaming: false, startedAt: at(6), completedAt: at(6) };
    const trace = buildTurnTrace({
      messages: [assistant(streamed, whole)],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 10_000,
      live: false,
      now: T0 + 10_000,
    });

    expect(trace.spans.find((span) => span.kind === "model")).toMatchObject({ id: "model:1", startMs: T0 + 1_000, endMs: T0 + 4_000 });
    expect(trace.unreported).toEqual([expect.objectContaining({ id: "model:2", kind: "model" })]);
  });

  test("puts tokens and cost on the turn only, and only when reported", () => {
    const reported = buildTurnTrace({
      messages: [
        { role: "assistant", providerId: "claude-code", parts: [], usage: { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 16_000, totalCostUsd: 0.21 } },
      ],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 1_000,
      live: false,
      now: T0 + 1_000,
    });
    const codex = buildTurnTrace({
      messages: [{ role: "assistant", providerId: "codex", parts: [], usage: { inputTokens: 2_000, outputTokens: 100 } }],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 1_000,
      live: false,
      now: T0 + 1_000,
    });
    const silent = buildTurnTrace({
      messages: [assistant()],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 1_000,
      live: false,
      now: T0 + 1_000,
    });

    expect(reported.usage).toEqual({ tokens: 17_500, costUsd: 0.21 });
    expect(codex.usage).toEqual({ tokens: 2_100 });
    expect(silent.usage).toEqual({});
  });

  test("a finished turn without a saved end reaches as far as its calls", () => {
    const trace = buildTurnTrace({
      messages: [assistant(tool({ toolUseId: "a", startedAt: at(1), completedAt: at(7) }))],
      turnStartedAt: T0,
      turnCompletedAt: null,
      live: false,
      now: T0,
    });

    expect(trace.spans[0]).toMatchObject({ endMs: T0 + 7_000, status: "ok" });
    expect(trace.nowMs).toBeNull();
  });
});

describe("waterfall layout", () => {
  test("one axis from the earliest start to the latest end, stretched to now", () => {
    const spans = [
      { startMs: 1_000, durationMs: 4_000 },
      { startMs: 3_000, durationMs: 1_000 },
    ];
    expect(resolveTraceAxis(spans)).toEqual({ originMs: 1_000, totalMs: 4_000 });
    expect(resolveTraceAxis(spans, 9_000)).toEqual({ originMs: 1_000, totalMs: 8_000 });
    expect(resolveTraceAxis([])).toEqual({ originMs: 0, totalMs: 1 });
    // An instant still has a width to divide by.
    expect(resolveTraceAxis([{ startMs: 5, durationMs: 0 }])).toEqual({ originMs: 5, totalMs: 1 });
  });

  test("overlapping spans keep their own starts and widths on the shared axis", () => {
    const axis = resolveTraceAxis([
      { startMs: 0, durationMs: 10_000 },
      { startMs: 2_000, durationMs: 6_000 },
    ]);
    expect(layoutTraceBar({ startMs: 0, durationMs: 10_000 }, axis)).toEqual({ startPercent: 0, widthPercent: 100 });
    expect(layoutTraceBar({ startMs: 2_000, durationMs: 6_000 }, axis)).toEqual({ startPercent: 20, widthPercent: 60 });
  });

  test("an instant gets a visible minimum width that never runs past the track", () => {
    const axis = { originMs: 0, totalMs: 100_000 };
    expect(layoutTraceBar({ startMs: 50_000, durationMs: 1 }, axis)).toEqual({ startPercent: 50, widthPercent: 0.5 });
    expect(layoutTraceBar({ startMs: 99_900, durationMs: 1 }, axis).widthPercent).toBeCloseTo(0.1, 6);
  });
});
