import { useState } from "react";
import { saveTaskHandoff } from "@/lib/db/task-handoff.db";
import { useAppStore } from "@/store/app.store";
import {
  HANDOFF_SECTION_IDS,
  handoffRecordToDraft,
  mergeHandoffSuggestions,
  resolveHandoffCommit,
  type HandoffDraft,
  type HandoffDraftAuthors,
  type HandoffSectionId,
  type TaskHandoffRecord,
} from "@/lib/task-context/handoff-record";
import { clearHandoffDraft, readHandoffDraft, writeHandoffDraft } from "./handoff-draft";

export type HandoffSaveOutcome = "saved" | "unchanged" | "conflict" | "failed";

/**
 * Editing state for one task's handoff record, on the Notes draft contract:
 * the draft outlives the editor, Save notices a record saved meanwhile and
 * lets the user choose, and text Stave or the agent wrote keeps that author
 * until the user changes it.
 */
export function useHandoffEditor(args: {
  draftKey: string;
  workspaceId: string;
  taskId: string;
  record: TaskHandoffRecord;
  onSaved: (record: TaskHandoffRecord) => void;
}) {
  const [stored] = useState(() => readHandoffDraft(args.draftKey));
  const [isEditing, setIsEditing] = useState(stored !== null);
  const [draft, setDraft] = useState<HandoffDraft>(stored?.draft ?? handoffRecordToDraft(args.record));
  const [authors, setAuthors] = useState<HandoffDraftAuthors>(stored?.authors ?? {});
  const [baseRevision, setBaseRevision] = useState(stored?.baseRevision ?? args.record.revision);
  // A restored draft whose starting point is no longer the saved record says
  // so up front instead of hiding the newer record behind the editor.
  const [conflict, setConflict] = useState<TaskHandoffRecord | null>(
    stored !== null && stored.baseRevision !== args.record.revision ? args.record : null,
  );
  const [saving, setSaving] = useState(false);

  const remember = (next: { draft: HandoffDraft; authors: HandoffDraftAuthors; baseRevision: number }) => {
    setDraft(next.draft);
    setAuthors(next.authors);
    setBaseRevision(next.baseRevision);
    writeHandoffDraft(args.draftKey, next);
  };

  const begin = (next: { draft: HandoffDraft; authors: HandoffDraftAuthors }) => {
    setConflict(null);
    setIsEditing(true);
    remember({ ...next, baseRevision: args.record.revision });
  };

  const finish = () => {
    clearHandoffDraft(args.draftKey);
    setConflict(null);
    setIsEditing(false);
  };

  const save = async (fromRevision: number): Promise<HandoffSaveOutcome> => {
    setSaving(true);
    try {
      const response = await saveTaskHandoff(
        { workspaceId: args.workspaceId, taskId: args.taskId, baseRevision: fromRevision, draft, authors },
        // A task created a moment ago is stored with its workspace's next snapshot; store it now.
        { storeTask: () => useAppStore.getState().flushActiveWorkspaceSnapshot() },
      );
      if (response.ok) {
        args.onSaved(response.record);
        finish();
        return "saved";
      }
      if (response.conflict) {
        args.onSaved(response.record);
        setConflict(response.record);
        return "conflict";
      }
      return "failed";
    } catch {
      return "failed";
    } finally {
      setSaving(false);
    }
  };

  return {
    isEditing,
    draft,
    authors,
    conflict,
    saving,
    startEditing: () => begin({ draft: handoffRecordToDraft(args.record), authors: {} }),
    updateSection: (id: HandoffSectionId, text: string) =>
      remember({ draft: { ...draft, [id]: text }, authors: { ...authors, [id]: "user" }, baseRevision }),
    /** Stave's facts, appended where a section lacks them; returns how many sections changed. */
    applySuggestions: (suggestions: Partial<HandoffDraft>) => {
      const base = isEditing ? draft : handoffRecordToDraft(args.record);
      const merged = mergeHandoffSuggestions(base, suggestions);
      if (merged.changed.length === 0) return 0;
      const nextAuthors = { ...(isEditing ? authors : {}) };
      for (const id of merged.changed) nextAuthors[id] = "stave";
      if (isEditing) {
        remember({ draft: merged.draft, authors: nextAuthors, baseRevision });
      } else {
        begin({ draft: merged.draft, authors: nextAuthors });
      }
      return merged.changed.length;
    },
    /** The agent's proposal, section by section, for the user to review and save. */
    applyProposal: (proposal: Partial<HandoffDraft>) => {
      const current = handoffRecordToDraft(args.record);
      const next = { ...current };
      const nextAuthors: HandoffDraftAuthors = {};
      for (const id of HANDOFF_SECTION_IDS) {
        const text = proposal[id];
        if (text === undefined || text === current[id]) continue;
        next[id] = text;
        nextAuthors[id] = "agent";
      }
      begin({ draft: next, authors: nextAuthors });
    },
    commit: async (): Promise<HandoffSaveOutcome> => {
      const decision = resolveHandoffCommit({ draft, baseRevision, current: args.record });
      if (decision === "unchanged") {
        finish();
        return "unchanged";
      }
      if (decision === "conflict") {
        setConflict(args.record);
        return "conflict";
      }
      return save(baseRevision);
    },
    /** Keep my version over the record saved meanwhile. */
    overwrite: () => save(conflict?.revision ?? args.record.revision),
    cancel: finish,
  };
}
