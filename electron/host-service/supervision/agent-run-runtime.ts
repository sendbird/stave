/**
 * Supervisor: runs agent runs. Each tick it reads the lead task, asks the pure
 * policy (`src/lib/agent-runs/policy.ts`) what to do, records the result, and
 * performs the I/O the decision names: start a stage turn, send the one
 * reminder, or run a Stave action.
 *
 * Used by: `electron/host-service.ts` (constructs it, starts and stops it,
 * dispatches `agent-run.invoke` actions to it, and forwards finished turns).
 *
 * Beside the wake-up runtime and bound by the same rules:
 * - a user's turn always wins; the agent run idles while any turn runs
 * - approvals and questions wait in the task; the agent run waits with them
 * - identity or runtime drift pauses; an archived task, the turn cap or
 *   expiry stops, always with a reason
 * - every turn start is recorded before it happens, keyed, so a restart
 *   reports an interrupted start instead of replaying it
 *
 * A stage completes only through a recorded stage report or a Stave action
 * result. Reports arrive through the stage-reporting tools, which name the
 * stage by the turn's agent run grant, never by ids from the model.
 */
import { readAdaptiveObservations } from "../../providers/adaptive-observations";
import { resolveAccountUsageBlock } from "../../../src/lib/providers/account-usage-block";
import { AdaptiveRunPolicySchema, AgentResourceRequestSchema, AgentResourceRequestObjectSchema, constrainHelperResources, supportsAdaptiveEffort, type AdaptiveRunPolicy, type AdaptiveRoutingIntent, type ResourceLink } from "../../../src/lib/agent-runs/resources";
import { selectAdaptiveRoute } from "../../../src/lib/agent-runs/adaptive-route";
import { randomUUID } from "node:crypto";
import { prepareRunTurn } from "./turn-preparation";
import { DelegatedAgentRunAuthoritySchema, type DelegatedAgentRunAuthority, type DelegatedAgentRunRead } from "../../../src/lib/agent-runs/delegated-run";
import { buildDelegatedTaskRuntimeOptions } from "../../../src/lib/runs/delegated-task-runtime";
import { isReadOnlyDelegationPolicy } from "../../../src/lib/runs/delegation-policy";
import type { AgentAssignment } from "../../../src/lib/agents/assign";
import { ZodError } from "zod";
import { validateFleetQueueAction } from "../../../src/lib/fleet/control-plane";
import type {
  AgentRunChangedEvent,
  AgentRunDetail,
  AgentRunIdArgs,
  AgentRunInvokeResult,
  AgentRunListArgs,
  AgentRunNoteUserTurnArgs,
  AgentRunRequestChangesArgs,
  AgentRunStageRef,
} from "../../../src/lib/agent-runs/api";
import {
  AGENT_RUN_CONTEXT_SOURCE_ID,
  buildAgentRunBriefing,
  buildAgentRunTurnContextPart,
  buildStageNudgePrompt,
  compileAgentRunStagePrompt,
  describeAgentRunExecutionContext,
  agentRunPermissionRuntimeOptions,
  type AgentRunBriefing,
  type AgentRunTurnReason,
} from "../../../src/lib/agent-runs/briefing";
import {
  acceptAgentRunRuntime,
  cancelAgentRun,
  pauseAgentRun,
  recordStageReport,
  requestStageChanges,
  resumeAgentRun,
  retryStage,
  signOffStage,
  skipStage,
} from "../../../src/lib/agent-runs/commands";
import {
  buildAgentRunTurnKey,
  buildAgentRunTurnOutcomeKey,
  createAgentRun,
  currentStageRecord,
  EMPTY_STAGE_FACTS,
  formatAgentRunFingerprint,
  AGENT_RUN_LIMITS,
  isActiveAgentRunState,
  AgentRunCommandError,
  AgentRunStartInputSchema,
  workflowStageAt,
  StageBlockInputSchema,
  StageCompleteReportInputSchema,
  type AgentRun,
  type AgentRunAggregate,
  type AgentRunStageIdentity,
  type AgentRunChange,
  type AgentRunEvent,
  type AgentRunEventDraft,
  type AgentRunFingerprint,
  type AgentRunStageRecord,
  type AgentRunStartInput,
  type StageFacts,
} from "../../../src/lib/agent-runs/domain";
import {
  applyAgentRunDecision,
  decideAgentRunAction,
  type ActionOutcome,
  type AgentRunDecision,
  type AgentRunObservation,
  type ObservedTurn,
} from "../../../src/lib/agent-runs/policy";
import {
  buildAgentRunReport,
  computeAgentRunMetrics,
  type AgentRunReport,
  type AgentRunWorkspaceState,
} from "../../../src/lib/agent-runs/report";
import {
  buildShareReportPrompt,
  formatAgentRunReportMarkdown,
  mergeReportIntoPullRequestBody,
  SLACK_THREAD_URL,
} from "../../../src/lib/agent-runs/report-markdown";
import { sumTurnUsage, type AgentRunUsage, type TurnUsageSample } from "../../../src/lib/agent-runs/usage";
import { AgentRunRouteSelectionSchema, projectAgentRunRoutes, type AgentRunRouteSelection, type AgentRunRouteTurnFacts } from "../../../src/lib/agent-runs/route-observation";
import { aggregateAgentRunInsights, countRunEvents, type AgentRunInsights } from "../../../src/lib/agent-runs/insights";
import { agentRunEndCause, extractRunAssignment, hasAgentOrigin } from "../../../src/lib/agent-runs/agent-run";
import type { CanonicalRetrievedContextPart, ProviderRuntimeOptions } from "../../../src/lib/providers/provider.types";
import type { AgentRunPromptProvenance } from "../../../src/types/chat";
import type { AgentRunStore } from "../../persistence/agent-run-store";
import type { AgentRunStageGrant } from "../../providers/agent-run-grants";
import type { TaskSupervisionSnapshot } from "../local-mcp-runtime";
import type { HostAgentRunAction } from "../protocol";

/** Faster than wake-ups: an agent run is actively waiting on its own turns. */
const AGENT_RUN_TICK_INTERVAL_MS = 5_000;
/** Decisions that need no I/O chain within one tick, up to this bound. */
const MAX_DECISIONS_PER_EVALUATION = 8;
const RECENT_TURN_LIMIT = 20;
const DETAIL_EVENT_LIMIT = 200;

const NO_ACTIVE_GRANT =
  "No run stage is active in this turn. Only a turn a run started can report a stage.";
const EMPTY_WORKSPACE_STATE: AgentRunWorkspaceState = {
  branch: null,
  branchPushed: false,
  openPullRequest: null,
};

type AgentRunStorePort = Pick<
  AgentRunStore,
  | "create"
  | "apply"
  | "recordEvent"
  | "getAggregate"
  | "getActiveAgentRunForTask"
  | "listActiveAgentRuns"
  | "listAgentRunsForWorkspace"
  | "listRecentAgentRuns"
  | "listRecentEvents"
  | "listEventsByKind"
> & Partial<Pick<AgentRunStore, "resourceConfig" | "readResources" | "reserveChildResources" | "consumeResourceTurn" | "releaseResourceReservation">>;

export interface AgentRunTurnRow {
  id: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AgentRunRuntimeDependencies {
  store: AgentRunStorePort;
  freezeResources?: (args: { run: AgentRun; authority?: DelegatedAgentRunAuthority; routingIntent?: AdaptiveRoutingIntent }) => AdaptiveRunPolicy;
  stopResourceTask?: (args: { workspaceId: string; taskId: string }) => Promise<unknown>;
  resourceExecutionLive?: (childRunId: string, executionId: string) => boolean;
  delegatedAssignment?: (taskId: string) => AgentAssignment | null;
  delegatedExecutionCurrent?: (agentRunId: string, taskId: string, authority: DelegatedAgentRunAuthority) => boolean;
  /** Agent names by id, so a stage another agent does can name it. */
  agentNames?: () => Readonly<Record<string, string>>;
  getTaskSupervisionSnapshot: (args: {
    workspaceId: string;
    taskId: string;
  }) => Promise<TaskSupervisionSnapshot>;
  /** The lead task's turns, newest first, straight from the turns table. */
  listRecentTurns: (args: {
    workspaceId: string;
    taskId: string;
    limit: number;
  }) => AgentRunTurnRow[];
  runSupervisedTurn: (args: {
    workspaceId: string;
    taskId: string;
    parentTaskId?: string;
    prompt: string;
    fingerprint: AgentRunFingerprint;
    runtimeOptions: ProviderRuntimeOptions;
    retrievedContextParts: CanonicalRetrievedContextPart[];
    /** Absent for a turn a Stave action asked for: it reports no stage. */
    agentRunStage?: AgentRunStageRef;
    /** On every turn of an agent run: marks the user row so it renders as the assignment. */
    agentRunPrompt?: AgentRunPromptProvenance;
  }) => Promise<{ turnId: string }>;
  /**
   * The user's own provider permission settings, for turns no consent sets:
   * an agent run on "Your settings" (`manual`) and the report-sharing turn.
   * Absent: those turns pass no permissions (tests and headless callers).
   */
  userPermissionOptions?: (providerId: AgentRunFingerprint["providerId"]) => ProviderRuntimeOptions | undefined;
  /** Closes a turn left open by a stopped host; true when it was open. */
  completeInterruptedTurn: (turnId: string) => boolean;
  countActiveDelegatedTasks: (taskId: string) => number;
  /** Whether the Local MCP server the model reports through is up. */
  isReportingAvailable: (options?: { fresh?: boolean }) => Promise<boolean>;
  resolveAgentRunGrant: (agentRunKey: string) => AgentRunStageGrant | null;
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
  readHeadSha: (cwd: string) => Promise<string | null>;
  readWorkspaceRevision?: (cwd: string) => Promise<import("../../../src/lib/agent-runs/verification-contract").WorkspaceRevision>;
  collectStageFacts: (args: {
    workspaceId: string;
    taskId: string;
    cwd: string | null;
    startHeadSha: string | null;
    turnIds: ReadonlySet<string>;
    currentTurnId?: string;
  }) => Promise<StageFacts>;
  /** What an agent run that ended short of its goal left behind. */
  readWorkspaceState?: (cwd: string | null) => Promise<AgentRunWorkspaceState>;
  /**
   * Runs the current Stave action stage. Absent until Stave actions are
   * wired, in which case an action stage blocks with a sentence.
   */
  performAction?: (args: { aggregate: AgentRunAggregate; signal?: AbortSignal }) => Promise<ActionOutcome>;
  /**
   * Updates the workspace's pull request body with `merge(currentBody)`. Used
   * only for the explicit "Add to PR description" action.
   */
  updatePullRequestBody?: (args: {
    cwd: string;
    merge: (body: string) => string;
  }) => Promise<{ ok: true; url: string } | { ok: false; detail: string }>;
  /** Tells the user about a turn the agent run could not start. Never throws. */
  notifyAgentRunProblem?: (args: { agentRun: AgentRun; detail: string }) => Promise<void> | void;
  /**
   * A turn's provider-reported usage and whether it has ended; null for an
   * unknown turn. Absent: agent runs show no spend.
   */
  readTurnUsage?: (args: {
    workspaceId: string;
    taskId: string;
    turnId: string;
  }) => { completed: boolean; usage: TurnUsageSample | null } | null;
  /**
   * Routes a turn of an agent run (`origin: "agent"`): the runtime and effort
   * it starts with, through Stave Auto and the task's pin or agent model.
   * Absent or null: the agent run's fingerprint, as for a legacy run.
   */
  routeAgentTurn?: (args: { agentRun: AgentRun; prompt: string; signal?: AbortSignal }) => Promise<AgentRunTurnRoute | null>;
  /** Whether the task still runs as an agent. An agent run ends once it does not. Absent: it does. */
  taskRunsAsAgent?: (taskId: string) => boolean;
  /** How a turn ended. An agent run ends when the user stopped its turn. Absent: never read. */
  readTurnEnding?: (turnId: string) => "completed" | "stopped" | "failed";
  /** Persisted terminal evidence only; absent events stay unknown without affecting supervision. */
  readObservedTurnEnding?: (turnId: string) => AgentRunRouteTurnFacts["ending"];
  emitChanged?: (event: AgentRunChangedEvent) => void;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

/** The runtime one agent-run turn starts on, and why. */
export interface AgentRunTurnRoute {
  fingerprint: AgentRunFingerprint;
  runtimeOptions: ProviderRuntimeOptions;
  route: string;
  rationale: string;
  selection?: AgentRunRouteSelection | null;
}

export interface AgentRunReportReceipt {
  recorded: true;
  stage: string;
  revision: number;
  note: string;
}

export interface AgentRunRuntime {
  reserveChildResources: (args: { parentTaskId: string; childRunId: string; executionId: string; requestedTurns: number; expectedRootRunId?: string; providerId?: "claude-code" | "codex"; model?: string }) => { policy: AdaptiveRunPolicy; link: ResourceLink; capacity: number } | null;
  releaseChildResources: (link: ResourceLink) => void;
  requestResources: (args: { agentRunKey: string; request: unknown }) => Promise<{ recorded: true }>;
  start: () => void;
  stop: () => void;
  /**
   * Evaluates active agent runs now instead of at the next interval. Resolves
   * when that tick has run; a tick already queued is shared.
   */
  requestTick: () => Promise<void>;
  /** Forwarded when a host-run turn finishes, so the agent run reacts at once. */
  notifyTaskTurnFinished: (args: { taskId: string }) => void;
  prepareUserTurn: (args: { taskId: string; workspaceId?: string; turnId: string; providerId?: string }) => { agentRunStage: AgentRunStageIdentity; context: CanonicalRetrievedContextPart; runtimeOptions?: ProviderRuntimeOptions; runtimeOptionsMode?: "routing" | "delegation" } | null;
  resourceRootForTask: (taskId: string) => string | null;
  getActiveAgentRunForTask: (taskId: string) => AgentRun | null;
  readDelegatedAgentRun: (args: AgentRunIdArgs) => Promise<DelegatedAgentRunRead>;
  /**
   * Ends the task's active agent run because the agent it ran as was released
   * or replaced. True when a run ended. A legacy run is left alone.
   */
  endAgentRunForTask: (args: { taskId: string; delegatedOnly?: boolean }) => Promise<boolean>;
  startAgentRun: (input: AgentRunStartInput) => Promise<AgentRunDetail>;
  prepareDelegatedAgentRun: (args: { agentRunId: string; model: string; input: AgentRunStartInput; authority: DelegatedAgentRunAuthority; resourceLink?: ResourceLink }) => Promise<AgentRunDetail>;
  isDelegatedExecutionCurrent: (agentRunId: string, taskId: string, authority: DelegatedAgentRunAuthority) => boolean;
  activateDelegatedAgentRun: (args: { agentRunId: string; executionId: string }) => Promise<AgentRunDetail>;
  isDelegatedAgentRunActivated: (agentRunId: string) => boolean;
  list: (args?: AgentRunListArgs) => Promise<{ agentRuns: AgentRun[] }>;
  get: (args: AgentRunIdArgs) => Promise<AgentRunDetail>;
  /** What the agent run's turns spent; null for an unknown agent run or no usage reader. */
  readUsage: (args: AgentRunIdArgs) => AgentRunUsage | null;
  /** How agent runs that ended in the last `days` went, per workflow and provider. */
  getInsights: (args?: { days?: number }) => Promise<AgentRunInsights>;
  signOff: (args: AgentRunStageRef) => Promise<AgentRunDetail>;
  requestChanges: (args: AgentRunRequestChangesArgs) => Promise<AgentRunDetail>;
  reply: (args: AgentRunRequestChangesArgs) => Promise<AgentRunDetail>;
  skipStage: (args: AgentRunStageRef) => Promise<AgentRunDetail>;
  retryStage: (args: AgentRunStageRef) => Promise<AgentRunDetail>;
  pause: (args: AgentRunIdArgs) => Promise<AgentRunDetail>;
  resume: (args: AgentRunIdArgs) => Promise<AgentRunDetail>;
  takeOver: (args: AgentRunIdArgs) => Promise<AgentRunDetail>;
  acceptRuntime: (args: AgentRunIdArgs) => Promise<AgentRunDetail>;
  noteUserTurn: (args: AgentRunNoteUserTurnArgs) => Promise<AgentRunDetail>;
  cancel: (args: AgentRunIdArgs) => Promise<AgentRunDetail>;
  /** Adds the ended agent run's report to its pull request body. */
  addReportToPullRequest: (args: AgentRunIdArgs) => Promise<{ prUrl: string }>;
  /** Posts the ended agent run's report to a Slack thread through a turn on its lead task. */
  shareReport: (args: { agentRunId: string; threadUrl: string }) => Promise<{ shared: true }>;
  getForGrant: (args: { agentRunKey: string }) => Promise<AgentRunBriefing>;
  reportStage: (args: { agentRunKey: string; report: unknown }) => Promise<AgentRunReportReceipt>;
  blockStage: (args: { agentRunKey: string; block: unknown }) => Promise<AgentRunReportReceipt>;
}

function refuse(message: string): never {
  throw new AgentRunCommandError("refused", message);
}

function stageKey(record: Pick<AgentRunStageRecord, "agentRunId" | "stageId" | "attempt">) {
  return `${record.agentRunId}:${record.stageId}:${record.attempt}`;
}

function hasEffect(change: AgentRunChange, aggregate: AgentRunAggregate) {
  return (
    change.upserts.length > 0 ||
    change.events.length > 0 ||
    change.agentRun !== aggregate.agentRun
  );
}

function describeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function createAgentRunRuntime(deps: AgentRunRuntimeDependencies): AgentRunRuntime {
  const now = deps.now ?? (() => new Date());
  const setIntervalImpl = deps.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl = deps.clearInterval ?? globalThis.clearInterval;
  const { store } = deps;
  let intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  let operationChain = Promise.resolve();
  let queuedTick: Promise<void> | null = null;
  /** Turns this runtime started, per agent run; hydrated from `turn-linked`. */
  const agentRunTurnIds = new Map<string, Set<string>>();
  /** Agent run turns Stave stopped in the middle of; hydrated from `turn-interrupted`. */
  const interruptedTurnIds = new Map<string, Set<string>>();
  /** User turns already recorded as replies, per agent run; hydrated from `user-turn`. */
  const userTurnIds = new Map<string, Set<string>>();
  /** The composer choice for the user's running turn, per agent run. */
  const userTurnIntents = new Map<string, AgentRunNoteUserTurnArgs["intent"]>();
  /** The last ended turn whose facts were collected, per stage attempt. */
  const factsCollectedThrough = new Map<string, string>();
  /** What a Stave action produced, per stage attempt. */
  const actionOutcomes = new Map<string, ActionOutcome>();
  const actionControllers = new Map<string, { key: string; controller: AbortController }>();
  const preparationControllers = new Map<string, AbortController>();

  function requireInitialEffortSupport(policy: AdaptiveRunPolicy) {
    const observed = policy.accountProfileId ? readAdaptiveObservations(policy.providerId, policy.accountProfileId, now().getTime()) : null;
    if (!supportsAdaptiveEffort(policy.providerId, policy.allowedModels[0]!, policy.initialEffort, observed?.catalog?.catalog.ok ? observed.catalog.catalog.models : null))
      refuse("The cached model catalog does not support this Run's effort. Choose a supported effort before starting.");
  }

  /**
   * Every tick and command runs in this one chain, as in the wake-up runtime:
   * two ticks never interleave, and a report never lands between a tick's
   * read and its write.
   */
  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = operationChain.then(operation, operation);
    operationChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  function emit(agentRun: AgentRun) {
    try {
      deps.emitChanged?.({
        agentRunId: agentRun.id,
        workspaceId: agentRun.workspaceId,
        leadTaskId: agentRun.leadTaskId,
        state: agentRun.state,
        currentStageIndex: agentRun.currentStageIndex,
        updatedAt: agentRun.updatedAt,
      });
    } catch (error) {
      console.warn("[agent-runs] failed to announce a run change", error);
    }
  }

  function requireAggregate(agentRunId: string): AgentRunAggregate {
    const aggregate = store.getAggregate(agentRunId);
    if (!aggregate) throw new AgentRunCommandError("not-active", `Run not found: ${agentRunId}`);
    return aggregate;
  }

  function delegatedAuthority(agentRun: AgentRun): DelegatedAgentRunAuthority | null {
    const started = store.listEventsByKind(agentRun.id, ["agent-run-started"])[0];
    if (!started || !("delegation" in started.detail)) return null;
    // Invalid persisted authority fails closed; it must not become primary user permissions.
    return DelegatedAgentRunAuthoritySchema.parse(started.detail.delegation);
  }

  function requireDelegatedAssignment(agentRun: Pick<AgentRun, "leadTaskId" | "workspaceId">, authority: DelegatedAgentRunAuthority) {
    const assignment = deps.delegatedAssignment?.(agentRun.leadTaskId);
    if (!assignment || assignment.role !== "delegate" || assignment.taskId !== agentRun.leadTaskId ||
        assignment.workspaceId !== agentRun.workspaceId || assignment.agentConfigId !== authority.agentConfigId ||
        assignment.agentContentHash !== authority.agentContentHash || assignment.requestId !== `delegated:${authority.executionId}`)
      refuse("The frozen delegated Agent assignment is no longer available. Stop or retry this delegation.");
    return assignment;
  }

  function delegatedRunActivated(agentRun: AgentRun) {
    return store.listEventsByKind(agentRun.id, ["resumed"]).some((event) => event.detail.delegationActivated === true);
  }

  function applyChange(change: AgentRunChange): AgentRunAggregate {
    store.apply(change, now());
    const owned = actionControllers.get(change.agentRun.id);
    if (owned && (!isActiveAgentRunState(change.agentRun.state) || change.upserts.some((stage) =>
      stageKey(stage) === owned.key && ["completed", "skipped", "cancelled"].includes(stage.status)))) {
      owned.controller.abort();
      actionControllers.delete(change.agentRun.id);
    }
    if (!isActiveAgentRunState(change.agentRun.state)) {
      const config = store.resourceConfig?.(change.agentRun.id);
      if (config?.link) store.releaseResourceReservation?.(config.link, now());
      else if (config) {
        for (const reservation of store.readResources?.(change.agentRun.id)?.reservations ?? []) {
          if (reservation.released) continue;
          const child = store.getAggregate(reservation.childRunId);
          if (child && isActiveAgentRunState(child.agentRun.state)) {
            preparationControllers.get(child.agentRun.id)?.abort();
            applyChange(cancelAgentRun({ aggregate: child, now: now() }));
            void deps.stopResourceTask?.({ workspaceId: child.agentRun.workspaceId, taskId: child.agentRun.leadTaskId }).catch((error) => {
              console.error("[agent-runs] resource child stop failed", { agentRunId: child.agentRun.id, detail: describeError(error, "Stop failed") });
            });
          } else store.releaseResourceReservation?.({ rootRunId: change.agentRun.id, reservationId: reservation.reservationId, executionId: reservation.executionId }, now());
        }
      }
    }
    emit(change.agentRun);
    return requireAggregate(change.agentRun.id);
  }

  /** Records an event outside a transition and tells the surface it changed. */
  function recordEvent(agentRun: AgentRun, draft: AgentRunEventDraft): boolean {
    const inserted = store.recordEvent(agentRun.id, draft, now());
    if (inserted) emit(agentRun);
    return inserted;
  }

  function turnIdsFromEvents(
    cache: Map<string, Set<string>>,
    agentRunId: string,
    kind: "turn-linked" | "turn-interrupted" | "user-turn",
  ): Set<string> {
    let ids = cache.get(agentRunId);
    if (!ids) {
      ids = new Set(
        store
          .listEventsByKind(agentRunId, [kind])
          .flatMap((event) => (typeof event.detail.turnId === "string" ? [event.detail.turnId] : [])),
      );
      cache.set(agentRunId, ids);
    }
    return ids;
  }

  function turnIdsFor(agentRunId: string): Set<string> {
    return turnIdsFromEvents(agentRunTurnIds, agentRunId, "turn-linked");
  }

  /**
   * Counts each user turn that ended on the lead task during the agent run once,
   * as a reply, keyed by its turn id.
   */
  function recordEndedUserTurns(agentRun: AgentRun, turns: readonly AgentRunTurnRow[], ours: Set<string>) {
    const recorded = turnIdsFromEvents(userTurnIds, agentRun.id, "user-turn");
    const since = Date.parse(agentRun.createdAt);
    for (const row of [...turns].reverse()) {
      if (!row.completedAt || ours.has(row.id) || recorded.has(row.id)) continue;
      if (Date.parse(row.createdAt) < since) continue;
      recorded.add(row.id);
      recordEvent(agentRun, {
        kind: "user-turn",
        idempotencyKey: `${agentRun.id}:user-turn:${row.id}`,
        detail: { turnId: row.id },
      });
    }
  }

  /** When the current attempt was last marked stuck. */
  function stuckAt(agentRun: AgentRun, record: AgentRunStageRecord): string | null {
    if (record.status !== "stuck") return null;
    return (
      store
        .listEventsByKind(agentRun.id, ["stage-stuck"])
        .filter((event) => event.detail.stageId === record.stageId && event.detail.attempt === record.attempt)
        .at(-1)?.createdAt ?? null
    );
  }

  /** Whether a turn, the user's or the agent run's, runs on the lead task. */
  async function hasRunningTurn(agentRun: AgentRun): Promise<boolean> {
    const snapshot = await readSnapshot(agentRun);
    if (snapshot.activeTurnId) return true;
    if (!snapshot.exists) return false;
    return deps
      .listRecentTurns({ workspaceId: agentRun.workspaceId, taskId: agentRun.leadTaskId, limit: RECENT_TURN_LIMIT })
      .some((row) => !row.completedAt);
  }

  /** Usage of turns that ended never changes; read each once. */
  const endedTurnUsage = new Map<string, TurnUsageSample | null>();
  // Observation must not populate the supervisor's separate turn-ending cache.
  const observedTurnEndings = new Map<string, AgentRunRouteTurnFacts["ending"]>();
  function observedTurnEnding(turnId: string): AgentRunRouteTurnFacts["ending"] {
    if (observedTurnEndings.has(turnId)) return observedTurnEndings.get(turnId)!;
    try {
      const ending = deps.readObservedTurnEnding?.(turnId) ?? null;
      if (ending) observedTurnEndings.set(turnId, ending);
      if (observedTurnEndings.size > 500) observedTurnEndings.delete(observedTurnEndings.keys().next().value!);
      return ending;
    } catch {
      return null;
    }
  }

  function usageOf(agentRun: AgentRun): { usage?: AgentRunUsage; turns: Map<string, Omit<AgentRunRouteTurnFacts, "ending">> } {
    const read = deps.readTurnUsage;
    const turns = new Map<string, Omit<AgentRunRouteTurnFacts, "ending">>();
    if (!read) return { turns };
    const samples = [...turnIdsFor(agentRun.id)].map((turnId) => {
      const row = endedTurnUsage.has(turnId)
        ? { completed: true, usage: endedTurnUsage.get(turnId)! }
        : read({ workspaceId: agentRun.workspaceId, taskId: agentRun.leadTaskId, turnId });
      if (row?.completed) endedTurnUsage.set(turnId, row.usage);
      if (row) turns.set(turnId, row);
      return row?.usage ?? null;
    });
    return { usage: sumTurnUsage(samples), turns };
  }

  function detailOf(agentRunId: string, report: AgentRunReport | null = null, aggregate = requireAggregate(agentRunId)): AgentRunDetail {
    const { usage, turns: usageRows } = usageOf(aggregate.agentRun);
    const turns = new Map([...usageRows].map(([turnId, row]) =>
      [turnId, { ...row, ending: row.completed ? observedTurnEnding(turnId) : null }] as const));
    const routing = projectAgentRunRoutes({
      agentRunId,
      events: store.listEventsByKind(agentRunId, ["turn-started", "turn-linked", "turn-failed", "turn-interrupted"]),
      stages: aggregate.stages,
      turns,
    });
    return {
      agentRun: aggregate.agentRun,
      stages: aggregate.stages,
      events: store.listRecentEvents(agentRunId, DETAIL_EVENT_LIMIT),
      report: report ? { ...report, routing, ...(usage ? { usage } : {}) } : null,
      routing,
      ...(store.readResources?.(agentRunId) ? { resources: store.readResources!(agentRunId)! } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  async function readSnapshot(agentRun: AgentRun): Promise<TaskSupervisionSnapshot> {
    try {
      return await deps.getTaskSupervisionSnapshot({
        workspaceId: agentRun.workspaceId,
        taskId: agentRun.leadTaskId,
      });
    } catch {
      // An unreadable workspace pauses the agent run; it is not a verdict that
      // the task is gone.
      return {
        workspaceId: agentRun.workspaceId,
        taskId: agentRun.leadTaskId,
        repositoryPath: null,
        exists: false,
        archived: false,
        providerId: null,
        model: null,
        activeTurnId: null,
        pendingApprovalCount: 0,
        pendingUserInputCount: 0,
      };
    }
  }

  async function observe(aggregate: AgentRunAggregate): Promise<{
    observation: AgentRunObservation;
    turns: AgentRunTurnRow[];
  }> {
    const { agentRun } = aggregate;
    const snapshot = await readSnapshot(agentRun);
    // The supervisor queues work onto a task from outside it, which is the
    // staleness question the fleet control plane already answers.
    const identity = validateFleetQueueAction({
      expected: {
        repositoryPath: agentRun.repositoryPath,
        workspaceId: agentRun.workspaceId,
        taskId: agentRun.leadTaskId,
      },
      current: {
        repositoryPath: snapshot.repositoryPath,
        workspaceId: snapshot.exists ? snapshot.workspaceId : null,
        taskId: snapshot.exists ? snapshot.taskId : null,
        turnId: snapshot.activeTurnId,
        messages: [],
      },
    });
    // The turns table is read directly: a turn the user runs from the
    // composer shows up there before the host's session cache knows it.
    const turns = snapshot.exists
      ? deps.listRecentTurns({
          workspaceId: agentRun.workspaceId,
          taskId: agentRun.leadTaskId,
          limit: RECENT_TURN_LIMIT,
        })
      : [];
    const ours = turnIdsFor(agentRun.id);
    recordEndedUserTurns(agentRun, turns, ours);
    const interrupted = turnIdsFromEvents(interruptedTurnIds, agentRun.id, "turn-interrupted");
    const toObserved = (row: Pick<AgentRunTurnRow, "id" | "createdAt">): ObservedTurn => ({
      turnId: row.id,
      startedBy: ours.has(row.id) ? "agentRun" : "user",
      startedAt: row.createdAt,
    });
    const openRow = turns.find((row) => !row.completedAt);
    const activeTurn = snapshot.activeTurnId
      ? toObserved(
          turns.find((row) => row.id === snapshot.activeTurnId) ?? {
            id: snapshot.activeTurnId,
            createdAt: now().toISOString(),
          },
        )
      : openRow
        ? toObserved(openRow)
        : null;
    const record = currentStageRecord(aggregate);
    const attemptStartedAt = record.startedAt ? Date.parse(record.startedAt) : null;
    const endedRow =
      attemptStartedAt === null
        ? undefined
        : turns.find(
            (row) => row.completedAt && Date.parse(row.createdAt) >= attemptStartedAt,
          );
    const stage = workflowStageAt(agentRun, agentRun.currentStageIndex);
    return {
      turns,
      observation: {
        leadTask: {
          workspaceAvailable: Boolean(snapshot.repositoryPath),
          taskExists: snapshot.exists,
          taskArchived: snapshot.archived,
          identity: identity.ok ? { ok: true } : { ok: false, reason: identity.reason },
          fingerprint:
            snapshot.providerId && snapshot.model
              ? { providerId: snapshot.providerId, model: snapshot.model }
              : null,
          activeTurn,
          pendingApprovalCount: snapshot.pendingApprovalCount,
          pendingUserInputCount: snapshot.pendingUserInputCount,
          activeDelegatedTaskCount: snapshot.exists
            ? deps.countActiveDelegatedTasks(agentRun.leadTaskId)
            : 0,
        },
        reportingAvailable: await deps.isReportingAvailable(),
        lastEndedTurn: endedRow
          ? {
              ...toObserved(endedRow),
              endedAt: endedRow.completedAt,
              ...(interrupted.has(endedRow.id) ? { interrupted: true } : {}),
            }
          : null,
        userTurnIntent:
          activeTurn?.startedBy === "user" ? (userTurnIntents.get(agentRun.id) ?? null) : null,
        actionOutcome:
          stage.kind === "action" ? (actionOutcomes.get(stageKey(record)) ?? null) : null,
        stageStuckAt: stuckAt(agentRun, record),
      },
    };
  }

  /**
   * Records what Stave observed in the current attempt's turns once a new one
   * has ended, before the policy acts on its report.
   */
  async function refreshFacts(
    aggregate: AgentRunAggregate,
    observation: AgentRunObservation,
    turns: AgentRunTurnRow[],
  ): Promise<AgentRunAggregate> {
    const last = observation.lastEndedTurn;
    const record = currentStageRecord(aggregate);
    const { agentRun } = aggregate;
    if (!last || !record.startedAt) return aggregate;
    if (workflowStageAt(agentRun, agentRun.currentStageIndex).kind !== "ai") return aggregate;
    const key = stageKey(record);
    if (factsCollectedThrough.get(key) === last.turnId) return aggregate;
    const attemptStartedAt = Date.parse(record.startedAt);
    const turnIds = new Set(
      turns
        .filter((row) => row.completedAt && Date.parse(row.createdAt) >= attemptStartedAt)
        .map((row) => row.id),
    );
    let facts: StageFacts;
    try {
      facts = await deps.collectStageFacts({
        workspaceId: agentRun.workspaceId,
        taskId: agentRun.leadTaskId,
        cwd: await deps.resolveWorkspacePath(agentRun.workspaceId),
        startHeadSha: record.startHeadSha,
        turnIds,
        currentTurnId: last.turnId,
      });
      // A plan older than the messages read keeps standing until a newer one.
      const previousPlan = record.facts?.plan;
      facts = { ...facts, currentTurnId: last.turnId, ...(!facts.plan && previousPlan ? { plan: previousPlan } : {}) };
    } catch (error) {
      console.warn("[agent-runs] failed to collect stage facts", error, { agentRunId: agentRun.id });
      return aggregate;
    }
    factsCollectedThrough.set(key, last.turnId);
    return applyChange({ agentRun, upserts: [{ ...record, facts }], events: [] });
  }

  async function markStartFailure(agentRunId: string, detail: string) {
    const aggregate = store.getAggregate(agentRunId);
    if (!aggregate || !isActiveAgentRunState(aggregate.agentRun.state)) return;
    const snapshot = await readSnapshot(aggregate.agentRun);
    // A turn the user began between the tick's read and the start is not a
    // failure; the policy picks the stage up after that turn.
    if (snapshot.activeTurnId) return;
    applyChange(
      applyAgentRunDecision({
        aggregate,
        decision: {
          action: "mark-stuck",
          detail: `The stage's turn could not start: ${detail}`,
        },
        now: now(),
      }),
    );
    await notify(aggregate.agentRun, `A run turn could not start: ${detail}`);
  }

  async function notify(agentRun: AgentRun, detail: string) {
    try {
      await deps.notifyAgentRunProblem?.({ agentRun, detail });
    } catch (error) {
      console.warn("[agent-runs] failed to notify about a run problem", error, {
        agentRunId: agentRun.id,
      });
    }
  }

  /** How each ended turn ended; it never changes, so each is read once. */
  const turnEndings = new Map<string, "completed" | "stopped" | "failed">();
  function turnEnding(turnId: string) {
    if (!deps.readTurnEnding) return null;
    let ending = turnEndings.get(turnId);
    if (!ending) {
      ending = deps.readTurnEnding(turnId);
      turnEndings.set(turnId, ending);
      if (turnEndings.size > 500) turnEndings.delete(turnEndings.keys().next().value!);
    }
    return ending;
  }

  /** An agent run's route for its next turn; null keeps the agent run's fingerprint. */
  async function routeAgentTurn(agentRun: AgentRun, signal: AbortSignal): Promise<AgentRunTurnRoute | null> {
    if (!deps.routeAgentTurn) return null;
    try {
      // The assignment is the work every turn of the run continues; the
      // classifier reads the task's recent history for continuity.
      return await deps.routeAgentTurn({ agentRun, prompt: `${agentRun.assignment}\n\n${describeAgentRunExecutionContext(requireAggregate(agentRun.id))}`, signal });
    } catch (error) {
      signal.throwIfAborted();
      console.warn("[agent-runs] could not route an agent run turn; using the task's model", error, {
        agentRunId: agentRun.id,
      });
      return null;
    }
  }

  /**
   * Ends an active agent run the user stopped, or whose task stopped running
   * as the agent. True when it ended. The transcript stays as it is.
   */
  function endAgentRunIfLeft(aggregate: AgentRunAggregate, observation: AgentRunObservation): boolean {
    const { agentRun } = aggregate;
    if (!hasAgentOrigin(agentRun)) return false;
    const last = observation.lastEndedTurn;
    const cause = agentRunEndCause({
      taskRunsAsAgent: deps.taskRunsAsAgent?.(agentRun.leadTaskId) ?? true,
      lastEndedTurn: last,
      lastTurnEnding: last?.startedBy === "agentRun" && !last.interrupted ? turnEnding(last.turnId) : null,
      turnActive: Boolean(observation.leadTask.activeTurn),
    });
    if (!cause) return false;
    applyChange(cancelAgentRun({ aggregate, now: now(), endedBy: cause }));
    return true;
  }

  /**
   * Starts one agent run turn. Stage turns carry the stage identity, which mints
   * the reporting grant; a turn a Stave action asked for reports nothing and
   * carries none.
   */
  async function startAgentRunTurn(
    aggregate: AgentRunAggregate,
    decision: Extract<
      AgentRunDecision,
      { action: "start-stage-turn" | "nudge" | "start-action-turn" }
    >,
    reason: AgentRunTurnReason,
    actionPrompt?: string,
    userReply = false,
  ) {
    const { agentRun } = aggregate;
    const before = currentStageRecord(aggregate);
    // Routed before anything is recorded, so a slow classifier leaves no half-started turn.
    const delegation = delegatedAuthority(agentRun);
    if (delegation) requireDelegatedAssignment(agentRun, delegation);
    if (delegation && !deps.delegatedExecutionCurrent?.(agentRun.id, agentRun.leadTaskId, delegation)) {
      applyChange(cancelAgentRun({ aggregate, now: now() }));
      return;
    }
    const preparedSequence = store.listRecentEvents(agentRun.id, 1).at(-1)?.sequence ?? 0;
    const controller = new AbortController();
    const resources = store.resourceConfig?.(agentRun.id);
    if (resources?.link) {
      const root = store.getAggregate(resources.link.rootRunId);
      if (!root || !isActiveAgentRunState(root.agentRun.state)) { applyChange(cancelAgentRun({ aggregate, now: now() })); return; }
      if (root.agentRun.state !== "running") return;
    }
    const remainingBudget = resources ? store.readResources?.(agentRun.id) : null;
    if (remainingBudget && !resources?.link && remainingBudget.activeHelpers > 0 && remainingBudget.remaining <= remainingBudget.policy.parentReserve) return;
    const observed = resources?.policy.accountProfileId ? readAdaptiveObservations(resources.policy.providerId, resources.policy.accountProfileId, now().getTime()) : null;
    const catalogModels = observed?.catalog?.catalog.ok && observed.catalog.catalog.models.length ? observed.catalog.catalog.models : null;
    // A cached catalog can reject a proposal; it never silently replaces a pinned/current model.
    const adaptive = resources ? selectAdaptiveRoute(resources.policy, aggregate, store.listEventsByKind(agentRun.id, ["resource-request", "resource-decision", "turn-linked"]), catalogModels) : null;
    preparationControllers.set(agentRun.id, controller);
    let routed: AgentRunTurnRoute | null, startHeadSha = before.startHeadSha;
    try {
      routed = adaptive ? {
        fingerprint: { providerId: resources!.policy.providerId, model: adaptive.model }, runtimeOptions: adaptive.runtimeOptions,
        route: "adaptive", rationale: String(adaptive.decision?.reason ?? "Frozen Balanced route; no unsupported escalation."),
        selection: { version: 1, source: "adaptive", previous: agentRun.fingerprint,
          selected: { providerId: resources!.policy.providerId, model: adaptive.model }, requestedEffort: adaptive.effort,
          effortSource: "adaptive", inputs: { quota: observed?.quota ? "cached" : "not-provided", catalog: catalogModels ? "cached" : "frozen", availability: observed?.quota || observed?.catalog ? "cached" : "not-provided" } },
      } : await prepareRunTurn(controller.signal, () => !delegation && hasAgentOrigin(agentRun)
        ? routeAgentTurn(agentRun, controller.signal) : Promise.resolve(null));
      if (!startHeadSha) startHeadSha = await prepareRunTurn(controller.signal, async () => {
        const cwd = await deps.resolveWorkspacePath(agentRun.workspaceId);
        return cwd ? deps.readHeadSha(cwd).catch(() => null) : null;
      });
      const snapshot = await prepareRunTurn(controller.signal, () => readSnapshot(agentRun));
      if (!snapshot.exists || snapshot.archived || snapshot.activeTurnId || snapshot.pendingApprovalCount || snapshot.pendingUserInputCount) return;
      controller.signal.throwIfAborted();
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    } finally {
      if (preparationControllers.get(agentRun.id) === controller) preparationControllers.delete(agentRun.id);
    }
    const latest = requireAggregate(agentRun.id);
    // Preparation is read-only: a changed run/attempt cannot authorize its old result.
    if ((store.listRecentEvents(agentRun.id, 1).at(-1)?.sequence ?? 0) !== preparedSequence ||
        latest.agentRun.state !== "running" || latest.agentRun.updatedAt !== agentRun.updatedAt ||
        latest.agentRun.turnCount !== agentRun.turnCount ||
        currentStageRecord(latest).attempt !== before.attempt || currentStageRecord(latest).stageId !== before.stageId) return;
    const change = applyAgentRunDecision({ aggregate, decision, now: now() });
    if (delegation && !deps.delegatedExecutionCurrent?.(agentRun.id, agentRun.leadTaskId, delegation)) {
      applyChange(cancelAgentRun({ aggregate, now: now() }));
      return;
    }
    // The user may release the agent while the awaits above run; an agent run
    // then ends here instead of starting one more stage turn as plain chat.
    if (hasAgentOrigin(agentRun) && deps.taskRunsAsAgent && !deps.taskRunsAsAgent(agentRun.leadTaskId)) {
      applyChange(cancelAgentRun({ aggregate, now: now(), endedBy: "released" }));
      return;
    }
    const turnKey = buildAgentRunTurnKey({
      agentRunId: agentRun.id,
      stageId: before.stageId,
      attempt: before.attempt,
      turn: change.agentRun.turnCount,
    });
    const availability = resources && observed?.quota ? resolveAccountUsageBlock({
      providerId: resources.policy.providerId, model: adaptive?.model, snapshot: observed.quota.snapshot, now: now().getTime(),
    }) === null : undefined;
    if (adaptive && !supportsAdaptiveEffort(resources!.policy.providerId, adaptive.model, adaptive.effort, catalogModels)) {
      await markStartFailure(agentRun.id, "The cached model catalog does not support this Run's effort. Refresh it and retry; pinned settings cannot be changed silently."); return;
    }
    if (availability === false || observed?.catalog?.catalog.ok === false || (adaptive && catalogModels && !catalogModels.some((entry) => entry.model === adaptive.model))) {
      await markStartFailure(agentRun.id, "Cached account observations report this provider unavailable. Refresh it and retry; this Run cannot switch providers."); return;
    }
    if (resources && !store.consumeResourceTurn?.(agentRun.id, turnKey, now())) {
      await markStartFailure(agentRun.id, "The shared turn budget is unavailable. Finish or stop helpers to release unused reservations, or start a new Run.");
      return;
    }
    if (adaptive?.decision) recordEvent(agentRun, { kind: "resource-decision", idempotencyKey: `${agentRun.id}:resource-decision:${adaptive.requestSequence}`, detail: adaptive.decision });
    const routeSelection = AgentRunRouteSelectionSchema.safeParse(routed?.selection);
    // The turn count, the stage record and the keyed `turn-started` event are
    // written together, before the turn exists.
    const started = applyChange({
      ...change,
      upserts: change.upserts.map((record) =>
        record.stageId === before.stageId && record.attempt === before.attempt
          ? { ...record, startHeadSha, ...(userReply ? { report: null, nudged: false } : {}) }
          : record,
      ),
      events: [
        ...change.events,
        {
          kind: "turn-started",
          idempotencyKey: turnKey,
          detail: {
            stageId: before.stageId,
            attempt: before.attempt,
            reason,
            ...(routed
              ? { route: routed.route, model: formatAgentRunFingerprint(routed.fingerprint), rationale: routed.rationale.slice(0, 300) }
              : {}),
            ...(observed ? { resourceObservations: { accountProfileId: resources!.policy.accountProfileId,
              quotaObservedAt: observed.quota?.metadata.observedAt ?? null, quotaSource: observed.quota?.metadata.source ?? null,
              catalogObservedAt: observed.catalog?.observedAt ?? null } } : {}),
            ...(routeSelection.success ? { routeSelection: routeSelection.data } : {}),
          },
        },
      ],
    });
    const identity = { agentRunId: agentRun.id, stageId: before.stageId, attempt: before.attempt };
    const prompt =
      actionPrompt ??
      (reason === "nudge" ? buildStageNudgePrompt(started) : compileAgentRunStagePrompt(started, deps.agentNames?.()));
    try {
      const turn = await deps.runSupervisedTurn({
        workspaceId: agentRun.workspaceId,
        taskId: agentRun.leadTaskId,
        ...(delegation ? { parentTaskId: delegation.parentTaskId } : {}),
        prompt,
        fingerprint: routed?.fingerprint ?? agentRun.fingerprint,
        runtimeOptions: { ...(delegation ? buildDelegatedTaskRuntimeOptions({
          providerId: agentRun.fingerprint.providerId, model: routed?.fingerprint.model ?? agentRun.fingerprint.model,
          effort: AgentResourceRequestObjectSchema.shape.effort.parse(adaptive?.runtimeOptions.claudeEffort ?? adaptive?.runtimeOptions.codexReasoningEffort ?? delegation.effort), permissionPolicy: delegation.permissionPolicy,
        }) : {
          ...agentRunPermissionRuntimeOptions(
            routed?.fingerprint.providerId ?? agentRun.fingerprint.providerId,
            agentRun.consent.permissionMode,
            agentRun.consent.permissionMode === "manual"
              ? deps.userPermissionOptions?.(routed?.fingerprint.providerId ?? agentRun.fingerprint.providerId)
              : undefined,
          ),
          ...routed?.runtimeOptions,
        }), ...(resources?.policy.accountProfileId ? (resources.policy.providerId === "codex" ? { codexAccountProfileId: resources.policy.accountProfileId } : { claudeAccountProfileId: resources.policy.accountProfileId }) : {}) },
        retrievedContextParts: [buildAgentRunTurnContextPart({ aggregate: started, reason }), ...(resources ? [{ type: "retrieved_context" as const,
          sourceId: "stave:adaptive-resources", title: "Adaptive Balanced resources",
          content: JSON.stringify({ policy: resources.policy, budget: store.readResources?.(agentRun.id), currentTurnKey: turnKey,
            instruction: "Complete and verify this stage within the remaining shared budget. Helpers must be saved-Agent supervised delegations admitted by canCall. Do not start native, one-turn or detached helpers. Read stave_get_agent_run for linked stage turn ids. If another same-provider model or effort is justified by these turns, propose it with stave_request_agent_resources for the next turn. Permissions and pinned resources do not change. Environment/permission failures are blockers, not capability escalation evidence." }),
        }] : [])],
        ...(actionPrompt === undefined || userReply ? { agentRunStage: identity } : {}),
        ...(hasAgentOrigin(agentRun)
          ? { agentRunPrompt: { agentRunId: agentRun.id, assignment: extractRunAssignment(prompt, agentRun.assignment) } }
          : {}),
      });
      turnIdsFor(agentRun.id).add(turn.turnId);
      userTurnIntents.delete(agentRun.id);
      recordEvent(started.agentRun, {
        kind: "turn-linked",
        idempotencyKey: buildAgentRunTurnOutcomeKey(turnKey, "linked"),
        detail: { ...identity, turnId: turn.turnId },
      });
    } catch (error) {
      const detail = describeError(error, "The provider did not start the turn.");
      recordEvent(started.agentRun, {
        kind: "turn-failed",
        idempotencyKey: buildAgentRunTurnOutcomeKey(turnKey, "failed"),
        detail: { ...identity, detail: detail.slice(0, 500) },
      });
      await markStartFailure(agentRun.id, detail);
    }
  }

  /** Starts the turn the current action asked for; the action resumes after it. */
  async function startActionTurn(
    aggregate: AgentRunAggregate,
    decision: Extract<AgentRunDecision, { action: "start-action-turn" }>,
  ) {
    const key = stageKey(currentStageRecord(aggregate));
    const requested = actionOutcomes.get(key);
    if (requested?.status !== "needs-turn") return;
    // Consumed here, so the finished turn leads back to the action instead of
    // asking for another turn.
    actionOutcomes.set(key, { status: "in-progress" });
    await startAgentRunTurn(aggregate, decision, requested.reason, requested.prompt);
  }

  async function executeAction(
    aggregate: AgentRunAggregate,
    decision: AgentRunDecision,
  ): Promise<ActionOutcome> {
    const delegation = delegatedAuthority(aggregate.agentRun);
    if (delegation) {
      requireDelegatedAssignment(aggregate.agentRun, delegation);
      if (!deps.delegatedExecutionCurrent?.(aggregate.agentRun.id, aggregate.agentRun.leadTaskId, delegation)) {
        applyChange(cancelAgentRun({ aggregate, now: now() }));
        return { status: "in-progress" };
      }
    }
    const change = applyAgentRunDecision({ aggregate, decision, now: now() });
    const current = hasEffect(change, aggregate) ? applyChange(change) : aggregate;
    const record = currentStageRecord(current);
    const stage = workflowStageAt(current.agentRun, current.agentRun.currentStageIndex);
    if (delegation && isReadOnlyDelegationPolicy(delegation.permissionPolicy.providerId, delegation.permissionPolicy)) {
      const denied: ActionOutcome = { status: "failed", detail: "This delegated Agent is read-only and cannot execute host action stages. Use an AI stage within its permission policy." };
      actionOutcomes.set(stageKey(record), denied);
      return denied;
    }
    // The action records its own events, such as the checks it observed.
    const lastSequence = () => store.listRecentEvents(current.agentRun.id, 1).at(-1)?.sequence ?? 0;
    const sequenceBefore = lastSequence();
    let owned = actionControllers.get(current.agentRun.id);
    if (!owned || owned.key !== stageKey(record)) {
      owned?.controller.abort();
      owned = { key: stageKey(record), controller: new AbortController() };
      actionControllers.set(current.agentRun.id, owned);
    }
    const outcome: ActionOutcome = deps.performAction
      ? await deps.performAction({ aggregate: current, signal: owned.controller.signal }).catch((error: unknown) => ({
          status: "failed" as const,
          detail: describeError(error, "The Stave action failed."),
        }))
      : {
          status: "failed",
          detail: `This version of Stave cannot run the "${stage.title}" action yet. Skip the stage or cancel the run.`,
        };
    actionOutcomes.set(stageKey(record), outcome);
    if (lastSequence() !== sequenceBefore) emit(current.agentRun);
    if (outcome.status === "succeeded") {
      const cwd = await deps.resolveWorkspacePath(current.agentRun.workspaceId);
      const workspaceRevision = cwd && deps.readWorkspaceRevision ? await deps.readWorkspaceRevision(cwd) : { status: "unknown" as const, reason: "unavailable" as const };
      // The report reads the result from the stage's facts, as verified evidence.
      applyChange({
        agentRun: current.agentRun,
        upserts: [
          { ...record, facts: { ...(record.facts ?? EMPTY_STAGE_FACTS), action: outcome.result, workspaceRevision } },
        ],
        events: [],
      });
    }
    return outcome;
  }

  /** Runs the policy for one agent run until it idles or starts a turn. */
  async function evaluate(agentRunId: string) {
    let aggregate = store.getAggregate(agentRunId);
    for (
      let step = 0;
      aggregate && isActiveAgentRunState(aggregate.agentRun.state) && step < MAX_DECISIONS_PER_EVALUATION;
      step += 1
    ) {
      const { observation, turns } = await observe(aggregate);
      // Facts first, so a run that ends here keeps its last turn's plan and evidence.
      aggregate = await refreshFacts(aggregate, observation, turns);
      if (endAgentRunIfLeft(aggregate, observation)) return;
      const decision = decideAgentRunAction({ aggregate, observation, now: now() });
      if (decision.action === "complete-stage" && !store.resourceConfig?.(agentRunId)?.link && store.resourceConfig?.(agentRunId)) {
        if ((store.readResources?.(agentRunId)?.activeHelpers ?? 0) > 0) return;
        const events = store.listEventsByKind(agentRunId, ["resource-budget", "turn-started", "turn-linked"]);
        const lastRelease = events.filter((event) => event.kind === "resource-budget" && event.detail.operation === "release").at(-1)?.sequence ?? 0;
        const lastParentTurn = events.filter((event) => event.kind === "turn-started" || (event.kind === "turn-linked" && event.detail.reason === "user-reply")).at(-1)?.sequence ?? 0;
        if (lastRelease > lastParentTurn && workflowStageAt(aggregate.agentRun, aggregate.agentRun.currentStageIndex).kind === "ai") {
          const record = currentStageRecord(aggregate);
          await startAgentRunTurn(aggregate, { action: "start-stage-turn", stageIndex: aggregate.agentRun.currentStageIndex, attempt: record.attempt, reason: "stage-start" },
            "stage-start", `${compileAgentRunStagePrompt(aggregate, deps.agentNames?.())}\nIntegrate the final helper outcomes, verify the complete assignment, then report this stage again. An earlier report predates those helper outcomes.`, true);
          return;
        }
      }
      switch (decision.action) {
        case "idle":
        case "wait":
          return;
        case "start-stage-turn":
          await startAgentRunTurn(aggregate, decision, decision.reason);
          return;
        case "nudge":
          await startAgentRunTurn(aggregate, decision, "nudge");
          return;
        case "start-action-turn":
          await startActionTurn(aggregate, decision);
          return;
        case "execute-action": {
          // An action still underway changes nothing until the next tick.
          const outcome = await executeAction(aggregate, decision);
          if (outcome.status === "in-progress") return;
          break;
        }
        case "stop":
        case "pause":
        case "resume":
        case "block":
        case "request-sign-off":
        case "mark-stuck":
        case "complete-stage": {
          const change = applyAgentRunDecision({ aggregate, decision, now: now() });
          if (hasEffect(change, aggregate)) applyChange(change);
          break;
        }
        default:
          decision satisfies never;
          return;
      }
      aggregate = store.getAggregate(agentRunId);
    }
  }

  async function tick() {
    // Release only reservations whose exact persisted execution ended. Missing evidence retains capacity.
    if (deps.resourceExecutionLive) for (const root of store.listActiveAgentRuns()) {
      try {
      const config = store.resourceConfig?.(root.id);
      if (!config || config.link) continue;
      for (const row of store.readResources?.(root.id)?.reservations ?? []) {
        if (!row.released && !deps.resourceExecutionLive(row.childRunId, row.executionId)) {
          const child = store.getAggregate(row.childRunId);
          if (child && isActiveAgentRunState(child.agentRun.state)) applyChange(cancelAgentRun({ aggregate: child, now: now() }));
          else store.releaseResourceReservation?.({ rootRunId: root.id, reservationId: row.reservationId, executionId: row.executionId }, now());
        }
      }
      } catch (error) {
        console.error("[agent-runs] resource recovery failed", { agentRunId: root.id, detail: describeError(error, "Invalid resource state") });
      }
    }
    for (const agentRun of store.listActiveAgentRuns()) {
      try {
        await evaluate(agentRun.id);
      } catch (error) {
        console.error("[agent-runs] run evaluation failed", error, { agentRunId: agentRun.id });
      }
    }
  }

  function requestTick(): Promise<void> {
    if (queuedTick) return queuedTick;
    queuedTick = enqueue(async () => {
      queuedTick = null;
      await tick();
    }).catch((error) => {
      console.error("[agent-runs] tick failed", error);
    });
    return queuedTick;
  }

  const INTERRUPTED_START = "Stave stopped before this stage's turn started.";

  /**
   * Closes the agent run turn a stopped host left open and records it as
   * interrupted, so the stage resumes instead of spending its reminder; then
   * settles every start that never reached a turn. Returns those starts.
   */
  function closeInterruptedTurns(agentRun: AgentRun): AgentRunEvent[] {
    const events = store.listEventsByKind(agentRun.id, ["turn-started", "turn-linked", "turn-failed"]);
    const settled = new Set(
      events.flatMap((event) =>
        event.kind !== "turn-started" && event.idempotencyKey ? [event.idempotencyKey] : [],
      ),
    );
    const latestLinked = events.filter((event) => event.kind === "turn-linked").at(-1);
    const turnId = latestLinked?.detail.turnId;
    if (typeof turnId === "string" && deps.completeInterruptedTurn(turnId) && latestLinked?.idempotencyKey) {
      const turnKey = latestLinked.idempotencyKey.replace(/:linked$/, "");
      recordEvent(agentRun, {
        kind: "turn-interrupted",
        idempotencyKey: buildAgentRunTurnOutcomeKey(turnKey, "interrupted"),
        detail: { stageId: latestLinked.detail.stageId, attempt: latestLinked.detail.attempt, turnId },
      });
      interruptedTurnIds.get(agentRun.id)?.add(turnId);
    }
    const orphans = events.filter(
      (event) =>
        event.kind === "turn-started" &&
        event.idempotencyKey &&
        !settled.has(buildAgentRunTurnOutcomeKey(event.idempotencyKey, "linked")) &&
        !settled.has(buildAgentRunTurnOutcomeKey(event.idempotencyKey, "failed")),
    );
    for (const orphan of orphans) {
      recordEvent(agentRun, {
        kind: "turn-failed",
        idempotencyKey: buildAgentRunTurnOutcomeKey(orphan.idempotencyKey!, "failed"),
        detail: { stageId: orphan.detail.stageId, attempt: orphan.detail.attempt, detail: INTERRUPTED_START },
      });
    }
    return orphans;
  }

  /** A start that never reached a turn marks its stage stuck and tells the user. */
  async function reportInterruptedStarts(agentRun: AgentRun, orphans: readonly AgentRunEvent[]) {
    const aggregate = requireAggregate(agentRun.id);
    const record = currentStageRecord(aggregate);
    const hitsCurrentAttempt = orphans.some(
      (orphan) => orphan.detail.stageId === record.stageId && orphan.detail.attempt === record.attempt,
    );
    if (hitsCurrentAttempt && record.status === "running") {
      applyChange(
        applyAgentRunDecision({
          aggregate,
          decision: { action: "mark-stuck", detail: `${INTERRUPTED_START} Retry the stage to continue.` },
          now: now(),
        }),
      );
    }
    await notify(agentRun, `A run turn was interrupted: ${INTERRUPTED_START}`);
  }

  /**
   * Boot sweep. The host stopped, so no agent run turn is running: the latest
   * one is closed if it was left open, and a start that was recorded but never
   * reached a turn is reported and marks its stage stuck. It is never
   * replayed. Every agent run's turns are closed before anyone is notified: a
   * notification loads the workspace session, which would otherwise keep a
   * turn another agent run has not closed yet as running.
   */
  async function reconcileInterruptedStarts() {
    const interrupted: Array<{ agentRun: AgentRun; orphans: AgentRunEvent[] }> = [];
    for (const agentRun of store.listActiveAgentRuns()) {
      try {
        const orphans = closeInterruptedTurns(agentRun);
        if (orphans.length > 0) interrupted.push({ agentRun, orphans });
      } catch (error) {
        console.error("[agent-runs] failed to close an interrupted run turn", error, {
          agentRunId: agentRun.id,
        });
      }
    }
    for (const { agentRun, orphans } of interrupted) {
      try {
        await reportInterruptedStarts(agentRun, orphans);
      } catch (error) {
        console.error("[agent-runs] failed to reconcile an interrupted run", error, {
          agentRunId: agentRun.id,
        });
      }
    }
  }

  function start() {
    if (intervalHandle) return;
    void enqueue(reconcileInterruptedStarts).catch((error) => {
      console.error("[agent-runs] boot reconciliation failed", error);
    });
    intervalHandle = setIntervalImpl(() => void requestTick(), AGENT_RUN_TICK_INTERVAL_MS);
    void requestTick();
  }

  function stop() {
    for (const controller of preparationControllers.values()) controller.abort();
    if (intervalHandle) {
      clearIntervalImpl(intervalHandle);
      intervalHandle = null;
    }
  }

  async function getDetail({ agentRunId }: AgentRunIdArgs): Promise<AgentRunDetail> {
    let aggregate = requireAggregate(agentRunId);
    const { agentRun } = aggregate;
    if (deps.readWorkspaceRevision && aggregate.stages.some((stage) => stage.facts?.action?.type === "run-script" && stage.facts.action.verification)) {
      const cwd = await deps.resolveWorkspacePath(agentRun.workspaceId).catch(() => null);
      const workspaceRevision = cwd ? await deps.readWorkspaceRevision(cwd).catch(() => ({ status: "unknown" as const, reason: "unavailable" as const })) : { status: "unknown" as const, reason: "unavailable" as const };
      aggregate = { ...aggregate, stages: aggregate.stages.map((stage) => stage.facts ? { ...stage, facts: { ...stage.facts, workspaceRevision } } : stage) };
    }
    if (isActiveAgentRunState(agentRun.state)) return detailOf(agentRunId, null, aggregate);
    let workspace = EMPTY_WORKSPACE_STATE;
    if (agentRun.state !== "completed" && deps.readWorkspaceState) {
      const cwd = await deps.resolveWorkspacePath(agentRun.workspaceId).catch(() => null);
      workspace = await deps.readWorkspaceState(cwd).catch(() => EMPTY_WORKSPACE_STATE);
    }
    return detailOf(
      agentRunId,
      buildAgentRunReport({
        aggregate,
        workspace,
        endedAt: new Date(agentRun.updatedAt),
        events: store.listRecentEvents(agentRunId, AGENT_RUN_LIMITS.maxRetainedEvents),
      }),
      aggregate,
    );
  }

  /** A user command: one pure transition, applied, then a tick to act on it. */
  function command(
    agentRunId: string,
    build: (aggregate: AgentRunAggregate) => AgentRunChange | Promise<AgentRunChange>,
  ): Promise<AgentRunDetail> {
    return enqueue(async () => {
      const aggregate = requireAggregate(agentRunId);
      const change = await build(aggregate);
      if (hasEffect(change, aggregate)) applyChange(change);
      void requestTick();
      return detailOf(agentRunId);
    });
  }

  function stageIdentity(args: AgentRunStageRef) {
    return { stageId: args.stageId, attempt: args.attempt };
  }

  /** The grant's stage, refused once the turn ended or the stage moved on. */
  function requireGrant(agentRunKey: string): { grant: AgentRunStageGrant; aggregate: AgentRunAggregate } {
    const grant = deps.resolveAgentRunGrant(agentRunKey);
    if (!grant) throw new AgentRunCommandError("stale-identity", NO_ACTIVE_GRANT);
    const aggregate = requireAggregate(grant.agentRunId);
    if (aggregate.agentRun.leadTaskId !== grant.taskId) {
      throw new AgentRunCommandError("stale-identity", NO_ACTIVE_GRANT);
    }
    return { grant, aggregate };
  }

  function receipt(aggregate: AgentRunAggregate, note: string): AgentRunReportReceipt {
    const record = currentStageRecord(aggregate);
    return {
      recorded: true,
      stage: workflowStageAt(aggregate.agentRun, aggregate.agentRun.currentStageIndex).title,
      revision: record.reportRevision,
      note,
    };
  }

  return {
    reserveChildResources: (args) => store.reserveChildResources?.({ ...args, now: now() }) ?? null,
    releaseChildResources: (link) => { store.releaseResourceReservation?.(link, now()); },
    requestResources: ({ agentRunKey, request }) => enqueue(() => {
      const { grant, aggregate } = requireGrant(agentRunKey);
      const config = store.resourceConfig?.(aggregate.agentRun.id);
      if (!config || aggregate.agentRun.state !== "running") refuse("Adaptive resources are not enabled for this Run.");
      const stage = currentStageRecord(aggregate);
      if (stage.stageId !== grant.stageId || stage.attempt !== grant.attempt || stage.status !== "running") refuse("This stage grant is stale.");
      const parsed = AgentResourceRequestSchema.parse(request);
      recordEvent(aggregate.agentRun, { kind: "resource-request", idempotencyKey: `${aggregate.agentRun.id}:resource-request:${grant.turnId}`,
        detail: { stageId: grant.stageId, attempt: grant.attempt, turnId: grant.turnId, request: parsed } });
      return { recorded: true as const };
    }),
    isDelegatedAgentRunActivated: (agentRunId) => delegatedRunActivated(requireAggregate(agentRunId).agentRun),
    isDelegatedExecutionCurrent: (agentRunId, taskId, authority) => deps.delegatedExecutionCurrent?.(agentRunId, taskId, authority) === true,
    start,
    stop,
    requestTick,
    notifyTaskTurnFinished: ({ taskId }) => {
      if (store.getActiveAgentRunForTask(taskId)) void requestTick();
    },
    prepareUserTurn: ({ taskId, workspaceId, turnId, providerId }) => {
      const run = store.getActiveAgentRunForTask(taskId);
      if (!run || !hasAgentOrigin(run) || (workspaceId && run.workspaceId !== workspaceId)) return null;
      const aggregate = requireAggregate(run.id);
      const authority = delegatedAuthority(run);
      if (authority) {
        requireDelegatedAssignment(run, authority);
        if (!delegatedRunActivated(run) || !deps.delegatedExecutionCurrent?.(run.id, taskId, authority)) refuse("This delegation is no longer admitted.");
        if (providerId && providerId !== run.fingerprint.providerId) refuse("A delegated Agent reply must keep its admitted provider. Stop or retry it to change providers.");
        if (run.state !== "running") refuse("Resume the delegated Agent run before sending a stage reply.");
      }
      if (run.state !== "running") { if (store.resourceConfig?.(run.id)) refuse("Resume the adaptive Run before replying, or take control to end it."); return null; }
      const record = currentStageRecord(aggregate);
      const stage = workflowStageAt(run, run.currentStageIndex);
      if (stage.kind !== "ai" || !["running", "blocked", "stuck"].includes(record.status)) {
        if (authority || store.resourceConfig?.(run.id)) refuse("Use the delegated Agent run controls to resume or approve its current stage before sending a reply.");
        return null;
      }
      const resources = store.resourceConfig?.(run.id);
      if (resources && providerId && providerId !== resources.policy.providerId) refuse("An adaptive reply must keep the frozen provider.");
      const adaptive = resources ? selectAdaptiveRoute(resources.policy, aggregate, store.listEventsByKind(run.id, ["resource-decision"])) : null;
      const observed = resources?.policy.accountProfileId ? readAdaptiveObservations(resources.policy.providerId, resources.policy.accountProfileId, now().getTime()) : null;
      if (adaptive && !supportsAdaptiveEffort(resources!.policy.providerId, adaptive.model, adaptive.effort, observed?.catalog?.catalog.ok ? observed.catalog.catalog.models : null))
        refuse("The cached model catalog does not support this Run's effort. Refresh it and retry; pinned settings cannot be changed silently.");
      if (resources && (observed?.quota && resolveAccountUsageBlock({ providerId: resources.policy.providerId, model: adaptive?.model,
          snapshot: observed.quota.snapshot, now: now().getTime() }) !== null || observed?.catalog?.catalog.ok === false ||
          (adaptive && observed?.catalog?.catalog.ok && observed.catalog.catalog.models.length > 0 && !observed.catalog.catalog.models.some((entry) => entry.model === adaptive.model))))
        refuse("Cached account observations report this provider unavailable. Refresh it and retry; this Run cannot switch providers.");
      if (resources && !store.consumeResourceTurn?.(run.id, `${run.id}:user-reply:${turnId}`, now())) refuse("The shared turn budget cannot admit this reply. Stop helpers or start a new Run.");
      const agentRunStage = { agentRunId: run.id, stageId: record.stageId, attempt: record.attempt };
      turnIdsFor(run.id).add(turnId);
      recordEvent(run, { kind: "turn-linked", idempotencyKey: `${run.id}:user-reply:${turnId}`, detail: { ...agentRunStage, turnId, reason: "user-reply" } });
      recordEvent(run, { kind: "user-turn", idempotencyKey: `${run.id}:user-turn:${turnId}`, detail: { turnId } });
      const accountOptions = resources?.policy.accountProfileId ? (resources.policy.providerId === "codex" ? { codexAccountProfileId: resources.policy.accountProfileId } : { claudeAccountProfileId: resources.policy.accountProfileId }) : {};
      return { agentRunStage, runtimeOptionsMode: authority ? "delegation" : "routing", ...(authority ? { runtimeOptions: { ...accountOptions, ... buildDelegatedTaskRuntimeOptions({
        providerId: run.fingerprint.providerId, model: adaptive?.model ?? run.fingerprint.model, effort: AgentResourceRequestObjectSchema.shape.effort.parse(adaptive?.runtimeOptions.claudeEffort ?? adaptive?.runtimeOptions.codexReasoningEffort ?? authority.effort), permissionPolicy: authority.permissionPolicy,
      }) } } : adaptive ? { runtimeOptions: { ...accountOptions, model: adaptive.model, ...adaptive.runtimeOptions } } : {}), context: {
        type: "retrieved_context", sourceId: AGENT_RUN_CONTEXT_SOURCE_ID, title: "Agent stage reply",
        content: `${describeAgentRunExecutionContext(aggregate)}\nThis is the user's reply in the current stage. Handle it once and report the stage using the reporting tools. If it is only a clarification, answer it and keep the stage blocked on the missing decision. Do not restart or repeat the original assignment.`,
      } };
    },
    resourceRootForTask: (taskId) => {
      const run = store.getActiveAgentRunForTask(taskId);
      return run && store.resourceConfig?.(run.id) ? run.id : null;
    },
    getActiveAgentRunForTask: (taskId) => store.getActiveAgentRunForTask(taskId),
    readDelegatedAgentRun: async (args) => store.getAggregate(args.agentRunId)
      ? { ...await getDetail(args), delegationActivated: delegatedRunActivated(requireAggregate(args.agentRunId).agentRun) }
      : { missing: true },
    endAgentRunForTask: ({ taskId, delegatedOnly }) => {
      const current = store.getActiveAgentRunForTask(taskId);
      if (current && hasAgentOrigin(current) && (!delegatedOnly || delegatedAuthority(current)))
        preparationControllers.get(current.id)?.abort();
      return enqueue(() => {
        const active = store.getActiveAgentRunForTask(taskId);
        const aggregate = active && hasAgentOrigin(active) ? store.getAggregate(active.id) : null;
        if (!aggregate || !isActiveAgentRunState(aggregate.agentRun.state)) return false;
        if (delegatedOnly && !delegatedAuthority(aggregate.agentRun)) return false;
        applyChange(cancelAgentRun({ aggregate, now: now(), endedBy: "released" }));
        return true;
      });
    },
    prepareDelegatedAgentRun: ({ agentRunId, model, input: rawInput, authority: rawAuthority, resourceLink }) =>
      enqueue(async () => {
        const input = AgentRunStartInputSchema.parse(rawInput);
        const authority = DelegatedAgentRunAuthoritySchema.parse(rawAuthority);
        if (input.origin !== "agent" || input.maxTurns > AGENT_RUN_LIMITS.defaultMaxTurns || input.consent.authorizedEffectStageIds.length)
          refuse("Invalid delegated supervision policy.");
        requireDelegatedAssignment(input, authority);
        if (!deps.delegatedExecutionCurrent?.(agentRunId, input.leadTaskId, authority)) refuse("The delegation is no longer admitted.");
        const known = store.getAggregate(agentRunId);
        if (known) {
          if (known.agentRun.workspaceId !== input.workspaceId || known.agentRun.leadTaskId !== input.leadTaskId ||
              known.agentRun.fingerprint.model !== model || known.agentRun.maxTurns !== input.maxTurns ||
              JSON.stringify(delegatedAuthority(known.agentRun)) !== JSON.stringify(authority))
            refuse("The delegated supervisor identity does not match this execution.");
          return detailOf(agentRunId);
        }
        if (store.getActiveAgentRunForTask(input.leadTaskId)) refuse("This delegated task already has an active run.");
        const snapshot = await deps.getTaskSupervisionSnapshot({ workspaceId: input.workspaceId, taskId: input.leadTaskId });
        if (!snapshot.exists || !snapshot.repositoryPath || snapshot.archived || snapshot.activeTurnId ||
            snapshot.providerId !== authority.permissionPolicy.providerId || snapshot.model !== model)
          refuse("The delegated task is unavailable or its runtime identity changed.");
        if (!(await deps.isReportingAvailable({ fresh: true }))) refuse("Local reporting tools must be available before delegated supervision starts.");
        if (resourceLink) {
          const budget = store.readResources?.(resourceLink.rootRunId), root = store.getAggregate(resourceLink.rootRunId);
          const reservation = budget?.reservations.find((row) => row.reservationId === resourceLink.reservationId);
          if (root?.agentRun.state !== "running" || !reservation || reservation.released || reservation.executionId !== authority.executionId || reservation.childRunId !== agentRunId)
            refuse("The exact parent reservation ended during child preparation.");
        }
        const change = createAgentRun({ id: agentRunId, input, repositoryPath: snapshot.repositoryPath,
          fingerprint: { providerId: authority.permissionPolicy.providerId, model }, now: now() });
        change.agentRun = { ...change.agentRun, state: "paused", pauseReason: "paused-by-user" };
        const memberResources = resourceLink ? constrainHelperResources(store.resourceConfig!(resourceLink.rootRunId)!.policy, AdaptiveRunPolicySchema.parse(deps.freezeResources?.({ run: change.agentRun, authority })), model) : null;
        if (memberResources) requireInitialEffortSupport(memberResources);
        change.events = change.events.map((event) => ({ ...event,
          idempotencyKey: `delegated:${authority.executionId}:prepared`, detail: { ...event.detail, delegation: authority, ...(memberResources ? { resources: memberResources, resourceLink } : {}) } }));
        const created = store.create(change, now());
        if (!created.ok) refuse(created.message);
        emit(change.agentRun);
        return detailOf(agentRunId);
      }),
    activateDelegatedAgentRun: ({ agentRunId, executionId }) =>
      enqueue(() => {
        const aggregate = requireAggregate(agentRunId);
        const authority = delegatedAuthority(aggregate.agentRun);
        if (!authority || authority.executionId !== executionId) refuse("The delegated execution changed before activation.");
        requireDelegatedAssignment(aggregate.agentRun, authority);
        if (!deps.delegatedExecutionCurrent?.(agentRunId, aggregate.agentRun.leadTaskId, authority)) refuse("The delegation is no longer admitted.");
        if (!delegatedRunActivated(aggregate.agentRun)) {
          const change = resumeAgentRun({ aggregate, now: now() });
          change.events.push({ kind: "resumed", idempotencyKey: `delegated:${executionId}:activated`, detail: { delegationActivated: true } });
          applyChange(change);
        }
        void requestTick();
        return detailOf(agentRunId);
      }),
    startAgentRun: (rawInput) =>
      enqueue(async () => {
        const input = AgentRunStartInputSchema.parse(rawInput);
        const existing = store.getActiveAgentRunForTask(input.leadTaskId);
        if (existing) {
          refuse("This task already has an active run. Cancel it or wait for it to end before starting another.");
        }
        const snapshot = await deps.getTaskSupervisionSnapshot({
          workspaceId: input.workspaceId,
          taskId: input.leadTaskId,
        });
        if (!snapshot.exists || !snapshot.repositoryPath) refuse("The lead task was not found.");
        if (snapshot.archived) refuse("The lead task is archived, so a run cannot run on it.");
        if (
          (snapshot.providerId !== "claude-code" && snapshot.providerId !== "codex") ||
          !snapshot.model
        ) {
          refuse("Runs run on Claude and Codex tasks.");
        }
        if (input.routingIntent?.modelProviderId && input.routingIntent.modelProviderId !== snapshot.providerId)
          refuse("The captured provider changed before Run admission. Restore it or submit a new assignment.");
        if (!(await deps.isReportingAvailable({ fresh: true }))) {
          refuse(
            "Stave's local tools are off, so the agent could not report its stages. Turn on Local MCP in Settings, or send the assignment as a single turn.",
          );
        }
        if (input.adaptive) {
          const current = await deps.getTaskSupervisionSnapshot({ workspaceId: input.workspaceId, taskId: input.leadTaskId });
          if (!current.exists || current.archived || current.activeTurnId || current.pendingApprovalCount || current.pendingUserInputCount || current.providerId !== snapshot.providerId || current.model !== snapshot.model || deps.countActiveDelegatedTasks(input.leadTaskId) > 0)
            refuse("Start an adaptive Run on an idle task after existing turns and helpers have settled.");
          if (deps.taskRunsAsAgent && !deps.taskRunsAsAgent(input.leadTaskId)) refuse("Assign an Agent before starting adaptive resources.");
        }
        const change = createAgentRun({
          id: randomUUID(),
          input,
          repositoryPath: snapshot.repositoryPath,
          fingerprint: { providerId: snapshot.providerId, model: snapshot.model },
          now: now(),
        });
        if (input.routingIntent) change.events = change.events.map((event) => ({ ...event,
          idempotencyKey: `${change.agentRun.id}:started`, detail: { ...event.detail, routingIntent: input.routingIntent } }));
        if (input.adaptive) {
          if (input.origin !== "agent" || !store.consumeResourceTurn || !deps.freezeResources) refuse("Adaptive resources require an assigned Agent and a resource-aware host.");
          const policy = AdaptiveRunPolicySchema.parse(deps.freezeResources({ run: change.agentRun, routingIntent: input.routingIntent }));
          requireInitialEffortSupport(policy);
          change.events = change.events.map((event) => ({ ...event, idempotencyKey: `${change.agentRun.id}:started`, detail: { ...event.detail, resources: policy } }));
        }
        const created = store.create(change, now());
        if (!created.ok) refuse(created.message);
        emit(change.agentRun);
        void requestTick();
        return detailOf(change.agentRun.id);
      }),
    list: async (args = {}) => {
      const recent = args.workspaceId
        ? store.listAgentRunsForWorkspace(args.workspaceId, args.limit)
        : store.listRecentAgentRuns(args.limit);
      const active = args.includeActive ? store.listActiveAgentRuns().filter((run) => !args.workspaceId || run.workspaceId === args.workspaceId) : [];
      return { agentRuns: [...new Map([...recent, ...active].map((run) => [run.id, run])).values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    },
    get: getDetail,
    getInsights: async ({ days = 30 } = {}) => {
      const since = now().getTime() - days * 24 * 60 * 60_000;
      const samples = store
        .listRecentAgentRuns(200)
        .filter((agentRun) => !isActiveAgentRunState(agentRun.state) && Date.parse(agentRun.updatedAt) >= since)
        .map((agentRun) => ({
          agentRunId: agentRun.id,
          workspaceId: agentRun.workspaceId,
          leadTaskId: agentRun.leadTaskId,
          name: agentRun.workflow.name,
          kind: hasAgentOrigin(agentRun) ? ("agent" as const) : ("workflow" as const),
          providerId: agentRun.fingerprint.providerId,
          state: agentRun.state,
          stopReason: agentRun.stopReason,
          startedAt: agentRun.createdAt,
          endedAt: agentRun.updatedAt,
          counts: countRunEvents(store.listRecentEvents(agentRun.id, AGENT_RUN_LIMITS.maxRetainedEvents)),
          usage: usageOf(agentRun).usage ?? null,
        }));
      return aggregateAgentRunInsights(samples, days);
    },
    readUsage: ({ agentRunId }) => {
      const aggregate = store.getAggregate(agentRunId);
      return aggregate ? (usageOf(aggregate.agentRun).usage ?? null) : null;
    },
    addReportToPullRequest: async ({ agentRunId }) => {
      const detail = await getDetail({ agentRunId });
      if (!detail.report) refuse("The report is ready once the run ends.");
      const update = deps.updatePullRequestBody;
      if (!update) refuse("This version of Stave cannot edit pull requests.");
      const cwd = await deps.resolveWorkspacePath(detail.agentRun.workspaceId);
      if (!cwd) refuse("The workspace folder could not be found.");
      const markdown = formatAgentRunReportMarkdown(detail.report);
      const result = await update({
        cwd,
        merge: (body) => mergeReportIntoPullRequestBody(body, markdown),
      });
      if (!result.ok) refuse(result.detail);
      return { prUrl: result.url };
    },
    shareReport: ({ agentRunId, threadUrl }) =>
      enqueue(async () => {
        if (!SLACK_THREAD_URL.test(threadUrl)) refuse("Paste a Slack thread link, such as https://acme.slack.com/archives/C123/p456.");
        const detail = await getDetail({ agentRunId });
        if (!detail.report) refuse("The report is ready once the run ends.");
        const snapshot = await readSnapshot(detail.agentRun);
        if (!snapshot.exists || snapshot.archived || !snapshot.providerId || !snapshot.model) {
          refuse("The run's task is gone or archived, so it cannot post the report.");
        }
        if (snapshot.activeTurnId) refuse("The task is in a turn. Share the report once it finishes.");
        await deps.runSupervisedTurn({
          workspaceId: detail.agentRun.workspaceId,
          taskId: detail.agentRun.leadTaskId,
          prompt: buildShareReportPrompt(threadUrl, formatAgentRunReportMarkdown(detail.report)),
          fingerprint: { providerId: snapshot.providerId, model: snapshot.model } as AgentRunFingerprint,
          // The agent run has ended, so its consent no longer applies: the post
          // runs with the user's own settings, not the runtime's fallbacks.
          runtimeOptions: { ...deps.userPermissionOptions?.(snapshot.providerId as AgentRunFingerprint["providerId"]) },
          retrievedContextParts: [],
        });
        recordEvent(detail.agentRun, { kind: "report-shared", idempotencyKey: null, detail: { threadUrl } });
        return { shared: true as const };
      }),
    signOff: (args) =>
      command(args.agentRunId, (aggregate) =>
        signOffStage({ aggregate, expected: stageIdentity(args), now: now() }),
      ),
    requestChanges: (args) =>
      command(args.agentRunId, (aggregate) =>
        requestStageChanges({
          aggregate,
          expected: stageIdentity(args),
          feedback: args.feedback,
          now: now(),
        }),
      ),
    reply: (args) => enqueue(async () => {
      const aggregate = requireAggregate(args.agentRunId);
      const { agentRun } = aggregate, record = currentStageRecord(aggregate);
      if (record.stageId !== args.stageId || record.attempt !== args.attempt)
        throw new AgentRunCommandError("stale-identity", "The delegated stage changed. Refresh before replying.");
      const authority = delegatedAuthority(agentRun);
      const feedback = args.feedback.trim();
      if (!authority || !delegatedRunActivated(agentRun) || agentRun.state !== "running" ||
          workflowStageAt(agentRun, agentRun.currentStageIndex).kind !== "ai" || !["blocked", "stuck"].includes(record.status) ||
          !feedback || feedback.length > AGENT_RUN_LIMITS.maxFeedbackChars)
        refuse("Reply to an active blocked delegated AI stage with bounded guidance.");
      if (agentRun.turnCount >= agentRun.maxTurns) refuse("The delegated Agent has reached its turn limit. Retry with a new assignment.");
      const snapshot = await readSnapshot(agentRun);
      if (!snapshot.exists || snapshot.archived || snapshot.providerId !== agentRun.fingerprint.providerId)
        refuse("The delegated task is unavailable or its provider changed. Stop or retry the delegation.");
      if (snapshot.activeTurnId || snapshot.pendingApprovalCount || snapshot.pendingUserInputCount)
        refuse("Answer the current request or wait for the active turn before replying to this stage.");
      if (!(await deps.isReportingAvailable({ fresh: true }))) refuse("Local reporting tools must be available before the delegated Agent continues.");
      await startAgentRunTurn(aggregate, { action: "start-stage-turn", stageIndex: agentRun.currentStageIndex,
        attempt: record.attempt, reason: "continue-after-user" }, "continue-after-user",
        `The user replied to the blocked stage:\n${feedback}\n\nHandle this guidance once, continue the current stage, and report or block it using the stage tools. Do not restart the original assignment.`, true);
      return detailOf(agentRun.id);
    }),
    skipStage: (args) =>
      command(args.agentRunId, async (aggregate) =>
        skipStage({
          aggregate,
          expected: stageIdentity(args),
          now: now(),
          betweenTurns: !(await hasRunningTurn(aggregate.agentRun)),
        }),
      ),
    retryStage: (args) =>
      command(args.agentRunId, (aggregate) =>
        retryStage({ aggregate, expected: stageIdentity(args), now: now() }),
      ),
    pause: ({ agentRunId }) => {
      preparationControllers.get(agentRunId)?.abort();
      return command(agentRunId, (aggregate) => pauseAgentRun({ aggregate, reason: "paused-by-user", now: now() }));
    },
    resume: ({ agentRunId }) =>
      command(agentRunId, (aggregate) => {
        if (delegatedAuthority(aggregate.agentRun) && !delegatedRunActivated(aggregate.agentRun))
          refuse("Delegation admission did not finish. Stop or retry it from the parent task.");
        return resumeAgentRun({ aggregate, now: now() });
      }),
    takeOver: ({ agentRunId }) => {
      preparationControllers.get(agentRunId)?.abort();
      return command(agentRunId, (aggregate) => pauseAgentRun({ aggregate, reason: "taken-over", now: now() }));
    },
    acceptRuntime: ({ agentRunId }) =>
      command(agentRunId, async (aggregate) => {
        if (delegatedAuthority(aggregate.agentRun)) refuse("This delegated run keeps its admitted provider and model. Retry explicitly to change them.");
        const snapshot = await readSnapshot(aggregate.agentRun);
        if (
          (snapshot.providerId !== "claude-code" && snapshot.providerId !== "codex") ||
          !snapshot.model
        ) {
          refuse("Runs run on Claude and Codex tasks. Switch the lead task back to one of them to continue.");
        }
        return acceptAgentRunRuntime({
          aggregate,
          fingerprint: { providerId: snapshot.providerId, model: snapshot.model },
          now: now(),
        });
      }),
    // Records the composer's choice only. The reply itself is counted once, by
    // turn id, when the runtime sees the user's turn end.
    noteUserTurn: ({ agentRunId, intent }) =>
      command(agentRunId, (aggregate) => {
        if (intent === "take-over") {
          userTurnIntents.delete(agentRunId);
          return pauseAgentRun({ aggregate, reason: "taken-over", now: now() });
        }
        if (!isActiveAgentRunState(aggregate.agentRun.state)) {
          throw new AgentRunCommandError("not-active", "This run has already ended.");
        }
        userTurnIntents.set(agentRunId, intent);
        return { agentRun: aggregate.agentRun, upserts: [], events: [] };
      }),
    cancel: ({ agentRunId }) => {
      preparationControllers.get(agentRunId)?.abort();
      return command(agentRunId, (aggregate) => cancelAgentRun({ aggregate, now: now() }));
    },
    getForGrant: ({ agentRunKey }) =>
      enqueue(() => {
        const { grant, aggregate } = requireGrant(agentRunKey);
        const record = currentStageRecord(aggregate);
        if (record.stageId !== grant.stageId || record.attempt !== grant.attempt) {
          throw new AgentRunCommandError(
            "stale-identity",
            "The run has moved on from this turn's stage.",
          );
        }
        return { ...buildAgentRunBriefing(aggregate), ...(store.readResources?.(aggregate.agentRun.id) ? { resources: store.readResources!(aggregate.agentRun.id)!, stageTurnIds: store.listEventsByKind(aggregate.agentRun.id, ["turn-linked"]).filter((event) => event.detail.stageId === grant.stageId && event.detail.attempt === grant.attempt).map((event) => String(event.detail.turnId)) } : {}) };
      }),
    reportStage: ({ agentRunKey, report }) =>
      enqueue(() => {
        const { grant, aggregate } = requireGrant(agentRunKey);
        const input = StageCompleteReportInputSchema.parse(report);
        const next = applyChange(
          recordStageReport({
            aggregate,
            expected: { stageId: grant.stageId, attempt: grant.attempt },
            report: { outcome: "complete", ...input },
            turnId: grant.turnId,
            now: now(),
          }),
        );
        return receipt(
          next,
          "Recorded. Stave acts on it when this turn ends, and checks the commands and tool calls you cited against this stage's turns.",
        );
      }),
    blockStage: ({ agentRunKey, block }) =>
      enqueue(() => {
        const { grant, aggregate } = requireGrant(agentRunKey);
        const input = StageBlockInputSchema.parse(block);
        const next = applyChange(
          recordStageReport({
            aggregate,
            expected: { stageId: grant.stageId, attempt: grant.attempt },
            report: { outcome: "blocked", ...input },
            turnId: grant.turnId,
            now: now(),
          }),
        );
        return receipt(
          next,
          "Recorded. The run waits for the user when this turn ends; a reply in the task resumes the stage.",
        );
      }),
  };
}

function formatZodError(error: ZodError) {
  const issue = error.issues[0];
  if (!issue) return "The request was not valid.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Dispatches one `agent-run.invoke` request. A refused command comes back as a
 * result with its code and sentence rather than as an error, so the surface
 * can tell a stale card from a failure.
 */
export async function invokeAgentRunRuntime(
  runtime: AgentRunRuntime,
  action: HostAgentRunAction,
  args: unknown,
): Promise<AgentRunInvokeResult<unknown>> {
  try {
    return { ok: true, value: await dispatch(runtime, action, args) };
  } catch (error) {
    if (error instanceof AgentRunCommandError) {
      return { ok: false, code: error.code, message: error.message };
    }
    if (error instanceof ZodError) {
      return { ok: false, code: "invalid-args", message: formatZodError(error) };
    }
    throw error;
  }
}

function dispatch(runtime: AgentRunRuntime, action: HostAgentRunAction, args: unknown) {
  // Arguments are validated by the main-process IPC schemas and the MCP tool
  // schemas before they reach the host; start and reports re-parse their own.
  switch (action) {
    case "start":
      return runtime.startAgentRun(args as AgentRunStartInput);
    case "list":
      return runtime.list(args as AgentRunListArgs | undefined);
    case "share-report":
      return runtime.shareReport(args as { agentRunId: string; threadUrl: string });
    case "insights":
      return runtime.getInsights(args as { days?: number } | undefined);
    case "get":
      return runtime.get(args as AgentRunIdArgs);
    case "sign-off":
      return runtime.signOff(args as AgentRunStageRef);
    case "request-changes":
      return runtime.requestChanges(args as AgentRunRequestChangesArgs);
    case "reply":
      return runtime.reply(args as AgentRunRequestChangesArgs);
    case "skip-stage":
      return runtime.skipStage(args as AgentRunStageRef);
    case "retry-stage":
      return runtime.retryStage(args as AgentRunStageRef);
    case "pause":
      return runtime.pause(args as AgentRunIdArgs);
    case "resume":
      return runtime.resume(args as AgentRunIdArgs);
    case "take-over":
      return runtime.takeOver(args as AgentRunIdArgs);
    case "accept-runtime":
      return runtime.acceptRuntime(args as AgentRunIdArgs);
    case "note-user-turn":
      return runtime.noteUserTurn(args as AgentRunNoteUserTurnArgs);
    case "cancel":
      return runtime.cancel(args as AgentRunIdArgs);
    case "add-report-to-pr":
      return runtime.addReportToPullRequest(args as AgentRunIdArgs);
    case "get-for-grant":
      return runtime.getForGrant(args as { agentRunKey: string });
    case "report-stage":
      return runtime.reportStage(args as { agentRunKey: string; report: unknown });
    case "resources-for-task":
      return { rootRunId: runtime.resourceRootForTask(String((args as { taskId?: string })?.taskId ?? "")) };
    case "request-resources":
      return runtime.requestResources(args as { agentRunKey: string; request: unknown });
    case "block-stage":
      return runtime.blockStage(args as { agentRunKey: string; block: unknown });
    default:
      action satisfies never;
      throw new Error(`Unsupported run action: ${String(action)}`);
  }
}
