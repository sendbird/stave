import { describe, expect, test } from "bun:test";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  countFleetAttentionTasks,
  deriveFleetLifecycleStatus,
  groupFleetWorkspacesByLane,
  hasFleetTaskAttentionStatus,
  summarizeFleetRespondingTasks,
} from "../src/lib/fleet/task-status";
import type { ProviderTurnActivitySnapshot } from "../src/lib/providers/turn-status";
import type { ChatMessage, Task } from "../src/types/chat";

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task one",
    provider: "claude-code",
    updatedAt: "2026-06-17T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
    ...overrides,
  };
}

function buildAssistantMessage(
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: "message-1",
    role: "assistant",
    model: "claude-sonnet-4-6",
    providerId: "claude-code",
    content: "",
    isStreaming: false,
    parts: [],
    ...overrides,
  };
}

function buildActivity(
  overrides: Partial<ProviderTurnActivitySnapshot> = {},
): ProviderTurnActivitySnapshot {
  return {
    turnId: "turn-1",
    providerId: "claude-code",
    startedAt: 1000,
    lastEventAt: 2000,
    stalledAt: null,
    pendingInteraction: null,
    ...overrides,
  };
}

describe("classifyTaskStatus", () => {
  test("prioritizes pending user input over active running state", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        activeTurnId: "turn-1",
        activity: buildActivity(),
        messages: [
          buildAssistantMessage({
            parts: [
              {
                type: "user_input",
                requestId: "input-1",
                toolName: "request_user_input",
                questions: [],
                state: "input-requested",
              },
            ],
          }),
        ],
      }),
    ).toBe("waiting-input");
  });

  test("detects pending approval before running", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        activeTurnId: "turn-1",
        activity: buildActivity(),
        messages: [
          buildAssistantMessage({
            parts: [
              {
                type: "approval",
                requestId: "approval-1",
                toolName: "Bash",
                description: "Run a command",
                state: "approval-requested",
              },
            ],
          }),
        ],
      }),
    ).toBe("waiting-approval");
  });

  test("classifies stalled active turns as error", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        activeTurnId: "turn-1",
        activity: buildActivity({ stalledAt: 3000 }),
      }),
    ).toBe("error");
  });

  test("classifies latest assistant error messages as error", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        messages: [
          buildAssistantMessage({
            parts: [{ type: "system_event", content: "[error] provider failed" }],
          }),
        ],
      }),
    ).toBe("error");
  });

  test("classifies an active non-stalled turn as running", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        activeTurnId: "turn-1",
        activity: buildActivity(),
      }),
    ).toBe("running");
  });

  test("ignores archived and legacy branch tasks", () => {
    expect(
      classifyTaskStatus({
        task: buildTask({ archivedAt: "2026-06-17T01:00:00.000Z" }),
        activeTurnId: "turn-1",
        activity: buildActivity(),
      }),
    ).toBe("idle");
    expect(
      classifyTaskStatus({
        task: buildTask({ coliseumParentTaskId: "task-parent" }),
        activeTurnId: "turn-1",
        activity: buildActivity(),
      }),
    ).toBe("idle");
  });

  test("classifies inactive tasks with no attention as idle", () => {
    expect(classifyTaskStatus({ task: buildTask() })).toBe("idle");
  });
});

describe("fleet task status helpers", () => {
  test("orders statuses by attention priority", () => {
    expect(
      compareFleetTaskStatus("waiting-input", "waiting-approval"),
    ).toBeLessThan(0);
    expect(compareFleetTaskStatus("error", "running")).toBeLessThan(0);
    expect(compareFleetTaskStatus("idle", "running")).toBeGreaterThan(0);
  });

  test("detects attention statuses", () => {
    expect(hasFleetTaskAttentionStatus("waiting-input")).toBe(true);
    expect(hasFleetTaskAttentionStatus("waiting-approval")).toBe(true);
    expect(hasFleetTaskAttentionStatus("running")).toBe(false);
  });

  test("summarizes only active visible responding tasks", () => {
    const summary = summarizeFleetRespondingTasks({
      tasks: [
        buildTask({ id: "task-claude", provider: "claude-code" }),
        buildTask({ id: "task-codex", provider: "codex" }),
        buildTask({ id: "task-idle" }),
        buildTask({
          id: "task-archived",
          archivedAt: "2026-06-17T01:00:00.000Z",
        }),
      ],
      messagesByTask: {
        "task-claude": [
          buildAssistantMessage({
            providerId: "claude-code",
            isStreaming: true,
          }),
        ],
        "task-codex": [
          buildAssistantMessage({
            providerId: "codex",
            model: "gpt-5.4",
            parts: [
              {
                type: "approval",
                requestId: "approval-1",
                toolName: "Bash",
                description: "Run a command",
                state: "approval-requested",
              },
            ],
          }),
        ],
      },
      activeTurnIdsByTask: {
        "task-claude": "turn-1",
        "task-codex": "turn-2",
        "task-archived": "turn-3",
      },
      providerTurnActivityByTask: {
        "task-claude": buildActivity({ turnId: "turn-1" }),
        "task-codex": buildActivity({
          turnId: "turn-2",
          providerId: "codex",
        }),
        "task-archived": buildActivity({ turnId: "turn-3" }),
      },
    });

    expect(summary).toEqual({
      respondingTaskCount: 2,
      respondingProviderIds: ["claude-code", "codex"],
      hasWarningTask: false,
    });
  });

  test("marks active stalled tasks as warning tasks", () => {
    const summary = summarizeFleetRespondingTasks({
      tasks: [buildTask()],
      messagesByTask: {},
      activeTurnIdsByTask: {
        "task-1": "turn-1",
      },
      providerTurnActivityByTask: {
        "task-1": buildActivity({ stalledAt: 3000 }),
      },
    });

    expect(summary.hasWarningTask).toBe(true);
  });

  test("counts tasks waiting for input or approval", () => {
    expect(
      countFleetAttentionTasks({
        tasks: [
          buildTask({ id: "task-input" }),
          buildTask({ id: "task-approval" }),
          buildTask({ id: "task-running" }),
        ],
        messagesByTask: {
          "task-input": [
            buildAssistantMessage({
              parts: [
                {
                  type: "user_input",
                  requestId: "input-1",
                  toolName: "request_user_input",
                  questions: [],
                  state: "input-requested",
                },
              ],
            }),
          ],
          "task-approval": [
            buildAssistantMessage({
              parts: [
                {
                  type: "approval",
                  requestId: "approval-1",
                  toolName: "Bash",
                  description: "Run a command",
                  state: "approval-requested",
                },
              ],
            }),
          ],
        },
        activeTurnIdsByTask: {
          "task-input": "turn-1",
          "task-approval": "turn-2",
          "task-running": "turn-3",
        },
        providerTurnActivityByTask: {
          "task-input": buildActivity({ turnId: "turn-1" }),
          "task-approval": buildActivity({ turnId: "turn-2" }),
          "task-running": buildActivity({ turnId: "turn-3" }),
        },
      }),
    ).toBe(2);
  });
});

describe("deriveFleetLifecycleStatus", () => {
  test("merged or closed PR is done", () => {
    expect(
      deriveFleetLifecycleStatus({
        prStatus: "merged",
        hasRunningTask: true,
        hasRecentActivity: true,
      }),
    ).toBe("done");
    expect(
      deriveFleetLifecycleStatus({
        prStatus: "closed_unmerged",
        hasRunningTask: false,
        hasRecentActivity: false,
      }),
    ).toBe("done");
  });

  test("any open PR is in-review (wins over running work)", () => {
    for (const prStatus of [
      "draft",
      "review_required",
      "changes_requested",
      "checks_pending",
      "checks_failed",
      "merge_conflict",
      "behind_base",
      "ready_to_merge",
    ] as const) {
      expect(
        deriveFleetLifecycleStatus({
          prStatus,
          hasRunningTask: true,
          hasRecentActivity: true,
        }),
      ).toBe("in-review");
    }
  });

  test("no PR but live or recent work is in-progress", () => {
    expect(
      deriveFleetLifecycleStatus({
        prStatus: "no_pr",
        hasRunningTask: true,
        hasRecentActivity: false,
      }),
    ).toBe("in-progress");
    expect(
      deriveFleetLifecycleStatus({
        prStatus: null,
        hasRunningTask: false,
        hasRecentActivity: true,
      }),
    ).toBe("in-progress");
  });

  test("no PR and no activity is backlog", () => {
    expect(
      deriveFleetLifecycleStatus({
        prStatus: null,
        hasRunningTask: false,
        hasRecentActivity: false,
      }),
    ).toBe("backlog");
  });
});

describe("groupFleetWorkspacesByLane", () => {
  const workspaces = [
    { id: "ws-backlog" },
    { id: "ws-progress" },
    { id: "ws-review" },
    { id: "ws-done" },
    { id: "ws-unreported" },
  ];

  test("orders lanes live-first and defaults unreported to backlog", () => {
    const groups = groupFleetWorkspacesByLane({
      workspaces,
      lifecycleByWorkspaceId: {
        "ws-backlog": "backlog",
        "ws-progress": "in-progress",
        "ws-review": "in-review",
        "ws-done": "done",
      },
    });
    expect(groups.map((group) => group.lane)).toEqual([
      "in-progress",
      "in-review",
      "backlog",
      "done",
    ]);
    const backlog = groups.find((group) => group.lane === "backlog");
    expect(backlog?.workspaces.map((workspace) => workspace.id)).toEqual([
      "ws-backlog",
      "ws-unreported",
    ]);
  });

  test("drops empty lanes", () => {
    const groups = groupFleetWorkspacesByLane({
      workspaces: [{ id: "a" }, { id: "b" }],
      lifecycleByWorkspaceId: { a: "in-progress", b: "in-progress" },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.lane).toBe("in-progress");
    expect(groups[0]?.workspaces).toHaveLength(2);
  });
});
