/**
 * Run with `bun scripts/measure-coordinator-outcomes.ts [path/to/stave.sqlite]
 * [--coordinator=coordinator-trial] [--since=2026-11-20] [--until=2026-11-27]`.
 *
 * The coordinator trial (docs/developer/tars-coordinator-trial.md) runs an
 * ordinary task as a saved Agent that delegates work with Local MCP tools.
 * This reads, read only, the work that agent's tasks delegated and prints it
 * with the same outcome definitions as `measure-tars-outcomes.ts`, then both
 * summaries side by side for the same range.
 */
import type { Database } from "bun:sqlite";
import {
  inRange, openReadOnly, outcomeFile, outcomeFlag, outcomeRange, readTarsRows, summarizeTarsOutcomes, tarsOutcome,
  type OutcomeRange, type TarsOutcomeRow,
} from "./measure-tars-outcomes";

const PULL_REQUEST_URL = /https:\/\/github\.com\/([^/\s"\\]+)\/([^/\s"\\]+)\/pull\/(\d+)/g;

type LedgerRun = { id: string; originId: string; workspaceId: string; taskId: string | null; projectPath: string; status: string;
  createdAt: string; updatedAt: string; completedAt: string | null };
type Receipt = { type: string; createdAt: string; detail: Record<string, unknown> };
type Assignment = { agent: string; createdAt: string; endedAt: string | null };

/** `owner/name` of a GitHub repository, lower-cased, from a remote or pull request URL. */
export function githubRepository(url: string): string | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/pull\/\d+)?\/?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

/** The pull request links in a text, as `https://github.com/owner/name/pull/N`. */
const pullRequestLinks = (text: string) => [...text.matchAll(PULL_REQUEST_URL)].map((match) => match[0]);

/** The repository the work ran in, from its `origin` remote; null when it cannot be read. */
function originRepository(projectPath: string, cache: Map<string, string | null>): string | null {
  if (!cache.has(projectPath)) {
    const result = Bun.spawnSync(["git", "-C", projectPath, "remote", "get-url", "origin"], { stderr: "ignore" });
    cache.set(projectPath, result.exitCode === 0 ? githubRepository(result.stdout.toString()) : null);
  }
  return cache.get(projectPath)!;
}

/** Every task's agent assignments, oldest first. */
function readAssignments(db: Database): Map<string, Assignment[]> {
  const rows = db.query(`SELECT task_id AS taskId, agent_config_id AS agent, created_at AS createdAt,
    json_extract(body_json, '$.endedAt') AS endedAt FROM agent_assignments WHERE task_id IS NOT NULL ORDER BY created_at, rowid`)
    .all() as Array<Assignment & { taskId: string }>;
  const byTask = new Map<string, Assignment[]>();
  for (const { taskId, ...row } of rows) byTask.set(taskId, [...byTask.get(taskId) ?? [], row]);
  return byTask;
}

/**
 * The agent a task ran as at a moment, and until when: its newest assignment
 * by then, unless that one had ended. It stops when it ends or the next begins.
 */
function assignmentAt(assignments: Map<string, Assignment[]>, taskId: string, at: string): { agent: string; until: number } | null {
  const time = Date.parse(at);
  const rows = assignments.get(taskId) ?? [];
  const current = rows.filter((row) => Date.parse(row.createdAt) <= time).at(-1);
  if (!current || (current.endedAt && Date.parse(current.endedAt) <= time)) return null;
  const next = rows[rows.indexOf(current) + 1];
  return { agent: current.agent, until: Math.min(current.endedAt ? Date.parse(current.endedAt) : Infinity, next ? Date.parse(next.createdAt) : Infinity) };
}

const readDelegations = (db: Database) => db.query(`SELECT id, origin_id AS originId, workspace_id AS workspaceId, task_id AS taskId,
  project_path AS projectPath, status, created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
  FROM runs WHERE kind = 'delegated-task' ORDER BY created_at`).all() as LedgerRun[];

/** Agents whose tasks delegated work in the range, to name when the given coordinator started none. */
function delegatingAgents(db: Database, range: OutcomeRange): string[] {
  const assignments = readAssignments(db);
  return [...new Set(readDelegations(db).filter((run) => inRange(run.createdAt, range))
    .map((run) => assignmentAt(assignments, run.originId, run.createdAt)?.agent).filter((agent): agent is string => agent !== undefined))].sort();
}

/** Whether the person took the child task over: it left the coordinator's control. */
function takenOverTasks(db: Database, workspaceIds: readonly string[]): Set<string> {
  const taken = new Set<string>();
  const read = db.query("SELECT snapshot_json AS snapshot FROM workspaces WHERE id = ?");
  for (const id of new Set(workspaceIds)) {
    const row = read.get(id) as { snapshot: string } | null;
    const tasks = row ? (JSON.parse(row.snapshot) as { tasks?: Array<{ id?: unknown; controlMode?: unknown }> }).tasks ?? [] : [];
    for (const task of tasks) if (task.controlMode === "interactive" && typeof task.id === "string") taken.add(task.id);
  }
  return taken;
}

/** Each workspace's branch: a delegated worktree is named after its branch in the project registry. */
function workspaceBranches(db: Database): Map<string, string> {
  const branches = new Map<string, string>();
  if (!db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'app_state'").get()) return branches;
  const row = db.query("SELECT value_json AS value FROM app_state WHERE key = 'project_registry'").get() as { value: string } | null;
  const projects = row ? JSON.parse(row.value) as Array<{ workspaces?: Array<{ id?: unknown; name?: unknown }> }> : [];
  for (const workspace of projects.flatMap((project) => project.workspaces ?? []))
    if (typeof workspace.id === "string" && typeof workspace.name === "string") branches.set(workspace.id, workspace.name);
  return branches;
}

/**
 * The draft pull requests the reports of a task's runs list as verified, each
 * with the head branch checked and when it was reported: a `link` evidence
 * item of a completed stage report whose `ref` is the pull request and whose
 * label names `head <branch>`. A report without a time verifies nothing.
 */
function verifiedPullRequests(db: Database, taskId: string): Array<{ url: string; head: string; at: number }> {
  const reports = db.query(`SELECT s.report_json AS report FROM agent_run_stages s JOIN agent_runs r ON r.id = s.agent_run_id
    WHERE r.lead_task_id = ? AND s.report_json IS NOT NULL`).all(taskId) as Array<{ report: string }>;
  return reports.flatMap(({ report }) => {
    const parsed = JSON.parse(report) as { outcome?: unknown; reportedAt?: unknown; evidence?: Array<{ kind?: unknown; ref?: unknown; label?: unknown }> };
    const at = typeof parsed.reportedAt === "string" ? Date.parse(parsed.reportedAt) : Number.NaN;
    if (parsed.outcome !== "complete" || Number.isNaN(at)) return [];
    return (parsed.evidence ?? []).flatMap((item) => {
      const url = typeof item.ref === "string" ? pullRequestLinks(item.ref)[0] : undefined;
      const head = typeof item.label === "string" ? /\bhead\s+`?([^\s`,;]+)/.exec(item.label)?.[1] : undefined;
      return item.kind === "link" && url && head ? [{ url, head, at }] : [];
    });
  });
}

type UnitEvent = TarsOutcomeRow["runEvents"][number] & { detail: string };

/**
 * One row per unit of work the coordinator delegated: a writing delegation on
 * the run ledger made while its origin task ran as the coordinator. Read-only
 * consults (the reviews it asks for) are not units. The result maps onto
 * Tars's states.
 *
 * Everything counted for a unit is its own. A follow-up delegation into the
 * same child task keeps that task's agent run, so each of the run's events
 * belongs to the delegation that was the task's newest when it happened.
 *
 * A unit reached a pull request only when that pull request is the unit's own
 * and the coordinator checked it afterwards: the unit gave its link in a
 * completed stage report of its own or in the answer it returned, no earlier
 * delegation gave that link first, a completed report the coordinator's task
 * wrote after that, while it still ran under the assignment that delegated
 * the unit, lists it as verified with the unit's branch as head, and it is in
 * the repository the work ran in. A failed unit, one whose latest report is
 * blocked, or one the person took over never reached one, whatever links its
 * reports quote.
 */
export function readCoordinatorRows(file: string, args: OutcomeRange & { coordinator: string }): TarsOutcomeRow[] {
  const db = openReadOnly(file);
  try {
    const assignments = readAssignments(db);
    const delegations = readDelegations(db);
    const receiptsOf = db.query("SELECT receipt_type AS type, created_at AS createdAt, detail_json AS detail FROM run_receipts WHERE run_id = ? ORDER BY sequence");
    const eventsOf = db.query(`SELECT kind, json_extract(detail_json, '$.operation') AS operation, json_extract(detail_json, '$.reason') AS reason,
      detail_json AS detail, created_at AS createdAt FROM agent_run_events WHERE agent_run_id = ? ORDER BY sequence`);
    const titleOf = db.query("SELECT title FROM tasks WHERE id = ?");
    const byChildTask = new Map<string, LedgerRun[]>();
    for (const run of delegations) if (run.taskId) byChildTask.set(`${run.workspaceId}\n${run.taskId}`, [...byChildTask.get(`${run.workspaceId}\n${run.taskId}`) ?? [], run]);
    const readUnit = (run: LedgerRun) => {
      const receipts = (receiptsOf.all(run.id) as Array<{ type: string; createdAt: string; detail: string | null }>)
        .map((receipt): Receipt => ({ ...receipt, detail: receipt.detail ? JSON.parse(receipt.detail) : {} }));
      const accepted = receipts.filter((receipt) => receipt.type === "accepted");
      const writing = !(accepted.length && accepted.every((receipt) => receipt.detail.access === "read-only"));
      // A retry is a new attempt, and a new agent run, of the same unit.
      const agentRunIds = [...new Set(accepted.map((receipt) => receipt.detail.agentRunId).filter((id): id is string => typeof id === "string"))];
      const sameTask = byChildTask.get(`${run.workspaceId}\n${run.taskId}`) ?? [run];
      const from = sameTask[0] === run ? -Infinity : Date.parse(run.createdAt);
      const next = sameTask[sameTask.indexOf(run) + 1];
      const until = next ? Date.parse(next.createdAt) : Infinity;
      const events = agentRunIds.flatMap((id) => eventsOf.all(id) as UnitEvent[])
        .filter((event) => Date.parse(event.createdAt) >= from && Date.parse(event.createdAt) < until);
      const reports = events.filter((event) => event.kind === "report")
        .map((event) => ({ createdAt: event.createdAt, ...(JSON.parse(event.detail) as { outcome?: unknown; summary?: unknown }) }));
      // When the unit itself first gave each pull request's link.
      const claims = new Map<string, string>();
      for (const { url, createdAt } of writing ? [
        ...reports.filter((report) => report.outcome === "complete" && typeof report.summary === "string")
          .flatMap((report) => pullRequestLinks(report.summary as string).map((url) => ({ url, createdAt: report.createdAt }))),
        ...receipts.filter((receipt) => receipt.type === "completed")
          .flatMap((receipt) => pullRequestLinks(JSON.stringify(receipt.detail)).map((url) => ({ url, createdAt: receipt.createdAt }))),
      ] : []) if (!claims.has(url) || Date.parse(createdAt) < Date.parse(claims.get(url)!)) claims.set(url, createdAt);
      return { accepted, writing, events, blocked: reports.at(-1)?.outcome === "blocked", claims };
    };
    const units = new Map(delegations.map((run) => [run, readUnit(run)]));
    // A pull request is one delegation's: the first, of any task, to give its link.
    const owner = new Map<string, { run: LedgerRun; at: number }>();
    for (const [run, unit] of units) for (const [url, createdAt] of unit.claims)
      if (!owner.has(url) || Date.parse(createdAt) < owner.get(url)!.at) owner.set(url, { run, at: Date.parse(createdAt) });
    const counted = delegations.flatMap((run) => {
      const assignment = inRange(run.createdAt, args) ? assignmentAt(assignments, run.originId, run.createdAt) : null;
      const unit = units.get(run)!;
      return assignment?.agent === args.coordinator && unit.writing ? [{ run, unit, assignment }] : [];
    });
    const taken = takenOverTasks(db, counted.map(({ run }) => run.workspaceId));
    const branches = workspaceBranches(db);
    const verifiedByTask = new Map<string, ReturnType<typeof verifiedPullRequests>>();
    const origins = new Map<string, string | null>();
    return counted.map(({ run, unit, assignment }) => {
      const state = run.taskId && taken.has(run.taskId) ? "takenOver"
        : run.status === "completed" || run.status === "cancelled" ? run.status
        : run.status === "failed" || run.status === "interrupted" ? "failed" : "running";
      let publishedAt: string | null = null;
      const branch = branches.get(run.workspaceId);
      if (state !== "failed" && state !== "takenOver" && !unit.blocked && unit.claims.size && branch) {
        if (!verifiedByTask.has(run.originId)) verifiedByTask.set(run.originId, verifiedPullRequests(db, run.originId));
        const verified = verifiedByTask.get(run.originId)!;
        const repository = originRepository(run.projectPath, origins);
        publishedAt = [...unit.claims].filter(([url, createdAt]) => owner.get(url)!.run === run && repository !== null && githubRepository(url) === repository &&
          verified.some((item) => item.url === url && item.head === branch && item.at >= Date.parse(createdAt) && item.at < assignment.until))
          .map(([, createdAt]) => createdAt).sort()[0] ?? null;
      }
      const title = run.taskId ? (titleOf.get(`${run.workspaceId}:${run.taskId}`) as { title: string } | null)?.title : null;
      const agentId = unit.accepted.map((receipt) => receipt.detail.agentConfigId).find((id): id is string => typeof id === "string") ?? null;
      return {
        title: title ?? run.taskId ?? run.id, createdAt: run.createdAt, updatedAt: run.completedAt ?? run.updatedAt, state,
        detailCode: null, goal: null, agentId, publishedAt, hasDecisionAnswer: false,
        runEvents: unit.events.map(({ kind, operation, reason, createdAt }) => ({ kind, operation, reason, createdAt })),
      };
    });
  } finally { db.close(); }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const file = outcomeFile(args);
  const range = outcomeRange(args);
  const coordinator = outcomeFlag(args, "coordinator") ?? "coordinator-trial";
  const coordinatorOutcomes = readCoordinatorRows(file, { ...range, coordinator }).map(tarsOutcome);
  if (!coordinatorOutcomes.length) {
    const db = openReadOnly(file);
    try {
      console.log(`No work delegated by agent "${coordinator}" in this range. Agents whose tasks delegated work: ${delegatingAgents(db, range).join(", ") || "none"}.`);
    } finally { db.close(); }
  }
  const tarsOutcomes = readTarsRows(file, range).map(tarsOutcome);
  for (const [name, outcomes] of [["Tars", tarsOutcomes], ["Coordinator", coordinatorOutcomes]] as const) {
    console.log(name);
    if (outcomes.length) console.table(outcomes.map((outcome) => ({ ...outcome, title: outcome.title.slice(0, 40) })));
  }
  const summary = { tars: summarizeTarsOutcomes(tarsOutcomes), coordinator: summarizeTarsOutcomes(coordinatorOutcomes) };
  console.table(summary);
  console.log(JSON.stringify(summary, null, 2));
}
