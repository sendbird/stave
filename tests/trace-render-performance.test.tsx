import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolRun } from "@/components/aui/components/ToolRun";
import { Thinking } from "@/components/aui/components/Thinking";
import { sameAssistantTraceEntry } from "@/components/session/message/assistant-trace-entry-equality";
import { advanceTurnTrace, buildTurnTrace } from "@/components/session/turn-trace.utils";
import type { AssistantTraceEntry } from "@/components/session/message/assistant-trace-builder";
import type { ToolUsePart } from "@/types/chat";

const part: ToolUsePart = { type: "tool_use", toolName: "Read", toolUseId: "read", input: "{}", output: "payload", state: "output-available" };

describe("trace rendering work", () => {
  test("closed payloads mount only when opened, including grouped tools and reasoning", () => {
    const payload = createElement("span", null, "unique-heavy-payload");
    for (const open of [false, true]) {
      const cases = [
        createElement(ToolRun, { status: "done", title: "Read", open, output: payload }),
        createElement(Thinking, { status: "done", open }, payload),
        createElement(ToolRun.Group, { rollUp: true, runs: [{ status: "done" }], open }, payload),
      ];
      for (const element of cases) {
        expect(renderToStaticMarkup(element).includes("unique-heavy-payload")).toBe(open);
      }
    }
    expect(renderToStaticMarkup(createElement(ToolRun, { status: "approval", title: "Approve", output: payload }))).toContain("unique-heavy-payload");
  });

  test("unchanged immutable parts share a render; updates and requester labels do not", () => {
    const entry: AssistantTraceEntry = { kind: "tool", id: "tool-0", part };
    expect(sameAssistantTraceEntry(entry, { ...entry })).toBe(true);
    expect(sameAssistantTraceEntry(entry, { ...entry, part: { ...part, state: "output-error" } })).toBe(false);
    expect(sameAssistantTraceEntry(entry, { ...entry, id: "tool-1" })).toBe(false);
    const thinking = { type: "thinking" as const, text: "reason", isStreaming: true };
    const reasoning: AssistantTraceEntry = { kind: "reasoning", id: "r", parts: [thinking], isStreaming: true };
    expect(sameAssistantTraceEntry(reasoning, { ...reasoning, parts: [thinking] })).toBe(true);
    expect(sameAssistantTraceEntry(reasoning, { ...reasoning, isStreaming: false })).toBe(false);
    const todo: AssistantTraceEntry = { kind: "todo", id: "plan", part, title: "Worker plan" };
    expect(sameAssistantTraceEntry(todo, { ...todo, title: "Lead plan" })).toBe(false);
  });

  test("clock-only updates reuse parsed data and still move the slowest marker", () => {
    const start = Date.UTC(2026, 10, 3);
    const trace = buildTurnTrace({
      messages: [{ role: "assistant", parts: [
        { ...part, toolUseId: "done", startedAt: new Date(start).toISOString(), completedAt: new Date(start + 5000).toISOString() },
        { ...part, toolUseId: "live", state: "input-available", startedAt: new Date(start + 4000).toISOString() },
      ] }],
      turnStartedAt: start, turnCompletedAt: null, live: true, now: start + 6000,
    });
    expect(trace.slowestId).toBe("tool:done");
    const later = advanceTurnTrace(trace, start + 11000);
    expect(later.nowMs).toBe(start + 11000);
    expect(later.slowestId).toBe("tool:live");
    expect(later.spans).toBe(trace.spans);
    expect(later.unreported).toBe(trace.unreported);
    expect(later.usage).toBe(trace.usage);
    expect(advanceTurnTrace({ ...trace, nowMs: null }, start + 12000).nowMs).toBeNull();
  });
});
