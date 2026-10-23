import type Database from "better-sqlite3";
import {
  carryForwardInteractionAnswers,
  hasRequestedInteraction,
} from "../../src/lib/session/interaction-state-merge";
import type { PersistenceChatMessageRow } from "./types";

/**
 * `messages` rows are keyed by `<workspace>:<task>:<message id>`, and every
 * workspace snapshot upserts the renderer's whole resident window. A renderer
 * whose state fell behind the database (a stale workspace cache, a missed turn
 * completion) would otherwise write its older copy over newer rows. The
 * conflict branch therefore refuses two kinds of write:
 *
 * - identity: a different message that reused a stored id (a different role,
 *   a different turn, or, for rows without a turn, a different start time)
 *   must never replace the row it collided with;
 * - regression: a finished assistant row is not replaced by a copy that is
 *   streaming again or has shorter content, however many parts it has (a
 *   stop adds a notice part to an older copy). The approval and question
 *   answers such a copy carries are still merged into the stored row.
 *
 * Answers also never move backwards on an accepted write: before a copy that
 * still shows a request is written, the stored row's answer to that request is
 * carried into it.
 *
 * Every comparison uses `IS` / `IS NOT` so a missing JSON field never turns the
 * guard into NULL, which SQLite would read as "skip the update".
 */
const STORED_TURN_ID = "json_extract(messages.message_json, '$.turnId')";
const INCOMING_TURN_ID = "json_extract(excluded.message_json, '$.turnId')";
const STORED_STARTED_AT = "json_extract(messages.message_json, '$.startedAt')";
const INCOMING_STARTED_AT = "json_extract(excluded.message_json, '$.startedAt')";

const IDENTITY_MISMATCH_SQL = `(
  messages.role IS NOT excluded.role
  OR (${STORED_TURN_ID} IS NOT NULL AND ${INCOMING_TURN_ID} IS NOT NULL
    AND ${STORED_TURN_ID} IS NOT ${INCOMING_TURN_ID})
  OR (${STORED_TURN_ID} IS NULL AND ${INCOMING_TURN_ID} IS NULL
    AND ${STORED_STARTED_AT} IS NOT NULL AND ${INCOMING_STARTED_AT} IS NOT NULL
    AND ${STORED_STARTED_AT} IS NOT ${INCOMING_STARTED_AT})
)`;

const FINISHED_ASSISTANT_REGRESSION_SQL = `(
  messages.role = 'assistant'
  AND messages.is_streaming = 0
  AND json_extract(messages.message_json, '$.completedAt') IS NOT NULL
  AND (excluded.is_streaming = 1 OR length(excluded.content) < length(messages.content))
)`;

const UPSERT_TASK_MESSAGE_SQL = `
  INSERT INTO messages (
    id, workspace_id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    role = excluded.role,
    model = excluded.model,
    provider_id = excluded.provider_id,
    content = excluded.content,
    is_streaming = excluded.is_streaming,
    parts_json = excluded.parts_json,
    message_json = excluded.message_json
  WHERE NOT ${IDENTITY_MISMATCH_SQL}
    AND NOT ${FINISHED_ASSISTANT_REGRESSION_SQL}
`;

export type SkippedTaskMessageWriteReason = "identity" | "regression";

export interface SkippedTaskMessageWrite {
  messageId: string;
  reason: SkippedTaskMessageWriteReason;
  /** Interaction answers merged into the stored row despite the refusal. */
  mergedInteractions?: number;
}

interface StoredMessageIdentityRow {
  role: string;
  turn_id: string | null;
  started_at: string | null;
  message_json: string | null;
}

function classifySkippedWrite(args: {
  stored: StoredMessageIdentityRow | undefined;
  message: PersistenceChatMessageRow;
}): SkippedTaskMessageWriteReason {
  const incoming = args.message as PersistenceChatMessageRow & {
    turnId?: string;
    startedAt?: string;
  };
  const stored = args.stored;
  if (!stored || stored.role !== incoming.role) {
    return "identity";
  }
  if (stored.turn_id && incoming.turnId) {
    return stored.turn_id === incoming.turnId ? "regression" : "identity";
  }
  if (!stored.turn_id && !incoming.turnId && stored.started_at && incoming.startedAt) {
    return stored.started_at === incoming.startedAt ? "regression" : "identity";
  }
  return "regression";
}

/**
 * Carries the approval and question answers of a refused stale copy into the
 * stored row: the copy is older, but a person may have answered from it.
 * Answers only move forward, so a stored answer is never reverted. Returns the
 * merged JSON, or null when nothing changed.
 */
function mergeInteractionStates(args: {
  storedJson: string;
  incoming: PersistenceChatMessageRow;
}): { json: string; merged: number } | null {
  let stored: { parts?: unknown[] };
  try {
    stored = JSON.parse(args.storedJson) as { parts?: unknown[] };
  } catch {
    return null;
  }
  if (!Array.isArray(stored.parts)) {
    return null;
  }
  const { parts, carried } = carryForwardInteractionAnswers({
    target: stored.parts,
    source: args.incoming.parts,
  });
  return carried > 0
    ? { json: JSON.stringify({ ...stored, parts }), merged: carried }
    : null;
}

/** Puts the stored row's answers into a copy that still shows the request. */
function carryStoredAnswers(args: {
  message: PersistenceChatMessageRow;
  storedJson: string | null;
}): PersistenceChatMessageRow {
  if (!args.storedJson) {
    return args.message;
  }
  let stored: { parts?: unknown[] };
  try {
    stored = JSON.parse(args.storedJson) as { parts?: unknown[] };
  } catch {
    return args.message;
  }
  if (!Array.isArray(stored.parts)) {
    return args.message;
  }
  const { parts, carried } = carryForwardInteractionAnswers({
    target: args.message.parts,
    source: stored.parts,
  });
  return carried > 0 ? { ...args.message, parts } : args.message;
}

/**
 * Upserts a task's messages and returns the writes the conflict guard refused.
 * Refused writes keep the stored row; they are logged with ids only, never
 * message content.
 */
export function upsertTaskMessages(args: {
  db: Database.Database;
  workspaceId: string;
  taskId: string;
  messages: PersistenceChatMessageRow[];
}): SkippedTaskMessageWrite[] {
  if (args.messages.length === 0) {
    return [];
  }
  const upsert = args.db.prepare(UPSERT_TASK_MESSAGE_SQL);
  const readStoredJson = args.db.prepare("SELECT message_json FROM messages WHERE id = ?");
  const skipped: SkippedTaskMessageWrite[] = [];
  for (const incoming of args.messages) {
    const rowId = `${args.workspaceId}:${args.taskId}:${incoming.id}`;
    const message = carryStoredAnswers({
      message: incoming,
      storedJson: hasRequestedInteraction(incoming.parts)
        ? ((readStoredJson.get(rowId) as { message_json: string | null } | undefined)
            ?.message_json ?? null)
        : null,
    });
    const result = upsert.run(
      rowId,
      args.workspaceId,
      args.taskId,
      message.role,
      message.model,
      message.providerId,
      message.content,
      message.isStreaming ? 1 : 0,
      "[]",
      JSON.stringify(message),
    );
    if (result.changes > 0) {
      continue;
    }
    const stored = args.db
      .prepare(
        `SELECT role,
          json_extract(message_json, '$.turnId') AS turn_id,
          json_extract(message_json, '$.startedAt') AS started_at,
          message_json
        FROM messages WHERE id = ?`,
      )
      .get(rowId) as StoredMessageIdentityRow | undefined;
    const reason = classifySkippedWrite({ stored, message });
    const interactions =
      reason === "regression" && stored?.message_json
        ? mergeInteractionStates({ storedJson: stored.message_json, incoming: message })
        : null;
    if (interactions) {
      args.db
        .prepare("UPDATE messages SET message_json = ? WHERE id = ?")
        .run(interactions.json, rowId);
    }
    skipped.push({
      messageId: message.id,
      reason,
      ...(interactions ? { mergedInteractions: interactions.merged } : {}),
    });
  }
  if (skipped.length > 0) {
    console.warn("[persistence] kept stored messages over conflicting writes", {
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      skipped,
    });
  }
  return skipped;
}
