import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { githubRepository, readCoordinatorRows } from "../scripts/measure-coordinator-outcomes";
import { summarizeTarsOutcomes, tarsOutcome } from "../scripts/measure-tars-outcomes";

const at = (minutes: number) => new Date(Date.parse("2026-11-20T01:00:00.000Z") + minutes * 60_000).toISOString();
const pr = (n: number, repository = "acme/app") => `https://github.com/${repository}/pull/${n}`;

/**
 * A database with the tables both scripts read: Tars work, the run ledger,
 * agent runs and their stages, assignments, tasks, workspaces and the project
 * registry, and the repository the work ran in.
 */
function fixture(dir: string) {
  const repository = join(dir, "repo");
  mkdirSync(repository);
  for (const command of [["init", "-q"], ["remote", "add", "origin", "git@github.com:acme/app.git"]])
    expect(Bun.spawnSync(["git", "-C", repository, ...command]).exitCode).toBe(0);
  const file = join(dir, "stave.sqlite");
  const db = new Database(file);
  db.exec(`
    CREATE TABLE tars_responsibilities (created_at TEXT, body_json TEXT);
    CREATE TABLE agent_runs (id TEXT, lead_task_id TEXT);
    CREATE TABLE agent_run_stages (agent_run_id TEXT, stage_id TEXT, attempt INTEGER, report_json TEXT);
    CREATE TABLE agent_run_events (agent_run_id TEXT, sequence INTEGER, kind TEXT, detail_json TEXT, created_at TEXT);
    CREATE TABLE runs (id TEXT, kind TEXT, origin_kind TEXT, origin_id TEXT, project_path TEXT, workspace_id TEXT, task_id TEXT, status TEXT, created_at TEXT, updated_at TEXT, completed_at TEXT);
    CREATE TABLE run_receipts (run_id TEXT, step_id TEXT, sequence INTEGER, receipt_type TEXT, created_at TEXT, detail_json TEXT);
    CREATE TABLE agent_assignments (id TEXT, agent_config_id TEXT, task_id TEXT, body_json TEXT, created_at TEXT);
    CREATE TABLE tasks (id TEXT, workspace_id TEXT, title TEXT);
    CREATE TABLE workspaces (id TEXT, snapshot_json TEXT);
    CREATE TABLE app_state (key TEXT, value_json TEXT);
  `);
  const assign = (id: string, agent: string, task: string, minutes: number) =>
    db.run("INSERT INTO agent_assignments VALUES (?, ?, ?, '{}', ?)", [id, agent, task, at(minutes)]);
  assign("a1", "coordinator-trial", "coord-1", -10);
  assign("a2", "lead", "lead-1", -10);
  const workspaces: Array<{ id: string; name: string }> = [];
  let sequence = 0;
  const unit = (id: string, args: { parent?: string; status: string; created?: number; ended?: number; access?: string;
    events?: Array<[string, number, object?]>; reply?: string; controlMode?: string }) => {
    const created = args.created ?? 0;
    const workspace = `worktree:${id}`;
    db.run("INSERT INTO runs VALUES (?, 'delegated-task', 'task', ?, ?, ?, ?, ?, ?, ?, ?)", [`run-${id}`, args.parent ?? "coord-1", repository,
      workspace, `task-${id}`, args.status, at(created), at(args.ended ?? created + 60), args.ended === undefined ? null : at(args.ended)]);
    db.run("INSERT INTO run_receipts VALUES (?, 'step', 1, 'accepted', ?, ?)", [`run-${id}`, at(created), JSON.stringify({
      access: args.access ?? "inherit", ...(args.access === "read-only" ? {} : { agentConfigId: "implementer", agentRunId: `agent-${id}` }) })]);
    if (args.reply !== undefined) {
      db.run("INSERT INTO run_receipts VALUES (?, 'step', 2, 'completed', ?, ?)", [`run-${id}`, at(args.ended ?? created + 60),
        JSON.stringify({ code: "child-turn-completed", responseText: args.reply })]);
    }
    for (const [kind, minutes, detail] of args.events ?? []) {
      db.run("INSERT INTO agent_run_events VALUES (?, ?, ?, ?, ?)", [`agent-${id}`, sequence += 1, kind, JSON.stringify(detail ?? {}), at(minutes)]);
    }
    db.run("INSERT INTO tasks VALUES (?, ?, ?)", [`${workspace}:task-${id}`, workspace, `Unit ${id}`]);
    db.run("INSERT INTO workspaces VALUES (?, ?)", [workspace, JSON.stringify({ tasks: [{ id: `task-${id}`, controlMode: args.controlMode ?? "managed" }] })]);
    workspaces.push({ id: workspace, name: `subagent-${id}` });
  };
  const complete = (summary: string) => ({ outcome: "complete", summary });
  // A PR link in the child's stage report: reached a PR 40 minutes after it started.
  unit("a", { status: "completed", ended: 50, events: [["turn-started", 1], ["report", 40, complete(`Opened draft PR ${pr(1)}`)], ["agent-run-ended", 50]] });
  unit("b", { status: "completed", ended: 30, events: [["turn-started", 1], ["agent-run-ended", 30]] });
  unit("c", { status: "cancelled", ended: 20 });
  // A failed unit whose earlier report gave a PR the coordinator listed is still a failure.
  unit("d", { status: "failed", ended: 25, events: [["report", 10, complete(`Draft ${pr(4)}`)]] });
  // The PR link only in the answer it returned; a person signed off a stage.
  unit("e", { status: "completed", ended: 90, reply: `Done: ${pr(5)}`, events: [["sign-off", 70], ["agent-run-ended", 90]] });
  // A read-only review the coordinator asked for is not a unit of work.
  unit("f", { status: "completed", ended: 5, access: "read-only", reply: `Reviewed ${pr(1)}` });
  // The person took the child task over.
  unit("g", { status: "completed", ended: 45, controlMode: "interactive" });
  // Another task's delegation, and one before the range.
  unit("h", { parent: "lead-1", status: "completed", ended: 10 });
  unit("i", { status: "completed", created: -24 * 60, ended: -23 * 60 });
  unit("j", { status: "waiting" });
  // A blocked report that merely quotes a PR, on a failed unit.
  unit("k", { status: "failed", ended: 35, events: [["report", 30, { outcome: "blocked", summary: `Blocked: same failure as ${pr(11)}` }]] });
  // A link to another repository's PR, even one the coordinator listed with this unit's branch.
  unit("l", { status: "completed", ended: 30, events: [["report", 20, complete(`See ${pr(7, "other/lib")}`)]] });
  // Its latest report is blocked: no PR while it waits.
  unit("m", { status: "waiting", events: [["report", 20, complete(`Draft ${pr(13)}`)], ["report", 40, { outcome: "blocked", summary: "Needs a login" }]] });
  // A PR the coordinator never verified, and one it verified for another unit's branch.
  unit("n", { status: "completed", ended: 30, events: [["report", 20, complete(`Draft ${pr(14)}`)]] });
  unit("o", { status: "completed", ended: 30, events: [["report", 20, complete(`Draft ${pr(15)}`)]] });
  // The coordinator's own completed report lists the PRs it verified, with the head branch it checked.
  db.run("INSERT INTO agent_runs VALUES ('coord-run', 'coord-1')");
  const verified = (url: string, head: string) => ({ kind: "link", ref: url, label: `Verified draft PR, head ${head}` });
  db.run("INSERT INTO agent_run_stages VALUES ('coord-run', 'work', 1, ?)", [JSON.stringify({ outcome: "complete", summary: "Two units verified.",
    evidence: [verified(pr(1), "subagent-a"), verified(pr(4), "subagent-d"), verified(pr(5), "subagent-e"), verified(pr(7, "other/lib"), "subagent-l"),
      verified(pr(13), "subagent-m"), verified(pr(15), "subagent-a"), { kind: "check", label: "head subagent-n", command: "gh pr view" }] })]);
  // A blocked report of the coordinator verifies nothing.
  db.run("INSERT INTO agent_run_stages VALUES ('coord-run', 'work', 2, ?)", [JSON.stringify({ outcome: "blocked", missing: "x",
    evidence: [verified(pr(14), "subagent-n")] })]);
  db.run("INSERT INTO app_state VALUES ('project_registry', ?)", [JSON.stringify([{ repositoryPath: repository, workspaces }])]);
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
      ["Unit d", "failed", 10, false],
      ["Unit e", "pull-request", 90, true],
      ["Unit g", "taken-over", 45, false],
      ["Unit j", "open", null, false],
      ["Unit k", "failed", 30, false],
      ["Unit l", "completed", 20, false],
      ["Unit m", "open", null, false],
      ["Unit n", "completed", 20, false],
      ["Unit o", "completed", 20, false],
    ]);
    expect(summarizeTarsOutcomes(outcomes)).toMatchObject({ total: 12, pullRequests: 2, completed: 4, cancelled: 1, failed: 2, takenOver: 1,
      open: 2, humanDecided: 1, unattendedRate: 50, medianMinutesToPullRequest: 65 });
    // The end of the range is exclusive.
    expect(readCoordinatorRows(join(dir, "stave.sqlite"), { coordinator: "coordinator-trial", since: at(-60), until: at(0) })).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reads a GitHub repository from remote and pull request URLs", () => {
  expect(githubRepository("git@github.com:Acme/App.git\n")).toBe("acme/app");
  expect(githubRepository("https://github.com/acme/app")).toBe("acme/app");
  expect(githubRepository(pr(3))).toBe("acme/app");
  expect(githubRepository("https://gitlab.com/acme/app.git")).toBeNull();
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
    expect(summary.coordinator).toMatchObject({ total: 12, pullRequests: 2, failed: 2, unattendedRate: 50 });
    // A coordinator that started nothing names the agents that did, so a wrong id is easy to fix.
    const missing = Bun.spawnSync([process.execPath, "scripts/measure-coordinator-outcomes.ts", file, "--coordinator=nobody"]);
    expect(missing.exitCode).toBe(0);
    expect(missing.stdout.toString()).toContain("Agents whose tasks delegated work: coordinator-trial, lead.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
