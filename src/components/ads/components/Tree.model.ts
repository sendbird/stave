import type * as React from "react";

/**
 * Tree data model — the node shape plus the pure helpers the root, the row,
 * and the keyboard layer all read. Kept free of React state so the flattening
 * and lookup rules stay testable and single-sourced.
 */

export type TreeNode = {
  /** Whether other nodes may be moved into this node. */
  acceptsChildren?: boolean;
  /**
   * Trailing row actions (icon buttons, a menu trigger) revealed while the
   * row is hovered or holds focus. Rendered after `meta`/`badge`; pointer and
   * keyboard events inside it do not activate, rename, or drag the row, so a
   * `+` on a folder adds to the folder without toggling it.
   */
  actions?: React.ReactNode;
  /** Trailing badge slot (e.g. a git-status dot or count pill). */
  badge?: React.ReactNode;
  /**
   * `false` leaves this row without a checkbox in a checkable tree — a group
   * header that organizes rows without being one of the things checked. Under
   * `selectionBehavior="cascade"` it still rolls its descendants up.
   */
  checkable?: boolean;
  children?: TreeNode[];
  /** Focusable but not selectable/expandable/renamable. */
  disabled?: boolean;
  /**
   * Leading icon. Defaults to folder/folder-open for nodes with children and
   * a file icon otherwise.
   */
  icon?: React.ReactNode;
  id: string;
  label: React.ReactNode;
  /** Trailing muted metadata (e.g. "M" for modified, a size, a date). */
  meta?: React.ReactNode;
};

export type TreeDensity = "compact" | "regular";

/** One visible row in depth-first order, carrying its APG position facts. */
export type TreeFlatNode = {
  acceptsChildren: boolean;
  /** `false` only when the node opted out; unrelated to `disabled`. */
  checkable: boolean;
  disabled: boolean;
  hasChildren: boolean;
  id: string;
  level: number;
  node: TreeNode;
  parentId: string | null;
  posinset: number;
  setsize: number;
};

export type TreeLocatedNode = {
  node: TreeNode;
  parentId: string | null;
  siblings: TreeNode[];
};

export type TreeDropTarget = {
  id: string;
  mode: "after" | "before" | "inside";
};

export function locateTreeNode(
  nodes: TreeNode[],
  id: string,
  parentId: string | null = null,
): TreeLocatedNode | null {
  for (const node of nodes) {
    if (node.id === id) return { node, parentId, siblings: nodes };
    const nested = locateTreeNode(node.children ?? [], id, node.id);
    if (nested) return nested;
  }
  return null;
}

export function treeContainsNode(node: TreeNode, id: string): boolean {
  return (node.children ?? []).some(
    (child) => child.id === id || treeContainsNode(child, id),
  );
}

/** Typeahead matches against string labels; non-string labels fall back to id. */
export function treeLabelText(node: TreeNode): string {
  return typeof node.label === "string" ? node.label : node.id;
}

/** Visible, depth-first ordering used for roving focus + arrow navigation. */
export function flattenVisibleTree(
  items: TreeNode[],
  expanded: Set<string>,
): TreeFlatNode[] {
  const flat: TreeFlatNode[] = [];
  const walk = (nodes: TreeNode[], level: number, parentId: string | null) => {
    nodes.forEach((node, index) => {
      const hasChildren = Boolean(node.children && node.children.length > 0);
      flat.push({
        acceptsChildren: node.acceptsChildren ?? hasChildren,
        checkable: node.checkable !== false,
        disabled: Boolean(node.disabled),
        hasChildren,
        id: node.id,
        level,
        node,
        parentId,
        posinset: index + 1,
        setsize: nodes.length,
      });
      if (hasChildren && expanded.has(node.id)) {
        walk(node.children as TreeNode[], level + 1, node.id);
      }
    });
  };
  walk(items, 1, null);
  return flat;
}

/**
 * Resolve the drop destination for a pointer drop: `inside` re-parents onto the
 * hovered node, `before`/`after` reorders within the hovered node's siblings.
 * `toIndex` is the destination index *after* the dragged node is removed.
 */
export function resolveTreeDrop(
  items: TreeNode[],
  draggedId: string,
  dropTarget: TreeDropTarget,
): { index: number; parentId: string | null } | null {
  const target = locateTreeNode(items, dropTarget.id);
  if (!target) return null;
  const parentId =
    dropTarget.mode === "inside" ? target.node.id : target.parentId;
  const siblings =
    dropTarget.mode === "inside"
      ? (target.node.children ?? [])
      : target.siblings;
  const withoutDragged = siblings.filter((sibling) => sibling.id !== draggedId);
  const targetIndex = withoutDragged.findIndex(
    (sibling) => sibling.id === target.node.id,
  );
  const index =
    dropTarget.mode === "inside"
      ? withoutDragged.length
      : targetIndex + (dropTarget.mode === "after" ? 1 : 0);
  return { index, parentId };
}
