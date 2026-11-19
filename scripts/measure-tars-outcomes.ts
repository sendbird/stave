/**
 * Run with `bun scripts/measure-tars-outcomes.ts [path/to/stave.sqlite] [--since=2026-11-01] [--until=2026-11-08]`.
 * Reads the saved Tars work and its runs, read only, and prints how each piece
 * of work ended, how long it took and how many hand-offs it needed, so a change
 * to how Tars runs work can be judged by numbers instead of impressions.
 */
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isTarsDecisionClosure, type TarsActionReceipt, type TarsDecisionAnswer, type TarsMessage } from "../src/lib/tars/conversation";
import { parseTarsDecisionId, tarsDecisionTargets } from "../src/lib/tars/decisions";

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
  hasDecisionAnswer: boolean;
  runEvents: ReadonlyArray<{ kind: string; operation: string | null; createdAt: string }>;
}

export interface TarsOutcome {
  title: string;
  /** How the work ended, in the user's terms. */
  result: "pull-request" | "completed" | "accepted-unverified" | "cancelled" | "failed" | "taken-over" | "open";
  /** Minutes from the request to the draft pull request, else to the last update of ended work. */
  minutes: number | null;
  leadTurns: number;
  helperStarts: number;
  waits: number;
  agentId: string | null;
  goal: string | null;
  humanDecided: boolean;
}

export const outcomeFile = (args: readonly string[]) =>
  args.find((arg) => !arg.startsWith("--")) ?? path.join(homedir(), "Library", "Application Support", "stave", "stave.sqlite");
export const outcomeFlag = (args: readonly string[], name: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
/**
 * A range bound as an instant. A bare date is that calendar day's midnight on
 * this machine's clock, so `--until=2026-11-27` in Seoul closes at Seoul
 * midnight; a date and time with an offset (`2026-11-27T00:00+09:00`) is that
 * instant, and one without an offset is local time.
 */
export function rangeBound(value: string | null): string | null {
  if (value === null) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const time = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime() : Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`Not a date: ${value}. Use 2026-11-20 or 2026-11-20T09:00+09:00.`);
  return new Date(time).toISOString();
}
export const outcomeRange = (args: readonly string[]): OutcomeRange =>
  ({ since: rangeBound(outcomeFlag(args, "since")), until: rangeBound(outcomeFlag(args, "until")) });

const minutesBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

export function tarsOutcome(row: TarsOutcomeRow): TarsOutcome {
  const result: TarsOutcome["result"] = row.publishedAt ? "pull-request"
    : row.state === "completed" ? row.detailCode === "acceptedWithoutVerification" ? "accepted-unverified" : "completed"
    : row.state === "cancelled" ? "cancelled" : row.state === "failed" ? "failed" : row.state === "takenOver" ? "taken-over" : "open";
  // Ended work is timed to its run's last event: the row itself is updated again by later reads and controls.
  const end = row.publishedAt ?? (result === "open" ? null : row.runEvents.at(-1)?.createdAt ?? row.updatedAt);
  return {
    title: row.title, result, minutes: end ? minutesBetween(row.createdAt, end) : null,
    leadTurns: row.runEvents.filter((event) => event.kind === "turn-started").length,
    // A helper run reserves part of the lead's budget when it starts.
    helperStarts: row.runEvents.filter((event) => event.kind === "resource-budget" && event.operation === "reserve").length,
    waits: row.runEvents.filter((event) => event.kind === "wait-registered").length,
    agentId: row.agentId, goal: row.goal,
    humanDecided: row.hasDecisionAnswer || row.runEvents.some((event) => event.kind === "sign-off"),
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
  const unattended = ended.filter((outcome) => !outcome.humanDecided &&
    (outcome.result === "pull-request" || outcome.result === "completed")).length;
  return {
    total: outcomes.length, pullRequests: count("pull-request"), completed: count("completed"), acceptedUnverified: count("accepted-unverified"),
    cancelled: count("cancelled"), failed: count("failed"), takenOver: count("taken-over"), open: count("open"),
    humanDecided: outcomes.filter((outcome) => outcome.humanDecided).length,
    unattendedRate: ended.length ? Math.round((unattended / ended.length) * 100) : null,
    medianMinutesToPullRequest: median(outcomes.filter((outcome) => outcome.result === "pull-request").map((outcome) => outcome.minutes!)),
    medianHelperStarts: median(ended.map((outcome) => outcome.helperStarts)),
    medianLeadTurns: median(ended.map((outcome) => outcome.leadTurns)),
  };
}

function readHumanDecisions(db: Database): Set<string> {
  const decided = new Set<string>();
  // A database from before decision answers were recorded still has Run events.
  if (!db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'tars_decision_answers'").get()) return decided;
  const answers = db.query("SELECT body_json FROM tars_decision_answers WHERE status = 'applied'").all() as Array<{ body_json: string }>;
  const receipts = db.query("SELECT body_json FROM tars_action_receipts WHERE message_id = ? AND action_index = ?");
  const messages = db.query("SELECT body_json FROM tars_messages WHERE id = ?");
  const read = <T>(row: unknown): T | undefined => row ? JSON.parse((row as { body_json: string }).body_json) : undefined;
  for (const { body_json } of answers) {
    const answer = JSON.parse(body_json) as TarsDecisionAnswer;
    if (answer.source === "tars" || isTarsDecisionClosure(answer)) continue;
    if ("responsibilityId" in answer.effect) {
      decided.add(answer.effect.responsibilityId);
      continue;
    }
    const decision = parseTarsDecisionId(answer.decisionId);
    if (!decision || decision.kind === "unverifiedCompletion") continue;
    const receipt = read<TarsActionReceipt>(receipts.get(decision.messageId, decision.actionIndex));
    if (answer.effect.kind === "proposal" && receipt?.responsibilityId) {
      decided.add(receipt.responsibilityId);
      continue;
    }
    if (answer.effect.kind !== "reply") continue;
    // A conversational reply belongs to explicitly selected work, the work
    // the question followed up on, or an unambiguous target of its options.
    const message = read<TarsMessage>(messages.get(decision.messageId));
    const targets = receipt ? tarsDecisionTargets(receipt) : [];
    const id = message?.target?.responsibilityId ??
      (message?.origin?.kind === "followUp" ? message.origin.responsibilityId : undefined) ??
      (targets.length === 1 ? targets[0] : undefined);
    if (id) decided.add(id);
  }
  return decided;
}

/** Created from `since` (inclusive) to `until` (exclusive); either end may be open. */
export interface OutcomeRange { since: string | null; until: string | null }

/** Compares instants, not strings, so stored times and bounds may carry any offset. */
export const inRange = (createdAt: string, range: OutcomeRange) => {
  const time = Date.parse(createdAt);
  return (!range.since || time >= Date.parse(range.since)) && (!range.until || time < Date.parse(range.until));
};

/**
 * Opens the database read only. The app keeps it in WAL mode, and a plain copy
 * of the file has no shared-memory file that a read-only connection could
 * create, so a copy is opened as immutable instead: nothing writes to it.
 */
export function openReadOnly(file: string): Database {
  try {
    const db = new Database(file, { readonly: true });
    db.query("SELECT 1 FROM sqlite_schema LIMIT 1").get();
    return db;
  } catch (error) {
    if ((error as { code?: string }).code !== "SQLITE_CANTOPEN") throw error;
    return new Database(`${pathToFileURL(file).href}?immutable=1`, { readonly: true });
  }
}

export function readTarsRows(file: string, range: OutcomeRange): TarsOutcomeRow[] {
  const db = openReadOnly(file);
  try {
    const decided = readHumanDecisions(db);
    const rows = db.prepare("SELECT body_json FROM tars_responsibilities ORDER BY created_at").all() as Array<{ body_json: string }>;
    const events = db.prepare("SELECT kind, json_extract(detail_json, '$.operation') AS operation, created_at AS createdAt FROM agent_run_events WHERE agent_run_id = ? ORDER BY sequence");
    const text = (value: unknown) => typeof value === "string" ? value : null;
    return rows.map((entry) => JSON.parse(entry.body_json) as Record<string, unknown>)
      .filter((body) => inRange(String(body.createdAt), range))
      .map((body) => {
        const runIds = [...(Array.isArray(body.previousRunIds) ? body.previousRunIds : []), body.agentRunId].filter((id): id is string => typeof id === "string");
        const publication = body.publication as { state?: unknown; watch?: { startedAt?: unknown } } | null | undefined;
        return {
          title: text(body.title) ?? "", createdAt: String(body.createdAt), updatedAt: String(body.updatedAt), state: String(body.state),
          detailCode: text(body.detailCode), goal: text(body.completionGoal), agentId: text(body.agentId),
          publishedAt: publication?.state === "opened" ? text(publication.watch?.startedAt) : null,
          hasDecisionAnswer: typeof body.id === "string" && decided.has(body.id),
          runEvents: runIds.flatMap((id) => events.all(id) as TarsOutcomeRow["runEvents"][number][]),
        };
      });
  } finally { db.close(); }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outcomes = readTarsRows(outcomeFile(args), outcomeRange(args)).map(tarsOutcome);
  console.table(outcomes.map((outcome) => ({ ...outcome, title: outcome.title.slice(0, 40) })));
  console.log(JSON.stringify(summarizeTarsOutcomes(outcomes), null, 2));
}
