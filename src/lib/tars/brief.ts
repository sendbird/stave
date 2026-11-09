import { z } from "zod";
import type { TarsMessage } from "./conversation";
import { TARS_ASSIGNMENT_MAX_CHARS, TARS_MESSAGE_MAX_CHARS, TarsWorkRequestSchema, type TarsResponsibility, type TarsWorkRequest } from "./types";

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
 * - `request`: the user's message that admitted it; null when none was saved
 *   (work admitted before Stave saved it, or created without a message).
 * - `instruction`: Tars's instruction (`delegated`) or, for older work, the
 *   whole saved assignment (`assignment`).
 * - `context`: only with `assignment`, the text the run receives in full as
 *   context on every lead turn because it did not fit the assignment.
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
}).strict();
export type TarsBrief = z.infer<typeof TarsBriefSchema>;

/** The message that admits a work unit, as the unit keeps it. */
export function tarsWorkRequestOf(message: Pick<TarsMessage, "id" | "text" | "createdAt" | "origin">): TarsWorkRequest {
  const question = message.origin?.kind === "answer" ? message.origin.question.trim() : "";
  return { messageId: message.id, text: message.text, sentAt: message.createdAt, ...(question ? { answeredQuestion: question } : {}) };
}

/**
 * A responsibility's brief from its saved row alone. Older work keeps its
 * instruction as one assignment; it is shown whole and its message is marked
 * missing instead of being split by guesswork.
 */
export function buildTarsBrief(row: Pick<TarsResponsibility, "id" | "instruction" | "mandate" | "request" | "delegatedInstruction">): TarsBrief {
  const request = row.request ?? null;
  if (row.delegatedInstruction) return { responsibilityId: row.id, request, instruction: { source: "delegated", text: row.delegatedInstruction }, context: null };
  return { responsibilityId: row.id, request, instruction: { source: "assignment", text: row.instruction }, context: row.mandate ?? null };
}
