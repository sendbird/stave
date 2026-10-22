import type {
  HandoffDraft,
  HandoffDraftAuthors,
} from "@/lib/task-context/handoff-record";

/**
 * Unsaved handoff edits, kept per task for this app session, on the Notes
 * draft contract: switching tabs or tasks unmounts the editor and the draft is
 * picked up again on return. Each remembers the revision it started from, so
 * a record saved meanwhile (another window, an accepted proposal) is noticed
 * instead of overwritten.
 *
 * In memory only: a restart ends the draft, like an unsaved editor.
 */
export interface HandoffDraftState {
  draft: HandoffDraft;
  /** Who wrote each section the draft changed: Stave's fill, the agent's proposal, or the user. */
  authors: HandoffDraftAuthors;
  baseRevision: number;
}

const draftsByTask = new Map<string, HandoffDraftState>();

export function readHandoffDraft(key: string): HandoffDraftState | null {
  return draftsByTask.get(key) ?? null;
}

export function writeHandoffDraft(key: string, state: HandoffDraftState) {
  if (!key) return;
  draftsByTask.set(key, state);
}

export function clearHandoffDraft(key: string) {
  draftsByTask.delete(key);
}
