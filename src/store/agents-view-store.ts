import { create } from "zustand";

/**
 * Which tab the Agents surface shows. Kept in its own store so another surface
 * — a "My standards" link, a palette command — can open the surface on a
 * given tab without threading state through the render ladder.
 */
export type AgentsViewTab = "agents" | "standards";

interface AgentsViewState {
  activeTab: AgentsViewTab;
  /** The agent the Agents tab shows; null picks the first one. */
  selectedAgentId: string | null;
  setActiveTab: (tab: AgentsViewTab) => void;
  /** Opens the Agents tab on one agent, e.g. from its sidebar row. */
  selectAgent: (agentId: string | null) => void;
}

export const useAgentsViewStore = create<AgentsViewState>((set) => ({
  activeTab: "agents",
  selectedAgentId: null,
  selectAgent: (agentId) =>
    set((state) =>
      state.selectedAgentId === agentId && state.activeTab === "agents"
        ? state
        : { selectedAgentId: agentId, activeTab: "agents" },
    ),
  setActiveTab: (tab) =>
    set((state) => (state.activeTab === tab ? state : { activeTab: tab })),
}));
