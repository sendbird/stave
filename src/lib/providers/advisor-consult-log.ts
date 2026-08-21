import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * The user's own call on whether a consult was worth it.
 *
 * Deliberately hand-set. Advice comes back as an MCP tool result and the
 * primary is free to ignore it, so nothing in the event stream can say whether
 * a consult changed the turn — an auto-computed "influence score" would be
 * fabricated causality. `ignored` exists because "the advice was fine and the
 * model dropped it anyway" is the outcome worth counting separately.
 */
export type AdvisorConsultVerdict = "helpful" | "not_helpful" | "ignored";

export interface AdvisorConsultLogEntry {
  /** `${turnId}::${exchangeId ?? startedAt}` — see `advisorConsultLogEntryKey`. */
  key: string;
  /**
   * Held by reference, never copied. The fold already produces a fresh snapshot
   * per change, so copying here would only double the memory per consult.
   */
  snapshot: AdvisorExchangeSnapshot;
  updatedAt: number;
  verdict?: AdvisorConsultVerdict;
}

/** Newest consult first, per task. */
export type AdvisorConsultLogByTask = Record<
  string,
  readonly AdvisorConsultLogEntry[] | undefined
>;

export interface AdvisorVerdictTally {
  providerId: ProviderId;
  model?: string;
  helpful: number;
  notHelpful: number;
  ignored: number;
}

/** Keyed by `${providerId}:${model ?? "unspecified"}`, not by task. */
export type AdvisorVerdictTallyByModel = Record<
  string,
  AdvisorVerdictTally | undefined
>;

/**
 * Consults retained per task.
 *
 * Must stay **>= `MAX_ADVISOR_CONSULT_LIMIT` (20)** from
 * `src/lib/providers/advisor.ts`, or a turn that spends its whole consult
 * budget evicts its own earlier consults — the exact loss this log exists to
 * fix. 24 leaves headroom for the previous turn's tail.
 */
export const ADVISOR_CONSULT_LOG_LIMIT = 24;

/**
 * Tasks that keep a log at once. Matches `RETAINED_TURN_ACTIVITY_LIMIT` so the
 * "what ran after this consult" section has a chance of finding work items for
 * the same tasks the log still covers.
 *
 * Worst case 8 x 24 x ~20 KB (advice <= 12,000 chars, question <= 8,000) is
 * roughly 4 MB, all in memory and shed with the task.
 */
export const ADVISOR_CONSULT_LOG_TASK_LIMIT = 8;

/**
 * Shared empty result so a task with no consults never hands a subscriber a
 * fresh array (which would re-render on every unrelated store write).
 */
export const EMPTY_ADVISOR_CONSULT_LOG: readonly AdvisorConsultLogEntry[] = [];

/**
 * Identity of one consult inside the log.
 *
 * `consultIndex` is deliberately not used: a recoverable provider retry can
 * repeat it, which would silently merge two distinct consults into one row.
 * `startedAt` is the fallback for runtimes that report no exchange id.
 */
export function advisorConsultLogEntryKey(
  snapshot: AdvisorExchangeSnapshot,
): string {
  return `${snapshot.turnId}::${snapshot.exchangeId ?? snapshot.startedAt}`;
}

/**
 * Tally key for the advisor that answered. `null` when the target never
 * resolved, because a verdict on "no advisor" cannot be attributed to anything.
 */
export function advisorVerdictKey(advisor: {
  providerId?: ProviderId;
  model?: string;
}): string | null {
  if (!advisor.providerId) {
    return null;
  }
  return `${advisor.providerId}:${advisor.model ?? "unspecified"}`;
}

function pruneAdvisorConsultLogTasks(
  logByTask: AdvisorConsultLogByTask,
): AdvisorConsultLogByTask {
  const taskIds = Object.keys(logByTask);
  if (taskIds.length <= ADVISOR_CONSULT_LOG_TASK_LIMIT) {
    return logByTask;
  }
  // Recency is the newest entry in the task, not the head of the array: a
  // terminal fold replaces an entry in place, so position does not track time.
  const ranked = taskIds
    .map((taskId) => {
      const entries = logByTask[taskId];
      let newest = 0;
      for (const entry of entries ?? []) {
        if (entry.updatedAt > newest) {
          newest = entry.updatedAt;
        }
      }
      return { taskId, newest };
    })
    .sort((left, right) => right.newest - left.newest)
    .slice(0, ADVISOR_CONSULT_LOG_TASK_LIMIT);

  const next: AdvisorConsultLogByTask = {};
  for (const { taskId } of ranked) {
    next[taskId] = logByTask[taskId];
  }
  return next;
}

/**
 * Archives one consult snapshot.
 *
 * Called once per *folded step* rather than once per flush: provider events are
 * rAF-batched (and rAF is paused while the window is hidden), so a single flush
 * routinely carries several complete consults. A before/after comparison of the
 * exchange map would keep only the last one — the bug this log exists to fix.
 *
 * An existing key is replaced **in place**, keeping both its position and its
 * verdict, so the terminal fold supersedes the pending row without demoting it
 * or discarding a rating the user already gave.
 */
export function upsertAdvisorConsultLogEntry(args: {
  logByTask: AdvisorConsultLogByTask;
  taskId: string;
  snapshot: AdvisorExchangeSnapshot;
  now?: number;
}): AdvisorConsultLogByTask {
  const entries = args.logByTask[args.taskId] ?? EMPTY_ADVISOR_CONSULT_LOG;
  const key = advisorConsultLogEntryKey(args.snapshot);
  const now = args.now ?? Date.now();
  const index = entries.findIndex((entry) => entry.key === key);

  if (index >= 0) {
    const existing = entries[index]!;
    if (existing.snapshot === args.snapshot) {
      return args.logByTask;
    }
    const nextEntries = entries.slice();
    nextEntries[index] = {
      ...existing,
      snapshot: args.snapshot,
      updatedAt: now,
    };
    return { ...args.logByTask, [args.taskId]: nextEntries };
  }

  const nextEntries = [
    { key, snapshot: args.snapshot, updatedAt: now },
    ...entries,
  ].slice(0, ADVISOR_CONSULT_LOG_LIMIT);
  return pruneAdvisorConsultLogTasks({
    ...args.logByTask,
    [args.taskId]: nextEntries,
  });
}

/**
 * Records the user's verdict and folds it into the per-advisor-model tally.
 *
 * Returns `null` for a missing entry or a repeat of the same verdict so the
 * caller can skip `set()` entirely — the persist middleware serializes on every
 * `set`, regardless of whether the updater changed anything.
 *
 * Set-only: there is no deselect. The tally is intentionally *not* keyed by
 * task, so it survives ring eviction and reads as a session-wide record of how
 * a given advisor model has been doing.
 */
export function setAdvisorConsultLogVerdict(args: {
  logByTask: AdvisorConsultLogByTask;
  tallyByModel: AdvisorVerdictTallyByModel;
  taskId: string;
  entryKey: string;
  verdict: AdvisorConsultVerdict;
}): {
  logByTask: AdvisorConsultLogByTask;
  tallyByModel: AdvisorVerdictTallyByModel;
} | null {
  const entries = args.logByTask[args.taskId];
  if (!entries) {
    return null;
  }
  const index = entries.findIndex((entry) => entry.key === args.entryKey);
  if (index < 0) {
    return null;
  }
  const existing = entries[index]!;
  if (existing.verdict === args.verdict) {
    return null;
  }

  const nextEntries = entries.slice();
  nextEntries[index] = { ...existing, verdict: args.verdict };
  const logByTask = { ...args.logByTask, [args.taskId]: nextEntries };

  const modelKey = advisorVerdictKey({
    providerId: existing.snapshot.advisorProviderId,
    model: existing.snapshot.advisorModel,
  });
  if (!modelKey || !existing.snapshot.advisorProviderId) {
    return { logByTask, tallyByModel: args.tallyByModel };
  }

  const current = args.tallyByModel[modelKey] ?? {
    providerId: existing.snapshot.advisorProviderId,
    ...(existing.snapshot.advisorModel
      ? { model: existing.snapshot.advisorModel }
      : {}),
    helpful: 0,
    notHelpful: 0,
    ignored: 0,
  };
  const next: AdvisorVerdictTally = { ...current };
  if (existing.verdict) {
    // Switching a verdict moves the count rather than adding a second one.
    next[VERDICT_FIELD[existing.verdict]] = Math.max(
      0,
      next[VERDICT_FIELD[existing.verdict]] - 1,
    );
  }
  next[VERDICT_FIELD[args.verdict]] += 1;

  return {
    logByTask,
    tallyByModel: { ...args.tallyByModel, [modelKey]: next },
  };
}

const VERDICT_FIELD: Record<
  AdvisorConsultVerdict,
  "helpful" | "notHelpful" | "ignored"
> = {
  helpful: "helpful",
  not_helpful: "notHelpful",
  ignored: "ignored",
};

/**
 * The Zustand read boundary. Never allocates, so a component may subscribe to
 * it directly. A durable (SQLite-backed) log would replace only this function
 * plus a hydrate action, with no component changes.
 */
export function selectAdvisorConsultLog(
  logByTask: AdvisorConsultLogByTask,
  taskId: string,
): readonly AdvisorConsultLogEntry[] {
  return logByTask[taskId] ?? EMPTY_ADVISOR_CONSULT_LOG;
}
