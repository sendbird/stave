import { describe, expect, test } from "bun:test";
import {
  classifyTaskStatus,
  collectFleetAttentionTasks,
  compareFleetTaskStatus,
  countFleetAttentionTasksAcrossWorkspaces,
  countFleetAttentionTasks,
  hasFleetTaskAttentionStatus,
  isFleetTaskFilterActive,
  matchesFleetTaskFilter,
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
            parts: [
              { type: "system_event", content: "[error] provider failed" },
            ],
          }),
        ],
      }),
    ).toBe("error");
  });

  test("keeps a still-current error on an active turn", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        activeTurnId: "turn-1",
        activity: buildActivity(),
        messages: [
          buildAssistantMessage({
            isStreaming: true,
            parts: [
              { type: "system_event", content: "[error] provider failed" },
            ],
          }),
        ],
      }),
    ).toBe("error");
  });

  test("clears the alert once the turn continues past an error", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        activeTurnId: "turn-1",
        activity: buildActivity(),
        messages: [
          buildAssistantMessage({
            isStreaming: true,
            parts: [
              { type: "system_event", content: "[error] File change failed" },
              { type: "text", text: "Retrying the edit." },
            ],
          }),
        ],
      }),
    ).toBe("running");
  });

  test("drops the alert after a continued turn finishes normally", () => {
    const parts = [
      { type: "system_event" as const, content: "[error] File change failed" },
      { type: "text" as const, text: "Applied the edit." },
    ];
    expect(
      classifyTaskStatus({
        task: buildTask(),
        messages: [
          buildAssistantMessage({
            completedAt: "2026-06-17T00:01:00.000Z",
            terminalStopReason: "end_turn",
            parts,
          }),
        ],
      }),
    ).toBe("idle");
    expect(
      classifyTaskStatus({
        task: buildTask(),
        messages: [
          buildAssistantMessage({
            completedAt: "2026-06-17T00:01:00.000Z",
            parts,
          }),
        ],
      }),
    ).toBe("idle");
  });

  test("keeps the alert when a failure stop ends the turn", () => {
    expect(
      classifyTaskStatus({
        task: buildTask(),
        messages: [
          buildAssistantMessage({
            completedAt: "2026-06-17T00:01:00.000Z",
            terminalStopReason: "runtime_failure",
            parts: [
              {
                type: "system_event",
                content: "[error] authentication failed",
              },
              { type: "text", text: "Trailing provider output" },
            ],
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

  test("collects attention tasks in input-before-approval order", () => {
    const tasks = [
      buildTask({
        id: "task-approval",
        updatedAt: "2026-06-17T02:00:00.000Z",
      }),
      buildTask({
        id: "task-input",
        updatedAt: "2026-06-17T01:00:00.000Z",
      }),
    ];
    const messagesByTask = {
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
    };

    expect(
      collectFleetAttentionTasks({
        tasks,
        messagesByTask,
        activeTurnIdsByTask: {},
        providerTurnActivityByTask: {},
      }).map((task) => task.taskId),
    ).toEqual(["task-input", "task-approval"]);
  });

  test("matches status and text filters together", () => {
    expect(
      matchesFleetTaskFilter({
        status: "waiting-input",
        filter: "attention",
        query: "checkout",
        taskTitle: "Review checkout flow",
        workspaceName: "payments",
        repositoryName: "Storefront",
      }),
    ).toBe(true);
    expect(
      matchesFleetTaskFilter({
        status: "running",
        filter: "attention",
        query: "checkout",
        taskTitle: "Review checkout flow",
        workspaceName: "payments",
        repositoryName: "Storefront",
      }),
    ).toBe(false);
    expect(
      matchesFleetTaskFilter({
        status: "unknown",
        filter: "idle",
        query: "",
        taskTitle: "Cold task",
        workspaceName: "payments",
        repositoryName: "Storefront",
      }),
    ).toBe(false);
  });

  test("counts loaded workspaces across projects and skips cold sessions", () => {
    const inputMessage = buildAssistantMessage({
      parts: [
        {
          type: "user_input",
          requestId: "input-1",
          toolName: "request_user_input",
          questions: [],
          state: "input-requested",
        },
      ],
    });
    const approvalMessage = buildAssistantMessage({
      parts: [
        {
          type: "approval",
          requestId: "approval-1",
          toolName: "Bash",
          description: "Run a command",
          state: "approval-requested",
        },
      ],
    });

    expect(
      countFleetAttentionTasksAcrossWorkspaces({
        workspaceIds: ["active", "cached", "cold"],
        activeWorkspaceId: "active",
        activeSession: {
          tasks: [buildTask({ id: "active-task" })],
          messagesByTask: { "active-task": [inputMessage] },
          activeTurnIdsByTask: {},
        },
        runtimeSessionsByWorkspaceId: {
          cached: {
            tasks: [buildTask({ id: "cached-task" })],
            messagesByTask: { "cached-task": [approvalMessage] },
            activeTurnIdsByTask: {},
          },
        },
        providerTurnActivityByTask: {},
      }),
    ).toBe(2);
  });

  test("reports whether a filter is active", () => {
    expect(isFleetTaskFilterActive({ filter: "all", query: "" })).toBe(false);
    expect(isFleetTaskFilterActive({ filter: "all", query: "  " })).toBe(false);
    expect(isFleetTaskFilterActive({ filter: "error", query: "" })).toBe(true);
    expect(isFleetTaskFilterActive({ filter: "all", query: "agent" })).toBe(
      true,
    );
  });
});
