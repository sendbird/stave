import type * as React from "react";

import { i18n } from "@/i18n";

import {
  locateTreeNode,
  treeLabelText,
  type TreeFlatNode,
  type TreeNode,
} from "./Tree.model";

/**
 * Tree keyboard layer — the APG treeview key map plus the Alt+Arrow move
 * shortcuts, kept out of the root so the row/render layer and this contract can
 * grow independently.
 */

export type TreeTypeaheadState = { buffer: string };

export type TreeKeyboardConfig = {
  announceMove: (message: string) => void;
  /** Rename is in progress: keys belong to the input, not the tree. */
  editingId: string | null;
  expanded: Set<string>;
  expandSiblings: (item: TreeFlatNode) => void;
  focusNode: (id: string) => void;
  items: TreeNode[];
  onMove?: (id: string, parentId: string | null, index: number) => void;
  rovingId: string | null;
  scheduleBufferReset: (callback: () => void, delay: number) => void;
  select: (id: string) => void;
  startRename: (item: TreeFlatNode) => void;
  toggle: (id: string) => void;
  /**
   * Set only in checkable mode. Its presence is what re-points `Space` at the
   * row's checkbox: with a box on screen, `Space` toggling expansion instead
   * is the one thing no checkbox tree does.
   */
  toggleCheck?: (item: TreeFlatNode) => void;
  typeaheadState: TreeTypeaheadState;
  visible: TreeFlatNode[];
};

/**
 * Alt+Arrow moves, returning `true` when the event was consumed. Up/Down
 * reorder within the current siblings, Right nests into the previous sibling,
 * Left lifts the node out to its grandparent.
 */
function handleMoveShortcut(
  event: React.KeyboardEvent<HTMLLIElement>,
  item: TreeFlatNode,
  config: TreeKeyboardConfig,
): boolean {
  const { announceMove, items, onMove } = config;
  if (!onMove || !event.altKey) {
    return false;
  }
  const located = locateTreeNode(items, item.id);
  if (!located) return true;
  const siblingIndex = located.siblings.findIndex(
    (sibling) => sibling.id === item.id,
  );
  if (event.key === "ArrowUp" && siblingIndex > 0) {
    event.preventDefault();
    onMove(item.id, located.parentId, siblingIndex - 1);
    announceMove(i18n.t("ui:tree.movedUp", { name: treeLabelText(item.node) }));
    return true;
  }
  if (event.key === "ArrowDown" && siblingIndex < located.siblings.length - 1) {
    event.preventDefault();
    onMove(item.id, located.parentId, siblingIndex + 1);
    announceMove(i18n.t("ui:tree.movedDown", { name: treeLabelText(item.node) }));
    return true;
  }
  if (event.key === "ArrowRight" && siblingIndex > 0) {
    const previous = located.siblings[siblingIndex - 1];
    if (previous?.acceptsChildren) {
      event.preventDefault();
      onMove(item.id, previous.id, previous.children?.length ?? 0);
      announceMove(
        i18n.t("ui:tree.movedInto", { name: treeLabelText(item.node), parent: treeLabelText(previous) }),
      );
      return true;
    }
  }
  if (event.key === "ArrowLeft" && located.parentId) {
    const parent = locateTreeNode(items, located.parentId);
    if (parent) {
      event.preventDefault();
      const parentIndex = parent.siblings.findIndex(
        (sibling) => sibling.id === located.parentId,
      );
      onMove(item.id, parent.parentId, parentIndex + 1);
      announceMove(i18n.t("ui:tree.movedOut", { name: treeLabelText(item.node) }));
      return true;
    }
  }
  return false;
}

function runTypeahead(
  char: string,
  fromIndex: number,
  config: TreeKeyboardConfig,
) {
  const { focusNode, scheduleBufferReset, typeaheadState, visible } = config;
  typeaheadState.buffer += char.toLowerCase();
  scheduleBufferReset(() => {
    typeaheadState.buffer = "";
  }, 500);
  // A fresh single character starts *after* the focused node (so repeated
  // presses cycle matches); a growing buffer re-tests the focused node.
  const start = typeaheadState.buffer.length === 1 ? fromIndex + 1 : fromIndex;
  for (let offset = 0; offset < visible.length; offset += 1) {
    const candidate = visible[(start + offset) % visible.length];
    if (
      candidate &&
      treeLabelText(candidate.node)
        .toLowerCase()
        .startsWith(typeaheadState.buffer)
    ) {
      focusNode(candidate.id);
      return;
    }
  }
}

export function createTreeKeyDownHandler(config: TreeKeyboardConfig) {
  return (event: React.KeyboardEvent<HTMLLIElement>) => {
    const {
      editingId,
      expanded,
      expandSiblings,
      focusNode,
      rovingId,
      select,
      startRename,
      toggle,
      toggleCheck,
      visible,
    } = config;
    // Keys bubbling out of the rename input belong to the input.
    if (editingId !== null) {
      return;
    }
    const index = visible.findIndex((item) => item.id === rovingId);
    const item = visible[index];
    if (!item) {
      return;
    }
    if (handleMoveShortcut(event, item, config)) {
      return;
    }
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = visible[index + 1];
        if (next) {
          focusNode(next.id);
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prev = visible[index - 1];
        if (prev) {
          focusNode(prev.id);
        }
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (!item.acceptsChildren) {
          break;
        }
        if (!expanded.has(item.id)) {
          if (!item.disabled) {
            toggle(item.id);
          }
        } else {
          const next = visible[index + 1];
          if (next && next.parentId === item.id) {
            focusNode(next.id);
          }
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (item.acceptsChildren && expanded.has(item.id) && !item.disabled) {
          toggle(item.id);
        } else if (item.parentId) {
          focusNode(item.parentId);
        }
        break;
      }
      case "Home": {
        event.preventDefault();
        if (visible[0]) {
          focusNode(visible[0].id);
        }
        break;
      }
      case "End": {
        event.preventDefault();
        const last = visible[visible.length - 1];
        if (last) {
          focusNode(last.id);
        }
        break;
      }
      case " ": {
        event.preventDefault();
        if (item.disabled) {
          break;
        }
        if (toggleCheck) {
          toggleCheck(item);
          break;
        }
        if (item.acceptsChildren) {
          toggle(item.id);
        }
        select(item.id);
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (item.disabled) {
          break;
        }
        if (item.acceptsChildren) {
          toggle(item.id);
        }
        select(item.id);
        break;
      }
      case "F2": {
        event.preventDefault();
        startRename(item);
        break;
      }
      case "*": {
        event.preventDefault();
        expandSiblings(item);
        break;
      }
      default: {
        if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          runTypeahead(event.key, index, config);
        }
        break;
      }
    }
  };
}
