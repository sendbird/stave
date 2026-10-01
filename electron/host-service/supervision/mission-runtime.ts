/**
 * Supervisor: runs missions. Each tick it reads the lead task, asks the pure
 * policy (`src/lib/missions/policy.ts`) what to do, records the result, and
 * performs the I/O the decision names: start a stage turn, send the one
 * reminder, or run a Stave action.
 *
 * Used by: `electron/host-service.ts` (constructs it, starts and stops it,
 * dispatches `mission.invoke` actions to it, and forwards finished turns).
 *
 * Beside the wake-up runtime and bound by the same rules:
 * - a user's turn always wins; the mission idles while any turn runs
 * - approvals and questions wait in the task; the mission waits with them
 * - identity or runtime drift pauses; an archived task, the turn cap or
 *   expiry stops, always with a reason
 * - every turn start is recorded before it happens, keyed, so a restart
 *   reports an interrupted start instead of replaying it
 *
 * A stage completes only through a recorded stage report or a Stave action
 * result. Reports arrive through the stage-reporting tools, which name the
 * stage by the turn's mission grant, never by ids from the model.
 */
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { validateFleetQueueAction } from "../../../src/lib/fleet/control-plane";
import type {
  MissionChangedEvent,
  MissionDetail,
  MissionIdArgs,
  MissionInvokeResult,
  MissionListArgs,
  MissionNoteUserTurnArgs,
  MissionRequestChangesArgs,
  MissionStageRef,
} from "../../../src/lib/missions/api";
import {
  buildMissionBriefing,
  buildMissionTurnContextPart,
  buildStageNudgePrompt,
  compileMissionStagePrompt,
  missionPermissionRuntimeOptions,
  type MissionBriefing,
  type MissionTurnReason,
} from "../../../src/lib/missions/briefing";
import {
  acceptMissionRuntime,
  cancelMission,
  pauseMission,
  recordStageReport,
  requestStageChanges,
  resumeMission,
  retryStage,
  signOffStage,
  skipStage,
} from "../../../src/lib/missions/commands";
import {
  buildMissionTurnKey,
  buildMissionTurnOutcomeKey,
  createMission,
  currentStageRecord,
  EMPTY_STAGE_FACTS,
  MISSION_LIMITS,
  isActiveMissionState,
  MissionCommandError,
  MissionStartInputSchema,
  playbookStageAt,
  StageBlockInputSchema,
  StageCompleteReportInputSchema,
  type Mission,
  type MissionAggregate,
  type MissionChange,
  type MissionEvent,
  type MissionEventDraft,
  type MissionFingerprint,
  type MissionStageRecord,
  type MissionStartInput,
  type StageFacts,
} from "../../../src/lib/missions/domain";
import {
  applyMissionDecision,
  decideMissionAction,
  type ActionOutcome,
  type MissionDecision,
  type MissionObservation,
  type ObservedTurn,
} from "../../../src/lib/missions/policy";
import {
  buildMissionReport,
  computeMissionMetrics,
  type MissionReport,
  type MissionWorkspaceState,
} from "../../../src/lib/missions/report";
import {
  buildShareReportPrompt,
  formatMissionReportMarkdown,
  mergeReportIntoPullRequestBody,
  SLACK_THREAD_URL,
} from "../../../src/lib/missions/report-markdown";
import { sumTurnUsage, type MissionUsage, type TurnUsageSample } from "../../../src/lib/missions/usage";
import { aggregateMissionInsights, type MissionInsights } from "../../../src/lib/missions/insights";
import type { CanonicalRetrievedContextPart, ProviderRuntimeOptions } from "../../../src/lib/providers/provider.types";
import type { MissionStore } from "../../persistence/mission-store";
import type { MissionStageGrant } from "../../providers/mission-grants";
import type { TaskSupervisionSnapshot } from "../local-mcp-runtime";
import type { HostMissionAction } from "../protocol";

/** Faster than wake-ups: a mission is actively waiting on its own turns. */
const MISSION_TICK_INTERVAL_MS = 5_000;
/** Decisions that need no I/O chain within one tick, up to this bound. */
const MAX_DECISIONS_PER_EVALUATION = 8;
const RECENT_TURN_LIMIT = 20;
const DETAIL_EVENT_LIMIT = 200;

const NO_ACTIVE_GRANT =
  "No mission stage is active in this turn. Only a turn a mission started can report a stage.";
const EMPTY_WORKSPACE_STATE: MissionWorkspaceState = {
  branch: null,
  branchPushed: false,
  openPullRequest: null,
};

const PROJECT_MEMORY_SOURCE_ID = "stave:project-memory";

type MissionStorePort = Pick<
  MissionStore,
  | "create"
  | "apply"
  | "recordEvent"
  | "getAggregate"
  | "getActiveMissionForTask"
  | "listActiveMissions"
  | "listMissionsForWorkspace"
  | "listRecentMissions"
  | "listRecentEvents"
  | "listEventsByKind"
>;

export interface MissionTurnRow {
  id: string;
  createdAt: string;
  completedAt: string | null;
}

export interface MissionRuntimeDependencies {
  store: MissionStorePort;
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
  }) => MissionTurnRow[];
  runSupervisedTurn: (args: {
    workspaceId: string;
    taskId: string;
    prompt: string;
    fingerprint: MissionFingerprint;
    runtimeOptions: ProviderRuntimeOptions;
    retrievedContextParts: CanonicalRetrievedContextPart[];
    /** Absent for a turn a Stave action asked for: it reports no stage. */
    missionStage?: MissionStageRef;
  }) => Promise<{ turnId: string }>;
  /** Closes a turn left open by a stopped host; true when it was open. */
  completeInterruptedTurn: (turnId: string) => boolean;
  countActiveDelegatedTasks: (taskId: string) => number;
  /** Whether the Local MCP server the model reports through is up. */
  isReportingAvailable: (options?: { fresh?: boolean }) => Promise<boolean>;
  resolveMissionGrant: (missionKey: string) => MissionStageGrant | null;
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
  readHeadSha: (cwd: string) => Promise<string | null>;
  readWorkspaceRevision?: (cwd: string) => Promise<import("../../../src/lib/missions/verification-contract").WorkspaceRevision>;
  collectStageFacts: (args: {
    workspaceId: string;
    taskId: string;
    cwd: string | null;
    startHeadSha: string | null;
    turnIds: ReadonlySet<string>;
    currentTurnId?: string;
  }) => Promise<StageFacts>;
  /** What a mission that ended short of its goal left behind. */
  readWorkspaceState?: (cwd: string | null) => Promise<MissionWorkspaceState>;
  /**
   * Runs the current Stave action stage. Absent until Stave actions are
   * wired, in which case an action stage blocks with a sentence.
   */
  performAction?: (args: { aggregate: MissionAggregate }) => Promise<ActionOutcome>;
  /**
   * Updates the workspace's pull request body with `merge(currentBody)`. Used
   * only for the explicit "Add to PR description" action.
   */
  updatePullRequestBody?: (args: {
    cwd: string;
    merge: (body: string) => string;
  }) => Promise<{ ok: true; url: string } | { ok: false; detail: string }>;
  /** Tells the user about a turn the mission could not start. Never throws. */
  notifyMissionProblem?: (args: { mission: Mission; detail: string }) => Promise<void> | void;
  /**
   * What the mission's project has decided, for a mission a project started;
   * null otherwise. Recalled only by missions of that project.
   */
  readProjectContext?: (projectId: string) => string | null;
  /**
   * A turn's provider-reported usage and whether it has ended; null for an
   * unknown turn. Absent: missions show no spend.
   */
  readTurnUsage?: (args: {
    workspaceId: string;
    taskId: string;
    turnId: string;
  }) => { completed: boolean; usage: TurnUsageSample | null } | null;
  emitChanged?: (event: MissionChangedEvent) => void;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export interface MissionReportReceipt {
  recorded: true;
  stage: string;
  revision: number;
  note: string;
}

export interface MissionRuntime {
  start: () => void;
  stop: () => void;
  /**
   * Evaluates active missions now instead of at the next interval. Resolves
   * when that tick has run; a tick already queued is shared.
   */
  requestTick: () => Promise<void>;
  /** Forwarded when a host-run turn finishes, so the mission reacts at once. */
  notifyTaskTurnFinished: (args: { taskId: string }) => void;
  getActiveMissionForTask: (taskId: string) => Mission | null;
  /** `projectId` is set only by the project runtime, for a mission a project started. */
  startMission: (input: MissionStartInput, options?: { projectId?: string }) => Promise<MissionDetail>;
  list: (args?: MissionListArgs) => Promise<{ missions: Mission[] }>;
  get: (args: MissionIdArgs) => Promise<MissionDetail>;
  /** What the mission's turns spent; null for an unknown mission or no usage reader. */
  readUsage: (args: MissionIdArgs) => MissionUsage | null;
  /** How missions that ended in the last `days` went, per playbook and provider. */
  getInsights: (args?: { days?: number }) => Promise<MissionInsights>;
  signOff: (args: MissionStageRef) => Promise<MissionDetail>;
  requestChanges: (args: MissionRequestChangesArgs) => Promise<MissionDetail>;
  skipStage: (args: MissionStageRef) => Promise<MissionDetail>;
  retryStage: (args: MissionStageRef) => Promise<MissionDetail>;
  pause: (args: MissionIdArgs) => Promise<MissionDetail>;
  resume: (args: MissionIdArgs) => Promise<MissionDetail>;
  takeOver: (args: MissionIdArgs) => Promise<MissionDetail>;
  acceptRuntime: (args: MissionIdArgs) => Promise<MissionDetail>;
  noteUserTurn: (args: MissionNoteUserTurnArgs) => Promise<MissionDetail>;
  cancel: (args: MissionIdArgs) => Promise<MissionDetail>;
  /** Adds the ended mission's report to its pull request body. */
  addReportToPullRequest: (args: MissionIdArgs) => Promise<{ prUrl: string }>;
  /** Posts the ended mission's report to a Slack thread through a turn on its lead task. */
  shareReport: (args: { missionId: string; threadUrl: string }) => Promise<{ shared: true }>;
  getForGrant: (args: { missionKey: string }) => Promise<MissionBriefing>;
  reportStage: (args: { missionKey: string; report: unknown }) => Promise<MissionReportReceipt>;
  blockStage: (args: { missionKey: string; block: unknown }) => Promise<MissionReportReceipt>;
}

function refuse(message: string): never {
  throw new MissionCommandError("refused", message);
}

function stageKey(record: Pick<MissionStageRecord, "missionId" | "stageId" | "attempt">) {
  return `${record.missionId}:${record.stageId}:${record.attempt}`;
}

function hasEffect(change: MissionChange, aggregate: MissionAggregate) {
  return (
    change.upserts.length > 0 ||
    change.events.length > 0 ||
    change.mission !== aggregate.mission
  );
}

function describeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function createMissionRuntime(deps: MissionRuntimeDependencies): MissionRuntime {
  const now = deps.now ?? (() => new Date());
  const setIntervalImpl = deps.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl = deps.clearInterval ?? globalThis.clearInterval;
  const { store } = deps;
  let intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  let operationChain = Promise.resolve();
  let queuedTick: Promise<void> | null = null;
  /** Turns this runtime started, per mission; hydrated from `turn-linked`. */
  const missionTurnIds = new Map<string, Set<string>>();
  /** Mission turns Stave stopped in the middle of; hydrated from `turn-interrupted`. */
  const interruptedTurnIds = new Map<string, Set<string>>();
  /** User turns already recorded as replies, per mission; hydrated from `user-turn`. */
  const userTurnIds = new Map<string, Set<string>>();
  /** The composer choice for the user's running turn, per mission. */
  const userTurnIntents = new Map<string, MissionNoteUserTurnArgs["intent"]>();
  /** The last ended turn whose facts were collected, per stage attempt. */
  const factsCollectedThrough = new Map<string, string>();
  /** What a Stave action produced, per stage attempt. */
  const actionOutcomes = new Map<string, ActionOutcome>();

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

  function emit(mission: Mission) {
    try {
      deps.emitChanged?.({
        missionId: mission.id,
        workspaceId: mission.workspaceId,
        leadTaskId: mission.leadTaskId,
        state: mission.state,
        currentStageIndex: mission.currentStageIndex,
        updatedAt: mission.updatedAt,
      });
    } catch (error) {
      console.warn("[missions] failed to announce a mission change", error);
    }
  }

  function requireAggregate(missionId: string): MissionAggregate {
    const aggregate = store.getAggregate(missionId);
    if (!aggregate) throw new MissionCommandError("not-active", `Mission not found: ${missionId}`);
    return aggregate;
  }

  function applyChange(change: MissionChange): MissionAggregate {
    store.apply(change, now());
    emit(change.mission);
    return requireAggregate(change.mission.id);
  }

  /** Records an event outside a transition and tells the surface it changed. */
  function recordEvent(mission: Mission, draft: MissionEventDraft): boolean {
    const inserted = store.recordEvent(mission.id, draft, now());
    if (inserted) emit(mission);
    return inserted;
  }

  function turnIdsFromEvents(
    cache: Map<string, Set<string>>,
    missionId: string,
    kind: "turn-linked" | "turn-interrupted" | "user-turn",
  ): Set<string> {
    let ids = cache.get(missionId);
    if (!ids) {
      ids = new Set(
        store
          .listEventsByKind(missionId, [kind])
          .flatMap((event) => (typeof event.detail.turnId === "string" ? [event.detail.turnId] : [])),
      );
      cache.set(missionId, ids);
    }
    return ids;
  }

  function turnIdsFor(missionId: string): Set<string> {
    return turnIdsFromEvents(missionTurnIds, missionId, "turn-linked");
  }

  /**
   * Counts each user turn that ended on the lead task during the mission once,
   * as a reply, keyed by its turn id.
   */
  function recordEndedUserTurns(mission: Mission, turns: readonly MissionTurnRow[], ours: Set<string>) {
    const recorded = turnIdsFromEvents(userTurnIds, mission.id, "user-turn");
    const since = Date.parse(mission.createdAt);
    for (const row of [...turns].reverse()) {
      if (!row.completedAt || ours.has(row.id) || recorded.has(row.id)) continue;
      if (Date.parse(row.createdAt) < since) continue;
      recorded.add(row.id);
      recordEvent(mission, {
        kind: "user-turn",
        idempotencyKey: `${mission.id}:user-turn:${row.id}`,
        detail: { turnId: row.id },
      });
    }
  }

  /** When the current attempt was last marked stuck. */
  function stuckAt(mission: Mission, record: MissionStageRecord): string | null {
    if (record.status !== "stuck") return null;
    return (
      store
        .listEventsByKind(mission.id, ["stage-stuck"])
        .filter((event) => event.detail.stageId === record.stageId && event.detail.attempt === record.attempt)
        .at(-1)?.createdAt ?? null
    );
  }

  /** Whether a turn, the user's or the mission's, runs on the lead task. */
  async function hasRunningTurn(mission: Mission): Promise<boolean> {
    const snapshot = await readSnapshot(mission);
    if (snapshot.activeTurnId) return true;
    if (!snapshot.exists) return false;
    return deps
      .listRecentTurns({ workspaceId: mission.workspaceId, taskId: mission.leadTaskId, limit: RECENT_TURN_LIMIT })
      .some((row) => !row.completedAt);
  }

  /** Usage of turns that ended never changes; read each once. */
  const endedTurnUsage = new Map<string, TurnUsageSample | null>();

  function usageOf(mission: Mission): MissionUsage | undefined {
    const read = deps.readTurnUsage;
    if (!read) return undefined;
    const samples = [...turnIdsFor(mission.id)].map((turnId) => {
      if (endedTurnUsage.has(turnId)) return endedTurnUsage.get(turnId)!;
      const row = read({ workspaceId: mission.workspaceId, taskId: mission.leadTaskId, turnId });
      if (row?.completed) endedTurnUsage.set(turnId, row.usage);
      return row?.usage ?? null;
    });
    return sumTurnUsage(samples);
  }

  function detailOf(missionId: string, report: MissionReport | null = null, aggregate = requireAggregate(missionId)): MissionDetail {
    const usage = usageOf(aggregate.mission);
    return {
      mission: aggregate.mission,
      stages: aggregate.stages,
      events: store.listRecentEvents(missionId, DETAIL_EVENT_LIMIT),
      report: report && usage ? { ...report, usage } : report,
      ...(usage ? { usage } : {}),
    };
  }

  async function readSnapshot(mission: Mission): Promise<TaskSupervisionSnapshot> {
    try {
      return await deps.getTaskSupervisionSnapshot({
        workspaceId: mission.workspaceId,
        taskId: mission.leadTaskId,
      });
    } catch {
      // An unreadable workspace pauses the mission; it is not a verdict that
      // the task is gone.
      return {
        workspaceId: mission.workspaceId,
        taskId: mission.leadTaskId,
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

  async function observe(aggregate: MissionAggregate): Promise<{
    observation: MissionObservation;
    turns: MissionTurnRow[];
  }> {
    const { mission } = aggregate;
    const snapshot = await readSnapshot(mission);
    // The supervisor queues work onto a task from outside it, which is the
    // staleness question the fleet control plane already answers.
    const identity = validateFleetQueueAction({
      expected: {
        repositoryPath: mission.repositoryPath,
        workspaceId: mission.workspaceId,
        taskId: mission.leadTaskId,
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
          workspaceId: mission.workspaceId,
          taskId: mission.leadTaskId,
          limit: RECENT_TURN_LIMIT,
        })
      : [];
    const ours = turnIdsFor(mission.id);
    recordEndedUserTurns(mission, turns, ours);
    const interrupted = turnIdsFromEvents(interruptedTurnIds, mission.id, "turn-interrupted");
    const toObserved = (row: Pick<MissionTurnRow, "id" | "createdAt">): ObservedTurn => ({
      turnId: row.id,
      startedBy: ours.has(row.id) ? "mission" : "user",
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
    const stage = playbookStageAt(mission, mission.currentStageIndex);
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
            ? deps.countActiveDelegatedTasks(mission.leadTaskId)
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
          activeTurn?.startedBy === "user" ? (userTurnIntents.get(mission.id) ?? null) : null,
        actionOutcome:
          stage.kind === "action" ? (actionOutcomes.get(stageKey(record)) ?? null) : null,
        stageStuckAt: stuckAt(mission, record),
      },
    };
  }

  /**
   * Records what Stave observed in the current attempt's turns once a new one
   * has ended, before the policy acts on its report.
   */
  async function refreshFacts(
    aggregate: MissionAggregate,
    observation: MissionObservation,
    turns: MissionTurnRow[],
  ): Promise<MissionAggregate> {
    const last = observation.lastEndedTurn;
    const record = currentStageRecord(aggregate);
    const { mission } = aggregate;
    if (!last || !record.startedAt) return aggregate;
    if (playbookStageAt(mission, mission.currentStageIndex).kind !== "ai") return aggregate;
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
        workspaceId: mission.workspaceId,
        taskId: mission.leadTaskId,
        cwd: await deps.resolveWorkspacePath(mission.workspaceId),
        startHeadSha: record.startHeadSha,
        turnIds,
        currentTurnId: last.turnId,
      });
      facts = { ...facts, currentTurnId: last.turnId };
    } catch (error) {
      console.warn("[missions] failed to collect stage facts", error, { missionId: mission.id });
      return aggregate;
    }
    factsCollectedThrough.set(key, last.turnId);
    return applyChange({ mission, upserts: [{ ...record, facts }], events: [] });
  }

  async function markStartFailure(missionId: string, detail: string) {
    const aggregate = store.getAggregate(missionId);
    if (!aggregate || !isActiveMissionState(aggregate.mission.state)) return;
    const snapshot = await readSnapshot(aggregate.mission);
    // A turn the user began between the tick's read and the start is not a
    // failure; the policy picks the stage up after that turn.
    if (snapshot.activeTurnId) return;
    applyChange(
      applyMissionDecision({
        aggregate,
        decision: {
          action: "mark-stuck",
          detail: `The stage's turn could not start: ${detail}`,
        },
        now: now(),
      }),
    );
    await notify(aggregate.mission, `A mission turn could not start: ${detail}`);
  }

  async function notify(mission: Mission, detail: string) {
    try {
      await deps.notifyMissionProblem?.({ mission, detail });
    } catch (error) {
      console.warn("[missions] failed to notify about a mission problem", error, {
        missionId: mission.id,
      });
    }
  }

  /**
   * Starts one mission turn. Stage turns carry the stage identity, which mints
   * the reporting grant; a turn a Stave action asked for reports nothing and
   * carries none.
   */
  async function startMissionTurn(
    aggregate: MissionAggregate,
    decision: Extract<
      MissionDecision,
      { action: "start-stage-turn" | "nudge" | "start-action-turn" }
    >,
    reason: MissionTurnReason,
    actionPrompt?: string,
  ) {
    const { mission } = aggregate;
    const before = currentStageRecord(aggregate);
    const change = applyMissionDecision({ aggregate, decision, now: now() });
    let startHeadSha = before.startHeadSha;
    if (!startHeadSha) {
      const cwd = await deps.resolveWorkspacePath(mission.workspaceId);
      startHeadSha = cwd ? await deps.readHeadSha(cwd).catch(() => null) : null;
    }
    const turnKey = buildMissionTurnKey({
      missionId: mission.id,
      stageId: before.stageId,
      attempt: before.attempt,
      turn: change.mission.turnCount,
    });
    // The turn count, the stage record and the keyed `turn-started` event are
    // written together, before the turn exists.
    const started = applyChange({
      ...change,
      upserts: change.upserts.map((record) =>
        record.stageId === before.stageId && record.attempt === before.attempt
          ? { ...record, startHeadSha }
          : record,
      ),
      events: [
        ...change.events,
        {
          kind: "turn-started",
          idempotencyKey: turnKey,
          detail: { stageId: before.stageId, attempt: before.attempt, reason },
        },
      ],
    });
    const identity = { missionId: mission.id, stageId: before.stageId, attempt: before.attempt };
    const prompt =
      actionPrompt ??
      (reason === "nudge" ? buildStageNudgePrompt(started) : compileMissionStagePrompt(started, deps.agentNames?.()));
    try {
      const turn = await deps.runSupervisedTurn({
        workspaceId: mission.workspaceId,
        taskId: mission.leadTaskId,
        prompt,
        fingerprint: mission.fingerprint,
        runtimeOptions: missionPermissionRuntimeOptions(
          mission.fingerprint.providerId,
          mission.consent.permissionMode,
        ),
        retrievedContextParts: [
          buildMissionTurnContextPart({ aggregate: started, reason }),
          ...projectContextParts(started.mission),
        ],
        ...(actionPrompt === undefined ? { missionStage: identity } : {}),
      });
      turnIdsFor(mission.id).add(turn.turnId);
      userTurnIntents.delete(mission.id);
      recordEvent(started.mission, {
        kind: "turn-linked",
        idempotencyKey: buildMissionTurnOutcomeKey(turnKey, "linked"),
        detail: { ...identity, turnId: turn.turnId },
      });
    } catch (error) {
      const detail = describeError(error, "The provider did not start the turn.");
      recordEvent(started.mission, {
        kind: "turn-failed",
        idempotencyKey: buildMissionTurnOutcomeKey(turnKey, "failed"),
        detail: { ...identity, detail: detail.slice(0, 500) },
      });
      await markStartFailure(mission.id, detail);
    }
  }

  /** Starts the turn the current action asked for; the action resumes after it. */
  async function startActionTurn(
    aggregate: MissionAggregate,
    decision: Extract<MissionDecision, { action: "start-action-turn" }>,
  ) {
    const key = stageKey(currentStageRecord(aggregate));
    const requested = actionOutcomes.get(key);
    if (requested?.status !== "needs-turn") return;
    // Consumed here, so the finished turn leads back to the action instead of
    // asking for another turn.
    actionOutcomes.set(key, { status: "in-progress" });
    await startMissionTurn(aggregate, decision, requested.reason, requested.prompt);
  }

  async function executeAction(
    aggregate: MissionAggregate,
    decision: MissionDecision,
  ): Promise<ActionOutcome> {
    const change = applyMissionDecision({ aggregate, decision, now: now() });
    const current = hasEffect(change, aggregate) ? applyChange(change) : aggregate;
    const record = currentStageRecord(current);
    const stage = playbookStageAt(current.mission, current.mission.currentStageIndex);
    // The action records its own events, such as the checks it observed.
    const lastSequence = () => store.listRecentEvents(current.mission.id, 1).at(-1)?.sequence ?? 0;
    const sequenceBefore = lastSequence();
    const outcome: ActionOutcome = deps.performAction
      ? await deps.performAction({ aggregate: current }).catch((error: unknown) => ({
          status: "failed" as const,
          detail: describeError(error, "The Stave action failed."),
        }))
      : {
          status: "failed",
          detail: `This version of Stave cannot run the "${stage.title}" action yet. Skip the stage or cancel the mission.`,
        };
    actionOutcomes.set(stageKey(record), outcome);
    if (lastSequence() !== sequenceBefore) emit(current.mission);
    if (outcome.status === "succeeded") {
      const cwd = await deps.resolveWorkspacePath(current.mission.workspaceId);
      const workspaceRevision = cwd && deps.readWorkspaceRevision ? await deps.readWorkspaceRevision(cwd) : { status: "unknown" as const, reason: "unavailable" as const };
      // The report reads the result from the stage's facts, as verified evidence.
      applyChange({
        mission: current.mission,
        upserts: [
          { ...record, facts: { ...(record.facts ?? EMPTY_STAGE_FACTS), action: outcome.result, workspaceRevision } },
        ],
        events: [],
      });
    }
    return outcome;
  }

  function projectContextParts(mission: Mission): CanonicalRetrievedContextPart[] {
    const content = mission.projectId ? deps.readProjectContext?.(mission.projectId) : null;
    return content
      ? [{ type: "retrieved_context", sourceId: PROJECT_MEMORY_SOURCE_ID, title: "Project memory", content } as CanonicalRetrievedContextPart]
      : [];
  }

  /** Runs the policy for one mission until it idles or starts a turn. */
  async function evaluate(missionId: string) {
    let aggregate = store.getAggregate(missionId);
    for (
      let step = 0;
      aggregate && isActiveMissionState(aggregate.mission.state) && step < MAX_DECISIONS_PER_EVALUATION;
      step += 1
    ) {
      const { observation, turns } = await observe(aggregate);
      aggregate = await refreshFacts(aggregate, observation, turns);
      const decision = decideMissionAction({ aggregate, observation, now: now() });
      switch (decision.action) {
        case "idle":
        case "wait":
          return;
        case "start-stage-turn":
          await startMissionTurn(aggregate, decision, decision.reason);
          return;
        case "nudge":
          await startMissionTurn(aggregate, decision, "nudge");
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
          const change = applyMissionDecision({ aggregate, decision, now: now() });
          if (hasEffect(change, aggregate)) applyChange(change);
          break;
        }
        default:
          decision satisfies never;
          return;
      }
      aggregate = store.getAggregate(missionId);
    }
  }

  async function tick() {
    for (const mission of store.listActiveMissions()) {
      try {
        await evaluate(mission.id);
      } catch (error) {
        console.error("[missions] mission evaluation failed", error, { missionId: mission.id });
      }
    }
  }

  function requestTick(): Promise<void> {
    if (queuedTick) return queuedTick;
    queuedTick = enqueue(async () => {
      queuedTick = null;
      await tick();
    }).catch((error) => {
      console.error("[missions] tick failed", error);
    });
    return queuedTick;
  }

  const INTERRUPTED_START = "Stave stopped before this stage's turn started.";

  /**
   * Closes the mission turn a stopped host left open and records it as
   * interrupted, so the stage resumes instead of spending its reminder; then
   * settles every start that never reached a turn. Returns those starts.
   */
  function closeInterruptedTurns(mission: Mission): MissionEvent[] {
    const events = store.listEventsByKind(mission.id, ["turn-started", "turn-linked", "turn-failed"]);
    const settled = new Set(
      events.flatMap((event) =>
        event.kind !== "turn-started" && event.idempotencyKey ? [event.idempotencyKey] : [],
      ),
    );
    const latestLinked = events.filter((event) => event.kind === "turn-linked").at(-1);
    const turnId = latestLinked?.detail.turnId;
    if (typeof turnId === "string" && deps.completeInterruptedTurn(turnId) && latestLinked?.idempotencyKey) {
      const turnKey = latestLinked.idempotencyKey.replace(/:linked$/, "");
      recordEvent(mission, {
        kind: "turn-interrupted",
        idempotencyKey: buildMissionTurnOutcomeKey(turnKey, "interrupted"),
        detail: { stageId: latestLinked.detail.stageId, attempt: latestLinked.detail.attempt, turnId },
      });
      interruptedTurnIds.get(mission.id)?.add(turnId);
    }
    const orphans = events.filter(
      (event) =>
        event.kind === "turn-started" &&
        event.idempotencyKey &&
        !settled.has(buildMissionTurnOutcomeKey(event.idempotencyKey, "linked")) &&
        !settled.has(buildMissionTurnOutcomeKey(event.idempotencyKey, "failed")),
    );
    for (const orphan of orphans) {
      recordEvent(mission, {
        kind: "turn-failed",
        idempotencyKey: buildMissionTurnOutcomeKey(orphan.idempotencyKey!, "failed"),
        detail: { stageId: orphan.detail.stageId, attempt: orphan.detail.attempt, detail: INTERRUPTED_START },
      });
    }
    return orphans;
  }

  /** A start that never reached a turn marks its stage stuck and tells the user. */
  async function reportInterruptedStarts(mission: Mission, orphans: readonly MissionEvent[]) {
    const aggregate = requireAggregate(mission.id);
    const record = currentStageRecord(aggregate);
    const hitsCurrentAttempt = orphans.some(
      (orphan) => orphan.detail.stageId === record.stageId && orphan.detail.attempt === record.attempt,
    );
    if (hitsCurrentAttempt && record.status === "running") {
      applyChange(
        applyMissionDecision({
          aggregate,
          decision: { action: "mark-stuck", detail: `${INTERRUPTED_START} Retry the stage to continue.` },
          now: now(),
        }),
      );
    }
    await notify(mission, `A mission turn was interrupted: ${INTERRUPTED_START}`);
  }

  /**
   * Boot sweep. The host stopped, so no mission turn is running: the latest
   * one is closed if it was left open, and a start that was recorded but never
   * reached a turn is reported and marks its stage stuck. It is never
   * replayed. Every mission's turns are closed before anyone is notified: a
   * notification loads the workspace session, which would otherwise keep a
   * turn another mission has not closed yet as running.
   */
  async function reconcileInterruptedStarts() {
    const interrupted: Array<{ mission: Mission; orphans: MissionEvent[] }> = [];
    for (const mission of store.listActiveMissions()) {
      try {
        const orphans = closeInterruptedTurns(mission);
        if (orphans.length > 0) interrupted.push({ mission, orphans });
      } catch (error) {
        console.error("[missions] failed to close an interrupted mission turn", error, {
          missionId: mission.id,
        });
      }
    }
    for (const { mission, orphans } of interrupted) {
      try {
        await reportInterruptedStarts(mission, orphans);
      } catch (error) {
        console.error("[missions] failed to reconcile an interrupted mission", error, {
          missionId: mission.id,
        });
      }
    }
  }

  function start() {
    if (intervalHandle) return;
    void enqueue(reconcileInterruptedStarts).catch((error) => {
      console.error("[missions] boot reconciliation failed", error);
    });
    intervalHandle = setIntervalImpl(() => void requestTick(), MISSION_TICK_INTERVAL_MS);
    void requestTick();
  }

  function stop() {
    if (intervalHandle) {
      clearIntervalImpl(intervalHandle);
      intervalHandle = null;
    }
  }

  async function getDetail({ missionId }: MissionIdArgs): Promise<MissionDetail> {
    let aggregate = requireAggregate(missionId);
    const { mission } = aggregate;
    if (deps.readWorkspaceRevision && aggregate.stages.some((stage) => stage.facts?.action?.type === "run-script" && stage.facts.action.verification)) {
      const cwd = await deps.resolveWorkspacePath(mission.workspaceId).catch(() => null);
      const workspaceRevision = cwd ? await deps.readWorkspaceRevision(cwd).catch(() => ({ status: "unknown" as const, reason: "unavailable" as const })) : { status: "unknown" as const, reason: "unavailable" as const };
      aggregate = { ...aggregate, stages: aggregate.stages.map((stage) => stage.facts ? { ...stage, facts: { ...stage.facts, workspaceRevision } } : stage) };
    }
    if (isActiveMissionState(mission.state)) return detailOf(missionId, null, aggregate);
    let workspace = EMPTY_WORKSPACE_STATE;
    if (mission.state !== "completed" && deps.readWorkspaceState) {
      const cwd = await deps.resolveWorkspacePath(mission.workspaceId).catch(() => null);
      workspace = await deps.readWorkspaceState(cwd).catch(() => EMPTY_WORKSPACE_STATE);
    }
    return detailOf(
      missionId,
      buildMissionReport({
        aggregate,
        workspace,
        endedAt: new Date(mission.updatedAt),
        events: store.listRecentEvents(missionId, MISSION_LIMITS.maxRetainedEvents),
      }),
      aggregate,
    );
  }

  /** A user command: one pure transition, applied, then a tick to act on it. */
  function command(
    missionId: string,
    build: (aggregate: MissionAggregate) => MissionChange | Promise<MissionChange>,
  ): Promise<MissionDetail> {
    return enqueue(async () => {
      const aggregate = requireAggregate(missionId);
      const change = await build(aggregate);
      if (hasEffect(change, aggregate)) applyChange(change);
      void requestTick();
      return detailOf(missionId);
    });
  }

  function stageIdentity(args: MissionStageRef) {
    return { stageId: args.stageId, attempt: args.attempt };
  }

  /** The grant's stage, refused once the turn ended or the stage moved on. */
  function requireGrant(missionKey: string): { grant: MissionStageGrant; aggregate: MissionAggregate } {
    const grant = deps.resolveMissionGrant(missionKey);
    if (!grant) throw new MissionCommandError("stale-identity", NO_ACTIVE_GRANT);
    const aggregate = requireAggregate(grant.missionId);
    if (aggregate.mission.leadTaskId !== grant.taskId) {
      throw new MissionCommandError("stale-identity", NO_ACTIVE_GRANT);
    }
    return { grant, aggregate };
  }

  function receipt(aggregate: MissionAggregate, note: string): MissionReportReceipt {
    const record = currentStageRecord(aggregate);
    return {
      recorded: true,
      stage: playbookStageAt(aggregate.mission, aggregate.mission.currentStageIndex).title,
      revision: record.reportRevision,
      note,
    };
  }

  return {
    start,
    stop,
    requestTick,
    notifyTaskTurnFinished: ({ taskId }) => {
      if (store.getActiveMissionForTask(taskId)) void requestTick();
    },
    getActiveMissionForTask: (taskId) => store.getActiveMissionForTask(taskId),
    startMission: (rawInput, options) =>
      enqueue(async () => {
        const input = MissionStartInputSchema.parse(rawInput);
        const existing = store.getActiveMissionForTask(input.leadTaskId);
        if (existing) {
          refuse("This task is already running a mission. Cancel it or wait for it to end before starting another.");
        }
        const snapshot = await deps.getTaskSupervisionSnapshot({
          workspaceId: input.workspaceId,
          taskId: input.leadTaskId,
        });
        if (!snapshot.exists || !snapshot.repositoryPath) refuse("The lead task was not found.");
        if (snapshot.archived) refuse("The lead task is archived, so a mission cannot run on it.");
        if (
          (snapshot.providerId !== "claude-code" && snapshot.providerId !== "codex") ||
          !snapshot.model
        ) {
          refuse("Missions run on Claude and Codex tasks.");
        }
        if (!(await deps.isReportingAvailable({ fresh: true }))) {
          refuse(
            "Stave's local tools are off, so the agent could not report its stages. Turn on Local MCP in Settings, or send the assignment as a single turn.",
          );
        }
        const change = createMission({
          id: randomUUID(),
          input,
          repositoryPath: snapshot.repositoryPath,
          fingerprint: { providerId: snapshot.providerId, model: snapshot.model },
          now: now(),
          projectId: options?.projectId ?? null,
        });
        const created = store.create(change, now());
        if (!created.ok) refuse(created.message);
        emit(change.mission);
        void requestTick();
        return detailOf(change.mission.id);
      }),
    list: async (args = {}) => ({
      missions: args.workspaceId
        ? store.listMissionsForWorkspace(args.workspaceId, args.limit)
        : store.listRecentMissions(args.limit),
    }),
    get: getDetail,
    getInsights: async ({ days = 30 } = {}) => {
      const since = now().getTime() - days * 24 * 60 * 60_000;
      const samples = store
        .listRecentMissions(200)
        .filter((mission) => !isActiveMissionState(mission.state) && Date.parse(mission.updatedAt) >= since)
        .map((mission) => ({
          playbookName: mission.playbook.name,
          providerId: mission.fingerprint.providerId,
          state: mission.state,
          metrics: computeMissionMetrics({
            providerId: mission.fingerprint.providerId,
            events: store.listRecentEvents(mission.id, MISSION_LIMITS.maxRetainedEvents),
          }),
          usage: usageOf(mission) ?? null,
        }));
      return aggregateMissionInsights(samples, days);
    },
    readUsage: ({ missionId }) => {
      const aggregate = store.getAggregate(missionId);
      return aggregate ? (usageOf(aggregate.mission) ?? null) : null;
    },
    addReportToPullRequest: async ({ missionId }) => {
      const detail = await getDetail({ missionId });
      if (!detail.report) refuse("The report is ready once the mission ends.");
      const update = deps.updatePullRequestBody;
      if (!update) refuse("This version of Stave cannot edit pull requests.");
      const cwd = await deps.resolveWorkspacePath(detail.mission.workspaceId);
      if (!cwd) refuse("The workspace folder could not be found.");
      const markdown = formatMissionReportMarkdown(detail.report);
      const result = await update({
        cwd,
        merge: (body) => mergeReportIntoPullRequestBody(body, markdown),
      });
      if (!result.ok) refuse(result.detail);
      return { prUrl: result.url };
    },
    shareReport: ({ missionId, threadUrl }) =>
      enqueue(async () => {
        if (!SLACK_THREAD_URL.test(threadUrl)) refuse("Paste a Slack thread link, such as https://acme.slack.com/archives/C123/p456.");
        const detail = await getDetail({ missionId });
        if (!detail.report) refuse("The report is ready once the mission ends.");
        const snapshot = await readSnapshot(detail.mission);
        if (!snapshot.exists || snapshot.archived || !snapshot.providerId || !snapshot.model) {
          refuse("The mission's task is gone or archived, so it cannot post the report.");
        }
        if (snapshot.activeTurnId) refuse("The task is in a turn. Share the report once it finishes.");
        await deps.runSupervisedTurn({
          workspaceId: detail.mission.workspaceId,
          taskId: detail.mission.leadTaskId,
          prompt: buildShareReportPrompt(threadUrl, formatMissionReportMarkdown(detail.report)),
          fingerprint: { providerId: snapshot.providerId, model: snapshot.model } as MissionFingerprint,
          runtimeOptions: {},
          retrievedContextParts: [],
        });
        recordEvent(detail.mission, { kind: "report-shared", idempotencyKey: null, detail: { threadUrl } });
        return { shared: true as const };
      }),
    signOff: (args) =>
      command(args.missionId, (aggregate) =>
        signOffStage({ aggregate, expected: stageIdentity(args), now: now() }),
      ),
    requestChanges: (args) =>
      command(args.missionId, (aggregate) =>
        requestStageChanges({
          aggregate,
          expected: stageIdentity(args),
          feedback: args.feedback,
          now: now(),
        }),
      ),
    skipStage: (args) =>
      command(args.missionId, async (aggregate) =>
        skipStage({
          aggregate,
          expected: stageIdentity(args),
          now: now(),
          betweenTurns: !(await hasRunningTurn(aggregate.mission)),
        }),
      ),
    retryStage: (args) =>
      command(args.missionId, (aggregate) =>
        retryStage({ aggregate, expected: stageIdentity(args), now: now() }),
      ),
    pause: ({ missionId }) =>
      command(missionId, (aggregate) =>
        pauseMission({ aggregate, reason: "paused-by-user", now: now() }),
      ),
    resume: ({ missionId }) =>
      command(missionId, (aggregate) => resumeMission({ aggregate, now: now() })),
    takeOver: ({ missionId }) =>
      command(missionId, (aggregate) =>
        pauseMission({ aggregate, reason: "taken-over", now: now() }),
      ),
    acceptRuntime: ({ missionId }) =>
      command(missionId, async (aggregate) => {
        const snapshot = await readSnapshot(aggregate.mission);
        if (
          (snapshot.providerId !== "claude-code" && snapshot.providerId !== "codex") ||
          !snapshot.model
        ) {
          refuse("Missions run on Claude and Codex tasks. Switch the lead task back to one of them to continue.");
        }
        return acceptMissionRuntime({
          aggregate,
          fingerprint: { providerId: snapshot.providerId, model: snapshot.model },
          now: now(),
        });
      }),
    // Records the composer's choice only. The reply itself is counted once, by
    // turn id, when the runtime sees the user's turn end.
    noteUserTurn: ({ missionId, intent }) =>
      command(missionId, (aggregate) => {
        if (intent === "take-over") {
          userTurnIntents.delete(missionId);
          return pauseMission({ aggregate, reason: "taken-over", now: now() });
        }
        if (!isActiveMissionState(aggregate.mission.state)) {
          throw new MissionCommandError("not-active", "This mission has already ended.");
        }
        userTurnIntents.set(missionId, intent);
        return { mission: aggregate.mission, upserts: [], events: [] };
      }),
    cancel: ({ missionId }) =>
      command(missionId, (aggregate) => cancelMission({ aggregate, now: now() })),
    getForGrant: ({ missionKey }) =>
      enqueue(() => {
        const { grant, aggregate } = requireGrant(missionKey);
        const record = currentStageRecord(aggregate);
        if (record.stageId !== grant.stageId || record.attempt !== grant.attempt) {
          throw new MissionCommandError(
            "stale-identity",
            "The mission has moved on from this turn's stage.",
          );
        }
        return buildMissionBriefing(aggregate);
      }),
    reportStage: ({ missionKey, report }) =>
      enqueue(() => {
        const { grant, aggregate } = requireGrant(missionKey);
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
    blockStage: ({ missionKey, block }) =>
      enqueue(() => {
        const { grant, aggregate } = requireGrant(missionKey);
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
          "Recorded. The mission waits for the user when this turn ends; a reply in the task resumes the stage.",
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
 * Dispatches one `mission.invoke` request. A refused command comes back as a
 * result with its code and sentence rather than as an error, so the surface
 * can tell a stale card from a failure.
 */
export async function invokeMissionRuntime(
  runtime: MissionRuntime,
  action: HostMissionAction,
  args: unknown,
): Promise<MissionInvokeResult<unknown>> {
  try {
    return { ok: true, value: await dispatch(runtime, action, args) };
  } catch (error) {
    if (error instanceof MissionCommandError) {
      return { ok: false, code: error.code, message: error.message };
    }
    if (error instanceof ZodError) {
      return { ok: false, code: "invalid-args", message: formatZodError(error) };
    }
    throw error;
  }
}

function dispatch(runtime: MissionRuntime, action: HostMissionAction, args: unknown) {
  // Arguments are validated by the main-process IPC schemas and the MCP tool
  // schemas before they reach the host; start and reports re-parse their own.
  switch (action) {
    case "start":
      return runtime.startMission(args as MissionStartInput);
    case "list":
      return runtime.list(args as MissionListArgs | undefined);
    case "share-report":
      return runtime.shareReport(args as { missionId: string; threadUrl: string });
    case "insights":
      return runtime.getInsights(args as { days?: number } | undefined);
    case "get":
      return runtime.get(args as MissionIdArgs);
    case "sign-off":
      return runtime.signOff(args as MissionStageRef);
    case "request-changes":
      return runtime.requestChanges(args as MissionRequestChangesArgs);
    case "skip-stage":
      return runtime.skipStage(args as MissionStageRef);
    case "retry-stage":
      return runtime.retryStage(args as MissionStageRef);
    case "pause":
      return runtime.pause(args as MissionIdArgs);
    case "resume":
      return runtime.resume(args as MissionIdArgs);
    case "take-over":
      return runtime.takeOver(args as MissionIdArgs);
    case "accept-runtime":
      return runtime.acceptRuntime(args as MissionIdArgs);
    case "note-user-turn":
      return runtime.noteUserTurn(args as MissionNoteUserTurnArgs);
    case "cancel":
      return runtime.cancel(args as MissionIdArgs);
    case "add-report-to-pr":
      return runtime.addReportToPullRequest(args as MissionIdArgs);
    case "get-for-grant":
      return runtime.getForGrant(args as { missionKey: string });
    case "report-stage":
      return runtime.reportStage(args as { missionKey: string; report: unknown });
    case "block-stage":
      return runtime.blockStage(args as { missionKey: string; block: unknown });
    default:
      action satisfies never;
      throw new Error(`Unsupported mission action: ${String(action)}`);
  }
}
