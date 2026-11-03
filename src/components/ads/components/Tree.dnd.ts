import type * as React from "react";

import { i18n } from "@/i18n";

import {
  locateTreeNode,
  resolveTreeDrop,
  treeContainsNode,
  type TreeDropTarget,
  type TreeFlatNode,
  type TreeNode,
} from "./Tree.model";

/**
 * Tree pointer-drag layer. Produces the per-row drag handlers; the drop
 * resolution itself lives in the model so the keyboard move path and this path
 * cannot drift apart.
 */

export type TreeDragConfig = {
  announceMove: (message: string) => void;
  draggedId: string | null;
  dropTarget: TreeDropTarget | null;
  items: TreeNode[];
  onMove?: (id: string, parentId: string | null, index: number) => void;
  setDraggedId: (id: string | null) => void;
  setDropTarget: (target: TreeDropTarget | null) => void;
};

export type TreeRowDragProps = {
  draggable: boolean;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLLIElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (event: React.DragEvent<HTMLLIElement>) => void;
};

export function createTreeDragHandlers(config: TreeDragConfig) {
  const {
    announceMove,
    draggedId,
    dropTarget,
    items,
    onMove,
    setDraggedId,
    setDropTarget,
  } = config;

  return (item: TreeFlatNode): TreeRowDragProps => ({
    draggable: Boolean(onMove) && !item.disabled,
    onDragEnd: () => {
      setDraggedId(null);
      setDropTarget(null);
    },
    onDragOver: (event) => {
      if (!onMove || !draggedId || draggedId === item.id) return;
      const dragged = locateTreeNode(items, draggedId)?.node;
      if (!dragged || treeContainsNode(dragged, item.id)) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / rect.height;
      const mode =
        item.acceptsChildren && ratio >= 0.25 && ratio <= 0.75
          ? "inside"
          : ratio < 0.5
            ? "before"
            : "after";
      setDropTarget({ id: item.id, mode });
    },
    onDragStart: (event) => {
      setDraggedId(item.id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    },
    onDrop: (event) => {
      if (!onMove || !draggedId || !dropTarget) return;
      event.preventDefault();
      const destination = resolveTreeDrop(items, draggedId, dropTarget);
      if (!destination) return;
      onMove(draggedId, destination.parentId, destination.index);
      announceMove(i18n.t("ui:tree.itemMoved"));
      setDraggedId(null);
      setDropTarget(null);
    },
  });
}
