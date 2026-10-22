import { describe, expect, test } from "bun:test";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  applyFleetBulkPlan,
  chunkResultScopes,
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
  function operations(failing: { snooze?: boolean; results?: boolean } = {}) {
    const calls: string[] = [];
    const ops: FleetBulkOperations = {
      setResultsReviewed: async ({ scopes, reviewed }) => {
        calls.push(`results:${reviewed}:${scopes.length}`);
        if (failing.results) throw new Error("store down");
      },
      markNotificationRead: async ({ id }) => {
        calls.push(`read:${id}`);
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
    expect(calls.sort()).toEqual(["read:n-1", "results:true:1", "snooze:pr:pr-ready-to-merge:ws-2"]);
    expect(outcome).toMatchObject({ read: ["n-1"], snoozed: [], failed: 1 });
    expect(outcome.reviewed).toHaveLength(1);
  });

  test("a failed result batch counts every result it carried", async () => {
    const { ops } = operations({ results: true });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome).toEqual({ reviewed: [], read: [], snoozed: [], failed: 2 });
  });

  test("Undo takes back reviews and snoozes, and leaves notification reads alone", async () => {
    const applied = operations();
    const outcome = await applyFleetBulkPlan({ plan, operations: applied.ops, resolvedAt: AT, snoozedUntil: AT });
    const reverted = operations();
    expect(await revertFleetBulkOutcome(outcome, reverted.ops)).toBe(true);
    expect(reverted.calls.sort()).toEqual(["results:false:1", "unsnooze:pr:pr-ready-to-merge:ws-2"]);
  });
});
