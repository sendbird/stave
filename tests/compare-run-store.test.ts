import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { finishCompareRunsForTask } from "../src/lib/compare-runs";
import {
  buildCompareJudgePrompt,
  buildCompareJudgeRuntimeOptions,
  launchReadyCompareJudges,
} from "../src/store/compare-run-judge";
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
  test("keeps the Claude judge fresh and read-only too", () => {
    const runtimeOptions = buildCompareJudgeRuntimeOptions({
      provider: "claude-code",
      model: "claude-sonnet-5",
      settings: useAppStore.getState().settings,
    });

    expect(runtimeOptions).toMatchObject({
      model: "claude-sonnet-5",
      claudePermissionMode: "plan",
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
      claudeAllowedTools: ["Read", "Glob", "Grep", "Bash"],
      claudeDisallowedTools: ["Write", "Edit", "NotebookEdit"],
    });
    expect(runtimeOptions.claudeResumeSessionId).toBeUndefined();
    expect(runtimeOptions.codexResumeThreadId).toBeUndefined();
  });

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

  test("fails each throwing candidate without leaving the run pending", async () => {
    let createAttempts = 0;
    useAppStore.setState({
      createWorkspace: async () => {
        createAttempts += 1;
        throw new Error(`workspace failure ${createAttempts}`);
      },
    });

    const result = await useAppStore.getState().startCompareRun({
      seedPrompt: "Exercise failure handling",
    });

    expect(createAttempts).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.compareRunId).toBeTruthy();
    const run = useAppStore.getState().compareRunsById[result.compareRunId!];
    expect(run?.status).toBe("failed");
    expect(run?.variants.map((variant) => variant.status)).toEqual([
      "failed",
      "failed",
    ]);
    expect(run?.variants.map((variant) => variant.error)).toEqual([
      "workspace failure 1",
      "workspace failure 2",
    ]);
  });

  test("keeps a fast terminal outcome instead of patching it back to running", async () => {
    let workspaceIndex = 0;
    useAppStore.setState({
      createWorkspace: async (args) => {
        workspaceIndex += 1;
        const workspaceId = `fast-workspace-${workspaceIndex}`;
        const taskId = `fast-task-${workspaceIndex}`;
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
            ...state.tasks,
            buildTask({
              id: taskId,
              title: args.initialTaskTitle ?? `Task ${workspaceIndex}`,
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
      sendUserMessage: async (args) => {
        useAppStore.setState((state) => ({
          compareRunsById: finishCompareRunsForTask({
            runsById: state.compareRunsById,
            taskId: args.taskId,
            outcome: "completed",
            now: "2026-06-18T00:01:00.000Z",
          }),
        }));
        return {
          status: "started",
          taskId: args.taskId,
          workspaceId:
            useAppStore.getState().taskWorkspaceIdById[args.taskId] ?? "base",
          turnId: `fast-turn-${workspaceIndex}`,
        };
      },
    });

    const result = await useAppStore.getState().startCompareRun({
      seedPrompt: "Finish immediately",
    });
    const run = useAppStore.getState().compareRunsById[result.compareRunId!];

    expect(result.ok).toBe(true);
    expect(run?.status).toBe("completed");
    expect(run?.variants.map((variant) => variant.status)).toEqual([
      "completed",
      "completed",
    ]);
  });

  test("runs a selected judge in fresh read-only context and stores its recommendation", async () => {
    let judgeRequest:
      | {
          prompt: string;
          cwd?: string;
          runtimeOptions?: {
            model?: string;
            codexFileAccess?: string;
            codexResumeThreadId?: string;
          };
        }
      | undefined;
    useAppStore.setState({
      compareRunsById: {
        "run-judge": {
          id: "run-judge",
          seedPrompt: "Choose the safest implementation",
          baseWorkspaceId: "base",
          baseBranch: "main",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
          status: "completed",
          reviewCriteria: ["Correctness", "Verification"],
          judge: {
            provider: "codex",
            model: "gpt-5.6-sol",
            status: "pending",
            attempt: 0,
          },
          variants: [
            {
              id: "variant-a",
              provider: "claude-code",
              model: "claude-sonnet-5",
              status: "completed",
              workspacePath: "/tmp/stave/compare-a",
            },
            {
              id: "variant-b",
              provider: "codex",
              model: "gpt-5.6-terra",
              status: "completed",
              workspacePath: "/tmp/stave/compare-b",
            },
          ],
        },
      },
    });

    await launchReadyCompareJudges({
      getState: () => useAppStore.getState(),
      updateRuns: (updater) =>
        useAppStore.setState((state) => ({
          compareRunsById: updater(state.compareRunsById),
        })),
      bridge: {
        checkAvailability: async () => ({ ok: true, available: true }),
        streamTurn: (request) => {
          judgeRequest = request;
          return Promise.resolve([
            {
              type: "text",
              text: `<stave_compare_judgment>
                {
                  "recommendedCandidateId": "B",
                  "confidence": "high",
                  "rationale": "Candidate B includes the stronger regression coverage.",
                  "candidateScores": [
                    {
                      "candidateId": "A",
                      "score": 7,
                      "summary": "Correct but lightly tested.",
                      "strengths": ["Small diff"],
                      "risks": ["Missing edge case"],
                      "criteria": []
                    },
                    {
                      "candidateId": "B",
                      "score": 9,
                      "summary": "Correct with focused coverage.",
                      "strengths": ["Regression test"],
                      "risks": [],
                      "criteria": []
                    }
                  ]
                }
              </stave_compare_judgment>`,
            },
            { type: "done", stop_reason: "end_turn" },
          ]);
        },
      },
      now: () => "2026-06-18T00:03:00.000Z",
    });

    expect(judgeRequest?.cwd).toBe("/tmp/stave");
    expect(judgeRequest?.runtimeOptions).toMatchObject({
      model: "gpt-5.6-sol",
      codexFileAccess: "read-only",
    });
    expect(judgeRequest?.runtimeOptions?.codexResumeThreadId).toBeUndefined();
    expect(judgeRequest?.prompt).toContain(
      "This is a fresh, read-only evaluation.",
    );
    expect(judgeRequest?.prompt).toContain("/tmp/stave/compare-a");
    expect(judgeRequest?.prompt).toContain('"candidateId": "A"');
    expect(judgeRequest?.prompt).toContain('"candidateId": "B"');
    expect(judgeRequest?.prompt).not.toContain("variant-a");
    expect(judgeRequest?.prompt).not.toContain("variant-b");
    expect(judgeRequest?.prompt).not.toContain("claude-code");
    expect(judgeRequest?.prompt).not.toContain("claude-sonnet-5");
    expect(judgeRequest?.prompt).not.toContain("gpt-5.6-terra");
    expect(judgeRequest?.prompt).not.toContain('"label": "Claude"');
    expect(judgeRequest?.prompt).not.toContain('"label": "Codex"');
    const judge = useAppStore.getState().compareRunsById["run-judge"]?.judge;
    expect(judge?.status).toBe("completed");
    expect(judge?.judgment?.recommendedVariantId).toBe("variant-b");
    expect(judge?.judgment?.provenance).toEqual({
      rubricVersion: "1",
      judgeProvider: "codex",
      judgeModel: "gpt-5.6-sol",
      attempt: 1,
    });
    expect(judge?.judgment?.candidateScores[1]?.criteria).toEqual([
      {
        criterion: "Correctness",
        score: 9,
        rationale: "Correct with focused coverage.",
      },
      {
        criterion: "Verification",
        score: 9,
        rationale: "Correct with focused coverage.",
      },
    ]);
  });

  test("keeps provider and model identity out of the anonymous judge prompt", () => {
    const prompt = buildCompareJudgePrompt({
      id: "run-anonymous",
      seedPrompt: "Choose the safer implementation",
      baseWorkspaceId: "base",
      baseBranch: "main",
      createdAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
      status: "completed",
      variants: [
        {
          id: "private-variant-1",
          provider: "claude-code",
          model: "claude-sonnet-5",
          label: "Claude",
          status: "completed",
          workspacePath: "/tmp/stave/candidate-a",
        },
        {
          id: "private-variant-2",
          provider: "codex",
          model: "gpt-5.6-terra",
          label: "Codex",
          status: "completed",
          workspacePath: "/tmp/stave/candidate-b",
        },
      ],
    });

    expect(prompt).toContain('"candidateId": "A"');
    expect(prompt).toContain('"candidateId": "B"');
    expect(prompt).toContain('"rubricVersion": "1"');
    expect(prompt).not.toContain("private-variant");
    expect(prompt).not.toContain("claude-code");
    expect(prompt).not.toContain("claude-sonnet-5");
    expect(prompt).not.toContain("gpt-5.6-terra");
    expect(prompt).not.toContain('"label": "Claude"');
    expect(prompt).not.toContain('"label": "Codex"');
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
          status: "completed",
          variants: [
            {
              id: "variant-1",
              provider: "claude-code",
              status: "completed",
              workspaceId: "workspace-1",
              taskId: "task-1",
            },
            {
              id: "variant-2",
              provider: "codex",
              status: "completed",
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

  test("does not keep a candidate before its run finishes", async () => {
    useAppStore.setState({
      compareRunsById: {
        "run-1": {
          id: "run-1",
          seedPrompt: "Compare this",
          baseWorkspaceId: "base",
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
          ],
        },
      },
    });

    const result = await useAppStore.getState().keepCompareVariant({
      compareRunId: "run-1",
      variantId: "variant-1",
    });

    expect(result).toEqual({
      ok: false,
      message: "Wait until this candidate finishes before keeping it.",
    });
    expect(
      useAppStore.getState().compareRunsById["run-1"]?.keptVariantId,
    ).toBeUndefined();
  });

  test("does not keep a completed candidate while judging is active", async () => {
    useAppStore.setState({
      compareRunsById: {
        "run-judging": {
          id: "run-judging",
          seedPrompt: "Compare this",
          baseWorkspaceId: "base",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
          status: "completed",
          judge: {
            provider: "codex",
            status: "running",
            attempt: 1,
          },
          variants: [
            {
              id: "variant-1",
              provider: "codex",
              status: "completed",
              workspaceId: "workspace-1",
              taskId: "task-1",
            },
          ],
        },
      },
    });

    expect(
      await useAppStore.getState().keepCompareVariant({
        compareRunId: "run-judging",
        variantId: "variant-1",
      }),
    ).toEqual({
      ok: false,
      message: "Wait for the independent judge before keeping a result.",
    });
  });

  test("discards a completed review and closes every candidate workspace", async () => {
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
          status: "completed",
          variants: [
            {
              id: "variant-1",
              provider: "claude-code",
              status: "completed",
              workspaceId: "workspace-1",
              taskId: "task-1",
            },
            {
              id: "variant-2",
              provider: "codex",
              status: "completed",
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
