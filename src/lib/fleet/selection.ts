/** Selection is derived only from the currently visible order, never task indices. */
export interface FleetSelection {
  selectedKeys: ReadonlySet<string>;
  anchor: string | null;
}
export function reconcileFleetSelection(state: FleetSelection, visible: readonly string[]): FleetSelection {
  const keys = new Set(visible);
  const selectedKeys = new Set([...state.selectedKeys].filter((key) => keys.has(key)));
  return { selectedKeys, anchor: state.anchor && keys.has(state.anchor) ? state.anchor : null };
}
export function toggleFleetSelection(state: FleetSelection, key: string, visible: readonly string[], range = false): FleetSelection {
  if (!visible.includes(key)) return state;
  const selectedKeys = new Set(state.selectedKeys);
  const start = state.anchor ? visible.indexOf(state.anchor) : -1;
  if (range && start >= 0) {
    const end = visible.indexOf(key);
    for (const item of visible.slice(Math.min(start, end), Math.max(start, end) + 1)) selectedKeys.add(item);
  } else if (selectedKeys.has(key)) selectedKeys.delete(key);
  else selectedKeys.add(key);
  return { selectedKeys, anchor: range && start >= 0 ? state.anchor : key };
}
export function selectAllFleetItems(visible: readonly string[]): FleetSelection {
  return { selectedKeys: new Set(visible), anchor: visible[0] ?? null };
}
