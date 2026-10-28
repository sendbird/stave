import { resultReviewKey, type ResultReview, type ResultReviewScope, type SetResultMarkedReviewedArgs } from "@/lib/reviews/result-review";
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
  /** Explicit bulk snooze uses the user's chosen duration instead of clear's day. */
  snoozeDurationMs?: number;
  /** Explicit review is separate from the read mark and cannot be batch-undone safely. */
  markedReviewed?: boolean;
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

/** Acknowledging an outcome never answers or dismisses a pending interaction. */
export function planFleetOutcomeRead(items: readonly FleetAttentionItem[]): FleetBulkPlan {
  const outcomes = items.filter((item) => item.kind === "run-failed" || item.kind === "result-ready");
  const plan: FleetBulkPlan = { results: [], notificationIds: [], snoozes: [] };
  const seenResults = new Set<string>();
  const seenNotifications = new Set<string>();
  for (const item of outcomes) {
    if (item.resultReview) {
      const { repositoryPath, workspaceId, taskId, turnId } = item.resultReview;
      const key = JSON.stringify([repositoryPath, workspaceId, taskId, turnId]);
      if (seenResults.has(key)) continue;
      seenResults.add(key);
      plan.results.push({ repositoryPath, workspaceId, taskId, turnId });
    } else if (item.notificationId && !seenNotifications.has(item.notificationId)) {
      seenNotifications.add(item.notificationId);
      plan.notificationIds.push(item.notificationId);
    }
  }
  return plan;
}

/** Explicit review applies only to saved outcomes, never notification-only rows. */
export function planFleetOutcomeReview(items: readonly FleetAttentionItem[]): FleetBulkPlan {
  const plan = planFleetOutcomeRead(items.filter((item) => item.resultReview && !item.resultReview.markedReviewedAt));
  return { ...plan, notificationIds: [], markedReviewed: true };
}

/** Hide exactly these rows; their requests and underlying status stay untouched. */
export function planFleetAttentionSnooze(
  items: readonly FleetAttentionItem[],
  durationMs: number,
): FleetBulkPlan {
  const seen = new Set<string>();
  const snoozes: FleetBulkPlan["snoozes"] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    snoozes.push({ attentionId: item.id, workspaceId: item.workspaceId });
  }
  return { results: [], notificationIds: [], snoozes, snoozeDurationMs: durationMs };
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
    ...(effect === "review-results" && plan.markedReviewed ? { markedReviewed: true } : {}),
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
    { effect: "review-results" as const, count: plan.results.length, undoable: false },
    { effect: "read-notifications" as const, count: plan.notificationIds.length, undoable: false },
    { effect: "hide-for-a-day" as const, count: plan.snoozes.length, undoable: true },
  ].filter((summary) => summary.count > 0);
}

export function countFleetBulkPlan(plan: FleetBulkPlan) {
  return plan.results.length + plan.notificationIds.length + plan.snoozes.length;
}

/**
 * Read/snooze changes and confirmed explicit review saves. Failures are counted
 * separately, and rows known to be handled elsewhere are skipped.
 */
export interface FleetBulkOutcome {
  /** Confirmed saved read states; the writer cannot prove which caller owns them. */
  readResults: number;
  /** Saved explicit marks confirmed by the writer; not a claim of write ownership. */
  markedReviewed?: number;
  read: string[];
  snoozed: string[];
  /** Deadline written by this action, required for guarded snooze Undo. */
  snoozedUntil?: string;
  failed: number;
}

/** Changed items plus confirmed explicit review saves, for the toast. */
export function countFleetBulkOutcome(outcome: FleetBulkOutcome) {
  return (
    outcome.readResults +
    (outcome.markedReviewed ?? 0) +
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
  /** Current scopes still unread or explicitly unreviewed, checked before writing. */
  listPendingResults: (scopes: ResultReviewScope[], markedReviewed?: boolean) => Promise<ResultReviewScope[]>;
  /** Resolves to how many rows changed. */
  setResultsReviewed: (args: { scopes: ResultReviewScope[]; reviewed: boolean }) => Promise<number>;
  setResultMarkedReviewed?: (args: SetResultMarkedReviewedArgs) => Promise<ResultReview>;
  /** Resolves to whether the notification was still unread. */
  markNotificationRead: (args: { id: string; resolvedAt: string }) => Promise<boolean>;
  snoozeFleetAttention: (args: { attentionId: string; workspaceId: string; snoozedUntil: string }) => Promise<unknown>;
  clearFleetAttentionSnoozes: (args: { attentionIds: string[]; expectedSnoozedUntil?: string }) => Promise<unknown>;
}

/**
 * Applies every effect of a plan and reports what changed. Effects run side by
 * side and one failure never stops the others (a failed result batch counts
 * every scope it carried). Only results still waiting for review are written,
 * so results already read when checked are skipped. Result reads are never
 * undone: a concurrent writer may own the saved read or explicit review.
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
      pending = await operations.listPendingResults(plan.results, plan.markedReviewed);
    } catch {
      // Without the current state nothing can be claimed: write nothing.
      unreadable = plan.results.length;
    }
  }
  const batches = plan.markedReviewed ? [] : chunkResultScopes(pending);
  type Settled =
    | { kind: "reviewed"; scopes: ResultReviewScope[]; updated: number }
    | { kind: "marked-reviewed" }
    | { kind: "read"; id: string; changed: boolean }
    | { kind: "snoozed"; id: string };
  const settled = await Promise.allSettled<Settled>([
    ...batches.map((scopes) =>
      operations
        .setResultsReviewed({ scopes, reviewed: true })
        .then((updated): Settled => ({ kind: "reviewed", scopes, updated })),
    ),
    ...(plan.markedReviewed ? pending.map(async (scope): Promise<Settled> => {
      if (!operations.setResultMarkedReviewed) throw new Error("Explicit result review is unavailable.");
      const saved = await operations.setResultMarkedReviewed({ ...scope, markedReviewed: true });
      if (resultReviewKey(saved) !== resultReviewKey(scope) || !saved.markedReviewedAt || !saved.reviewedAt) {
        throw new Error("The explicit review mark was not confirmed.");
      }
      return { kind: "marked-reviewed" };
    }) : []),
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
    readResults: 0,
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
      outcome.readResults += Math.max(0, Math.min(value.updated, value.scopes.length));
    } else if (value.kind === "marked-reviewed") {
      // The idempotent single-result writer confirms saved state, not which
      // caller wrote it. Never erase a concurrent user's mark through Undo.
      outcome.markedReviewed = (outcome.markedReviewed ?? 0) + 1;
    } else if (value.kind === "read") {
      if (value.changed) outcome.read.push(value.id);
    } else {
      outcome.snoozed.push(value.id);
      outcome.snoozedUntil = args.snoozedUntil;
    }
  });
  return outcome;
}

/**
 * Takes back snoozes. Reads and explicit review marks stay: their writers
 * cannot prove ownership across concurrent surfaces. Returns
 * whether everything that could be undone was.
 */
export async function revertFleetBulkOutcome(
  outcome: FleetBulkOutcome,
  operations: FleetBulkOperations,
) {
  const canUndoSnoozes = outcome.snoozed.length === 0 || Boolean(outcome.snoozedUntil);
  const undone = await Promise.allSettled([
    // The clear IPC contract caps one request at 1,000 attention ids.
    ...Array.from({ length: canUndoSnoozes ? Math.ceil(outcome.snoozed.length / 1000) : 0 }, (_, index) =>
      operations.clearFleetAttentionSnoozes({
        attentionIds: outcome.snoozed.slice(index * 1000, (index + 1) * 1000),
        expectedSnoozedUntil: outcome.snoozedUntil,
      }),
    ),
  ]);
  return canUndoSnoozes && undone.every((result) => result.status === "fulfilled");
}
