import { z } from "zod";
import type { TarsMessage } from "./conversation";
import {
  TARS_ASSIGNMENT_MAX_CHARS, TARS_MESSAGE_ATTACHMENTS_MAX, TARS_MESSAGE_MAX_CHARS, TarsAttachmentSummarySchema, TarsWorkRequestSchema,
  type TarsAttachmentSummary, type TarsResponsibility, type TarsWorkRequest,
} from "./types";

const IdSchema = z.string().trim().min(1).max(256);

/** Names the one responsibility whose brief to read; nothing else crosses. */
export const TarsBriefInputSchema = z.object({ responsibilityId: IdSchema }).strict();
export type TarsBriefInput = z.infer<typeof TarsBriefInputSchema>;

/**
 * Where the instruction a brief shows comes from: `delegated`, the unit's
 * instruction exactly as Tars proposed it; `assignment`, for work admitted
 * before the user's message and Tars's instruction were saved apart, the run's
 * whole saved assignment, which can already contain the user's message.
 */
export const TarsBriefInstructionSourceSchema = z.enum(["delegated", "assignment"]);
export type TarsBriefInstructionSource = z.infer<typeof TarsBriefInstructionSourceSchema>;

/**
 * What one responsibility was handed, read from its saved row:
 * - `request`: the user's message that admitted it, as saved at admission or,
 *   for work admitted before Stave saved it, read back from the conversation
 *   message its request id names; null when there is neither (work created
 *   without a message, or a message no longer in the conversation).
 * - `instruction`: Tars's instruction (`delegated`) or, for older work, the
 *   whole saved assignment (`assignment`).
 * - `context`: only with `assignment`, the text the run receives in full as
 *   context on every lead turn because it did not fit the assignment.
 * - `attachments`: the summaries (name, kind, type, size) of the message's
 *   files and images the work carries, which its run's first turn receives;
 *   absent when it carries none. Never their content.
 *
 * The completion criteria are not repeated here: every window already holds
 * them in the snapshot.
 */
export const TarsBriefSchema = z.object({
  responsibilityId: IdSchema,
  request: TarsWorkRequestSchema.nullable(),
  instruction: z.object({
    source: TarsBriefInstructionSourceSchema,
    text: z.string().min(1).max(TARS_ASSIGNMENT_MAX_CHARS),
  }).strict(),
  context: z.string().min(1).max(TARS_MESSAGE_MAX_CHARS).nullable(),
  attachments: z.array(TarsAttachmentSummarySchema).min(1).max(TARS_MESSAGE_ATTACHMENTS_MAX).optional(),
}).strict();
export type TarsBrief = z.infer<typeof TarsBriefSchema>;

/** The message that admits a work unit, as the unit keeps it. */
export function tarsWorkRequestOf(message: Pick<TarsMessage, "id" | "text" | "createdAt" | "origin">): TarsWorkRequest {
  const question = message.origin?.kind === "answer" ? message.origin.question.trim() : "";
  return { messageId: message.id, text: message.text, sentAt: message.createdAt, ...(question ? { answeredQuestion: question } : {}) };
}

/**
 * The conversation message a responsibility's request id names: decision
 * admission gives every unit `tars-message:<messageId>:<actionIndex>`. Null for
 * any other request id (a renderer create, or a format this does not know).
 */
export function parseTarsRequestMessageId(requestId: string): string | null {
  return /^tars-message:(.+):\d+$/.exec(requestId)?.[1] ?? null;
}

/**
 * Where a responsibility's original request was read from: `saved`, kept on
 * the row at admission; `recovered`, read again from the conversation message
 * its request id names, for work admitted before Stave kept the request.
 */
export type TarsWorkRequestSource = "saved" | "recovered";

/**
 * A responsibility's original request: the copy saved at admission, or, for
 * older work, the very message its request id names, read back from the
 * conversation by `read` (the same message admission would have copied, so
 * the text is exact). Null when neither exists: never a guess.
 */
export function resolveTarsWorkRequest(row: Pick<TarsResponsibility, "requestId" | "request">,
  read: ((messageId: string) => TarsWorkRequest | null) | undefined): { request: TarsWorkRequest; source: TarsWorkRequestSource } | null {
  if (row.request) return { request: row.request, source: "saved" };
  const messageId = parseTarsRequestMessageId(row.requestId);
  if (!messageId || !read) return null;
  let request: TarsWorkRequest | null = null;
  // An unreadable conversation leaves the request unknown, never invented.
  try { request = read(messageId); } catch { return null; }
  const parsed = request && request.messageId === messageId ? TarsWorkRequestSchema.safeParse(request) : null;
  return parsed?.success ? { request: parsed.data, source: "recovered" } : null;
}

/**
 * A responsibility's brief from its saved row; `resolved` is its original
 * request (`resolveTarsWorkRequest`), which for older work comes
 * from the conversation. Older work keeps its instruction as one assignment;
 * it is shown whole and is never split by guesswork.
 */
export function buildTarsBrief(row: Pick<TarsResponsibility, "id" | "instruction" | "mandate" | "request" | "delegatedInstruction"> & Partial<Pick<TarsResponsibility, "attachments">>,
  resolved: TarsWorkRequest | null = row.request ?? null): TarsBrief {
  const request = resolved;
  const attachments: TarsAttachmentSummary[] | undefined = row.attachments?.items.map(({ index: _index, ...summary }) => summary);
  const carried = attachments?.length ? { attachments } : {};
  if (row.delegatedInstruction) return { responsibilityId: row.id, request, instruction: { source: "delegated", text: row.delegatedInstruction }, context: null, ...carried };
  return { responsibilityId: row.id, request, instruction: { source: "assignment", text: row.instruction }, context: row.mandate ?? null, ...carried };
}
