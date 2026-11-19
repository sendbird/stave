import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { githubRepository, pullRequests, readCoordinatorRows } from "../scripts/measure-coordinator-outcomes";
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
  // A task reused across agents: Lead first, then the coordinator; and coord-1 handed to Lead later.
  assign("a3", "lead", "coord-2", -10);
  assign("a4", "coordinator-trial", "coord-2", 100);
  assign("a5", "lead", "coord-1", 200);
  // A coordinator of its own for the units that write one pull request's link several ways.
  assign("a6", "coordinator-links", "coord-3", -10);
  const workspaces: Array<{ id: string; name: string }> = [];
  let sequence = 0;
  /**
   * One delegation. `workspace` reuses another unit's worktree, and so its
   * branch, with a task of its own; `followsUp` is a later delegation into
   * another unit's child task, which keeps that task's agent run.
   */
  const unit = (id: string, args: { parent?: string; status: string; created?: number; ended?: number; access?: string;
    events?: Array<[string, number, object?]>; reply?: string; controlMode?: string; workspace?: string; followsUp?: string }) => {
    const created = args.created ?? 0;
    const workspace = `worktree:${args.followsUp ?? args.workspace ?? id}`;
    const child = args.followsUp ?? id;
    db.run("INSERT INTO runs VALUES (?, 'delegated-task', 'task', ?, ?, ?, ?, ?, ?, ?, ?)", [`run-${id}`, args.parent ?? "coord-1", repository,
      workspace, `task-${child}`, args.status, at(created), at(args.ended ?? created + 60), args.ended === undefined ? null : at(args.ended)]);
    db.run("INSERT INTO run_receipts VALUES (?, 'step', 1, 'accepted', ?, ?)", [`run-${id}`, at(created), JSON.stringify({
      access: args.access ?? "inherit", ...(args.access === "read-only" ? {} : { agentConfigId: "implementer", agentRunId: `agent-${child}` }) })]);
    if (args.reply !== undefined) {
      db.run("INSERT INTO run_receipts VALUES (?, 'step', 2, 'completed', ?, ?)", [`run-${id}`, at(args.ended ?? created + 60),
        JSON.stringify({ code: "child-turn-completed", responseText: args.reply })]);
    }
    for (const [kind, minutes, detail] of args.events ?? []) {
      db.run("INSERT INTO agent_run_events VALUES (?, ?, ?, ?, ?)", [`agent-${child}`, sequence += 1, kind, JSON.stringify(detail ?? {}), at(minutes)]);
    }
    if (args.followsUp) return;
    db.run("INSERT INTO tasks VALUES (?, ?, ?)", [`${workspace}:task-${id}`, workspace, `Unit ${id}`]);
    if (args.workspace) {
      db.run("UPDATE workspaces SET snapshot_json = json_insert(snapshot_json, '$.tasks[#]', json(?)) WHERE id = ?",
        [JSON.stringify({ id: `task-${id}`, controlMode: args.controlMode ?? "managed" }), workspace]);
      return;
    }
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
  // Delegations of the reused tasks: only those made while the task ran as the coordinator count.
  unit("p", { parent: "coord-2", status: "completed", created: 110, ended: 140 });
  // While coord-2 was Lead's, its delegation opened a PR on its branch, and Lead's own report verified it.
  unit("q", { parent: "coord-2", status: "completed", created: 50, ended: 80, events: [["report", 55, complete(`Opened draft PR ${pr(20)}`)]] });
  unit("r", { status: "completed", created: 210, ended: 240 });
  // A reused branch with an older report: the coordinator's later unit works in q's worktree and
  // names the PR q opened. Lead's report, written before this unit existed, verifies nothing for it.
  unit("s", { parent: "coord-2", status: "completed", created: 120, ended: 150, workspace: "q",
    events: [["report", 130, complete(`Continued on draft PR ${pr(20)}`)]] });
  // Work the person took over, with a PR of its own that the coordinator verified: taken over, not a PR reached unattended.
  unit("t", { status: "completed", ended: 45, controlMode: "interactive", events: [["turn-started", 1], ["report", 20, complete(`Draft ${pr(23)}`)]] });
  // Taken over and handed back before it reached its PR: a PR, but the person stepped in.
  unit("x", { status: "completed", ended: 40, events: [["turn-started", 1], ["paused", 15, { reason: "taken-over" }], ["turn-started", 25],
    ["report", 30, complete(`Draft ${pr(24)}`)]] });
  // Two delegations in one child task with one PR: the first opened it, the follow-up pushed to it.
  unit("u", { status: "completed", ended: 40, events: [["turn-started", 1], ["report", 30, complete(`Opened draft PR ${pr(25)}`)]] });
  unit("u2", { status: "completed", created: 45, ended: 70, followsUp: "u", events: [["turn-started", 46], ["report", 60, complete(`Pushed the fix to ${pr(25)}`)]] });
  // A PR only a later assignee of the coordinator's task verified, after the task stopped being the coordinator's.
  unit("y", { status: "completed", created: 100, ended: 130, events: [["report", 110, complete(`Draft ${pr(26)}`)]] });
  // One PR whose link a follow-up writes with other letter case: v opened it, and the coordinator verified both spellings.
  const links = { parent: "coord-3", status: "completed" };
  unit("v", { ...links, ended: 40, events: [["turn-started", 1], ["report", 30, complete(`Opened draft PR ${pr(30)}`)]] });
  unit("v2", { ...links, created: 45, ended: 70, followsUp: "v", events: [["report", 60, complete(`Pushed the fix to ${pr(30, "Acme/App")}`)]] });
  // The same PR again with a trailing slash and a /files suffix.
  unit("v3", { ...links, created: 75, ended: 90, followsUp: "v", events: [["report", 80, complete(`See ${pr(30)}/files and ${pr(30)}/`)]] });
  // http first, https in the follow-up: w gave the link first.
  unit("w", { ...links, ended: 40, events: [["turn-started", 1], ["report", 30, complete(`Opened draft PR ${pr(31).replace("https:", "http:")}`)]] });
  unit("w2", { ...links, created: 45, ended: 70, followsUp: "w", events: [["report", 60, complete(`Pushed the fix to ${pr(31)}`)]] });
  // The coordinator's own completed report lists the PRs it verified, with the head branch it checked.
  db.run("INSERT INTO agent_runs VALUES ('coord-run', 'coord-1')");
  const verified = (url: string, head: string) => ({ kind: "link", ref: url, label: `Verified draft PR, head ${head}` });
  const stage = (run: string, attempt: number, report: object) => db.run("INSERT INTO agent_run_stages VALUES (?, 'work', ?, ?)", [run, attempt, JSON.stringify(report)]);
  stage("coord-run", 1, { outcome: "complete", summary: "Units verified.", reportedAt: at(95),
    evidence: [verified(pr(1), "subagent-a"), verified(pr(4), "subagent-d"), verified(pr(5), "subagent-e"), verified(pr(7, "other/lib"), "subagent-l"),
      verified(pr(13), "subagent-m"), verified(pr(15), "subagent-a"), { kind: "check", label: "head subagent-n", command: "gh pr view" },
      verified(pr(23), "subagent-t"), verified(pr(24), "subagent-x"), verified(pr(25), "subagent-u")] });
  // A blocked report of the coordinator verifies nothing.
  stage("coord-run", 2, { outcome: "blocked", missing: "x", reportedAt: at(96), evidence: [verified(pr(14), "subagent-n")] });
  // Reports of the same tasks' other assignees: Lead on coord-2 before the coordinator, Lead on coord-1 after it.
  db.run("INSERT INTO agent_runs VALUES ('lead-run-2', 'coord-2'), ('lead-run-1', 'coord-1'), ('links-run', 'coord-3')");
  stage("links-run", 1, { outcome: "complete", summary: "Units verified.", reportedAt: at(95), evidence: [verified(pr(30), "subagent-v"),
    verified(pr(30, "Acme/App"), "subagent-v"), verified(`${pr(30)}/files`, "subagent-v"), verified(`${pr(31)}/`, "subagent-w")] });
  stage("lead-run-2", 1, { outcome: "complete", summary: "Verified.", reportedAt: at(60), evidence: [verified(pr(20), "subagent-q")] });
  stage("lead-run-1", 1, { outcome: "complete", summary: "Verified.", reportedAt: at(210), evidence: [verified(pr(26), "subagent-y")] });
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
      ["Unit t", "taken-over", 20, false],
      ["Unit x", "pull-request", 30, true],
      // The PR counts once, for the delegation that opened it; each keeps only its own turns.
      ["Unit u", "pull-request", 30, false],
      ["Unit u", "completed", 15, false],
      ["Unit y", "completed", 10, false],
      ["Unit p", "completed", 30, false],
      ["Unit s", "completed", 10, false],
    ]);
    expect(outcomes.filter((outcome) => outcome.title === "Unit u").map((outcome) => outcome.leadTurns)).toEqual([1, 1]);
    expect(summarizeTarsOutcomes(outcomes)).toMatchObject({ total: 19, pullRequests: 4, completed: 8, cancelled: 1, failed: 2, takenOver: 2,
      open: 2, humanDecided: 2, unattendedRate: 59, medianMinutesToPullRequest: 35 });
    // The end of the range is exclusive.
    expect(readCoordinatorRows(join(dir, "stave.sqlite"), { coordinator: "coordinator-trial", since: at(-60), until: at(0) })).toEqual([]);
    // Lead's delegations from the reused tasks are Lead's.
    expect(readCoordinatorRows(join(dir, "stave.sqlite"), { coordinator: "lead", since: at(-60), until: null }).map((row) => row.title))
      .toEqual(["Unit h", "Unit q", "Unit r"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("counts a pull request once, for the delegation that first gave its link, however the link is written", () => {
  const dir = mkdtempSync(join(tmpdir(), "stave-coordinator-"));
  try {
    const outcomes = readCoordinatorRows(fixture(dir), { coordinator: "coordinator-links", since: at(-60), until: null }).map(tarsOutcome);
    expect(outcomes.map((outcome) => [outcome.title, outcome.result, outcome.minutes])).toEqual([
      ["Unit v", "pull-request", 30],
      ["Unit w", "pull-request", 30],
      // The follow-ups, in the order they were delegated: none of them opened a pull request.
      ["Unit v", "completed", 15],
      ["Unit w", "completed", 15],
      ["Unit v", "completed", 5],
    ]);
    expect(summarizeTarsOutcomes(outcomes)).toMatchObject({ total: 5, pullRequests: 2, completed: 3 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reads a GitHub repository from remote and pull request URLs", () => {
  expect(githubRepository("git@github.com:Acme/App.git\n")).toBe("acme/app");
  expect(githubRepository("https://github.com/acme/app")).toBe("acme/app");
  expect(githubRepository(pr(3))).toBe("acme/app");
  expect(githubRepository("https://gitlab.com/acme/app.git")).toBeNull();
  // A pull request has one identity, and its repository reads from it.
  expect(pullRequests(`${pr(3, "Acme/App")}/files, HTTP://GitHub.com/acme/app/pull/3/ and ${pr(4)}. https://gitlab.com/acme/app/pull/5`))
    .toEqual(["github.com/acme/app/pull/3", "github.com/acme/app/pull/3", "github.com/acme/app/pull/4"]);
  expect(githubRepository("github.com/acme/app/pull/3")).toBe("acme/app");
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
    expect(summary.coordinator).toMatchObject({ total: 19, pullRequests: 4, failed: 2, takenOver: 2, unattendedRate: 59 });
    // A coordinator that started nothing names the agents that did, so a wrong id is easy to fix.
    const missing = Bun.spawnSync([process.execPath, "scripts/measure-coordinator-outcomes.ts", file, "--coordinator=nobody"]);
    expect(missing.exitCode).toBe(0);
    expect(missing.stdout.toString()).toContain("Agents whose tasks delegated work: coordinator-links, coordinator-trial, lead.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
