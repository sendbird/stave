import type { AgentRunAggregate, AgentRunEvent, AgentRunPauseReason, AgentRunState, StageStatus } from "../../src/lib/agent-runs/domain";
import { latestStageRecord } from "../../src/lib/agent-runs/domain";
import type { TarsState } from "../../src/lib/tars/types";

/** One Agent Run as the power rule reads it. */
export interface PowerRun {
  state: AgentRunState;
  pauseReason: AgentRunPauseReason | null;
  /**
   * The usage reservation the supervisor resumes on its own: at `resumeAt`,
   * or five minutes after the pause without one. A local daily stop has none.
   */
  usageLimit?: { resumeAt: string | null };
  /** The current stage's latest status; null when the run has no record for it. */
  stageStatus: StageStatus | null;
  /** The host's latest user-wait marker: an approval, question or sign-off is open. */
  waitingOnUser: boolean;
}

export interface WorkPowerSnapshot {
  /** Every turn the host still runs; `awaitingUser` while it is held on an approval or question. */
  turns: ReadonlyArray<{ awaitingUser?: true }>;
  runs: ReadonlyArray<PowerRun>;
  responsibilities: ReadonlyArray<{ state: TarsState }>;
  reasoning: boolean;
}

/** Stages that stand until a person signs off, unblocks or retries them. */
const PERSON_STAGES: ReadonlySet<StageStatus> = new Set(["awaiting-sign-off", "blocked", "stuck"]);

/**
 * A running run works now or waits for an outside event Stave watches (PR
 * checks, a time, another task). A paused one only counts while it waits for
 * a usage reset under a reservation; every other pause waits for a person. An
 * open approval or question holds both, as the supervisor does.
 */
function runKeepsAwake(run: PowerRun): boolean {
  if (run.waitingOnUser) return false;
  if (run.state === "paused") return run.pauseReason === "usage-limit" && Boolean(run.usageLimit);
  return run.state === "running" && !(run.stageStatus && PERSON_STAGES.has(run.stageStatus));
}

/**
 * The Mac stays awake while something runs now or Stave will continue it
 * without a person; work that only waits for a person lets it sleep.
 */
export function hasActivePowerWork(snapshot: WorkPowerSnapshot): boolean {
  return snapshot.reasoning || snapshot.turns.some((turn) => !turn.awaitingUser) || snapshot.runs.some(runKeepsAwake) ||
    snapshot.responsibilities.some((row) => row.state === "preparing" || row.state === "running");
}

/** Reads one active run's power facts from the run store. */
export function readPowerRun(store: {
  getAggregate: (id: string) => AgentRunAggregate | null;
  listEventsByKind: (id: string, kinds: readonly ["user-wait-started", "user-wait-ended"]) => AgentRunEvent[];
}, id: string): PowerRun | null {
  const aggregate = store.getAggregate(id);
  if (!aggregate) return null;
  const { agentRun } = aggregate;
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex];
  return {
    state: agentRun.state,
    pauseReason: agentRun.pauseReason,
    ...(agentRun.usageLimit ? { usageLimit: { resumeAt: agentRun.usageLimit.resumeAt } } : {}),
    stageStatus: stage ? latestStageRecord(aggregate.stages, stage.id)?.status ?? null : null,
    waitingOnUser: store.listEventsByKind(id, ["user-wait-started", "user-wait-ended"]).at(-1)?.kind === "user-wait-started",
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

/** Subscribe before the first read so startup and reconnect cannot miss an active run. */
export function trackWorkPowerSave(deps: {
  blocker: Parameters<typeof createWorkPowerSaveController>[0];
  read: () => WorkPowerSnapshot;
  subscribe: (handlers: { changed: () => void; ready: () => void; disconnected: () => void }) => Array<() => void>;
}) {
  const controller = createWorkPowerSaveController(deps.blocker);
  let connected = true;
  const refresh = () => { if (connected) controller.update(deps.read()); };
  const unsubscribes = deps.subscribe({ changed: refresh,
    ready: () => { connected = true; refresh(); },
    disconnected: () => { connected = false; controller.dispose(); },
  });
  refresh();
  return () => { connected = false; for (const unsubscribe of unsubscribes) unsubscribe(); controller.dispose(); };
}
