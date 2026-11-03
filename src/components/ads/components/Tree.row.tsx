import {
  Check,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Minus,
} from "lucide-react";
import { useState } from "react";
import type * as React from "react";

import { treeRowHeights } from "../recipes/control-metrics";
import { disclosureChevron } from "../recipes/disclosure-chevron";
import { focusRing } from "../recipes/focus-ring";
import {
  selectionMark,
  selectionMarkGlyphSize,
} from "../recipes/selection-mark";
import { transition } from "../recipes/transition";
import { styles } from "../recipes/tree-styles";
import { cx, sx } from "../utils/stylex";
import {
  ContextMenu,
  ContextMenuGroups,
  type ContextMenuGroupConfig,
} from "./ContextMenu";
import { RenameInput } from "./Tree.parts";
import type { TreeRowDragProps } from "./Tree.dnd";
import type { TreeSelectionState } from "../utils/tree-selection";
import type { TreeDensity, TreeDropTarget, TreeFlatNode } from "./Tree.model";

/**
 * One `role="treeitem"` row: indent guides, disclosure, the optional checkbox,
 * icon, label (or the inline rename input), and the trailing meta/badge slot.
 * The row is the right-click trigger when the tree supplies context-menu
 * groups, so the DOM stays a flat `ul > li` treeview.
 *
 * The checkbox is chrome, not an input. The row already owns the tab stop and
 * reports `aria-checked`, so a real `<input>` here would add a second stop
 * inside a roving-tabindex list and a duplicate announcement. It is, however,
 * its own *pointer* target: clicking the box checks without moving the current
 * row, and clicking the label selects without checking — the split checkbox
 * trees commonly draw.
 */

export type TreeRowProps = {
  /** The tree is in checkbox mode; leaf rows need the disclosure gutter. */
  checkable: boolean;
  /** Tri-state for this row, or null when the row has no box. */
  checkState: TreeSelectionState | null;
  density: TreeDensity;
  dragProps: TreeRowDragProps;
  dropTarget: TreeDropTarget | null;
  isEditing: boolean;
  isExpanded: boolean;
  isRoving: boolean;
  isSelected: boolean;
  item: TreeFlatNode;
  menuGroups?: ContextMenuGroupConfig[] | null;
  onActivate: (item: TreeFlatNode) => void;
  onCancelRename: (viaKeyboard: boolean) => void;
  onCommitRename: (next: string, viaKeyboard: boolean) => void;
  onFocusRow: (id: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLLIElement>) => void;
  onStartRename: (item: TreeFlatNode) => void;
  onToggleCheck: (item: TreeFlatNode) => void;
  registerRef: (id: string, element: HTMLLIElement | null) => void;
};

export function TreeRow({
  checkable,
  checkState,
  density,
  dragProps,
  dropTarget,
  isEditing,
  isExpanded,
  isRoving,
  isSelected,
  item,
  menuGroups,
  onActivate,
  onCancelRename,
  onCommitRename,
  onFocusRow,
  onKeyDown,
  onStartRename,
  onToggleCheck,
  registerRef,
}: TreeRowProps) {
  const { node } = item;
  // Hover is tracked in state rather than CSS because the actions slot is a
  // child of the row: StyleX has no parent-hover selector, and the row's own
  // `:hover` cannot paint a descendant. Focus inside the slot is CSS
  // (`:focus-within`) so keyboard reveal needs no pointer.
  const [hovered, setHovered] = useState(false);
  const icon =
    node.icon ??
    (item.acceptsChildren ? (
      isExpanded ? (
        <FolderOpen />
      ) : (
        <Folder />
      )
    ) : (
      <File />
    ));

  const rowProps: React.ComponentProps<"li"> = {
    "aria-checked": checkState
      ? checkState.mixed
        ? "mixed"
        : checkState.checked
      : undefined,
    "aria-disabled": item.disabled || undefined,
    "aria-expanded": item.acceptsChildren ? isExpanded : undefined,
    "aria-level": item.level,
    "aria-posinset": item.posinset,
    // Single-select APG: aria-selected only on the selected node.
    "aria-selected": isSelected || undefined,
    "aria-setsize": item.setsize,
    className: cx(
      sx(
        styles.row,
        transition.colors,
        treeRowHeights[density],
        density === "compact" && styles.rowCompact,
        focusRing.ring,
        focusRing.ringInset,
        isSelected && styles.rowSelected,
        dropTarget?.id === item.id &&
          dropTarget.mode === "inside" &&
          styles.rowDropInside,
        item.disabled && styles.rowDisabled,
      ),
    ),
    ...dragProps,
    onClick: () => {
      if (isEditing) {
        return;
      }
      onActivate(item);
    },
    // Move the roving focus to the row a context menu opens on, so the
    // menu visibly targets it and keyboard focus lands back there.
    onContextMenu: () => onFocusRow(item.id),
    onDoubleClick: () => {
      if (!isEditing) {
        onStartRename(item);
      }
    },
    onFocus: () => onFocusRow(item.id),
    onKeyDown,
    ...(node.actions !== undefined
      ? {
          onPointerEnter: () => setHovered(true),
          onPointerLeave: () => setHovered(false),
        }
      : {}),
    ref: (element: HTMLLIElement | null) => registerRef(item.id, element),
    role: "treeitem",
    tabIndex: isRoving ? 0 : -1,
  };

  const rowChildren = (
    <>
      {/* Indent guides: one vertical alpha-hairline rail per ancestor
          depth; rails on adjacent rows stack into continuous lines. */}
      {Array.from({ length: item.level - 1 }, (_, depth) => (
        <span
          aria-hidden
          className={sx(
            styles.guide,
            density === "compact" && styles.guideCompact,
          )}
          key={depth}
        />
      ))}
      {dropTarget?.id === item.id && dropTarget.mode !== "inside" ? (
        <span
          aria-hidden
          className={sx(
            styles.dropLine,
            dropTarget.mode === "before"
              ? styles.dropLineBefore
              : styles.dropLineAfter,
          )}
        />
      ) : null}
      {item.acceptsChildren ? (
        <span
          aria-hidden
          className={cx(
            sx(
              styles.disclosure,
              disclosureChevron.base,
              density === "compact" && styles.disclosureCompact,
              isExpanded && disclosureChevron.openQuarter,
            ),
          )}
          data-ads-control-icon-slot="true"
        >
          <ChevronRight />
        </span>
      ) : checkable ? (
        // Only in checkbox mode. Without it a leaf's box sits where a
        // folder's chevron does, and the boxes stop forming a column — which
        // is the one thing a reader scans a checkbox tree for. A plain tree
        // keeps its tighter leaf rows.
        <span
          aria-hidden
          className={sx(
            styles.disclosure,
            density === "compact" && styles.disclosureCompact,
          )}
        />
      ) : null}
      {checkState ? (
        <span
          aria-hidden
          className={sx(
            selectionMark.box,
            (checkState.checked || checkState.mixed) &&
              selectionMark.boxChecked,
          )}
          data-ads-check-slot="true"
          onClick={(event) => {
            // The box is not the row: checking must not also select or
            // expand, so the activate handler on the `li` never sees this.
            event.stopPropagation();
            if (!isEditing) {
              onToggleCheck(item);
            }
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {checkState.mixed ? (
            <Minus size={selectionMarkGlyphSize} />
          ) : checkState.checked ? (
            <Check size={selectionMarkGlyphSize} />
          ) : null}
        </span>
      ) : checkable ? (
        // A row that opted out of checking (`checkable: false`) still holds
        // the column open, so its children's boxes stay in line.
        <span aria-hidden className={sx(selectionMark.gutter)} />
      ) : null}
      <span
        aria-hidden
        className={sx(styles.icon)}
        data-ads-control-icon-slot="true"
      >
        {icon}
      </span>
      {isEditing ? (
        <RenameInput
          initialValue={typeof node.label === "string" ? node.label : ""}
          onCancel={onCancelRename}
          onCommit={onCommitRename}
        />
      ) : (
        <span className={sx(styles.label)}>{node.label}</span>
      )}
      {node.meta !== undefined || node.badge !== undefined ? (
        <span className={sx(styles.trailing)}>
          {node.meta !== undefined ? (
            <span className={sx(styles.meta)}>{node.meta}</span>
          ) : null}
          {node.badge}
        </span>
      ) : null}
      {node.actions !== undefined ? (
        // The slot is inside the `li` so the DOM stays a flat treeview, and
        // everything that would reach the row — click (activate), double-click
        // (rename), keys (roving navigation), drag — stops here. A menu opened
        // from an action lives in a portal, so its own keys never bubble back.
        <span
          className={sx(
            styles.actions,
            node.meta === undefined &&
              node.badge === undefined &&
              styles.actionsTrailing,
            hovered && styles.actionsVisible,
          )}
          data-ads-tree-actions="true"
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {node.actions}
        </span>
      ) : null}
    </>
  );

  if (menuGroups && menuGroups.length > 0) {
    // The row itself is the right-click trigger (Base UI `render` merges the
    // trigger behavior onto the `li`), so the DOM stays a flat `ul > li`
    // treeview and empty tree space opens nothing.
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger render={<li {...rowProps} />}>
          {rowChildren}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup>
              <ContextMenuGroups groups={menuGroups} />
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  }

  return <li {...rowProps}>{rowChildren}</li>;
}
