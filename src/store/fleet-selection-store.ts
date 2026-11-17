import { create } from "zustand";
import type { Task } from "@/types/chat";
import { reconcileFleetSelection, selectAllFleetItems, toggleFleetSelection, type FleetSelection } from "@/lib/fleet/selection";

export interface FleetSelectionTarget {
  key: string;
  repositoryPath: string;
  workspaceId: string;
  taskId: string;
  task?: Task;
  activeTurnId?: string | null;
}
interface FleetSelectionState extends FleetSelection {
  visibleTargets: readonly FleetSelectionTarget[];
  scopes: ReadonlyMap<string, readonly FleetSelectionTarget[]>;
  setRows(scope: string, rows: readonly FleetSelectionTarget[]): void;
  removeScope(scope: string): void;
  toggle(key: string, range?: boolean): void;
  selectAll(): void;
  selectGroup(keys: readonly string[]): void;
  clear(): void;
}
function visibleScopeTargets(scopes: ReadonlyMap<string, readonly FleetSelectionTarget[]>) {
  const targets = new Map<string, FleetSelectionTarget>();
  for (const target of [...scopes.values()].flat()) targets.set(target.key, { ...targets.get(target.key), ...target });
  return [...targets.values()];
}
export const useFleetSelectionStore = create<FleetSelectionState>((set, get) => ({
  selectedKeys: new Set(), anchor: null, scopes: new Map(), visibleTargets: [],
  setRows: (scope, rows) => set((state) => {
    const previous = state.scopes.get(scope);
    if (previous?.length === rows.length && rows.every((row, index) => {
      const before = previous[index];
      return before?.key === row.key && before.task === row.task && before.activeTurnId === row.activeTurnId;
    })) return state;
    const scopes = new Map(state.scopes); scopes.set(scope, rows);
    const visibleTargets = visibleScopeTargets(scopes);
    return { scopes, visibleTargets, ...reconcileFleetSelection(state, visibleTargets.map((row) => row.key)) };
  }),
  removeScope: (scope) => set((state) => {
    const scopes = new Map(state.scopes); scopes.delete(scope);
    const visibleTargets = visibleScopeTargets(scopes);
    return { scopes, visibleTargets, ...reconcileFleetSelection(state, visibleTargets.map((row) => row.key)) };
  }),
  toggle: (key, range = false) => set((state) => toggleFleetSelection(state, key, state.visibleTargets.map((row) => row.key), range)),
  selectAll: () => set(selectAllFleetItems(get().visibleTargets.map((row) => row.key))),
  selectGroup: (keys) => set((state) => {
    const visible = new Set(state.visibleTargets.map((row) => row.key));
    const selectedKeys = new Set(state.selectedKeys);
    const remove = keys.every((key) => selectedKeys.has(key));
    for (const key of keys) if (visible.has(key)) { if (remove) selectedKeys.delete(key); else selectedKeys.add(key); }
    return { selectedKeys, anchor: keys[0] ?? state.anchor };
  }),
  clear: () => set({ selectedKeys: new Set(), anchor: null }),
}));
