import { describe, expect, test } from "bun:test";
import { parseWorkspaceShell, parseWorkspaceSnapshot } from "../src/lib/task-context/schemas";

function createWorkspaceBase() {
  return {
    activeTaskId: "",
    tasks: [],
    promptDraftByTask: {},
    providerSessionByTask: {},
    editorTabs: [],
    activeEditorTabId: null,
    terminalTabs: [{
      id: "terminal-1",
      title: "Workspace",
      linkedTaskId: null,
      backend: "xterm",
      cwd: "/tmp/workspace",
      createdAt: 1,
    }],
    activeTerminalTabId: "terminal-1",
    terminalDocked: true,
    cliSessionTabs: [],
    activeCliSessionTabId: null,
    activeSurface: {
      kind: "task",
      taskId: "",
    },
    workspaceInformation: {
      jiraIssues: [],
      confluencePages: [],
      figmaResources: [],
      linkedPullRequests: [],
      slackThreads: [],
      notes: "",
      todos: [],
      customFields: [],
    },
  };
}

describe("task-context workspace schemas", () => {
  test("normalizes legacy xterm terminal tabs in workspace shell payloads", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        messageCountByTask: {},
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.terminalTabs).toEqual([{
      id: "terminal-1",
      title: "Workspace",
      linkedTaskId: null,
      backend: "ghostty",
      cwd: "/tmp/workspace",
      createdAt: 1,
    }]);
    expect(parsed?.terminalDocked).toBe(true);
  });

  test("normalizes legacy xterm terminal tabs in workspace snapshot payloads", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        messagesByTask: {},
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.terminalTabs?.[0]?.backend).toBe("ghostty");
    expect(parsed?.terminalDocked).toBe(true);
  });

  test("parses prompt draft runtime overrides and queued-next-turn content from snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-04-11T00:00:00.000Z",
          unread: false,
          controlMode: "interactive",
          controlOwner: "stave",
        }],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {
          "task-1": {
            text: "",
            attachedFilePaths: [],
            attachments: [],
            runtimeOverrides: {
              claudePermissionMode: "auto",
              claudePermissionModeBeforePlan: "auto",
              codexPlanMode: true,
            },
            queuedNextTurn: {
              queuedAt: "2026-04-11T00:00:00.000Z",
              sourceTurnId: "turn-1",
              content: "follow-up prompt",
            },
          },
        },
      },
    });

    expect(parsed?.promptDraftByTask["task-1"]).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: {
        claudePermissionMode: "auto",
        claudePermissionModeBeforePlan: "auto",
        codexPlanMode: true,
      },
      queuedNextTurn: {
        queuedAt: "2026-04-11T00:00:00.000Z",
        sourceTurnId: "turn-1",
        content: "follow-up prompt",
      },
    });
  });

  test("defaults editor tab content state to ready", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        messageCountByTask: {},
        editorTabs: [{
          id: "file:/tmp/project/src/app.ts",
          filePath: "/tmp/project/src/app.ts",
          language: "typescript",
          hasConflict: false,
          isDirty: false,
        }],
      },
    });

    expect(parsed?.editorTabs).toEqual([{
      id: "file:/tmp/project/src/app.ts",
      filePath: "/tmp/project/src/app.ts",
      language: "typescript",
      content: "",
      contentState: "ready",
      hasConflict: false,
      isDirty: false,
    }]);
  });
});
