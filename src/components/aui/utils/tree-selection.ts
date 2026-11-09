/**
 * Tree selection roll-up — the single implementation of `cascade` versus
 * `independent` multi-select. `Tree` (checkbox rows in a tree view) and
 * `TreeSelect` (checkbox rows inside a picker popup) both read it, so the two
 * families cannot answer "is this parent checked?" differently. That is the
 * whole point of the module: the behavior existed only inside `TreeSelect`,
 * and giving `Tree` its own copy is how a second, subtly different set of
 * cascade rules gets into the system.
 *
 * `cascade` — a row stands for its selectable *leaf* descendants. Checking a
 * folder checks every leaf under it; the folder reads `mixed` while only some
 * of those leaves are checked. Disabled leaves are never included, so a branch
 * whose only leaves are disabled cannot be checked at all.
 *
 * `independent` — a row stands for itself. Parents and children are unrelated
 * ids and no row ever reads `mixed`.
 */

export type TreeSelectionBehavior = "cascade" | "independent";

/**
 * The structural shape the roll-up needs. `TreeNode` and `TreeSelectItem` both
 * satisfy it, which is why neither family owns a private copy of these rules.
 */
export type TreeSelectionNode = {
  /** `false` opts a row out of checking entirely (a group header). */
  checkable?: boolean;
  children?: TreeSelectionNode[];
  disabled?: boolean;
  id: string;
};

export type TreeSelectionState = {
  checked: boolean;
  mixed: boolean;
};

function isSelectable(node: TreeSelectionNode): boolean {
  return !node.disabled && node.checkable !== false;
}

/**
 * Selectable leaves under `node`, itself included when it has no children.
 * A disabled *branch* is walked through rather than pruned: the branch row is
 * what the consumer disabled, and its enabled leaves stay reachable from their
 * own rows.
 */
function collectSelectableLeaves(
  node: TreeSelectionNode,
  into: string[],
): string[] {
  const children = node.children;
  if (!children || children.length === 0) {
    if (isSelectable(node)) {
      into.push(node.id);
    }
    return into;
  }
  for (const child of children) {
    collectSelectableLeaves(child, into);
  }
  return into;
}

/** The ids one row stands for; empty when the row selects nothing. */
export function treeSelectionIds(
  node: TreeSelectionNode,
  behavior: TreeSelectionBehavior,
): string[] {
  if (behavior === "cascade") {
    return collectSelectableLeaves(node, []);
  }
  return isSelectable(node) ? [node.id] : [];
}

/** Tri-state for one row: `checked`, `mixed`, or neither. */
export function getTreeSelectionState(
  node: TreeSelectionNode,
  checked: ReadonlySet<string>,
  behavior: TreeSelectionBehavior,
): TreeSelectionState {
  const ids = treeSelectionIds(node, behavior);
  let count = 0;
  for (const id of ids) {
    if (checked.has(id)) {
      count += 1;
    }
  }
  return {
    checked: ids.length > 0 && count === ids.length,
    mixed: count > 0 && count < ids.length,
  };
}

/**
 * Toggle one row, returning the next checked ids — or `null` when the row
 * selects nothing and the caller should leave state untouched.
 *
 * A `mixed` row completes rather than clears: "some" is displayed as a
 * half-filled box, and the only unambiguous next state for a click on it is
 * "all". Clearing from `mixed` would silently discard the checks the user
 * already made two levels down.
 */
export function toggleTreeSelection(
  node: TreeSelectionNode,
  checked: ReadonlySet<string>,
  behavior: TreeSelectionBehavior,
): string[] | null {
  const ids = treeSelectionIds(node, behavior);
  if (ids.length === 0) {
    return null;
  }
  const next = new Set(checked);
  const allChecked = ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allChecked) {
      next.delete(id);
    } else {
      next.add(id);
    }
  }
  return Array.from(next);
}
