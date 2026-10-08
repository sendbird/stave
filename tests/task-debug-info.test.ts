import { describe, expect, test } from "bun:test";
import {
  buildTaskDebugInfo,
  type TaskDebugInfoState,
} from "../src/components/panes/task-debug-info";
import type { ChatMessage, Task } from "../src/types/chat";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Fix the flaky test",
    provider: "claude-code",
    updatedAt: "2026-01-01T00:00:00.000Z",
    unread: false,
    controlMode: "user",
    controlOwner: "user",
    ...overrides,
  } as Task;
}

function makeState(overrides: Partial<TaskDebugInfoState> = {}): TaskDebugInfoState {
  return {
    tasks: [makeTask()],
    messagesByTask: {},
    providerSessionByTask: {},
    taskWorkspaceIdById: { "task-1": "ws-1" },
    activeWorkspaceId: "ws-other",
    workspaces: [{ id: "ws-1", name: "feat/debug", updatedAt: "2026-01-01T00:00:00.000Z" }],
    workspaceBranchById: { "ws-1": "feat/debug" },
    workspacePathById: { "ws-1": "/tmp/repo/.stave/workspaces/feat-debug" },
    repositoryPath: "/tmp/other-repo",
    recentRepositories: [
      {
        repositoryPath: "/tmp/repo",
        workspaces: [{ id: "ws-1", name: "feat/debug", updatedAt: "2026-01-01T00:00:00.000Z" }],
      },
    ],
    settings: {
      modelClaude: "claude-sonnet-5-5",
      modelCodex: "gpt-5-codex",
      modelCursor: "auto",
      modelKiro: "auto",
    },
    ...overrides,
  };
}

describe("buildTaskDebugInfo", () => {
  test("returns null for an unknown task", () => {
    expect(buildTaskDebugInfo({ state: makeState(), taskId: "missing" })).toBeNull();
  });

  test("falls back to the configured model and reports no sessions", () => {
    expect(buildTaskDebugInfo({ state: makeState(), taskId: "task-1", appVersion: "0.25.2" })).toBe(
      [
        "Stave debug info",
        "task: task-1 — Fix the flaky test",
        "provider: claude-code / claude-sonnet-5-5",
        "session: none recorded",
        "workspace: ws-1 feat/debug (feat/debug) /tmp/repo/.stave/workspaces/feat-debug",
        "repo: /tmp/repo",
        "app: Stave 0.25.2",
      ].join("\n"),
    );
  });

  test("uses the latest assistant model, lists every provider session and resolves the owning repository", () => {
    const messages = [
      { id: "m1", role: "user", model: "", providerId: "user", content: "hi" },
      { id: "m2", role: "assistant", model: "claude-opus-5-5", providerId: "claude-code", content: "hello" },
      { id: "m3", role: "user", model: "", providerId: "user", content: "more" },
    ] as unknown as ChatMessage[];
    const text = buildTaskDebugInfo({
      state: makeState({
        messagesByTask: { "task-1": messages },
        providerSessionByTask: {
          "task-1": {
            "claude-code": "sess-claude",
            codex: { nativeSessionId: "thread-codex" },
            accounts: { "acct-2": { "claude-code": "sess-claude-acct" } },
          },
        },
      }),
      taskId: "task-1",
      appVersion: null,
    });
    expect(text).toContain("provider: claude-code / claude-opus-5-5");
    expect(text).toContain("session: claude-code sess-claude");
    expect(text).toContain("session: codex thread-codex");
    expect(text).toContain("session: claude-code @acct-2 sess-claude-acct");
    expect(text).toContain("repo: /tmp/repo");
    expect(text).toContain("app: Stave unknown");
  });

  test("uses the active workspace and repository when the task has no mapping", () => {
    const text = buildTaskDebugInfo({
      state: makeState({
        taskWorkspaceIdById: {},
        activeWorkspaceId: "ws-1",
        recentRepositories: [],
      }),
      taskId: "task-1",
    });
    expect(text).toContain("workspace: ws-1 feat/debug (feat/debug)");
    expect(text).toContain("repo: /tmp/other-repo");
  });
});
