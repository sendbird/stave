import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DelegateRoute, DelegateRouteView } from "../src/components/delegation/DelegateRoute";
import { selectActivityMessages } from "../src/components/session/activity-detail.utils";
import { describeDelegateRoute, findDelegateRoutedModel } from "../src/lib/delegation/delegate-route";
import { fromDelegatedTask } from "../src/lib/delegation/exchange";
import type { DelegatedTaskSummary } from "../src/lib/runs/delegated-task";
import type { ChatMessage } from "../src/types/chat";

const child: DelegatedTaskSummary = {
  runId: "run-1", stepId: "step-1", parentTaskId: "parent", delegationKey: "review-diff",
  delegatedTaskId: "child-task", delegatedWorkspaceId: "ws-1", delegatedTurnId: "child-turn-2",
  providerId: "claude-code", requestedModel: "claude-opus-5", requestedEffort: "high",
  lifecycle: "one-turn", phase: "completed", reason: null, attempt: 1,
  createdAt: "2026-10-16T00:00:00.000Z", updatedAt: "2026-10-16T00:01:00.000Z", completedAt: "2026-10-16T00:01:00.000Z",
};

function answer(turnId: string, model: string, effort?: "low" | "medium" | "high"): ChatMessage {
  return { id: `${turnId}-a`, role: "assistant", providerId: "claude-code", model, content: "", turnId, ...(effort ? { modelInfo: { effort } } : {}) };
}

describe("delegated task routed model", () => {
  test("reads the delegated task's own latest turn, not an older one", () => {
    const messages = [answer("child-turn-1", "claude-haiku-5"), answer("child-turn-2", "claude-sonnet-5", "medium")];
    expect(findDelegateRoutedModel(messages, "child-turn-2")).toEqual({ providerId: "claude-code", model: "claude-sonnet-5", effort: "medium" });
    expect(findDelegateRoutedModel(messages, "child-turn-1")?.model).toBe("claude-haiku-5");
    expect(findDelegateRoutedModel(messages, null)?.model).toBe("claude-sonnet-5");
    expect(findDelegateRoutedModel([], "child-turn-2")).toBeNull();
  });

  test("names the routed model only when it differs from the request", () => {
    const requested = { providerId: "claude-code" as const, model: "claude-opus-5", effort: "high" };
    expect(describeDelegateRoute(requested, { providerId: "claude-code", model: "claude-opus-5", effort: "high" })).toBeNull();
    // A transcript without an effort does not claim the effort changed.
    expect(describeDelegateRoute(requested, { providerId: "claude-code", model: "claude-opus-5", effort: null })).toBeNull();
    expect(describeDelegateRoute(requested, { providerId: "claude-code", model: "claude-sonnet-5", effort: "medium" }))
      .toEqual({ requested: "Claude Opus 5 · High", routed: "Claude Sonnet 5 · Medium" });
    // Provider default: whatever ran is new information.
    expect(describeDelegateRoute({ providerId: "claude-code" }, { providerId: "claude-code", model: "claude-sonnet-5", effort: null })?.routed)
      .toBe("Claude Sonnet 5");
    expect(describeDelegateRoute(requested, null)).toBeNull();
  });

  test("the row reads the delegated task's loaded transcript and draws nothing without one", () => {
    const exchange = fromDelegatedTask(child);
    expect(exchange.ref.delegatedTurnId).toBe("child-turn-2");
    const state = { activeWorkspaceId: "ws-1", taskWorkspaceIdById: {}, workspaceRuntimeCacheById: {}, messagesByTask: {} as Record<string, ChatMessage[]> };
    const read = () => describeDelegateRoute(exchange.identity, findDelegateRoutedModel(
      selectActivityMessages({ state, parentTaskId: "", delegatedTaskId: exchange.ref.delegatedTaskId, delegatedWorkspaceId: exchange.ref.delegatedWorkspaceId }),
      exchange.ref.delegatedTurnId,
    ));
    expect(read()).toBeNull();
    // Unloaded in the renderer: the row keeps only the requested model.
    expect(renderToStaticMarkup(createElement(DelegateRoute, { exchange }))).toBe("");
    state.messagesByTask = { "child-task": [answer("child-turn-2", "claude-sonnet-5", "medium")] };
    const html = renderToStaticMarkup(createElement(DelegateRouteView, { route: read() }));
    expect(html).toContain('data-testid="delegate-routed-model"');
    expect(html).toContain("→ ran Claude Sonnet 5 · Medium");
    expect(html).toContain("Requested Claude Opus 5 · High");
    state.messagesByTask = { "child-task": [answer("child-turn-2", "claude-opus-5", "high")] };
    expect(renderToStaticMarkup(createElement(DelegateRouteView, { route: read() }))).toBe("");
  });
});
