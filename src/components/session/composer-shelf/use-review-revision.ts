import { useCallback, useEffect, useState } from "react";
import { ReviewRevisionStateSchema, type ReviewRevisionState } from "@/lib/reviews/review-revision";
import type { ReviewShelfItem } from "@/lib/reviews/review-task";

const unavailable: ReviewRevisionState = {
  source: { status: "unknown", reason: "unavailable" },
  completed: { status: "unknown", reason: "unavailable" },
  current: { status: "unknown", reason: "unavailable" },
};
const pending = new Map<string, Promise<ReviewRevisionState>>();

/** Check on result access and focus, never on each streamed token or timer. */
export function useReviewRevision(item: ReviewShelfItem) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; state: ReviewRevisionState | null } | null>(null);
  const child = item.child;
  const { parentTaskId, delegationKey, delegatedTaskId, delegatedWorkspaceId, phase } = child;
  const key = `${child.runId}:${child.attempt}:${child.delegatedTurnId}:${child.updatedAt}`;
  const enabled = item.status === "ready";
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const read = window.api?.runs?.getReviewRevision;
    if (!enabled) return;
    if (!read) { setLoaded({ key, state: unavailable }); return; }
    let cancelled = false;
    let request = pending.get(key);
    if (!request) {
      request = read({ parentTaskId, delegationKey,
        expected: { delegatedTaskId, delegatedWorkspaceId, attempt: child.attempt, phase } })
        .then((result) => {
          const parsed = ReviewRevisionStateSchema.safeParse(result);
          return parsed.success ? parsed.data : unavailable;
        }).catch(() => unavailable).finally(() => pending.delete(key));
      pending.set(key, request);
    }
    void request.then((state) => { if (!cancelled) setLoaded({ key, state }); });
    return () => { cancelled = true; };
  }, [attempt, child.attempt, delegatedTaskId, delegatedWorkspaceId, delegationKey, enabled, key, parentTaskId, phase]);
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refresh]);
  return { state: loaded?.key === key ? loaded.state : null, refresh };
}
