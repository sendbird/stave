import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCoordinatorRows } from "../scripts/measure-coordinator-outcomes";
import { summarizeTarsOutcomes, tarsOutcome } from "../scripts/measure-tars-outcomes";

const at = (minutes: number) => new Date(Date.parse("2026-11-20T01:00:00.000Z") + minutes * 60_000).toISOString();
const PR = "https://github.com/acme/app/pull/42";

/** A database with the tables both scripts read: Tars work, the run ledger, agent runs, assignments, tasks and workspaces. */
function fixture(dir: string) {
  const file = join(dir, "stave.sqlite");
  const db = new Database(file);
  db.exec(`
    CREATE TABLE tars_responsibilities (created_at TEXT, body_json TEXT);
    CREATE TABLE agent_run_events (agent_run_id TEXT, sequence INTEGER, kind TEXT, detail_json TEXT, created_at TEXT);
    CREATE TABLE runs (id TEXT, kind TEXT, origin_kind TEXT, origin_id TEXT, workspace_id TEXT, task_id TEXT, status TEXT, created_at TEXT, updated_at TEXT, completed_at TEXT);
    CREATE TABLE run_receipts (run_id TEXT, step_id TEXT, sequence INTEGER, receipt_type TEXT, created_at TEXT, detail_json TEXT);
    CREATE TABLE agent_assignments (id TEXT, agent_config_id TEXT, task_id TEXT, created_at TEXT);
    CREATE TABLE tasks (id TEXT, workspace_id TEXT, title TEXT);
    CREATE TABLE workspaces (id TEXT, snapshot_json TEXT);
  `);
  db.run("INSERT INTO agent_assignments VALUES ('a1', 'coordinator-trial', 'coord-1', ?)", [at(-10)]);
  db.run("INSERT INTO agent_assignments VALUES ('a2', 'lead', 'lead-1', ?)", [at(-10)]);
  const tasks: Array<{ id: string; controlMode: string }> = [];
  let sequence = 0;
  const unit = (id: string, args: { parent?: string; status: string; created?: number; ended?: number; access?: string;
    events?: Array<[string, number, object?]>; reply?: string; controlMode?: string }) => {
    const created = args.created ?? 0;
    db.run("INSERT INTO runs VALUES (?, 'delegated-task', 'task', ?, 'worktree:w', ?, ?, ?, ?, ?)", [`run-${id}`, args.parent ?? "coord-1",
      `task-${id}`, args.status, at(created), at(args.ended ?? created + 60), args.ended === undefined ? null : at(args.ended)]);
    db.run("INSERT INTO run_receipts VALUES (?, 'step', 1, 'accepted', ?, ?)", [`run-${id}`, at(created), JSON.stringify({
      access: args.access ?? "inherit", ...(args.access === "read-only" ? {} : { agentConfigId: "implementer", agentRunId: `agent-${id}` }) })]);
    if (args.reply !== undefined) {
      db.run("INSERT INTO run_receipts VALUES (?, 'step', 2, 'completed', ?, ?)", [`run-${id}`, at(args.ended ?? created + 60),
        JSON.stringify({ code: "child-turn-completed", responseText: args.reply })]);
    }
    for (const [kind, minutes, detail] of args.events ?? []) {
      db.run("INSERT INTO agent_run_events VALUES (?, ?, ?, ?, ?)", [`agent-${id}`, sequence += 1, kind, JSON.stringify(detail ?? {}), at(minutes)]);
    }
    db.run("INSERT INTO tasks VALUES (?, 'worktree:w', ?)", [`worktree:w:task-${id}`, `Unit ${id}`]);
    tasks.push({ id: `task-${id}`, controlMode: args.controlMode ?? "managed" });
  };
  // A PR link in the child's stage report: reached a PR 40 minutes after it started.
  unit("a", { status: "completed", ended: 50, events: [["turn-started", 1], ["report", 40, { summary: `Opened draft PR ${PR}` }], ["agent-run-ended", 50]] });
  unit("b", { status: "completed", ended: 30, events: [["turn-started", 1], ["agent-run-ended", 30]] });
  unit("c", { status: "cancelled", ended: 20 });
  unit("d", { status: "failed", ended: 25 });
  // The PR link only in the answer it returned; a person signed off a stage.
  unit("e", { status: "completed", ended: 90, reply: `Done: ${PR}`, events: [["sign-off", 70], ["agent-run-ended", 90]] });
  // A read-only review the coordinator asked for is not a unit of work.
  unit("f", { status: "completed", ended: 5, access: "read-only", reply: `Reviewed ${PR}` });
  // The person took the child task over.
  unit("g", { status: "completed", ended: 45, controlMode: "interactive" });
  // Another task's delegation, and one before the range.
  unit("h", { parent: "lead-1", status: "completed", ended: 10 });
  unit("i", { status: "completed", created: -24 * 60, ended: -23 * 60 });
  unit("j", { status: "waiting" });
  db.run("INSERT INTO workspaces VALUES ('worktree:w', ?)", [JSON.stringify({ tasks })]);
  db.run("INSERT INTO tars_responsibilities VALUES (?, ?)", [at(0), JSON.stringify({ id: "r1", title: "Tars work", createdAt: at(0), updatedAt: at(30),
    state: "completed", publication: { state: "opened", watch: { startedAt: at(120) } } })]);
  db.close();
  return file;
}

test("measures the work a coordinator task delegated with the same outcome numbers as Tars", () => {
  const dir = mkdtempSync(join(tmpdir(), "stave-coordinator-"));
  try {
    const rows = readCoordinatorRows(fixture(dir), { coordinator: "coordinator-trial", since: at(-60), until: null });
    const outcomes = rows.map(tarsOutcome);
    expect(outcomes.map((outcome) => [outcome.title, outcome.result, outcome.minutes, outcome.humanDecided])).toEqual([
      ["Unit a", "pull-request", 40, false],
      ["Unit b", "completed", 30, false],
      ["Unit c", "cancelled", 20, false],
      ["Unit d", "failed", 25, false],
      ["Unit e", "pull-request", 90, true],
      ["Unit g", "taken-over", 45, false],
      ["Unit j", "open", null, false],
    ]);
    expect(summarizeTarsOutcomes(outcomes)).toMatchObject({ total: 7, pullRequests: 2, completed: 1, cancelled: 1, failed: 1, takenOver: 1,
      open: 1, humanDecided: 1, unattendedRate: 33, medianMinutesToPullRequest: 65 });
    // The end of the range is exclusive.
    expect(readCoordinatorRows(join(dir, "stave.sqlite"), { coordinator: "coordinator-trial", since: at(-60), until: at(0) })).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI prints the coordinator's numbers next to Tars's for the same range", () => {
  const dir = mkdtempSync(join(tmpdir(), "stave-coordinator-"));
  try {
    const file = fixture(dir);
    const result = Bun.spawnSync([process.execPath, "scripts/measure-coordinator-outcomes.ts", file, `--since=${at(-60)}`]);
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    const summary = JSON.parse(stdout.slice(stdout.lastIndexOf("\n{") + 1));
    expect(summary.tars).toMatchObject({ total: 1, pullRequests: 1, medianMinutesToPullRequest: 120 });
    expect(summary.coordinator).toMatchObject({ total: 7, pullRequests: 2, unattendedRate: 33 });
    // A coordinator that started nothing names the agents that did, so a wrong id is easy to fix.
    const missing = Bun.spawnSync([process.execPath, "scripts/measure-coordinator-outcomes.ts", file, "--coordinator=nobody"]);
    expect(missing.exitCode).toBe(0);
    expect(missing.stdout.toString()).toContain("coordinator-trial");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
