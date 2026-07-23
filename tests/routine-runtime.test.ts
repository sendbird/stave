import { describe, expect, test } from "bun:test";
import { createRoutineRuntime } from "../electron/host-service/routine-runtime";
import {
  createDefaultRoutineRuntime,
  createEmptyRoutineState,
  type RoutineState,
  type RoutineUpsertInput,
} from "@/lib/routines";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";

function createInput(
  overrides: Partial<RoutineUpsertInput> = {},
): RoutineUpsertInput {
  return {
    name: "Repository review",
    prompt: "Review the repository and summarize risks.",
    enabled: false,
    schedule: { every: 1, unit: "hours" },
    environment: {
      kind: "workspace",
      workspaceId: "ws-1",
      path: "/tmp/project",
      projectPath: "/tmp/project",
      label: "Project · Default Workspace",
    },
    runtime: createDefaultRoutineRuntime("codex"),
    informationReferences: [],
    ...overrides,
  };
}

function createHarness(args?: {
  initialState?: RoutineState;
  initialNow?: string;
}) {
  let state = structuredClone(
    args?.initialState ?? createEmptyRoutineState(),
  );
  let currentNow = new Date(
    args?.initialNow ?? "2026-07-23T00:00:00.000Z",
  );
  let intervalCallback: (() => void) | null = null;
  const completedTurnIds: string[] = [];
  const runTaskCalls: unknown[] = [];
  const taskStatusCalls: unknown[] = [];
  let taskStatus = {
    workspaceId: "ws-1",
    taskId: "task-1",
    activeTurnId: "turn-1" as string | null,
    latestTurnId: "turn-1" as string | null,
    latestTurnCompletedAt: null as string | null,
    latestTurnError: null as string | null,
    latestAssistantText: null as string | null,
    pendingApprovals: [] as unknown[],
    pendingUserInputs: [] as unknown[],
  };

  const runtime = createRoutineRuntime({
    persistence: {
      loadRoutineState: () => structuredClone(state),
      saveRoutineState: ({ state: nextState }) => {
        state = structuredClone(nextState);
      },
      completeTurn: ({ id }) => {
        completedTurnIds.push(id);
      },
    },
    runTask: async (runArgs) => {
      runTaskCalls.push(runArgs);
      return {
        workspaceId: runArgs.workspaceId,
        taskId: "task-1",
        taskTitle: runArgs.title,
        turnId: "turn-1",
        provider: runArgs.provider,
        model: runArgs.runtimeOptions.model ?? "unknown",
      };
    },
    getTaskStatus: async (statusArgs) => {
      taskStatusCalls.push(statusArgs);
      return taskStatus;
    },
    registerProject: async ({ projectPath }) => ({
      defaultWorkspaceId: `folder:${projectPath}`,
    }),
    getWorkspaceInformation: async ({ workspaceId }) => ({
      workspaceId,
      workspaceInformation: {
        ...createEmptyWorkspaceInformation(),
        notes: "Keep the run read-only.",
      },
    }),
    now: () => new Date(currentNow),
    setInterval: ((callback: () => void) => {
      intervalCallback = callback;
      return 1;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => {
      intervalCallback = null;
    }) as typeof globalThis.clearInterval,
  });

  return {
    runtime,
    getState: () => state,
    getRunTaskCalls: () => runTaskCalls,
    getTaskStatusCalls: () => taskStatusCalls,
    getCompletedTurnIds: () => completedTurnIds,
    setNow: (value: string) => {
      currentNow = new Date(value);
    },
    setTaskStatus: (patch: Partial<typeof taskStatus>) => {
      taskStatus = { ...taskStatus, ...patch };
    },
    tick: async () => {
      intervalCallback?.();
      await runtime.list();
    },
  };
}

describe("routine host runtime", () => {
  test("registers arbitrary folders and persists their normalized workspace", async () => {
    const harness = createHarness();
    const routine = await harness.runtime.create(
      createInput({
        environment: {
          kind: "folder",
          workspaceId: null,
          path: "/tmp/reports",
          projectPath: "/tmp/reports",
          label: "reports",
        },
      }),
    );

    expect(routine.environment).toEqual({
      kind: "folder",
      workspaceId: "folder:/tmp/reports",
      path: "/tmp/reports",
      projectPath: "/tmp/reports",
      label: "reports",
    });
  });

  test("runs each occurrence as a user-owned task and captures its result", async () => {
    const harness = createHarness();
    harness.runtime.start();
    const routine = await harness.runtime.create(createInput());
    const run = await harness.runtime.runNow({ id: routine.id });

    expect(run).toMatchObject({
      routineId: routine.id,
      projectPath: "/tmp/project",
      taskId: "task-1",
      turnId: "turn-1",
      status: "running",
      trigger: "manual",
    });
    expect(harness.getRunTaskCalls()[0]).toMatchObject({
      workspaceId: "ws-1",
      controlMode: "interactive",
      controlOwner: "stave",
    });

    harness.setTaskStatus({
      activeTurnId: null,
      latestTurnCompletedAt: "2026-07-23T00:02:00.000Z",
      latestAssistantText: "No blocking risks found.",
    });
    await harness.tick();

    expect(harness.getState().runs[0]).toMatchObject({
      status: "completed",
      completedAt: "2026-07-23T00:02:00.000Z",
      resultPreview: "No blocking risks found.",
    });
    expect(harness.getTaskStatusCalls().at(-1)).toMatchObject({
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: "turn-1",
    });
    harness.runtime.stop();
  });

  test("keeps each run linked to the environment where it started", async () => {
    const harness = createHarness();
    const routine = await harness.runtime.create(createInput());
    const run = await harness.runtime.runNow({ id: routine.id });

    await harness.runtime.update({
      id: routine.id,
      input: createInput({
        environment: {
          kind: "workspace",
          workspaceId: "ws-2",
          path: "/tmp/other/worktree",
          projectPath: "/tmp/other",
          label: "Other · Feature",
        },
      }),
    });

    expect(run.projectPath).toBe("/tmp/project");
    expect(harness.getState().runs[0]?.projectPath).toBe("/tmp/project");
    expect(harness.getState().routines[0]?.environment.projectPath).toBe(
      "/tmp/other",
    );
  });

  test("marks a completed provider turn with a terminal error as failed", async () => {
    const harness = createHarness();
    harness.runtime.start();
    const routine = await harness.runtime.create(createInput());
    await harness.runtime.runNow({ id: routine.id });

    harness.setTaskStatus({
      activeTurnId: null,
      latestTurnCompletedAt: "2026-07-23T00:02:00.000Z",
      latestTurnError: "Provider authentication failed.",
      latestAssistantText: "Unable to start the requested model.",
    });
    await harness.tick();

    expect(harness.getState().runs[0]).toMatchObject({
      status: "failed",
      completedAt: "2026-07-23T00:02:00.000Z",
      error: "Provider authentication failed.",
    });
    harness.runtime.stop();
  });

  test("does not delete a routine while one of its runs is active", async () => {
    const harness = createHarness();
    const routine = await harness.runtime.create(createInput());
    await harness.runtime.runNow({ id: routine.id });

    await expect(
      harness.runtime.remove({ id: routine.id }),
    ).rejects.toThrow("Wait for the active run");
  });

  test("runs a missed due routine once and advances from the current time", async () => {
    const harness = createHarness();
    harness.runtime.start();
    const routine = await harness.runtime.create(
      createInput({
        enabled: true,
        schedule: { every: 1, unit: "minutes" },
      }),
    );

    expect(routine.nextRunAt).toBe("2026-07-23T00:01:00.000Z");
    harness.setNow("2026-07-23T04:00:00.000Z");
    await harness.tick();

    const next = harness
      .getState()
      .routines.find((candidate) => candidate.id === routine.id);
    expect(harness.getRunTaskCalls()).toHaveLength(1);
    expect(next?.nextRunAt).toBe("2026-07-23T04:01:00.000Z");
    harness.runtime.stop();
  });

  test("keeps the existing cadence when a future run is started manually", async () => {
    const harness = createHarness();
    const routine = await harness.runtime.create(
      createInput({
        enabled: true,
        schedule: { every: 1, unit: "hours" },
      }),
    );
    expect(routine.nextRunAt).toBe("2026-07-23T01:00:00.000Z");

    harness.setNow("2026-07-23T00:30:00.000Z");
    await harness.runtime.runNow({ id: routine.id });

    expect(harness.getState().routines[0]?.nextRunAt).toBe(
      "2026-07-23T01:00:00.000Z",
    );
  });

  test("records and advances an overlapping scheduled occurrence", async () => {
    const harness = createHarness();
    harness.runtime.start();
    const routine = await harness.runtime.create(
      createInput({
        enabled: true,
        schedule: { every: 1, unit: "minutes" },
      }),
    );
    await harness.runtime.runNow({ id: routine.id });

    harness.setNow("2026-07-23T00:01:00.000Z");
    await harness.tick();

    expect(harness.getState().runs).toHaveLength(2);
    expect(harness.getState().runs[0]).toMatchObject({
      routineId: routine.id,
      status: "skipped",
      error: "Skipped because the previous routine run is still active.",
    });
    expect(harness.getState().routines[0]?.nextRunAt).toBe(
      "2026-07-23T00:02:00.000Z",
    );
    harness.runtime.stop();
  });

  test("marks in-flight runs interrupted when the host restarts", async () => {
    const initialState = createEmptyRoutineState();
    initialState.runs.push({
      id: "run-1",
      routineId: "routine-1",
      workspaceId: "ws-1",
      projectPath: "/tmp/project",
      taskId: "task-1",
      turnId: "turn-1",
      status: "running",
      trigger: "scheduled",
      scheduledFor: "2026-07-22T23:00:00.000Z",
      startedAt: "2026-07-22T23:00:00.000Z",
      completedAt: null,
      resultPreview: null,
      error: null,
    });
    const harness = createHarness({ initialState });

    harness.runtime.start();
    await harness.runtime.list();

    expect(harness.getState().runs[0]).toMatchObject({
      status: "failed",
      error: "Stave closed before this routine run completed.",
    });
    expect(harness.getCompletedTurnIds()).toEqual(["turn-1"]);
    harness.runtime.stop();
  });

  test("lists Information references but excludes live Lens state", async () => {
    const harness = createHarness();
    const options = await harness.runtime.listInformationReferences({
      workspaceId: "ws-1",
    });

    expect(options.some((option) => option.reference.token === "@info:notes")).toBe(
      true,
    );
    expect(options.some((option) => option.reference.token === "@lens")).toBe(
      false,
    );
  });
});
