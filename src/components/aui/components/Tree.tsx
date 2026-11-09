import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";

import { useCancelableTimeout } from "../utils/pointer-gesture";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  getTreeSelectionState,
  toggleTreeSelection,
  type TreeSelectionBehavior,
} from "../utils/tree-selection";
import { styles } from "../recipes/tree-styles";
import { themeProps } from "../theming/theme-props";
import type { ContextMenuGroupConfig } from "./ContextMenu";
import { createTreeDragHandlers } from "./Tree.dnd";
import { createTreeKeyDownHandler } from "./Tree.keyboard";
import {
  flattenVisibleTree,
  type TreeDensity,
  type TreeDropTarget,
  type TreeFlatNode,
  type TreeNode,
} from "./Tree.model";
import { TreeRow } from "./Tree.row";
import { VisuallyHidden } from "./VisuallyHidden";

/**
 * Tree — file-explorer-grade tree view, built to
 * the WAI-ARIA TreeView pattern.
 *
 * DOM is a *flat* list of `role="treeitem"` rows (the file-explorer
 * convention): hierarchy is conveyed with `aria-level` /
 * `aria-posinset` / `aria-setsize` instead of nested `role="group"` lists.
 * A flat list keeps focus, virtualization, and indent guides simple while
 * remaining a conforming tree per the APG.
 *
 * Focus: single tabbable row (roving tabindex) with full keyboard support —
 * Up/Down move, Right expands / enters children, Left collapses / exits to the
 * parent, Home/End jump, Enter/Space select (and toggle folders), `*` expands
 * siblings, printable characters typeahead-jump, F2 (or double-click) begins
 * an inline rename when `onRename` is provided (Enter commits, Escape cancels,
 * focus returns to the row — same contract as `PropertyList.TextRow`).
 *
 * This is the sanctioned exception to "never hand-roll roving tabindex":
 * Base UI ships no Tree primitive (verified against the installed package),
 * so the roving focus here follows the APG treeview spec directly.
 *
 * Expansion is uncontrolled (`defaultExpandedIds`) or controlled
 * (`expandedIds` + `onExpandedIdsChange`); selection likewise
 * (`defaultSelectedId` / `selectedId` + `onSelectedIdChange`).
 *
 * Two independent selections, because a tree needs both. `selectedId` is the
 * one *current* row — what the user is looking at, and what a detail pane
 * follows. `checkedIds` is the set the next action applies to, drawn as a
 * tri-state box per row: passing any of `checkedIds` / `defaultCheckedIds` /
 * `onCheckedIdsChange` turns the tree into a checkbox tree. The box is its own
 * hit target (clicking it never moves `selectedId`, and clicking the label
 * never checks), `Space` toggles the focused row's box, and the row reports
 * `aria-checked="true" | "false" | "mixed"`. `selectionBehavior` reuses
 * `TreeSelect`'s vocabulary and the same roll-up implementation
 * (`utils/tree-selection`).
 *
 * Anatomy: this root owns state and assembly; `Tree.model` owns the data
 * rules, `Tree.keyboard` the key map, `Tree.dnd` the pointer drag, and
 * `Tree.row` the row rendering.
 */

export type { TreeDensity, TreeNode } from "./Tree.model";
export type { TreeSelectionBehavior } from "../utils/tree-selection";

export type TreeProps = Omit<
  React.ComponentProps<"ul">,
  // `contextMenu` shadows the deprecated HTML attribute of the same name.
  "contextMenu" | "onSelect"
> & {
  /**
   * Per-row right-click menu. Return the menu groups for a node id, or
   * null/empty to leave that row without a context menu. Items follow the
   * `ContextMenu` array API (`icon`, `label`, `onSelect`, `tone`, …).
   */
  contextMenu?: (id: string) => ContextMenuGroupConfig[] | null | undefined;
  /**
   * Controlled checked node ids. Pair with `onCheckedIdsChange`. Presence of
   * this, `defaultCheckedIds`, or `onCheckedIdsChange` is what draws the
   * checkboxes.
   */
  checkedIds?: string[];
  /** Initially checked node ids (uncontrolled checkbox mode). */
  defaultCheckedIds?: string[];
  /** Initially expanded node ids (uncontrolled mode). */
  defaultExpandedIds?: string[];
  /** Initially selected node id (uncontrolled mode). */
  defaultSelectedId?: string;
  /** Controlled expanded ids. Pair with `onExpandedIdsChange`. */
  expandedIds?: string[];
  items: TreeNode[];
  /** Fired with the next checked id set (both modes). */
  onCheckedIdsChange?: (ids: string[]) => void;
  /** Fired with the next expanded id set (both modes). */
  onExpandedIdsChange?: (ids: string[]) => void;
  /**
   * Enables inline rename: F2 or double-click swaps the label for an input;
   * Enter commits (fires with the draft), Escape cancels, focus returns to
   * the row. Only fires when the draft is non-empty and changed.
   */
  onRename?: (id: string, next: string) => void;
  /** Move a node to a parent and zero-based position. Enables drag and Alt+Arrow moves. */
  onMove?: (id: string, parentId: string | null, index: number) => void;
  /** Fired with the newly selected id (both modes). */
  onSelectedIdChange?: (id: string) => void;
  /** Controlled selected id. Pair with `onSelectedIdChange`. */
  selectedId?: string;
  /**
   * What one checkbox stands for. `cascade` checks every checkable leaf under
   * the row and reads `mixed` in between; `independent` checks exactly the
   * row. Same two words, and the same roll-up, as `TreeSelect`.
   * @default "cascade"
   */
  selectionBehavior?: TreeSelectionBehavior;
  /** Row density. @default "regular" */
  density?: TreeDensity;
} & XstyleProp;

export function Tree({
  checkedIds: controlledCheckedIds,
  className,
  contextMenu,
  defaultCheckedIds,
  defaultExpandedIds,
  defaultSelectedId,
  density = "regular",
  expandedIds: controlledExpandedIds,
  items,
  onCheckedIdsChange,
  onExpandedIdsChange,
  onMove,
  onRename,
  onSelectedIdChange,
  selectedId: controlledSelectedId,
  selectionBehavior = "cascade",
  xstyle,
  ...props
}: TreeProps) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds ?? []),
  );
  const expanded = useMemo(
    () =>
      controlledExpandedIds !== undefined
        ? new Set(controlledExpandedIds)
        : internalExpanded,
    [controlledExpandedIds, internalExpanded],
  );

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    defaultSelectedId ?? controlledSelectedId ?? null,
  );
  const selectedId =
    controlledSelectedId !== undefined
      ? controlledSelectedId
      : internalSelectedId;

  // Checkboxes appear the moment a consumer expresses a checked set in any of
  // the three ways, the same rule that turns on rename (`onRename`) and drag
  // (`onMove`) — a tree that reports no checked ids has nothing to draw.
  const checkable =
    controlledCheckedIds !== undefined ||
    defaultCheckedIds !== undefined ||
    onCheckedIdsChange !== undefined;
  const [internalCheckedIds, setInternalCheckedIds] = useState<string[]>(
    () => defaultCheckedIds ?? [],
  );
  const checkedIds = controlledCheckedIds ?? internalCheckedIds;
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  // Set when a rename exits via keyboard (Enter/Escape) so focus returns to
  // the row instead of dropping to the document (TextRow's contract).
  const restoreFocusRef = useRef(false);
  const lastEditedIdRef = useRef<string | null>(null);
  const typeaheadRef = useRef({ buffer: "" });
  // Buffer-reset timer, cancelled on unmount; see `useCancelableTimeout`.
  const scheduleBufferReset = useCancelableTimeout();

  const visible = useMemo(
    () => flattenVisibleTree(items, expanded),
    [expanded, items],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const rovingId = useMemo(() => {
    const ids = new Set(visible.map((item) => item.id));
    for (const candidate of [activeId, selectedId]) {
      if (candidate && ids.has(candidate)) {
        return candidate;
      }
    }
    return visible[0]?.id ?? null;
  }, [activeId, selectedId, visible]);

  useEffect(() => {
    if (editingId === null && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      const id = lastEditedIdRef.current;
      if (id) {
        itemRefs.current.get(id)?.focus();
      }
    }
  }, [editingId]);

  const setExpandedSet = (next: Set<string>) => {
    if (controlledExpandedIds === undefined) {
      setInternalExpanded(next);
    }
    onExpandedIdsChange?.(Array.from(next));
  };

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedSet(next);
  };

  /** `*` — expand every expandable sibling of the focused node (APG optional). */
  const expandSiblings = (item: TreeFlatNode) => {
    const next = new Set(expanded);
    for (const sibling of visible) {
      if (
        sibling.parentId === item.parentId &&
        sibling.acceptsChildren &&
        !sibling.disabled
      ) {
        next.add(sibling.id);
      }
    }
    setExpandedSet(next);
  };

  const select = (id: string) => {
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(id);
    }
    onSelectedIdChange?.(id);
  };

  const toggleCheck = (item: TreeFlatNode) => {
    if (item.disabled || !item.checkable) {
      return;
    }
    const next = toggleTreeSelection(item.node, checkedSet, selectionBehavior);
    if (!next) {
      return;
    }
    if (controlledCheckedIds === undefined) {
      setInternalCheckedIds(next);
    }
    onCheckedIdsChange?.(next);
  };

  const focusNode = (id: string) => {
    setActiveId(id);
    itemRefs.current.get(id)?.focus();
  };

  const startRename = (item: TreeFlatNode) => {
    if (!onRename || item.disabled) {
      return;
    }
    lastEditedIdRef.current = item.id;
    setEditingId(item.id);
  };

  const activate = (item: TreeFlatNode) => {
    setActiveId(item.id);
    if (item.disabled) {
      return;
    }
    if (item.acceptsChildren) {
      toggle(item.id);
    }
    select(item.id);
  };

  const handleKeyDown = createTreeKeyDownHandler({
    announceMove: setMoveAnnouncement,
    editingId,
    // Present only in checkable mode: `Space` belongs to the box when there is
    // a box, and stays an activate alias when there is not.
    toggleCheck: checkable ? toggleCheck : undefined,
    expanded,
    expandSiblings,
    focusNode,
    items,
    onMove,
    rovingId,
    scheduleBufferReset,
    select,
    startRename,
    toggle,
    typeaheadState: typeaheadRef.current,
    visible,
  });

  const dragPropsFor = createTreeDragHandlers({
    announceMove: setMoveAnnouncement,
    draggedId,
    dropTarget,
    items,
    onMove,
    setDraggedId,
    setDropTarget,
  });

  const registerRef = (id: string, element: HTMLLIElement | null) => {
    if (element) {
      itemRefs.current.set(id, element);
    } else {
      itemRefs.current.delete(id);
    }
  };

  // `data-density` was already on this `<ul>` for consumers to query; `themeProps`
  // is now the single writer of it, so the axis a brand selects on and the
  // attribute the tree renders cannot drift apart.
  const theme = themeProps("tree", { density });

  return (
    <ul
      {...props}
      {...theme}
      className={cx(sx(styles.root, xstyle), theme.className, className)}
      role="tree"
    >
      {visible.map((item) => (
        <TreeRow
          checkState={
            checkable && item.checkable
              ? getTreeSelectionState(item.node, checkedSet, selectionBehavior)
              : null
          }
          checkable={checkable}
          density={density}
          dragProps={dragPropsFor(item)}
          dropTarget={dropTarget}
          isEditing={item.id === editingId}
          isExpanded={item.acceptsChildren && expanded.has(item.id)}
          isRoving={item.id === rovingId}
          isSelected={item.id === selectedId}
          item={item}
          key={item.id}
          menuGroups={contextMenu?.(item.id)}
          onActivate={activate}
          onCancelRename={(viaKeyboard) => {
            restoreFocusRef.current = viaKeyboard;
            setEditingId(null);
          }}
          onCommitRename={(next, viaKeyboard) => {
            restoreFocusRef.current = viaKeyboard;
            setEditingId(null);
            const current =
              typeof item.node.label === "string" ? item.node.label : "";
            if (next.trim() !== "" && next !== current) {
              onRename?.(item.id, next);
            }
          }}
          onFocusRow={setActiveId}
          onKeyDown={handleKeyDown}
          onStartRename={startRename}
          onToggleCheck={toggleCheck}
          registerRef={registerRef}
        />
      ))}
      <li role="none">
        <VisuallyHidden aria-live="polite" role="status">
          {moveAnnouncement}
        </VisuallyHidden>
      </li>
    </ul>
  );
}
