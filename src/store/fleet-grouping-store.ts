import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FleetGrouping } from "@/lib/fleet/status-groups";
export const useFleetGroupingStore = create(persist<{ grouping: FleetGrouping; setGrouping: (grouping: FleetGrouping) => void }>((set) => ({
  grouping: "default",
  setGrouping: (grouping) => set({ grouping }),
}), { name: "stave-fleet-grouping", partialize: (state) => ({ grouping: state.grouping }) as typeof state }));
