import type { AppNotification } from "@/lib/notifications/notification.types";
import { ResultEvidenceSchema } from "./result-evidence";
import {
  ListResultReviewsArgsSchema,
  SetResultReviewedArgsSchema,
  ResultReviewSchema,
  resultReviewKey,
  type ListResultReviewsArgs,
  type ResultReview,
  type ResultReviewPage,
  type SetResultReviewedArgs,
} from "./result-review";

const STORAGE_KEY = "stave:result-reviews:v1";
const listeners = new Set<() => void>();
const reads = new Map<string, Promise<ResultReviewPage>>();
let revision = 0;

export const subscribeResultReviews = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getResultReviewRevision = () => revision;
export function invalidateResultReviews() {
  revision += 1;
  reads.clear();
  for (const listener of listeners) listener();
}

function fallbackRows(): ResultReview[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed))
    throw new Error("Saved result reviews could not be read.");
  return parsed.map((row) => ResultReviewSchema.parse(row));
}

/** Browser-only persistence. Desktop failures must never fall back to another writer. */
export function captureBrowserResult(notification: AppNotification) {
  if (
    notification.kind !== "task.turn_completed" &&
    notification.kind !== "task.turn_failed"
  )
    return;
  const { projectPath, workspaceId, taskId, turnId } = notification;
  if (!projectPath || !workspaceId || !taskId || !turnId) return;
  const rows = fallbackRows();
  const scope = { projectPath, workspaceId, taskId, turnId };
  if (rows.some((row) => resultReviewKey(row) === resultReviewKey(scope)))
    return;
  const evidence = ResultEvidenceSchema.safeParse(notification.payload?.resultEvidence);
  const result: ResultReview = {
    ...scope,
    id: notification.id,
    projectName: notification.projectName ?? "Project",
    workspaceName: notification.workspaceName ?? "Workspace",
    taskTitle: notification.taskTitle ?? notification.title,
    summary: notification.body.slice(0, 2000),
    outcome: notification.kind === "task.turn_failed" ? "failed" : "completed",
    createdAt: notification.createdAt,
    reviewedAt: null,
    ...(evidence.success ? { evidence: evidence.data } : {}),
  };
  // Persist before acknowledging; quota failure must stay observable.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...rows, result]));
  invalidateResultReviews();
}

/**
 * Whether a durable result store is wired up behind `listResultReviews`. Only
 * the desktop bridge is durable: without it the reads below fall back to the
 * best-effort localStorage mirror, which is written at notification ingestion
 * and is not the record of a finished turn. Attention projection uses this to
 * decide whether durable results may take terminal attention over the
 * notification list.
 */
export function hasDurableResultReviewStore() {
  return typeof window.api?.persistence?.listResultReviews === "function";
}

export function listResultReviews(
  input: ListResultReviewsArgs = {},
): Promise<ResultReviewPage> {
  const args = ListResultReviewsArgsSchema.parse(input);
  const key = JSON.stringify(args);
  const existing = reads.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const persistence = window.api?.persistence;
    if (persistence) {
      if (!persistence.listResultReviews)
        throw new Error(
          "Result review storage is unavailable. Restart Stave to load the updated bridge.",
        );
      const response = await persistence.listResultReviews(args);
      if (!response.ok)
        throw new Error(
          "Could not load result reviews. Retry to refresh saved results.",
        );
      return response;
    }
    const rows = fallbackRows()
      .filter(
        (row) =>
          (!args.workspaceIds || args.workspaceIds.includes(row.workspaceId)) &&
          (!args.workspaceId || row.workspaceId === args.workspaceId) &&
          (!args.taskId || row.taskId === args.taskId) &&
          (!args.pendingOnly || !row.reviewedAt),
      )
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    const offset = args.offset ?? 0;
    const results = rows.slice(offset, offset + (args.limit ?? 100)).map((row) => {
      if (args.includeEvidence !== false) return row;
      const { evidence: _evidence, ...summary } = row;
      return summary;
    });
    return {
      results,
      total: rows.length,
      hasMore: offset + results.length < rows.length,
    };
  })().finally(() => {
    if (reads.get(key) === pending) reads.delete(key);
  });
  reads.set(key, pending);
  return pending;
}

export async function setResultReviewed(
  input: SetResultReviewedArgs,
): Promise<ResultReview> {
  const args = SetResultReviewedArgsSchema.parse(input);
  const persistence = window.api?.persistence;
  let result: ResultReview;
  if (persistence) {
    if (!persistence.setResultReviewed)
      throw new Error(
        "Result review storage is unavailable. Restart Stave to load the updated bridge.",
      );
    const response = await persistence.setResultReviewed(args);
    if (!response.ok || !response.result)
      throw new Error(
        "Review was not saved. Retry; the result is still pending review.",
      );
    result = response.result;
  } else {
    const rows = fallbackRows();
    const index = rows.findIndex(
      (row) => resultReviewKey(row) === resultReviewKey(args),
    );
    const current = rows[index];
    if (!current)
      throw new Error(
        "This result could not be found. Refresh the result list.",
      );
    result = {
      ...current,
      reviewedAt: args.reviewed
        ? (current.reviewedAt ?? new Date().toISOString())
        : null,
    };
    rows[index] = result;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }
  invalidateResultReviews();
  return result;
}
