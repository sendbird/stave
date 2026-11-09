import { describe, expect, test } from "bun:test";
import { buildTarsFlow, isAppliedDelegateReceipt, selectTarsActivityNotices } from "../src/lib/tars/flow-model";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import type { TarsActionRecord } from "../src/lib/tars/conversation";
import type { TarsActivity } from "../src/lib/tars/types";

const start = new Date("2026-11-05T00:00:00.000Z");

describe("Tars flow model", () => {
  test("an applied delegate builds request → decision → stages → completion from the snapshot and the run", () => {
    const f = buildTarsTrayFixtures(start);
    const row = f.responsibilities.find((value) => value.id === f.ids.billing)!;
    const flow = buildTarsFlow({ receipt: f.receipt, row, run: f.runs["run-billing"] })!;
    expect(flow).toMatchObject({ responsibilityId: f.ids.billing, title: row.title, criteriaCount: 2, agentId: "debugger",
      reason: "The failure only shows on empty lists, so the Debugger reproduces it before changing code.",
      state: "running", criteriaMet: null, fleetTarget: { workspaceId: "exec-billing", taskId: "task-billing" } });
    expect(flow.progress!.stages.map((stage) => [stage.id, stage.status, stage.attempt, stage.current])).toEqual([
      ["reproduce", "completed", 1, false], ["cause", "running", 2, true], ["fix", "pending", 0, false]]);
    expect([flow.progress!.finished, flow.progress!.total]).toEqual([1, 3]);
  });

  test("the delegation's stated reason reaches the flow block", () => {
    const f = buildTarsTrayFixtures(start);
    const receipt = f.receipt.action.kind === "delegate"
      ? { ...f.receipt, action: { ...f.receipt.action, reason: "The export fails only on empty lists; the Debugger reproduces first." } } : f.receipt;
    expect(buildTarsFlow({ receipt, row: undefined, run: undefined })?.reason).toBe("The export fails only on empty lists; the Debugger reproduces first.");
  });

  test("unknown parts stay unknown: no run means no stages, no report means no criteria count", () => {
    const f = buildTarsTrayFixtures(start);
    const flow = buildTarsFlow({ receipt: f.receipt, row: undefined, run: undefined })!;
    expect(flow).toMatchObject({ title: f.receipt.action.kind === "delegate" ? f.receipt.action.title : "", state: null, progress: null, criteriaMet: null, fleetTarget: null });
    const run = f.runs["run-billing"]!;
    const row = f.responsibilities.find((value) => value.id === f.ids.billing)!;
    const report = { acceptanceCriteria: [{ text: row.acceptanceCriteria[0]!, status: "met" as const }, { text: row.acceptanceCriteria[1]!, status: "unverified" as const }] };
    const reported = buildTarsFlow({ receipt: f.receipt, row, run: { ...run, report: report as unknown as typeof run.report } })!;
    expect(reported.criteriaMet).toBe(1);
  });

  test("only an applied delegate with a responsibility gets a flow", () => {
    const f = buildTarsTrayFixtures(start);
    expect(isAppliedDelegateReceipt(f.receipt)).toBe(true);
    expect(buildTarsFlow({ receipt: { ...f.receipt, status: "pending", responsibilityId: null }, row: undefined, run: undefined })).toBeNull();
    expect(buildTarsFlow({ receipt: { ...f.receipt, status: "rejected", responsibilityId: null, error: "No." }, row: undefined, run: undefined })).toBeNull();
    const control = { ...f.receipt, action: { kind: "control" as const, responsibilityId: "x", expectedRevision: 1, operation: "pause" as const } };
    expect(buildTarsFlow({ receipt: control, row: undefined, run: undefined })).toBeNull();
  });

  test("the conversation keeps completion, a block and an unasked end; live progress and your own cancel stay out", () => {
    const at = (minute: number) => new Date(start.getTime() + minute * 60_000).toISOString();
    const event = (id: string, responsibilityId: string, state: TarsActivity["state"], minute: number): TarsActivity =>
      ({ id, responsibilityId, revision: minute + 1, title: responsibilityId, state, detail: null, createdAt: at(minute) });
    const activity = [
      event("a1", "a", "queued", 0), event("a2", "a", "running", 1), event("a3", "a", "running", 2), event("a4", "a", "blocked", 3),
      event("a5", "a", "blocked", 4), event("a6", "a", "completed", 5),
      event("b1", "b", "waiting", 1), event("b2", "b", "cancelled", 6),
      event("c1", "c", "cancelled", 7),
    ];
    const yourCancel: TarsActionRecord = { requestId: "click", source: "click", requestHash: "d".repeat(64),
      action: { kind: "control", responsibilityId: "c", expectedRevision: 7, operation: "cancel" }, status: "applied", error: null, reason: null,
      revision: 2, createdAt: at(7), updatedAt: at(7) };
    expect(selectTarsActivityNotices(activity, [yourCancel]).map((notice) => [notice.activity.id, notice.kind]))
      .toEqual([["a4", "blocked"], ["a6", "completed"], ["b2", "cancelled"]]);
  });
});
