import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarizeTarsOutcomes, tarsOutcome, type TarsOutcomeRow } from "../scripts/measure-tars-outcomes";

const at = (minutes: number) => new Date(Date.parse("2026-11-17T14:00:00.000Z") + minutes * 60_000).toISOString();
const event = (kind: string, minutes: number, operation: string | null = null) => ({ kind, operation, createdAt: at(minutes) });
const row = (patch: Partial<TarsOutcomeRow> = {}): TarsOutcomeRow => ({ title: "Fix search", createdAt: at(0), updatedAt: at(900), state: "completed",
  detailCode: null, goal: "pullRequest", agentId: "debugger", publishedAt: null, hasDecisionAnswer: false, runEvents: [], ...patch });

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

test("a recorded stage sign-off counts as a human decision even when the PR opened", () => {
  const outcomes = [
    tarsOutcome(row({ publishedAt: at(30), runEvents: [event("sign-off", 12)] })),
    tarsOutcome(row({ publishedAt: at(20), runEvents: [event("user-wait-ended", 10)] })),
  ];
  expect(summarizeTarsOutcomes(outcomes)).toMatchObject({ pullRequests: 2, humanDecided: 1, unattendedRate: 50 });
});


test("the CLI reads applied human answers and attributes them to the work they decide", () => {
  const dir = mkdtempSync(join(tmpdir(), "stave-outcomes-"));
  const file = join(dir, "stave.sqlite");
  try {
    const db = new Database(file);
    try {
      db.exec(`
        CREATE TABLE tars_responsibilities (created_at TEXT, body_json TEXT);
        CREATE TABLE agent_run_events (agent_run_id TEXT, sequence INTEGER, kind TEXT, detail_json TEXT, created_at TEXT);
        CREATE TABLE tars_decision_answers (decision_id TEXT, status TEXT, body_json TEXT);
        CREATE TABLE tars_action_receipts (message_id TEXT, action_index INTEGER, body_json TEXT);
        CREATE TABLE tars_messages (id TEXT, body_json TEXT);
      `);
      for (const id of ["control", "reply", "proposal", "dismissed", "withdrawn", "pending"]) {
        db.run("INSERT INTO tars_responsibilities VALUES (?, ?)", [at(0), JSON.stringify({
          id, title: id, createdAt: at(0), updatedAt: at(30), state: "completed",
          publication: { state: "opened", watch: { startedAt: at(30) } },
        })]);
      }
      const answer = (decisionId: string, effect: object, source = "click", status = "applied") =>
        db.run("INSERT INTO tars_decision_answers VALUES (?, ?, ?)", [decisionId, status, JSON.stringify({ decisionId, status, effect, source })]);
      answer("ask:msg-1:0", { kind: "control", responsibilityId: "control" }, "key");
      answer("ask:msg-2:0", { kind: "reply" }, "words");
      db.run("INSERT INTO tars_messages VALUES (?, ?)", ["msg-2", JSON.stringify({ target: { responsibilityId: "reply" } })]);
      answer("confirm:msg-3:0", { kind: "proposal" });
      db.run("INSERT INTO tars_action_receipts VALUES (?, ?, ?)", ["msg-3", 0, JSON.stringify({
        responsibilityId: "proposal", action: { kind: "delegate" },
      })]);
      answer("ask:msg-4:0", { kind: "dismiss" });
      db.run("INSERT INTO tars_messages VALUES (?, ?)", ["msg-4", JSON.stringify({ target: { responsibilityId: "dismissed" } })]);
      answer("ask:msg-5:0", { kind: "withdraw" }, "tars");
      db.run("INSERT INTO tars_messages VALUES (?, ?)", ["msg-5", JSON.stringify({ target: { responsibilityId: "withdrawn" } })]);
      answer("ask:msg-6:0", { kind: "control", responsibilityId: "pending" }, "click", "pending");
    } finally {
      db.close();
    }
    const result = Bun.spawnSync([process.execPath, "scripts/measure-tars-outcomes.ts", file]);
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    const summary = JSON.parse(stdout.slice(stdout.lastIndexOf("\n{") + 1));
    expect(summary).toMatchObject({ pullRequests: 6, humanDecided: 3, unattendedRate: 50 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
