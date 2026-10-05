import { create } from "zustand";

/**
 * A manual open or close of a run's details, and the run it was made for.
 *
 * The choice lasts for that run only: a turn's id, or the agent run's agent run
 * id when one heads the shelf, so collapsing a long agent run stays collapsed
 * across its turns while the next run falls back to the setting.
 */
export interface ShelfDetailOverride {
  runKey: string;
  open: boolean;
}

interface ComposerShelfState {
  /** Per task. Read with a narrow selector: the entry object is replaced, never mutated. */
  detailByTask: Readonly<Record<string, ShelfDetailOverride>>;
  setDetailOpen: (args: { taskId: string; runKey: string; open: boolean }) => void;
}

/**
 * Session-only UI state shared by the composer shelf and the floating card:
 * the shelf's toggle decides whether the card shows, so the two cannot keep
 * their own copies.
 */
export const useComposerShelfStore = create<ComposerShelfState>()((set) => ({
  detailByTask: {},
  setDetailOpen: ({ taskId, runKey, open }) =>
    set((state) => {
      const current = state.detailByTask[taskId];
      if (current?.runKey === runKey && current.open === open) {
        return state;
      }
      return { detailByTask: { ...state.detailByTask, [taskId]: { runKey, open } } };
    }),
}));
