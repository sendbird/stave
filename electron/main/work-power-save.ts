import type { AgentRun, AgentRunEventKind, AgentRunPauseReason, AgentRunStageRecord, AgentRunState, StageBlockReason, StageStatus } from "../../src/lib/agent-runs/domain";
import type { TarsState } from "../../src/lib/tars/types";

/** One live host turn as the power rule reads it. */
export interface PowerTurn {
  turnId: string;
  /** Held on an approval or a blocking question until a person answers. */
  awaitingUser?: true;
}

/** One Agent Run as the power rule reads it. */
export interface PowerRun {
  state: AgentRunState;
  pauseReason: AgentRunPauseReason | null;
  /**
   * The usage reservation the supervisor resumes on its own: at `resumeAt`,
   * or five minutes after the pause without one. A local daily stop has none.
   */
  usageLimit?: { resumeAt: string | null };
  /** The current stage's latest attempt; null when the run has no record for it. */
  stage: { status: StageStatus; blockReason: StageBlockReason | null } | null;
  /** The host's latest user-wait marker: an approval, question or sign-off is open. */
  waitingOnUser: boolean;
}

export interface WorkPowerSnapshot {
  /** Every turn the host still runs. */
  turns: ReadonlyArray<PowerTurn>;
  /** Turns waiting on a `stave_request_secret` card only a person can answer. */
  secretWaitTurnIds: ReadonlySet<string>;
  runs: ReadonlyArray<PowerRun>;
  responsibilities: ReadonlyArray<{ state: TarsState }>;
  reasoning: boolean;
}

/** Stages that stand until a person signs off, unblocks or retries them. */
const PERSON_STAGES: ReadonlySet<StageStatus> = new Set(["awaiting-sign-off", "blocked", "stuck"]);

/** A stage blocked only because Local MCP reporting dropped restarts by itself once it is back. */
function stageWaitsForPerson(stage: PowerRun["stage"]): boolean {
  if (!stage || !PERSON_STAGES.has(stage.status)) return false;
  return !(stage.status === "blocked" && stage.blockReason === "reporting-unavailable");
}

/**
 * A running run works now or waits for an outside event Stave watches (PR
 * checks, a time, another task). A paused one only counts while it waits for
 * a usage reset under a reservation; every other pause waits for a person. An
 * open approval or question holds both, as the supervisor does.
 */
function runKeepsAwake(run: PowerRun): boolean {
  if (run.waitingOnUser) return false;
  if (run.state === "paused") return run.pauseReason === "usage-limit" && Boolean(run.usageLimit);
  return run.state === "running" && !stageWaitsForPerson(run.stage);
}

/**
 * The Mac stays awake while something runs now or Stave will continue it
 * without a person; work that only waits for a person lets it sleep.
 */
export function hasActivePowerWork(snapshot: WorkPowerSnapshot): boolean {
  return snapshot.reasoning ||
    snapshot.turns.some((turn) => !turn.awaitingUser && !snapshot.secretWaitTurnIds.has(turn.turnId)) ||
    snapshot.runs.some(runKeepsAwake) ||
    snapshot.responsibilities.some((row) => row.state === "preparing" || row.state === "running");
}

const USER_WAIT_KINDS = ["user-wait-started", "user-wait-ended"] as const satisfies readonly AgentRunEventKind[];

/** Reads one active run's power facts: its current stage's latest attempt and its latest user-wait marker. */
export function readPowerRun(store: {
  getLatestStageRecord: (id: string, stageId: string) => Pick<AgentRunStageRecord, "status" | "blockReason"> | null;
  latestEventKind: (id: string, kinds: typeof USER_WAIT_KINDS) => AgentRunEventKind | null;
}, agentRun: Pick<AgentRun, "id" | "state" | "pauseReason" | "usageLimit" | "currentStageIndex" | "workflow">): PowerRun {
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex];
  const record = stage ? store.getLatestStageRecord(agentRun.id, stage.id) : null;
  return {
    state: agentRun.state,
    pauseReason: agentRun.pauseReason,
    ...(agentRun.usageLimit ? { usageLimit: { resumeAt: agentRun.usageLimit.resumeAt } } : {}),
    stage: record ? { status: record.status, blockReason: record.blockReason } : null,
    waitingOnUser: store.latestEventKind(agentRun.id, USER_WAIT_KINDS) === "user-wait-started",
  };
}

/** One blocker shared by every run, released only after the last execution ends. */
export function createWorkPowerSaveController(blocker: {
  start: (type: "prevent-app-suspension") => number;
  stop: (id: number) => void;
}) {
  let id: number | null = null;
  const release = () => {
    if (id === null) return;
    blocker.stop(id);
    id = null;
  };
  return {
    update(snapshot: WorkPowerSnapshot) {
      if (hasActivePowerWork(snapshot)) {
        if (id === null) id = blocker.start("prevent-app-suspension");
      } else release();
    },
    dispose: release,
  };
}

/**
 * How often main re-reads every source on its own. A change signal the host
 * dropped under backlog is repaired within this, well inside macOS idle sleep.
 */
export const WORK_POWER_RESYNC_MS = 60_000;

/**
 * How long a connected host's live-turn reads may keep failing or timing out
 * before its turns stop counting: two resync intervals, so at least three
 * reads in a row a minute apart. One slow answer under backlog must not drop
 * a running turn's blocker; a host that leaves an in-memory read unanswered
 * for this long is hung, what it runs is unknown, and it must not keep the
 * Mac awake for good.
 */
export const WORK_POWER_TURNS_UNANSWERED_MS = 2 * WORK_POWER_RESYNC_MS;

export interface WorkPowerSignals {
  /** A hint that the host's live turns changed: read them again. */
  turnsChanged: () => void;
  runsChanged: () => void;
  tarsChanged: () => void;
  secretsChanged: () => void;
  ready: () => void;
  disconnected: () => void;
}

/**
 * Keeps the blocker in step with the facts, never with the signals alone:
 * live turns are pulled from the host on its handshake, on every hint and on
 * a periodic resync, so a lost hint or a host restart heals itself. Whether
 * the host's turns still count follows the host, not one read: a failed read
 * keeps the last answer while the host stays connected, a host that exits or
 * is replaced takes its turns with it, and one whose reads have failed for
 * `WORK_POWER_TURNS_UNANSWERED_MS` contributes none until it answers again.
 */
export function trackWorkPowerSave(deps: {
  blocker: Parameters<typeof createWorkPowerSaveController>[0];
  readRuns: () => ReadonlyArray<PowerRun>;
  readTars: () => Pick<WorkPowerSnapshot, "responsibilities" | "reasoning">;
  readSecretWaitTurnIds: () => ReadonlySet<string>;
  /** The host's live turns; null or a rejection when it cannot answer. */
  pullTurns: () => Promise<ReadonlyArray<PowerTurn> | null>;
  subscribe: (signals: WorkPowerSignals) => Array<() => void>;
  every?: (callback: () => void, ms: number) => () => void;
  now?: () => number;
}) {
  const controller = createWorkPowerSaveController(deps.blocker);
  // Durable runs may hold before the host's first handshake; turns cannot exist yet.
  let connected = true;
  let hostReady = false;
  let stopped = false;
  let turns: ReadonlyArray<PowerTurn> = [];
  let runs = deps.readRuns();
  let tars = deps.readTars();
  let hostGeneration = 0;
  const now = deps.now ?? Date.now;
  /** When the connected host's reads began to fail; null while its latest read answered. */
  let failingSince: number | null = null;
  let pulling = false;
  let pullAgain = false;

  const refresh = () => {
    if (stopped || !connected) return;
    controller.update({ turns, secretWaitTurnIds: deps.readSecretWaitTurnIds(), runs, ...tars });
  };
  const pull = () => {
    if (stopped || !hostReady) return;
    if (pulling) { pullAgain = true; return; }
    pulling = true;
    const generation = hostGeneration;
    void deps.pullTurns().catch(() => null).then((live) => {
      pulling = false;
      if (generation === hostGeneration) {
        if (live) {
          turns = live;
          failingSince = null;
        } else {
          failingSince ??= now();
          if (now() - failingSince >= WORK_POWER_TURNS_UNANSWERED_MS) turns = [];
        }
        refresh();
      }
      if (pullAgain) { pullAgain = false; pull(); }
    });
  };
  const resync = () => {
    if (stopped || !connected) return;
    runs = deps.readRuns();
    tars = deps.readTars();
    refresh();
    pull();
  };

  const unsubscribes = deps.subscribe({
    turnsChanged: pull,
    runsChanged: () => { runs = deps.readRuns(); refresh(); },
    tarsChanged: () => { tars = deps.readTars(); refresh(); },
    secretsChanged: refresh,
    ready: () => { connected = true; hostReady = true; hostGeneration += 1; turns = []; failingSince = null; resync(); },
    disconnected: () => { connected = false; hostReady = false; hostGeneration += 1; turns = []; failingSince = null; controller.dispose(); },
  });
  const every = deps.every ?? ((callback, ms) => {
    const timer = setInterval(callback, ms);
    timer.unref?.();
    return () => clearInterval(timer);
  });
  const stopResync = every(resync, WORK_POWER_RESYNC_MS);
  refresh();
  return () => {
    stopped = true;
    stopResync();
    for (const unsubscribe of unsubscribes) unsubscribe();
    controller.dispose();
  };
}
