import { Check, ChevronRight } from "lucide-react";
import type * as React from "react";

import { menu } from "../recipes/menu";
import { sx } from "../utils/stylex";
import { Menu, type MenuItemTone } from "./Menu";
import { Loader } from "./Loader";

/*
 * The declarative row of `DropdownMenu`, and the row anatomy `ContextMenu`'s
 * declarative items share. Lives in a sibling file so both array APIs draw one
 * row instead of two that drift (2026-11-14: `ContextMenu` had `submenu` and
 * lacked `selected`, `pending` and `href`; `DropdownMenu` had those and lacked
 * `submenu`).
 */

export type DropdownMenuItem = {
  /** A disabled row is an action row, even with `href`: a destination you cannot go to is not a link. */
  disabled?: boolean;
  /**
   * The destination opens in a new tab (`target="_blank"`, `rel="noopener
   * noreferrer"`) and the label carries the trailing external mark. Only
   * meaningful with `href`.
   */
  external?: boolean;
  /**
   * Makes the row a link — a real `<a>` (`Menu.LinkItem`), so hover shows the
   * URL, ⌘/middle click opens a new tab and right-click offers "Copy link
   * address". `onSelect` still fires on the way. For a router link, compose
   * `DropdownMenu.LinkItem render={<Link to="…" />}` instead.
   */
  href?: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  onSelect?: () => void;
  /** Prevent repeat selection while the async action is in flight. */
  pending?: boolean;
  /** Marks the item as the currently applied choice. */
  selected?: boolean;
  shortcut?: string;
  /**
   * Nested actions, one or more levels deep. The row opens a real Base UI
   * submenu (hover or ArrowRight opens it, ArrowLeft or Esc closes it) and
   * shows a trailing chevron. A row that opens a submenu performs nothing
   * itself, so its `href`, `onSelect`, `selected` and `tone` are not used.
   */
  submenu?: DropdownMenuItem[];
  tone?: MenuItemTone;
};

/** The fields of a declarative item that decide what a row draws. */
export type MenuRowContentItem = Pick<
  DropdownMenuItem,
  "external" | "href" | "icon" | "label" | "pending" | "selected" | "shortcut"
> & { submenu?: readonly unknown[] };

/** Whether a set of sibling rows needs the leading icon cell. */
export function menuRowsHaveIconColumn(items: readonly MenuRowContentItem[]) {
  return items.some((item) => Boolean(item.icon) || Boolean(item.pending));
}

/**
 * What sits inside one declarative row: leading icon (or the pending loader),
 * the label with its external mark, the shortcut, and at the trailing edge the
 * applied-choice check or the submenu chevron.
 *
 * `iconSlot` marks the icon cell as a control icon slot, which stretches the
 * glyph to the cell. `DropdownMenu` has always set it and `ContextMenu` never
 * has, so each keeps the icon size it shipped with.
 */
export function MenuRowContent({
  hasIconColumn,
  iconSlot = false,
  item,
}: {
  hasIconColumn: boolean;
  iconSlot?: boolean;
  item: MenuRowContentItem;
}) {
  const opensSubmenu = Boolean(item.submenu?.length);
  return (
    <>
      {hasIconColumn ? (
        <span
          className={sx(menu.itemIcon)}
          data-aui-control-icon-slot={iconSlot ? "true" : undefined}
        >
          {item.pending ? <Loader aria-hidden size="xs" /> : item.icon}
        </span>
      ) : null}
      <span className={sx(menu.itemLabel)}>
        {item.label}
      </span>
      {item.shortcut ? <Menu.Shortcut>{item.shortcut}</Menu.Shortcut> : null}
      {/* Trailing check: the applied choice is marked without disturbing the
          leading icon column, so icon-less choice groups stay left-aligned. */}
      {item.selected && !opensSubmenu ? (
        <Check aria-hidden className={sx(menu.selectedIndicator)} size={14} />
      ) : null}
      {opensSubmenu ? (
        <ChevronRight aria-hidden className={sx(menu.chevron)} size={14} />
      ) : null}
    </>
  );
}

/**
 * One row: a submenu when it has nested items, a link when it has somewhere to
 * go, an action otherwise.
 */
export function DropdownMenuRow({
  hasIconColumn,
  item,
}: {
  hasIconColumn: boolean;
  item: DropdownMenuItem;
}) {
  const content = (
    <MenuRowContent hasIconColumn={hasIconColumn} iconSlot item={item} />
  );

  if (item.submenu?.length) {
    // The icon cell is decided per menu level, so an icon-less submenu stays
    // flush-left under a parent level that has icons.
    const submenuHasIcons = menuRowsHaveIconColumn(item.submenu);
    return (
      <Menu.SubmenuRoot>
        <Menu.SubmenuTrigger
          aria-busy={item.pending || undefined}
          disabled={item.disabled || item.pending}
        >
          {content}
        </Menu.SubmenuTrigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4}>
            <Menu.Popup>
              <Menu.Group>
                {item.submenu.map((child, index) => (
                  <DropdownMenuRow
                    hasIconColumn={submenuHasIcons}
                    item={child}
                    key={index}
                  />
                ))}
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.SubmenuRoot>
    );
  }

  // Host adaptation: the installed Menu has no `LinkItem`, so an `href` row
  // renders as an action row. The installed DataTable column menu, this
  // file's only consumer, never passes `href`.
  return (
    <Menu.Item
      aria-current={item.selected ? "true" : undefined}
      aria-busy={item.pending || undefined}
      disabled={item.disabled || item.pending}
      onClick={item.onSelect}
      selected={item.selected}
      tone={item.tone}
    >
      {content}
    </Menu.Item>
  );
}
