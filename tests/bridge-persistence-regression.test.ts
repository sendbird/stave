import { afterEach, describe, expect, test } from "bun:test";
import { createBridgeProviderSource } from "@/lib/providers/bridge.source";
import {
  loadWorkspaceEditorTabBodies,
  loadWorkspaceShellLite,
  loadWorkspaceShellForRestore,
  listWorkspaceSummaries,
  loadWorkspaceShellSummary,
  loadWorkspaceSnapshot,
  upsertWorkspace,
} from "@/lib/db/workspaces.db";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  buildWorkspaceSessionState,
  createWorkspaceSnapshot,
  flushPendingSnapshotPersists,
} from "@/store/workspace-session-state";
import { buildProjectDefaultWorkspaceId } from "@/store/project.utils";
import { resolveInitialLatestTaskMessagesPageSize } from "@/store/task-message-loading";
import {
  createNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/db/notifications.db";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
}

function setWindowContext(args: {
  api?: unknown;
  localStorage?: ReturnType<typeof createMemoryStorage>;
  innerHeight?: number;
}) {
  (globalThis as { window: unknown }).window = {
    api: args.api,
    ...(typeof args.innerHeight === "number"
      ? { innerHeight: args.innerHeight }
      : {}),
    ...(args.localStorage ? { localStorage: args.localStorage } : {}),
  } as unknown;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("push stream race handling", () => {
  test("captures done event even when emitted before startPushTurn resolves", async () => {
    let listener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    setWindowApi({
      provider: {
        subscribeStreamEvents: (
          cb: (payload: {
            streamId: string;
            event: unknown;
            done: boolean;
          }) => void,
        ) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        startPushTurn: async () => {
          listener?.({
            streamId: "stream-1",
            event: { type: "done" },
            done: true,
          });
          return { ok: true, streamId: "stream-1" };
        },
      },
    });

    const source = createBridgeProviderSource<{ type: string }>({
      providerId: "claude-code",
    });
    const out: Array<{ type: string }> = [];
    for await (const event of source.streamTurn({ prompt: "quick fail" })) {
      out.push(event);
    }

    expect(out).toEqual([{ type: "done" }]);
  });
});

describe("push stream memory release", () => {
  test("releases push sessions after completion", async () => {
    process.env.STAVE_PROVIDER_TIMEOUT_MS = "50";
    const runtimeModule = await import("../electron/providers/runtime");
    const runtime = runtimeModule.providerRuntime;
    let doneResolver: (() => void) | null = null;
    const donePromise = new Promise<void>((resolve) => {
      doneResolver = resolve;
    });

    const started = runtime.startTurnStream(
      { providerId: "claude-code", prompt: "smoke" },
      {
        onEvent: () => {},
        onDone: () => {
          doneResolver?.();
        },
      },
    );

    expect(started.ok).toBe(true);
    await donePromise;

    const page = runtime.readTurnStream({
      streamId: started.streamId,
      cursor: 0,
    });
    expect(page.ok).toBe(false);
    expect(page.done).toBe(true);
  });
});

describe("workspace persistence fallback", () => {
  test("supports list/load/upsert without electron persistence bridge", async () => {
    setWindowApi({});

    const snapshot = {
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code" as const,
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "user" as const,
            model: "user",
            providerId: "user",
            content: "hello",
            isStreaming: false,
            parts: [{ type: "text", text: "hello" }],
          },
        ],
      },
    };

    await upsertWorkspace({ id: "ws-dev", name: "Dev Workspace", snapshot });
    const rows = await listWorkspaceSummaries();
    const loaded = await loadWorkspaceSnapshot({ workspaceId: "ws-dev" });

    expect(rows.some((row) => row.id === "ws-dev")).toBe(true);
    expect(loaded?.activeTaskId).toBe("task-1");
    expect(loaded?.tasks).toHaveLength(1);
    expect(loaded?.promptDraftByTask).toEqual({});
    expect(loaded?.providerSessionByTask).toEqual({});
  });

  test("supports workspace shell summaries without electron persistence bridge", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-dev",
      name: "Dev Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        },
        terminalTabs: [
          {
            id: "terminal-1",
            title: "project",
            linkedTaskId: null,
            backend: "ghostty",
            cwd: "/tmp/project",
            createdAt: 1,
          },
        ],
        cliSessionTabs: [
          {
            id: "cli-1",
            title: "Claude Workspace",
            provider: "claude-code",
            contextMode: "workspace",
            linkedTaskId: null,
            linkedTaskTitle: null,
            handoffSummary: "",
            cwd: "/tmp/project",
            createdAt: 2,
          },
        ],
      },
    });

    const summary = await loadWorkspaceShellSummary({ workspaceId: "ws-dev" });

    expect(summary).toMatchObject({
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
        },
      ],
      messageCountByTask: { "task-1": 1 },
      terminalTabCount: 1,
      cliSessionTabCount: 1,
    });
  });

  test("supports workspace shell lite payloads without electron persistence bridge", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-lite",
      name: "Lite Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        },
        promptDraftByTask: {
          "task-1": {
            text: "draft",
            attachedFilePaths: [],
            attachments: [],
          },
        },
        providerSessionByTask: {
          "task-1": {
            "claude-code": "session-claude",
          },
        },
        editorTabs: [
          {
            id: "editor-1",
            filePath: "/tmp/project/src/app.ts",
            language: "typescript",
            content: "x".repeat(20_000),
            hasConflict: false,
            isDirty: true,
          },
        ],
      },
    });

    const shellLite = await loadWorkspaceShellLite({ workspaceId: "ws-lite" });

    expect(shellLite).toMatchObject({
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
        },
      ],
      promptDraftByTask: {
        "task-1": {
          text: "draft",
          attachedFilePaths: [],
          attachments: [],
        },
      },
      providerSessionByTask: {
        "task-1": {
          "claude-code": "session-claude",
        },
      },
      messageCountByTask: {
        "task-1": 1,
      },
    });
  });

  test("loads restore shells without a persistence bridge and marks tabs ready", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-restore",
      name: "Restore Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
        editorTabs: [
          {
            id: "file:/tmp/project/src/app.ts",
            filePath: "/tmp/project/src/app.ts",
            language: "typescript",
            content: "export const answer = 42;\n",
            hasConflict: false,
            isDirty: false,
          },
        ],
        activeEditorTabId: "file:/tmp/project/src/app.ts",
      },
    });

    const shell = await loadWorkspaceShellForRestore({
      workspaceId: "ws-restore",
    });

    expect(shell?.editorTabs).toEqual([
      {
        id: "file:/tmp/project/src/app.ts",
        filePath: "/tmp/project/src/app.ts",
        language: "typescript",
        content: "export const answer = 42;\n",
        contentState: "ready",
        hasConflict: false,
        isDirty: false,
      },
    ]);
  });

  test("loads editor tab bodies without a persistence bridge", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-bodies",
      name: "Bodies Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
        editorTabs: [
          {
            id: "file:/tmp/project/src/app.ts",
            filePath: "/tmp/project/src/app.ts",
            language: "typescript",
            content: "export const answer = 42;\n",
            originalContent: "export const answer = 42;\n",
            savedContent: "export const answer = 42;\n",
            hasConflict: false,
            isDirty: false,
          },
        ],
      },
    });

    const bodies = await loadWorkspaceEditorTabBodies({
      workspaceId: "ws-bodies",
      tabIds: ["file:/tmp/project/src/app.ts"],
    });

    expect(bodies).toEqual([
      {
        id: "file:/tmp/project/src/app.ts",
        content: "export const answer = 42;\n",
        originalContent: "export const answer = 42;\n",
        savedContent: "export const answer = 42;\n",
      },
    ]);
  });

  test("supports notification history without electron persistence bridge", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {},
    });

    const first = await createNotification({
      notification: {
        id: "notification-1",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:00.000Z",
      },
    });
    const duplicate = await createNotification({
      notification: {
        id: "notification-1-duplicate",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:01.000Z",
      },
    });

    expect(first.inserted).toBe(true);
    expect(duplicate.inserted).toBe(false);

    let notifications = await listNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("notification-1");
    expect(notifications[0]?.readAt).toBeNull();

    await markNotificationRead({
      id: "notification-1",
      readAt: "2026-03-06T01:12:00.000Z",
    });
    notifications = await listNotifications();
    expect(notifications[0]?.readAt).toBe("2026-03-06T01:12:00.000Z");

    const changedCount = await markAllNotificationsRead({
      readAt: "2026-03-06T01:13:00.000Z",
    });
    expect(changedCount).toBe(0);
  });

  test("preserves each project's workspace list when switching projects", async () => {
    const localStorage = createMemoryStorage();
    const projectRoots = [
      {
        rootPath: "/tmp/stave-project-a",
        rootName: "project-a",
        files: ["package.json", "src/a.ts"],
      },
      {
        rootPath: "/tmp/stave-project-b",
        rootName: "project-b",
        files: ["package.json", "src/b.ts"],
      },
    ];
    let pickIndex = 0;
    const filesByRoot: Record<string, string[]> = {
      "/tmp/stave-project-a": ["package.json", "src/a.ts"],
      "/tmp/stave-project-a/.stave/workspaces/feature-a": [
        "package.json",
        "src/a.ts",
        "src/feature-a.ts",
      ],
      "/tmp/stave-project-b": ["package.json", "src/b.ts"],
    };

    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => {
            const root = projectRoots[pickIndex++];
            return root ? { ok: true, ...root } : { ok: false, files: [] };
          },
          listFiles: async ({ rootPath }: { rootPath: string }) => ({
            ok: true,
            files: filesByRoot[rootPath] ?? [],
          }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });
    (globalThis.window as Window & typeof globalThis).setTimeout =
      globalThis.setTimeout.bind(globalThis);
    (globalThis.window as Window & typeof globalThis).clearTimeout =
      globalThis.clearTimeout.bind(globalThis);

    const { useAppStore } = await import("../src/store/app.store");
    localStorage.clear();
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      recentProjects: [],
      workspaces: [],
      activeWorkspaceId: "",
      projectPath: null,
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectName: null,
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().createProject({});

    const stateAfterProjectA = useAppStore.getState();
    const projectADefaultWorkspaceId = stateAfterProjectA.activeWorkspaceId;
    const extraWorkspaceId = "ws-a-extra";
    const extraWorkspacePath =
      "/tmp/stave-project-a/.stave/workspaces/feature-a";
    const emptySnapshot = {
      activeTaskId: "",
      tasks: [],
      messagesByTask: {},
      promptDraftByTask: {},
      providerSessionByTask: {},
    };
    await upsertWorkspace({
      id: extraWorkspaceId,
      name: "feature-a",
      snapshot: emptySnapshot,
    });
    useAppStore.setState({
      workspaces: [
        ...stateAfterProjectA.workspaces,
        {
          id: extraWorkspaceId,
          name: "feature-a",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: extraWorkspaceId,
      workspaceBranchById: {
        ...stateAfterProjectA.workspaceBranchById,
        [extraWorkspaceId]: "feature-a",
      },
      workspacePathById: {
        ...stateAfterProjectA.workspacePathById,
        [extraWorkspaceId]: extraWorkspacePath,
      },
      workspaceDefaultById: {
        ...stateAfterProjectA.workspaceDefaultById,
        [extraWorkspaceId]: false,
      },
    });

    await useAppStore.getState().createProject({});
    const stateAfterProjectB = useAppStore.getState();
    expect(stateAfterProjectB.projectPath).toBe("/tmp/stave-project-b");
    expect(stateAfterProjectB.workspaces).toHaveLength(1);

    await useAppStore
      .getState()
      .openProject({ projectPath: "/tmp/stave-project-a" });

    const nextState = useAppStore.getState();
    expect(nextState.projectPath).toBe("/tmp/stave-project-a");
    expect(nextState.activeWorkspaceId).toBe(extraWorkspaceId);
    expect(nextState.workspaces.map((workspace) => workspace.id)).toEqual([
      projectADefaultWorkspaceId,
      extraWorkspaceId,
    ]);
    expect(
      nextState.recentProjects.map((project) => project.projectPath),
    ).toEqual(["/tmp/stave-project-a", "/tmp/stave-project-b"]);
  });

  test("preserves manual project order when opening different projects", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project-a",
      projectName: "project-a",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-a",
          name: "Default Workspace",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-a",
      workspaceBranchById: { "ws-a": "main", "ws-b": "main" },
      workspacePathById: {
        "ws-a": "/tmp/stave-project-a",
        "ws-b": "/tmp/stave-project-b",
      },
      workspaceDefaultById: { "ws-a": true, "ws-b": true },
      recentProjects: [
        {
          projectPath: "/tmp/stave-project-a",
          projectName: "project-a",
          lastOpenedAt: "2026-03-20T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-a",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-a",
          workspaceBranchById: { "ws-a": "main" },
          workspacePathById: { "ws-a": "/tmp/stave-project-a" },
          workspaceDefaultById: { "ws-a": true },
        },
        {
          projectPath: "/tmp/stave-project-b",
          projectName: "project-b",
          lastOpenedAt: "2026-03-20T00:00:01.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-b",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:01.000Z",
            },
          ],
          activeWorkspaceId: "ws-b",
          workspaceBranchById: { "ws-b": "main" },
          workspacePathById: { "ws-b": "/tmp/stave-project-b" },
          workspaceDefaultById: { "ws-b": true },
        },
      ],
    });

    useAppStore.getState().moveProjectInList({
      projectPath: "/tmp/stave-project-b",
      direction: "up",
    });
    expect(
      useAppStore
        .getState()
        .recentProjects.map((project) => project.projectPath),
    ).toEqual(["/tmp/stave-project-b", "/tmp/stave-project-a"]);

    await useAppStore
      .getState()
      .openProject({ projectPath: "/tmp/stave-project-b" });
    await useAppStore
      .getState()
      .openProject({ projectPath: "/tmp/stave-project-a" });

    expect(
      useAppStore
        .getState()
        .recentProjects.map((project) => project.projectPath),
    ).toEqual(["/tmp/stave-project-b", "/tmp/stave-project-a"]);
  });

  test("openProject restores cached CLI session state before workspace hydration finishes", async () => {
    const localStorage = createMemoryStorage();
    let notifyHydrateStarted = () => {};
    const hydrateStarted = new Promise<void>((resolve) => {
      notifyHydrateStarted = resolve;
    });
    let releaseHydrate = () => {};
    const hydrateGate = new Promise<void>((resolve) => {
      releaseHydrate = resolve;
    });

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({
            ok: true,
            files: ["package.json", "src/a.ts"],
          }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const cachedCliTab = {
      id: "cli-a",
      title: "Codex Workspace",
      provider: "codex" as const,
      contextMode: "workspace" as const,
      linkedTaskId: null,
      linkedTaskTitle: null,
      handoffSummary: "",
      cwd: "/tmp/stave-project-a",
      createdAt: 1,
    };
    const cachedWorkspaceState = buildWorkspaceSessionState({
      snapshot: createWorkspaceSnapshot({
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
        promptDraftByTask: {},
        workspaceInformation: createEmptyWorkspaceInformation(),
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [],
        activeTerminalTabId: null,
        terminalDocked: false,
        cliSessionTabs: [cachedCliTab],
        activeCliSessionTabId: cachedCliTab.id,
        activeSurface: {
          kind: "cli-session",
          cliSessionTabId: cachedCliTab.id,
        },
        providerSessionByTask: {},
      }),
    });

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-project-b",
      projectName: "project-b",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-b",
          name: "Default Workspace",
          updatedAt: "2026-03-20T00:00:01.000Z",
        },
      ],
      activeWorkspaceId: "ws-b",
      workspaceBranchById: { "ws-b": "main" },
      workspacePathById: { "ws-b": "/tmp/stave-project-b" },
      workspaceDefaultById: { "ws-b": true },
      projectFiles: ["package.json", "src/b.ts"],
      recentProjects: [
        {
          projectPath: "/tmp/stave-project-a",
          projectName: "project-a",
          lastOpenedAt: "2026-03-20T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-a",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-a",
          workspaceBranchById: { "ws-a": "main" },
          workspacePathById: { "ws-a": "/tmp/stave-project-a" },
          workspaceDefaultById: { "ws-a": true },
        },
        {
          projectPath: "/tmp/stave-project-b",
          projectName: "project-b",
          lastOpenedAt: "2026-03-20T00:00:01.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-b",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:01.000Z",
            },
          ],
          activeWorkspaceId: "ws-b",
          workspaceBranchById: { "ws-b": "main" },
          workspacePathById: { "ws-b": "/tmp/stave-project-b" },
          workspaceDefaultById: { "ws-b": true },
        },
      ],
      workspaceRuntimeCacheById: {
        "ws-a": cachedWorkspaceState,
      },
    });
    const originalHydrateWorkspaces = useAppStore.getState().hydrateWorkspaces;
    useAppStore.setState({
      hydrateWorkspaces: async () => {
        notifyHydrateStarted();
        await hydrateGate;
        await originalHydrateWorkspaces();
      },
    });

    let openProjectResolved = false;
    const openProjectPromise = useAppStore
      .getState()
      .openProject({
        projectPath: "/tmp/stave-project-a",
      })
      .then(() => {
        openProjectResolved = true;
      });

    await hydrateStarted;

    const interimState = useAppStore.getState();
    expect(openProjectResolved).toBe(false);
    expect(interimState.projectPath).toBe("/tmp/stave-project-a");
    expect(interimState.activeWorkspaceId).toBe("ws-a");
    expect(interimState.cliSessionTabs).toEqual([cachedCliTab]);
    expect(interimState.activeCliSessionTabId).toBe(cachedCliTab.id);
    expect(interimState.activeSurface).toEqual({
      kind: "cli-session",
      cliSessionTabId: cachedCliTab.id,
    });

    releaseHydrate();
    await openProjectPromise;

    const nextState = useAppStore.getState();
    expect(nextState.cliSessionTabs).toEqual([cachedCliTab]);
    expect(nextState.activeCliSessionTabId).toBe(cachedCliTab.id);
    expect(nextState.activeSurface).toEqual({
      kind: "cli-session",
      cliSessionTabId: cachedCliTab.id,
    });
  });

  test("openProject resolves before background file refresh completes", async () => {
    const localStorage = createMemoryStorage();
    let resolveListFiles:
      | ((value: { ok: boolean; files: string[] }) => void)
      | null = null;
    const listFilesPromise = new Promise<{ ok: boolean; files: string[] }>(
      (resolve) => {
        resolveListFiles = resolve;
      },
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => listFilesPromise,
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadProjectRegistry: async () => ({ ok: true, projects: [] }),
          saveProjectRegistry: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      projectFiles: [],
    });

    let openProjectResolved = false;
    const openProjectPromise = useAppStore
      .getState()
      .openProject({
        projectPath: "/tmp/stave-project-open-fast",
      })
      .then(() => {
        openProjectResolved = true;
      });

    await Bun.sleep(0);

    expect(openProjectResolved).toBe(true);
    expect(useAppStore.getState().projectPath).toBe(
      "/tmp/stave-project-open-fast",
    );
    expect(useAppStore.getState().projectFiles).toEqual([]);

    resolveListFiles?.({
      ok: true,
      files: ["package.json", "src/open-fast.ts"],
    });
    await openProjectPromise;
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual([
      "package.json",
      "src/open-fast.ts",
    ]);
  });

  test("openProject eagerly restores latest messages for the active task", async () => {
    const localStorage = createMemoryStorage();
    const targetProjectPath = "/tmp/stave-project-latest";
    const targetWorkspaceId = buildProjectDefaultWorkspaceId({
      projectPath: targetProjectPath,
    });
    const viewportHeightPx = 900;
    const initialLatestCount = resolveInitialLatestTaskMessagesPageSize({
      viewportHeightPx,
    });
    const allMessages = Array.from({ length: 80 }, (_, index) => ({
      id: `m-${index + 1}`,
      role: (index % 2 === 0 ? "user" : "assistant") as const,
      model: index % 2 === 0 ? "user" : "codex",
      providerId: index % 2 === 0 ? "user" : "codex",
      content: `message ${index + 1}`,
      isStreaming: false,
      parts: [{ type: "text", text: `message ${index + 1}` }],
    }));

    setWindowContext({
      innerHeight: viewportHeightPx,
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({
            ok: true,
            files: ["package.json", "src/app.ts"],
          }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    await upsertWorkspace({
      id: targetWorkspaceId,
      name: "Default Workspace",
      snapshot: {
        activeTaskId: "task-latest",
        tasks: [
          {
            id: "task-latest",
            title: "Latest Task",
            provider: "codex",
            updatedAt: "2026-04-14T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-latest": allMessages,
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-current",
      projectName: "current",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-current",
          name: "Default Workspace",
          updatedAt: "2026-04-14T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-current",
      workspaceBranchById: {
        "ws-current": "main",
        [targetWorkspaceId]: "main",
      },
      workspacePathById: {
        "ws-current": "/tmp/stave-current",
        [targetWorkspaceId]: targetProjectPath,
      },
      workspaceDefaultById: {
        "ws-current": true,
        [targetWorkspaceId]: true,
      },
      projectFiles: ["package.json"],
      recentProjects: [
        {
          projectPath: targetProjectPath,
          projectName: "latest-project",
          lastOpenedAt: "2026-04-14T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: targetWorkspaceId,
              name: "Default Workspace",
              updatedAt: "2026-04-14T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: targetWorkspaceId,
          workspaceBranchById: { [targetWorkspaceId]: "main" },
          workspacePathById: { [targetWorkspaceId]: targetProjectPath },
          workspaceDefaultById: { [targetWorkspaceId]: true },
        },
      ],
    });

    await useAppStore
      .getState()
      .openProject({ projectPath: targetProjectPath });
    await Bun.sleep(0);

    const nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe(targetWorkspaceId);
    expect(nextState.activeTaskId).toBe("task-latest");
    expect(nextState.messageCountByTask["task-latest"]).toBe(80);
    expect(nextState.messagesByTask["task-latest"]?.length).toBe(
      initialLatestCount,
    );
    expect(nextState.messagesByTask["task-latest"]?.[0]?.id).toBe(
      `m-${allMessages.length - initialLatestCount + 1}`,
    );
    expect(nextState.messagesByTask["task-latest"]?.at(-1)?.id).toBe(
      `m-${allMessages.length}`,
    );
  });

  test("preserves manual workspace order when switching workspaces", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
            ok: true,
            snapshot: {
              activeTaskId: "",
              tasks: [],
              messagesByTask: {},
              promptDraftByTask: {},
              providerSessionByTask: {},
            },
          }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-project-a",
      projectName: "project-a",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-a",
          name: "Default Workspace",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          id: "ws-b",
          name: "feature-b",
          updatedAt: "2026-03-20T00:00:01.000Z",
        },
        {
          id: "ws-c",
          name: "feature-c",
          updatedAt: "2026-03-20T00:00:02.000Z",
        },
      ],
      activeWorkspaceId: "ws-a",
      workspaceBranchById: {
        "ws-a": "main",
        "ws-b": "feature-b",
        "ws-c": "feature-c",
      },
      workspacePathById: {
        "ws-a": "/tmp/stave-project-a",
        "ws-b": "/tmp/stave-project-a/.stave/workspaces/feature-b",
        "ws-c": "/tmp/stave-project-a/.stave/workspaces/feature-c",
      },
      workspaceDefaultById: { "ws-a": true, "ws-b": false, "ws-c": false },
      recentProjects: [
        {
          projectPath: "/tmp/stave-project-a",
          projectName: "project-a",
          lastOpenedAt: "2026-03-20T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-a",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:00.000Z",
            },
            {
              id: "ws-b",
              name: "feature-b",
              updatedAt: "2026-03-20T00:00:01.000Z",
            },
            {
              id: "ws-c",
              name: "feature-c",
              updatedAt: "2026-03-20T00:00:02.000Z",
            },
          ],
          activeWorkspaceId: "ws-a",
          workspaceBranchById: {
            "ws-a": "main",
            "ws-b": "feature-b",
            "ws-c": "feature-c",
          },
          workspacePathById: {
            "ws-a": "/tmp/stave-project-a",
            "ws-b": "/tmp/stave-project-a/.stave/workspaces/feature-b",
            "ws-c": "/tmp/stave-project-a/.stave/workspaces/feature-c",
          },
          workspaceDefaultById: { "ws-a": true, "ws-b": false, "ws-c": false },
        },
      ],
    });

    useAppStore.getState().moveWorkspaceInProjectList({
      projectPath: "/tmp/stave-project-a",
      workspaceId: "ws-c",
      direction: "up",
    });

    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-a", "ws-c", "ws-b"]);

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-c" });
    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-b" });

    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-a", "ws-c", "ws-b"]);
  });

  test("latest task message loads do not overwrite newer in-memory message versions", async () => {
    const localStorage = createMemoryStorage();
    let resolvePage:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "user" | "assistant";
              model: string;
              providerId: "user" | "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          loadTaskMessages: async () =>
            new Promise((resolve) => {
              resolvePage = resolve as typeof resolvePage;
            }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-20T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-03-20T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-main": [],
      },
      messageCountByTask: {
        "task-main": 2,
      },
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
    });

    const loadingPromise = useAppStore.getState().loadTaskMessages({
      taskId: "task-main",
      mode: "latest",
    });
    await Bun.sleep(0);

    useAppStore.setState((state) => ({
      messagesByTask: {
        ...state.messagesByTask,
        "task-main": [
          {
            id: "task-main-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "keep going",
            isStreaming: false,
            parts: [{ type: "text", text: "keep going" }],
          },
          {
            id: "task-main-m-2",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "## 변경\n\n- final summary",
            isStreaming: false,
            parts: [{ type: "text", text: "## 변경\n\n- final summary" }],
          },
        ],
      },
    }));

    resolvePage?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-main-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "keep going",
            isStreaming: false,
            parts: [{ type: "text", text: "keep going" }],
          },
          {
            id: "task-main-m-2",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "progress only",
            isStreaming: false,
            parts: [{ type: "text", text: "progress only" }],
          },
        ],
        totalCount: 2,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });

    await loadingPromise;

    const nextState = useAppStore.getState();
    expect(nextState.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "## 변경\n\n- final summary",
    );
  });
});

describe("workspace snapshot schema compatibility", () => {
  test("loads legacy snapshots with missing prompt draft fields and failed tool states", async () => {
    setWindowApi({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [
            { id: "base", name: "Base", updatedAt: "2026-03-08T00:00:00.000Z" },
          ],
        }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            activeTaskId: "task-1",
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "codex",
                updatedAt: "2026-03-08T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-1": [
                {
                  id: "m-1",
                  role: "assistant",
                  model: "gpt-5",
                  providerId: "codex",
                  content: "",
                  parts: [
                    {
                      type: "tool_use",
                      toolUseId: "tool-1",
                      toolName: "apply_patch",
                      input: "patch",
                      output: "failed",
                      state: "output-error",
                    },
                    {
                      type: "code_diff",
                      filePath: "src/app.ts",
                      oldContent: "a",
                      newContent: "b",
                    },
                  ],
                },
              ],
            },
            promptDraftByTask: {
              "task-1": {
                text: "draft only",
              },
            },
          },
        }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });

    const loaded = await loadWorkspaceSnapshot({ workspaceId: "base" });

    expect(loaded).not.toBeNull();
    expect(loaded?.messagesByTask["task-1"]?.[0]?.parts[0]).toMatchObject({
      type: "tool_use",
      toolUseId: "tool-1",
      state: "output-error",
    });
    expect(loaded?.messagesByTask["task-1"]?.[0]?.parts[1]).toMatchObject({
      type: "code_diff",
      status: "accepted",
    });
    expect(loaded?.promptDraftByTask["task-1"]).toEqual({
      text: "draft only",
      attachedFilePaths: [],
      attachments: [],
    });
    expect(loaded?.workspaceInformation).toEqual({
      jiraIssues: [],
      confluencePages: [],
      figmaResources: [],
      linkedPullRequests: [],
      slackThreads: [],
      notes: "",
      todos: [],
      customFields: [],
    });
    expect(loaded?.providerSessionByTask).toEqual({});
    expect(loaded?.editorTabs).toEqual([]);
    expect(loaded?.activeEditorTabId).toBeNull();
  });

  test("loads snapshots that include usage and prompt suggestions", async () => {
    setWindowApi({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [
            { id: "base", name: "Base", updatedAt: "2026-03-08T00:00:00.000Z" },
          ],
        }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            activeTaskId: "task-2",
            tasks: [
              {
                id: "task-2",
                title: "Task 2",
                provider: "claude-code",
                updatedAt: "2026-03-08T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-2": [
                {
                  id: "m-2",
                  role: "assistant",
                  model: "claude-sonnet-4-6",
                  providerId: "claude-code",
                  content: "Done",
                  usage: {
                    inputTokens: 10,
                    outputTokens: 20,
                    cacheReadTokens: 5,
                    totalCostUsd: 0.02,
                  },
                  promptSuggestions: ["Open a PR with these changes"],
                  parts: [{ type: "text", text: "Done" }],
                },
              ],
            },
            providerSessionByTask: {
              "task-2": {
                "claude-code": "session-live-2",
              },
            },
          },
        }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });

    const loaded = await loadWorkspaceSnapshot({ workspaceId: "base" });

    expect(loaded?.messagesByTask["task-2"]?.[0]?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 5,
      totalCostUsd: 0.02,
    });
    expect(loaded?.messagesByTask["task-2"]?.[0]?.promptSuggestions).toEqual([
      "Open a PR with these changes",
    ]);
    expect(loaded?.providerSessionByTask).toEqual({
      "task-2": {
        "claude-code": "session-live-2",
      },
    });
    expect(loaded?.workspaceInformation).toEqual({
      jiraIssues: [],
      confluencePages: [],
      figmaResources: [],
      linkedPullRequests: [],
      slackThreads: [],
      notes: "",
      todos: [],
      customFields: [],
    });
    expect(loaded?.editorTabs).toEqual([]);
    expect(loaded?.activeEditorTabId).toBeNull();
  });
});

describe("workspace store hydration ordering", () => {
  test("hydrateWorkspaces loads the persisted DB snapshot without overwriting it from renderer defaults", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({
            ok: true,
            snapshot: {
              activeTaskId: "task-db",
              tasks: [
                {
                  id: "task-db",
                  title: "Recovered Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              messagesByTask: {
                "task-db": [
                  {
                    id: "task-db-m-1",
                    role: "assistant",
                    model: "gpt-5",
                    providerId: "codex",
                    content: "loaded from db",
                    parts: [{ type: "text", text: "loaded from db" }],
                  },
                ],
              },
              promptDraftByTask: {
                "task-db": {
                  text: "draft from db",
                },
              },
              providerSessionByTask: {
                "task-db": {
                  codex: "thread-db-1",
                },
              },
            },
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [],
      messagesByTask: {},
      promptDraftByTask: {},
      providerSessionByTask: {},
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();
    await Bun.sleep(0);

    const nextState = useAppStore.getState();
    expect(upsertCalls).toHaveLength(0);
    expect(nextState.hasHydratedWorkspaces).toBe(true);
    expect(nextState.activeTaskId).toBe("task-db");
    expect(nextState.tasks.map((task) => task.id)).toEqual(["task-db"]);
    expect(nextState.messagesByTask["task-db"]?.[0]?.content).toBe(
      "loaded from db",
    );
    expect(nextState.promptDraftByTask["task-db"]?.text).toBe("draft from db");
    expect(nextState.providerSessionByTask["task-db"]).toEqual({
      codex: "thread-db-1",
    });
  });

  test("hydrateWorkspaces recovers persisted tasks when the cached workspace session is empty", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async () => ({
            ok: true,
            shell: {
              activeTaskId: "task-db",
              tasks: [
                {
                  id: "task-db",
                  title: "Recovered Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: { "task-db": 0 },
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
              editorTabs: [],
              activeEditorTabId: null,
            },
          }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-main",
          name: "Default Workspace",
          updatedAt: "2026-03-09T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      workspaceRuntimeCacheById: {
        "ws-main": {
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
          messageCountByTask: {},
          promptDraftByTask: {},
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
          editorTabs: [],
          activeEditorTabId: null,
          activeTurnIdsByTask: {},
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
      hasHydratedWorkspaces: false,
      projectFiles: [],
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    expect(nextState.activeTaskId).toBe("task-db");
    expect(nextState.tasks.map((task) => task.id)).toEqual(["task-db"]);
    expect(nextState.workspaceRuntimeCacheById["ws-main"]).toBeUndefined();
  });

  test("hydrateWorkspaces appends an interruption note for incomplete turns from a previous app session", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({
            ok: true,
            snapshot: {
              activeTaskId: "task-stale",
              tasks: [
                {
                  id: "task-stale",
                  title: "Interrupted Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              messagesByTask: {
                "task-stale": [
                  {
                    id: "task-stale-m-1",
                    role: "assistant",
                    model: "gpt-5",
                    providerId: "codex",
                    content: "partial response",
                    parts: [
                      { type: "text", text: "partial response" },
                      {
                        type: "approval",
                        toolName: "bash",
                        description: "Run npm test",
                        requestId: "approval-stale-1",
                        state: "approval-requested",
                      },
                    ],
                  },
                ],
              },
              promptDraftByTask: {},
              providerSessionByTask: {},
            },
          }),
          listLatestWorkspaceTurns: async () => ({
            ok: true,
            turns: [
              {
                id: "turn-stale-1",
                workspaceId: "ws-main",
                taskId: "task-stale",
                providerId: "codex",
                createdAt: "2026-03-10T00:00:00.000Z",
                completedAt: null,
                eventCount: 1,
              },
            ],
          }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();
    await Bun.sleep(0);

    const nextState = useAppStore.getState();
    const messages = nextState.messagesByTask["task-stale"] ?? [];
    expect(nextState.activeTurnIdsByTask["task-stale"]).toBeUndefined();
    expect(messages).toHaveLength(2);
    expect(messages[0]?.parts[1]).toMatchObject({
      type: "approval",
      requestId: "approval-stale-1",
      state: "approval-interrupted",
    });
    expect(messages.at(-1)?.content).toBe(
      "Generation interrupted because Stave was closed before this turn completed.",
    );
    expect(messages.at(-1)?.parts).toEqual([
      {
        type: "system_event",
        content:
          "Generation interrupted because Stave was closed before this turn completed.",
      },
    ]);
  });

  test("hydrateWorkspaces eventually restores projectFiles for the explorer on boot", async () => {
    const localStorage = createMemoryStorage();
    const listedFiles = ["package.json", "src/App.tsx"];
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({ ok: true, files: listedFiles }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
        },
      },
    });

    const [{ workspaceFsAdapter }, { useAppStore }] = await Promise.all([
      import("../src/lib/fs"),
      import("../src/store/app.store"),
    ]);
    await (
      workspaceFsAdapter as {
        setRoot?: (args: {
          rootPath: string;
          rootName: string;
          files?: string[];
        }) => Promise<void>;
      }
    ).setRoot?.({
      rootPath: "/tmp/stave-project",
      rootName: "fixture",
      files: [],
    });

    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-main",
          name: "default",
          updatedAt: "2026-03-09T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      projectName: "fixture",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual(listedFiles);
  });

  test("hydrateWorkspaces does not wait for file refresh on boot", async () => {
    const localStorage = createMemoryStorage();
    let resolveListFiles:
      | ((value: { ok: boolean; files: string[] }) => void)
      | null = null;
    const listFilesPromise = new Promise<{ ok: boolean; files: string[] }>(
      (resolve) => {
        resolveListFiles = resolve;
      },
    );
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => listFilesPromise,
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main-fast-hydrate",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
        },
      },
    });

    const [{ workspaceFsAdapter }, { useAppStore }] = await Promise.all([
      import("../src/lib/fs"),
      import("../src/store/app.store"),
    ]);
    await (
      workspaceFsAdapter as {
        setRoot?: (args: {
          rootPath: string;
          rootName: string;
          files?: string[];
        }) => Promise<void>;
      }
    ).setRoot?.({
      rootPath: "/tmp/stave-project-fast-hydrate",
      rootName: "fixture",
      files: [],
    });

    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-main-fast-hydrate",
          name: "default",
          updatedAt: "2026-03-09T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-fast-hydrate",
      projectPath: "/tmp/stave-project-fast-hydrate",
      projectName: "fixture",
      workspacePathById: {
        "ws-main-fast-hydrate": "/tmp/stave-project-fast-hydrate",
      },
      workspaceBranchById: { "ws-main-fast-hydrate": "main" },
      workspaceDefaultById: { "ws-main-fast-hydrate": true },
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    let hydrated = false;
    const hydratePromise = useAppStore
      .getState()
      .hydrateWorkspaces()
      .then(() => {
        hydrated = true;
      });

    await Bun.sleep(0);

    expect(hydrated).toBe(true);
    expect(useAppStore.getState().projectFiles).toEqual([]);

    resolveListFiles?.({
      ok: true,
      files: ["package.json", "src/boot-fast.ts"],
    });
    await hydratePromise;
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual([
      "package.json",
      "src/boot-fast.ts",
    ]);
  });

  test("hydrateWorkspaces resolves after shell hydrate and backfills task messages asynchronously", async () => {
    const localStorage = createMemoryStorage();
    let resolveTaskMessages:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "assistant";
              model: string;
              providerId: "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;
    const taskMessagesPromise = new Promise<{
      ok: boolean;
      page: {
        messages: Array<{
          id: string;
          role: "assistant";
          model: string;
          providerId: "codex";
          content: string;
          isStreaming: boolean;
          parts: Array<{ type: "text"; text: string }>;
        }>;
        totalCount: number;
        limit: number;
        offset: number;
        hasMoreOlder: boolean;
      };
    }>((resolve) => {
      resolveTaskMessages = resolve;
    });
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main-hydrate",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async () => ({
            ok: true,
            shell: {
              activeTaskId: "task-main-hydrate",
              tasks: [
                {
                  id: "task-main-hydrate",
                  title: "Hydrated Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: { "task-main-hydrate": 1 },
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
              editorTabs: [],
              activeEditorTabId: null,
            },
          }),
          loadTaskMessages: async () => taskMessagesPromise,
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          loadProjectRegistry: async () => ({ ok: true, projects: [] }),
          saveProjectRegistry: async () => ({ ok: true }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      workspaces: [
        {
          id: "ws-main-hydrate",
          name: "default",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-hydrate",
      projectPath: "/tmp/stave-project-hydrate",
      projectName: "stave-project-hydrate",
      workspacePathById: { "ws-main-hydrate": "/tmp/stave-project-hydrate" },
      workspaceBranchById: { "ws-main-hydrate": "main" },
      workspaceDefaultById: { "ws-main-hydrate": true },
      projectFiles: [],
    });

    let hydrated = false;
    const hydratePromise = useAppStore
      .getState()
      .hydrateWorkspaces()
      .then(() => {
        hydrated = true;
      });

    await Bun.sleep(0);

    expect(hydrated).toBe(true);
    expect(useAppStore.getState().activeTaskId).toBe("task-main-hydrate");
    expect(useAppStore.getState().tasks.map((task) => task.id)).toEqual([
      "task-main-hydrate",
    ]);
    expect(useAppStore.getState().projectFiles).toEqual(["package.json"]);
    expect(
      useAppStore.getState().messagesByTask["task-main-hydrate"],
    ).toBeUndefined();
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-main-hydrate"],
    ).toBe(true);

    resolveTaskMessages?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-main-hydrate-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "hydrated message",
            isStreaming: false,
            parts: [{ type: "text", text: "hydrated message" }],
          },
        ],
        totalCount: 1,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });
    await hydratePromise;
    await Bun.sleep(0);

    expect(
      useAppStore.getState().messagesByTask["task-main-hydrate"]?.at(-1)
        ?.content,
    ).toBe("hydrated message");
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-main-hydrate"],
    ).toBe(false);
  });

  test("hydrateWorkspaces clears stale active turn state before interrupted task messages finish hydrating", async () => {
    const localStorage = createMemoryStorage();
    let resolveTaskMessages:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "assistant";
              model: string;
              providerId: "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;
    const taskMessagesPromise = new Promise<{
      ok: boolean;
      page: {
        messages: Array<{
          id: string;
          role: "assistant";
          model: string;
          providerId: "codex";
          content: string;
          isStreaming: boolean;
          parts: Array<{ type: "text"; text: string }>;
        }>;
        totalCount: number;
        limit: number;
        offset: number;
        hasMoreOlder: boolean;
      };
    }>((resolve) => {
      resolveTaskMessages = resolve;
    });
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main-interrupted",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async () => ({
            ok: true,
            shell: {
              activeTaskId: "task-main-interrupted",
              tasks: [
                {
                  id: "task-main-interrupted",
                  title: "Interrupted Hydration Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: { "task-main-interrupted": 1 },
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
              editorTabs: [],
              activeEditorTabId: null,
            },
          }),
          loadTaskMessages: async () => taskMessagesPromise,
          listLatestWorkspaceTurns: async () => ({
            ok: true,
            turns: [
              {
                id: "turn-main-interrupted",
                workspaceId: "ws-main-interrupted",
                taskId: "task-main-interrupted",
                providerId: "codex",
                createdAt: "2026-03-10T00:00:00.000Z",
                completedAt: null,
                eventCount: 1,
              },
            ],
          }),
          loadProjectRegistry: async () => ({ ok: true, projects: [] }),
          saveProjectRegistry: async () => ({ ok: true }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      workspaces: [
        {
          id: "ws-main-interrupted",
          name: "default",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-interrupted",
      projectPath: "/tmp/stave-project-interrupted",
      projectName: "stave-project-interrupted",
      workspacePathById: {
        "ws-main-interrupted": "/tmp/stave-project-interrupted",
      },
      workspaceBranchById: { "ws-main-interrupted": "main" },
      workspaceDefaultById: { "ws-main-interrupted": true },
      projectFiles: [],
    });

    let hydrated = false;
    const hydratePromise = useAppStore
      .getState()
      .hydrateWorkspaces()
      .then(() => {
        hydrated = true;
      });

    await Bun.sleep(0);

    const hydratedState = useAppStore.getState();
    expect(hydrated).toBe(true);
    expect(
      hydratedState.activeTurnIdsByTask["task-main-interrupted"],
    ).toBeUndefined();
    expect(
      hydratedState.taskMessagesLoadingByTask["task-main-interrupted"],
    ).toBe(true);

    resolveTaskMessages?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-main-interrupted-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "partial response",
            isStreaming: false,
            parts: [{ type: "text", text: "partial response" }],
          },
        ],
        totalCount: 1,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });
    await hydratePromise;
    await Bun.sleep(0);

    const finalMessages =
      useAppStore.getState().messagesByTask["task-main-interrupted"] ?? [];
    expect(finalMessages.at(-1)?.content).toBe(
      "Generation interrupted because Stave was closed before this turn completed.",
    );
  });

  test("hydrateWorkspaces auto-imports existing git worktrees missing from the DB", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<{ id: string; name: string; snapshot: unknown }> =
      [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async (args: {
            id: string;
            name: string;
            snapshot: unknown;
          }) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/stave-project",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
                  "HEAD def456",
                  "branch refs/heads/feature/perf",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    const importedWorkspace = nextState.workspaces.find(
      (workspace) => workspace.name === "feature/perf",
    );

    expect(importedWorkspace).not.toBeUndefined();
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.name).toBe("feature/perf");
    expect(importedWorkspace?.id).toBe(upsertCalls[0]?.id);
    expect(nextState.workspaceBranchById[importedWorkspace?.id ?? ""]).toBe(
      "feature/perf",
    );
    expect(nextState.workspacePathById[importedWorkspace?.id ?? ""]).toBe(
      "/tmp/stave-project/.stave/workspaces/feature__perf",
    );
  });

  test("refreshWorkspaces does not overwrite an already persisted imported worktree with an empty snapshot", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<{ id: string; name: string; snapshot: unknown }> =
      [];
    const { buildImportedWorktreeWorkspaceId } =
      await import("../src/store/project.utils");
    const importedWorkspaceId = buildImportedWorktreeWorkspaceId({
      projectPath: "/tmp/stave-project",
      worktreePath: "/tmp/stave-project/.stave/workspaces/feature__perf",
    });

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: importedWorkspaceId,
                name: "feature/perf",
                updatedAt: "2026-03-10T00:10:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async (args: {
            id: string;
            name: string;
            snapshot: unknown;
          }) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/stave-project",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
                  "HEAD def456",
                  "branch refs/heads/feature/perf",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
    });

    await useAppStore.getState().refreshWorkspaces();

    const nextState = useAppStore.getState();
    const importedWorkspace = nextState.workspaces.find(
      (workspace) => workspace.id === importedWorkspaceId,
    );
    expect(upsertCalls).toHaveLength(0);
    expect(importedWorkspace).not.toBeUndefined();
    expect(importedWorkspace?.name).toBe("feature/perf");
    expect(nextState.workspaceBranchById[importedWorkspaceId]).toBe(
      "feature/perf",
    );
    expect(nextState.workspacePathById[importedWorkspaceId]).toBe(
      "/tmp/stave-project/.stave/workspaces/feature__perf",
    );
  });

  test("flushActiveWorkspaceSnapshot is blocked until workspace hydration completes", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "persist me",
            parts: [{ type: "text", text: "persist me" }],
          },
        ],
      },
    });

    await useAppStore.getState().flushActiveWorkspaceSnapshot();
    expect(upsertCalls).toHaveLength(0);

    useAppStore.setState({ hasHydratedWorkspaces: true });
    await useAppStore.getState().flushActiveWorkspaceSnapshot();
    expect(upsertCalls).toHaveLength(1);
  });

  test("flushActiveWorkspaceSnapshot keeps Coliseum branch messages resident after completion", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-parent",
      tasks: [
        {
          id: "task-parent",
          title: "Parent",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-idle",
          title: "Idle",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-parent": [
          {
            id: "task-parent-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "start coliseum",
            parts: [{ type: "text", text: "start coliseum" }],
          },
        ],
        "branch-a": [
          {
            id: "branch-a-m-1",
            role: "assistant",
            model: "claude-sonnet-4-6",
            providerId: "claude-code",
            content: "branch answer",
            parts: [{ type: "text", text: "branch answer" }],
          },
        ],
        "task-idle": [
          {
            id: "task-idle-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "drop me",
            parts: [{ type: "text", text: "drop me" }],
          },
        ],
      },
      activeTurnIdsByTask: {},
      activeColiseumsByTask: {
        "task-parent": {
          parentTaskId: "task-parent",
          runId: "run-1",
          branchTaskIds: ["branch-a"],
          branchMeta: {
            "branch-a": {
              branchTaskId: "branch-a",
              provider: "claude-code",
              model: "claude-sonnet-4-6",
            },
          },
          createdAt: "2026-03-10T00:00:00.000Z",
          parentMessageCountAtFanout: 1,
          status: "ready",
          championTaskId: null,
          pickedHistory: [],
          viewMode: "grid",
          focusedBranchTaskId: null,
          minimized: false,
        },
      },
      workspaceInformation: createEmptyWorkspaceInformation(),
    });

    await useAppStore.getState().flushActiveWorkspaceSnapshot();

    const nextState = useAppStore.getState();
    expect(nextState.messagesByTask["task-parent"]?.at(-1)?.content).toBe(
      "start coliseum",
    );
    expect(nextState.messagesByTask["branch-a"]?.at(-1)?.content).toBe(
      "branch answer",
    );
    expect(nextState.messagesByTask["task-idle"]).toBeUndefined();
    expect(upsertCalls).toHaveLength(1);
  });

  test("switchWorkspace preserves inactive workspace turn state and persists it when the stream completes", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    const abortCalls: Array<string> = [];
    const cleanupCalls: Array<string> = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-1",
            turnId: "turn-main-1",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async ({ turnId }: { turnId: string }) => {
            abortCalls.push(turnId);
            return { ok: true, message: "aborted" };
          },
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true };
          },
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-alt",
                name: "Alt",
                updatedAt: "2026-03-10T00:00:01.000Z",
              },
            ],
          }),
          loadWorkspaceShell: async ({
            workspaceId,
          }: {
            workspaceId: string;
          }) => ({
            ok: true,
            shell:
              workspaceId === "ws-main"
                ? {
                    activeTaskId: "task-main",
                    tasks: [
                      {
                        id: "task-main",
                        title: "Main Task",
                        provider: "codex",
                        updatedAt: "2026-03-10T00:00:00.000Z",
                        unread: false,
                      },
                      {
                        id: "task-keep",
                        title: "Keep Task",
                        provider: "claude-code",
                        updatedAt: "2026-03-09T23:59:00.000Z",
                        unread: false,
                      },
                    ],
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                    messageCountByTask: {
                      "task-main": 0,
                      "task-keep": 1,
                    },
                  }
                : workspaceId === "ws-alt"
                  ? {
                      activeTaskId: "task-alt",
                      tasks: [
                        {
                          id: "task-alt",
                          title: "Alt Task",
                          provider: "claude-code",
                          updatedAt: "2026-03-10T00:00:01.000Z",
                          unread: false,
                        },
                      ],
                      promptDraftByTask: {},
                      providerSessionByTask: {},
                      messageCountByTask: { "task-alt": 0 },
                    }
                  : null,
          }),
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
            ok: true,
            snapshot:
              workspaceId === "ws-alt"
                ? {
                    activeTaskId: "task-alt",
                    tasks: [
                      {
                        id: "task-alt",
                        title: "Alt Task",
                        provider: "claude-code",
                        updatedAt: "2026-03-10T00:00:01.000Z",
                        unread: false,
                      },
                    ],
                    messagesByTask: { "task-alt": [] },
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                  }
                : null,
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-03-10T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Keep streaming while I switch workspaces.",
    });

    await Bun.sleep(0);

    const startedState = useAppStore.getState();
    const activeTurnId = startedState.activeTurnIdsByTask["task-main"];
    expect(activeTurnId).toBeString();
    expect(streamListener).toBeFunction();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });

    const switchedState = useAppStore.getState();
    expect(abortCalls).toEqual([]);
    expect(cleanupCalls).toEqual([]);
    expect(upsertCalls).toHaveLength(0);
    expect(switchedState.activeWorkspaceId).toBe("ws-alt");
    expect(switchedState.activeTaskId).toBe("task-alt");
    expect(switchedState.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(
      switchedState.workspaceRuntimeCacheById["ws-main"]?.activeTurnIdsByTask[
        "task-main"
      ],
    ).toBe(activeTurnId);
    expect(
      switchedState.workspaceRuntimeCacheById["ws-main"]?.messagesByTask[
        "task-main"
      ],
    ).toHaveLength(2);

    streamListener?.({
      streamId: "stream-1",
      event: {
        type: "text",
        text: "Task 1 kept updating after the workspace switch.",
      },
      done: false,
    });
    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const completedState = useAppStore.getState();
    const inactiveWorkspaceSession =
      completedState.workspaceRuntimeCacheById["ws-main"];
    const inactiveWorkspaceAssistant =
      inactiveWorkspaceSession?.messagesByTask["task-main"]?.at(-1);

    expect(
      inactiveWorkspaceSession?.activeTurnIdsByTask["task-main"],
    ).toBeUndefined();
    expect(inactiveWorkspaceAssistant?.content).toBe(
      "Task 1 kept updating after the workspace switch.",
    );
    expect(inactiveWorkspaceAssistant?.isStreaming).toBe(false);
    await flushPendingSnapshotPersists();
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      id: "ws-main",
      name: "Main",
      snapshot: {
        activeTaskId: "task-main",
      },
    });
    const persistedSnapshot = (
      upsertCalls[0] as {
        snapshot: {
          tasks: Array<{ id: string }>;
          messagesByTask: Record<string, Array<{ content: string }>>;
        };
      }
    ).snapshot;
    expect(persistedSnapshot.tasks.map((task) => task.id)).toEqual([
      "task-main",
      "task-keep",
    ]);
    expect(persistedSnapshot.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "Task 1 kept updating after the workspace switch.",
    );

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-main" });

    const restoredState = useAppStore.getState();
    expect(restoredState.activeWorkspaceId).toBe("ws-main");
    expect(restoredState.activeTaskId).toBe("task-main");
    expect(restoredState.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(restoredState.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "Task 1 kept updating after the workspace switch.",
    );
  });

  test("queues the next prompt during an active turn and auto-dispatches it on completion", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `stream-${sequence}`,
              turnId: `turn-${sequence}`,
            };
          },
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          readFile: async () => ({
            ok: false,
            content: "",
            revision: "",
            stderr: "not found",
          }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "First prompt",
    });

    expect(started).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(startedPrompts).toEqual(["First prompt"]);

    const queued = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Second prompt",
    });

    expect(queued).toEqual({
      status: "queued",
      taskId: "task-main",
      workspaceId: "ws-main",
    });

    const queuedState = useAppStore.getState();
    expect(queuedState.promptDraftByTask["task-main"]).toMatchObject({
      text: "",
    });
    expect(
      queuedState.promptDraftByTask["task-main"]?.queuedNextTurn,
    ).toMatchObject({
      sourceTurnId: started.turnId,
      content: "Second prompt",
    });

    streamListener?.({
      streamId: "stream-1",
      event: { type: "text", text: "First response" },
      done: false,
    });
    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const autoDispatchedState = useAppStore.getState();
    expect(startedPrompts).toEqual(["First prompt", "Second prompt"]);
    expect(typeof autoDispatchedState.activeTurnIdsByTask["task-main"]).toBe(
      "string",
    );
    expect(autoDispatchedState.activeTurnIdsByTask["task-main"]).not.toBe(
      started.turnId,
    );
    expect(autoDispatchedState.promptDraftByTask["task-main"]?.text ?? "").toBe(
      "",
    );
    expect(
      autoDispatchedState.promptDraftByTask["task-main"]?.queuedNextTurn,
    ).toBeUndefined();
    expect(
      autoDispatchedState.messagesByTask["task-main"]?.map(
        (message) => message.role,
      ),
    ).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("auto-dispatches an attachment-only queued next turn after completion", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    const readFileCalls: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `stream-attachment-${sequence}`,
              turnId: `turn-attachment-${sequence}`,
            };
          },
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          readFile: async (args: { filePath?: string }) => {
            readFileCalls.push(args.filePath ?? "");
            return {
              ok: true,
              content: "# README",
              revision: "rev-readme",
            };
          },
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "First prompt",
    });

    expect(started).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });

    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: {
        attachedFilePaths: ["README.md"],
      },
    });

    const queued = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "",
    });

    expect(queued).toEqual({
      status: "queued",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(
      useAppStore.getState().promptDraftByTask["task-main"]?.queuedNextTurn,
    ).toMatchObject({
      sourceTurnId: started.turnId,
      content: "",
    });

    streamListener?.({
      streamId: "stream-attachment-1",
      event: { type: "text", text: "First response" },
      done: false,
    });
    streamListener?.({
      streamId: "stream-attachment-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const autoDispatchedState = useAppStore.getState();
    expect(startedPrompts).toEqual(["First prompt", ""]);
    expect(readFileCalls).toEqual(["README.md"]);
    expect(typeof autoDispatchedState.activeTurnIdsByTask["task-main"]).toBe(
      "string",
    );
    expect(autoDispatchedState.activeTurnIdsByTask["task-main"]).not.toBe(
      started.turnId,
    );
    expect(
      autoDispatchedState.promptDraftByTask["task-main"]?.queuedNextTurn,
    ).toBeUndefined();
  });

  test("clears the submitted prompt draft before async context loading so workspace switches do not revive it", async () => {
    const localStorage = createMemoryStorage();
    let resolveReadFile:
      | ((value: {
          ok: boolean;
          content: string;
          revision: string;
          stderr?: string;
        }) => void)
      | null = null;

    setWindowContext({
      localStorage,
      api: {
        provider: {
          subscribeStreamEvents: () => () => {},
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-submit-clear",
          }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
          readFile: async () =>
            await new Promise<{
              ok: boolean;
              content: string;
              revision: string;
              stderr?: string;
            }>((resolve) => {
              resolveReadFile = resolve;
            }),
        },
      },
    } as unknown);

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-04-09T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {
        "task-main": {
          text: "Submitted prompt",
          attachedFilePaths: ["README.md"],
          attachments: [],
        },
      },
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const sendPromise = useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Submitted prompt",
    });

    const afterSubmit = useAppStore.getState();
    expect(afterSubmit.promptDraftByTask["task-main"]).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });

    const switchedState = useAppStore.getState();
    expect(
      switchedState.workspaceRuntimeCacheById["ws-main"]?.promptDraftByTask[
        "task-main"
      ],
    ).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
    });

    resolveReadFile?.({
      ok: true,
      content: "# README",
      revision: "rev-1",
    });

    const started = await sendPromise;
    expect(started).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
  });

  test("switchWorkspace reloads persistence when the cached target workspace session is empty", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-alpha",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-beta",
                name: "beta",
                updatedAt: "2026-03-10T00:01:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async ({
            workspaceId,
          }: {
            workspaceId: string;
          }) => ({
            ok: true,
            shell:
              workspaceId === "ws-beta"
                ? {
                    activeTaskId: "task-beta",
                    tasks: [
                      {
                        id: "task-beta",
                        title: "Recovered Beta Task",
                        provider: "codex",
                        updatedAt: "2026-03-10T00:01:00.000Z",
                        unread: false,
                      },
                    ],
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                    messageCountByTask: { "task-beta": 0 },
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
                    editorTabs: [],
                    activeEditorTabId: null,
                  }
                : null,
          }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      workspaces: [
        {
          id: "ws-alpha",
          name: "Default Workspace",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        { id: "ws-beta", name: "beta", updatedAt: "2026-03-10T00:01:00.000Z" },
      ],
      activeWorkspaceId: "ws-alpha",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      tasks: [
        {
          id: "task-alpha",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-alpha",
      messagesByTask: { "task-alpha": [] },
      messageCountByTask: { "task-alpha": 0 },
      promptDraftByTask: {},
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
      editorTabs: [],
      activeEditorTabId: null,
      activeTurnIdsByTask: {},
      providerSessionByTask: {},
      nativeSessionReadyByTask: {},
      workspaceRuntimeCacheById: {
        "ws-beta": {
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
          messageCountByTask: {},
          promptDraftByTask: {},
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
          editorTabs: [],
          activeEditorTabId: null,
          activeTurnIdsByTask: {},
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    const nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-beta");
    expect(nextState.activeTaskId).toBe("task-beta");
    expect(nextState.tasks.map((task) => task.id)).toEqual(["task-beta"]);
    expect(nextState.workspaceRuntimeCacheById["ws-beta"]).toBeUndefined();
  });

  test("late events after an inactive workspace turn completes do not emit redundant store updates", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;
    const originalWarn = console.warn;
    const warnCalls: unknown[][] = [];

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-1",
            turnId: "turn-main-1",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-alt",
                name: "Alt",
                updatedAt: "2026-03-10T00:00:01.000Z",
              },
            ],
          }),
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
            ok: true,
            snapshot:
              workspaceId === "ws-alt"
                ? {
                    activeTaskId: "task-alt",
                    tasks: [
                      {
                        id: "task-alt",
                        title: "Alt Task",
                        provider: "claude-code",
                        updatedAt: "2026-03-10T00:00:01.000Z",
                        unread: false,
                      },
                    ],
                    messagesByTask: { "task-alt": [] },
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                  }
                : null,
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-03-10T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Finish, then ignore anything late.",
    });

    await Bun.sleep(0);
    expect(streamListener).toBeFunction();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    try {
      streamListener?.({
        streamId: "stream-1",
        event: { type: "done" },
        done: true,
      });
      streamListener?.({
        streamId: "stream-1",
        event: { type: "text", text: "too late" },
        done: false,
      });

      await Bun.sleep(25);
    } finally {
      console.warn = originalWarn;
    }

    const state = useAppStore.getState();
    const inactiveWorkspaceSession = state.workspaceRuntimeCacheById["ws-main"];
    const inactiveWorkspaceAssistant =
      inactiveWorkspaceSession?.messagesByTask["task-main"]?.at(-1);
    const lateDropWarning = warnCalls.find(
      (call) =>
        call[0] ===
        "[provider-turn] dropped late events for inactive cached workspace turn",
    );

    expect(lateDropWarning).toBeDefined();
    expect(lateDropWarning?.[1]).toMatchObject({
      taskId: "task-main",
      workspaceId: "ws-main",
      activeTurnId: null,
      eventTypes: ["text"],
    });
    expect(
      inactiveWorkspaceSession?.activeTurnIdsByTask["task-main"],
    ).toBeUndefined();
    expect(inactiveWorkspaceAssistant?.content).toBe("No response returned.");
    expect(inactiveWorkspaceAssistant?.isStreaming).toBe(false);
    await flushPendingSnapshotPersists();
    expect(upsertCalls).toHaveLength(1);
  });

  test("switchWorkspace restores per-workspace editor tabs", async () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            editorTabs: [
              {
                id: "file:src/alpha.ts",
                filePath: "src/alpha.ts",
                kind: "text",
                language: "typescript",
                content: "export const alpha = 1;\n",
                originalContent: "export const alpha = 1;\n",
                savedContent: "export const alpha = 1;\n",
                baseRevision: "rev-alpha",
                hasConflict: false,
                isDirty: false,
              },
            ],
            activeEditorTabId: "file:src/alpha.ts",
          },
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            editorTabs: [
              {
                id: "file:src/beta.ts",
                filePath: "src/beta.ts",
                kind: "text",
                language: "typescript",
                content: "export const beta = 2;\n",
                originalContent: "export const beta = 2;\n",
                savedContent: "export const beta = 2;\n",
                baseRevision: "rev-beta",
                hasConflict: false,
                isDirty: false,
              },
            ],
            activeEditorTabId: "file:src/beta.ts",
          },
        },
      ]),
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        { id: "ws-beta", name: "beta", updatedAt: "2026-03-10T00:01:00.000Z" },
      ],
      activeWorkspaceId: "ws-alpha",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    let nextState = useAppStore.getState();
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual([
      "src/alpha.ts",
    ]);
    expect(nextState.activeEditorTabId).toBe("file:src/alpha.ts");

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-beta");
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual([
      "src/beta.ts",
    ]);
    expect(nextState.activeEditorTabId).toBe("file:src/beta.ts");

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alpha" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-alpha");
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual([
      "src/alpha.ts",
    ]);
    expect(nextState.activeEditorTabId).toBe("file:src/alpha.ts");
  });

  test("switchWorkspace restores cached CLI session surfaces for the returning workspace", async () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
          snapshot: {
            activeTaskId: "alpha-task-1",
            tasks: [
              {
                id: "alpha-task-1",
                title: "Alpha Task",
                provider: "claude-code",
                updatedAt: "2026-03-10T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "alpha-task-1": [] },
          },
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
          snapshot: {
            activeTaskId: "beta-task-1",
            tasks: [
              {
                id: "beta-task-1",
                title: "Beta Task",
                provider: "codex",
                updatedAt: "2026-03-10T00:01:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "beta-task-1": [] },
          },
        },
      ]),
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const cliTab = {
      id: "cli-alpha",
      title: "Claude Workspace",
      provider: "claude-code" as const,
      contextMode: "workspace" as const,
      linkedTaskId: null,
      linkedTaskTitle: null,
      handoffSummary: "",
      cwd: "/tmp/stave-project",
      createdAt: 1,
    };

    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    useAppStore.setState((state) => ({
      ...state,
      activeTaskId: "alpha-task-1",
      tasks: [
        {
          id: "alpha-task-1",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: { "alpha-task-1": [] },
      workspaceInformation: createEmptyWorkspaceInformation(),
      cliSessionTabs: [cliTab],
      activeCliSessionTabId: cliTab.id,
      activeSurface: {
        kind: "cli-session",
        cliSessionTabId: cliTab.id,
      },
    }));

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    let nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-beta");
    expect(nextState.activeTaskId).toBe("beta-task-1");
    expect(nextState.tasks.map((task) => task.title)).toEqual(["Beta Task"]);
    expect(nextState.cliSessionTabs).toEqual([]);
    expect(nextState.activeCliSessionTabId).toBeNull();
    expect(nextState.activeSurface).toEqual({
      kind: "task",
      taskId: "beta-task-1",
    });
    expect(
      nextState.workspaceRuntimeCacheById["ws-alpha"]?.cliSessionTabs,
    ).toEqual([cliTab]);
    expect(
      nextState.workspaceRuntimeCacheById["ws-alpha"]?.activeCliSessionTabId,
    ).toBe(cliTab.id);
    expect(
      nextState.workspaceRuntimeCacheById["ws-alpha"]?.activeSurface,
    ).toEqual({
      kind: "cli-session",
      cliSessionTabId: cliTab.id,
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alpha" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-alpha");
    expect(nextState.activeTaskId).toBe("alpha-task-1");
    expect(nextState.tasks.map((task) => task.title)).toEqual(["Alpha Task"]);
    expect(nextState.cliSessionTabs).toEqual([cliTab]);
    expect(nextState.activeCliSessionTabId).toBe(cliTab.id);
    expect(nextState.activeSurface).toEqual({
      kind: "cli-session",
      cliSessionTabId: cliTab.id,
    });
  });

  test("switchWorkspace preserves a hidden terminal dock for the returning workspace", async () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
          snapshot: {
            activeTaskId: "alpha-task-1",
            tasks: [
              {
                id: "alpha-task-1",
                title: "Alpha Task",
                provider: "claude-code",
                updatedAt: "2026-03-10T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "alpha-task-1": [] },
            terminalTabs: [
              {
                id: "terminal-alpha",
                title: "Workspace",
                linkedTaskId: null,
                backend: "ghostty",
                cwd: "/tmp/stave-project",
                createdAt: 1,
              },
            ],
            activeTerminalTabId: "terminal-alpha",
            terminalDocked: false,
          },
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
          snapshot: {
            activeTaskId: "beta-task-1",
            tasks: [
              {
                id: "beta-task-1",
                title: "Beta Task",
                provider: "codex",
                updatedAt: "2026-03-10T00:01:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "beta-task-1": [] },
          },
        },
      ]),
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const terminalTab = {
      id: "terminal-alpha",
      title: "Workspace",
      linkedTaskId: null,
      backend: "ghostty" as const,
      cwd: "/tmp/stave-project",
      createdAt: 1,
    };

    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    useAppStore.setState((state) => ({
      ...state,
      activeTaskId: "alpha-task-1",
      tasks: [
        {
          id: "alpha-task-1",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: { "alpha-task-1": [] },
      workspaceInformation: createEmptyWorkspaceInformation(),
      terminalTabs: [terminalTab],
      activeTerminalTabId: terminalTab.id,
      layout: {
        ...state.layout,
        terminalDocked: false,
      },
    }));

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    expect(
      useAppStore.getState().workspaceRuntimeCacheById["ws-alpha"]
        ?.terminalDocked,
    ).toBe(false);

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alpha" });

    const nextState = useAppStore.getState();
    expect(nextState.layout.terminalDocked).toBe(false);
    expect(nextState.terminalTabs).toEqual([terminalTab]);
    expect(nextState.activeTerminalTabId).toBe(terminalTab.id);
  });

  test("switchWorkspace does not wait for file refresh when the target workspace is cached", async () => {
    const localStorage = createMemoryStorage();
    let resolveListFiles:
      | ((value: { ok: boolean; files: string[] }) => void)
      | null = null;
    const listFilesPromise = new Promise<{ ok: boolean; files: string[] }>(
      (resolve) => {
        resolveListFiles = resolve;
      },
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => listFilesPromise,
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha-fast",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta-fast",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha-fast",
      projectPath: "/tmp/stave-project-switch-fast",
      projectName: "stave-project-switch-fast",
      workspacePathById: {
        "ws-alpha-fast": "/tmp/stave-project-switch-fast",
        "ws-beta-fast": "/tmp/stave-project-switch-fast/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha-fast": "main",
        "ws-beta-fast": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha-fast": true,
        "ws-beta-fast": false,
      },
      tasks: [
        {
          id: "task-alpha-fast",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-alpha-fast",
      messagesByTask: { "task-alpha-fast": [] },
      messageCountByTask: { "task-alpha-fast": 0 },
      projectFiles: ["alpha-only.ts"],
      workspaceRuntimeCacheById: {
        "ws-beta-fast": {
          activeTaskId: "task-beta-fast",
          tasks: [
            {
              id: "task-beta-fast",
              title: "Beta Task",
              provider: "codex",
              updatedAt: "2026-03-10T00:01:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: { "task-beta-fast": [] },
          messageCountByTask: { "task-beta-fast": 0 },
          promptDraftByTask: {},
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
          editorTabs: [],
          activeEditorTabId: null,
          activeTurnIdsByTask: {},
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    let switchResolved = false;
    const switchPromise = useAppStore
      .getState()
      .switchWorkspace({ workspaceId: "ws-beta-fast" })
      .then(() => {
        switchResolved = true;
      });

    await Bun.sleep(0);

    expect(switchResolved).toBe(true);
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-beta-fast");
    expect(useAppStore.getState().tasks.map((task) => task.id)).toEqual([
      "task-beta-fast",
    ]);
    expect(useAppStore.getState().projectFiles).toEqual([]);

    resolveListFiles?.({ ok: true, files: ["beta-only.ts"] });
    await switchPromise;
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual(["beta-only.ts"]);
  });

  test("closeWorkspace clears cached files for the closed workspace path", async () => {
    const localStorage = createMemoryStorage();
    const closedWorkspaceIds: string[] = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          closeWorkspace: async ({ workspaceId }: { workspaceId: string }) => {
            closedWorkspaceIds.push(workspaceId);
            return { ok: true };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
      await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        {
          id: "ws-main-close",
          name: "Main",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-feature-close",
          name: "feature",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-close",
      projectPath: "/tmp/stave-project-close",
      workspacePathById: {
        "ws-main-close": "/tmp/stave-project-close",
        "ws-feature-close":
          "/tmp/stave-project-close/.stave/workspaces/feature",
      },
      workspaceBranchById: {
        "ws-main-close": "main",
        "ws-feature-close": "feature",
      },
      workspaceDefaultById: {
        "ws-main-close": true,
        "ws-feature-close": false,
      },
      workspaceFileCacheByPath: {
        "/tmp/stave-project-close": ["root.ts"],
        "/tmp/stave-project-close/.stave/workspaces/feature": ["feature.ts"],
      },
    });

    await useAppStore
      .getState()
      .closeWorkspace({ workspaceId: "ws-feature-close" });

    // closeWorkspace now updates renderer state instantly and defers
    // persistence/git cleanup to a detached promise. Await it explicitly so
    // the persistence assertion below is deterministic.
    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-main-close"]);
    expect(useAppStore.getState().workspaceFileCacheByPath).toEqual({
      "/tmp/stave-project-close": ["root.ts"],
    });

    await waitForPendingWorkspaceArchiveCleanups();

    expect(closedWorkspaceIds).toEqual(["ws-feature-close"]);
  });

  test("switchWorkspace resolves after shell hydrate and backfills messages asynchronously for uncached workspaces", async () => {
    const localStorage = createMemoryStorage();
    let resolveTaskMessages:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "assistant";
              model: string;
              providerId: "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;
    const taskMessagesPromise = new Promise<{
      ok: boolean;
      page: {
        messages: Array<{
          id: string;
          role: "assistant";
          model: string;
          providerId: "codex";
          content: string;
          isStreaming: boolean;
          parts: Array<{ type: "text"; text: string }>;
        }>;
        totalCount: number;
        limit: number;
        offset: number;
        hasMoreOlder: boolean;
      };
    }>((resolve) => {
      resolveTaskMessages = resolve;
    });

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadWorkspaceShell: async ({
            workspaceId,
          }: {
            workspaceId: string;
          }) => ({
            ok: true,
            shell:
              workspaceId === "ws-beta-cold"
                ? {
                    activeTaskId: "task-beta-cold",
                    tasks: [
                      {
                        id: "task-beta-cold",
                        title: "Beta Cold Task",
                        provider: "codex",
                        updatedAt: "2026-03-10T00:01:00.000Z",
                        unread: false,
                      },
                    ],
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                    messageCountByTask: { "task-beta-cold": 1 },
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
                    editorTabs: [],
                    activeEditorTabId: null,
                  }
                : null,
          }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          loadTaskMessages: async () => taskMessagesPromise,
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha-cold",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta-cold",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha-cold",
      projectPath: "/tmp/stave-project-cold",
      projectName: "stave-project-cold",
      workspacePathById: {
        "ws-alpha-cold": "/tmp/stave-project-cold",
        "ws-beta-cold": "/tmp/stave-project-cold/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha-cold": "main",
        "ws-beta-cold": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha-cold": true,
        "ws-beta-cold": false,
      },
      tasks: [
        {
          id: "task-alpha-cold",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-alpha-cold",
      messagesByTask: { "task-alpha-cold": [] },
      messageCountByTask: { "task-alpha-cold": 0 },
      projectFiles: ["alpha.ts"],
    });

    let switchResolved = false;
    const switchPromise = useAppStore
      .getState()
      .switchWorkspace({ workspaceId: "ws-beta-cold" })
      .then(() => {
        switchResolved = true;
      });

    await Bun.sleep(0);

    expect(switchResolved).toBe(true);
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-beta-cold");
    expect(useAppStore.getState().activeTaskId).toBe("task-beta-cold");
    expect(useAppStore.getState().tasks.map((task) => task.id)).toEqual([
      "task-beta-cold",
    ]);
    expect(useAppStore.getState().messageCountByTask["task-beta-cold"]).toBe(1);
    expect(
      useAppStore.getState().messagesByTask["task-beta-cold"],
    ).toBeUndefined();
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-beta-cold"],
    ).toBe(true);

    resolveTaskMessages?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-beta-cold-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "cold beta message",
            isStreaming: false,
            parts: [{ type: "text", text: "cold beta message" }],
          },
        ],
        totalCount: 1,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });
    await switchPromise;
    await Bun.sleep(0);

    expect(
      useAppStore.getState().messagesByTask["task-beta-cold"]?.at(-1)?.content,
    ).toBe("cold beta message");
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-beta-cold"],
    ).toBe(false);
  });

  test("hydrateWorkspaces only prunes stale worktrees for the active project", async () => {
    const localStorage = createMemoryStorage();
    const closedWorkspaceIds: string[] = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-alpha",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-alpha-feature",
                name: "feature-a",
                updatedAt: "2026-03-10T00:01:00.000Z",
              },
              {
                id: "ws-beta",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:02:00.000Z",
              },
              {
                id: "ws-beta-feature",
                name: "feature-b",
                updatedAt: "2026-03-10T00:03:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadProjectRegistry: async () => ({
            ok: true,
            projects: [
              {
                projectPath: "/tmp/project-alpha",
                projectName: "project-alpha",
                lastOpenedAt: "2026-03-10T00:00:00.000Z",
                defaultBranch: "main",
                workspaces: [
                  {
                    id: "ws-alpha",
                    name: "Default Workspace",
                    updatedAt: "2026-03-10T00:00:00.000Z",
                  },
                  {
                    id: "ws-alpha-feature",
                    name: "feature-a",
                    updatedAt: "2026-03-10T00:01:00.000Z",
                  },
                ],
                activeWorkspaceId: "ws-alpha",
                workspaceBranchById: {
                  "ws-alpha": "main",
                  "ws-alpha-feature": "feature-a",
                },
                workspacePathById: {
                  "ws-alpha": "/tmp/project-alpha",
                  "ws-alpha-feature":
                    "/tmp/project-alpha/.stave/workspaces/feature-a",
                },
                workspaceDefaultById: { "ws-alpha": true },
              },
            ],
          }),
          saveProjectRegistry: async () => ({ ok: true }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          closeWorkspace: async ({ workspaceId }: { workspaceId: string }) => {
            closedWorkspaceIds.push(workspaceId);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/project-alpha",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/project-alpha/.stave/workspaces/feature-a",
                  "HEAD def456",
                  "branch refs/heads/feature-a",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/project-alpha",
      projectName: "project-alpha",
      workspaces: [
        {
          id: "ws-alpha",
          name: "Default Workspace",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-alpha-feature",
          name: "feature-a",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha",
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-alpha-feature": "feature-a",
      },
      workspacePathById: {
        "ws-alpha": "/tmp/project-alpha",
        "ws-alpha-feature": "/tmp/project-alpha/.stave/workspaces/feature-a",
      },
      workspaceDefaultById: { "ws-alpha": true },
      recentProjects: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    expect(closedWorkspaceIds).toEqual([]);
    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-alpha", "ws-alpha-feature"]);
  });

  test("abortTaskTurn calls cleanupTask and clears providerSessionByTask to prevent stale thread resume", async () => {
    const localStorage = createMemoryStorage();
    const abortCalls: string[] = [];
    const cleanupCalls: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-abort-1",
            turnId: "turn-abort-1",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async ({ turnId }: { turnId: string }) => {
            abortCalls.push(turnId);
            return { ok: true, message: "aborted" };
          },
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true };
          },
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          upsertWorkspace: async () => ({ ok: true }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-abort-test",
      activeTaskId: "task-abort-1",
      projectPath: "/tmp/stave-abort-test",
      draftProvider: "codex",
      tasks: [
        {
          id: "task-abort-1",
          title: "Abort Test",
          provider: "codex",
          updatedAt: "2026-04-01T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-abort-1": [
          {
            id: "task-abort-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            isStreaming: false,
            parts: [
              {
                type: "approval",
                toolName: "bash",
                requestId: "approval-abort-1",
                description: "Run npm test",
                state: "approval-requested",
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: {
        "task-abort-1": "turn-abort-1",
      },
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {
        "task-abort-1": { codex: "thread-id-stale-abc123" },
      },
    });

    const beforeAbort = useAppStore.getState();
    const activeTurnId = beforeAbort.activeTurnIdsByTask["task-abort-1"];
    expect(activeTurnId).toBeString();

    useAppStore.getState().abortTaskTurn({ taskId: "task-abort-1" });
    await Bun.sleep(0);

    const afterAbort = useAppStore.getState();
    // Turn should be cleared
    expect(afterAbort.activeTurnIdsByTask["task-abort-1"]).toBeUndefined();
    // cleanupTask must have been called so provider thread caches are evicted
    expect(cleanupCalls).toContain("task-abort-1");
    // providerSessionByTask should no longer hold the stale thread id
    expect(afterAbort.providerSessionByTask["task-abort-1"]).toBeUndefined();
    expect(
      afterAbort.messagesByTask["task-abort-1"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "approval",
      requestId: "approval-abort-1",
      state: "approval-interrupted",
    });
  });

  test("resolveApproval keeps pending state when no active turn exists", async () => {
    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {},
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            isStreaming: false,
            parts: [
              {
                type: "approval",
                toolName: "bash",
                requestId: "approval-1",
                description: "Run npm test",
                state: "approval-requested",
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().resolveApproval({
      taskId: "task-1",
      messageId: "task-1-m-1",
      approved: true,
    });

    const messages = useAppStore.getState().messagesByTask["task-1"] ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "approval",
      requestId: "approval-1",
      state: "approval-requested",
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "Approval delivery failed: no active turn found for this task.",
    });
  });

  test("resolveApproval targets the task-owned inactive workspace turn with trimmed notification task ids", async () => {
    const approvalCalls: Array<{
      turnId: string;
      requestId: string;
      approved: boolean;
    }> = [];

    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          respondApproval: async (args: {
            turnId: string;
            requestId: string;
            approved: boolean;
          }) => {
            approvalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project/.stave/workspaces/alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      tasks: [
        {
          id: "task-main",
          title: "Task Main",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      notifications: [
        {
          id: "notification-approval-alt-1",
          kind: "task.approval_requested",
          title: "Task Alt",
          body: "Approval requested",
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaceId: "ws-alt",
          workspaceName: "Alt Workspace",
          taskId: " task-alt ",
          taskTitle: "Task Alt",
          turnId: "turn-alt-1",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "approval-alt-1",
          },
          payload: {
            toolName: "bash",
            description: "Run npm test in alt workspace",
          },
          createdAt: "2026-04-07T00:00:00.000Z",
          readAt: null,
        },
      ],
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {
        "task-main": "ws-main",
        "task-alt": "ws-alt",
      },
      workspaceRuntimeCacheById: {
        "ws-alt": {
          activeTaskId: "task-alt",
          tasks: [
            {
              id: "task-alt",
              title: "Task Alt",
              provider: "codex",
              updatedAt: "2026-04-07T00:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-alt": [
              {
                id: "task-alt-m-1",
                role: "assistant",
                model: "gpt-5.4",
                providerId: "codex",
                content: "",
                isStreaming: false,
                parts: [
                  {
                    type: "approval",
                    toolName: "bash",
                    requestId: "approval-alt-1",
                    description: "Run npm test in alt workspace",
                    state: "approval-requested",
                  },
                ],
              },
            ],
          },
          messageCountByTask: { "task-alt": 1 },
          promptDraftByTask: {},
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
          editorTabs: [],
          activeEditorTabId: null,
          terminalTabs: [],
          activeTerminalTabId: null,
          activeTurnIdsByTask: {
            "task-alt": "turn-alt-1",
          },
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    useAppStore.getState().resolveApproval({
      taskId: "task-alt",
      messageId: "task-alt-m-1",
      approved: true,
    });

    await Bun.sleep(0);

    expect(approvalCalls).toEqual([
      {
        turnId: "turn-alt-1",
        requestId: "approval-alt-1",
        approved: true,
      },
    ]);
    expect(
      useAppStore.getState().workspaceRuntimeCacheById["ws-alt"]
        ?.messagesByTask["task-alt"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "approval",
      requestId: "approval-alt-1",
      state: "approval-responded",
    });
    expect(useAppStore.getState().notifications[0]?.readAt).toBeString();
    expect(useAppStore.getState().messagesByTask["task-main"]).toEqual([]);
  });

  test("resolveApproval only marks the matching notification when request ids collide across workspaces", async () => {
    const approvalCalls: Array<{
      turnId: string;
      requestId: string;
      approved: boolean;
    }> = [];

    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          respondApproval: async (args: {
            turnId: string;
            requestId: string;
            approved: boolean;
          }) => {
            approvalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project/.stave/workspaces/alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      tasks: [
        {
          id: "task-main",
          title: "Task Main",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      notifications: [
        {
          id: "notification-approval-main-1",
          kind: "task.approval_requested",
          title: "Task Main",
          body: "Approval requested",
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaceId: "ws-main",
          workspaceName: "Main Workspace",
          taskId: "task-main",
          taskTitle: "Task Main",
          turnId: "turn-main-1",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "1",
            messageId: "task-main-m-1",
          },
          payload: {
            toolName: "bash",
            description: "Run npm test in main workspace",
          },
          createdAt: "2026-04-07T00:00:01.000Z",
          readAt: null,
        },
        {
          id: "notification-approval-alt-1",
          kind: "task.approval_requested",
          title: "Task Alt",
          body: "Approval requested",
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaceId: "ws-alt",
          workspaceName: "Alt Workspace",
          taskId: "task-alt",
          taskTitle: "Task Alt",
          turnId: "turn-alt-1",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "1",
            messageId: "task-alt-m-1",
          },
          payload: {
            toolName: "bash",
            description: "Run npm test in alt workspace",
          },
          createdAt: "2026-04-07T00:00:00.000Z",
          readAt: null,
        },
      ],
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {
        "task-main": "ws-main",
        "task-alt": "ws-alt",
      },
      workspaceRuntimeCacheById: {
        "ws-alt": {
          activeTaskId: "task-alt",
          tasks: [
            {
              id: "task-alt",
              title: "Task Alt",
              provider: "codex",
              updatedAt: "2026-04-07T00:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-alt": [
              {
                id: "task-alt-m-1",
                role: "assistant",
                model: "gpt-5.4",
                providerId: "codex",
                content: "",
                isStreaming: false,
                parts: [
                  {
                    type: "approval",
                    toolName: "bash",
                    requestId: "1",
                    description: "Run npm test in alt workspace",
                    state: "approval-requested",
                  },
                ],
              },
            ],
          },
          messageCountByTask: { "task-alt": 1 },
          promptDraftByTask: {},
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
          editorTabs: [],
          activeEditorTabId: null,
          terminalTabs: [],
          activeTerminalTabId: null,
          activeTurnIdsByTask: {
            "task-alt": "turn-alt-1",
          },
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    useAppStore.getState().resolveApproval({
      taskId: "task-alt",
      messageId: "task-alt-m-1",
      approved: true,
    });

    await Bun.sleep(0);

    expect(approvalCalls).toEqual([
      {
        turnId: "turn-alt-1",
        requestId: "1",
        approved: true,
      },
    ]);

    const notifications = useAppStore.getState().notifications;
    expect(
      notifications.find(
        (notification) => notification.id === "notification-approval-alt-1",
      )?.readAt,
    ).toBeString();
    expect(
      notifications.find(
        (notification) => notification.id === "notification-approval-main-1",
      )?.readAt,
    ).toBeNull();
  });

  test("resolveUserInput targets the task-owned inactive workspace turn", async () => {
    const inputCalls: Array<{
      turnId: string;
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    }> = [];

    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          respondUserInput: async (args: {
            turnId: string;
            requestId: string;
            answers?: Record<string, string>;
            denied?: boolean;
          }) => {
            inputCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project/.stave/workspaces/alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      tasks: [
        {
          id: "task-main",
          title: "Task Main",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {
        "task-main": "ws-main",
        "task-alt": "ws-alt",
      },
      workspaceRuntimeCacheById: {
        "ws-alt": {
          activeTaskId: "task-alt",
          tasks: [
            {
              id: "task-alt",
              title: "Task Alt",
              provider: "codex",
              updatedAt: "2026-04-07T00:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-alt": [
              {
                id: "task-alt-m-1",
                role: "assistant",
                model: "gpt-5.4",
                providerId: "codex",
                content: "",
                isStreaming: false,
                parts: [
                  {
                    type: "user_input",
                    toolName: "request_user_input",
                    requestId: "input-alt-1",
                    questions: [
                      {
                        id: "name",
                        header: "Name",
                        question: "What should I call the branch?",
                        options: [
                          {
                            label: "Use current",
                            description: "Keep the current branch name.",
                          },
                        ],
                      },
                    ],
                    state: "input-requested",
                  },
                ],
              },
            ],
          },
          messageCountByTask: { "task-alt": 1 },
          promptDraftByTask: {},
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
          editorTabs: [],
          activeEditorTabId: null,
          terminalTabs: [],
          activeTerminalTabId: null,
          activeTurnIdsByTask: {
            "task-alt": "turn-alt-1",
          },
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    useAppStore.getState().resolveUserInput({
      taskId: "task-alt",
      messageId: "task-alt-m-1",
      answers: { name: "feature/alt" },
    });

    await Bun.sleep(0);

    expect(inputCalls).toEqual([
      {
        turnId: "turn-alt-1",
        requestId: "input-alt-1",
        answers: { name: "feature/alt" },
        denied: undefined,
      },
    ]);
    expect(
      useAppStore.getState().workspaceRuntimeCacheById["ws-alt"]
        ?.messagesByTask["task-alt"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "user_input",
      requestId: "input-alt-1",
      state: "input-responded",
    });
    expect(useAppStore.getState().messagesByTask["task-main"]).toEqual([]);
  });
});
