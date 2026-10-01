import { create } from "zustand";
import type { Playbook } from "@/lib/playbooks/schema";

/**
 * Unsaved playbook edits and the playbook in view, kept outside the Playbooks
 * tab so switching Automations tabs (which unmounts it) loses nothing. Held
 * for the session only; nothing here is written until the user saves.
 */
interface PlaybookDraftsState {
  /** Unsaved edits by playbook id, including new playbooks never saved. */
  drafts: Record<string, Playbook>;
  /** The playbook the tab shows; null shows the first. */
  selectedId: string | null;
  /** The playbook that opens with Draft with AI showing. */
  draftingId: string | null;
  setDraft: (draft: Playbook) => void;
  dropDraft: (id: string) => void;
  select: (id: string | null) => void;
  setDraftingId: (id: string | null) => void;
}

export const usePlaybookDraftsStore = create<PlaybookDraftsState>((set) => ({
  drafts: {},
  selectedId: null,
  draftingId: null,
  setDraft: (draft) => set((state) => ({ drafts: { ...state.drafts, [draft.id]: draft } })),
  dropDraft: (id) =>
    set((state) => {
      if (!(id in state.drafts)) return state;
      const { [id]: _dropped, ...rest } = state.drafts;
      return { drafts: rest, draftingId: state.draftingId === id ? null : state.draftingId };
    }),
  select: (id) => set({ selectedId: id }),
  setDraftingId: (id) => set({ draftingId: id }),
}));
