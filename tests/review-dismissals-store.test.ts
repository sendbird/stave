import { describe, expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import { selectReviewShelfItems, REVIEW_SHELF_SETTLED_TTL_MS } from "@/lib/reviews/review-task";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { buildReviewExchange } from "@/components/session/composer-shelf/composer-shelf.utils";
import { createReviewDismissalsStore, reviewDismissalScopeKey } from "@/store/review-dismissals-store";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const SCOPE = { repositoryPath: "/tmp/project", workspaceId: "ws-1", taskId: "parent-1" };
const KEY = "stave-review-ready";
const REVIEW: DelegatedTaskSummary = {
  runId: "run-1", stepId: "step-1", parentTaskId: SCOPE.taskId,
  delegationKey: KEY, delegatedTaskId: "review-1", delegatedWorkspaceId: SCOPE.workspaceId,
  delegatedTurnId: null, providerId: "codex", lifecycle: "one-turn", phase: "completed",
  reason: null, attempt: 1, createdAt: "2026-10-05T11:50:00.000Z",
  updatedAt: "2026-10-05T11:55:00.000Z", completedAt: "2026-10-05T11:55:00.000Z",
  result: "The review result remains available.",
};

function storage() {
  const values = new Map<string, string>();
  const backing: StateStorage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => { values.set(name, value); },
    removeItem: (name) => { values.delete(name); },
  };
  return { values, backing };
}

function shelf(store: ReturnType<typeof createReviewDismissalsStore>, scope = SCOPE) {
  return selectReviewShelfItems({
    children: [REVIEW],
    dismissedKeys: new Set(Object.keys(store.getState().dismissedReviewsByScope[reviewDismissalScopeKey(scope)] ?? {})),
    carriedTaskIds: new Set(), now: NOW, historyLoaded: true,
  });
}

describe("durable review dismissals", () => {
  test("restart restores the hidden row before the first render and preserves the result", () => {
    const { values, backing } = storage();
    const first = createReviewDismissalsStore({ storage: backing, now: () => NOW });
    expect(shelf(first)).toHaveLength(1);
    expect(first.getState().dismissReview({ ...SCOPE, delegationKey: KEY })).toBe(true);
    expect(shelf(first)).toHaveLength(0);
    const saved = values.get("stave:review-dismissals")!;
    expect(JSON.parse(saved).state.dismissedReviewsByScope[reviewDismissalScopeKey(SCOPE)][KEY]).toBe(NOW);

    const restarted = createReviewDismissalsStore({ storage: backing, now: () => NOW + 60_000 });
    expect(restarted.persist.hasHydrated()).toBe(true);
    expect(shelf(restarted)).toHaveLength(0);
    const exchange = buildReviewExchange({ item: { child: REVIEW, status: "ready" }, title: "Review" });
    expect(exchange.ref).toMatchObject({ delegatedTaskId: "review-1", delegatedWorkspaceId: "ws-1" });
    expect(exchange.outcome.result).toBe("The review result remains available.");
    expect(exchange.actions.map((action) => action.id)).toEqual(["open"]);
  });

  test("the same delegation key remains visible in another task, workspace or repository", () => {
    const { backing } = storage();
    const store = createReviewDismissalsStore({ storage: backing, now: () => NOW });
    store.getState().dismissReview({ ...SCOPE, delegationKey: KEY });
    expect(shelf(store, { ...SCOPE, taskId: "parent-2" })).toHaveLength(1);
    expect(shelf(store, { ...SCOPE, workspaceId: "ws-2" })).toHaveLength(1);
    expect(shelf(store, { ...SCOPE, repositoryPath: "/tmp/another-project" })).toHaveLength(1);
  });

  test("a missing legacy field and malformed saved entries default to visible reviews", () => {
    const { values, backing } = storage();
    for (const state of [{}, { dismissedReviewsByScope: [] }, {
      dismissedReviewsByScope: { [reviewDismissalScopeKey(SCOPE)]: { [KEY]: "yesterday" }, invalid: { [KEY]: NOW } },
    }]) {
      values.set("stave:review-dismissals", JSON.stringify({ state, version: 0 }));
      const store = createReviewDismissalsStore({ storage: backing, now: () => NOW });
      expect(store.persist.hasHydrated()).toBe(true);
      expect(store.getState().dismissedReviewsByScope).toEqual({});
      expect(shelf(store)).toHaveLength(1);
    }
  });

  test("rehydration and the next write prune expired dismissals and empty scopes", () => {
    const { values, backing } = storage();
    const expired = { ...SCOPE, taskId: "expired-parent" };
    values.set("stave:review-dismissals", JSON.stringify({ version: 0, state: { dismissedReviewsByScope: {
      [reviewDismissalScopeKey(expired)]: { old: NOW - REVIEW_SHELF_SETTLED_TTL_MS - 1 },
      [reviewDismissalScopeKey(SCOPE)]: { [KEY]: NOW - 60_000 },
    } } }));
    const store = createReviewDismissalsStore({ storage: backing, now: () => NOW });
    expect(store.getState().dismissedReviewsByScope[reviewDismissalScopeKey(expired)]).toBeUndefined();
    expect(shelf(store)).toHaveLength(0);
    store.getState().dismissReview({ ...SCOPE, delegationKey: "stave-review-second" });
    expect(JSON.parse(values.get("stave:review-dismissals")!).state.dismissedReviewsByScope)
      .toEqual({ [reviewDismissalScopeKey(SCOPE)]: { [KEY]: NOW - 60_000, "stave-review-second": NOW } });
  });

  test("a rejected save hides the row for the session and reports persistence failure", () => {
    const store = createReviewDismissalsStore({
      storage: { getItem: () => null, setItem: () => { throw new Error("Storage is full"); }, removeItem: () => {} },
      now: () => NOW,
    });
    expect(store.getState().dismissReview({ ...SCOPE, delegationKey: KEY })).toBe(false);
    expect(shelf(store)).toHaveLength(0);
  });
});
