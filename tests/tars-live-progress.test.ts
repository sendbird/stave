import { describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import type { AgentRunEvent } from "../src/lib/agent-runs/domain";
import { getStageDisplayTitle } from "../src/lib/agent-runs/stage-display";
import type { ProviderTurnActivitySnapshot } from "../src/lib/providers/turn-status";
import {
  isTarsWorkRunning, projectTarsLiveProgress, selectTarsRecentProgress, TARS_PROGRESS_STALE_MS, tarsRunObservedAt,
} from "../src/lib/tars/live-progress";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";

const start = new Date("2026-11-05T00:00:00.000Z");
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
const msAt = (minutes: number) => start.getTime() + minutes * 60_000;

function fixture() {
  const f = buildTarsTrayFixtures(start);
  const row = f.responsibilities.find((candidate) => candidate.id === f.ids.billing)!;
  const run = f.runs[row.agentRunId!]!;
  return { f, row, run };
}

function event(run: AgentRunDetail, sequence: number, kind: AgentRunEvent["kind"], detail: Record<string, unknown>, minutes: number): AgentRunEvent {
  return { id: `event-${sequence}`, agentRunId: run.agentRun.id, sequence, kind, idempotencyKey: null, detail, createdAt: at(minutes) };
}

/** A turn of the run's lead task, as the host relays it: its latest tool call is a test command. */
function turn(minutes: number, patch: Partial<ProviderTurnActivitySnapshot> = {}): ProviderTurnActivitySnapshot {
  const when = msAt(minutes);
  return {
    turnId: "turn-1", providerId: "codex", startedAt: when - 60_000, lastEventAt: when, stalledAt: null, pendingInteraction: null,
    orderedWorkItemIds: ["read", "test"],
    workItemsById: {
      read: { id: "read", kind: "tool", status: "completed", title: "Read file", toolName: "Read", progressMessages: [], startedAt: when - 30_000, updatedAt: when - 30_000 },
      test: { id: "test", kind: "tool", status: "running", title: "Run command", toolName: "Bash", detail: "bun test tests/export.test.ts", progressMessages: [], startedAt: when, updatedAt: when },
    },
    ...patch,
  } as unknown as ProviderTurnActivitySnapshot;
}

describe("Tars live progress", () => {
  test("only work that holds the active slot is running; queued, paused, waiting and taken-over work is not", () => {
    const row = (state: TarsResponsibility["state"], agentRunId: string | null = "run") => ({ state, agentRunId });
    expect(isTarsWorkRunning(row("running"))).toBe(true);
    expect(isTarsWorkRunning(row("preparing"))).toBe(true);
    expect(isTarsWorkRunning(row("preparing", null))).toBe(false);
    for (const state of ["queued", "waiting", "paused", "takenOver", "blocked", "completed", "cancelled"] as const) {
      expect(isTarsWorkRunning(row(state))).toBe(false);
    }
  });

  test("without a run read in this window there is no stage, no activity and no freshness claim", () => {
    const { row } = fixture();
    const live = projectTarsLiveProgress({ row, run: undefined, turnActivity: turn(9), now: msAt(10) });
    expect(live).toEqual({ responsibilityId: row.id, running: true, stage: null, turn: "unknown", activity: null, recent: [], observedAt: null, freshness: "none" });
  });

  test("a streaming turn gives the activity and the stage the run is on, and reads as live", async () => {
    await applyAppLocale("en");
    const { row, run } = fixture();
    const live = projectTarsLiveProgress({ row, run, turnActivity: turn(9.5), now: msAt(10) });
    expect(live.running).toBe(true);
    expect(live.stage).toMatchObject({ id: "cause", position: 2, total: run.agentRun.workflow.stages.length, attempt: 2, current: true });
    expect(live.activity).toEqual({ text: "Running the tests", at: msAt(9.5) });
    expect(live.freshness).toBe("live");
    // The newest observation is the turn's event, newer than the run's own last change.
    expect(live.observedAt).toBe(msAt(9.5));
    expect(tarsRunObservedAt(run)).toBe(msAt(9));
  });

  test("between turns the work reads as recently observed, with no invented activity", () => {
    const { row, run } = fixture();
    const ended = turn(8, { completedAt: msAt(8.5) });
    const live = projectTarsLiveProgress({ row, run, turnActivity: ended, now: msAt(10) });
    expect(live.activity).toBeNull();
    expect(live.freshness).toBe("recent");
    expect(live.observedAt).toBe(msAt(9));
  });

  test("running work with nothing observed for the stale span, or a stalled turn, is marked out of date", () => {
    const { row, run } = fixture();
    const staleSpan = TARS_PROGRESS_STALE_MS / 60_000;
    // The run last changed at minute 9; the turn's last event was a little before that.
    const quiet = projectTarsLiveProgress({ row, run, turnActivity: turn(8.9), now: msAt(9 + staleSpan) });
    expect(quiet.freshness).toBe("stale");
    // One second short of the span it is still recent.
    expect(projectTarsLiveProgress({ row, run, turnActivity: null, now: msAt(9 + staleSpan) - 1_000 }).freshness).toBe("recent");
    // The provider watchdog marked the turn stalled: its last words are not "live" any more.
    const stalled = projectTarsLiveProgress({ row, run, turnActivity: turn(9.8, { stalledAt: msAt(9.9) }), now: msAt(10) });
    expect(stalled.freshness).toBe("stale");
  });

  test("a turn adopted after a reload, with no event from the run, is never shown as live progress", () => {
    const { row, run } = fixture();
    // Adoption (`startProviderTurnActivity` on restore) stamps lastEventAt with "now" and has no step yet; the run last changed at minute 9.
    const adopted = turn(0, { startedAt: msAt(8), lastEventAt: msAt(30), orderedWorkItemIds: [], workItemsById: {} });
    const live = projectTarsLiveProgress({ row, run, turnActivity: adopted, now: msAt(30) });
    expect(live.activity).toBeNull();
    expect(live.turn).toBe("active");
    expect(live.observedAt).toBe(msAt(9));
    expect(live.freshness).toBe("stale");
  });

  test("the turn is active, ended or unknown, and a finished turn's last step is not what it does now", () => {
    const { row, run } = fixture();
    expect(projectTarsLiveProgress({ row, run, turnActivity: null, now: msAt(10) }).turn).toBe("unknown");
    const ended = projectTarsLiveProgress({ row, run, turnActivity: turn(9.5, { completedAt: msAt(9.6) }), now: msAt(10) });
    expect(ended.turn).toBe("ended");
    expect(ended.activity).toBeNull();
    expect(ended.observedAt).toBe(msAt(9.6));
    expect(projectTarsLiveProgress({ row, run, turnActivity: turn(9.5), now: msAt(10) }).turn).toBe("active");
    // Work that is not running has no turn to speak of.
    expect(projectTarsLiveProgress({ row: { ...row, state: "paused" }, run, turnActivity: turn(9.5), now: msAt(10) }).turn).toBe("unknown");
  });

  test("work that is not running never borrows a turn's words and is never called out of date for being quiet", () => {
    const { row, run } = fixture();
    for (const state of ["waiting", "paused"] as const) {
      const live = projectTarsLiveProgress({ row: { ...row, state }, run, turnActivity: turn(9.5), now: msAt(9 + 120) });
      expect(live.running).toBe(false);
      expect(live.activity).toBeNull();
      expect(live.freshness).toBe("recent");
    }
  });

  test("ended work or an ended run has no current stage", () => {
    const { row, run } = fixture();
    expect(projectTarsLiveProgress({ row: { ...row, state: "completed" }, run, now: msAt(10) }).stage).toBeNull();
    const stopped = { ...run, agentRun: { ...run.agentRun, state: "completed" as const } };
    expect(projectTarsLiveProgress({ row, run: stopped, now: msAt(10) }).stage).toBeNull();
  });

  test("recent progress is the run's own events, newest first, in sentences, with repeats folded", async () => {
    await applyAppLocale("en");
    const { run } = fixture();
    const reproduce = getStageDisplayTitle(run.agentRun.workflow.stages[0]!);
    const cause = getStageDisplayTitle(run.agentRun.workflow.stages[1]!);
    const detail: AgentRunDetail = { ...run, events: [
      event(run, 1, "agent-run-started", {}, 0),
      event(run, 2, "turn-started", { stageId: "reproduce", attempt: 1 }, 1),
      event(run, 3, "resource-budget", {}, 1),
      event(run, 4, "report", { stageId: "reproduce", attempt: 1, outcome: "complete" }, 3),
      event(run, 5, "stage-completed", { stageId: "reproduce", attempt: 1 }, 4),
      event(run, 6, "turn-started", { stageId: "cause", attempt: 1 }, 4),
      event(run, 7, "stage-retried", { stageId: "cause", attempt: 2 }, 5),
      event(run, 8, "turn-started", { stageId: "cause", attempt: 2 }, 6),
      event(run, 9, "turn-started", { stageId: "cause", attempt: 2 }, 7),
      event(run, 10, "user-wait-started", { reason: "approval" }, 8),
      event(run, 11, "user-wait-ended", {}, 8.5),
      event(run, 12, "stage-blocked", { stageId: "missing-stage", attempt: 1 }, 8.6),
    ] };
    const entries = selectTarsRecentProgress(detail, 10);
    expect(entries.map((entry) => entry.text)).toEqual([
      "Stopped waiting for you",
      "Waiting for your approval",
      `Turn started in ${cause}`,
      `${cause} retried, attempt 2`,
      `Turn started in ${cause}`,
      `${reproduce} completed`,
      `${reproduce} reported done`,
      `Turn started in ${reproduce}`,
      "Run started",
    ]);
    // Bookkeeping (the resource ledger) and an event about a stage the workflow does not name are left out.
    expect(entries.some((entry) => entry.id === "event-3" || entry.id === "event-12")).toBe(false);
    // The two consecutive turns of the same attempt read as one, the newest.
    expect(entries[2]!.id).toBe("event-9");
    expect(entries.find((entry) => entry.text === "Waiting for your approval")!.tone).toBe("attention");
    expect(entries.find((entry) => entry.text === `${reproduce} completed`)!.tone).toBe("done");
    expect(selectTarsRecentProgress(detail, 3)).toHaveLength(3);
    expect(projectTarsLiveProgress({ row: fixture().row, run: detail, now: msAt(10), recentLimit: 2 }).recent.map((entry) => entry.id)).toEqual(["event-11", "event-10"]);
  });

  test("recent progress reads in the app's language", async () => {
    await applyAppLocale("ko");
    try {
      const { run } = fixture();
      const detail: AgentRunDetail = { ...run, events: [event(run, 1, "agent-run-started", {}, 0), event(run, 2, "agent-run-ended", { outcome: "completed" }, 9)] };
      expect(selectTarsRecentProgress(detail).map((entry) => entry.text)).toEqual(["실행 완료", "실행 시작"]);
    } finally { await applyAppLocale("en"); }
  });
});
