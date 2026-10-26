/**
 * Full view: one Lens pane takes the whole pane area, and the panes beside it
 * step aside until it is restored.
 *
 * Kept free of Dockview and React so the availability rule can be tested on its
 * own. The hook in `useLensFullView` feeds it the live layout.
 */
export type LensFullViewState = {
  /** The pane can enter or leave full view from where it is now. */
  available: boolean;
  /** The pane is currently shown in full view. */
  active: boolean;
};

export type LensFullViewInput = {
  /**
   * Where the pane's group lives. Only grid groups take part in the maximized
   * layout; floating, popped-out and edge groups are sized on their own.
   */
  location: string;
  isMaximized: boolean;
  /** Grid groups in the pane host, including the pane's own group. */
  gridGroupCount: number;
};

export function resolveLensFullViewState(
  input: LensFullViewInput,
): LensFullViewState {
  if (input.isMaximized) {
    // Leaving must always be possible, whatever the layout became meanwhile.
    return { available: true, active: true };
  }
  // A floating or popped-out pane is already sized on its own, and a pane that
  // is the only group already fills the pane area, so there is nothing to grow.
  return {
    available: input.location === "grid" && input.gridGroupCount > 1,
    active: false,
  };
}

/** Snapshot key so a store subscription can compare by value. */
export function encodeLensFullViewState(state: LensFullViewState): string {
  return `${state.available ? 1 : 0}${state.active ? 1 : 0}`;
}

export function decodeLensFullViewState(key: string): LensFullViewState {
  return { available: key[0] === "1", active: key[1] === "1" };
}
