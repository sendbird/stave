import { describe, expect, test } from "bun:test";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  applyFleetBulkPlan,
  chunkResultScopes,
  countFleetBulkOutcome,
  countFleetBulkPlan,
  pickFleetBulkEffect,
  planFleetReviewClear,
  revertFleetBulkOutcome,
  summarizeFleetBulkPlan,
  type FleetBulkOperations,
} from "@/lib/fleet/attention-bulk";

const AT = "2026-10-22T01:00:00.000Z";

function item(overrides: Partial<FleetAttentionItem> & Pick<FleetAttentionItem, "id" | "kind">): FleetAttentionItem {
  return {
    priority: 4, repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: "ws-1", workspaceName: "deploy",
    taskId: "task-1", createdAt: AT, source: "result", ...overrides,
  };
}

const durableResult = (index: number) =>
  item({
    id: `turn:result-ready:ws-1:task-${index}:turn-${index}`,
    kind: "result-ready",
    resultReview: {
      repositoryPath: "/tmp/project", workspaceId: "ws-1", taskId: `task-${index}`, turnId: `turn-${index}`,
    } as FleetAttentionItem["resultReview"],
  });
const notificationResult = item({ id: "turn:result-ready:ws-1:task-n:turn-n", kind: "result-ready", source: "notification", notificationId: "n-1" });
const readyPr = item({ id: "pr:pr-ready-to-merge:ws-2", kind: "pr-ready-to-merge", taskId: undefined, workspaceId: "ws-2", source: "pr" });
const blockingApproval = item({ id: "interaction:approval:ws-1:task-1:req", kind: "approval", notificationId: "n-approval", source: "notification" });

describe("clearing In review says what it will do first", () => {
  const plan = planFleetReviewClear([durableResult(1), durableResult(2), notificationResult, readyPr, blockingApproval]);

  test("each review item goes to the store that owns it; a blocking request is never cleared", () => {
    expect(plan.results.map((scope) => scope.taskId)).toEqual(["task-1", "task-2"]);
    expect(plan.notificationIds).toEqual(["n-1"]);
    expect(plan.snoozes).toEqual([{ attentionId: "pr:pr-ready-to-merge:ws-2", workspaceId: "ws-2" }]);
    expect(countFleetBulkPlan(plan)).toBe(4);
  });

  test("the menu lists each effect with its count, and which can be undone", () => {
    expect(summarizeFleetBulkPlan(plan)).toEqual([
      { effect: "review-results", count: 2, undoable: true },
      { effect: "read-notifications", count: 1, undoable: false },
      { effect: "hide-for-a-day", count: 1, undoable: true },
    ]);
    expect(summarizeFleetBulkPlan(pickFleetBulkEffect(plan, "hide-for-a-day"))).toEqual([
      { effect: "hide-for-a-day", count: 1, undoable: true },
    ]);
  });

  test("results go in batches of at most 200", () => {
    const scopes = Array.from({ length: 401 }, (_, index) => durableResult(index).resultReview!);
    expect(chunkResultScopes(scopes).map((batch) => batch.length)).toEqual([200, 200, 1]);
  });
});

describe("applying a plan", () => {
  function operations(
    failing: { snooze?: boolean; results?: boolean } = {},
    store: { reviewedElsewhere?: string[]; raced?: number; readElsewhere?: string[] } = {},
  ) {
    const calls: string[] = [];
    const ops: FleetBulkOperations = {
      listPendingResults: async (scopes) =>
        scopes.filter((scope) => !store.reviewedElsewhere?.includes(scope.taskId)),
      setResultsReviewed: async ({ scopes, reviewed }) => {
        calls.push(`results:${reviewed}:${scopes.map((scope) => scope.taskId).join(",")}`);
        if (failing.results) throw new Error("store down");
        return scopes.length - (reviewed ? (store.raced ?? 0) : 0);
      },
      markNotificationRead: async ({ id }) => {
        calls.push(`read:${id}`);
        return !store.readElsewhere?.includes(id);
      },
      snoozeFleetAttention: async ({ attentionId }) => {
        calls.push(`snooze:${attentionId}`);
        if (failing.snooze) throw new Error("snooze failed");
      },
      clearFleetAttentionSnoozes: async ({ attentionIds }) => {
        calls.push(`unsnooze:${attentionIds.join(",")}`);
      },
    };
    return { ops, calls };
  }
  const plan = planFleetReviewClear([durableResult(1), notificationResult, readyPr]);

  test("a failed snooze no longer stops the rest, and failures are counted, not cleared", async () => {
    const { ops, calls } = operations({ snooze: true });
    const outcome = await applyFleetBulkPlan({ plan, operations: ops, resolvedAt: AT, snoozedUntil: AT });
    expect(calls.sort()).toEqual(["read:n-1", "results:true:task-1", "snooze:pr:pr-ready-to-merge:ws-2"]);
    expect(outcome).toMatchObject({ read: ["n-1"], snoozed: [], failed: 1 });
    expect(outcome.reviewed).toHaveLength(1);
  });

  test("a failed result batch counts every result it carried", async () => {
    const { ops } = operations({ results: true });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome).toEqual({ reviewed: [], reviewedUnconfirmed: 0, read: [], snoozed: [], failed: 2 });
  });

  test("Undo takes back reviews and snoozes, and leaves notification reads alone", async () => {
    const applied = operations();
    const outcome = await applyFleetBulkPlan({ plan, operations: applied.ops, resolvedAt: AT, snoozedUntil: AT });
    const reverted = operations();
    expect(await revertFleetBulkOutcome(outcome, reverted.ops)).toBe(true);
    expect(reverted.calls.sort()).toEqual(["results:false:task-1", "unsnooze:pr:pr-ready-to-merge:ws-2"]);
  });

  test("a result already reviewed elsewhere is neither counted nor taken back by Undo", async () => {
    const applied = operations({}, { reviewedElsewhere: ["task-2"] });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: applied.ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(applied.calls).toEqual(["results:true:task-1"]);
    expect(outcome.reviewed.map((scope) => scope.taskId)).toEqual(["task-1"]);
    expect(countFleetBulkOutcome(outcome)).toBe(1);
    const reverted = operations();
    await revertFleetBulkOutcome(outcome, reverted.ops);
    expect(reverted.calls).toEqual(["results:false:task-1"]);
  });

  test("when another surface reviews a result during the write, the change is counted but not undone", async () => {
    const applied = operations({}, { raced: 1 });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: applied.ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome).toMatchObject({ reviewed: [], reviewedUnconfirmed: 1, failed: 0 });
    expect(countFleetBulkOutcome(outcome)).toBe(1);
    const reverted = operations();
    expect(await revertFleetBulkOutcome(outcome, reverted.ops)).toBe(true);
    expect(reverted.calls).toEqual([]);
  });

  test("a notification read elsewhere is not counted as cleared", async () => {
    const applied = operations({}, { readElsewhere: ["n-1"] });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([notificationResult]),
      operations: applied.ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome.read).toEqual([]);
    expect(countFleetBulkOutcome(outcome)).toBe(0);
  });

  test("when the pending read fails, nothing is written and every result counts as failed", async () => {
    const applied = operations();
    applied.ops.listPendingResults = async () => {
      throw new Error("store down");
    };
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: applied.ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(applied.calls).toEqual([]);
    expect(outcome).toMatchObject({ reviewed: [], failed: 2 });
  });
});
