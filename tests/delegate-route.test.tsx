import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExchangeIdentity, ExchangeIdentityView } from "../src/components/delegation/ExchangeIdentity";
import { selectActivityMessages } from "../src/components/session/activity-detail.utils";
import { describeDelegateRoute, findDelegateRoutedModel, resolveDelegateIdentity } from "../src/lib/delegation/delegate-route";
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

function answer(turnId: string, model: string, effort?: "low" | "medium" | "high", content = "Done."): ChatMessage {
  return { id: `${turnId}-a`, role: "assistant", providerId: "claude-code", model, content, turnId, ...(effort ? { modelInfo: { effort } } : {}) };
}

describe("delegated task routed model", () => {
  test("reads the delegated task's own latest turn, not an older one", () => {
    const messages = [answer("child-turn-1", "claude-haiku-5"), answer("child-turn-2", "claude-sonnet-5", "medium")];
    expect(findDelegateRoutedModel(messages, "child-turn-2")).toEqual({ providerId: "claude-code", model: "claude-sonnet-5", effort: "medium" });
    expect(findDelegateRoutedModel(messages, "child-turn-1")?.model).toBe("claude-haiku-5");
    expect(findDelegateRoutedModel(messages, null)?.model).toBe("claude-sonnet-5");
    expect(findDelegateRoutedModel([], "child-turn-2")).toBeNull();
  });

  test("an answer that has not responded yet does not claim which model ran", () => {
    // Before the first response the row still carries the model it started with.
    expect(findDelegateRoutedModel([answer("child-turn-2", "claude-opus-5", "high", "")], "child-turn-2")).toBeNull();
    expect(findDelegateRoutedModel([{ ...answer("child-turn-2", "claude-haiku-5", "high", ""),
      parts: [{ type: "text", text: "Reading" }] }], "child-turn-2")?.model).toBe("claude-haiku-5");
  });

  test("leads with the model that ran and keeps the request only when it differs", () => {
    const requested = { providerId: "claude-code" as const, model: "claude-opus-5", effort: "high", modelEvidence: "requested" as const };
    expect(resolveDelegateIdentity(requested, null)).toEqual({ ...requested, requested: null });
    expect(resolveDelegateIdentity(requested, { providerId: "claude-code", model: "claude-opus-5", effort: null }))
      .toEqual({ providerId: "claude-code", model: "claude-opus-5", effort: "high", modelEvidence: "reported", requested: null });
    expect(resolveDelegateIdentity(requested, { providerId: "claude-code", model: "claude-haiku-5", effort: "high" }))
      .toMatchObject({ model: "claude-haiku-5", modelEvidence: "reported", requested: "Claude Opus 5 · High" });
    // A runtime that keeps the configured model in its transcript says so.
    expect(resolveDelegateIdentity({ providerId: "cursor", model: "composer-2" }, { providerId: "cursor", model: "composer-2", effort: null }).modelEvidence)
      .toBe("configured");
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

  test("the row reads the delegated task's loaded transcript and keeps the request without one", () => {
    const exchange = fromDelegatedTask(child);
    expect(exchange.ref.delegatedTurnId).toBe("child-turn-2");
    const state = { activeWorkspaceId: "ws-1", taskWorkspaceIdById: {}, workspaceRuntimeCacheById: {}, messagesByTask: {} as Record<string, ChatMessage[]> };
    const read = () => resolveDelegateIdentity(exchange.identity, findDelegateRoutedModel(
      selectActivityMessages({ state, parentTaskId: "", delegatedTaskId: exchange.ref.delegatedTaskId, delegatedWorkspaceId: exchange.ref.delegatedWorkspaceId }),
      exchange.ref.delegatedTurnId,
    ));
    expect(read().requested).toBeNull();
    // Unloaded in the renderer: the row shows the requested model, marked so.
    const unloaded = renderToStaticMarkup(createElement(ExchangeIdentity, { exchange }));
    expect(unloaded).toContain("Claude Opus 5");
    expect(unloaded).toContain('data-model-evidence="requested"');
    expect(unloaded).not.toContain("delegate-requested-model");
    state.messagesByTask = { "child-task": [answer("child-turn-2", "claude-sonnet-5", "medium")] };
    const html = renderToStaticMarkup(createElement(ExchangeIdentityView, { identity: read() }));
    expect(html).toContain("Claude Sonnet 5");
    expect(html).toContain('data-model-evidence="reported"');
    expect(html).toContain('data-testid="delegate-requested-model"');
    expect(html).toContain("requested Claude Opus 5 · High");
    state.messagesByTask = { "child-task": [answer("child-turn-2", "claude-opus-5", "high")] };
    const same = renderToStaticMarkup(createElement(ExchangeIdentityView, { identity: read() }));
    expect(same).toContain('data-model-evidence="reported"');
    expect(same).not.toContain("delegate-requested-model");
  });
});
