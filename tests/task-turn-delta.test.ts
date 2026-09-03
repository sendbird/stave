import { describe, expect, test } from "bun:test";

import {
  HOST_OWNED_WORKSPACE_SHELL_FIELDS,
  mergeTaskTurnDeltaPayload,
  toWorkspaceShellMetaSource,
} from "../electron/persistence/task-turn-delta";
import type { PersistedWorkspaceShellPayload } from "../electron/persistence/types";

// Field ownership between host-service and the renderer.
//
// host-service used to save a streamed turn with `upsertWorkspace`, a
// whole-workspace write, so it rewrote prompt drafts, editor/terminal tabs,
// layout and workspace information from its own cached session copy. That copy
// can be minutes stale, so a streamed provider event could resurrect state the
// user had already changed. `mergeTaskTurnDeltaPayload` is the boundary that
// makes that impossible, so these tests pin it directly.

function createPayload(
  overrides?: Partial<PersistedWorkspaceShellPayload>,
): PersistedWorkspaceShellPayload {
  return {
    activeTaskId: "task-1",
    tasks: [
      {
        id: "task-1",
        title: "Task One",
        provider: "claude-code",
        updatedAt: "2026-01-01T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
    ],
    // Renderer-owned below this line.
    promptDraftByTask: {
      "task-1": { content: "a draft the user is still editing" },
    },
    reviewCommentsByTask: { "task-1": [{ id: "c1" }] },
    providerSessionByTask: {},
    editorTabs: [{ id: "tab-1", filePath: "/src/a.ts" }],
    editorTabsArtifactId: "artifact-1",
    editorTabsArtifactRelativePath: "artifacts/artifact-1.json",
    activeEditorTabId: "tab-1",
    terminalTabs: [{ id: "term-1" }],
    activeTerminalTabId: "term-1",
    terminalDocked: true,
    cliSessionTabs: [{ id: "cli-1" }],
    activeCliSessionTabId: "cli-1",
    activeSurface: { kind: "task", taskId: "task-1" },
    openTaskTabIds: ["task-1"],
    lensTabs: [{ id: "lens-1" }],
    paneTabMeta: { "tab-1": { pinned: true } },
    dockLayout: { left: 240 },
    workspaceInformation: { notes: "user notes" },
    messageCountByTask: { "task-1": 10 },
    ...overrides,
  } as unknown as PersistedWorkspaceShellPayload;
}

const RENDERER_OWNED_FIELDS = [
  "promptDraftByTask",
  "reviewCommentsByTask",
  "editorTabs",
  "editorTabsArtifactId",
  "editorTabsArtifactRelativePath",
  "activeEditorTabId",
  "terminalTabs",
  "activeTerminalTabId",
  "terminalDocked",
  "cliSessionTabs",
  "activeCliSessionTabId",
  "activeSurface",
  "openTaskTabIds",
  "lensTabs",
  "paneTabMeta",
  "dockLayout",
  "workspaceInformation",
] as const;

describe("mergeTaskTurnDeltaPayload", () => {
  test("leaves every renderer-owned field byte-identical", () => {
    const payload = createPayload();
    const next = mergeTaskTurnDeltaPayload({
      payload,
      taskId: "task-1",
      task: {
        id: "task-1",
        title: "Renamed by the host",
        provider: "claude-code",
        updatedAt: "2026-01-02T00:00:00.000Z",
        unread: true,
        archivedAt: null,
      },
      providerSession: { "claude-code": { nativeSessionId: "s-1" } },
      messageCount: 12,
    });

    for (const field of RENDERER_OWNED_FIELDS) {
      expect(next[field as keyof PersistedWorkspaceShellPayload]).toEqual(
        payload[field as keyof PersistedWorkspaceShellPayload],
      );
    }
    // Same reference for the artifact-backed field: nothing is re-serialized,
    // so `upsertWorkspace`'s editor-tab artifact rewrite is avoided.
    expect(next.editorTabs).toBe(payload.editorTabs);
  });

  test("writes the host-owned fields", () => {
    const next = mergeTaskTurnDeltaPayload({
      payload: createPayload(),
      taskId: "task-1",
      task: {
        id: "task-1",
        title: "Renamed by the host",
        provider: "codex",
        updatedAt: "2026-01-02T00:00:00.000Z",
        unread: true,
        archivedAt: null,
      },
      activeTaskId: "task-1",
      providerSession: { codex: { nativeSessionId: "s-2" } },
      messageCount: 12,
    });

    expect(next.tasks[0]).toMatchObject({
      title: "Renamed by the host",
      provider: "codex",
      unread: true,
    });
    expect(next.messageCountByTask).toEqual({ "task-1": 12 });
    expect(next.providerSessionByTask).toEqual({
      "task-1": { codex: { nativeSessionId: "s-2" } },
    });
  });

  test("never revives a task the renderer archived", () => {
    const payload = createPayload({
      tasks: [
        {
          id: "task-1",
          title: "Task One",
          provider: "claude-code",
          updatedAt: "2026-01-01T00:00:00.000Z",
          unread: false,
          archivedAt: "2026-01-01T09:00:00.000Z",
        },
      ],
    } as Partial<PersistedWorkspaceShellPayload>);

    const next = mergeTaskTurnDeltaPayload({
      payload,
      taskId: "task-1",
      // A stale host session still believes the task is live.
      task: {
        id: "task-1",
        title: "Task One",
        provider: "claude-code",
        updatedAt: "2026-01-02T00:00:00.000Z",
        unread: true,
        archivedAt: null,
      },
      messageCount: 12,
    });

    expect(next.tasks[0]?.archivedAt).toBe("2026-01-01T09:00:00.000Z");
  });

  test("appends a task the payload has not seen yet", () => {
    const next = mergeTaskTurnDeltaPayload({
      payload: createPayload(),
      taskId: "task-2",
      task: {
        id: "task-2",
        title: "Delegated child",
        provider: "claude-code",
        updatedAt: "2026-01-02T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
      messageCount: 1,
    });

    expect(next.tasks.map((task) => task.id)).toEqual(["task-1", "task-2"]);
    expect(next.messageCountByTask).toEqual({ "task-1": 10, "task-2": 1 });
  });

  test("updates only the delta task's message count", () => {
    const next = mergeTaskTurnDeltaPayload({
      payload: createPayload({
        messageCountByTask: { "task-1": 10, "task-9": 999 },
      } as Partial<PersistedWorkspaceShellPayload>),
      taskId: "task-1",
      messageCount: 11,
    });

    expect(next.messageCountByTask).toEqual({ "task-1": 11, "task-9": 999 });
  });

  test("leaves activeTaskId alone unless the host claims it", () => {
    const next = mergeTaskTurnDeltaPayload({
      payload: createPayload({ activeTaskId: "task-7" } as Partial<
        PersistedWorkspaceShellPayload
      >),
      taskId: "task-1",
      messageCount: 11,
    });
    expect(next.activeTaskId).toBe("task-7");
  });

  test("the host-owned field list and the renderer-owned list are disjoint", () => {
    for (const field of HOST_OWNED_WORKSPACE_SHELL_FIELDS) {
      expect(RENDERER_OWNED_FIELDS).not.toContain(field as never);
    }
  });
});

describe("toWorkspaceShellMetaSource", () => {
  test("carries the projections workspace_meta is rebuilt from", () => {
    const payload = createPayload();
    expect(toWorkspaceShellMetaSource(payload)).toMatchObject({
      activeTaskId: "task-1",
      tasks: payload.tasks,
      messageCountByTask: { "task-1": 10 },
      terminalTabs: payload.terminalTabs,
      cliSessionTabs: payload.cliSessionTabs,
      openTaskTabIds: ["task-1"],
    });
  });

  test("defaults missing collections instead of emitting undefined", () => {
    const source = toWorkspaceShellMetaSource({
      activeTaskId: "task-1",
      tasks: [],
    } as unknown as PersistedWorkspaceShellPayload);

    expect(source.messageCountByTask).toEqual({});
    expect(source.terminalTabs).toEqual([]);
    expect(source.cliSessionTabs).toEqual([]);
    expect(source.providerSessionByTask).toEqual({});
  });
});
