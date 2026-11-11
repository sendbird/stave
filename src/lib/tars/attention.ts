import type { TarsControlOperation, TarsPendingDecision, TarsResponsibility, TarsSnapshot } from "./types";

/**
 * The one rule for Tars-owned work that waits on the user. Fleet's attention
 * projection turns these signals into rows, and the Tars tray reads the same
 * projection, so the two can never disagree about what needs the user.
 *
 * - `tars-decision`: a decision waits for the user: a control the model
 *   proposed (Confirm), Stave's unverified-completion choice or a question
 *   the model asked. The last two offer several options and are answered in Tars.
 * - `tars-blocked`: the responsibility is blocked (for example its run ended
 *   without meeting the criteria). Fleet drops it when another attention row
 *   already speaks for the same task, so one fact is one row.
 */
export type TarsAttentionKind = "tars-decision" | "tars-blocked";

export interface TarsAttentionSignal {
  /** Stable while the fact holds; a new revision or proposal is a new id. */
  id: string;
  kind: TarsAttentionKind;
  responsibilityId: string;
  title: string;
  repositoryPath: string;
  /** Where the work runs: the execution workspace once prepared, else the source workspace. */
  workspaceId: string;
  taskId: string | null;
  /** When the wait began. */
  since: string;
  /** Set on a single-action decision (a proposed control): what Confirm applies. */
  decision?: { messageId: string; actionIndex: number; operation: TarsControlOperation; expectedRevision: number };
  /** Set on a decision with several options; it is answered in the Tars conversation. */
  prompt?: { kind: "unverifiedCompletion" } | { kind: "ask"; question: string };
}

/** Fleet's row id for a pending decision; a proposal keeps the id it had before decision kinds existed. */
export function tarsDecisionSignalId(decision: Pick<TarsPendingDecision, "kind" | "responsibilityId" | "messageId" | "actionIndex" | "expectedRevision">) {
  return decision.kind === "unverifiedCompletion" || decision.messageId === null || decision.actionIndex === null
    ? `tars:decision:unverified:${decision.responsibilityId}:${decision.expectedRevision}`
    : `tars:decision:${decision.messageId}:${decision.actionIndex}`;
}

const TERMINAL = new Set<TarsResponsibility["state"]>(["completed", "cancelled"]);

export function isTarsResponsibilityTerminal(row: Pick<TarsResponsibility, "state">) {
  return TERMINAL.has(row.state);
}

function place(row: TarsResponsibility) {
  return {
    responsibilityId: row.id,
    title: row.title,
    repositoryPath: row.repositoryPath,
    workspaceId: row.executionWorkspaceId ?? row.workspaceId,
    taskId: row.taskId,
  };
}

/** Proposals for a responsibility that ended or moved past their revision no longer wait. */
function isLiveDecision(decision: TarsPendingDecision, row: TarsResponsibility | undefined): row is TarsResponsibility {
  return Boolean(row) && row!.state !== "cancelled" &&
    (row!.state !== "completed" || decision.kind === "ask" || (decision.kind ?? "confirm") === "confirm" && decision.operation === "message") &&
    row!.revision === decision.expectedRevision;
}

export function collectTarsAttention(
  snapshot: Pick<TarsSnapshot, "responsibilities"> & { pendingDecisions?: readonly TarsPendingDecision[] } | null | undefined,
): TarsAttentionSignal[] {
  if (!snapshot) return [];
  const rows = new Map(snapshot.responsibilities.map((row) => [row.id, row]));
  const decisions = (snapshot.pendingDecisions ?? []).flatMap((decision): TarsAttentionSignal[] => {
    const row = rows.get(decision.responsibilityId);
    if (!isLiveDecision(decision, row)) return [];
    const kind = decision.kind ?? "confirm";
    const single = kind === "confirm" && decision.messageId !== null && decision.actionIndex !== null && decision.operation !== null;
    if (kind === "confirm" && !single) return [];
    return [{
      id: tarsDecisionSignalId(decision),
      kind: "tars-decision",
      ...place(row),
      since: decision.proposedAt,
      ...(single ? { decision: { messageId: decision.messageId!, actionIndex: decision.actionIndex!, operation: decision.operation!,
        expectedRevision: decision.expectedRevision } }
        : { prompt: kind === "ask" ? { kind: "ask" as const, question: decision.question ?? "" } : { kind: "unverifiedCompletion" as const } }),
    }];
  });
  // Work blocked on an unverified completion is said by its decision row: one fact, one row.
  const decided = new Set(decisions.filter((signal) => signal.prompt?.kind === "unverifiedCompletion").map((signal) => signal.responsibilityId));
  const blocked = snapshot.responsibilities.filter((row) => row.state === "blocked" && !decided.has(row.id)).map((row): TarsAttentionSignal => ({
    id: `tars:blocked:${row.id}:${row.revision}`,
    kind: "tars-blocked",
    ...place(row),
    since: row.updatedAt,
  }));
  return [...decisions, ...blocked];
}

/** Where a responsibility sits in the tray. */
export type TarsLane = "needsYou" | "running" | "done";

/**
 * Any attention row on a responsibility (Fleet's own kinds on its task, or
 * Tars's kinds) puts it in "needs you"; otherwise ended work is done and the
 * rest, including paused and user-held work, is running.
 */
export function tarsLaneOf(row: TarsResponsibility, attentionResponsibilityIds: ReadonlySet<string>): TarsLane {
  if (attentionResponsibilityIds.has(row.id)) return "needsYou";
  return isTarsResponsibilityTerminal(row) ? "done" : "running";
}

/** The fields of a Fleet attention row this rule reads. */
export interface TarsAttentionRowLike {
  taskId?: string;
  tarsResponsibilityId?: string;
}

/**
 * The attention rows that belong to Tars-owned work, and the responsibilities
 * they point at: rows on the work's own task, and while the work waits on a
 * helper (`waitingTaskId`), rows on that helper's task. The tray's "needs
 * you" count is `rows.length`, read from the same projection Fleet shows.
 */
export function selectTarsAttentionRows<T extends TarsAttentionRowLike>(
  items: readonly T[],
  responsibilities: readonly TarsResponsibility[],
): { rows: T[]; responsibilityIds: Set<string> } {
  const live = responsibilities.filter((row) => !isTarsResponsibilityTerminal(row));
  const byTask = new Map([
    ...live.flatMap((row) => row.state === "waiting" && row.waitingTaskId ? [[row.waitingTaskId, row.id] as const] : []),
    // The work's own task wins if a helper's task ever named it.
    ...live.flatMap((row) => row.taskId ? [[row.taskId, row.id] as const] : []),
  ]);
  const rows: T[] = [];
  const responsibilityIds = new Set<string>();
  for (const item of items) {
    const id = item.tarsResponsibilityId ?? (item.taskId ? byTask.get(item.taskId) : undefined);
    if (!id) continue;
    rows.push(item);
    responsibilityIds.add(id);
  }
  return { rows, responsibilityIds };
}
