import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { finishCompareRunsForTask } from "../src/lib/compare-runs";
import {
  buildCompareJudgePrompt,
  buildCompareJudgeRuntimeOptions,
  COMPARE_JUDGE_MAX_ATTEMPTS,
  launchReadyCompareJudges,
  retryCompareJudge,
} from "../src/store/compare-run-judge";
import type {
  SecondaryRunAggregate,
  SecondaryRunClaimArgs,
} from "../src/lib/runs/secondary-run";
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

function buildSecondaryAggregate(args: {
  claim: SecondaryRunClaimArgs;
  status: SecondaryRunAggregate["step"]["status"];
  executionId?: string;
}): SecondaryRunAggregate {
  const executionId = args.executionId ?? "judge-execution-1";
  const completed =
    args.status === "completed" ||
    args.status === "failed" ||
    args.status === "cancelled";
  return {
    run: {
      ...args.claim.run,
      status: args.status,
      createdAt: "2026-06-18T00:03:00.000Z",
      updatedAt: "2026-06-18T00:03:00.000Z",
      completedAt: completed ? "2026-06-18T00:03:00.000Z" : null,
      error: null,
    },
    step: {
      id: args.claim.step.id,
      runId: args.claim.run.id,
      kind: args.claim.step.kind,
      dependencyIds: args.claim.step.dependencyIds,
      status: args.status,
      attempt: 1,
      executionId,
      claimIdempotencyKey: args.claim.step.idempotencyKey,
      inputHash: "a".repeat(64),
      resultArtifactRef:
        args.status === "completed"
          ? `compare-run:${args.claim.run.origin.id}:judge-result`
          : null,
      createdAt: "2026-06-18T00:03:00.000Z",
      updatedAt: "2026-06-18T00:03:00.000Z",
      startedAt: "2026-06-18T00:03:00.000Z",
      completedAt: completed ? "2026-06-18T00:03:00.000Z" : null,
      error: null,
    },
  };
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

  test("carries each candidate effort into its task runtime overrides", async () => {
    const runtimeOverridePatches: Array<{
      taskId: string;
      runtimeOverrides: unknown;
    }> = [];
    let workspaceIndex = 0;

    useAppStore.setState({
      createWorkspace: async (args) => {
        workspaceIndex += 1;
        const workspaceId = `workspace-${workspaceIndex}`;
        const taskId = `task-${workspaceIndex}`;
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
          tasks: [buildTask({ id: taskId, title: `Task ${workspaceIndex}` })],
          taskWorkspaceIdById: {
            ...state.taskWorkspaceIdById,
            [taskId]: workspaceId,
          },
        }));
        return { ok: true };
      },
      setTaskProvider: () => {},
      updatePromptDraft: ({ taskId, patch }) => {
        runtimeOverridePatches.push({
          taskId,
          runtimeOverrides: patch.runtimeOverrides,
        });
      },
      sendUserMessage: async (args) => ({
        status: "started",
        taskId: args.taskId,
        workspaceId: "workspace-1",
        turnId: "turn-1",
      }),
    });

    const result = await useAppStore.getState().startCompareRun({
      seedPrompt: "Compare with explicit effort",
      variants: [
        {
          provider: "claude-code",
          model: "claude-sonnet-5",
          effort: "max",
          label: "A",
        },
        {
          provider: "codex",
          model: "gpt-5.6-luna",
          // Luna rejects "ultra"; the run must step it down, not send it.
          effort: "ultra",
          label: "B",
        },
      ],
      judge: { provider: "codex", model: "gpt-5.6-luna", effort: "ultra" },
    });

    expect(result.ok).toBe(true);
    expect(runtimeOverridePatches).toEqual([
      {
        taskId: "task-1",
        runtimeOverrides: { model: "claude-sonnet-5", claudeEffort: "max" },
      },
      {
        taskId: "task-2",
        runtimeOverrides: {
          model: "gpt-5.6-luna",
          codexReasoningEffort: "max",
        },
      },
    ]);
    expect(
      useAppStore.getState().compareRunsById[result.compareRunId ?? ""]?.judge
        ?.effort,
    ).toBe("max");
  });

  test("applies the judge effort to its runtime options", () => {
    expect(
      buildCompareJudgeRuntimeOptions({
        provider: "codex",
        model: "gpt-5.6-sol",
        effort: "ultra",
        settings: useAppStore.getState().settings,
      }).codexReasoningEffort,
    ).toBe("ultra");

    expect(
      buildCompareJudgeRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-5",
        effort: "max",
        settings: useAppStore.getState().settings,
      }).claudeEffort,
    ).toBe("max");
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
    let judgeRequest: SecondaryRunClaimArgs | undefined;
    const judgmentText = `<stave_compare_judgment>
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
    </stave_compare_judgment>`;
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
        claimSecondary: async (request) => {
          judgeRequest = request;
          return {
            accepted: true,
            started: true,
            duplicate: false,
            reason: null,
            aggregate: buildSecondaryAggregate({
              claim: request,
              status: "running",
            }),
          };
        },
        executeSecondary: async () => ({
          accepted: true,
          reason: null,
          execution: {
            executionId: "judge-execution-1",
            providerId: "codex",
            model: "gpt-5.6-sol",
            status: "completed",
            text: judgmentText,
            eventCount: 2,
            collectedEventCount: 2,
            outputBytes: judgmentText.length,
            truncated: false,
            stopReason: "end_turn",
            error: null,
          },
          aggregate: buildSecondaryAggregate({
            claim: judgeRequest!,
            status: "waiting",
          }),
        }),
        completeSecondary: async () => ({
          accepted: true,
          started: false,
          duplicate: false,
          reason: null,
          aggregate: buildSecondaryAggregate({
            claim: judgeRequest!,
            status: "completed",
          }),
        }),
        failSecondary: async () => {
          throw new Error("unexpected judge failure");
        },
        cancelSecondary: async () => {
          throw new Error("unexpected judge cancellation");
        },
      },
      now: () => "2026-06-18T00:03:00.000Z",
    });

    expect(judgeRequest?.input.cwd).toBe("/tmp/stave");
    expect(judgeRequest?.input).toMatchObject({
      providerId: "codex",
      model: "gpt-5.6-sol",
      runtimeHints: {},
    });
    expect(judgeRequest?.run).toMatchObject({
      id: "compare:run-judge:judge",
      origin: { kind: "compare-run", id: "run-judge" },
      ownership: {
        projectPath: "/tmp/stave",
        workspaceId: "base",
      },
      policy: {
        maxAttempts: COMPARE_JUDGE_MAX_ATTEMPTS,
        maxTurns: 16,
      },
    });
    expect(judgeRequest?.input.prompt).toContain(
      "This is a fresh, read-only evaluation.",
    );
    expect(judgeRequest?.input.prompt).toContain("/tmp/stave/compare-a");
    expect(judgeRequest?.input.prompt).toContain('"candidateId": "A"');
    expect(judgeRequest?.input.prompt).toContain('"candidateId": "B"');
    expect(judgeRequest?.input.prompt).not.toContain("variant-a");
    expect(judgeRequest?.input.prompt).not.toContain("variant-b");
    expect(judgeRequest?.input.prompt).not.toContain("claude-code");
    expect(judgeRequest?.input.prompt).not.toContain("claude-sonnet-5");
    expect(judgeRequest?.input.prompt).not.toContain("gpt-5.6-terra");
    expect(judgeRequest?.input.prompt).not.toContain('"label": "Claude"');
    expect(judgeRequest?.input.prompt).not.toContain('"label": "Codex"');
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

  test("retries the same durable judge step with the next deterministic claim key", async () => {
    let retryClaim: SecondaryRunClaimArgs | undefined;
    const judgmentText = `<stave_compare_judgment>
      {
        "recommendedCandidateId": "A",
        "confidence": "medium",
        "rationale": "Candidate A is safer.",
        "candidateScores": [
          {"candidateId":"A","score":8,"summary":"Safer.","strengths":[],"risks":[],"criteria":[]},
          {"candidateId":"B","score":7,"summary":"Riskier.","strengths":[],"risks":[],"criteria":[]}
        ]
      }
    </stave_compare_judgment>`;
    useAppStore.setState({
      compareRunsById: {
        "run-retry": {
          id: "run-retry",
          seedPrompt: "Choose safely",
          baseWorkspaceId: "base",
          baseTaskId: "base-task",
          baseBranch: "main",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
          status: "completed",
          judge: {
            provider: "codex",
            model: "gpt-5.6-sol",
            status: "failed",
            attempt: 1,
            error: "Previous attempt failed.",
          },
          variants: [
            {
              id: "variant-a",
              provider: "codex",
              status: "completed",
              workspacePath: "/tmp/stave/compare-a",
            },
            {
              id: "variant-b",
              provider: "codex",
              status: "completed",
              workspacePath: "/tmp/stave/compare-b",
            },
          ],
        },
      },
    });

    await retryCompareJudge({
      compareRunId: "run-retry",
      access: {
        getState: () => useAppStore.getState(),
        updateRuns: (updater) =>
          useAppStore.setState((state) => ({
            compareRunsById: updater(state.compareRunsById),
          })),
        bridge: {
          checkAvailability: async () => ({ ok: true, available: true }),
          claimSecondary: async (request) => {
            retryClaim = request;
            return {
              accepted: true,
              started: true,
              duplicate: false,
              reason: null,
              aggregate: buildSecondaryAggregate({
                claim: request,
                status: "running",
              }),
            };
          },
          executeSecondary: async () => ({
            accepted: true,
            reason: null,
            execution: {
              executionId: "judge-execution-1",
              providerId: "codex",
              model: "gpt-5.6-sol",
              status: "completed",
              text: judgmentText,
              eventCount: 2,
              collectedEventCount: 2,
              outputBytes: judgmentText.length,
              truncated: false,
              stopReason: "end_turn",
              error: null,
            },
            aggregate: buildSecondaryAggregate({
              claim: retryClaim!,
              status: "waiting",
            }),
          }),
          completeSecondary: async () => ({
            accepted: true,
            started: false,
            duplicate: false,
            reason: null,
            aggregate: buildSecondaryAggregate({
              claim: retryClaim!,
              status: "completed",
            }),
          }),
          failSecondary: async () => {
            throw new Error("unexpected retry failure");
          },
          cancelSecondary: async () => {
            throw new Error("unexpected retry cancellation");
          },
        },
        now: () => "2026-06-18T00:04:00.000Z",
      },
    });

    expect(retryClaim?.run.id).toBe("compare:run-retry:judge");
    expect(retryClaim?.step.id).toBe("compare:run-retry:judge:step");
    expect(retryClaim?.step.idempotencyKey).toBe(
      "compare:run-retry:judge:step:attempt:2",
    );
    const judge =
      useAppStore.getState().compareRunsById["run-retry"]?.judge;
    expect(judge?.status).toBe("completed");
    expect(judge?.attempt).toBe(2);
    expect(judge?.judgment?.provenance?.attempt).toBe(2);
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

  test("cancels the durable judge before closing candidate workspaces", async () => {
    const order: string[] = [];
    let cancellation:
      | {
          runId: string;
          stepId: string;
          idempotencyKey: string;
        }
      | undefined;
    (globalThis as { window: { api: Record<string, unknown> } }).window.api = {
      runs: {
        cancelSecondary: async (args: {
          runId: string;
          stepId: string;
          idempotencyKey: string;
        }) => {
          cancellation = args;
          order.push(
            `cancel:${useAppStore.getState().compareRunsById["run-cancel"]?.status}`,
          );
          return {
            accepted: true,
            started: false,
            duplicate: false,
            reason: null,
            aggregate: null,
          };
        },
      },
    };
    useAppStore.setState({
      compareRunsById: {
        "run-cancel": {
          id: "run-cancel",
          seedPrompt: "Compare this",
          baseWorkspaceId: "base",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
          status: "completed",
          judge: {
            provider: "codex",
            status: "running",
            attempt: 2,
            requestId: "execution-2",
          },
          variants: [
            {
              id: "variant-1",
              provider: "claude-code",
              status: "completed",
              workspaceId: "workspace-1",
            },
            {
              id: "variant-2",
              provider: "codex",
              status: "completed",
              workspaceId: "workspace-2",
            },
          ],
        },
      },
      closeWorkspace: async ({ workspaceId }) => {
        order.push(`close:${workspaceId}`);
      },
    });

    const result = await useAppStore
      .getState()
      .cancelCompareRun({ compareRunId: "run-cancel" });

    expect(result.ok).toBe(true);
    expect(cancellation).toEqual({
      runId: "compare:run-cancel:judge",
      stepId: "compare:run-cancel:judge:step",
      idempotencyKey: "compare:run-cancel:judge:step:cancel:2",
    });
    expect(order).toEqual([
      "cancel:cancelled",
      "close:workspace-1",
      "close:workspace-2",
    ]);
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
