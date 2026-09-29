import { create } from "zustand";

/**
 * What the Assign to agent sheet opens with. Frozen at open time, so moving
 * between tasks or issues while the sheet is up never retargets it.
 */
export interface AssignSheetRequest {
  /** Prefilled request, e.g. an issue's key, title and link. */
  assignment?: string;
  /** Preselected agent; the first agent usable as a main agent otherwise. */
  agentConfigId?: string;
  /** Where the request came from, shown under the title. */
  source?: string;
}

interface AgentsUiState {
  assignSheet: AssignSheetRequest | null;
  openAssignSheet: (request?: AssignSheetRequest) => void;
  closeAssignSheet: () => void;
}

export const useAgentsUiStore = create<AgentsUiState>((set) => ({
  assignSheet: null,
  openAssignSheet: (request = {}) => set({ assignSheet: request }),
  closeAssignSheet: () => set({ assignSheet: null }),
}));
