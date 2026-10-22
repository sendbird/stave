import { z } from "zod";
import type { ChatMessage } from "@/types/chat";
import { TurnDigestSchema } from "./turn-digest";

/**
 * The renderer's view of a task's earlier turns: the list behind Activity's
 * turn picker, and one turn's record (its digest, the prompt that started it
 * and its saved steps). Both read the app database in the main process.
 */
export const TURN_HISTORY_LIST_IPC = "persistence:list-task-turn-history";
export const TURN_HISTORY_RECORD_IPC = "persistence:read-task-turn-record";

/** Turns listed per read, newest first. */
export const TURN_HISTORY_PAGE_LIMIT = 200;
/**
 * Replies a turn's record keeps, newest last. A steered turn saves one reply
 * per stretch, so a long one can pass it; the earliest go first, and the
 * record counts them.
 */
export const TURN_RECORD_MESSAGE_LIMIT = 200;
/** And at most about this many characters of them, after they are shortened. */
export const TURN_RECORD_MESSAGE_CHAR_BUDGET = 2_000_000;

const IdSchema = z.string().min(1).max(200);

export const ListTaskTurnHistoryArgsSchema = z
  .object({
    workspaceId: IdSchema,
    taskId: IdSchema,
    limit: z.number().int().min(1).max(TURN_HISTORY_PAGE_LIMIT).optional(),
  })
  .strict();
export type ListTaskTurnHistoryArgs = z.infer<typeof ListTaskTurnHistoryArgsSchema>;

export const ReadTaskTurnRecordArgsSchema = z
  .object({ workspaceId: IdSchema, taskId: IdSchema, turnId: IdSchema })
  .strict();
export type ReadTaskTurnRecordArgs = z.infer<typeof ReadTaskTurnRecordArgsSchema>;

const ProviderIdSchema = z.preprocess(
  (value) => (value === "stave" ? "claude-code" : value),
  z.enum(["claude-code", "codex", "cursor", "kiro", "opencode"]),
);

/** What the picker needs to tell turns apart without reading each record. */
export const TurnHistoryEntrySchema = z.object({
  id: z.string(),
  providerId: ProviderIdSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  outcome: z.enum(["completed", "failed", "cancelled", "unknown"]).nullable(),
  error: z.string().nullable(),
  /** Null when the turn began before Stave kept digests ("No record"). */
  digest: z
    .object({
      entryCount: z.number().int().min(0),
      hasError: z.boolean(),
      checks: z.enum(["pass", "warn", "fail"]).nullable(),
    })
    .nullable(),
});
export type TurnHistoryEntry = z.infer<typeof TurnHistoryEntrySchema>;

export const TurnHistoryPageSchema = z.object({
  turns: z.array(TurnHistoryEntrySchema),
  /** Older turns exist beyond this page. */
  hasMore: z.boolean(),
});
export type TurnHistoryPage = z.infer<typeof TurnHistoryPageSchema>;

/**
 * A saved message cut down to what rebuilding a turn's steps reads: tool
 * calls, approvals, questions and notices, with long inputs and outputs
 * shortened. Text and reasoning stay in the conversation.
 */
export type TurnRecordMessage = Pick<
  ChatMessage,
  "id" | "role" | "turnId" | "parts" | "startedAt" | "completedAt" | "modelExecution"
>;

const TurnRecordMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    turnId: z.string().optional(),
    parts: z.array(z.object({ type: z.string() }).passthrough()),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
  })
  .passthrough();

export const TurnRecordSchema = z.object({
  turn: TurnHistoryEntrySchema,
  digest: TurnDigestSchema.nullable(),
  /** The request that started the turn, shortened; null when it was not found. */
  prompt: z.string().nullable(),
  messages: z.array(TurnRecordMessageSchema),
  /** Earlier replies of the turn left out to keep the record bounded. */
  omittedMessages: z.number().int().min(0).optional(),
});
export interface TurnRecord {
  turn: TurnHistoryEntry;
  digest: z.infer<typeof TurnDigestSchema> | null;
  prompt: string | null;
  messages: TurnRecordMessage[];
  /** Earlier replies of the turn left out to keep the record bounded; their steps are in the conversation. */
  omittedMessages?: number;
}

export type TurnHistoryListResponse =
  | { ok: true; page: TurnHistoryPage }
  | { ok: false; message: string };
export type TurnRecordResponse =
  | { ok: true; record: TurnRecord | null }
  | { ok: false; message: string };
