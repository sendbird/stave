import { describe, expect, test } from "bun:test";
import type { AutomationRun, AutomationSpec } from "../src/lib/automations";
import {
  buildScheduleRows,
  formatScheduleCadence,
  resolveScheduleSelection,
  scheduleListState,
} from "../src/lib/schedule-rows";
import type { WakeUp, WakeUpSummary } from "../src/lib/supervision/wake-up-policy";

function automation(patch: Partial<AutomationSpec> = {}): AutomationSpec {
  return {
    id: "auto-1",
    name: "Daily review",
    prompt: "Review changes",
    enabled: true,
    schedule: { every: 1, unit: "days", at: { hour: 9, minute: 0 } },
    environment: { kind: "repository", workspaceId: "ws-1", path: "/tmp/repo", repositoryPath: "/tmp/repo", label: "repo" },
    runtime: { provider: "claude-code", model: "sonnet" },
    nextRunAt: "2026-10-03T09:00:00.000Z",
    lastRunAt: null,
    ...patch,
  } as unknown as AutomationSpec;
}

function run(patch: Partial<AutomationRun>): AutomationRun {
  return {
    id: "run-1",
    automationId: "auto-1",
    status: "completed",
    startedAt: "2026-10-02T09:00:00.000Z",
    completedAt: "2026-10-02T09:05:00.000Z",
    ...patch,
  } as unknown as AutomationRun;
}

function wakeUp(patch: Partial<WakeUp> = {}): WakeUp {
  return {
    id: "wake-1",
    workspaceId: "ws-1",
    taskId: "task-1",
    prompt: "Re-check CI on the pull request\nreport only on change",
    trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
    fingerprint: { providerId: "claude-code", model: "opus" },
    state: "scheduled",
    nextRunAt: "2026-10-02T11:00:00.000Z",
    lastOccurrenceAt: null,
    occurrenceCount: 0,
    ...patch,
  } as unknown as WakeUp;
}

const summary = (patch: Partial<WakeUpSummary> = {}) =>
  ({ wakeUpId: "wake-1", taskId: "task-1", triggerKind: "schedule", state: "scheduled", nextRunAt: null, ...patch }) as WakeUpSummary;

describe("schedule rows", () => {
  test("reads cadence without a redundant count", () => {
    expect(formatScheduleCadence({ every: 1, unit: "hours" })).toBe("Every hour");
    expect(formatScheduleCadence({ every: 15, unit: "minutes" })).toBe("Every 15 minutes");
  });

  test("folds both kinds into one list with the latest run as the last result", () => {
    const rows = buildScheduleRows({
      automations: [automation()],
      runs: [run({ id: "new", status: "failed" }), run({ id: "old", status: "completed" })],
      wakeUps: [wakeUp()],
      summaries: [summary()],
      taskTitleById: new Map([["task-1", "Fix flaky test"]]),
    });
    expect(rows.map((row) => row.kind)).toEqual(["check-back", "start"]);
    const start = rows.find((row) => row.kind === "start")!;
    expect(start.lastResult).toMatchObject({ label: "Failed", tone: "danger" });
    expect(start.agent).toBe("sonnet");
    expect(start.canRunNow).toBe(true);
    expect(start.toggle).toBe("pause");
    const checkBack = rows.find((row) => row.kind === "check-back")!;
    expect(checkBack.name).toBe("Check back on Fix flaky test");
    expect(checkBack.detail).toBe("Re-check CI on the pull request");
    expect(checkBack.canRunNow).toBe(false);
    expect(checkBack.nextRunAt).toBe("2026-10-02T11:00:00.000Z");
  });

  test("an automation that has not run says so, and a manual one says Manual once", () => {
    const [row] = buildScheduleRows({
      automations: [automation({ enabled: false })],
      runs: [],
      wakeUps: [],
      summaries: [],
      taskTitleById: new Map(),
    });
    expect(row?.lastResult.label).toBe("Not run yet");
    // The state reads "Manual"; no cadence or next-run note repeats it.
    expect(row?.cadence).toBeNull();
    expect(row?.nextNote).toBeNull();
    expect(row?.nextRunAt).toBeNull();
    expect(row?.state).toBe("manual");
    expect(row?.toggle).toBe("resume");
  });

  test("a subagent-completion check-back has no time and falls back to its prompt for a name", () => {
    const [row] = buildScheduleRows({
      automations: [],
      runs: [],
      wakeUps: [wakeUp({ trigger: { kind: "completion" }, nextRunAt: null, occurrenceCount: 2, lastOccurrenceAt: "2026-10-02T08:00:00.000Z" })],
      summaries: [summary({ triggerKind: "completion" })],
      taskTitleById: new Map(),
    });
    expect(row?.name).toBe("Re-check CI on the pull request");
    expect(row?.cadence).toBe("When subagents finish");
    expect(row?.nextRunAt).toBeNull();
    expect(row?.nextNote).toBe("Waiting");
    expect(row?.lastResult.label).toBe("Checked 2×");
  });

  test("paused and stopped check-backs sort after running ones and stopped cannot resume", () => {
    const rows = buildScheduleRows({
      automations: [],
      runs: [],
      wakeUps: [
        wakeUp({ id: "s", state: "stopped" }),
        wakeUp({ id: "p", state: "paused" }),
        wakeUp({ id: "r" }),
      ],
      summaries: [],
      taskTitleById: new Map(),
    });
    expect(rows.map((row) => row.id)).toEqual(["r", "p", "s"]);
    expect(rows.map((row) => row.toggle)).toEqual(["pause", "resume", null]);
    // The state already says Paused / Stopped, so the next-run slot stays empty.
    expect(rows.map((row) => row.nextNote)).toEqual([null, null, null]);
  });
});

describe("schedule selection", () => {
  const rows = buildScheduleRows({
    automations: [],
    runs: [],
    wakeUps: [wakeUp({ id: "a" }), wakeUp({ id: "b", nextRunAt: "2026-10-02T12:00:00.000Z" })],
    summaries: [],
    taskTitleById: new Map(),
  });

  test("a list of only check-backs opens on the first one", () => {
    expect(resolveScheduleSelection(rows, null)?.key).toBe("check-back:a");
  });

  test("keeps the picked row while it exists and falls back once it is gone", () => {
    expect(resolveScheduleSelection(rows, "check-back:b")?.key).toBe("check-back:b");
    expect(resolveScheduleSelection(rows, "start:removed")?.key).toBe("check-back:a");
    expect(resolveScheduleSelection([], "check-back:b")).toBeNull();
  });
});

describe("schedule list state", () => {
  const base = { rowCount: 0, automationsLoaded: true, checkBacksLoaded: true, failed: false };

  test("waits for both sources before calling the list empty", () => {
    expect(scheduleListState({ ...base, checkBacksLoaded: false })).toBe("loading");
    expect(scheduleListState({ ...base, automationsLoaded: false })).toBe("loading");
    expect(scheduleListState(base)).toBe("empty");
  });

  test("a failed read is shown as the failure, not as no schedules", () => {
    expect(scheduleListState({ ...base, failed: true })).toBe("failed");
  });

  test("rows on screen stay through a reload or a failed refresh", () => {
    expect(scheduleListState({ ...base, rowCount: 2, checkBacksLoaded: false })).toBe("rows");
    expect(scheduleListState({ ...base, rowCount: 2, failed: true })).toBe("rows");
  });
});

describe("check-back request", () => {
  test("is consumed once", async () => {
    const { useScheduleRequestStore } = await import("../src/store/schedule-request-store");
    useScheduleRequestStore.getState().requestCheckBack({ workspaceId: "ws-1", taskId: "task-1" });
    expect(useScheduleRequestStore.getState().consume()).toEqual({ workspaceId: "ws-1", taskId: "task-1" });
    expect(useScheduleRequestStore.getState().consume()).toBeNull();
  });
});
