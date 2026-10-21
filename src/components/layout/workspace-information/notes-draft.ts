/**
 * Unsaved Information notes, kept per workspace for this app session.
 *
 * The notes editor unmounts whenever the user switches Information panels or
 * workspaces. Its text used to live only in component state, so a half-written
 * note vanished on the first panel switch. Drafts are keyed by workspace so a
 * draft started in one workspace can never be saved into another, and each
 * remembers the notes it started from so a concurrent change (an agent writing
 * notes meanwhile) is noticed instead of overwritten.
 *
 * In memory only: a restart ends the draft, like an unsaved editor.
 */
export interface NotesDraft {
  text: string;
  /** The saved notes when editing began. */
  baseNotes: string;
}

const draftsByWorkspaceId = new Map<string, NotesDraft>();

export function readNotesDraft(workspaceId: string): NotesDraft | null {
  return draftsByWorkspaceId.get(workspaceId) ?? null;
}

export function writeNotesDraft(workspaceId: string, draft: NotesDraft) {
  if (!workspaceId) {
    return;
  }
  draftsByWorkspaceId.set(workspaceId, draft);
}

export function clearNotesDraft(workspaceId: string) {
  draftsByWorkspaceId.delete(workspaceId);
}

export type NotesCommitDecision = "save" | "unchanged" | "conflict";

/**
 * What Done should do with a draft.
 *
 * `conflict` when the saved notes moved since editing began and the draft
 * would overwrite that change; the user chooses. A draft that already equals
 * the current notes has nothing to save.
 */
export function resolveNotesCommit(args: {
  draft: string;
  baseNotes: string;
  currentNotes: string;
}): NotesCommitDecision {
  if (args.draft === args.currentNotes) {
    return "unchanged";
  }
  if (args.currentNotes !== args.baseNotes) {
    return "conflict";
  }
  return "save";
}
