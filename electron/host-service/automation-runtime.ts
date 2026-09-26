import { createHash, randomUUID } from "node:crypto";
import {
  computeNextAutomationRunAt,
  normalizeAutomationState,
  pruneAutomationRuns,
  automationRuntimeToProviderOptions,
  AutomationUpsertInputSchema,
  type AutomationRun,
  type AutomationSnapshot,
  type AutomationSpec,
  type AutomationState,
  type AutomationUpsertInput,
} from "../../src/lib/automations";
import {
  buildWorkspaceInformationReferenceOptions,
  type WorkspaceInformationReferenceOption,
} from "../../src/lib/workspace-information-references";
import type { WorkspaceInformationState } from "../../src/lib/workspace-information";
import type { ProviderId } from "../../src/lib/providers/provider.types";

const AUTOMATION_TICK_INTERVAL_MS = 5_000;
const AUTOMATION_RESULT_PREVIEW_MAX_LENGTH = 1_000;
const AUTOMATION_INTERRUPTED_MESSAGE =
  "Stave closed before this automation run completed.";

interface AutomationPersistence {
  loadAutomationState: () => AutomationState;
  saveAutomationState: (args: { state: AutomationState }) => void;
  loadAutomationProviderTimeoutMs: () => number | null;
  saveAutomationProviderTimeoutMs: (args: { providerTimeoutMs: number }) => void;
  completeTurn: (args: { id: string }) => void;
}

interface AutomationTaskRunResult {
  workspaceId: string;
  taskId: string;
  taskTitle: string;
  turnId: string;
  provider: ProviderId;
  model: string;
}

interface AutomationTaskStatusResult {
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

interface AutomationRuntimeDependencies {
  persistence: AutomationPersistence;
  runTask: (args: {
    workspaceId: string;
    prompt: string;
    title: string;
    provider: ProviderId;
    runtimeOptions: ReturnType<typeof automationRuntimeToProviderOptions>;
    unattendedAutomation?: {
      authorizationToken: string;
    };
    informationReferences: AutomationUpsertInput["informationReferences"];
    controlMode: "interactive";
    controlOwner: "stave";
  }) => Promise<AutomationTaskRunResult>;
  getTaskStatus: (args: {
    workspaceId: string;
    taskId: string;
    turnId?: string;
  }) => Promise<AutomationTaskStatusResult>;
  getWorkspaceInformation: (args: { workspaceId: string }) => Promise<{
    workspaceId: string;
    workspaceInformation: WorkspaceInformationState;
  }>;
  emitUnattendedAutomationsChanged?: (args: {
    authorizations: Array<{
      workspaceId: string;
      authorizationToken: string;
    }>;
  }) => void;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export interface AutomationRuntime {
  start: () => void;
  stop: () => void;
  list: () => Promise<AutomationSnapshot>;
  create: (input: AutomationUpsertInput) => Promise<AutomationSpec>;
  update: (args: {
    id: string;
    input: AutomationUpsertInput;
  }) => Promise<AutomationSpec>;
  remove: (args: { id: string }) => Promise<{ ok: true; id: string }>;
  setEnabled: (args: { id: string; enabled: boolean }) => Promise<AutomationSpec>;
  setProviderTimeoutMs: (args: { providerTimeoutMs: number }) => void;
  runNow: (args: { id: string }) => Promise<AutomationRun>;
  listInformationReferences: (args: {
    workspaceId: string;
  }) => Promise<WorkspaceInformationReferenceOption[]>;
}

function toSnapshot(state: AutomationState): AutomationSnapshot {
  return {
    automations: [...state.automations].sort((left, right) =>
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
  if (normalized.length <= AUTOMATION_RESULT_PREVIEW_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, AUTOMATION_RESULT_PREVIEW_MAX_LENGTH - 1)}…`;
}

function countActiveRuns(state: AutomationState, automationId: string) {
  return state.runs.filter(
    (run) =>
      run.automationId === automationId &&
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

function createAutomationConfigHash(automation: AutomationSpec) {
  const executionConfig = {
    environment: automation.environment,
    informationReferences: automation.informationReferences,
    maxConcurrentRuns: automation.maxConcurrentRuns,
    prompt: automation.prompt,
    runtime: automation.runtime,
    schedule: automation.schedule,
    trustPolicy: automation.trustPolicy,
  };
  return createHash("sha256")
    .update(serializeConfigValue(executionConfig))
    .digest("hex")
    .slice(0, 16);
}

function automationSpecToProviderOptions(automation: AutomationSpec) {
  const options = automationRuntimeToProviderOptions(automation.runtime);
  if (automation.trustPolicy === "workspace-trusted") {
    return options;
  }
  if (automation.runtime.provider === "codex") {
    return {
      ...options,
      ...(automation.trustPolicy === "unattended"
        ? { codexAutoApproveStaveLocalMcpTools: true }
        : {}),
      codexApprovalPolicy:
        automation.trustPolicy === "unattended" ? "never" : "untrusted",
    } as const;
  }
  // A scheduled run has nobody to answer an approval prompt, so an unattended
  // Claude run gets a real bypass. `dontAsk` used to be wired here, but that
  // mode *denies* every tool outside the Stave Local MCP allowlist, which broke
  // Bash, file edits, and third-party MCP servers without ever surfacing why.
  if (automation.trustPolicy === "unattended") {
    return {
      ...options,
      claudePermissionMode: "bypassPermissions",
      claudeAllowUnsandboxedCommands: options.claudeAllowUnsandboxedCommands,
      claudeAllowDangerouslySkipPermissions: true,
    } as const;
  }
  return {
    ...options,
    claudePermissionMode: "default",
    claudeAllowUnsandboxedCommands: false,
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

function buildAutomationTaskTitle(args: { automation: AutomationSpec; now: Date }) {
  const timestamp = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(args.now);
  return `${args.automation.name} · ${timestamp}`;
}

export function createAutomationRuntime(
  dependencies: AutomationRuntimeDependencies,
): AutomationRuntime {
  const now = dependencies.now ?? (() => new Date());
  const setIntervalImpl = dependencies.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl =
    dependencies.clearInterval ?? globalThis.clearInterval;
  let intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  let lastUnattendedAuthorizationKey: string | null = null;
  const unattendedAuthorizationByRunId = new Map<
    string,
    { workspaceId: string; authorizationToken: string }
  >();
  let operationChain = Promise.resolve();
  let queuedTick: Promise<void> | null = null;
  let schedulerGeneration = 0;
  let providerTimeoutMs = normalizeProviderTimeoutMs(
    dependencies.persistence.loadAutomationProviderTimeoutMs(),
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
    return normalizeAutomationState(dependencies.persistence.loadAutomationState());
  }

  function saveState(state: AutomationState) {
    const normalized = normalizeAutomationState({
      ...state,
      runs: pruneAutomationRuns(state.runs),
    });
    dependencies.persistence.saveAutomationState({ state: normalized });
    const activeRunIds = new Set(
      normalized.runs
        .filter((run) => run.status === "running" || run.status === "waiting")
        .map((run) => run.id),
    );
    for (const runId of unattendedAuthorizationByRunId.keys()) {
      if (!activeRunIds.has(runId)) {
        unattendedAuthorizationByRunId.delete(runId);
      }
    }
    publishUnattendedAutomations(normalized);
    return normalized;
  }

  function publishUnattendedAutomations(state: AutomationState) {
    const emit = dependencies.emitUnattendedAutomationsChanged;
    if (!emit) {
      return;
    }
    const authorizations = state.runs
      .filter(
        (run) =>
          run.trustPolicy === "unattended" &&
          (run.status === "running" || run.status === "waiting"),
      )
      .flatMap((run) => {
        const authorization = unattendedAuthorizationByRunId.get(run.id);
        return authorization ? [authorization] : [];
      })
      .sort(
        (left, right) =>
          left.workspaceId.localeCompare(right.workspaceId) ||
          left.authorizationToken.localeCompare(right.authorizationToken),
      );
    const serialized = JSON.stringify(authorizations);
    if (serialized === lastUnattendedAuthorizationKey) {
      return;
    }
    lastUnattendedAuthorizationKey = serialized;
    emit({ authorizations });
  }

  async function startAutomationRun(args: {
    state: AutomationState;
    automation: AutomationSpec;
    trigger: AutomationRun["trigger"];
    scheduledFor: string | null;
  }) {
    const startedAtDate = now();
    const startedAt = startedAtDate.toISOString();
    const nextRunAt = !args.automation.enabled
      ? null
      : args.trigger === "scheduled" ||
          !args.automation.nextRunAt ||
          Date.parse(args.automation.nextRunAt) <= startedAtDate.getTime()
        ? computeNextAutomationRunAt({
            schedule: args.automation.schedule,
            after: startedAtDate,
          })
        : args.automation.nextRunAt;
    const run: AutomationRun = {
      id: randomUUID(),
      automationId: args.automation.id,
      workspaceId: args.automation.environment.workspaceId,
      repositoryPath: args.automation.environment.repositoryPath,
      taskId: null,
      turnId: null,
      status: "running",
      trigger: args.trigger,
      scheduledFor: args.scheduledFor,
      startedAt,
      completedAt: null,
      resultPreview: null,
      error: null,
      configHash: createAutomationConfigHash(args.automation),
      trustPolicy: args.automation.trustPolicy,
    };
    const unattendedAutomation =
      args.automation.trustPolicy === "unattended"
        ? { authorizationToken: randomUUID() }
        : undefined;
    if (unattendedAutomation) {
      unattendedAuthorizationByRunId.set(run.id, {
        workspaceId: run.workspaceId,
        authorizationToken: unattendedAutomation.authorizationToken,
      });
    }
    let state = saveState({
      ...args.state,
      automations: args.state.automations.map((automation) =>
        automation.id === args.automation.id
          ? {
              ...automation,
              lastRunAt: startedAt,
              nextRunAt,
            }
          : automation,
      ),
      runs: [run, ...args.state.runs],
    });

    try {
      const taskRun = await dependencies.runTask({
        workspaceId: args.automation.environment.workspaceId,
        prompt: args.automation.prompt,
        title: buildAutomationTaskTitle({
          automation: args.automation,
          now: startedAtDate,
        }),
        provider: args.automation.runtime.provider,
        runtimeOptions: {
          ...automationSpecToProviderOptions(args.automation),
          ...(providerTimeoutMs ? { providerTimeoutMs } : {}),
        },
        ...(unattendedAutomation ? { unattendedAutomation } : {}),
        informationReferences: args.automation.informationReferences,
        controlMode: "interactive",
        controlOwner: "stave",
      });
      const nextRun: AutomationRun = {
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
      const failedRun: AutomationRun = {
        ...run,
        status: "failed",
        completedAt: now().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Failed to start automation run.",
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

  async function reconcileRuns(state: AutomationState) {
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
        const failedRun: AutomationRun = {
          ...run,
          status: "failed",
          completedAt: now().toISOString(),
          error:
            error instanceof Error
              ? error.message
              : "Failed to read automation task status.",
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

  async function tick(generation: number) {
    if (generation !== schedulerGeneration) return;
    const loadedState = loadState();
    let state = await reconcileRuns(loadedState);
    if (generation !== schedulerGeneration) return;
    if (state !== loadedState) {
      state = saveState(state);
    }
    const tickNow = now();
    const dueAutomations = state.automations.filter(
      (automation) =>
        automation.enabled &&
        automation.nextRunAt !== null &&
        Date.parse(automation.nextRunAt) <= tickNow.getTime(),
    );

    for (const automation of dueAutomations) {
      if (generation !== schedulerGeneration) return;
      const latestAutomation =
        state.automations.find((candidate) => candidate.id === automation.id) ??
        automation;
      if (
        countActiveRuns(state, automation.id) >= latestAutomation.maxConcurrentRuns
      ) {
        const skippedRun: AutomationRun = {
          id: randomUUID(),
          automationId: automation.id,
          workspaceId: automation.environment.workspaceId,
          repositoryPath: automation.environment.repositoryPath,
          taskId: null,
          turnId: null,
          status: "skipped",
          trigger: "scheduled",
          scheduledFor: automation.nextRunAt,
          startedAt: tickNow.toISOString(),
          completedAt: tickNow.toISOString(),
          resultPreview: null,
          error: `Skipped because the automation reached its concurrency limit (${latestAutomation.maxConcurrentRuns}).`,
          configHash: createAutomationConfigHash(latestAutomation),
          trustPolicy: latestAutomation.trustPolicy,
        };
        state = saveState({
          ...state,
          automations: state.automations.map((candidate) =>
            candidate.id === automation.id
              ? {
                  ...candidate,
                  nextRunAt: computeNextAutomationRunAt({
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
      const started = await startAutomationRun({
        state,
        automation: latestAutomation,
        trigger: "scheduled",
        scheduledFor: automation.nextRunAt,
      });
      state = started.state;
    }
  }

  function start() {
    if (intervalHandle) {
      return;
    }
    const generation = ++schedulerGeneration;
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
                error: AUTOMATION_INTERRUPTED_MESSAGE,
              }
            : run,
        ),
      });
    } else {
      // Nothing was interrupted, so no save happened. Still announce the empty
      // set so main starts from a known state instead of a stale one.
      publishUnattendedAutomations(state);
    }
    const enqueueTick = () => {
      if (queuedTick) return queuedTick;
      queuedTick = enqueue(() => tick(generation)).catch((error) => {
        console.error("[automations] scheduler tick failed", error);
      }).finally(() => {
        queuedTick = null;
      });
      return queuedTick;
    };
    intervalHandle = setIntervalImpl(enqueueTick, AUTOMATION_TICK_INTERVAL_MS);
    enqueueTick();
  }

  function stop() {
    schedulerGeneration += 1;
    if (intervalHandle) {
      clearIntervalImpl(intervalHandle);
      intervalHandle = null;
    }
    unattendedAuthorizationByRunId.clear();
    publishUnattendedAutomations(loadState());
  }

  return {
    start,
    stop,
    // Read the last committed state while execution is waiting on a provider.
    // A snapshot is not a barrier for the mutation queue.
    list: async () => toSnapshot(loadState()),
    create: (rawInput) =>
      enqueue(async () => {
        const input = AutomationUpsertInputSchema.parse(rawInput);
        const createdAt = now();
        const automation: AutomationSpec = {
          ...input,
          id: randomUUID(),
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
          lastRunAt: null,
          nextRunAt: input.enabled
            ? computeNextAutomationRunAt({
                schedule: input.schedule,
                after: createdAt,
              })
            : null,
        };
        const state = loadState();
        saveState({
          ...state,
          automations: [automation, ...state.automations],
        });
        return automation;
      }),
    update: ({ id, input: rawInput }) =>
      enqueue(async () => {
        const input = AutomationUpsertInputSchema.parse(rawInput);
        const state = loadState();
        const current = state.automations.find((automation) => automation.id === id);
        if (!current) {
          throw new Error(`Automation not found: ${id}`);
        }
        const updatedAt = now();
        const automation: AutomationSpec = {
          ...input,
          id,
          createdAt: current.createdAt,
          updatedAt: updatedAt.toISOString(),
          lastRunAt: current.lastRunAt,
          nextRunAt: input.enabled
            ? computeNextAutomationRunAt({
                schedule: input.schedule,
                after: updatedAt,
              })
            : null,
        };
        saveState({
          ...state,
          automations: state.automations.map((candidate) =>
            candidate.id === id ? automation : candidate,
          ),
        });
        return automation;
      }),
    remove: ({ id }) =>
      enqueue(() => {
        const state = loadState();
        if (!state.automations.some((automation) => automation.id === id)) {
          throw new Error(`Automation not found: ${id}`);
        }
        if (countActiveRuns(state, id) > 0) {
          throw new Error(
            "Wait for the active run before deleting this automation.",
          );
        }
        saveState({
          ...state,
          automations: state.automations.filter((automation) => automation.id !== id),
          runs: state.runs.filter((run) => run.automationId !== id),
        });
        return { ok: true as const, id };
      }),
    setEnabled: ({ id, enabled }) =>
      enqueue(() => {
        const state = loadState();
        const current = state.automations.find((automation) => automation.id === id);
        if (!current) {
          throw new Error(`Automation not found: ${id}`);
        }
        const updatedAt = now();
        const automation: AutomationSpec = {
          ...current,
          enabled,
          updatedAt: updatedAt.toISOString(),
          nextRunAt: enabled
            ? computeNextAutomationRunAt({
                schedule: current.schedule,
                after: updatedAt,
              })
            : null,
        };
        saveState({
          ...state,
          automations: state.automations.map((candidate) =>
            candidate.id === id ? automation : candidate,
          ),
        });
        return automation;
      }),
    setProviderTimeoutMs: ({ providerTimeoutMs: nextProviderTimeoutMs }) => {
      const normalized = normalizeProviderTimeoutMs(nextProviderTimeoutMs);
      if (!normalized) {
        throw new Error("Invalid provider timeout.");
      }
      providerTimeoutMs = normalized;
      dependencies.persistence.saveAutomationProviderTimeoutMs({
        providerTimeoutMs,
      });
    },
    runNow: ({ id }) =>
      enqueue(async () => {
        const state = loadState();
        const automation = state.automations.find((candidate) => candidate.id === id);
        if (!automation) {
          throw new Error(`Automation not found: ${id}`);
        }
        if (countActiveRuns(state, id) >= automation.maxConcurrentRuns) {
          throw new Error(
            `This automation reached its concurrency limit (${automation.maxConcurrentRuns}).`,
          );
        }
        const started = await startAutomationRun({
          state,
          automation,
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
        ).filter(
          (option) =>
            option.reference.section !== "lens" &&
            option.reference.section !== "web",
        );
      }),
  };
}
