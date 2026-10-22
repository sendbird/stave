import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExchangeDetail } from "@/components/delegation/ExchangeDetail";
import { TaskExecutionSummarySurface } from "@/components/layout/TaskExecutionSummarySurface";
import { fromDelegatedTask } from "@/lib/delegation/exchange";
import { buildTaskExecutionSummary } from "@/lib/fleet/task-execution-summary";

/**
 * A detail surface reads spend to the hundredth of a cent, so a small run's
 * cost never rounds to a cent it did not cost and a large one keeps its tail.
 */
describe("detail surfaces keep four decimals of spend", () => {
  const exchangeWithCost = (totalCostUsd: number) => ({
    ...fromDelegatedTask({
      runId: "child-task:t:review", stepId: "child-task:t:review:turn", parentTaskId: "t", delegationKey: "review",
      delegatedTaskId: "c", delegatedWorkspaceId: "w", delegatedTurnId: "turn", providerId: "codex", lifecycle: "one-turn",
      phase: "completed", reason: null, attempt: 1, createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:02.000Z",
      completedAt: "2026-08-10T00:00:02.000Z", result: "Done",
    }, { prompt: "Review" }),
    outcome: { status: "returned" as const, result: "Done", spend: { inputTokens: 120, outputTokens: 40, totalCostUsd } },
  });

  test.each([[0.0123, "$0.0123"], [1.2345, "$1.2345"]])("a delegated exchange's spend of %p reads %s", (cost, text) => {
    const html = renderToStaticMarkup(createElement(ExchangeDetail, { exchange: exchangeWithCost(cost), nowMs: 3 }));
    expect(html).toContain(text);
  });

  const summaryWithCost = (cost: { totalCostUsd?: number; contextCostAmount?: number; contextCostCurrency?: string }) =>
    buildTaskExecutionSummary({
      providerId: "claude-code",
      messages: [{
        id: "assistant-1", role: "assistant", model: "opus", providerId: "claude-code", content: "Done.",
        startedAt: "2026-07-31T00:00:00.000Z", completedAt: "2026-07-31T00:00:02.000Z",
        parts: [{ type: "text", text: "Done." }],
        usage: { inputTokens: 100, outputTokens: 20, ...cost },
      }],
    });

  test.each([[0.0123, "$0.0123"], [1.2345, "$1.2345"]])("a task's reported cost of %p reads %s", (cost, text) => {
    const reported = renderToStaticMarkup(createElement(TaskExecutionSummarySurface, {
      summary: summaryWithCost({ contextCostAmount: cost, contextCostCurrency: "USD" }),
    }));
    expect(reported).toContain(text);
    const total = renderToStaticMarkup(createElement(TaskExecutionSummarySurface, {
      summary: summaryWithCost({ totalCostUsd: cost }),
    }));
    expect(total).toContain(text);
  });
});
