import { describe, expect, test } from "bun:test";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  applyFleetBulkPlan,
  chunkResultScopes,
  countFleetBulkOutcome,
  countFleetBulkPlan,
  pickFleetBulkEffect,
  planFleetAttentionSnooze,
  planFleetOutcomeRead,
  planFleetOutcomeReview,
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

describe("bulk attention triage", () => {
  test("explicit review includes only saved, not-yet-marked outcomes and preserves requests", () => {
    const alreadyMarked = durableResult(2);
    alreadyMarked.resultReview = { ...alreadyMarked.resultReview!, markedReviewedAt: AT };
    const failed = { ...durableResult(3), kind: "run-failed" as const };
    const plan = planFleetOutcomeReview([durableResult(1), durableResult(1), failed, alreadyMarked, notificationResult, blockingApproval, readyPr]);
    expect(plan.results.map((scope) => scope.taskId)).toEqual(["task-1", "task-3"]);
    expect(plan.notificationIds).toEqual([]);
    expect(plan.snoozes).toEqual([]);
    expect(plan.markedReviewed).toBe(true);
    expect(summarizeFleetBulkPlan(plan)).toEqual([{ effect: "review-results", count: 2, undoable: false }]);
    expect(pickFleetBulkEffect(plan, "review-results").markedReviewed).toBe(true);
  });

  test("reads failed and completed outcomes while preserving approval, question, sign-off and PR state", () => {
    const failed = { ...durableResult(3), kind: "run-failed" as const };
    const failedNotification = item({ id: "failure-notification", kind: "run-failed", source: "notification", notificationId: "n-failed" });
    const pending = [blockingApproval,
      item({ id: "question", kind: "user-input", notificationId: "n-question" }),
      item({ id: "sign-off", kind: "agent-run-sign-off", notificationId: "n-signoff" }),
      readyPr,
    ];
    const plan = planFleetOutcomeRead([failed, failed, durableResult(1), notificationResult, failedNotification, failedNotification, ...pending]);
    expect(plan.results.map((scope) => scope.turnId)).toEqual(["turn-3", "turn-1"]);
    expect(plan.notificationIds).toEqual(["n-1", "n-failed"]);
    expect(plan.snoozes).toEqual([]);
    expect(countFleetBulkPlan(planFleetOutcomeRead(pending))).toBe(0);
  });

  test("snoozes all attention kinds by exact id without reading outcomes or responding to requests", () => {
    const kinds = ["user-input", "approval", "run-failed", "turn-stalled", "result-ready", "pr-changes-requested", "pr-checks-failed", "pr-merge-conflict", "pr-behind-base", "pr-ready-to-merge", "agent-run-sign-off", "agent-run-blocked", "agent-run-stuck"] as const;
    const items = kinds.map((kind) => item({ id: `row:${kind}`, kind, notificationId: `notification:${kind}` }));
    const plan = planFleetAttentionSnooze([...items, items[0]!], 4 * 60 * 60 * 1000);
    expect(plan.results).toEqual([]);
    expect(plan.notificationIds).toEqual([]);
    expect(plan.snoozeDurationMs).toBe(14_400_000);
    expect(plan.snoozes).toEqual(kinds.map((kind) => ({ attentionId: `row:${kind}`, workspaceId: "ws-1" })));
  });
});

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
      { effect: "review-results", count: 2, undoable: false },
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

  test("explicit review reports confirmed saves and partial failures without offering to undo another writer's mark", async () => {
    const { ops, calls } = operations();
    ops.listPendingResults = async (scopes, markedReviewed) => {
      expect(markedReviewed).toBe(true);
      return scopes.filter((scope) => scope.taskId !== "task-3");
    };
    ops.setResultMarkedReviewed = async (args) => {
      calls.push(`marked:${args.taskId}`);
      expect(args.markedReviewed).toBe(true);
      if (args.taskId === "task-2") throw new Error("save failed");
      return {
        ...args, id: args.turnId, repositoryName: "Project", workspaceName: "Workspace", taskTitle: "Task",
        outcome: "completed", summary: "Saved", createdAt: AT, reviewedAt: AT, markedReviewedAt: AT,
      };
    };
    const outcome = await applyFleetBulkPlan({
      plan: planFleetOutcomeReview([durableResult(1), durableResult(2), durableResult(3)]),
      operations: ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome).toEqual({ readResults: 0, markedReviewed: 1, read: [], snoozed: [], failed: 1 });
    expect(countFleetBulkOutcome(outcome)).toBe(1);
    expect(calls).toEqual(["marked:task-1", "marked:task-2"]);
    calls.length = 0;
    expect(await revertFleetBulkOutcome(outcome, ops)).toBe(true);
    expect(calls).toEqual([]);
  });

  test("explicit review fails closed when the writer is missing or does not confirm the requested mark", async () => {
    const { ops, calls } = operations();
    const plan = planFleetOutcomeReview([durableResult(1)]);
    const unavailable = await applyFleetBulkPlan({ plan, operations: ops, resolvedAt: AT, snoozedUntil: AT });
    expect(countFleetBulkOutcome(unavailable)).toBe(0);
    expect(unavailable.failed).toBe(1);
    expect(calls).toEqual([]);
    ops.setResultMarkedReviewed = async (args) => ({
      ...args, id: args.turnId, repositoryName: "Project", workspaceName: "Workspace", taskTitle: "Task",
      outcome: "completed", summary: "Not marked", createdAt: AT, reviewedAt: AT, markedReviewedAt: null,
    });
    const unconfirmed = await applyFleetBulkPlan({ plan, operations: ops, resolvedAt: AT, snoozedUntil: AT });
    expect(countFleetBulkOutcome(unconfirmed)).toBe(0);
    expect(unconfirmed.failed).toBe(1);
  });

  test("a failed snooze no longer stops the rest, and failures are counted, not cleared", async () => {
    const { ops, calls } = operations({ snooze: true });
    const outcome = await applyFleetBulkPlan({ plan, operations: ops, resolvedAt: AT, snoozedUntil: AT });
    expect(calls.sort()).toEqual(["read:n-1", "results:true:task-1", "snooze:pr:pr-ready-to-merge:ws-2"]);
    expect(outcome).toMatchObject({ read: ["n-1"], snoozed: [], failed: 1 });
    expect(outcome.readResults).toBe(1);
  });

  test("bulk snooze reports partial failure and Undo restores only rows this action hid", async () => {
    const { ops, calls } = operations();
    ops.snoozeFleetAttention = async ({ attentionId, snoozedUntil }) => {
      expect(snoozedUntil).toBe(AT);
      if (attentionId === blockingApproval.id) throw new Error("save failed");
      calls.push(`snooze:${attentionId}`);
    };
    const outcome = await applyFleetBulkPlan({
      plan: planFleetAttentionSnooze([blockingApproval, notificationResult, readyPr], 3_600_000),
      operations: ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome).toEqual({ readResults: 0, read: [], snoozed: [notificationResult.id, readyPr.id], snoozedUntil: AT, failed: 1 });
    expect(calls).toEqual([`snooze:${notificationResult.id}`, `snooze:${readyPr.id}`]);
    const reverted = operations();
    expect(await revertFleetBulkOutcome(outcome, reverted.ops)).toBe(true);
    expect(reverted.calls).toEqual([`unsnooze:${notificationResult.id},${readyPr.id}`]);
    reverted.ops.clearFleetAttentionSnoozes = async () => { throw new Error("clear failed"); };
    expect(await revertFleetBulkOutcome(outcome, reverted.ops)).toBe(false);
  });

  test("Undo respects the snooze clear IPC limit for more than 1,000 exact rows", async () => {
    const { ops } = operations();
    const batches: string[][] = [];
    ops.clearFleetAttentionSnoozes = async ({ attentionIds, expectedSnoozedUntil }) => {
      expect(expectedSnoozedUntil).toBe(AT);
      batches.push(attentionIds);
    };
    const ids = Array.from({ length: 1001 }, (_, index) => `row-${index}`);
    expect(await revertFleetBulkOutcome({ readResults: 0, read: [], snoozed: ids, snoozedUntil: AT, failed: 0 }, ops)).toBe(true);
    expect(batches.map((batch) => batch.length)).toEqual([1000, 1]);
    expect(batches.flat()).toEqual(ids);
  });

  test("Undo refuses to clear snoozes without the deadline this action wrote", async () => {
    const { ops, calls } = operations();
    expect(await revertFleetBulkOutcome({ readResults: 0, read: [], snoozed: ["a"], failed: 0 }, ops)).toBe(false);
    expect(calls).toEqual([]);
  });

  test("a failed result batch counts every result it carried", async () => {
    const { ops } = operations({ results: true });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome).toEqual({ readResults: 0, read: [], snoozed: [], failed: 2 });
  });

  test("Undo only restores snoozes and preserves all reads", async () => {
    const applied = operations();
    const outcome = await applyFleetBulkPlan({ plan, operations: applied.ops, resolvedAt: AT, snoozedUntil: AT });
    const reverted = operations();
    expect(await revertFleetBulkOutcome(outcome, reverted.ops)).toBe(true);
    expect(reverted.calls.sort()).toEqual(["unsnooze:pr:pr-ready-to-merge:ws-2"]);
  });

  test("a result already reviewed elsewhere is neither counted nor taken back by Undo", async () => {
    const applied = operations({}, { reviewedElsewhere: ["task-2"] });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: applied.ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(applied.calls).toEqual(["results:true:task-1"]);
    expect(outcome.readResults).toBe(1);
    expect(countFleetBulkOutcome(outcome)).toBe(1);
    const reverted = operations();
    await revertFleetBulkOutcome(outcome, reverted.ops);
    expect(reverted.calls).toEqual([]);
  });

  test("when another surface reviews a result during the write, the change is counted but not undone", async () => {
    const applied = operations({}, { raced: 1 });
    const outcome = await applyFleetBulkPlan({
      plan: planFleetReviewClear([durableResult(1), durableResult(2)]),
      operations: applied.ops, resolvedAt: AT, snoozedUntil: AT,
    });
    expect(outcome).toMatchObject({ readResults: 1, failed: 0 });
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
    expect(outcome).toMatchObject({ readResults: 0, failed: 2 });
  });
});
