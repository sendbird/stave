import type { ResultReviewScope } from "@/lib/reviews/result-review";
import {
  getFleetAttentionTier,
  type FleetAttentionItem,
} from "./attention-projection";

/**
 * What clearing Fleet's `In review` group does, worked out before anything is
 * applied, so the menu can say each effect and its count first.
 *
 * Each row is cleared through whichever store owns it, because Fleet owns none
 * of them: a durable result is marked reviewed, a notification-backed row is
 * read and resolved (only in the browser build, which has no durable result
 * store), and a pull request row — whose state lives on GitHub and would come
 * back on the next projection — is hidden for a day.
 */
export type FleetBulkEffect = "review-results" | "read-notifications" | "hide-for-a-day";

export interface FleetBulkPlan {
  results: ResultReviewScope[];
  notificationIds: string[];
  snoozes: { attentionId: string; workspaceId: string }[];
}

export const EMPTY_FLEET_BULK_PLAN: FleetBulkPlan = {
  results: [],
  notificationIds: [],
  snoozes: [],
};

/** The plan for clearing every `In review` item among `items`. */
export function planFleetReviewClear(
  items: readonly FleetAttentionItem[],
): FleetBulkPlan {
  const plan: FleetBulkPlan = { results: [], notificationIds: [], snoozes: [] };
  for (const item of items) {
    if (getFleetAttentionTier(item.kind) !== "review") continue;
    if (item.resultReview) {
      plan.results.push({
        repositoryPath: item.resultReview.repositoryPath,
        workspaceId: item.resultReview.workspaceId,
        taskId: item.resultReview.taskId,
        turnId: item.resultReview.turnId,
      });
    } else if (item.notificationId) {
      plan.notificationIds.push(item.notificationId);
    } else {
      plan.snoozes.push({ attentionId: item.id, workspaceId: item.workspaceId });
    }
  }
  return plan;
}

/** Only these parts of a plan, for applying one effect from the menu. */
export function pickFleetBulkEffect(
  plan: FleetBulkPlan,
  effect: FleetBulkEffect,
): FleetBulkPlan {
  return {
    results: effect === "review-results" ? plan.results : [],
    notificationIds: effect === "read-notifications" ? plan.notificationIds : [],
    snoozes: effect === "hide-for-a-day" ? plan.snoozes : [],
  };
}

export interface FleetBulkEffectSummary {
  effect: FleetBulkEffect;
  count: number;
  /** Whether the effect can be taken back after it is applied. */
  undoable: boolean;
}

/** Each effect the plan applies, with its count, in a stable order. */
export function summarizeFleetBulkPlan(plan: FleetBulkPlan): FleetBulkEffectSummary[] {
  return [
    { effect: "review-results" as const, count: plan.results.length, undoable: true },
    { effect: "read-notifications" as const, count: plan.notificationIds.length, undoable: false },
    { effect: "hide-for-a-day" as const, count: plan.snoozes.length, undoable: true },
  ].filter((summary) => summary.count > 0);
}

export function countFleetBulkPlan(plan: FleetBulkPlan) {
  return plan.results.length + plan.notificationIds.length + plan.snoozes.length;
}

/**
 * What actually changed; failures are counted, never reported as cleared, and
 * rows another surface had already cleared are neither.
 */
export interface FleetBulkOutcome {
  /** Results this action marked reviewed, each unreviewed before it: Undo restores exactly these. */
  reviewed: ResultReviewScope[];
  /**
   * Results marked reviewed in a batch another surface reviewed at the same
   * moment: counted, but not undone, since which rows were ours is unknown.
   */
  reviewedUnconfirmed: number;
  read: string[];
  snoozed: string[];
  failed: number;
}

/** How many items the action itself changed, for the toast. */
export function countFleetBulkOutcome(outcome: FleetBulkOutcome) {
  return (
    outcome.reviewed.length +
    outcome.reviewedUnconfirmed +
    outcome.read.length +
    outcome.snoozed.length
  );
}

/** Results go in batches; the bulk review contract caps one at 200 scopes. */
export const FLEET_BULK_RESULT_BATCH = 200;

export function chunkResultScopes(scopes: readonly ResultReviewScope[]) {
  const batches: ResultReviewScope[][] = [];
  for (let index = 0; index < scopes.length; index += FLEET_BULK_RESULT_BATCH) {
    batches.push(scopes.slice(index, index + FLEET_BULK_RESULT_BATCH));
  }
  return batches;
}

/** The stores a plan writes to; injected so the effect logic stays testable. */
export interface FleetBulkOperations {
  /** Which of `scopes` still wait for review, read just before writing. */
  listPendingResults: (scopes: ResultReviewScope[]) => Promise<ResultReviewScope[]>;
  /** Resolves to how many rows changed. */
  setResultsReviewed: (args: { scopes: ResultReviewScope[]; reviewed: boolean }) => Promise<number>;
  /** Resolves to whether the notification was still unread. */
  markNotificationRead: (args: { id: string; resolvedAt: string }) => Promise<boolean>;
  snoozeFleetAttention: (args: { attentionId: string; workspaceId: string; snoozedUntil: string }) => Promise<unknown>;
  clearFleetAttentionSnoozes: (args: { attentionIds: string[] }) => Promise<unknown>;
}

/**
 * Applies every effect of a plan and reports what changed. Effects run side by
 * side and one failure never stops the others (a failed result batch counts
 * every scope it carried). Only results still waiting for review are written,
 * so a result reviewed elsewhere since Fleet last read it is neither counted
 * nor later marked unreviewed by Undo.
 */
export async function applyFleetBulkPlan(args: {
  plan: FleetBulkPlan;
  operations: FleetBulkOperations;
  resolvedAt: string;
  snoozedUntil: string;
}): Promise<FleetBulkOutcome> {
  const { plan, operations } = args;
  let pending: ResultReviewScope[] = [];
  let unreadable = 0;
  if (plan.results.length > 0) {
    try {
      pending = await operations.listPendingResults(plan.results);
    } catch {
      // Without the current state nothing can be claimed: write nothing.
      unreadable = plan.results.length;
    }
  }
  const batches = chunkResultScopes(pending);
  type Settled =
    | { kind: "reviewed"; scopes: ResultReviewScope[]; updated: number }
    | { kind: "read"; id: string; changed: boolean }
    | { kind: "snoozed"; id: string };
  const settled = await Promise.allSettled<Settled>([
    ...batches.map((scopes) =>
      operations
        .setResultsReviewed({ scopes, reviewed: true })
        .then((updated): Settled => ({ kind: "reviewed", scopes, updated })),
    ),
    ...plan.notificationIds.map((id) =>
      operations
        .markNotificationRead({ id, resolvedAt: args.resolvedAt })
        .then((changed): Settled => ({ kind: "read", id, changed })),
    ),
    ...plan.snoozes.map((snooze) =>
      operations
        .snoozeFleetAttention({ ...snooze, snoozedUntil: args.snoozedUntil })
        .then((): Settled => ({ kind: "snoozed", id: snooze.attentionId })),
    ),
  ]);
  const outcome: FleetBulkOutcome = {
    reviewed: [],
    reviewedUnconfirmed: 0,
    read: [],
    snoozed: [],
    failed: unreadable,
  };
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      outcome.failed += batches[index]?.length ?? 1;
      return;
    }
    const value = result.value;
    if (value.kind === "reviewed") {
      // Every row of the batch changed only when the count says so.
      if (value.updated === value.scopes.length) outcome.reviewed.push(...value.scopes);
      else outcome.reviewedUnconfirmed += Math.max(0, value.updated);
    } else if (value.kind === "read") {
      if (value.changed) outcome.read.push(value.id);
    } else outcome.snoozed.push(value.id);
  });
  return outcome;
}

/**
 * Takes back what can be taken back — result reviews and snoozes. Notification
 * reads stay: there is no operation that marks a notification unread. Returns
 * whether everything that could be undone was.
 */
export async function revertFleetBulkOutcome(
  outcome: FleetBulkOutcome,
  operations: FleetBulkOperations,
) {
  const undone = await Promise.allSettled([
    ...chunkResultScopes(outcome.reviewed).map((scopes) =>
      operations.setResultsReviewed({ scopes, reviewed: false }),
    ),
    ...(outcome.snoozed.length > 0
      ? [operations.clearFleetAttentionSnoozes({ attentionIds: outcome.snoozed })]
      : []),
  ]);
  return undone.every((result) => result.status === "fulfilled");
}
