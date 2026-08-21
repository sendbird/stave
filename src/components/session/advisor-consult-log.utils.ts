import type { AdvisorExchangeOutcome } from "@/lib/providers/advisor-activity";
import type {
  AdvisorConsultLogEntry,
  AdvisorConsultVerdict,
  AdvisorVerdictTally,
} from "@/lib/providers/advisor-consult-log";
import type {
  ProviderTurnActivitySnapshot,
  ProviderTurnWorkItem,
  RetainedTurnActivity,
} from "@/lib/providers/turn-status";

/**
 * What an archived consult's row should say it ended as.
 *
 * `pending` is only honest while the turn it belongs to is still running.
 * Once that turn is gone a still-pending consult did not settle — the turn
 * ended, was aborted, or the runtime never reported an outcome — and saying
 * "Running" about it would be a lie the list never corrects.
 */
export type AdvisorConsultLogStatus = AdvisorExchangeOutcome | "unresolved";

export function resolveAdvisorConsultLogStatus(args: {
  entry: AdvisorConsultLogEntry;
  activeTurnId: string | null;
}): AdvisorConsultLogStatus {
  const { outcome, turnId } = args.entry.snapshot;
  if (outcome !== "pending") {
    return outcome;
  }
  return turnId === args.activeTurnId ? "pending" : "unresolved";
}

export function describeAdvisorConsultLogStatus(
  status: AdvisorConsultLogStatus,
): string {
  switch (status) {
    case "armed":
      return "Armed";
    case "pending":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "timeout":
      return "Timed out";
    case "aborted":
      return "Aborted";
    case "skipped":
      return "Skipped";
    case "unresolved":
      return "Unresolved";
  }
}

/**
 * How many post-consult tool calls the detail pane lists. The section answers
 * "what happened next", not "everything the turn did".
 */
export const ADVISOR_POST_CONSULT_WORK_ITEM_LIMIT = 6;

/**
 * Select the in-memory work snapshot that belongs to the consult being read.
 *
 * The store keeps only the live turn and the last finished turn. A consult from
 * an older turn must therefore receive no work items, rather than borrowing a
 * newer turn's items merely because their timestamps happen to be later.
 */
export function resolveAdvisorConsultWorkItems(args: {
  entry: AdvisorConsultLogEntry | null;
  activity: ProviderTurnActivitySnapshot | null;
  retained: RetainedTurnActivity | null;
}): ProviderTurnWorkItem[] {
  const turnId = args.entry?.snapshot.turnId;
  if (!turnId) {
    return [];
  }
  const snapshot =
    args.activity?.turnId === turnId
      ? args.activity
      : args.retained?.snapshot.turnId === turnId
        ? args.retained.snapshot
        : null;
  if (!snapshot) {
    return [];
  }
  return snapshot.orderedWorkItemIds.flatMap((id) => {
    const item = snapshot.workItemsById[id];
    return item ? [item] : [];
  });
}

/**
 * Tool calls of the same turn that started after this consult settled.
 *
 * Sequence only. Advice returns as an MCP tool result and the primary may
 * ignore it, so nothing here implies the consult caused any of it — the copy
 * in the detail pane says so explicitly.
 *
 * Empty until the consult settles (an unsettled consult has no "after"), and
 * empty whenever the turn's work items are no longer in memory, which is the
 * common case for older consults: work items exist only for the live turn and
 * the last finished turn per task.
 */
export function resolveAdvisorPostConsultWorkItems(args: {
  entry: AdvisorConsultLogEntry;
  workItems: readonly ProviderTurnWorkItem[];
  limit?: number;
}): ProviderTurnWorkItem[] {
  const { snapshot } = args.entry;
  if (snapshot.outcome === "pending" || snapshot.outcome === "armed") {
    return [];
  }
  const settledAt = snapshot.outcomeAt ?? snapshot.startedAt;
  return args.workItems
    .filter((item) => item.startedAt > settledAt)
    .sort((left, right) => left.startedAt - right.startedAt)
    .slice(0, args.limit ?? ADVISOR_POST_CONSULT_WORK_ITEM_LIMIT);
}

export interface AdvisorTurnSpend {
  consults: number;
  inputTokens: number;
  outputTokens: number;
  /** `null` when no consult of the turn reported a cost at all. */
  totalCostUsd: number | null;
}

/**
 * What this turn's consults cost, summed over the archived entries.
 *
 * Absolute numbers only, never a share of the turn. `ChatMessage.usage` is
 * per message and carries no turn id, so any denominator the renderer could
 * build would drift as messages page in and out.
 */
export function summarizeAdvisorTurnSpend(args: {
  entries: readonly AdvisorConsultLogEntry[];
  turnId: string;
}): AdvisorTurnSpend {
  let consults = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalCostUsd: number | null = null;
  for (const entry of args.entries) {
    if (entry.snapshot.turnId !== args.turnId) {
      continue;
    }
    consults += 1;
    inputTokens += entry.snapshot.inputTokens ?? 0;
    outputTokens += entry.snapshot.outputTokens ?? 0;
    if (entry.snapshot.totalCostUsd !== undefined) {
      totalCostUsd = (totalCostUsd ?? 0) + entry.snapshot.totalCostUsd;
    }
  }
  return { consults, inputTokens, outputTokens, totalCostUsd };
}

export function formatAdvisorSpend(args: {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number | null;
}): string {
  const cost =
    args.totalCostUsd === null ? "" : ` · $${args.totalCostUsd.toFixed(4)}`;
  return `${args.inputTokens} in · ${args.outputTokens} out${cost}`;
}

export const ADVISOR_VERDICT_OPTIONS: Array<{
  value: AdvisorConsultVerdict;
  label: string;
}> = [
  { value: "helpful", label: "Helpful" },
  { value: "not_helpful", label: "Not helpful" },
  { value: "ignored", label: "Ignored" },
];

export function describeAdvisorVerdict(verdict: AdvisorConsultVerdict): string {
  switch (verdict) {
    case "helpful":
      return "Helpful";
    case "not_helpful":
      return "Not helpful";
    case "ignored":
      return "Ignored";
  }
}

/**
 * The running record for one advisor model.
 *
 * Deliberately has no denominator: the tally outlives ring eviction, so
 * "4 of 9" would drift the moment an entry falls out of the log while its
 * verdict stays counted.
 */
export function describeAdvisorVerdictTally(
  tally: AdvisorVerdictTally | undefined,
): string {
  if (!tally || tally.helpful + tally.notHelpful + tally.ignored === 0) {
    return "No verdicts recorded for this advisor yet.";
  }
  const parts: string[] = [];
  if (tally.helpful > 0) {
    parts.push(`${tally.helpful} helpful`);
  }
  if (tally.notHelpful > 0) {
    parts.push(`${tally.notHelpful} not helpful`);
  }
  if (tally.ignored > 0) {
    parts.push(`${tally.ignored} ignored`);
  }
  return `${parts.join(" · ")} this session.`;
}
