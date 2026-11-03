import { describe, expect, test } from "bun:test";
import { COMPARE_VARIANT_WORK_STATE, describeCompareVariantProgress } from "@/lib/compare-run-progress";
import { buildTaskExecutionSummary } from "@/lib/fleet/task-execution-summary";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import type { ChatMessage } from "@/types/chat";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const MINUTE = 60_000;

function answer(providerId: "claude-code" | "codex", usage: ChatMessage["usage"], completed = true): ChatMessage {
  return {
    id: `${providerId}-answer`,
    role: "assistant",
    model: "model",
    providerId,
    content: "Done.",
    turnId: "turn-1",
    startedAt: new Date(NOW - 18 * MINUTE).toISOString(),
    ...(completed ? { completedAt: new Date(NOW).toISOString() } : { isStreaming: true }),
    usage,
    parts: [{ type: "text", text: "Done." }],
  } as ChatMessage;
}

describe("compare candidate progress", () => {
  test("a finished Claude candidate reports its time and dollars", () => {
    const summary = buildTaskExecutionSummary({
      taskId: "task", providerId: "claude-code", now: NOW,
      messages: [answer("claude-code", { inputTokens: 100, outputTokens: 50, totalCostUsd: 1.92 })],
    });
    expect(describeCompareVariantProgress({ summary })).toEqual({
      elapsed: { milliseconds: 18 * MINUTE, running: false, startedAt: null },
      spend: { kind: "usd", amount: 1.92 },
      current: null,
    });
  });

  test("a Codex candidate that reports no cost shows tokens, never dollars", () => {
    const summary = buildTaskExecutionSummary({
      taskId: "task", providerId: "codex", now: NOW,
      messages: [answer("codex", { inputTokens: 80_000, outputTokens: 8_000 })],
    });
    expect(describeCompareVariantProgress({ summary }).spend).toEqual({ kind: "tokens", count: 88_000 });
  });

  test("a running candidate ticks from its turn start and says what it is doing", () => {
    const startedAt = NOW - 12 * MINUTE;
    const summary = buildTaskExecutionSummary({
      taskId: "task", providerId: "codex", now: NOW, messages: [],
      activity: {
        turnId: "turn-1", providerId: "codex", startedAt, lastEventAt: NOW, stalledAt: null, pendingInteraction: null,
        workGraph: createWorkGraph({ turnId: "turn-1", providerId: "codex", startedAt }),
        workItemsById: {
          "tool-1": {
            id: "tool-1", kind: "tool", status: "running", title: "Run command", detail: "bun test tests/billing",
            toolName: "Bash", toolUseId: "tool-1", progressMessages: [], startedAt: NOW - 20_000, updatedAt: NOW, elapsedSeconds: 20,
          },
        },
        orderedWorkItemIds: ["tool-1"],
      } as never,
    });
    expect(describeCompareVariantProgress({ summary, activityStartedAt: startedAt })).toEqual({
      elapsed: { milliseconds: 12 * MINUTE, running: true, startedAt },
      spend: null,
      current: "Run command · bun test tests/billing",
    });
  });

  test("nothing reported is nothing shown", () => {
    const summary = buildTaskExecutionSummary({ taskId: "task", providerId: "codex", now: NOW, messages: [] });
    expect(describeCompareVariantProgress({ summary })).toEqual({ elapsed: null, spend: null, current: null });
  });

  test("every status wears a shared work state", () => {
    expect(COMPARE_VARIANT_WORK_STATE).toEqual({
      pending: "queued", creating: "working", running: "working", completed: "ready",
      failed: "failed", cancelled: "stopped", kept: "ready", discarded: "skipped",
    });
  });
});
