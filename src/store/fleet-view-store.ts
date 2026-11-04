import { create } from "zustand";

/**
 * What Fleet View had selected, kept outside the surface so it survives a
 * round trip: open a task from Fleet, go back, and the same agent row is
 * still open.
 */
interface FleetViewState {
  /**
   * The agent row open in Fleet's tree. `undefined` until the user picks one
   * (the first row opens); `null` when they closed it.
   */
  openAgentKey: string | null | undefined;
  setOpenAgentKey: (key: string | null) => void;
}

export const useFleetViewStore = create<FleetViewState>((set) => ({
  openAgentKey: undefined,
  setOpenAgentKey: (key) =>
    set((state) => (state.openAgentKey === key ? state : { openAgentKey: key })),
}));
