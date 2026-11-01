import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskAttentionSummary } from "@/components/session/TaskAttentionSummary";
import { buildFleetAttentionProjection, type FleetLiveWorkspaceInput } from "@/lib/fleet/attention-projection";
import { useAppStore } from "@/store/app.store";
import { EMPTY_FLEET_ATTENTION, useFleetAttentionStore } from "@/store/fleet-attention-store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";

const at = "2026-10-01T01:00:00.000Z";
const identity = { repositoryPath: "/tmp/repo", repositoryName: "Repo", workspaceId: "ws-1", workspaceName: "Workspace" };
const task = { id: "task-1", title: "Task", provider: "codex" as const, updatedAt: at, unread: false };
const message = {
  id: "m-1", role: "assistant" as const, providerId: "codex", model: "model", content: "", turnId: "turn-1",
  parts: [{ type: "approval" as const, toolName: "Bash", description: "Publish", input: "{\"command\":\"npm publish\"}", requestId: "request-1", state: "approval-requested" as const }],
};
const workspace: FleetLiveWorkspaceInput = {
  ...identity, tasks: [task], messagesByTask: { [task.id]: [message] },
  activeTurnIdsByTask: { [task.id]: message.turnId }, providerTurnActivityByTask: {},
};
const appBefore = { ...useAppStore.getInitialState() };
const attentionBefore = { ...useFleetAttentionStore.getInitialState() };
const reviewBefore = { ...useTaskReviewModeStore.getInitialState() };

afterEach(() => {
  Object.assign(useAppStore.getInitialState(), appBefore);
  Object.assign(useFleetAttentionStore.getInitialState(), attentionBefore);
  useAppStore.setState(appBefore, true);
  useFleetAttentionStore.setState(attentionBefore, true);
  Object.assign(useTaskReviewModeStore.getInitialState(), reviewBefore);
});

function seed() {
  const projected = buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [workspace], prWorkspaces: [], agentRuns: [] });
  expect(projected.items.map((item) => item.kind)).toEqual(["approval"]);
  Object.assign(useAppStore.getInitialState(), {
    activeWorkspaceId: identity.workspaceId, tasks: [task], messagesByTask: workspace.messagesByTask,
    activeTurnIdsByTask: workspace.activeTurnIdsByTask,
  });
  Object.assign(useFleetAttentionStore.getInitialState(), { snapshot: { ...EMPTY_FLEET_ATTENTION, ...projected } });
}

test("the task's own pending approval is not repeated above the conversation", () => {
  seed();
  // The composer's approval row is the one place it is shown.
  expect(renderToStaticMarkup(createElement(TaskAttentionSummary, { taskId: task.id }))).toBe("");
});

test("Review hides the composer, so the summary keeps the approval there", () => {
  seed();
  // Server rendering reads each store's initial state.
  Object.assign(useTaskReviewModeStore.getInitialState(), { byTask: { [task.id]: { mode: "review" } } });
  const html = renderToStaticMarkup(createElement(TaskAttentionSummary, { taskId: task.id }));
  expect(html).toContain("Approval");
  expect(html).toContain("open=\"\"");
});
