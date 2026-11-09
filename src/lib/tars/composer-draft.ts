import { z } from "zod";
import { TARS_MESSAGE_MAX_CHARS } from "./types";

/**
 * The most a saved draft holds. Above the send limit on purpose: a draft over
 * the limit is still the user's words and is kept while they shorten it. A
 * longer draft is held in memory only and never written.
 */
export const TARS_DRAFT_MAX_CHARS = TARS_MESSAGE_MAX_CHARS * 4;

/**
 * The message being written to Tars: its words, its per-message
 * working-changes choice and, after a send that did not come back, the request
 * ID that send used. An unchanged retry reuses that ID, so a send whose
 * acknowledgement was lost cannot become a second message; any edit clears it.
 * The host deletes the draft in the same transaction that saves the message
 * carrying its request ID.
 */
export const TarsComposerDraftSchema = z.object({
  text: z.string().max(TARS_DRAFT_MAX_CHARS),
  includeWorkingChanges: z.boolean(),
  requestId: z.string().trim().min(1).max(256).nullable(),
}).strict();
export type TarsComposerDraft = z.infer<typeof TarsComposerDraftSchema>;

/** `null` deletes the saved draft. */
export const SaveTarsComposerDraftInputSchema = z.object({
  draft: TarsComposerDraftSchema.nullable(),
}).strict();
export type SaveTarsComposerDraftInput = z.infer<typeof SaveTarsComposerDraftInputSchema>;

/** Nothing worth keeping: no words and no choice. A pending request ID alone is not a draft. */
export function isEmptyTarsComposerDraft(draft: Pick<TarsComposerDraft, "text" | "includeWorkingChanges">): boolean {
  return draft.text.length === 0 && !draft.includeWorkingChanges;
}
