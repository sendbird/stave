import { createHash, randomUUID } from "node:crypto";
import {
  computeNextRoutineRunAt,
  normalizeRoutineState,
  pruneRoutineRuns,
  routineRuntimeToProviderOptions,
  RoutineUpsertInputSchema,
  type RoutineRun,
  type RoutineSnapshot,
  type RoutineSpec,
  type RoutineState,
  type RoutineUpsertInput,
} from "../../src/lib/routines";
import {
  buildWorkspaceInformationReferenceOptions,
  type WorkspaceInformationReferenceOption,
} from "../../src/lib/workspace-information-references";
import type { WorkspaceInformationState } from "../../src/lib/workspace-information";
import type { ProviderId } from "../../src/lib/providers/provider.types";

const ROUTINE_TICK_INTERVAL_MS = 5_000;
const ROUTINE_RESULT_PREVIEW_MAX_LENGTH = 1_000;
const ROUTINE_INTERRUPTED_MESSAGE =
  "Stave closed before this routine run completed.";

interface RoutinePersistence {
  loadRoutineState: () => RoutineState;
  saveRoutineState: (args: { state: RoutineState }) => void;
  loadRoutineProviderTimeoutMs: () => number | null;
  saveRoutineProviderTimeoutMs: (args: { providerTimeoutMs: number }) => void;
  completeTurn: (args: { id: string }) => void;
}

interface RoutineTaskRunResult {
  workspaceId: string;
  taskId: string;
  taskTitle: string;
  turnId: string;
  provider: ProviderId;
  model: string;
}

interface RoutineTaskStatusResult {
  workspaceId: string;
  taskId: string;
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnCompletedAt: string | null;
  latestTurnError: string | null;
  latestAssistantText: string | null;
  pendingApprovals: unknown[];
  pendingUserInputs: unknown[];
}

interface RoutineRuntimeDependencies {
  persistence: RoutinePersistence;
  runTask: (args: {
    workspaceId: string;
    prompt: string;
    title: string;
    provider: ProviderId;
    runtimeOptions: ReturnType<typeof routineRuntimeToProviderOptions>;
    informationReferences: RoutineUpsertInput["informationReferences"];
    controlMode: "interactive";
    controlOwner: "stave";
  }) => Promise<RoutineTaskRunResult>;
  getTaskStatus: (args: {
    workspaceId: string;
    taskId: string;
    turnId?: string;
  }) => Promise<RoutineTaskStatusResult>;
  getWorkspaceInformation: (args: { workspaceId: string }) => Promise<{
    workspaceId: string;
    workspaceInformation: WorkspaceInformationState;
  }>;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export interface RoutineRuntime {
  start: () => void;
  stop: () => void;
  list: () => Promise<RoutineSnapshot>;
  create: (input: RoutineUpsertInput) => Promise<RoutineSpec>;
  update: (args: {
    id: string;
    input: RoutineUpsertInput;
  }) => Promise<RoutineSpec>;
  remove: (args: { id: string }) => Promise<{ ok: true; id: string }>;
  setEnabled: (args: { id: string; enabled: boolean }) => Promise<RoutineSpec>;
  setProviderTimeoutMs: (args: { providerTimeoutMs: number }) => void;
  runNow: (args: { id: string }) => Promise<RoutineRun>;
  listInformationReferences: (args: {
    workspaceId: string;
  }) => Promise<WorkspaceInformationReferenceOption[]>;
}

function toSnapshot(state: RoutineState): RoutineSnapshot {
  return {
    routines: [...state.routines].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
    runs: [...state.runs].sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt),
    ),
  };
}

function truncateResultPreview(value: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.length <= ROUTINE_RESULT_PREVIEW_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, ROUTINE_RESULT_PREVIEW_MAX_LENGTH - 1)}…`;
}

function countActiveRuns(state: RoutineState, routineId: string) {
  return state.runs.filter(
    (run) =>
      run.routineId === routineId &&
      (run.status === "running" || run.status === "waiting"),
  ).length;
}

function serializeConfigValue(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeConfigValue).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeConfigValue(record[key])}`)
    .join(",")}}`;
}

function createAutomationConfigHash(routine: RoutineSpec) {
  const executionConfig = {
    environment: routine.environment,
    informationReferences: routine.informationReferences,
    maxConcurrentRuns: routine.maxConcurrentRuns,
    prompt: routine.prompt,
    runtime: routine.runtime,
    schedule: routine.schedule,
    trustPolicy: routine.trustPolicy,
  };
  return createHash("sha256")
    .update(serializeConfigValue(executionConfig))
    .digest("hex")
    .slice(0, 16);
}

function automationRuntimeToProviderOptions(routine: RoutineSpec) {
  const options = routineRuntimeToProviderOptions(routine.runtime);
  if (routine.trustPolicy === "workspace-trusted") {
    return options;
  }
  if (routine.runtime.provider === "codex") {
    return {
      ...options,
      ...(routine.trustPolicy === "unattended"
        ? { codexAutoApproveStaveLocalMcpTools: true }
        : {}),
      codexApprovalPolicy:
        routine.trustPolicy === "unattended" ? "never" : "untrusted",
    } as const;
  }
  return {
    ...options,
    claudePermissionMode:
      routine.trustPolicy === "unattended" ? "dontAsk" : "default",
    claudeAllowUnsandboxedCommands:
      routine.trustPolicy === "unattended"
        ? options.claudeAllowUnsandboxedCommands
        : false,
    claudeAllowDangerouslySkipPermissions: false,
  } as const;
}

function normalizeProviderTimeoutMs(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 86_400_000
    ? value
    : null;
}

function buildRoutineTaskTitle(args: { routine: RoutineSpec; now: Date }) {
  const timestamp = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(args.now);
  return `${args.routine.name} · ${timestamp}`;
}

export function createRoutineRuntime(
  dependencies: RoutineRuntimeDependencies,
): RoutineRuntime {
  const now = dependencies.now ?? (() => new Date());
  const setIntervalImpl = dependencies.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl =
    dependencies.clearInterval ?? globalThis.clearInterval;
  let intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  let operationChain = Promise.resolve();
  let providerTimeoutMs = normalizeProviderTimeoutMs(
    dependencies.persistence.loadRoutineProviderTimeoutMs(),
  );

  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = operationChain.then(operation, operation);
    operationChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  function loadState() {
    return normalizeRoutineState(dependencies.persistence.loadRoutineState());
  }

  function saveState(state: RoutineState) {
    const normalized = normalizeRoutineState({
      ...state,
      runs: pruneRoutineRuns(state.runs),
    });
    dependencies.persistence.saveRoutineState({ state: normalized });
    return normalized;
  }

  async function startRoutineRun(args: {
    state: RoutineState;
    routine: RoutineSpec;
    trigger: RoutineRun["trigger"];
    scheduledFor: string | null;
  }) {
    const startedAtDate = now();
    const startedAt = startedAtDate.toISOString();
    const nextRunAt = !args.routine.enabled
      ? null
      : args.trigger === "scheduled" ||
          !args.routine.nextRunAt ||
          Date.parse(args.routine.nextRunAt) <= startedAtDate.getTime()
        ? computeNextRoutineRunAt({
            schedule: args.routine.schedule,
            after: startedAtDate,
          })
        : args.routine.nextRunAt;
    const run: RoutineRun = {
      id: randomUUID(),
      routineId: args.routine.id,
      workspaceId: args.routine.environment.workspaceId,
      projectPath: args.routine.environment.projectPath,
      taskId: null,
      turnId: null,
      status: "running",
      trigger: args.trigger,
      scheduledFor: args.scheduledFor,
      startedAt,
      completedAt: null,
      resultPreview: null,
      error: null,
      configHash: createAutomationConfigHash(args.routine),
      trustPolicy: args.routine.trustPolicy,
    };
    let state = saveState({
      ...args.state,
      routines: args.state.routines.map((routine) =>
        routine.id === args.routine.id
          ? {
              ...routine,
              lastRunAt: startedAt,
              nextRunAt,
            }
          : routine,
      ),
      runs: [run, ...args.state.runs],
    });

    try {
      const taskRun = await dependencies.runTask({
        workspaceId: args.routine.environment.workspaceId,
        prompt: args.routine.prompt,
        title: buildRoutineTaskTitle({
          routine: args.routine,
          now: startedAtDate,
        }),
        provider: args.routine.runtime.provider,
        runtimeOptions: {
          ...automationRuntimeToProviderOptions(args.routine),
          ...(providerTimeoutMs ? { providerTimeoutMs } : {}),
        },
        informationReferences: args.routine.informationReferences,
        controlMode: "interactive",
        controlOwner: "stave",
      });
      const nextRun: RoutineRun = {
        ...run,
        taskId: taskRun.taskId,
        turnId: taskRun.turnId,
      };
      state = saveState({
        ...state,
        runs: state.runs.map((candidate) =>
          candidate.id === run.id ? nextRun : candidate,
        ),
      });
      return {
        state,
        run: nextRun,
      };
    } catch (error) {
      const failedRun: RoutineRun = {
        ...run,
        status: "failed",
        completedAt: now().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Failed to start routine run.",
      };
      state = saveState({
        ...state,
        runs: state.runs.map((candidate) =>
          candidate.id === run.id ? failedRun : candidate,
        ),
      });
      return {
        state,
        run: failedRun,
      };
    }
  }

  async function reconcileRuns(state: RoutineState) {
    let nextState = state;
    for (const run of state.runs) {
      if (
        (run.status !== "running" && run.status !== "waiting") ||
        !run.taskId
      ) {
        continue;
      }
      try {
        const status = await dependencies.getTaskStatus({
          workspaceId: run.workspaceId,
          taskId: run.taskId,
          turnId: run.turnId ?? undefined,
        });
        let nextRun = run;
        if (status.latestTurnCompletedAt) {
          nextRun = status.latestTurnError
            ? {
                ...run,
                status: "failed",
                completedAt: status.latestTurnCompletedAt,
                resultPreview: truncateResultPreview(
                  status.latestAssistantText,
                ),
                error: status.latestTurnError,
              }
            : {
                ...run,
                status: "completed",
                completedAt: status.latestTurnCompletedAt,
                resultPreview: truncateResultPreview(
                  status.latestAssistantText,
                ),
                error: null,
              };
        } else if (
          status.pendingApprovals.length > 0 ||
          status.pendingUserInputs.length > 0
        ) {
          nextRun = {
            ...run,
            status: "waiting",
            resultPreview: truncateResultPreview(status.latestAssistantText),
          };
        } else if (run.status !== "running") {
          nextRun = {
            ...run,
            status: "running",
          };
        }
        if (nextRun !== run) {
          nextState = {
            ...nextState,
            runs: nextState.runs.map((candidate) =>
              candidate.id === run.id ? nextRun : candidate,
            ),
          };
        }
      } catch (error) {
        const failedRun: RoutineRun = {
          ...run,
          status: "failed",
          completedAt: now().toISOString(),
          error:
            error instanceof Error
              ? error.message
              : "Failed to read routine task status.",
        };
        nextState = {
          ...nextState,
          runs: nextState.runs.map((candidate) =>
            candidate.id === run.id ? failedRun : candidate,
          ),
        };
      }
    }
    return nextState;
  }

  async function tick() {
    const loadedState = loadState();
    let state = await reconcileRuns(loadedState);
    if (state !== loadedState) {
      state = saveState(state);
    }
    const tickNow = now();
    const dueRoutines = state.routines.filter(
      (routine) =>
        routine.enabled &&
        routine.nextRunAt !== null &&
        Date.parse(routine.nextRunAt) <= tickNow.getTime(),
    );

    for (const routine of dueRoutines) {
      const latestRoutine =
        state.routines.find((candidate) => candidate.id === routine.id) ??
        routine;
      if (
        countActiveRuns(state, routine.id) >= latestRoutine.maxConcurrentRuns
      ) {
        const skippedRun: RoutineRun = {
          id: randomUUID(),
          routineId: routine.id,
          workspaceId: routine.environment.workspaceId,
          projectPath: routine.environment.projectPath,
          taskId: null,
          turnId: null,
          status: "skipped",
          trigger: "scheduled",
          scheduledFor: routine.nextRunAt,
          startedAt: tickNow.toISOString(),
          completedAt: tickNow.toISOString(),
          resultPreview: null,
          error: `Skipped because the automation reached its concurrency limit (${latestRoutine.maxConcurrentRuns}).`,
          configHash: createAutomationConfigHash(latestRoutine),
          trustPolicy: latestRoutine.trustPolicy,
        };
        state = saveState({
          ...state,
          routines: state.routines.map((candidate) =>
            candidate.id === routine.id
              ? {
                  ...candidate,
                  nextRunAt: computeNextRoutineRunAt({
                    schedule: candidate.schedule,
                    after: tickNow,
                  }),
                }
              : candidate,
          ),
          runs: [skippedRun, ...state.runs],
        });
        continue;
      }
      const started = await startRoutineRun({
        state,
        routine: latestRoutine,
        trigger: "scheduled",
        scheduledFor: routine.nextRunAt,
      });
      state = started.state;
    }
  }

  function start() {
    if (intervalHandle) {
      return;
    }
    const state = loadState();
    const interruptedRunIds = new Set<string>();
    for (const run of state.runs) {
      if (run.status !== "running" && run.status !== "waiting") {
        continue;
      }
      interruptedRunIds.add(run.id);
      if (run.turnId) {
        dependencies.persistence.completeTurn({ id: run.turnId });
      }
    }
    if (interruptedRunIds.size > 0) {
      const interruptedAt = now().toISOString();
      saveState({
        ...state,
        runs: state.runs.map((run) =>
          interruptedRunIds.has(run.id)
            ? {
                ...run,
                status: "failed",
                completedAt: interruptedAt,
                error: ROUTINE_INTERRUPTED_MESSAGE,
              }
            : run,
        ),
      });
    }
    const enqueueTick = () => {
      void enqueue(tick).catch((error) => {
        console.error("[routines] scheduler tick failed", error);
      });
    };
    intervalHandle = setIntervalImpl(enqueueTick, ROUTINE_TICK_INTERVAL_MS);
    enqueueTick();
  }

  function stop() {
    if (!intervalHandle) {
      return;
    }
    clearIntervalImpl(intervalHandle);
    intervalHandle = null;
  }

  return {
    start,
    stop,
    list: () => enqueue(() => toSnapshot(loadState())),
    create: (rawInput) =>
      enqueue(async () => {
        const input = RoutineUpsertInputSchema.parse(rawInput);
        const createdAt = now();
        const routine: RoutineSpec = {
          ...input,
          id: randomUUID(),
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
          lastRunAt: null,
          nextRunAt: input.enabled
            ? computeNextRoutineRunAt({
                schedule: input.schedule,
                after: createdAt,
              })
            : null,
        };
        const state = loadState();
        saveState({
          ...state,
          routines: [routine, ...state.routines],
        });
        return routine;
      }),
    update: ({ id, input: rawInput }) =>
      enqueue(async () => {
        const input = RoutineUpsertInputSchema.parse(rawInput);
        const state = loadState();
        const current = state.routines.find((routine) => routine.id === id);
        if (!current) {
          throw new Error(`Routine not found: ${id}`);
        }
        const updatedAt = now();
        const routine: RoutineSpec = {
          ...input,
          id,
          createdAt: current.createdAt,
          updatedAt: updatedAt.toISOString(),
          lastRunAt: current.lastRunAt,
          nextRunAt: input.enabled
            ? computeNextRoutineRunAt({
                schedule: input.schedule,
                after: updatedAt,
              })
            : null,
        };
        saveState({
          ...state,
          routines: state.routines.map((candidate) =>
            candidate.id === id ? routine : candidate,
          ),
        });
        return routine;
      }),
    remove: ({ id }) =>
      enqueue(() => {
        const state = loadState();
        if (!state.routines.some((routine) => routine.id === id)) {
          throw new Error(`Routine not found: ${id}`);
        }
        if (countActiveRuns(state, id) > 0) {
          throw new Error(
            "Wait for the active run before deleting this routine.",
          );
        }
        saveState({
          ...state,
          routines: state.routines.filter((routine) => routine.id !== id),
          runs: state.runs.filter((run) => run.routineId !== id),
        });
        return { ok: true as const, id };
      }),
    setEnabled: ({ id, enabled }) =>
      enqueue(() => {
        const state = loadState();
        const current = state.routines.find((routine) => routine.id === id);
        if (!current) {
          throw new Error(`Routine not found: ${id}`);
        }
        const updatedAt = now();
        const routine: RoutineSpec = {
          ...current,
          enabled,
          updatedAt: updatedAt.toISOString(),
          nextRunAt: enabled
            ? computeNextRoutineRunAt({
                schedule: current.schedule,
                after: updatedAt,
              })
            : null,
        };
        saveState({
          ...state,
          routines: state.routines.map((candidate) =>
            candidate.id === id ? routine : candidate,
          ),
        });
        return routine;
      }),
    setProviderTimeoutMs: ({ providerTimeoutMs: nextProviderTimeoutMs }) => {
      const normalized = normalizeProviderTimeoutMs(nextProviderTimeoutMs);
      if (!normalized) {
        throw new Error("Invalid provider timeout.");
      }
      providerTimeoutMs = normalized;
      dependencies.persistence.saveRoutineProviderTimeoutMs({
        providerTimeoutMs,
      });
    },
    runNow: ({ id }) =>
      enqueue(async () => {
        const state = loadState();
        const routine = state.routines.find((candidate) => candidate.id === id);
        if (!routine) {
          throw new Error(`Routine not found: ${id}`);
        }
        if (countActiveRuns(state, id) >= routine.maxConcurrentRuns) {
          throw new Error(
            `This automation reached its concurrency limit (${routine.maxConcurrentRuns}).`,
          );
        }
        const started = await startRoutineRun({
          state,
          routine,
          trigger: "manual",
          scheduledFor: null,
        });
        return started.run;
      }),
    listInformationReferences: ({ workspaceId }) =>
      enqueue(async () => {
        const result = await dependencies.getWorkspaceInformation({
          workspaceId,
        });
        return buildWorkspaceInformationReferenceOptions(
          result.workspaceInformation,
        ).filter((option) => option.reference.section !== "lens");
      }),
  };
}
