import { describe, expect, test } from "bun:test";
import {
  parseWorkspaceShell,
  parseWorkspaceSnapshot,
} from "../src/lib/task-context/schemas";

function createWorkspaceBase() {
  return {
    activeTaskId: "",
    tasks: [],
    promptDraftByTask: {},
    providerSessionByTask: {},
    editorTabs: [],
    activeEditorTabId: null,
    terminalTabs: [
      {
        id: "terminal-1",
        title: "Workspace",
        linkedTaskId: null,
        backend: "ghostty",
        cwd: "/tmp/workspace",
        createdAt: 1,
      },
    ],
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
      storybookResources: [],
      linkedPullRequests: [],
      slackThreads: [],
      notes: "",
      todos: [],
      customFields: [],
    },
  };
}

describe("task-context workspace schemas", () => {
  test("accepts legacy session ids and persisted session cursors", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        providerSessionByTask: {
          "task-legacy": {
            "claude-code": "session-legacy",
          },
          "task-cursor": {
            codex: {
              nativeSessionId: "thread-1",
              syncedThroughMessageId: "task-cursor-m-4",
            },
          },
        },
        messageCountByTask: {},
      },
    });

    expect(parsed?.providerSessionByTask).toEqual({
      "task-legacy": {
        "claude-code": "session-legacy",
      },
      "task-cursor": {
        codex: {
          nativeSessionId: "thread-1",
          syncedThroughMessageId: "task-cursor-m-4",
        },
      },
    });
  });

  test("preserves the manual task-title marker across workspace parsing", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Keep this title",
            titleManuallySet: true,
            provider: "codex",
            updatedAt: "2026-07-23T00:00:00.000Z",
            unread: false,
          },
        ],
        messageCountByTask: { "task-1": 0 },
      },
    });

    expect(parsed?.tasks[0]?.titleManuallySet).toBe(true);
  });

  test("preserves task-scoped retrieved context across workspace parsing", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        activeTaskId: "task-crane",
        tasks: [
          {
            id: "task-crane",
            title: "Crane ATL-1",
            provider: "codex",
            updatedAt: "2026-07-26T00:00:00.000Z",
            unread: false,
            sourceContexts: [
              {
                type: "retrieved_context",
                sourceId: "crane:ATL-1",
                title: "Crane ATL-1",
                content: "Untrusted issue material.",
              },
            ],
          },
        ],
        messageCountByTask: { "task-crane": 1 },
      },
    });

    expect(parsed?.tasks[0]?.sourceContexts).toEqual([
      {
        type: "retrieved_context",
        sourceId: "crane:ATL-1",
        title: "Crane ATL-1",
        content: "Untrusted issue material.",
      },
    ]);
  });

  test("normalizes legacy ghostty terminal tabs to xterm in workspace shell payloads", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        messageCountByTask: {},
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.terminalTabs).toEqual([
      {
        id: "terminal-1",
        title: "Workspace",
        linkedTaskId: null,
        backend: "xterm",
        cwd: "/tmp/workspace",
        createdAt: 1,
      },
    ]);
    expect(parsed?.terminalDocked).toBe(true);
  });

  test("normalizes legacy ghostty terminal tabs to xterm in workspace snapshot payloads", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        messagesByTask: {},
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.terminalTabs?.[0]?.backend).toBe("xterm");
    expect(parsed?.terminalDocked).toBe(true);
  });

  test("preserves steer delivery metadata in workspace snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        messagesByTask: {
          "task-1": [
            {
              id: "client-steer-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "Also update the tests",
              parts: [{ type: "text", text: "Also update the tests" }],
              steeredIntoTurnId: "turn-1",
              steerDeliveryState: "accepted",
            },
          ],
        },
      },
    });

    expect(parsed?.messagesByTask["task-1"]?.[0]).toMatchObject({
      steeredIntoTurnId: "turn-1",
      steerDeliveryState: "accepted",
    });
  });

  test("preserves native provider turn metadata in workspace snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        messagesByTask: {
          "task-1": [
            {
              id: "assistant-1",
              role: "assistant",
              model: "gpt-5.6-terra",
              providerId: "codex",
              nativeProviderSessionId: "thread-1",
              nativeProviderTurnId: "turn-1",
              content: "Done.",
              parts: [{ type: "text", text: "Done." }],
            },
          ],
        },
      },
    });

    expect(parsed?.messagesByTask["task-1"]?.[0]).toMatchObject({
      nativeProviderSessionId: "thread-1",
      nativeProviderTurnId: "turn-1",
    });
  });

  test("normalizes legacy fleet view workspace surfaces to task fallback", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        activeSurface: { kind: "fleet-view" },
        messageCountByTask: {},
      },
    });

    expect(parsed?.activeSurface).toEqual({ kind: "task", taskId: "" });
  });

  test("parses compare run as a workspace active surface", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        activeSurface: { kind: "compare-run", compareRunId: "compare-1" },
        messageCountByTask: {},
      },
    });

    expect(parsed?.activeSurface).toEqual({
      kind: "compare-run",
      compareRunId: "compare-1",
    });
  });

  test("preserves Storybook access metadata in workspace snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        messagesByTask: {},
        workspaceInformation: {
          ...createWorkspaceBase().workspaceInformation,
          storybookResources: [
            {
              id: "storybook-1",
              title: "Private Storybook",
              url: "https://silver-chainsaw-ww7n83m.pages.github.io/?path=/story/example--default",
              note: "",
              access: {
                kind: "requires_github_auth",
                provider: "github-pages",
                externalRepo: "acme/storybook",
                readableVia: "github_cli",
                sourceHint: "storybook-static",
              },
            },
          ],
        },
      },
    });

    expect(parsed?.workspaceInformation.storybookResources[0]?.access).toEqual({
      kind: "requires_github_auth",
      provider: "github-pages",
      externalRepo: "acme/storybook",
      readableVia: "github_cli",
      sourceHint: "storybook-static",
    });
  });

  test("parses prompt draft runtime overrides, queues, batch fragments, and annotation gadgets from snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        ...createWorkspaceBase(),
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-04-11T00:00:00.000Z",
            unread: false,
            controlMode: "interactive",
            controlOwner: "stave",
          },
        ],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {
          "task-1": {
            text: "",
            attachedFilePaths: [],
            attachments: [
              {
                kind: "lens-annotations",
                id: "lens-1",
                workspaceId: "workspace-1",
                lensSessionId: "lens-session-1",
                label: "Lens comments",
                count: 2,
                summary: "1. Header is cramped",
                content: "[Lens Visual Comments]\n\nraw details",
              },
            ],
            promptBatch: [
              {
                id: "batch-1",
                createdAt: "2026-04-11T00:00:01.000Z",
                content: "first fragment",
                attachedFilePaths: ["src/comment-context.ts"],
                attachments: [
                  {
                    kind: "image",
                    id: "image-1",
                    dataUrl: "data:image/png;base64,comment",
                    label: "Comment image",
                  },
                ],
              },
            ],
            queuedTurns: [
              {
                id: "queue-1",
                queuedAt: "2026-04-11T00:00:02.000Z",
                sourceTurnId: "turn-1",
                content: "follow-up prompt",
                attachedFilePaths: ["src/app.tsx"],
                attachments: [],
                providerId: "claude-code",
                model: "claude-opus-4-6",
              },
              {
                id: "queue-2",
                queuedAt: "2026-04-11T00:00:03.000Z",
                sourceTurnId: "turn-1",
                content: "second follow-up",
                attachedFilePaths: [],
                attachments: [],
                // Unknown provider ids (e.g. written by a newer build) must
                // degrade to "follow the task provider", not reject the
                // whole workspace snapshot.
                providerId: "future-provider",
              },
            ],
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
      attachments: [
        {
          kind: "lens-annotations",
          id: "lens-1",
          workspaceId: "workspace-1",
          lensSessionId: "lens-session-1",
          label: "Lens comments",
          count: 2,
          summary: "1. Header is cramped",
          content: "[Lens Visual Comments]\n\nraw details",
        },
      ],
      promptBatch: [
        {
          id: "batch-1",
          createdAt: "2026-04-11T00:00:01.000Z",
          content: "first fragment",
          attachedFilePaths: ["src/comment-context.ts"],
          attachments: [
            {
              kind: "image",
              id: "image-1",
              dataUrl: "data:image/png;base64,comment",
              label: "Comment image",
            },
          ],
        },
      ],
      queuedTurns: [
        {
          id: "queue-1",
          queuedAt: "2026-04-11T00:00:02.000Z",
          sourceTurnId: "turn-1",
          content: "follow-up prompt",
          attachedFilePaths: ["src/app.tsx"],
          attachments: [],
          providerId: "claude-code",
          model: "claude-opus-4-6",
        },
        {
          id: "queue-2",
          queuedAt: "2026-04-11T00:00:03.000Z",
          sourceTurnId: "turn-1",
          content: "second follow-up",
          attachedFilePaths: [],
          attachments: [],
        },
      ],
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

  test("accepts a git-graph editor tab so the workspace shell still restores", () => {
    // Regression: a persisted tab with kind "git-graph" must not make the whole
    // workspace payload fail to parse (which would block shell restoration).
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        messageCountByTask: {},
        editorTabs: [
          {
            id: "git-graph",
            filePath: "Commit graph",
            kind: "git-graph",
            language: "",
            content: "",
            hasConflict: false,
            isDirty: false,
          },
        ],
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.editorTabs[0]?.kind).toBe("git-graph");
  });

  test("defaults editor tab content state to ready", () => {
    const parsed = parseWorkspaceShell({
      payload: {
        ...createWorkspaceBase(),
        messageCountByTask: {},
        editorTabs: [
          {
            id: "file:/tmp/project/src/app.ts",
            filePath: "/tmp/project/src/app.ts",
            language: "typescript",
            hasConflict: false,
            isDirty: false,
          },
        ],
      },
    });

    expect(parsed?.editorTabs).toEqual([
      {
        id: "file:/tmp/project/src/app.ts",
        filePath: "/tmp/project/src/app.ts",
        language: "typescript",
        content: "",
        contentState: "ready",
        hasConflict: false,
        isDirty: false,
      },
    ]);
  });
});
