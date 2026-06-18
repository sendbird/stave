import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Task } from "../src/types/chat";

type UseAppStore = typeof import("../src/store/app.store").useAppStore;
type AppState = ReturnType<UseAppStore["getState"]>;
type CreateWorkspaceArgs = Parameters<AppState["createWorkspace"]>[0];
type SendUserMessageArgs = Parameters<AppState["sendUserMessage"]>[0];

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;
let useAppStore: UseAppStore;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function buildTask(args: {
  id: string;
  title: string;
  provider?: "claude-code" | "codex";
}): Task {
  return {
    id: args.id,
    title: args.title,
    provider: args.provider ?? "codex",
    updatedAt: "2026-06-18T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
  };
}

beforeEach(async () => {
  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
    api: {},
  };
  ({ useAppStore } = await import("../src/store/app.store"));
  const initial = useAppStore.getInitialState();
  useAppStore.setState({
    ...initial,
    projectPath: "/tmp/stave",
    projectName: "Stave",
    defaultBranch: "main",
    activeWorkspaceId: "base",
    activeTaskId: "base-task",
    activeSurface: { kind: "task", taskId: "base-task" },
    workspaces: [
      {
        id: "base",
        name: "main",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
    ],
    workspaceBranchById: { base: "main" },
    workspacePathById: { base: "/tmp/stave" },
    workspaceDefaultById: { base: true },
    taskWorkspaceIdById: { "base-task": "base" },
    tasks: [buildTask({ id: "base-task", title: "Seed" })],
    promptDraftByTask: {
      "base-task": {
        text: "Implement compare runs",
        attachedFilePaths: [],
        attachments: [],
      },
    },
    compareRunsById: {},
    activeCompareRunId: null,
    settings: {
      ...initial.settings,
      modelClaude: "claude-sonnet-test",
      modelCodex: "gpt-5-codex-test",
    },
  });
});

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("compare run store actions", () => {
  test("starts Claude and Codex variants from the active draft", async () => {
    const createdWorkspaces: CreateWorkspaceArgs[] = [];
    const providerCalls: Array<{ taskId: string; provider: string }> = [];
    const promptDraftPatches: Array<{
      taskId: string;
      model: string | undefined;
    }> = [];
    const sentMessages: SendUserMessageArgs[] = [];

    useAppStore.setState({
      createWorkspace: async (args) => {
        createdWorkspaces.push(args);
        const index = createdWorkspaces.length;
        const workspaceId = `workspace-${index}`;
        const taskId = `task-${index}`;
        useAppStore.setState((state) => ({
          workspaces: [
            ...state.workspaces,
            {
              id: workspaceId,
              name: args.name,
              updatedAt: "2026-06-18T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: workspaceId,
          activeTaskId: taskId,
          activeSurface: { kind: "task", taskId },
          tasks: [
            buildTask({
              id: taskId,
              title: args.initialTaskTitle ?? `Task ${index}`,
            }),
          ],
          workspaceBranchById: {
            ...state.workspaceBranchById,
            [workspaceId]: args.name,
          },
          workspacePathById: {
            ...state.workspacePathById,
            [workspaceId]: `/tmp/stave/.stave/workspaces/${workspaceId}`,
          },
          workspaceDefaultById: {
            ...state.workspaceDefaultById,
            [workspaceId]: false,
          },
          taskWorkspaceIdById: {
            ...state.taskWorkspaceIdById,
            [taskId]: workspaceId,
          },
          promptDraftByTask: {
            ...state.promptDraftByTask,
            [taskId]: {
              text: "",
              attachedFilePaths: [],
              attachments: [],
            },
          },
        }));
        return { ok: true };
      },
      setTaskProvider: ({ taskId, provider }) => {
        providerCalls.push({ taskId, provider });
      },
      updatePromptDraft: ({ taskId, patch }) => {
        promptDraftPatches.push({
          taskId,
          model: patch.runtimeOverrides?.model,
        });
        useAppStore.setState((state) => ({
          promptDraftByTask: {
            ...state.promptDraftByTask,
            [taskId]: {
              ...(state.promptDraftByTask[taskId] ?? {
                text: "",
                attachedFilePaths: [],
                attachments: [],
              }),
              ...patch,
            },
          },
        }));
      },
      sendUserMessage: async (args) => {
        sentMessages.push(args);
        return {
          status: "started",
          taskId: args.taskId,
          workspaceId:
            useAppStore.getState().taskWorkspaceIdById[args.taskId] ?? "base",
          turnId: `turn-${sentMessages.length}`,
        };
      },
    });

    const result = await useAppStore
      .getState()
      .startCompareRunFromActiveDraft();

    expect(result.ok).toBe(true);
    expect(createdWorkspaces).toHaveLength(2);
    expect(createdWorkspaces.map((workspace) => workspace.mode)).toEqual([
      "branch",
      "branch",
    ]);
    expect(createdWorkspaces.map((workspace) => workspace.fromBranch)).toEqual([
      "main",
      "main",
    ]);
    expect(providerCalls).toEqual([
      { taskId: "task-1", provider: "claude-code" },
      { taskId: "task-2", provider: "codex" },
    ]);
    expect(promptDraftPatches).toEqual([
      { taskId: "task-1", model: "claude-sonnet-test" },
      { taskId: "task-2", model: "gpt-5-codex-test" },
    ]);
    expect(sentMessages.map((message) => message.content)).toEqual([
      "Implement compare runs",
      "Implement compare runs",
    ]);

    const state = useAppStore.getState();
    const compareRunId = result.compareRunId ?? "";
    const run = state.compareRunsById[compareRunId];

    expect(state.activeSurface).toEqual({
      kind: "compare-run",
      compareRunId,
    });
    expect(run?.status).toBe("running");
    expect(run?.variants.map((variant) => variant.status)).toEqual([
      "running",
      "running",
    ]);
    expect(run?.variants.map((variant) => variant.workspaceId)).toEqual([
      "workspace-1",
      "workspace-2",
    ]);
  });

  test("keeps one variant and discards sibling workspaces", async () => {
    const closedWorkspaceIds: string[] = [];
    const switchedWorkspaceIds: string[] = [];
    const selectedTaskIds: string[] = [];

    useAppStore.setState({
      activeWorkspaceId: "base",
      compareRunsById: {
        "run-1": {
          id: "run-1",
          seedPrompt: "Compare this",
          baseWorkspaceId: "base",
          baseBranch: "main",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
          status: "running",
          variants: [
            {
              id: "variant-1",
              provider: "claude-code",
              status: "running",
              workspaceId: "workspace-1",
              taskId: "task-1",
            },
            {
              id: "variant-2",
              provider: "codex",
              status: "running",
              workspaceId: "workspace-2",
              taskId: "task-2",
            },
          ],
        },
      },
      closeWorkspace: async ({ workspaceId }) => {
        closedWorkspaceIds.push(workspaceId);
      },
      switchWorkspace: async ({ workspaceId }) => {
        switchedWorkspaceIds.push(workspaceId);
        useAppStore.setState({ activeWorkspaceId: workspaceId });
      },
      selectTask: ({ taskId }) => {
        selectedTaskIds.push(taskId);
        useAppStore.setState({
          activeTaskId: taskId,
          activeSurface: { kind: "task", taskId },
        });
      },
    });

    const result = await useAppStore.getState().keepCompareVariant({
      compareRunId: "run-1",
      variantId: "variant-2",
    });

    expect(result.ok).toBe(true);
    expect(closedWorkspaceIds).toEqual(["workspace-1"]);
    expect(switchedWorkspaceIds).toEqual(["workspace-2"]);
    expect(selectedTaskIds).toEqual(["task-2"]);

    const run = useAppStore.getState().compareRunsById["run-1"];
    expect(run?.status).toBe("completed");
    expect(run?.keptVariantId).toBe("variant-2");
    expect(run?.variants.map((variant) => variant.status)).toEqual([
      "discarded",
      "kept",
    ]);
  });

  test("cancels a run and closes all live variant workspaces", async () => {
    const closedWorkspaceIds: string[] = [];

    useAppStore.setState({
      compareRunsById: {
        "run-1": {
          id: "run-1",
          seedPrompt: "Compare this",
          baseWorkspaceId: "base",
          baseBranch: "main",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
          status: "running",
          variants: [
            {
              id: "variant-1",
              provider: "claude-code",
              status: "running",
              workspaceId: "workspace-1",
              taskId: "task-1",
            },
            {
              id: "variant-2",
              provider: "codex",
              status: "running",
              workspaceId: "workspace-2",
              taskId: "task-2",
            },
          ],
        },
      },
      closeWorkspace: async ({ workspaceId }) => {
        closedWorkspaceIds.push(workspaceId);
      },
    });

    const result = await useAppStore
      .getState()
      .cancelCompareRun({ compareRunId: "run-1" });

    expect(result.ok).toBe(true);
    expect(closedWorkspaceIds).toEqual(["workspace-1", "workspace-2"]);

    const run = useAppStore.getState().compareRunsById["run-1"];
    expect(run?.status).toBe("cancelled");
    expect(run?.variants.map((variant) => variant.status)).toEqual([
      "discarded",
      "discarded",
    ]);
  });
});
