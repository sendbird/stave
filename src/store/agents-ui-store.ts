import { create } from "zustand";

/**
 * What Kickoff opens with when work is handed to it from elsewhere: an issue,
 * the composer's `!assign`, an agent's "Start work…", or the command palette.
 * Frozen at open time, so moving between tasks or issues while the dialog is
 * up never retargets it. A rising `nonce` reopens Kickoff with a new request
 * even when the dialog is already open.
 */
export interface KickoffAgentRequest {
  /** Prefilled work source, e.g. an issue's key, title and link. */
  text?: string;
  /** Preselected agent; usable-as-main agents are offered otherwise. */
  agentConfigId?: string;
  /** Where the request came from, shown under the title. */
  source?: string;
}

interface AgentsUiState {
  kickoffRequest: (KickoffAgentRequest & { nonce: number }) | null;
  /** Opens Kickoff with the request; the dialog clears it once consumed. */
  openKickoffWithAgent: (request?: KickoffAgentRequest) => void;
  clearKickoffRequest: () => void;
  /** Rises when "New agent" is requested (palette, deep link); the Agents tab opens its dialog. */
  newAgentNonce: number;
  requestNewAgent: () => void;
  /** Rises when "Assign to an agent…" is requested; the composer opens its selector on Agents. */
  agentSelectorNonce: number;
  requestAgentSelector: () => void;
}

export const useAgentsUiStore = create<AgentsUiState>((set) => ({
  kickoffRequest: null,
  openKickoffWithAgent: (request = {}) =>
    set((state) => ({ kickoffRequest: { ...request, nonce: (state.kickoffRequest?.nonce ?? 0) + 1 } })),
  clearKickoffRequest: () => set({ kickoffRequest: null }),
  newAgentNonce: 0,
  requestNewAgent: () => set((state) => ({ newAgentNonce: state.newAgentNonce + 1 })),
  agentSelectorNonce: 0,
  requestAgentSelector: () => set((state) => ({ agentSelectorNonce: state.agentSelectorNonce + 1 })),
}));
