/**
 * Run with `bun scripts/measure-tars-outcomes.ts [path/to/stave.sqlite] [--since=2026-11-01]`.
 * Reads the saved Tars work and its runs, read only, and prints how each piece
 * of work ended, how long it took and how many hand-offs it needed, so a change
 * to how Tars runs work can be judged by numbers instead of impressions.
 */
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import path from "node:path";

export interface TarsOutcomeRow {
  title: string;
  createdAt: string;
  updatedAt: string;
  state: string;
  detailCode: string | null;
  goal: string | null;
  agentId: string | null;
  /** When Stave began watching the draft pull request's checks, which it does as soon as the pull request is open. */
  publishedAt: string | null;
  runEvents: ReadonlyArray<{ kind: string; operation: string | null; createdAt: string }>;
}

export interface TarsOutcome {
  title: string;
  /** How the work ended, in the user's terms. */
  result: "pull-request" | "completed" | "accepted-unverified" | "cancelled" | "taken-over" | "open";
  /** Minutes from the request to the draft pull request, else to the last update of ended work. */
  minutes: number | null;
  leadTurns: number;
  helperStarts: number;
  waits: number;
  agentId: string | null;
  goal: string | null;
}

const minutesBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

export function tarsOutcome(row: TarsOutcomeRow): TarsOutcome {
  const result: TarsOutcome["result"] = row.publishedAt ? "pull-request"
    : row.state === "completed" ? row.detailCode === "acceptedWithoutVerification" ? "accepted-unverified" : "completed"
    : row.state === "cancelled" ? "cancelled" : row.state === "takenOver" ? "taken-over" : "open";
  // Ended work is timed to its run's last event: the row itself is updated again by later reads and controls.
  const end = row.publishedAt ?? (result === "open" ? null : row.runEvents.at(-1)?.createdAt ?? row.updatedAt);
  return {
    title: row.title, result, minutes: end ? minutesBetween(row.createdAt, end) : null,
    leadTurns: row.runEvents.filter((event) => event.kind === "turn-started").length,
    // A helper run reserves part of the lead's budget when it starts.
    helperStarts: row.runEvents.filter((event) => event.kind === "resource-budget" && event.operation === "reserve").length,
    waits: row.runEvents.filter((event) => event.kind === "wait-registered").length,
    agentId: row.agentId, goal: row.goal,
  };
}

const median = (values: readonly number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};

export function summarizeTarsOutcomes(outcomes: readonly TarsOutcome[]) {
  const count = (result: TarsOutcome["result"]) => outcomes.filter((outcome) => outcome.result === result).length;
  const ended = outcomes.filter((outcome) => outcome.result !== "open");
  // Work that reached its result without the user accepting, cancelling or taking it over.
  const unattended = count("pull-request") + count("completed");
  return {
    total: outcomes.length, pullRequests: count("pull-request"), completed: count("completed"), acceptedUnverified: count("accepted-unverified"),
    cancelled: count("cancelled"), takenOver: count("taken-over"), open: count("open"),
    unattendedRate: ended.length ? Math.round((unattended / ended.length) * 100) : null,
    medianMinutesToPullRequest: median(outcomes.filter((outcome) => outcome.result === "pull-request").map((outcome) => outcome.minutes!)),
    medianHelperStarts: median(ended.map((outcome) => outcome.helperStarts)),
    medianLeadTurns: median(ended.map((outcome) => outcome.leadTurns)),
  };
}

function readRows(file: string, since: string | null): TarsOutcomeRow[] {
  const db = new Database(file, { readonly: true });
  try {
    const rows = db.prepare("SELECT body_json FROM tars_responsibilities ORDER BY created_at").all() as Array<{ body_json: string }>;
    const events = db.prepare("SELECT kind, json_extract(detail_json, '$.operation') AS operation, created_at AS createdAt FROM agent_run_events WHERE agent_run_id = ? ORDER BY sequence");
    const text = (value: unknown) => typeof value === "string" ? value : null;
    return rows.map((entry) => JSON.parse(entry.body_json) as Record<string, unknown>)
      .filter((body) => !since || String(body.createdAt) >= since)
      .map((body) => {
        const runIds = [...(Array.isArray(body.previousRunIds) ? body.previousRunIds : []), body.agentRunId].filter((id): id is string => typeof id === "string");
        const publication = body.publication as { state?: unknown; watch?: { startedAt?: unknown } } | null | undefined;
        return {
          title: text(body.title) ?? "", createdAt: String(body.createdAt), updatedAt: String(body.updatedAt), state: String(body.state),
          detailCode: text(body.detailCode), goal: text(body.completionGoal), agentId: text(body.agentId),
          publishedAt: publication?.state === "opened" ? text(publication.watch?.startedAt) : null,
          runEvents: runIds.flatMap((id) => events.all(id) as TarsOutcomeRow["runEvents"][number][]),
        };
      });
  } finally { db.close(); }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const since = args.find((arg) => arg.startsWith("--since="))?.slice("--since=".length) ?? null;
  const file = args.find((arg) => !arg.startsWith("--")) ?? path.join(homedir(), "Library", "Application Support", "stave", "stave.sqlite");
  const outcomes = readRows(file, since).map(tarsOutcome);
  console.table(outcomes.map((outcome) => ({ ...outcome, title: outcome.title.slice(0, 40) })));
  console.log(JSON.stringify(summarizeTarsOutcomes(outcomes), null, 2));
}
