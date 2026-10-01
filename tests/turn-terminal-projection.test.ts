import { expect, test } from "bun:test";
import {
  createTurnReceipt, observeTurnEvent, finishTurnReceipt, displayTurnReceipt,
} from "@/lib/providers/turn-terminal-receipt";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import {
  startProviderTurnActivity, reduceProviderTurnActivityEvents, retainRetiredTurnActivity,
} from "@/lib/providers/turn-status";
import { repositoryLocalMcpTaskTurnActivityEvent } from "@/lib/local-mcp/task-turn-update";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";
import { applyHostTaskTurnSync } from "@/store/host-task-turn-sync";
import { resolveRunStatus } from "@/components/session/TaskRunOverview";
import { classifyTaskStatus } from "@/lib/fleet/task-status";
import { ChatMessageSchema } from "@/lib/task-context/schemas";
import {
  buildTaskTurnCompletedNotificationInput, buildTaskTurnFailedNotificationInput,
} from "@/store/app-notification-builders";
import { attachTurnReceiptToSession } from "../electron/host-service/local-mcp-turn-receipt-projection";

const task = { id: "task", title: "Task", provider: "codex" as const, updatedAt: "2026-10-01", unread: false, archivedAt: null };
const scope = { repositoryPath: "/tmp/project", repositoryName: "project", workspaces: [], recentRepositories: [] };
const cases: Array<{ label: string; events: NormalizedProviderEvent[]; outcome: string; status: string; fleet: string; notification: string | null }> = [
  {
    label: "normal response",
    events: [
      { type: "text", text: "Finished" },
      { type: "done", stop_reason: "completed" },
    ],
    outcome: "completed", status: "Completed", fleet: "idle",
    notification: "task.turn_completed",
  },
  {
    label: "empty response",
    events: [
      { type: "done", stop_reason: "completed" },
    ],
    outcome: "failed", status: "Failed", fleet: "error",
    notification: "task.turn_failed",
  },
  {
    label: "tool-only response",
    events: [
      { type: "tool_result", tool_use_id: "tool", output: "Done" },
      { type: "done" },
    ],
    outcome: "completed", status: "Completed", fleet: "idle",
    notification: "task.turn_completed",
  },
  {
    label: "provider failure",
    events: [
      { type: "text", text: "Partial" },
      { type: "error", message: "Runtime failed", recoverable: false },
      { type: "done", stop_reason: "completed" },
    ],
    outcome: "failed", status: "Failed", fleet: "error",
    notification: "task.turn_failed",
  },
  {
    label: "cancellation",
    events: [
      { type: "text", text: "Partial" },
      { type: "done", stop_reason: "user_abort" },
    ],
    outcome: "cancelled", status: "Stopped", fleet: "idle",
    notification: null,
  },
  {
    label: "continued hard error",
    events: [
      { type: "error", message: "Edit failed", recoverable: false },
      { type: "text", text: "Retry succeeded" },
      { type: "done", stop_reason: "end_turn" },
    ],
    outcome: "completed", status: "Completed", fleet: "idle",
    notification: "task.turn_completed",
  },
  {
    label: "terminal failure after trailing output",
    events: [
      { type: "error", message: "Authentication failed", recoverable: false },
      { type: "text", text: "Trailing output" },
      { type: "done", stop_reason: "runtime_failure" },
    ],
    outcome: "failed", status: "Failed", fleet: "error",
    notification: "task.turn_failed",
  },
];

for (const provider of ["claude-code", "codex", "cursor", "kiro"] as const) {
  for (const fixture of cases) {
    test(`${provider} ${fixture.label}: durable host and direct renderer agree`, () => {
      let receipt = createTurnReceipt();
      for (const event of fixture.events) receipt = observeTurnEvent(receipt, event);
      receipt = finishTurnReceipt(receipt, "2026-10-01T00:00:00Z");
      expect(receipt.outcome).toBe(fixture.outcome);
      const placeholder = {
        id: "response", role: "assistant" as const, providerId: provider,
        model: "model", turnId: "turn", content: "", parts: [],
        isStreaming: true, terminalReceipt: createTurnReceipt(),
      };
      const replayed = replayProviderEventsToTaskState({
        taskId: "task", messages: [placeholder], provider, model: "model",
        turnId: "turn", events: fixture.events,
      });
      // Validate the persistence decoder, as used after renderer restart.
      const message = ChatMessageSchema.parse(JSON.parse(JSON.stringify(replayed.messages.at(-1)!)));
      expect(message.terminalReceipt?.outcome).toBe(fixture.outcome);
      expect(message.terminalReceipt?.responseText).toBeNull();
      expect(resolveRunStatus({ activeTurnId: null, activity: null, retained: null, message }).label).toBe(fixture.status);
      expect(classifyTaskStatus({ task, messages: [message] })).toBe(fixture.fleet);
      const session = {
        ...createEmptyWorkspaceState(), tasks: [task],
        messagesByTask: { task: [message] }, activeTurnIdsByTask: {},
        nativeSessionReadyByTask: {},
      };
      const args = {
        state: scope, session, workspaceId: "workspace", taskId: "task",
        turnId: "turn", provider, events: fixture.events,
      };
      const notification = buildTaskTurnFailedNotificationInput(args) ?? buildTaskTurnCompletedNotificationInput(args);
      expect(notification?.kind ?? null).toBe(fixture.notification);
      const state = {
        ...session, activeWorkspaceId: "workspace", layout: { terminalDocked: false },
        hostOwnedTurnIdsByTask: {}, workspaceRuntimeCacheById: {},
        taskWorkspaceIdById: {}, providerTurnActivityByTask: {},
        retainedTurnActivityByTask: {},        workspaceSnapshotVersion: 0,
      };
      const projectedSession = attachTurnReceiptToSession(session, "task", "turn", receipt);
      const synced = applyHostTaskTurnSync({
        state,
        loaded: {
          persistedSession: projectedSession, persistedActiveTurnId: undefined,
          messages: projectedSession.messagesByTask.task!, messageCount: 1,
        },
        update: {
          workspaceId: "workspace", taskId: "task", turnId: "turn",
          providerId: provider, model: "model", sequence: 2,
          eventType: "done", done: true, terminalReceipt: displayTurnReceipt(receipt),
          activityEvents: fixture.events.flatMap((event) => {
            const projected = repositoryLocalMcpTaskTurnActivityEvent(event);
            return projected ? [projected] : [];
          }),
        },
      });
      const retained = synced.statePatch.retainedTurnActivityByTask?.task;
      expect(retained?.outcome).toBe(fixture.outcome === "cancelled" ? "stopped" : fixture.outcome);
      expect(resolveRunStatus({ activeTurnId: null, activity: null, retained: retained ?? null, message: projectedSession.messagesByTask.task![0]! }).label).toBe(fixture.status);
    });
  }
}

test("joining a historical done-only turn without a receipt preserves unknown", () => {
  const replayed = replayProviderEventsToTaskState({ taskId: "task", messages: [], provider: "codex", model: "model", turnId: "old-turn", events: [{ type: "done", stop_reason: "completed" }] });
  expect(replayed.messages.at(-1)?.terminalReceipt?.outcome).toBe("unknown");
  const started = startProviderTurnActivity({ activityByTask: {}, taskId: "task", turnId: "old-turn", providerId: "codex" });
  const reduced = reduceProviderTurnActivityEvents({ activityByTask: started, taskId: "task", turnId: "old-turn", providerId: "codex", events: [{ type: "text", text: "" }, { type: "done" }], terminalReceipt: null });
  expect(reduced.retiredSnapshot?.terminalReceipt?.outcome).toBe("unknown");
  const retained = retainRetiredTurnActivity({
    retainedByTask: {}, previous: started, next: reduced.activityByTask,
    taskId: "task", snapshot: reduced.retiredSnapshot,
  });
  expect(retained.task?.outcome).toBe("unknown");
  expect(resolveRunStatus({ activeTurnId: null, activity: null, retained: null, message: replayed.messages.at(-1)! }).label).toBe("Ended");
});

test("new live empty completion fails in Activity and cannot be rewritten after cancellation", () => {
  const started = startProviderTurnActivity({ activityByTask: {}, taskId: "task", turnId: "turn", providerId: "codex", now: 1000 });
  const reduced = reduceProviderTurnActivityEvents({ activityByTask: started, taskId: "task", turnId: "turn", providerId: "codex", events: [{ type: "done", stop_reason: "completed" }], now: 2000 });
  const retained = retainRetiredTurnActivity({ retainedByTask: {}, previous: started, next: reduced.activityByTask, snapshot: reduced.retiredSnapshot, taskId: "task" });
  expect(retained.task?.outcome).toBe("failed");
  let receipt = observeTurnEvent(createTurnReceipt(), { type: "done", stop_reason: "user_abort" });
  receipt = finishTurnReceipt(receipt, "2026-10-01T00:00:00Z");
  expect(finishTurnReceipt(observeTurnEvent(receipt, { type: "text", text: "Late reply" }), "2026-10-01T01:00:00Z")).toEqual(receipt);
});

test("late host completion cannot retire a newer active attempt", () => {
  const session = {
    ...createEmptyWorkspaceState(), tasks: [task],
    messagesByTask: {}, activeTurnIdsByTask: { task: "new-turn" },
    nativeSessionReadyByTask: {},
  };
  const activity = startProviderTurnActivity({
    activityByTask: {}, taskId: "task", turnId: "new-turn", providerId: "codex",
  });
  const state = {
    ...session, activeWorkspaceId: "workspace", layout: { terminalDocked: false },
    hostOwnedTurnIdsByTask: {}, workspaceRuntimeCacheById: {}, taskWorkspaceIdById: {},
    providerTurnActivityByTask: activity, retainedTurnActivityByTask: {},
    workspaceSnapshotVersion: 0,
  };
  const oldReceipt = finishTurnReceipt(
    observeTurnEvent(createTurnReceipt(), { type: "done" }), "2026-10-01",
  );
  const result = applyHostTaskTurnSync({
    state,
    loaded: {
      persistedSession: session, persistedActiveTurnId: "new-turn",
      messages: [], messageCount: 0,
    },
    update: {
      workspaceId: "workspace", taskId: "task", turnId: "old-turn",
      providerId: "codex", model: "model", sequence: 1, eventType: "done",
      done: true, terminalReceipt: oldReceipt, activityEvents: [{ type: "done" }],
    },
  });
  expect(result.statePatch.providerTurnActivityByTask).toBe(activity);
  expect(result.statePatch.retainedTurnActivityByTask).toEqual({});
  expect(result.statePatch.activeTurnIdsByTask?.task).toBe("new-turn");
});

test("split plan messages carry output evidence without repeating response text", () => {
  const replayed = replayProviderEventsToTaskState({
    taskId: "task", messages: [], provider: "codex", model: "model", turnId: "turn",
    events: [
      { type: "plan_ready", planText: "Make the change." },
      { type: "thinking", text: "Thinking after plan" },
      { type: "done", stop_reason: "completed" },
    ],
  });
  expect(replayed.messages.at(-1)?.terminalReceipt).toMatchObject({
    outputObserved: true, outcome: "completed", responseText: null,
  });
});
