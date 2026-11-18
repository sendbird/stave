import { expect, test } from "bun:test";
import { summarizeTarsOutcomes, tarsOutcome, type TarsOutcomeRow } from "../scripts/measure-tars-outcomes";

const at = (minutes: number) => new Date(Date.parse("2026-11-17T14:00:00.000Z") + minutes * 60_000).toISOString();
const event = (kind: string, minutes: number, operation: string | null = null) => ({ kind, operation, createdAt: at(minutes) });
const row = (patch: Partial<TarsOutcomeRow> = {}): TarsOutcomeRow => ({ title: "Fix search", createdAt: at(0), updatedAt: at(900), state: "completed",
  detailCode: null, goal: "pullRequest", agentId: "debugger", publishedAt: null, runEvents: [], ...patch });

test("times work to its draft pull request and counts the run's hand-offs", () => {
  const outcome = tarsOutcome(row({ publishedAt: at(42), runEvents: [event("turn-started", 1), event("resource-budget", 2, "reserve"),
    event("resource-budget", 2, "consume"), event("wait-registered", 3), event("turn-started", 20), event("agent-run-ended", 30)] }));
  expect(outcome).toMatchObject({ result: "pull-request", minutes: 42, leadTurns: 2, helperStarts: 1, waits: 1 });
});

test("ended work without a pull request is timed to its run's last event, not to a later update of the row", () => {
  expect(tarsOutcome(row({ runEvents: [event("turn-started", 1), event("agent-run-ended", 25)] }))).toMatchObject({ result: "completed", minutes: 25 });
  // No run was recorded: the row's own last update is all there is.
  expect(tarsOutcome(row({ state: "cancelled" }))).toMatchObject({ result: "cancelled", minutes: 900 });
});

test("separates what Stave verified from what the user accepted, cancelled or took over", () => {
  expect(tarsOutcome(row({ detailCode: "acceptedWithoutVerification" })).result).toBe("accepted-unverified");
  expect(tarsOutcome(row({ state: "takenOver" })).result).toBe("taken-over");
  expect(tarsOutcome(row({ state: "running" }))).toMatchObject({ result: "open", minutes: null });
});

test("summarizes how much work ended without the user stepping in", () => {
  const summary = summarizeTarsOutcomes([
    tarsOutcome(row({ publishedAt: at(20), runEvents: [event("turn-started", 1)] })),
    tarsOutcome(row({ publishedAt: at(60), runEvents: [event("turn-started", 1), event("resource-budget", 2, "reserve"), event("resource-budget", 9, "reserve")] })),
    tarsOutcome(row({ state: "cancelled" })),
    tarsOutcome(row({ detailCode: "acceptedWithoutVerification" })),
    tarsOutcome(row({ state: "running" })),
  ]);
  expect(summary).toMatchObject({ total: 5, pullRequests: 2, cancelled: 1, acceptedUnverified: 1, open: 1, completed: 0,
    // Two of the four that ended reached a pull request by themselves.
    unattendedRate: 50, medianMinutesToPullRequest: 40, medianHelperStarts: 0 });
  expect(summarizeTarsOutcomes([])).toMatchObject({ total: 0, unattendedRate: null, medianMinutesToPullRequest: null });
});
