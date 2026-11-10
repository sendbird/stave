import type { AgentRunUsage } from "@/lib/agent-runs/usage";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import { collectTarsAttention, isTarsResponsibilityTerminal, selectTarsAttentionRows, tarsLaneOf, type TarsAttentionRowLike, type TarsLane } from "./attention";
import { projectTarsRunProgress, tarsFleetTarget, tarsRunOf, type TarsRunProgress } from "./flow-model";
import { tarsConfirmationRequestId } from "./conversation";
import type { TarsSideViewTarget } from "./side-view";
import { isTarsTaskOperation, type TarsControlOperation, type TarsFollowUpState, type TarsPendingDecision, type TarsResponsibility, type TarsSnapshot } from "./types";
import { tarsQueueOf } from "./queue-order";
import { isTarsWorkRunning } from "./live-progress";

/** The view width at which the tray stays open beside the conversation. */
export const TARS_TRAY_PINNED_MIN_WIDTH = 1088;
/** The pinned tray's column, in pixels (26rem); the side view takes the same column at the same width. */
export const TARS_TRAY_WIDTH = 416;
/** The conversation never gets narrower than this while the tray is pinned. */
export const TARS_CONVERSATION_MIN_WIDTH = 440;

/**
 * Whether the tray can speak about the work: `checking` before the first
 * successful read, `unavailable` when no read succeeded. Only `ready` may say
 * "no work"; an unknown list is never an empty one.
 */
export type TarsTrayStatus = "checking" | "unavailable" | "ready";

export function tarsTrayStatus(args: { bridge: boolean; snapshot: unknown; error: string | null }): TarsTrayStatus {
  if (args.snapshot) return "ready";
  return !args.bridge || args.error ? "unavailable" : "checking";
}

/**
 * The proposals the user may still confirm, as their confirmation request ids:
 * live decisions of the last snapshot only. Null while no snapshot was read,
 * so a proposal is never offered on a guess.
 */
export function tarsPendingProposalKeys(snapshot: Pick<TarsSnapshot, "responsibilities" | "pendingDecisions"> | null | undefined): ReadonlySet<string> | null {
  if (!snapshot) return null;
  return new Set(collectTarsAttention(snapshot).flatMap((signal) =>
    signal.decision ? [tarsConfirmationRequestId(signal.decision.messageId, signal.decision.actionIndex)] : []));
}

/** The fields of a Fleet attention row the tray reads. */
export interface TarsTrayAttentionInput extends TarsAttentionRowLike {
  id: string;
  kind: string;
  detail?: string;
}

/** A proposed control waiting for the user's Confirm, at the revision it was proposed for. */
export interface TarsTrayDecision {
  messageId: string;
  actionIndex: number;
  responsibilityId: string;
  operation: TarsControlOperation;
  expectedRevision: number;
}

export interface TarsTrayAttentionRow<T extends TarsTrayAttentionInput> {
  item: T;
  /** Set on a `tars-decision` row whose proposal is still live. */
  decision: TarsTrayDecision | null;
}

/**
 * Tars's next automatic look at the work, as the host reports it
 * (`TarsSnapshot.followUps`): pending, deferred until the next window,
 * following, exhausted, or the next check of waiting work. A next check whose
 * time has passed shows nothing: no further check is scheduled for it.
 */
export interface TarsTrayFollowUp { status: TarsFollowUpState["status"]; at: string | null }

export function tarsTrayFollowUp(row: TarsResponsibility, followUps: readonly TarsFollowUpState[], now = new Date().toISOString()): TarsTrayFollowUp | null {
  if (isTarsResponsibilityTerminal(row)) return null;
  const state = followUps.find((entry) => entry.responsibilityId === row.id);
  if (!state || (state.status === "nextCheck" && (!state.at || state.at <= now))) return null;
  // A window that already opened is not a wait: the follow-up is about to start.
  if (state.status === "deferred" && (!state.at || state.at <= now)) return { status: "pending", at: null };
  return { status: state.status, at: state.at };
}

/**
 * The next time a follow-up line changes by itself (a next check or a
 * deferral reaching its time), so a view can recompute then; null when none.
 */
export function tarsTrayNextFollowUpChange(followUps: readonly TarsFollowUpState[], now = new Date().toISOString()): string | null {
  return followUps.reduce<string | null>((next, state) => (state.status === "nextCheck" || state.status === "deferred")
    && state.at && state.at > now && (!next || state.at < next) ? state.at : next, null);
}

export interface TarsTrayCard<T extends TarsTrayAttentionInput = TarsTrayAttentionInput> {
  row: TarsResponsibility;
  lane: TarsLane;
  /** Who holds the work now: Tars, or the user after a take-over. */
  owner: "tars" | "you";
  /** Null until this window has read the run. */
  progress: TarsRunProgress | null;
  /** The run as this window read it, for its recent progress; null until read. */
  run: AgentRunDetail | null;
  /** Null unless the run is active and read: an unknown budget is not "0 left". */
  remainingTurns: number | null;
  /** Helpers working now, from the run's resource ledger; null when the host did not report it. */
  helpers: number | null;
  attention: TarsTrayAttentionRow<T>[];
  /** Null when Tars has nothing scheduled to look at. */
  followUp: TarsTrayFollowUp | null;
  controls: TarsControlOperation[];
  fleetTarget: FleetFocusTarget | null;
  /** The work's own branch once its workspace exists (work admitted before branch naming keeps `tars/<id>`). */
  branch: string | null;
  /** Queued work's place in the queue (1 starts next) among all queued work; null once it started or ended. */
  queue: { position: number; total: number } | null;
  /** What the work's run has spent so far, when the host read usage. */
  usage: AgentRunUsage | null;
}

/** The branch a responsibility's execution workspace is on, once that workspace exists. */
export function tarsBranchOf(row: Pick<TarsResponsibility, "id" | "branchName" | "executionWorkspaceId">): string | null {
  return row.executionWorkspaceId ? row.branchName ?? `tars/${row.id}` : null;
}

/** Presentation counts preparation as running only once its run exists. */
const holdsActiveSlot = isTarsWorkRunning;

/**
 * What the header indicator counts. `needsYou` counts Fleet's rows for Tars
 * work, so the tray and Fleet show the same number. `running` counts only work
 * that is actually running (in any lane), never queued, paused, waiting or
 * taken-over work; `waiting` counts the in-progress lane's work that is not
 * running and not held by the user, `yours` the work the user took over.
 */
export interface TarsTrayCounts { needsYou: number; running: number; waiting: number; yours: number; done: number }

export interface TarsTrayModel<T extends TarsTrayAttentionInput = TarsTrayAttentionInput> {
  counts: TarsTrayCounts;
  lanes: Record<TarsLane, TarsTrayCard<T>[]>;
}

/**
 * The controls a responsibility offers, by state: none once it ended; hand
 * back while the user holds it; accept as done when Stave could not verify a
 * reported completion; queued work can start now ahead of the queue;
 * otherwise pause or resume plus take over.
 * Cancel is offered whenever the work has not ended.
 */
export function tarsControlsFor(row: Pick<TarsResponsibility, "state" | "detailCode">): TarsControlOperation[] {
  if (isTarsResponsibilityTerminal(row)) return [];
  if (row.state === "takenOver") return ["handBack", "cancel"];
  // The run ended reporting success Stave could not verify: only the user's decision is left.
  if (row.state === "blocked" && row.detailCode === "unverifiedCompletion") return ["acceptCompletion", "cancel"];
  if (row.state === "queued") return ["startNow", "pause", "takeover", "cancel"];
  return [row.state === "paused" || row.state === "blocked" ? "resume" : "pause", "takeover", "cancel"];
}

/** The responsibility a Fleet row belongs to, by the same rule as the "needs you" count. */
function responsibilityOf<T extends TarsTrayAttentionInput>(item: T, responsibilities: readonly TarsResponsibility[]) {
  const [id] = selectTarsAttentionRows([item], responsibilities).responsibilityIds;
  return id;
}

export function buildTarsTray<T extends TarsTrayAttentionInput>(args: {
  responsibilities: readonly TarsResponsibility[];
  /** Fleet's non-snoozed attention rows. */
  attentionItems: readonly T[];
  /** Agent runs this window has read, keyed by run id. */
  runs: Readonly<Record<string, AgentRunDetail>>;
  pendingDecisions?: readonly TarsPendingDecision[];
  followUps?: readonly TarsFollowUpState[];
  /** The time follow-up lines are judged at; times already past show nothing. */
  now?: string;
  /** Ended work whose Done card was cleared or passed retention (`TarsSnapshot.cleared.done`); it leaves the Done lane. */
  clearedDone?: readonly string[];
}): TarsTrayModel<T> {
  const { responsibilities, attentionItems, runs } = args;
  const { rows, responsibilityIds } = selectTarsAttentionRows(attentionItems, responsibilities);
  // A Fleet decision row carries the proposal's identity in its id; the snapshot holds the rest.
  const liveDecisions = collectTarsAttention({ responsibilities: [...responsibilities], pendingDecisions: args.pendingDecisions ?? [] })
    .filter((signal) => signal.decision);
  const claimed = new Set<string>();
  const attentionByResponsibility = new Map<string, TarsTrayAttentionRow<T>[]>();
  for (const item of rows) {
    const responsibilityId = responsibilityOf(item, responsibilities);
    if (!responsibilityId) continue;
    let decision: TarsTrayDecision | null = null;
    if (item.kind === "tars-decision") {
      const signal = liveDecisions.find((candidate) => candidate.id === item.id && !claimed.has(candidate.id))
        ?? liveDecisions.find((candidate) => candidate.responsibilityId === responsibilityId && !claimed.has(candidate.id));
      if (signal?.decision) {
        claimed.add(signal.id);
        decision = { ...signal.decision, responsibilityId };
      }
    }
    attentionByResponsibility.set(responsibilityId, [...(attentionByResponsibility.get(responsibilityId) ?? []), { item, decision }]);
  }
  const lanes: Record<TarsLane, TarsTrayCard<T>[]> = { needsYou: [], running: [], done: [] };
  const queued = tarsQueueOf(responsibilities).map((row) => row.id);
  const cleared = new Set(args.clearedDone ?? []);
  for (const row of responsibilities) {
    const lane = tarsLaneOf(row, responsibilityIds);
    if (lane === "done" && cleared.has(row.id)) continue;
    const run = tarsRunOf(row, runs);
    const live = run && !isTarsResponsibilityTerminal(row) && isActiveAgentRunState(run.agentRun.state) ? run : undefined;
    lanes[lane].push({
      row,
      lane,
      owner: row.state === "takenOver" ? "you" : "tars",
      progress: run ? projectTarsRunProgress(run) : null,
      run: run ?? null,
      remainingTurns: live ? Math.max(0, live.agentRun.maxTurns - live.agentRun.turnCount) : null,
      helpers: live?.resources ? live.resources.activeHelpers : null,
      attention: attentionByResponsibility.get(row.id) ?? [],
      followUp: tarsTrayFollowUp(row, args.followUps ?? [], args.now),
      controls: tarsControlsFor(row),
      fleetTarget: tarsFleetTarget(row),
      branch: tarsBranchOf(row),
      usage: run?.usage ?? null,
      queue: row.state === "queued" ? { position: queued.indexOf(row.id) + 1, total: queued.length } : null,
    });
  }
  // Work that started leads its lane; queued work follows in the order it will start, so the cards a user reorders stay together.
  for (const lane of Object.values(lanes)) lane.sort((a, b) => (a.queue?.position ?? 0) - (b.queue?.position ?? 0));
  const inProgress = lanes.running;
  const counts: TarsTrayCounts = {
    needsYou: rows.length,
    running: [...lanes.needsYou, ...lanes.running].filter((card) => holdsActiveSlot(card.row)).length,
    waiting: inProgress.filter((card) => !holdsActiveSlot(card.row) && card.row.state !== "takenOver").length,
    yours: inProgress.filter((card) => card.row.state === "takenOver").length,
    done: lanes.done.length,
  };
  return { counts, lanes };
}

/** One action a card offers: a control, the Confirm of a waiting proposal, its Fleet row, or a move in the queue. */
export type TarsCardAction =
  | { kind: "control"; operation: TarsControlOperation }
  | { kind: "confirm"; decision: TarsTrayDecision }
  | { kind: "fleet" }
  | { kind: "move"; direction: "earlier" | "later" };

/** The queue moves a queued card offers: ahead of the work before it, behind the work after it. */
export function tarsQueueMoves(queue: TarsTrayCard["queue"]): Array<"earlier" | "later"> {
  if (!queue) return [];
  return [...(queue.position > 1 ? ["earlier" as const] : []), ...(queue.position < queue.total ? ["later" as const] : [])];
}

/**
 * A card shows one main action beside Open task and folds the rest into one
 * menu. The main action is the state's own (pause, resume or hand back); a
 * waiting Tars proposal's Confirm takes its place, so the same control never
 * appears twice. Queued work's Do first and Do later lead the menu, Cancel
 * stays last.
 */
export function tarsCardActions(card: Pick<TarsTrayCard, "controls" | "attention" | "fleetTarget"> & Partial<Pick<TarsTrayCard, "queue">>): { primary: TarsCardAction | null; more: TarsCardAction[] } {
  // An answer in the task (approve, answer, words) is confirmed only on the conversation card that shows it.
  const decisions = card.attention.flatMap((entry) => entry.decision && !isTarsTaskOperation(entry.decision.operation) ? [entry.decision] : []);
  const [decision, ...otherDecisions] = decisions;
  const controls = decision ? card.controls.filter((operation) => operation !== decision.operation) : card.controls.slice(1);
  const primary: TarsCardAction | null = decision ? { kind: "confirm", decision }
    : card.controls[0] ? { kind: "control", operation: card.controls[0] } : null;
  const more: TarsCardAction[] = [
    ...tarsQueueMoves(card.queue ?? null).map((direction): TarsCardAction => ({ kind: "move", direction })),
    ...otherDecisions.map((value): TarsCardAction => ({ kind: "confirm", decision: value })),
    ...controls.filter((operation) => operation !== "cancel").map((operation): TarsCardAction => ({ kind: "control", operation })),
    ...(card.fleetTarget ? [{ kind: "fleet" } as const] : []),
    ...(controls.includes("cancel") ? [{ kind: "control", operation: "cancel" } as const] : []),
  ];
  return { primary, more };
}

/** How one stage reads in a run monitor's strip: done, the one running now, not reached, or stopped short. */
export type TarsStageSegment = "finished" | "current" | "pending" | "stopped";

const STOPPED_STAGE: ReadonlySet<string> = new Set(["blocked", "stuck", "cancelled"]);

/** One segment per workflow stage, in workflow order. */
export function tarsStageSegments(progress: Pick<TarsRunProgress, "stages">): TarsStageSegment[] {
  return progress.stages.map((stage) => stage.current ? "current"
    : stage.status === "completed" || stage.status === "skipped" ? "finished"
      : STOPPED_STAGE.has(stage.status) ? "stopped" : "pending");
}

/**
 * The step count a run monitor shows: the stage it is on while active
 * ("2/3"), otherwise the stages finished. Null when the workflow has no
 * stages, so an unknown count is never "0/0".
 */
export function tarsStepCount(progress: Pick<TarsRunProgress, "stages" | "current" | "finished" | "total">): { position: number; total: number } | null {
  if (progress.total <= 0) return null;
  const position = progress.current ? progress.stages.indexOf(progress.current) + 1 : progress.finished;
  return { position, total: progress.total };
}

/** What happened to one piece of work while the user was away. */
export type TarsRecapKind = "needsYou" | "failed" | "done";

export interface TarsRecapItem {
  responsibilityId: string;
  title: string;
  kind: TarsRecapKind;
  at: string;
  /** Where its link opens the side view. */
  side: TarsSideViewTarget;
}

export interface TarsRecap {
  since: string;
  counts: Record<TarsRecapKind, number>;
  /** The most recent changes first, needs you before the rest, at most `limit`. */
  items: TarsRecapItem[];
  /** Changes not listed. */
  more: number;
}

const RECAP_ORDER: Record<TarsRecapKind, number> = { needsYou: 0, failed: 1, done: 2 };

/**
 * "While you were away": work that came to need the user, ended without
 * finishing, or finished between `since` (the last time the Tars view was
 * visible) and `until` (when it opened again). Null when there is no earlier
 * visit or nothing changed, so the recap never says "0 done". A cancel the
 * user applied is theirs, not a failure.
 */
export function buildTarsRecap(args: {
  model: Pick<TarsTrayModel, "lanes">;
  since: string | null;
  until: string;
  pendingDecisions?: readonly Pick<TarsPendingDecision, "responsibilityId" | "proposedAt">[];
  cancelledByYou?: ReadonlySet<string>;
  limit?: number;
}): TarsRecap | null {
  const { since, until } = args;
  if (!since || since >= until) return null;
  const within = (at: string | null | undefined) => Boolean(at && at > since && at <= until);
  const items: TarsRecapItem[] = [];
  for (const card of args.model.lanes.needsYou) {
    const proposed = (args.pendingDecisions ?? []).filter((decision) => decision.responsibilityId === card.row.id).map((decision) => decision.proposedAt);
    const at = [card.row.updatedAt, ...proposed].filter(within).sort().at(-1);
    if (!at) continue;
    items.push({ responsibilityId: card.row.id, title: card.row.title, kind: "needsYou", at,
      side: card.row.state === "blocked" ? { responsibilityId: card.row.id, kind: "report", focus: { unmet: true } } : { responsibilityId: card.row.id, kind: "timeline" } });
  }
  for (const card of args.model.lanes.done) {
    const { row } = card;
    if (!within(row.updatedAt)) continue;
    if (row.state === "completed") items.push({ responsibilityId: row.id, title: row.title, kind: "done", at: row.updatedAt, side: { responsibilityId: row.id, kind: "report" } });
    else if (row.state === "cancelled" && !args.cancelledByYou?.has(row.id)) {
      items.push({ responsibilityId: row.id, title: row.title, kind: "failed", at: row.updatedAt, side: { responsibilityId: row.id, kind: "timeline" } });
    }
  }
  if (!items.length) return null;
  items.sort((a, b) => RECAP_ORDER[a.kind] - RECAP_ORDER[b.kind] || b.at.localeCompare(a.at));
  const counts: Record<TarsRecapKind, number> = { needsYou: 0, failed: 0, done: 0 };
  for (const item of items) counts[item.kind] += 1;
  const limit = args.limit ?? 4;
  return { since, counts, items: items.slice(0, limit), more: Math.max(0, items.length - limit) };
}
