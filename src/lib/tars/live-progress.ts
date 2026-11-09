import { i18n, type I18nKey } from "@/i18n/runtime";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState, type AgentRun, type AgentRunEvent } from "@/lib/agent-runs/domain";
import { describeToolActivity, selectLatestTurnTool } from "@/lib/agent-runs/now-line";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { isTarsResponsibilityTerminal } from "./attention";
import { projectTarsRunProgress, type TarsFlowStage } from "./flow-model";
import type { TarsResponsibility } from "./types";

/**
 * How long running work may go without any observation (a run change, a run
 * event, a turn event the host relayed) before its progress is shown as out of
 * date. The same quiet span after which a provider turn counts as stalled
 * (`PROVIDER_TURN_STALL_THRESHOLD_MS`), so the two never disagree.
 */
export const TARS_PROGRESS_STALE_MS = 5 * 60_000;

/** How many recent progress entries a projection keeps by default. */
export const TARS_RECENT_PROGRESS_LIMIT = 5;

/**
 * Running work holds the single active slot: its state is running, or it is
 * preparing with a run already created (`tars-runtime.ts`). Queued, paused,
 * waiting and taken-over work is not running, whatever lane it sits in.
 */
export function isTarsWorkRunning(row: Pick<TarsResponsibility, "state" | "agentRunId">) {
  return row.state === "running" || (row.state === "preparing" && Boolean(row.agentRunId));
}

/**
 * How current what Stave shows about the work is:
 * - `live`: the run's turn reported a step (a tool call) within the span;
 * - `recent`: observed within `TARS_PROGRESS_STALE_MS`, no turn streaming
 *   (between turns, or work that is not running);
 * - `stale`: running work with nothing observed for longer than that, or
 *   whose turn the provider watchdog marked stalled;
 * - `none`: no run has been observed for this work in this window.
 */
export type TarsProgressFreshness = "live" | "recent" | "stale" | "none";

/** One thing the run recorded, as a sentence; `attention` marks a block, a stall or a wait on the user. */
export interface TarsProgressEntry {
  id: string;
  at: string;
  text: string;
  tone: "done" | "attention" | "neutral";
}

export interface TarsLiveStage extends TarsFlowStage {
  /** 1-based place among the workflow's stages. */
  position: number;
  total: number;
}

/**
 * What this window knows about the run's turn, for running work only:
 * `active`, a turn is open (it may not have reported a step yet); `ended`, the
 * last relayed turn finished; `unknown`, no turn was relayed to this window
 * (for example right after a restart, before its next event arrives).
 */
export type TarsTurnObservation = "active" | "ended" | "unknown";

/** What Stave observed about one piece of work, for every surface that says it is running. */
export interface TarsLiveProgress {
  responsibilityId: string;
  running: boolean;
  /** The stage the active run is on; null when no run was read or the run is not active. */
  stage: TarsLiveStage | null;
  /** The run's turn as this window knows it; `unknown` for work that is not running. */
  turn: TarsTurnObservation;
  /**
   * The step the run's turn last reported (its latest tool call) and when;
   * null when the turn reported none. Never made up from the turn being open.
   */
  activity: { text: string; at: number } | null;
  /** Recent run events, newest first. Empty when the run recorded none or was not read. */
  recent: TarsProgressEntry[];
  /** The newest observation in epoch milliseconds; null when nothing was observed. */
  observedAt: number | null;
  freshness: TarsProgressFreshness;
}

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newest(values: ReadonlyArray<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const value of values) if (typeof value === "number" && Number.isFinite(value) && (best === null || value > best)) best = value;
  return best;
}

/** The newest time the run itself recorded: its own change, its newest event, a stage attempt starting or ending, the host's look at its wait. */
export function tarsRunObservedAt(detail: AgentRunDetail): number | null {
  return newest([
    ms(detail.agentRun.updatedAt),
    ms(detail.events.at(-1)?.createdAt),
    ...detail.stages.flatMap((record) => [ms(record.startedAt), ms(record.endedAt)]),
    ms(detail.eventWaitObservedAt),
  ]);
}

/**
 * The turn's newest relayed event: its steps and its end. `lastEventAt` is
 * left out on purpose: adopting a turn after a reload, or answering one of
 * its prompts, sets it to "now" without any event from the run, so it would
 * make a long-quiet run look live.
 */
function turnObservedAt(activity: ProviderTurnActivitySnapshot | null | undefined): number | null {
  if (!activity) return null;
  return newest([activity.completedAt, ...activity.orderedWorkItemIds.map((id) => activity.workItemsById[id]?.updatedAt)]);
}

/** The step the turn last reported, in plain words, with the time it was reported. */
function turnActivityOf(activity: ProviderTurnActivitySnapshot | null): TarsLiveProgress["activity"] {
  const tool = selectLatestTurnTool(activity ?? undefined);
  return tool && Number.isFinite(tool.updatedAt)
    ? { text: describeToolActivity({ toolName: tool.toolName ?? tool.title, detail: tool.detail }), at: tool.updatedAt }
    : null;
}

function stageTitle(agentRun: AgentRun, stageId: unknown): string | null {
  if (typeof stageId !== "string") return null;
  const stage = agentRun.workflow.stages.find((candidate) => candidate.id === stageId);
  return stage ? getStageDisplayTitle(stage) : null;
}

/** A namespaced translation key, the form `i18n.t` takes with interpolation values. */
type ShellKey = Extract<I18nKey, `shell:${string}`>;
type EventSentence = { key: ShellKey; tone: TarsProgressEntry["tone"]; params?: Record<string, string | number> } | null;

const USER_WAIT_KEYS = {
  approval: "shell:tars.live.event.userWait.approval",
  question: "shell:tars.live.event.userWait.question",
  "sign-off": "shell:tars.live.event.userWait.signOff",
} as const satisfies Record<string, ShellKey>;

const ENDED_KEYS = {
  completed: "shell:tars.live.event.ended.completed",
  cancelled: "shell:tars.live.event.ended.cancelled",
  stopped: "shell:tars.live.event.ended.stopped",
} as const satisfies Record<string, ShellKey>;

function lookup<T extends Record<string, ShellKey>>(map: T, key: unknown): T[keyof T] | null {
  return typeof key === "string" && Object.hasOwn(map, key) ? map[key as keyof T] : null;
}

/**
 * The sentence for one recorded run event, or null for bookkeeping the reader
 * does not need (resource ledger rows, turn links, nudges). A stage event
 * whose stage the workflow does not name is left out rather than guessed.
 */
function describeEvent(agentRun: AgentRun, event: AgentRunEvent): EventSentence {
  const detail = event.detail;
  const stage = stageTitle(agentRun, detail.stageId);
  const staged = (key: ShellKey, tone: TarsProgressEntry["tone"], params: Record<string, string | number> = {}): EventSentence =>
    stage ? { key, tone, params: { stage, ...params } } : null;
  switch (event.kind) {
    case "agent-run-started": return { key: "shell:tars.live.event.runStarted", tone: "neutral" };
    case "turn-started": return staged("shell:tars.live.event.turnStarted", "neutral");
    case "turn-failed": return { key: "shell:tars.live.event.turnFailed", tone: "attention" };
    case "turn-interrupted": return { key: "shell:tars.live.event.turnInterrupted", tone: "attention" };
    case "report": return staged(detail.outcome === "blocked" ? "shell:tars.live.event.reportedBlocked" : "shell:tars.live.event.reported",
      detail.outcome === "blocked" ? "attention" : "neutral");
    case "stage-completed": return staged("shell:tars.live.event.stageCompleted", "done");
    case "stage-skipped": return staged("shell:tars.live.event.stageSkipped", "neutral");
    case "stage-retried": return staged("shell:tars.live.event.stageRetried", "neutral", { attempt: Number(detail.attempt ?? 2) });
    case "stage-blocked": return staged("shell:tars.live.event.stageBlocked", "attention");
    case "stage-stuck": return staged("shell:tars.live.event.stageStuck", "attention");
    case "sign-off": return staged("shell:tars.live.event.signedOff", "done");
    case "changes-requested": return staged("shell:tars.live.event.changesRequested", "attention");
    case "checks-observed": return staged("shell:tars.live.event.checksObserved", "neutral");
    case "paused": return { key: "shell:tars.live.event.paused", tone: "neutral" };
    case "resumed": return { key: "shell:tars.live.event.resumed", tone: "neutral" };
    case "user-wait-started": {
      const key = lookup(USER_WAIT_KEYS, detail.reason);
      return key ? { key, tone: "attention" } : null;
    }
    case "user-wait-ended": return { key: "shell:tars.live.event.userWaitEnded", tone: "neutral" };
    case "wait-registered": return { key: "shell:tars.live.event.waitRegistered", tone: "neutral" };
    case "wait-woke": return { key: "shell:tars.live.event.waitWoke", tone: "neutral" };
    case "wait-expired": return { key: "shell:tars.live.event.waitExpired", tone: "attention" };
    case "account-switched": return { key: "shell:tars.live.event.accountSwitched", tone: "neutral" };
    case "agent-run-ended": {
      const key = lookup(ENDED_KEYS, detail.outcome);
      return { key: key ?? "shell:tars.live.event.ended.other", tone: detail.outcome === "completed" ? "done" : "attention" };
    }
    case "host-stopped": return { key: "shell:tars.live.event.hostStopped", tone: "attention" };
    case "host-started": return { key: "shell:tars.live.event.hostStarted", tone: "neutral" };
    default: return null;
  }
}

/**
 * The run's recent progress, newest first: what it recorded, in plain
 * sentences. Repeated identical sentences in a row (several turns of one
 * stage) collapse to the newest, so a burst of turns does not push every
 * other change out of the list.
 */
export function selectTarsRecentProgress(detail: AgentRunDetail, limit = TARS_RECENT_PROGRESS_LIMIT): TarsProgressEntry[] {
  const entries: TarsProgressEntry[] = [];
  for (const event of [...detail.events].sort((a, b) => b.sequence - a.sequence)) {
    if (entries.length >= limit) break;
    const sentence = describeEvent(detail.agentRun, event);
    if (!sentence) continue;
    const text = i18n.t(sentence.key, sentence.params ?? {});
    if (entries.at(-1)?.text === text) continue;
    entries.push({ id: event.id, at: event.createdAt, text, tone: sentence.tone });
  }
  return entries;
}

/**
 * What Stave observed about one piece of work: the stage its active run is
 * on, what the run's turn is doing (only from the turn's own events, only
 * while the work is running), the run's recent progress, and how current all
 * of it is. Never inferred from the responsibility's state alone: without a
 * run read in this window there is no stage, no activity and freshness `none`.
 */
export function projectTarsLiveProgress(args: {
  row: Pick<TarsResponsibility, "id" | "state" | "agentRunId">;
  run: AgentRunDetail | undefined;
  /** The provider turn activity of the work's task (the run's lead task), as relayed to this window. */
  turnActivity?: ProviderTurnActivitySnapshot | null;
  now: number;
  recentLimit?: number;
}): TarsLiveProgress {
  const { row, run, now } = args;
  const running = isTarsWorkRunning(row);
  if (!run) return { responsibilityId: row.id, running, stage: null, turn: "unknown", activity: null, recent: [], observedAt: null, freshness: "none" };
  const active = isActiveAgentRunState(run.agentRun.state) && !isTarsResponsibilityTerminal(row);
  const progress = projectTarsRunProgress(run);
  const current = progress.current;
  const stage = active && current ? { ...current, position: progress.stages.indexOf(current) + 1, total: progress.total } : null;
  // The turn's words only speak for running work whose run is active: a paused or waiting run has no live turn to describe.
  const turn = running && active ? args.turnActivity ?? null : null;
  const open = Boolean(turn && !turn.completedAt);
  // Only a step the open turn reported is "what it is doing now"; a finished turn's last step is history.
  const activity = open ? turnActivityOf(turn) : null;
  const observedAt = newest([tarsRunObservedAt(run), turnObservedAt(turn)]);
  const streaming = Boolean(activity && !turn?.stalledAt && now - activity.at < TARS_PROGRESS_STALE_MS);
  const stalled = Boolean(open && turn?.stalledAt);
  const freshness: TarsProgressFreshness = streaming ? "live"
    : running && (stalled || observedAt === null || now - observedAt >= TARS_PROGRESS_STALE_MS) ? "stale" : "recent";
  return { responsibilityId: row.id, running, stage, turn: !running || !turn ? "unknown" : open ? "active" : "ended", activity,
    recent: selectTarsRecentProgress(run, args.recentLimit), observedAt, freshness };
}
