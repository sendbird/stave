import type Database from "better-sqlite3";
import type { BridgeEvent } from "../providers/types";
import {
  appendTurnDigestEntry,
  createTurnDigest,
  enforceTurnDigestLimits,
  isTurnDigestEndingEvent,
  observeTurnDigestAccount,
  parseTurnDigest,
  serializeTurnDigest,
  settleTurnDigestFailure,
  turnDigestAccountForEvent,
  turnDigestChecksEntry,
  turnDigestEntryForEvent,
  turnDigestStallEntry,
  type TurnDigest,
  type TurnDigestCheckSummary,
} from "../../src/lib/providers/turn-digest";
import {
  TURN_HISTORY_PAGE_LIMIT,
  TURN_RECORD_MESSAGE_CHAR_BUDGET,
  TURN_RECORD_MESSAGE_LIMIT,
  type ListTaskTurnHistoryArgs,
  type ReadTaskTurnRecordArgs,
  type TurnHistoryEntry,
  type TurnHistoryPage,
  type TurnRecord,
  type TurnRecordMessage,
} from "../../src/lib/providers/turn-history";
import { parseTurnReceipt, type TurnTerminalReceipt } from "./turn-terminal-receipt";

/**
 * Per-turn digests in `turns.digest_json`; see `src/lib/providers/turn-digest.ts`.
 *
 * The column sits on the turn row, so every path that deletes a task's turns
 * (deleting the task, closing its workspace, the orphan sweep) deletes the
 * digests with them.
 */

type Db = Database.Database;

interface TurnDigestRow {
  provider_id: string;
  created_at: string;
  digest_json: string | null;
}

/** Expand-only: older databases gain the column; their turns keep `NULL` ("No record"). */
export function ensureTurnDigestColumn(db: Db) {
  const columns = db.prepare("PRAGMA table_info(turns)").all() as Array<{ name: string }>;
  if (columns.length === 0 || columns.some((column) => column.name === "digest_json")) {
    return;
  }
  db.exec("ALTER TABLE turns ADD COLUMN digest_json TEXT");
}

function readTurnDigestRow(db: Db, turnId: string) {
  return db
    .prepare("SELECT provider_id, created_at, digest_json FROM turns WHERE id = ?")
    .get(turnId) as TurnDigestRow | undefined;
}

/** Every write goes through the limits, whatever grew the digest (an entry, a merge, the account). */
function writeTurnDigest(db: Db, turnId: string, digest: TurnDigest) {
  db.prepare("UPDATE turns SET digest_json = ? WHERE id = ?").run(
    serializeTurnDigest(enforceTurnDigestLimits(digest)),
    turnId,
  );
}

/**
 * Give a new turn an empty digest, inside the transaction that inserts its
 * row. When the task's previous turn ran on the same provider with another
 * account, the switch is the digest's first entry.
 */
export function startTurnDigest(
  db: Db,
  args: {
    turnId: string;
    workspaceId: string;
    taskId: string;
    providerId: string;
    accountProfileId?: string;
    createdAt: string;
  },
) {
  let digest = createTurnDigest(args.accountProfileId?.trim() || null);
  const account = digest.accountProfileId;
  if (account) {
    const previous = db
      .prepare(
        `SELECT provider_id, created_at, digest_json FROM turns
        WHERE workspace_id = ? AND task_id = ? AND id <> ? AND created_at <= ?
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(args.workspaceId, args.taskId, args.turnId, args.createdAt) as
      | TurnDigestRow
      | undefined;
    const previousAccount =
      previous && previous.provider_id === args.providerId
        ? parseTurnDigest(previous.digest_json)?.accountProfileId
        : null;
    if (previousAccount && previousAccount !== account) {
      digest = appendTurnDigestEntry(digest, {
        kind: "account",
        at: args.createdAt,
        providerId: args.providerId,
        fromAccountId: previousAccount,
        toAccountId: account,
        since: "previous-turn",
      });
    }
  }
  writeTurnDigest(db, args.turnId, digest);
}

/**
 * Fold one accepted event into its turn's digest, inside the event-write
 * transaction (before pruning can remove the event before it). Most events
 * add nothing and cost one indexed read; only a fact rewrites the digest.
 */
export function observeTurnDigestEvent(
  db: Db,
  args: { turnId: string; sequence: number; event: BridgeEvent; createdAt: string },
) {
  const previous = db
    .prepare(
      `SELECT event_type, created_at FROM turn_events
      WHERE turn_id = ? AND sequence < ? ORDER BY sequence DESC LIMIT 1`,
    )
    .get(args.turnId, args.sequence) as
    | { event_type: string; created_at: string }
    | undefined;
  let row: TurnDigestRow | undefined;
  let previousAt = previous?.created_at ?? null;
  if (!previous) {
    row = readTurnDigestRow(db, args.turnId);
    previousAt = row?.created_at ?? null;
  }
  const stall = turnDigestStallEntry({
    previousAt,
    previousEventType: previous?.event_type ?? null,
    at: args.createdAt,
    endsTurn: isTurnDigestEndingEvent(args.event),
  });
  const entry = turnDigestEntryForEvent(args.event, args.createdAt);
  const account = turnDigestAccountForEvent(args.event);
  if (!stall && !entry && !account) {
    return;
  }
  row ??= readTurnDigestRow(db, args.turnId);
  if (!row) {
    return;
  }
  const before = parseTurnDigest(row.digest_json) ?? createTurnDigest(null);
  let digest = before;
  if (stall) digest = appendTurnDigestEntry(digest, stall);
  if (account) {
    digest = observeTurnDigestAccount({
      digest,
      providerId: row.provider_id,
      accountProfileId: account,
      at: args.createdAt,
    });
  }
  if (entry) digest = appendTurnDigestEntry(digest, entry);
  if (digest !== before || row.digest_json == null) {
    writeTurnDigest(db, args.turnId, digest);
  }
}

/**
 * When the turn closes on a failure, the retry it ended on becomes the error,
 * matching the receipt's outcome. Called inside the close transaction.
 */
export function settleTurnDigestOnClose(db: Db, turnId: string, receipt: TurnTerminalReceipt) {
  const row = readTurnDigestRow(db, turnId);
  const digest = parseTurnDigest(row?.digest_json);
  if (!digest) return;
  const settled = settleTurnDigestFailure(digest, receipt.lastError, receipt.outcome === "failed");
  if (settled !== digest) writeTurnDigest(db, turnId, settled);
}

/** Record the `turn.completed` checks Stave ran after a turn. */
export function recordTurnDigestChecks(
  db: Db,
  args: { turnId: string; summary: TurnDigestCheckSummary; at?: string },
) {
  const entry = turnDigestChecksEntry(args.summary, args.at ?? new Date().toISOString());
  if (!entry) {
    return false;
  }
  let recorded = false;
  db.transaction(() => {
    const row = readTurnDigestRow(db, args.turnId);
    if (!row) {
      return;
    }
    const digest = parseTurnDigest(row.digest_json) ?? createTurnDigest(null);
    writeTurnDigest(db, args.turnId, appendTurnDigestEntry(digest, entry));
    recorded = true;
  })();
  return recorded;
}

interface TurnHistoryRow {
  id: string;
  provider_id: string;
  created_at: string;
  completed_at: string | null;
  receipt_json: string | null;
  digest_json: string | null;
}

const ERROR_PREVIEW_LIMIT = 300;
const PROMPT_LIMIT = 600;
/** Candidate rows read per page while a turn's messages are gathered. */
const RECORD_SCAN_PAGE = 32;

function boundText(value: string | null | undefined, limit: number) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

function toHistoryEntry(row: TurnHistoryRow): TurnHistoryEntry {
  const receipt = parseTurnReceipt(row.receipt_json);
  const digest = parseTurnDigest(row.digest_json);
  const latestChecks = digest
    ? [...digest.entries].reverse().find((entry) => entry.kind === "checks")
    : undefined;
  return {
    id: row.id,
    providerId: (row.provider_id === "stave" ? "claude-code" : row.provider_id) as TurnHistoryEntry["providerId"],
    createdAt: row.created_at,
    completedAt: row.completed_at,
    outcome: receipt?.outcome ?? null,
    error: boundText(receipt?.error, ERROR_PREVIEW_LIMIT),
    digest: digest
      ? {
          entryCount: digest.entries.length,
          hasError: digest.entries.some((entry) => entry.kind === "error"),
          checks: latestChecks?.kind === "checks" ? latestChecks.status : null,
        }
      : null,
  };
}

/** Clip every string inside a parsed JSON value, keeping it valid JSON. */
function clipStrings(value: unknown, limit: number, depth: number): unknown {
  if (typeof value === "string") {
    return value.length <= limit ? value : `${value.slice(0, limit)}…`;
  }
  if (depth >= 4 || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => clipStrings(item, limit, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, clipStrings(item, limit, depth + 1)]),
  );
}

/**
 * Shorten a tool input or output. JSON stays parseable, so the rebuilt row
 * can still name the file or command; other text is cut at the limit.
 */
function compactText(value: string, limit: number, stringLimit: number) {
  if (value.length <= limit) {
    return value;
  }
  try {
    const clipped = JSON.stringify(clipStrings(JSON.parse(value), stringLimit, 0));
    if (clipped.length <= limit * 2) {
      return clipped;
    }
  } catch {
    // Not JSON: cut below.
  }
  return value.slice(0, limit);
}

const RECORD_PART_TYPES = new Set(["tool_use", "approval", "user_input", "system_event", "code_diff"]);

function compactRecordPart(part: Record<string, unknown>): Record<string, unknown> {
  switch (part.type) {
    case "tool_use":
      return {
        ...part,
        input: typeof part.input === "string" ? compactText(part.input, 8_192, 1_000) : "",
        ...(typeof part.output === "string" ? { output: compactText(part.output, 4_096, 2_000) } : {}),
        ...(Array.isArray(part.progressMessages)
          ? { progressMessages: part.progressMessages.slice(-6) }
          : {}),
      };
    case "approval":
      return {
        ...part,
        ...(typeof part.input === "string" ? { input: compactText(part.input, 4_096, 1_000) } : {}),
      };
    case "code_diff":
      return { type: "code_diff", filePath: part.filePath, status: part.status, oldContent: "", newContent: "" };
    case "system_event":
      return { ...part, content: typeof part.content === "string" ? part.content.slice(0, 2_000) : "" };
    default:
      return part;
  }
}

function compactRecordMessage(message: Record<string, unknown>): TurnRecordMessage {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return {
    id: String(message.id ?? ""),
    role: message.role === "user" ? "user" : "assistant",
    ...(typeof message.turnId === "string" ? { turnId: message.turnId } : {}),
    ...(typeof message.startedAt === "string" ? { startedAt: message.startedAt } : {}),
    ...(typeof message.completedAt === "string" ? { completedAt: message.completedAt } : {}),
    ...(message.modelExecution && typeof message.modelExecution === "object"
      ? { modelExecution: message.modelExecution as TurnRecordMessage["modelExecution"] }
      : {}),
    parts: parts
      .filter(
        (part): part is Record<string, unknown> =>
          Boolean(part) && typeof part === "object" && RECORD_PART_TYPES.has(String((part as { type?: unknown }).type)),
      )
      .map(compactRecordPart) as unknown as TurnRecordMessage["parts"],
  };
}

function parseMessageJson(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Reads for the turn picker; `SqliteStore.bootstrap` adds the column first. */
export class TurnDigestStore {
  constructor(private readonly db: Db) {}

  recordChecks(args: { turnId: string; summary: TurnDigestCheckSummary; at?: string }) {
    return recordTurnDigestChecks(this.db, args);
  }

  /** A task's turns, newest first, for Activity's turn picker. */
  listTurnHistory(args: ListTaskTurnHistoryArgs): TurnHistoryPage {
    const limit = Math.max(1, Math.min(TURN_HISTORY_PAGE_LIMIT, args.limit ?? TURN_HISTORY_PAGE_LIMIT));
    const rows = this.db
      .prepare(
        `SELECT id, provider_id, created_at, completed_at, receipt_json, digest_json FROM turns
        WHERE workspace_id = ? AND task_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(args.workspaceId, args.taskId, limit + 1) as TurnHistoryRow[];
    return {
      turns: rows.slice(0, limit).map(toHistoryEntry),
      hasMore: rows.length > limit,
    };
  }

  /**
   * One turn's record. Messages carry their turn only inside their JSON, so
   * the task's rows are searched for the turn id and each candidate is
   * confirmed after parsing. The search pages through every row of the turn:
   * a steered turn saves one reply per stretch, and its last replies (the
   * last commands, the latest todos) say where it ended. Past the record's
   * bound the earliest replies give way and are counted.
   */
  readTurnRecord(args: ReadTaskTurnRecordArgs): TurnRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, provider_id, created_at, completed_at, receipt_json, digest_json FROM turns
        WHERE id = ? AND workspace_id = ? AND task_id = ?`,
      )
      .get(args.turnId, args.workspaceId, args.taskId) as TurnHistoryRow | undefined;
    if (!row) {
      return null;
    }
    const scan = this.db.prepare(
      `SELECT rowid AS row_id, message_json FROM messages
      WHERE workspace_id = ? AND task_id = ? AND rowid > ? AND message_json IS NOT NULL AND instr(message_json, ?) > 0
      ORDER BY rowid ASC LIMIT ?`,
    );
    const needle = `"turnId":${JSON.stringify(args.turnId)}`;
    const replies: Array<{ message: TurnRecordMessage; chars: number }> = [];
    let replyChars = 0;
    let omittedMessages = 0;
    let firstReplyRowId: number | null = null;
    let requestMessage: Record<string, unknown> | null = null;
    for (let after = 0; ;) {
      const page = scan.all(args.workspaceId, args.taskId, after, needle, RECORD_SCAN_PAGE) as Array<{
        row_id: number;
        message_json: string | null;
      }>;
      for (const candidate of page) {
        after = candidate.row_id;
        const message = parseMessageJson(candidate.message_json);
        if (!message || message.turnId !== args.turnId) continue;
        if (message.role === "user") {
          requestMessage ??= message;
          continue;
        }
        if (message.role !== "assistant") continue;
        firstReplyRowId ??= candidate.row_id;
        const compact = compactRecordMessage(message);
        const chars = JSON.stringify(compact).length;
        replies.push({ message: compact, chars });
        replyChars += chars;
        while (
          replies.length > TURN_RECORD_MESSAGE_LIMIT ||
          (replies.length > 1 && replyChars > TURN_RECORD_MESSAGE_CHAR_BUDGET)
        ) {
          replyChars -= replies.shift()?.chars ?? 0;
          omittedMessages += 1;
        }
      }
      if (page.length < RECORD_SCAN_PAGE) break;
    }
    // The request is the user message saved with the turn's id, or else the
    // user message right before the turn's first reply.
    const promptMessage =
      requestMessage ??
      (firstReplyRowId === null
        ? null
        : parseMessageJson(
            (this.db
              .prepare(
                `SELECT message_json FROM messages
                WHERE workspace_id = ? AND task_id = ? AND rowid < ? AND role = 'user'
                ORDER BY rowid DESC LIMIT 1`,
              )
              .get(args.workspaceId, args.taskId, firstReplyRowId) as
              | { message_json: string | null }
              | undefined)?.message_json ?? null,
          ));
    const promptText =
      (typeof promptMessage?.displayContent === "string" ? promptMessage.displayContent : null) ??
      (typeof promptMessage?.content === "string" ? promptMessage.content : null);
    return {
      turn: toHistoryEntry(row),
      digest: parseTurnDigest(row.digest_json),
      prompt: boundText(promptText, PROMPT_LIMIT),
      messages: replies.map((reply) => reply.message),
      omittedMessages,
    };
  }
}
